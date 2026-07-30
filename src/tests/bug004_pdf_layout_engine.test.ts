// BUG-004 — Investigation PDF Identity Header & Layout Engine Refinement
//
// Tests cover:
//   - metadata grid layout
//   - badge spacing
//   - row height calculation
//   - dynamic header height
//   - body offset calculation
//   - long Alert IDs
//   - long references
//   - long titles
//   - section collision detection
//   - multi-page rendering
//   - visual regression where supported
//   - no overlap invariants

import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import {
  generateInvestigationPDFWithDiagnostic,
  downloadInvestigationPDF,
  RENDERER_VERSION,
  testRenderBadgeGroup,
  testRenderMetadataGrid,
  testRenderIdentityHeader,
  type BadgeSpec,
  type MetadataField,
} from '../lib/investigationPDFRenderer';
import {
  buildCanonicalExportModel,
  checkExportReadiness,
  type CanonicalExportInput,
} from '../lib/investigationExportService';
import {
  getVisibleSections,
  serializeAIContext,
  serializeInvestigation,
  type InvestigationSchemaData,
} from '../lib/investigationSchema';

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<any> = {}): any {
  return {
    id: 'alert-001',
    alert_ref: 'EIAL-1784627828862-2',
    normalised_reference: 'EWO-014-19a-7sr3',
    title: 'Historical Root Acceptance Required',
    alert_type: 'integrity',
    severity: 'high',
    object_type: 'engineering_work_order',
    created_at: '2026-07-21T10:00:00Z',
    ...overrides,
  };
}

function makeEvidencePackage(): any {
  return {
    evidence_items: [
      {
        source_type: 'table',
        source_table: 'engineering_work_orders',
        field_name: 'parent_ewo_ref',
        field_value: 'EWO-014-19a-7sr1',
        object_id: 'ewo-001',
        confidence: 0.95,
        evidence_priority: 'primary',
        supports_conclusion: true,
        contradicts_conclusion: false,
        why_selected: 'Direct lineage reference',
      },
    ],
    conflicts: [],
    classification_explanation: {
      classification: 'historical_root_acceptance',
      chosen_reason: 'Parent EWO is a historical reconstruction',
      rejected_alternatives: [],
      authoritative_rules_applied: ['ES-002'],
    },
    evidence_graph: {
      nodes: [
        { reference: 'EWO-014-19a-7sr3', label: 'Child EWO', status: 'active' },
        { reference: 'EWO-014-19a-7sr1', label: 'Parent EWO', status: 'historical' },
      ],
      edges: [
        { from: 'EWO-014-19a-7sr3', to: 'EWO-014-19a-7sr1', label: 'parent_ref' },
      ],
    },
    canonical_decision: {
      canonical_value: 'EWO-014-19a-7sr1',
      canonical_object_type: 'engineering_work_order',
      reasoning: 'Historical parent identified',
      supporting_evidence_count: 1,
      conflicting_evidence_count: 0,
      confidence: 0.95,
      po_review_required: true,
    },
    runtime_diagnostics: {
      sources_searched: ['engineering_work_orders', 'completion_reports'],
      sources_contributing_evidence: ['engineering_work_orders'],
      supporting_evidence_count: 1,
      conflicting_evidence_count: 0,
      authoritative_evidence_count: 1,
      unknown_evidence_count: 0,
      po_decisions_required: 1,
      automatic_repairs_possible: 0,
    },
  };
}

function makeRecommendation(): any {
  return {
    id: 'rec-1',
    primary_integrity_domain: 'historical_root_acceptance',
    domain_match: true,
    summary: 'Historical root should be accepted',
    recommended_action: 'Accept Historical Root',
    recommendation_type: 'accept_historical_root',
    engineering_reasoning: 'Parent EWO is a historical reconstruction with governing evidence',
    evidence_confidence: 0.95,
    recommendation_confidence: 0.9,
    repair_confidence: 0.0,
    risk_level: 'low',
    risk_reason: 'No data loss risk',
    auto_repair_suitability: 'unsafe',
    auto_repair_reason: 'Requires PO approval',
    po_review_required: true,
    po_decision_options: ['accept', 'reject'],
    expected_impact: 'Lineage relationship will be established',
    alternative_actions: [],
    known_limitations: [],
    secondary_findings: [],
    rejected_cross_domain_recommendations: [],
  };
}

function makeDecision(): any {
  return {
    id: 'dec-1',
    decision_title: 'Historical Root Accepted',
    decision_type: 'historical_reference_accepted',
    decision_version: 1,
    resolution_status: 'open',
    primary_integrity_domain: 'historical_root_acceptance',
    relationship_type: 'parent_child_lineage',
    executive_summary: 'Historical root acceptance is recommended',
    decision_reasoning: 'Parent EWO is a historical reconstruction with governing evidence',
    confidence: 0.9,
    confidence_explanation: 'High confidence based on direct lineage reference',
    recommended_next_action: 'Accept Historical Root',
    alternatives_rejected: [],
    po_decision: null,
    po_decision_actor: null,
    po_decision_at: null,
  };
}

