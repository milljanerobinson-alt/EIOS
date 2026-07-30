// EWO-021R.2 — Canonical Investigation PDF & AI Context Package Architecture
//
// Regression tests for:
// 1. AI Context Package serialization
// 2. PDF generation
// 3. Single serialization pipeline (both from same schema)
// 4. No regression to EWO-021R.1

import { describe, it, expect } from 'vitest';
import { serializeAIContext, serializeInvestigation, type InvestigationSchemaData } from '../lib/investigationSchema';
import { generateAIContextExport, generateInvestigationExport } from '../lib/investigationExportService';
import { generateInvestigationPDF, downloadInvestigationPDF } from '../lib/investigationPDFRenderer';
import type { IntegrityAlert } from '../lib/engineeringIntegrityService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<IntegrityAlert> = {}): IntegrityAlert {
  return {
    id: 'test-alert-1',
    alert_type: 'parent_child_issue',
    normalised_reference: 'EWO-014.3.2B',
    severity: 'high',
    status: 'open',
    created_at: '2026-07-21T10:00:00Z',
    ...overrides,
  } as IntegrityAlert;
}

function makeSchemaData(overrides: Partial<InvestigationSchemaData> = {}): InvestigationSchemaData {
  return {
    alert: makeAlert(),
    evolvedTitle: 'Historical Root Acceptance Required',
    executiveSummary: 'Parent genuinely missing. Accept child as historical root.',
    rootCause: 'No canonical Work Order exists for expected parent EWO-014.3.',
    affectedComponents: ['Engineering Work Orders', 'Historical References'],
    evidence: [
      { label: 'EWO Record', type: 'ewo', reference: 'EWO-014.3.2B', description: 'Child Work Order exists' },
    ],
    timeline: [
      { timestamp: '2026-07-21T10:00:00Z', event: 'Alert detected' },
    ],
    recommendedActions: [],
    relatedEngineering: [
      { ref: 'EWO-014.3', title: 'Parent Work Order (missing)', type: 'ewo' },
    ],
    confidence: 0.85,
    confidenceExplanation: 'High confidence based on exhaustive source search.',
    evidencePackage: null,
    recommendation: null,
    decision: null,
    decisionTimeline: [],
    authoritativeLineage: undefined,
    governedActions: [],
    resolutionStatus: 'detected',
    resolutionTimestamp: null,
    resolutionActor: null,
    resolutionMessage: null,
    governedResponseState: null,
    isReadOnly: false,
    governedResponseRef: 'EIOS-INTEGRITY-001',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EWO-021R.2 — AI Context Package', () => {

  it('TEST 1 — AI Context Package contains core identity', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('AI CONTEXT PACKAGE');
    expect(aiContext).toContain('Historical Root Acceptance Required');
    expect(aiContext).toContain('EWO-014.3.2B');
    expect(aiContext).toContain('Alert Type: parent_child_issue');
    expect(aiContext).toContain('Severity: high');
  });

  it('TEST 2 — AI Context Package contains executive summary and root cause', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('EXECUTIVE SUMMARY');
    expect(aiContext).toContain('Parent genuinely missing.');
    expect(aiContext).toContain('ROOT CAUSE');
    expect(aiContext).toContain('No canonical Work Order exists');
  });

  it('TEST 3 — AI Context Package contains affected components', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('AFFECTED COMPONENTS');
    expect(aiContext).toContain('Engineering Work Orders');
    expect(aiContext).toContain('Historical References');
  });

  it('TEST 4 — AI Context Package contains confidence with label', () => {
    const data = makeSchemaData({ confidence: 0.92 });
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('CONFIDENCE');
    expect(aiContext).toContain('92%');
    expect(aiContext).toContain('High');
  });

  it('TEST 5 — AI Context Package contains evidence', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('EVIDENCE (1)');
    expect(aiContext).toContain('EWO Record');
    expect(aiContext).toContain('EWO-014.3.2B');
  });

  it('TEST 6 — AI Context Package contains related engineering', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('RELATED ENGINEERING (1)');
    expect(aiContext).toContain('EWO-014.3');
    expect(aiContext).toContain('Parent Work Order (missing)');
  });

  it('TEST 7 — AI Context Package contains timeline', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('TIMELINE');
    expect(aiContext).toContain('Alert detected');
  });

  it('TEST 8 — AI Context Package contains reference codes', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('REFERENCE CODES');
    expect(aiContext).toContain('EIOS-INTEGRITY-001');
  });

  it('TEST 9 — AI Context Package contains product owner guidance', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('PRODUCT OWNER GUIDANCE');
    expect(aiContext).toContain('Investigation is in progress');
  });

  it('TEST 10 — AI Context Package is plain text with no HTML', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).not.toContain('<');
    expect(aiContext).not.toContain('</');
    expect(aiContext).not.toContain('|---');
  });

  it('TEST 11 — AI Context Package uses dashes for separators not unicode bars', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    // AI Context uses - separators, not the unicode ─ used in human export
    expect(aiContext).toContain('-'.repeat(60));
  });

  it('TEST 12 — AI Context Package omits decorative section headers from human export', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    // AI Context should NOT contain the unicode separators from serializeInvestigation
    expect(aiContext).not.toContain('───────────────────────────────────────────────────────────────');
    expect(aiContext).not.toContain('═══════════════════════════════════════════════════════════════');
  });

  it('TEST 13 — AI Context Package contains resolution lifecycle when not detected', () => {
    const data = makeSchemaData({
      resolutionStatus: 'resolved',
      resolutionTimestamp: '2026-07-21T12:00:00Z',
      resolutionActor: 'Product Owner',
    });
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('RESOLUTION LIFECYCLE');
    expect(aiContext).toContain('Resolved');
    expect(aiContext).toContain('Product Owner');
  });

  it('TEST 14 — AI Context Package contains governed actions', () => {
    const data = makeSchemaData({
      governedActions: [
        { id: 'act1', label: 'Accept Historical Root', action_type: 'accept_historical_root', available: true, requires_po_approval: true },
      ] as any,
    });
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('RECOMMENDED ACTIONS');
    expect(aiContext).toContain('Accept Historical Root');
    expect(aiContext).toContain('PO Approval Required: Yes');
  });

  it('TEST 15 — AI Context Package preserves runtime values exactly', () => {
    const summary = 'A very specific executive summary with exact wording for AI.';
    const data = makeSchemaData({ executiveSummary: summary });
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain(summary);
  });

  it('TEST 16 — AI Context Package export via legacy interface works', () => {
    const aiContext = generateAIContextExport({
      alert: makeAlert(),
      evolvedTitle: 'Test Title',
      executiveSummary: 'Test summary',
      rootCause: 'Test root cause',
      confidence: 0.85,
      confidenceExplanation: 'Test explanation',
      evidence: [],
      evidencePackage: null,
      recommendation: null,
      decision: null,
      timeline: [],
      relationships: [],
      relatedEngineering: [],
      governedResponseRef: 'EIOS-INTEGRITY-001',
      resolutionStatus: 'detected',
      resolutionTimestamp: null,
      resolutionActor: null,
    });
    expect(aiContext).toContain('AI CONTEXT PACKAGE');
    expect(aiContext).toContain('Test Title');
    expect(aiContext).toContain('Test summary');
  });
});

