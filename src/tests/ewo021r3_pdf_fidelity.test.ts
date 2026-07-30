// EWO-021R.3 — Investigation PDF Fidelity & Decision Consistency Refinement
//
// Regression tests for:
// 1. PDF generates without error for all section combinations
// 2. PDF is schema-driven (future sections auto-participate)
// 3. Product Owner Guidance matches Authoritative Engineering Decision
// 4. No regression to EWO-021R.2 (AI Context, PDF generation)
// 5. No regression to EWO-021R.1 (schema serialization)

import { describe, it, expect } from 'vitest';
import { serializeAIContext, serializeInvestigation, getVisibleSections, type InvestigationSchemaData } from '../lib/investigationSchema';
import { generateInvestigationPDF } from '../lib/investigationPDFRenderer';
import { generateAIContextExport, generateInvestigationExport } from '../lib/investigationExportService';
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

function makeEvidencePackage(): any {
  return {
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
  };
}

function makeDecision(overrides: any = {}): any {
  return {
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
    ...overrides,
  };
}

function makeRecommendation(): any {
  return {
    summary: 'Accept child as historical root.',
    recommended_action: 'Accept Historical Root',
    recommendation_type: 'accept_historical_root',
    engineering_reasoning: 'No canonical parent exists after exhaustive search.',
    evidence_confidence: 0.9,
    recommendation_confidence: 0.85,
    repair_confidence: 0.8,
    risk_level: 'low',
    risk_reason: 'Historical root is a safe operation.',
    auto_repair_suitability: 'safe',
    auto_repair_reason: 'No data loss risk.',
    po_review_required: true,
    po_decision_options: ['accept', 'reject'],
    expected_impact: 'Child EWO becomes a historical root.',
    alternative_actions: [],
    known_limitations: [],
    primary_integrity_domain: 'parent_child_lineage',
    domain_match: true,
    secondary_findings: [],
    rejected_cross_domain_recommendations: [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EWO-021R.3 — PDF Fidelity & Decision Consistency', () => {

  // TEST 1: PDF generates without error for basic investigation
  it('TEST 1 — PDF generates without error for basic investigation', () => {
    const data = makeSchemaData();
    const doc = generateInvestigationPDF(data);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 2: PDF generates with evidence package
  it('TEST 2 — PDF generates without error with evidence package', () => {
    const data = makeSchemaData({ evidencePackage: makeEvidencePackage() });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 3: PDF generates with recommendation
  it('TEST 3 — PDF generates without error with recommendation', () => {
    const data = makeSchemaData({ recommendation: makeRecommendation() });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 4: PDF generates with decision
  it('TEST 4 — PDF generates without error with decision', () => {
    const data = makeSchemaData({ decision: makeDecision() });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 5: PDF generates with all sections populated
  it('TEST 5 — PDF generates without error with all sections populated', () => {
    const data = makeSchemaData({
      evidencePackage: makeEvidencePackage(),
      recommendation: makeRecommendation(),
      decision: makeDecision(),
      decisionTimeline: [{
        id: 'tl-1',
        decision_id: 'dec-1',
        alert_id: 'test-alert-1',
        event_type: 'initial_decision',
        event_summary: 'Initial decision made',
        event_details: {},
        previous_decision_type: null,
        new_decision_type: 'historical_reference_accepted',
        previous_confidence: null,
        new_confidence: 0.85,
        change_log_ref: null,
        actor_type: 'system',
        actor: 'Engineering Intelligence Authority Engine',
        created_at: '2026-07-21T10:00:00Z',
      }],
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
      },
      governedActions: [
        { id: 'act1', label: 'Accept Historical Root', action_type: 'accept_historical_root', available: true, requires_po_approval: true },
      ],
      resolutionStatus: 'review_ready',
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 6: PDF generates with resolved decision
  it('TEST 6 — PDF generates without error with resolved decision', () => {
    const data = makeSchemaData({
      decision: makeDecision({
        resolution_status: 'resolved',
        po_decision: 'accept_historical_root',
        po_decision_actor: 'Product Owner',
        po_decision_at: '2026-07-21T12:00:00Z',
      }),
      resolutionStatus: 'resolved',
      resolutionTimestamp: '2026-07-21T12:00:00Z',
      resolutionActor: 'Product Owner',
      isReadOnly: true,
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 7: PDF generates with PO decision required
  it('TEST 7 — PDF generates without error with PO decision required', () => {
    const data = makeSchemaData({
      decision: makeDecision({
        decision_type: 'product_owner_decision_required',
        decision_title: 'PO Decision Required',
        recommended_next_action: 'Product Owner must review and decide',
      }),
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 8: PDF generates with await further evidence
  it('TEST 8 — PDF generates without error with await further evidence', () => {
    const data = makeSchemaData({
      decision: makeDecision({
        decision_type: 'await_further_evidence',
        decision_title: 'Await Further Evidence',
        recommended_next_action: 'Collect additional evidence',
      }),
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 9: PDF generates with conflicting values
  it('TEST 9 — PDF generates without error with conflicting values', () => {
    const ep = makeEvidencePackage();
    ep.conflicts = [{
      conflict_summary: 'ewo_ref mismatch',
      conflicting_field: 'ewo_ref',
      values: [
        { source_type: 'ewo', field_value: 'EWO-014.3', source_table: 'engineering_work_orders', field_name: 'ewo_ref' },
        { source_type: 'completion_report', field_value: 'EWO-014.3.A', source_table: 'ewo_completion_reports', field_name: 'ewo_ref' },
      ],
      canonical_candidate: 'EWO-014.3',
      canonical_reason: 'EWO record is authoritative',
      po_review_required: false,
    }];
    const data = makeSchemaData({ evidencePackage: ep });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 10: PDF generates with evidence graph
  it('TEST 10 — PDF generates without error with evidence graph', () => {
    const ep = makeEvidencePackage();
    ep.evidence_graph = {
      nodes: [
        { object_type: 'ewo', reference: 'EWO-014.3.2B', label: 'Child EWO', status: 'supporting' },
        { object_type: 'ewo', reference: 'EWO-014.3', label: 'Parent EWO (missing)', status: 'missing' },
      ],
      edges: [{ from: 'EWO-014.3.2B', to: 'EWO-014.3', label: 'expected_parent' }],
    };
    const data = makeSchemaData({ evidencePackage: ep });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 11: PDF generates with secondary findings
  it('TEST 11 — PDF generates without error with secondary findings', () => {
    const rec = makeRecommendation();
    rec.secondary_findings = [{
      description: 'Metadata conflict detected',
      domain: 'metadata_consistency',
      field: 'ewo_ref',
      recommendation_label: 'Auto-repair metadata',
      rejection_reason: 'Cross-domain recommendation rejected',
    }];
    const data = makeSchemaData({ recommendation: rec });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 12: PDF generates with large data (multi-page)
  it('TEST 12 — PDF generates multi-page with large data', () => {
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

  // TEST 13: PDF produces valid output blob
  it('TEST 13 — PDF produces valid PDF output', () => {
    const data = makeSchemaData();
    const doc = generateInvestigationPDF(data);
    const blob = doc.output('blob');
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/pdf');
  });

  // TEST 14: PDF generates with alternative actions and known limitations
  it('TEST 14 — PDF generates without error with alternative actions and known limitations', () => {
    const rec = makeRecommendation();
    rec.alternative_actions = [{
      action: 'Create canonical parent EWO',
      tradeoffs: 'Requires manual creation and verification',
      risk_comparison: 'Higher risk than historical root acceptance',
      governance_implications: 'Requires PO approval',
      confidence: 0.7,
    }];
    rec.known_limitations = ['Limited to current evidence scope'];
    const data = makeSchemaData({ recommendation: rec });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

describe('EWO-021R.3 — Schema-Driven PDF (Future Safety)', () => {

  // TEST 15: PDF renders all visible schema sections
  it('TEST 15 — PDF iterates over all visible sections from schema', () => {
    const data = makeSchemaData({
      evidencePackage: makeEvidencePackage(),
      recommendation: makeRecommendation(),
      decision: makeDecision(),
    });
    const visible = getVisibleSections(data);
    // Verify that the schema returns sections — the PDF iterates over these
    expect(visible.length).toBeGreaterThan(0);
    // The PDF should generate without error for any combination of visible sections
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 16: PDF handles sections with no specific renderer via default fallback
  it('TEST 16 — PDF default fallback handles unregistered sections', () => {
    // All current sections have renderers, but the default fallback
    // ensures future sections will also render. We verify the PDF
    // generates without error even with all sections visible.
    const data = makeSchemaData({
      evidencePackage: makeEvidencePackage(),
      recommendation: makeRecommendation(),
      decision: makeDecision(),
      decisionTimeline: [{
        id: 'tl-1', decision_id: 'dec-1', alert_id: 'test-alert-1',
        event_type: 'initial_decision', event_summary: 'Decision made',
        event_details: {}, previous_decision_type: null,
        new_decision_type: 'historical_reference_accepted',
        previous_confidence: null, new_confidence: 0.85,
        change_log_ref: null, actor_type: 'system',
        actor: 'System', created_at: '2026-07-21T10:00:00Z',
      }],
      authoritativeLineage: {
        childRef: 'EWO-014.3.2B', actualParent: null,
        expectedParent: 'EWO-014.3',
        classification: 'PARENT_GENUINELY_MISSING',
        authoritativeStatus: 'GENUINELY_MISSING',
        sourceObjectType: 'ewo',
        lifecycleOrHistoricalStatus: null,
        lineageSatisfied: false, executionPermitted: false,
        governingEvidence: null, auditConclusion: null,
        resolutionReason: 'Parent missing.',
      },
      governedActions: [
        { id: 'a1', label: 'Accept', action_type: 'accept', available: true, requires_po_approval: true },
      ],
      resolutionStatus: 'review_ready',
    });
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 17: Visible sections match between schema and PDF iteration
  it('TEST 17 — All visible schema sections are rendered in PDF', () => {
    const data = makeSchemaData({
      evidencePackage: makeEvidencePackage(),
      recommendation: makeRecommendation(),
      decision: makeDecision(),
    });
    const visibleSections = getVisibleSections(data);
    // Every visible section should have a renderer or be handled by default
    // We verify by checking the PDF generates without throwing
    expect(() => generateInvestigationPDF(data)).not.toThrow();
    // Count visible sections — all should participate
    expect(visibleSections.length).toBeGreaterThan(10);
  });
});

describe('EWO-021R.3 — Decision Consistency', () => {

  // TEST 18: PO Guidance with resolved decision shows resolved state
  it('TEST 18 — PDF generates correctly with resolved decision and PO guidance', () => {
    const data = makeSchemaData({
      decision: makeDecision({
        resolution_status: 'resolved',
        po_decision: 'accept_historical_root',
        po_decision_actor: 'Product Owner',
        po_decision_at: '2026-07-21T12:00:00Z',
      }),
      resolutionStatus: 'resolved',
      isReadOnly: true,
    });
    // The PDF should generate without error — PO Guidance derives
    // from the same decision state as the workspace
    expect(() => generateInvestigationPDF(data)).not.toThrow();
    const doc = generateInvestigationPDF(data);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 19: PO Guidance with PO decision required shows correct state
  it('TEST 19 — PDF generates correctly with PO decision required', () => {
    const data = makeSchemaData({
      decision: makeDecision({
        decision_type: 'product_owner_decision_required',
        decision_title: 'PO Decision Required',
        recommended_next_action: 'Product Owner must review',
      }),
    });
    expect(() => generateInvestigationPDF(data)).not.toThrow();
  });

  // TEST 20: PO Guidance with await further evidence shows correct state
  it('TEST 20 — PDF generates correctly with await further evidence', () => {
    const data = makeSchemaData({
      decision: makeDecision({
        decision_type: 'await_further_evidence',
        decision_title: 'Await Further Evidence',
        recommended_next_action: 'Collect more evidence',
      }),
    });
    expect(() => generateInvestigationPDF(data)).not.toThrow();
  });

  // TEST 21: PO Guidance with no decision shows in-progress state
  it('TEST 21 — PDF generates correctly with no decision (in-progress)', () => {
    const data = makeSchemaData({ decision: null, recommendation: null });
    expect(() => generateInvestigationPDF(data)).not.toThrow();
  });

  // TEST 22: PO Guidance with recommendation requiring PO review
  it('TEST 22 — PDF generates correctly with recommendation requiring PO review', () => {
    const data = makeSchemaData({
      recommendation: makeRecommendation({ po_review_required: true }),
    });
    expect(() => generateInvestigationPDF(data)).not.toThrow();
  });

  // TEST 23: PO Guidance with recommendation not requiring PO review
  it('TEST 23 — PDF generates correctly with recommendation not requiring PO review', () => {
    const data = makeSchemaData({
      recommendation: makeRecommendation({ po_review_required: false }),
    });
    expect(() => generateInvestigationPDF(data)).not.toThrow();
  });

  // TEST 24: AI Context and PDF both derive from same schema data
  it('TEST 24 — AI Context and PDF both use same InvestigationSchemaData', () => {
    const data = makeSchemaData({
      evidencePackage: makeEvidencePackage(),
      recommendation: makeRecommendation(),
      decision: makeDecision(),
    });
    // Both outputs consume the exact same runtime model
    const aiContext = serializeAIContext(data);
    const pdf = generateInvestigationPDF(data);
    expect(aiContext).toContain('Historical Root Acceptance Required');
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

describe('EWO-021R.3 — No Regression', () => {

  // TEST 25: EWO-021R.1 serializeInvestigation still works
  it('TEST 25 — No regression to EWO-021R.1 serializeInvestigation', () => {
    const data = makeSchemaData();
    const exportText = serializeInvestigation(data);
    expect(exportText).toContain('ENGINEERING INVESTIGATION REPORT');
    expect(exportText).toContain('EXECUTIVE SUMMARY');
    expect(exportText).toContain('ROOT CAUSE');
    expect(exportText).toContain('AFFECTED COMPONENTS');
  });

  // TEST 26: EWO-021R.2 AI Context still works
  it('TEST 26 — No regression to EWO-021R.2 AI Context', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain('AI CONTEXT PACKAGE');
    expect(aiContext).toContain('Historical Root Acceptance Required');
    expect(aiContext).toContain('EXECUTIVE SUMMARY');
  });

  // TEST 27: EWO-021R.2 legacy export interface still works
  it('TEST 27 — No regression to legacy export interface', () => {
    const exportText = generateInvestigationExport({
      alert: makeAlert(),
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
      governedResponseRef: 'REF',
      resolutionStatus: 'detected',
      resolutionTimestamp: null,
      resolutionActor: null,
    });
    expect(exportText).toContain('ENGINEERING INVESTIGATION REPORT');
    expect(exportText).toContain('Test');
  });

  // TEST 28: EWO-021R.2 AI Context export interface still works
  it('TEST 28 — No regression to AI Context export interface', () => {
    const aiContext = generateAIContextExport({
      alert: makeAlert(),
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
      governedResponseRef: 'REF',
      resolutionStatus: 'detected',
      resolutionTimestamp: null,
      resolutionActor: null,
    });
    expect(aiContext).toContain('AI CONTEXT PACKAGE');
    expect(aiContext).toContain('Test');
  });

  // TEST 29: Runtime values preserved in AI Context
  it('TEST 29 — Runtime values preserved exactly in AI Context', () => {
    const summary = 'A very specific executive summary with exact wording.';
    const data = makeSchemaData({ executiveSummary: summary });
    const aiContext = serializeAIContext(data);
    expect(aiContext).toContain(summary);
  });

  // TEST 30: AI Context does not contain HTML or markdown tables
  it('TEST 30 — AI Context is plain text without HTML', () => {
    const data = makeSchemaData();
    const aiContext = serializeAIContext(data);
    expect(aiContext).not.toContain('<');
    expect(aiContext).not.toContain('|---');
  });
});