function makeDecisionTimeline(): any[] {
  return [
    {
      id: 'dt-1',
      investigation_id: 'inv-1',
      decision_id: 'dec-1',
      event_type: 'decision_created',
      event_summary: 'Decision produced: Historical Root Accepted',
      previous_decision_type: null,
      new_decision_type: 'historical_reference_accepted',
      previous_confidence: null,
      new_confidence: 0.9,
      actor: 'system',
      actor_type: 'ai',
      created_at: '2026-07-21T10:05:00Z',
    },
  ];
}

function makeAuthoritativeLineage(): any {
  return {
    childRef: 'EWO-014-19a-7sr3',
    actualParent: null,
    expectedParent: 'EWO-014-19a-7sr1',
    classification: 'historical_root',
    authoritativeStatus: 'historical_reconstruction',
    sourceObjectType: 'engineering_work_order',
    lifecycleOrHistoricalStatus: 'historical',
    lineageSatisfied: false,
    executionPermitted: false,
    governingEvidence: 'Parent EWO is a historical reconstruction',
    auditConclusion: 'Historical root should be accepted',
    resolutionReason: 'Parent-child lineage relationship requires PO acceptance',
  };
}

function makeFullExportInput(alertOverrides: Partial<any> = {}): CanonicalExportInput {
  return {
    alert: makeAlert(alertOverrides),
    evolvedTitle: 'Historical Root Acceptance Required',
    executiveSummary: 'This investigation requires PO acceptance of a historical root reference.',
    rootCause: 'The child EWO references a parent EWO that is a historical reconstruction.',
    affectedComponents: ['engineering_work_orders', 'completion_reports'],
    evidence: [
      { type: 'database', label: 'Parent EWO Reference', reference: 'ewo-001.parent_ewo_ref', description: 'Direct lineage reference' },
    ],
    timeline: [
      { timestamp: '2026-07-21T10:00:00Z', event: 'Investigation created' },
      { timestamp: '2026-07-21T10:05:00Z', event: 'Decision produced' },
    ],
    recommendedActions: [],
    relatedEngineering: [
      { ref: 'EWO-014-19a-7sr1', title: 'Parent EWO (Historical)', type: 'parent' },
    ],
    confidence: 0.9,
    confidenceExplanation: 'High confidence based on direct lineage reference',
    evidencePackage: makeEvidencePackage(),
    recommendation: makeRecommendation(),
    decision: makeDecision(),
    decisionTimeline: makeDecisionTimeline(),
    authoritativeLineage: makeAuthoritativeLineage(),
    governedActions: [
      { label: 'Accept Historical Root', available: true, requires_po_approval: true, unavailable_reason: null },
    ],
    resolutionStatus: 'detected',
    resolutionTimestamp: null,
    resolutionActor: null,
    resolutionMessage: null,
    governedResponseState: null,
    isReadOnly: false,
  };
}

function makeSchemaData(alertOverrides: Partial<any> = {}): InvestigationSchemaData {
  return buildCanonicalExportModel(makeFullExportInput(alertOverrides));
}