describe('EWO-021R.2 — Investigation PDF', () => {

  it('TEST 17 — PDF is generated without error', () => {
    const data = makeSchemaData();
    const doc = generateInvestigationPDF(data);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('TEST 18 — PDF is generated without error and has correct page count', () => {
    const data = makeSchemaData();
    const doc = generateInvestigationPDF(data);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    // Verify it produces valid PDF output
    const output = doc.output('arraybuffer');
    expect(output).toBeDefined();
    expect((output as ArrayBuffer).byteLength).toBeGreaterThan(0);
  });

  it('TEST 19 — PDF generates valid output blob', () => {
    const data = makeSchemaData();
    const doc = generateInvestigationPDF(data);
    const blob = doc.output('blob');
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/pdf');
  });

  it('TEST 20 — PDF handles large evidence without error', () => {
    const data = makeSchemaData({
      evidence: Array.from({ length: 30 }, (_, i) => ({
        label: `Evidence Item ${i}`,
        type: 'ewo',
        reference: `EWO-${i}`,
        description: `Description for evidence item ${i}`,
      })),
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('TEST 21 — PDF handles evidence package without error', () => {
    const data = makeSchemaData({
      evidencePackage: {
        evidence_items: [{
          source_type: 'ewo',
          source_table: 'engineering_work_orders',
          field_name: 'ewo_ref',
          field_value: 'EWO-014.3.2B',
          object_id: 'obj-1',
          confidence: 0.9,
          evidence_priority: 'primary',
          supports_conclusion: true,
          contradicts_conclusion: false,
          why_selected: 'Direct EWO record',
        }],
        conflicts: [],
        existence_resolution: null,
        classification_explanation: {
          classification: 'PARENT_GENUINELY_MISSING',
          chosen_reason: 'No parent found',
          rejected_alternatives: [],
          authoritative_rules_applied: [],
        },
        evidence_graph: { nodes: [], edges: [] },
        canonical_decision: {
          canonical_object_type: null,
          canonical_reference: null,
          canonical_value: 'Accept as Historical Root',
          supporting_evidence_count: 1,
          conflicting_evidence_count: 0,
          confidence: 0.9,
          reasoning: 'No parent exists',
          po_review_required: true,
        },
        runtime_diagnostics: {
          sources_searched: ['ewo'],
          sources_contributing_evidence: [],
          conflicting_evidence_count: 0,
          supporting_evidence_count: 1,
          authoritative_evidence_count: 0,
          unknown_evidence_count: 0,
          po_decisions_required: 1,
          automatic_repairs_possible: 0,
        },
        alert: makeAlert(),
      } as any,
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('TEST 22 — PDF handles authoritative lineage without error', () => {
    const data = makeSchemaData({
      authoritativeLineage: {
        childRef: 'EWO-014.3.2B',
        actualParent: null,
        expectedParent: 'EWO-014.3',
        classification: 'PARENT_GENUINELY_MISSING',
        authoritativeStatus: 'GENUINELY_MISSING',
        sourceObjectType: 'ewo',
        lifecycleOrHistoricalStatus: null,
        lineageSatisfied: false,
        executionPermitted: false,
        governingEvidence: null,
        auditConclusion: null,
        resolutionReason: 'Parent genuinely missing.',
      } as any,
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('TEST 23 — PDF handles decision without error', () => {
    const data = makeSchemaData({
      decision: {
        id: 'dec-1',
        alert_id: 'test-alert-1',
        ewo_ref: 'EWO-014.3.2B',
        decision_type: 'historical_reference_accepted',
        decision_title: 'Historical Root Accepted',
        executive_summary: 'Parent genuinely missing.',
        decision_reasoning: 'No parent exists.',
        evidence_used: [],
        confidence: 0.85,
        confidence_explanation: 'High confidence.',
        alternatives_rejected: [],
        recommended_next_action: 'Accept Historical Root',
        primary_integrity_domain: 'parent_child_lineage',
        parent_alert_id: null,
        relationship_type: 'root_issue',
        resolution_status: 'open',
        superseded_by: null,
        decision_version: 1,
        po_decision: null,
        po_decision_actor: null,
        po_decision_at: null,
        metadata: {},
        created_at: '2026-07-21T10:00:00Z',
        updated_at: '2026-07-21T10:00:00Z',
      } as any,
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('TEST 24 — PDF handles resolved investigation without error', () => {
    const data = makeSchemaData({
      resolutionStatus: 'resolved',
      resolutionTimestamp: '2026-07-21T12:00:00Z',
      resolutionActor: 'Product Owner',
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('TEST 25 — PDF handles governed actions without error', () => {
    const data = makeSchemaData({
      governedActions: [
        { id: 'act1', label: 'Accept Historical Root', action_type: 'accept_historical_root', available: true, requires_po_approval: true },
      ] as any,
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('TEST 26 — PDF handles multiple pages with large data', () => {
    const data = makeSchemaData({
      evidence: Array.from({ length: 30 }, (_, i) => ({
        label: `Evidence Item ${i}`,
        type: 'ewo',
        reference: `EWO-${i}`,
        description: `Description for evidence item ${i}`,
      })),
      timeline: Array.from({ length: 20 }, (_, i) => ({
        timestamp: '2026-07-21T10:00:00Z',
        event: `Timeline event ${i}`,
      })),
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});

describe('EWO-021R.2 — Single Serialization Pipeline', () => {

  it('TEST 27 — Both PDF and AI Context use same InvestigationSchemaData', () => {
    const data = makeSchemaData();
    const pdf = generateInvestigationPDF(data);
    const aiContext = serializeAIContext(data);
    // Both contain the same core information from the same runtime model
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(aiContext).toContain('Historical Root Acceptance Required');
    expect(aiContext).toContain('Parent genuinely missing');
  });

  it('TEST 28 — Legacy export and AI Context export both accept same data shape', () => {
    const alert = makeAlert();
    const legacyData = {
      alert,
      evolvedTitle: 'Test',
      executiveSummary: 'Summary',
      rootCause: 'Root cause',
      confidence: 0.85,
      confidenceExplanation: 'Explanation',
      evidence: [],
      evidencePackage: null,
      recommendation: null,
      decision: null,
      timeline: [],
      relationships: [],
      relatedEngineering: [],
      governedResponseRef: 'REF-001',
      resolutionStatus: 'detected',
      resolutionTimestamp: null,
      resolutionActor: null,
    };
    const humanExport = generateInvestigationExport(legacyData);
    const aiExport = generateAIContextExport(legacyData);
    expect(humanExport).toContain('ENGINEERING INVESTIGATION REPORT');
    expect(aiExport).toContain('AI CONTEXT PACKAGE');
    expect(humanExport).toContain('Test');
    expect(aiExport).toContain('Test');
  });

  it('TEST 29 — No regression to EWO-021R.1 serializeInvestigation', () => {
    const data = makeSchemaData();
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('ENGINEERING INVESTIGATION REPORT');
    expect(exportText).toContain('EXECUTIVE SUMMARY');
    expect(exportText).toContain('ROOT CAUSE');
    expect(exportText).toContain('AFFECTED COMPONENTS');
  });

  it('TEST 30 — AI Context does not duplicate human export format', () => {
    const data = makeSchemaData();
    const humanExport = serializeInvestigation(data);
    const aiContext = serializeAIContext(data);
    // AI Context should have different header
    expect(aiContext).toContain('AI CONTEXT PACKAGE');
    expect(humanExport).toContain('INVESTIGATION REPORT');
    // AI Context should not contain the human export's unicode separators
    expect(aiContext).not.toContain('───────────────────────────────────────────────────────────────');
  });
});
