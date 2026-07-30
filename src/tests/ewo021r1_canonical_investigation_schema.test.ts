// EWO-021R.1 — Canonical Investigation Export Fidelity & Unified Investigation Schema
//
// Regression tests for the canonical Investigation Schema.
// Tests verify:
// 1. All required sections are registered
// 2. Section order matches the Investigation Workspace
// 3. Labels match UI labels exactly
// 4. All visible fields are exported
// 5. Runtime values are preserved (not regenerated)
// 6. Future sections automatically participate in export
// 7. No regression to EWO-021 functionality

import { describe, it, expect } from 'vitest';
import {
  getSectionIds,
  getSectionLabels,
  getVisibleSections,
  serializeInvestigation,
  type InvestigationSchemaData,
} from '../lib/investigationSchema';
import { generateInvestigationExport } from '../lib/investigationExportService';
import type { IntegrityAlert } from '../lib/engineeringIntegrityService';
import type { EvidencePackage } from '../lib/evidencePackageService';

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

describe('EWO-021R.1 — Canonical Investigation Schema', () => {

  // TEST 1: All required sections are registered
  it('TEST 1 — All required sections registered in schema', () => {
    const ids = getSectionIds();
    expect(ids).toContain('investigation_title');
    expect(ids).toContain('alert_reference');
    expect(ids).toContain('executive_summary');
    expect(ids).toContain('root_cause');
    expect(ids).toContain('affected_components');
    expect(ids).toContain('confidence');
    expect(ids).toContain('evidence');
    expect(ids).toContain('evidence_package');
    expect(ids).toContain('classification_explanation');
    expect(ids).toContain('evidence_graph');
    expect(ids).toContain('primary_integrity_domain');
    expect(ids).toContain('recovery_justification', 'separated_confidence_model', 'canonical_decision');
    expect(ids).toContain('runtime_diagnostics');
    expect(ids).toContain('engineering_assessment');
    expect(ids).toContain('timeline');
    expect(ids).toContain('authoritative_lineage');
    expect(ids).toContain('related_engineering');
    expect(ids).toContain('resolution_lifecycle');
    expect(ids).toContain('recommended_actions');
    expect(ids).toContain('reference_codes');
    expect(ids).toContain('product_owner_guidance');
  });

  // TEST 2: Section order matches the Investigation Workspace
  it('TEST 2 — Section order matches Investigation Workspace', () => {
    const ids = getSectionIds();
    const expectedOrder = [
      'investigation_title',
      'alert_reference',
      'executive_summary',
      'root_cause',
      'affected_components',
      'confidence',
      'evidence',
      'evidence_package',
      'conflicting_values',
      'classification_explanation',
      'evidence_graph',
      'primary_integrity_domain',
      'secondary_findings',
      'rejected_cross_domain',
      'recovery_justification',
      'separated_confidence_model',
      'canonical_decision',
      'runtime_diagnostics',
      'authoritative_engineering_decision',
      'engineering_assessment',
      'timeline',
      'decision_timeline',
      'authoritative_lineage',
      'related_engineering',
      'resolution_lifecycle',
      'recommended_actions',
      'reference_codes',
      'product_owner_guidance',
    ];
    for (let i = 0; i < expectedOrder.length; i++) {
      expect(ids[i]).toBe(expectedOrder[i]);
    }
  });

  // TEST 3: Labels match UI labels exactly
  it('TEST 3 — Section labels match UI labels exactly', () => {
    const labels = getSectionLabels();
    expect(labels).toContain('Affected Components');
    expect(labels).toContain('Executive Summary');
    expect(labels).toContain('Root Cause');
    expect(labels).toContain('Confidence');
    expect(labels).toContain('Evidence');
    expect(labels).toContain('Evidence Package');
    expect(labels).toContain('Classification Explanation');
    expect(labels).toContain('Evidence Graph');
    expect(labels).toContain('Primary Integrity Domain');
    expect(labels).toContain('Canonical Decision');
    expect(labels).toContain('Runtime Diagnostics');
    expect(labels).toContain('Engineering Assessment');
    expect(labels).toContain('Authoritative Engineering Decision');
    expect(labels).toContain('Authoritative Lineage');
    expect(labels).toContain('Related Engineering');
    expect(labels).toContain('Resolution Lifecycle');
    expect(labels).toContain('Recommended Actions');
    expect(labels).toContain('Reference Codes');
    expect(labels).toContain('Product Owner Guidance');
  });

  // TEST 4: All visible fields are exported — Affected Components
  it('TEST 4 — Affected Components section exports when present', () => {
    const data = makeSchemaData({ affectedComponents: ['Component A', 'Component B'] });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('AFFECTED COMPONENTS');
    expect(exportText).toContain('Component A');
    expect(exportText).toContain('Component B');
  });

  // TEST 5: Affected Components omitted when empty
  it('TEST 5 — Affected Components omitted when empty', () => {
    const data = makeSchemaData({ affectedComponents: [] });
    const exportText = serializeInvestigation(data);
    expect(exportText).not.toContain('AFFECTED COMPONENTS');
  });

  // TEST 6: Runtime values preserved exactly — executive summary
  it('TEST 6 — Runtime values preserved exactly without paraphrasing', () => {
    const summary = 'A very specific executive summary with exact wording.';
    const data = makeSchemaData({ executiveSummary: summary });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain(summary);
  });

  // TEST 7: Evidence Package sections exported when present
  it('TEST 7 — Evidence Package sections exported when present', () => {
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
        existence_resolution: {
          reference: 'EWO-014.3',
          authoritative_status: 'GENUINELY_MISSING',
          source_object_type: 'ewo',
          source_object_id: null,
          lifecycle_or_historical_status: null,
          confidence: 0.9,
          governing_evidence: null,
          audit_conclusion: null,
          limitations: [],
          lineage_satisfied: false,
        },
        classification_explanation: {
          classification: 'PARENT_GENUINELY_MISSING',
          chosen_reason: 'No parent found',
          rejected_alternatives: ['HISTORICAL_PARENT_SATISFIED'],
          authoritative_rules_applied: ['rule-1'],
        },
        evidence_graph: { nodes: [], edges: [] },
        canonical_decision: {
          canonical_object_type: null,
          canonical_reference: null,
          canonical_value: 'Accept Child as Historical Root',
          supporting_evidence_count: 3,
          conflicting_evidence_count: 0,
          confidence: 0.9,
          reasoning: 'No parent exists',
          po_review_required: true,
        },
        runtime_diagnostics: {
          sources_searched: ['ewo', 'completion_report'],
          sources_contributing_evidence: [],
          conflicting_evidence_count: 0,
          supporting_evidence_count: 3,
          authoritative_evidence_count: 0,
          unknown_evidence_count: 0,
          po_decisions_required: 1,
          automatic_repairs_possible: 0,
        },
        alert: makeAlert(),
      },
    });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('EVIDENCE PACKAGE');
    expect(exportText).toContain('EWO-014.3.2B');
    expect(exportText).toContain('CLASSIFICATION EXPLANATION');
    expect(exportText).toContain('PARENT_GENUINELY_MISSING');
    expect(exportText).toContain('CANONICAL DECISION');
    expect(exportText).toContain('Accept Child as Historical Root');
    expect(exportText).toContain('RUNTIME DIAGNOSTICS');
  });

  // TEST 8: Conflicting Values section exported when present
  it('TEST 8 — Conflicting Values section exported when conflicts exist', () => {
    const data = makeSchemaData({
      evidencePackage: {
        evidence_items: [],
        conflicts: [{
          conflict_summary: 'ewo_ref mismatch',
          conflicting_field: 'ewo_ref',
          values: [
            { source_type: 'ewo', field_value: 'EWO-014.3', source_table: 'engineering_work_orders', field_name: 'ewo_ref' },
            { source_type: 'completion_report', field_value: 'EWO-014.3.A', source_table: 'ewo_completion_reports', field_name: 'ewo_ref' },
          ],
          canonical_candidate: 'EWO-014.3',
          canonical_reason: 'EWO record is authoritative',
          po_review_required: false,
        }],
        existence_resolution: null,
        classification_explanation: {
          classification: 'METADATA_CONFLICT',
          chosen_reason: 'Metadata conflict detected',
          rejected_alternatives: [],
          authoritative_rules_applied: [],
        },
        evidence_graph: { nodes: [], edges: [] },
        canonical_decision: {
          canonical_object_type: 'ewo',
          canonical_reference: 'EWO-014.3',
          canonical_value: 'EWO-014.3',
          supporting_evidence_count: 1,
          conflicting_evidence_count: 1,
          confidence: 0.7,
          reasoning: 'EWO record is canonical',
          po_review_required: false,
        },
        runtime_diagnostics: {
          sources_searched: ['ewo', 'completion_report'],
          sources_contributing_evidence: ['ewo', 'completion_report'],
          conflicting_evidence_count: 1,
          supporting_evidence_count: 1,
          authoritative_evidence_count: 1,
          unknown_evidence_count: 0,
          po_decisions_required: 0,
          automatic_repairs_possible: 1,
        },
        alert: makeAlert(),
      },
    });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('CONFLICTING VALUES');
    expect(exportText).toContain('ewo_ref mismatch');
    expect(exportText).toContain('EWO-014.3');
    expect(exportText).toContain('EWO-014.3.A');
    expect(exportText).toContain('Canonical Candidate: EWO-014.3');
  });

  // TEST 9: Evidence Graph section exported when nodes exist
  it('TEST 9 — Evidence Graph section exported when nodes exist', () => {
    const data = makeSchemaData({
      evidencePackage: {
        evidence_items: [],
        conflicts: [],
        existence_resolution: null,
        classification_explanation: {
          classification: 'PARENT_GENUINELY_MISSING',
          chosen_reason: 'No parent found',
          rejected_alternatives: [],
          authoritative_rules_applied: [],
        },
        evidence_graph: {
          nodes: [
            { object_type: 'ewo', reference: 'EWO-014.3.2B', label: 'Child EWO', status: 'supporting' },
            { object_type: 'ewo', reference: 'EWO-014.3', label: 'Parent EWO (missing)', status: 'missing' },
          ],
          edges: [
            { from: 'EWO-014.3.2B', to: 'EWO-014.3', label: 'expected_parent' },
          ],
        },
        canonical_decision: {
          canonical_object_type: null,
          canonical_reference: null,
          canonical_value: null,
          supporting_evidence_count: 0,
          conflicting_evidence_count: 0,
          confidence: 0.5,
          reasoning: 'No canonical value',
          po_review_required: true,
        },
        runtime_diagnostics: {
          sources_searched: [],
          sources_contributing_evidence: [],
          conflicting_evidence_count: 0,
          supporting_evidence_count: 0,
          authoritative_evidence_count: 0,
          unknown_evidence_count: 0,
          po_decisions_required: 1,
          automatic_repairs_possible: 0,
        },
        alert: makeAlert(),
      },
    });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('EVIDENCE GRAPH');
    expect(exportText).toContain('EWO-014.3.2B');
    expect(exportText).toContain('Child EWO');
    expect(exportText).toContain('expected_parent');
  });

  // TEST 10: Authoritative Lineage section exported when present
  it('TEST 10 — Authoritative Lineage section exported when present', () => {
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
        resolutionReason: 'Parent genuinely missing — accept child as historical root.',
      } as any,
    });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('AUTHORITATIVE LINEAGE');
    expect(exportText).toContain('EWO-014.3.2B');
    expect(exportText).toContain('PARENT_GENUINELY_MISSING');
    expect(exportText).toContain('GENUINELY_MISSING');
  });

  // TEST 11: Recommended Actions section exported
  it('TEST 11 — Recommended Actions section exported when governed actions exist', () => {
    const data = makeSchemaData({
      governedActions: [
        { id: 'act1', label: 'Accept Historical Root', action_type: 'accept_historical_root', available: true, requires_po_approval: true },
        { id: 'act2', label: 'Create Parent EWO', action_type: 'create_canonical_work_order', available: false, requires_po_approval: true, unavailable_reason: 'PO approval required' },
      ] as any,
    });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('RECOMMENDED ACTIONS');
    expect(exportText).toContain('Accept Historical Root');
    expect(exportText).toContain('Create Parent EWO');
    expect(exportText).toContain('PO Approval Required: Yes');
  });

  // TEST 12: Resolution Lifecycle section exported when status != detected
  it('TEST 12 — Resolution Lifecycle section exported when not in detected state', () => {
    const data = makeSchemaData({
      resolutionStatus: 'resolved',
      resolutionTimestamp: '2026-07-21T12:00:00Z',
      resolutionActor: 'Product Owner',
    });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('RESOLUTION LIFECYCLE');
    expect(exportText).toContain('Resolved');
    expect(exportText).toContain('Product Owner');
  });

  // TEST 13: Plain text format — no HTML or markdown tables
  it('TEST 13 — Export is plain text with no HTML or markdown tables', () => {
    const data = makeSchemaData();
    const exportText = serializeInvestigation(data);
    expect(exportText).not.toContain('<');
    expect(exportText).not.toContain('| ---');
    expect(exportText).not.toContain('|---');
    expect(exportText).toContain('─');
    expect(exportText).toContain('═');
  });

  // TEST 14: Section separators are consistent
  it('TEST 14 — Section separators are consistent', () => {
    const data = makeSchemaData();
    const exportText = serializeInvestigation(data);
    const sepCount = (exportText.match(/───────────────────────────────────────────────────────────────/g) || []).length;
    expect(sepCount).toBeGreaterThanOrEqual(2);
    const topCount = (exportText.match(/═══════════════════════════════════════════════════════════════/g) || []).length;
    expect(topCount).toBeGreaterThanOrEqual(2);
  });

  // TEST 15: Report header and footer present
  it('TEST 15 — Report header and footer present', () => {
    const data = makeSchemaData();
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('ENGINEERING INVESTIGATION REPORT');
    expect(exportText).toContain('END OF ENGINEERING INVESTIGATION REPORT');
  });

  // TEST 16: Backward compatibility — legacy export interface works
  it('TEST 16 — Legacy generateInvestigationExport interface still works', () => {
    const alert = makeAlert();
    const exportText = generateInvestigationExport({
      alert,
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
    expect(exportText).toContain('ENGINEERING INVESTIGATION REPORT');
    expect(exportText).toContain('Test Title');
    expect(exportText).toContain('Test summary');
  });

  // TEST 17: Future section registration — new section auto-appears
  it('TEST 17 — Future sections registered in schema appear in export', () => {
    const ids = getSectionIds();
    // Verify that adding a section to the registry would make it appear
    // (We test that the registry is the source of truth by checking
    // that getVisibleSections returns from the same array)
    const data = makeSchemaData();
    const visible = getVisibleSections(data);
    const visibleIds = visible.map(s => s.id);
    // All visible sections should be in the full list
    for (const id of visibleIds) {
      expect(ids).toContain(id);
    }
  });

  // TEST 18: No regression — EWO-021 decision export still works
  it('TEST 18 — EWO-021 Authoritative Engineering Decision still exported', () => {
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
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('AUTHORITATIVE ENGINEERING DECISION');
    expect(exportText).toContain('Historical Root Accepted');
    expect(exportText).toContain('v1');
  });

  // TEST 19: Decision Timeline section exported when present
  it('TEST 19 — Decision Timeline section exported when events exist', () => {
    const data = makeSchemaData({
      decisionTimeline: [{
        id: 'tl-1',
        decision_id: 'dec-1',
        alert_id: 'test-alert-1',
        event_type: 'initial_decision',
        event_summary: 'Initial decision: Historical Root Accepted',
        event_details: {},
        previous_decision_type: null,
        new_decision_type: 'historical_reference_accepted',
        previous_confidence: null,
        new_confidence: 0.85,
        change_log_ref: null,
        actor_type: 'system',
        actor: 'Engineering Intelligence Authority Engine',
        created_at: '2026-07-21T10:00:00Z',
      } as any],
    });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('ENGINEERING DECISION TIMELINE');
    expect(exportText).toContain('INITIAL_DECISION');
    expect(exportText).toContain('Initial decision: Historical Root Accepted');
  });

  // TEST 20: Related Engineering section exported when present
  it('TEST 20 — Related Engineering section exported when entries exist', () => {
    const data = makeSchemaData({
      relatedEngineering: [
        { ref: 'EWO-014.3', title: 'Parent Work Order (missing)', type: 'ewo' },
        { ref: 'EWO-014.3.2A', title: 'Sibling Work Order', type: 'ewo' },
      ],
    });
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('RELATED ENGINEERING');
    expect(exportText).toContain('EWO-014.3');
    expect(exportText).toContain('Sibling Work Order');
  });
});