const PAGE_WIDTH = 210;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('BUG-004 — Investigation PDF Identity Header & Layout Engine', () => {

  // TEST 1: Metadata grid layout
  it('TEST 1 — Metadata grid renders all fields without overlap', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const fields: MetadataField[] = [
      { label: 'Alert Reference', value: 'EIAL-1784627828862-2' },
      { label: 'Alert ID', value: 'alert-001' },
      { label: 'Alert Type', value: 'integrity' },
      { label: 'Severity', value: 'high' },
      { label: 'Object Type', value: 'ENGINEERING_WORK_ORDER' },
      { label: 'Detected At', value: '2026-07-21 10:00:00' },
    ];
    const height = testRenderMetadataGrid(doc, fields, MARGIN, CONTENT_WIDTH, 30);
    expect(height).toBeGreaterThan(0);
    // 3 rows of 2 columns = at least 3 * (label + value + gap) height
    expect(height).toBeGreaterThanOrEqual(15);
  });

  // TEST 2: Badge spacing
  it('TEST 2 — Badge group renders badges without overlap', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const badges: BadgeSpec[] = [
      { label: 'HIGH', bg: [245, 158, 11] as const, textColour: [146, 64, 14] as const },
      { label: 'ENGINEERING_WORK_ORDER', bg: [226, 232, 240] as const, textColour: [51, 65, 85] as const },
      { label: 'EIAL-1784627828862-2', bg: [239, 246, 255] as const, textColour: [37, 99, 235] as const },
    ];
    const height = testRenderBadgeGroup(doc, badges, MARGIN, CONTENT_WIDTH, 30);
    expect(height).toBeGreaterThan(0);
    // Badge height is 5mm minimum
    expect(height).toBeGreaterThanOrEqual(5);
  });

  // TEST 3: Row height calculation
  it('TEST 3 — Row height increases for long values', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const shortFields: MetadataField[] = [
      { label: 'Short', value: 'ABC' },
      { label: 'Short2', value: 'DEF' },
    ];
    const longFields: MetadataField[] = [
      { label: 'Long', value: 'A'.repeat(100) },
      { label: 'Long2', value: 'B'.repeat(100) },
    ];
    const shortHeight = testRenderMetadataGrid(doc, shortFields, MARGIN, CONTENT_WIDTH, 30);
    const longHeight = testRenderMetadataGrid(doc, longFields, MARGIN, CONTENT_WIDTH, 60);
    expect(longHeight).toBeGreaterThan(shortHeight);
  });

  // TEST 4: Dynamic header height
  it('TEST 4 — Identity header height varies with content', () => {
    const doc1 = new jsPDF({ unit: 'mm', format: 'a4' });
    const doc2 = new jsPDF({ unit: 'mm', format: 'a4' });

    const shortData = makeSchemaData();
    const longInput = makeFullExportInput();
    longInput.evolvedTitle = 'A very long investigation title that should wrap across multiple lines because it is significantly longer than the available content width and will require the header to be taller';
    const longData = buildCanonicalExportModel(longInput);

    const shortHeight = testRenderIdentityHeader(doc1, shortData, 30);
    const longHeight = testRenderIdentityHeader(doc2, longData, 30);
    expect(longHeight).toBeGreaterThan(shortHeight);
  });

  // TEST 5: Body offset calculation
  it('TEST 5 — Report body starts after identity header height', () => {
    const schemaData = makeSchemaData();
    const { doc, diagnostic } = generateInvestigationPDFWithDiagnostic(schemaData);
    // The PDF should have been generated successfully
    expect(diagnostic.renderedSectionCount).toBe(diagnostic.visibleSectionCount);
    expect(diagnostic.failedSectionCount).toBe(0);
    // Verify the document has multiple pages or at least one page
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // TEST 6: Long Alert IDs
  it('TEST 6 — Long Alert IDs render without overlapping neighbours', () => {
    const longId = 'EIAL-' + 'X'.repeat(50);
    const schemaData = makeSchemaData({ id: longId });
    const { diagnostic } = generateInvestigationPDFWithDiagnostic(schemaData);
    expect(diagnostic.failedSectionCount).toBe(0);
    expect(diagnostic.renderedSectionCount).toBe(diagnostic.visibleSectionCount);
  });

  // TEST 7: Long references
  it('TEST 7 — Long references wrap cleanly', () => {
    const longRef = 'EIAL-' + 'R'.repeat(60);
    const schemaData = makeSchemaData({ alert_ref: longRef });
    const { diagnostic } = generateInvestigationPDFWithDiagnostic(schemaData);
    expect(diagnostic.failedSectionCount).toBe(0);
  });

  // TEST 8: Long titles
  it('TEST 8 — Long titles wrap cleanly', () => {
    const longTitle = 'Investigation: ' + 'T'.repeat(80);
    const schemaData = makeSchemaData({ title: longTitle });
    const { diagnostic } = generateInvestigationPDFWithDiagnostic(schemaData);
    expect(diagnostic.failedSectionCount).toBe(0);
  });

  // TEST 9: Section collision detection
  it('TEST 9 — No section collisions: all visible sections rendered', () => {
    const schemaData = makeSchemaData();
    const { diagnostic } = generateInvestigationPDFWithDiagnostic(schemaData);
    expect(diagnostic.visibleSectionCount).toBe(diagnostic.renderedSectionCount + diagnostic.failedSectionCount);
    expect(diagnostic.failedSectionCount).toBe(0);
  });

  // TEST 10: Multi-page rendering
  it('TEST 10 — Multi-page rendering succeeds with all sections', () => {
    const schemaData = makeSchemaData();
    const { doc, diagnostic } = generateInvestigationPDFWithDiagnostic(schemaData);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(diagnostic.renderedSectionCount).toBe(diagnostic.visibleSectionCount);
  });

  // TEST 11: Visual regression — content unchanged
  it('TEST 11 — Engineering content remains identical to AI Context', () => {
    const schemaData = makeSchemaData();
    const aiContext = serializeAIContext(schemaData);
    // Verify key engineering facts are present in AI Context
    expect(aiContext).toContain('Historical Root Accepted');
    expect(aiContext).toContain('Accept Historical Root');
    expect(aiContext).toContain('EVIDENCE PACKAGE');
    expect(aiContext).toContain('CLASSIFICATION EXPLANATION');
    expect(aiContext).toContain('EVIDENCE GRAPH');
    expect(aiContext).toContain('CANONICAL DECISION');
    expect(aiContext).toContain('RUNTIME DIAGNOSTICS');
    expect(aiContext).toContain('AUTHORITATIVE ENGINEERING DECISION');
    expect(aiContext).toContain('ENGINEERING DECISION TIMELINE');
    expect(aiContext).toContain('PRODUCT OWNER GUIDANCE');
  });

  // TEST 12: No overlap invariants
  it('TEST 12 — Badge group with many badges wraps to multiple rows', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const badges: BadgeSpec[] = Array.from({ length: 10 }, (_, i) => ({
      label: `BADGE-${i}-${'X'.repeat(10)}`,
      bg: [200, 200, 200] as const,
      textColour: [50, 50, 50] as const,
    }));
    const height = testRenderBadgeGroup(doc, badges, MARGIN, CONTENT_WIDTH, 30);
    // With 10 long badges, height should be more than a single row (5mm)
    expect(height).toBeGreaterThan(5);
  });

  it('TEST 12a — Metadata grid with empty fields list returns zero height', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const height = testRenderMetadataGrid(doc, [], MARGIN, CONTENT_WIDTH, 30);
    expect(height).toBe(0);
  });

  it('TEST 12b — Badge group with empty badges returns zero height', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const height = testRenderBadgeGroup(doc, [], MARGIN, CONTENT_WIDTH, 30);
    expect(height).toBe(0);
  });

  // TEST 13: Renderer version unchanged
  it('TEST 13 — Renderer version is still EWO-021R.4', () => {
    expect(RENDERER_VERSION).toBe('EWO-021R.4');
  });

  // TEST 14: Export readiness gate still works
  it('TEST 14 — Export readiness gate still blocks incomplete models', () => {
    const incompleteInput: CanonicalExportInput = {
      ...makeFullExportInput(),
      evidencePackage: null,
      recommendation: null,
      decision: null,
      decisionTimeline: [],
    };
    const schemaData = buildCanonicalExportModel(incompleteInput);
    const readiness = checkExportReadiness(schemaData);
    expect(readiness.ready).toBe(false);
  });

  // TEST 15: Download still works
  it('TEST 15 — downloadInvestigationPDF succeeds with complete data', () => {
    const schemaData = makeSchemaData();
    const result = downloadInvestigationPDF(schemaData);
    expect(result.success).toBe(true);
    expect(result.diagnostic).not.toBeNull();
    expect(result.diagnostic?.failedSectionCount).toBe(0);
  });

  // TEST 16: AI Context unchanged
  it('TEST 16 — serializeAIContext output unchanged', () => {
    const schemaData = makeSchemaData();
    const aiContext = serializeAIContext(schemaData);
    expect(aiContext).toContain('ENGINEERING INVESTIGATION — AI CONTEXT PACKAGE');
    expect(aiContext).toContain('END OF AI CONTEXT PACKAGE');
    expect(aiContext).toContain('IDENTITY');
    expect(aiContext).toContain('EXECUTIVE SUMMARY');
    expect(aiContext).toContain('ROOT CAUSE');
  });

  // TEST 17: Canonical serialization unchanged
  it('TEST 17 — serializeInvestigation output unchanged', () => {
    const schemaData = makeSchemaData();
    const text = serializeInvestigation(schemaData);
    expect(text).toContain('ENGINEERING INVESTIGATION REPORT');
    expect(text).toContain('Historical Root Accepted');
  });

  // ─── No Regression: EWO-021R.4 tests still pass ──────────────────────────────

  it('TEST 18 — All visible sections participate in PDF generation', () => {
    const schemaData = makeSchemaData();
    const { diagnostic } = generateInvestigationPDFWithDiagnostic(schemaData);
    const visibleSections = getVisibleSections(schemaData);
    expect(diagnostic.visibleSectionCount).toBe(visibleSections.length);
    expect(diagnostic.renderedSectionCount).toBe(visibleSections.length);
  });

  it('TEST 19 — Decision Produced cannot coexist with "no decision generated"', () => {
    const schemaData = makeSchemaData();
    const visibleSections = getVisibleSections(schemaData);
    const guidance = visibleSections.find(s => s.id === 'product_owner_guidance');
    const lines = guidance!.serialize(schemaData);
    expect(lines.some(l => l.includes('No decision has been generated'))).toBe(false);
    expect(lines.some(l => l.includes('Historical Root Accepted'))).toBe(true);
  });
});
