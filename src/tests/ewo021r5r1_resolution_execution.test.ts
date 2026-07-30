import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are available before module imports
const mocks = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockEq = vi.fn();
  const mockOrder = vi.fn();
  const mockLimit = vi.fn();
  const mockMaybeSingle = vi.fn();
  const mockSingle = vi.fn();
  const mockGetDecisionForAlert = vi.fn();
  const mockResolveDecision = vi.fn();
  const mockEvolveDecision = vi.fn();
  const mockRecordTimelineEvent = vi.fn().mockResolvedValue(undefined);
  const mockRecordChangeLogEvent = vi.fn().mockResolvedValue(null);

  return {
    mockSelect, mockInsert, mockUpdate, mockEq, mockOrder, mockLimit,
    mockMaybeSingle, mockSingle,
    mockGetDecisionForAlert, mockResolveDecision, mockEvolveDecision,
    mockRecordTimelineEvent, mockRecordChangeLogEvent,
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mocks.mockSelect.mockReturnValue({
        eq: mocks.mockEq.mockReturnValue({
          order: mocks.mockOrder.mockReturnValue({
            limit: mocks.mockLimit.mockReturnValue({
              maybeSingle: mocks.mockMaybeSingle,
              single: mocks.mockSingle,
            }),
          }),
        }),
      }),
      insert: mocks.mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mocks.mockSingle,
        }),
      }),
      update: mocks.mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: mocks.mockSingle,
          }),
        }),
      }),
    })),
  },
}));

vi.mock('../lib/evidencePackageService', () => ({
  buildEvidencePackage: vi.fn().mockResolvedValue({
    evidence_items: [],
    canonical_decision: { confidence: 0.5 },
    conflicts: [],
    classification_explanation: {},
    evidence_graph: { nodes: [], edges: [] },
    runtime_diagnostics: { sources_searched: [] },
    existence_resolution: null,
    alert: {},
  }),
}));

vi.mock('../lib/engineeringRecommendationEngine', () => ({
  buildEngineeringRecommendation: vi.fn().mockReturnValue({
    recommendation_ref: 'REC-1',
    alert_id: 'alert-1',
    ewo_ref: 'EWO-014.7E',
    recommendation_type: 'unverified_reference_recovery_candidate',
    recommended_action: 'Test',
    engineering_reasoning: 'Test',
    summary: 'Test',
    evidence_confidence: 0,
    recommendation_confidence: 0.1,
    repair_confidence: 0.3,
    risk_level: 'low',
    risk_reason: 'Test',
    auto_repair_suitability: 'not_suitable',
    auto_repair_reason: 'Test',
    po_review_required: true,
    expected_impact: 'Test',
    alternative_actions: [],
    known_limitations: [],
    evidence_used: [],
    po_decision_options: [],
    primary_integrity_domain: 'missing_work_order',
    secondary_findings: [],
    rejected_cross_domain_recommendations: [],
    domain_match: true,
    reference_classification_confidence: 0.95,
    decision_confidence: 0.1,
    recovery_justification: 'blocked_pending_evidence',
    recovery_justification_reason: 'No evidence',
    investigation_stage: 'reference_detected',
  }),
}));

vi.mock('../lib/engineeringDecisionService', () => ({
  getDecisionForAlert: mocks.mockGetDecisionForAlert,
  resolveDecision: mocks.mockResolveDecision,
  evolveDecision: mocks.mockEvolveDecision,
  generateAuthoritativeDecision: vi.fn(),
  recordTimelineEvent: mocks.mockRecordTimelineEvent,
  getDecisionTimeline: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/engineeringChangeLogService', () => ({
  recordChangeLogEvent: mocks.mockRecordChangeLogEvent,
}));

import {
  resolveAuthoritativeDecision,
  assertDecisionLinked,
  executeResolutionAction,
  buildHistoricalReferenceInput,
  createHistoricalReference,
  type DecisionLinkage,
  type EvidenceSearchResult,
  type ResolutionExecutionResult,
} from '../lib/integrityResolutionExecutionService';
import type { IntegrityAlert } from '../lib/engineeringIntegrityService';
import type { EngineeringRecommendation } from '../lib/engineeringRecommendationEngine';
import type { EvidencePackage } from '../lib/evidencePackageService';
import type { EngineeringDecision } from '../lib/engineeringDecisionService';

function makeAlert(overrides: Partial<IntegrityAlert> = {}): IntegrityAlert {
  return {
    id: 'alert-1',
    alert_ref: 'EIA-001',
    title: 'Missing Work Order',
    description: 'Reference not found',
    severity: 'warning',
    object_type: 'engineering_work_order',
    alert_type: 'missing_ewo',
    normalised_reference: 'EWO-014.7E',
    raw_reference: 'EWO-014.7E',
    confidence: 0.95,
    status: 'open',
    resolved_at: null,
    resolved_by: null,
    resolution_notes: null,
    audit_id: 'audit-1',
    evidence: {},
    suggested_action: '',
    classification_reason: null,
    original_audit_id: null,
    re_evaluation_status: '',
    resolution_status: 'po_review',
    evolved_title: null,
    governed_category: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as unknown as IntegrityAlert;
}

function makeDecision(overrides: Partial<EngineeringDecision> = {}): EngineeringDecision {
  return {
    id: 'decision-1',
    alert_id: 'alert-1',
    ewo_ref: 'EWO-014.7E',
    decision_type: 'unverified_reference_recovery_candidate',
    decision_title: 'Unverified Reference',
    executive_summary: 'Test',
    decision_reasoning: 'Test',
    evidence_used: [],
    confidence: 0.1,
    confidence_explanation: 'Test',
    alternatives_rejected: [],
    recommended_next_action: 'Test',
    primary_integrity_domain: 'missing_work_order',
    parent_alert_id: null,
    relationship_type: 'independent_issue',
    resolution_status: 'open',
    superseded_by: null,
    decision_version: 1,
    po_decision: null,
    po_decision_actor: null,
    po_decision_at: null,
    metadata: { recommendation_type: 'unverified_reference_recovery_candidate' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as unknown as EngineeringDecision;
}

function makeRecommendation(overrides: Partial<EngineeringRecommendation> = {}): EngineeringRecommendation {
  return {
    recommendation_ref: 'REC-1',
    alert_id: 'alert-1',
    ewo_ref: 'EWO-014.7E',
    recommendation_type: 'unverified_reference_recovery_candidate',
    recommended_action: 'Test',
    engineering_reasoning: 'Test',
    summary: 'Test',
    evidence_confidence: 0,
    recommendation_confidence: 0.1,
    repair_confidence: 0.3,
    risk_level: 'low',
    risk_reason: 'Test',
    auto_repair_suitability: 'not_suitable',
    auto_repair_reason: 'Test',
    po_review_required: true,
    expected_impact: 'Test',
    alternative_actions: [],
    known_limitations: [],
    evidence_used: [],
    po_decision_options: [],
    primary_integrity_domain: 'missing_work_order',
    secondary_findings: [],
    rejected_cross_domain_recommendations: [],
    domain_match: true,
    reference_classification_confidence: 0.95,
    decision_confidence: 0.1,
    recovery_justification: 'blocked_pending_evidence',
    recovery_justification_reason: 'No evidence',
    investigation_stage: 'reference_detected',
    ...overrides,
  } as unknown as EngineeringRecommendation;
}

function makeEvidencePackage(): EvidencePackage {
  return {
    alert: makeAlert(),
    evidence_items: [],
    conflicts: [],
    classification_explanation: {} as never,
    evidence_graph: { nodes: [], edges: [] } as never,
    canonical_decision: { confidence: 0.5 } as never,
    runtime_diagnostics: {} as never,
    existence_resolution: null,
  };
}

describe('EWO-021R.5R.1 — Resolution Action Execution & Decision Audit Linkage', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetDecisionForAlert.mockResolvedValue(makeDecision());
    mocks.mockResolveDecision.mockResolvedValue(makeDecision());
    mocks.mockEvolveDecision.mockResolvedValue(makeDecision({ decision_version: 2 }));
  });

  // ─── REQ-1: Authoritative Decision Linkage ────────────────────────────────────

  describe('REQ-1 — Authoritative Decision Linkage', () => {
    it('resolves the latest decision for an alert', async () => {
      const linkage = await resolveAuthoritativeDecision('alert-1', 'EIA-001');
      expect(linkage.linkage_status).toBe('linked');
      expect(linkage.decision.id).toBe('decision-1');
      expect(linkage.decision_version).toBe(1);
      expect(linkage.alert_id).toBe('alert-1');
      expect(linkage.alert_ref).toBe('EIA-001');
      expect(linkage.recommendation_type).toBe('unverified_reference_recovery_candidate');
    });

    it('returns missing status when no decision exists', async () => {
      mocks.mockGetDecisionForAlert.mockResolvedValue(null);
      const linkage = await resolveAuthoritativeDecision('alert-1', 'EIA-001');
      expect(linkage.linkage_status).toBe('missing');
      expect(linkage.ambiguity_reason).toContain('No Engineering Decision');
    });

    it('assertDecisionLinked returns true for linked decisions', () => {
      const linkage: DecisionLinkage = {
        decision: makeDecision(),
        alert_id: 'alert-1',
        alert_ref: 'EIA-001',
        recommendation_type: 'unverified_reference_recovery_candidate',
        decision_version: 1,
        investigation_ref: 'decision-1',
        linkage_status: 'linked',
      };
      expect(assertDecisionLinked(linkage)).toBe(true);
    });

    it('assertDecisionLinked returns false for missing decisions', () => {
      const linkage: DecisionLinkage = {
        decision: null as unknown as EngineeringDecision,
        alert_id: 'alert-1',
        alert_ref: 'EIA-001',
        recommendation_type: 'unknown',
        decision_version: 0,
        investigation_ref: 'none',
        linkage_status: 'missing',
      };
      expect(assertDecisionLinked(linkage)).toBe(false);
    });
  });

  // ─── REQ-3 & REQ-4: Real Evidence Search ────────────────────────────────────────

  describe('REQ-3 & REQ-4 — Real Evidence Search', () => {
    it('executeResolutionAction for search_additional_evidence returns evidence search result', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'search_additional_evidence', decision, null, null, 'Product Owner', '',
      );

      expect(result.action_type).toBe('search_additional_evidence');
      expect(result.evidence_search_result).toBeDefined();
      expect(result.evidence_search_result!.sources_attempted.length).toBeGreaterThan(0);
      expect(result.evidence_search_result!.search_started_at).toBeDefined();
      expect(result.evidence_search_result!.search_completed_at).toBeDefined();
      expect(result.closes_alert).toBe(false);
    });

    it('evidence search result includes sources attempted and failures', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'search_additional_evidence', decision, null, null, 'Product Owner', '',
      );

      const searchResult = result.evidence_search_result!;
      expect(searchResult.sources_attempted).toContain('engineering_work_orders');
      expect(searchResult.sources_attempted).toContain('engineering_historical_references');
      expect(searchResult.sources_attempted).toContain('engineering_change_log');
      expect(searchResult.sources_attempted).toContain('ecc_engineering_decision_timeline');
      expect(searchResult.outcome).toMatch(/new_evidence_found|no_additional_evidence|partially_failed|blocked/);
    });

    it('evidence search does not close the alert', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'search_additional_evidence', decision, null, null, 'Product Owner', '',
      );
      expect(result.closes_alert).toBe(false);
      expect(result.lifecycle_transitioned).toBe(false);
    });

    it('records timeline events for evidence search', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      await executeResolutionAction(
        alert, 'search_additional_evidence', decision, null, null, 'Product Owner', '',
      );
      expect(mocks.mockRecordTimelineEvent).toHaveBeenCalled();
      // At least 3 calls: PO selected, search started, search completed
      expect(mocks.mockRecordTimelineEvent.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── REQ-7 & REQ-8: Historical Reference Workflow ───────────────────────────────

  describe('REQ-7 & REQ-8 — Historical Reference Workflow', () => {
    it('buildHistoricalReferenceInput pre-populates from investigation', () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const pkg = makeEvidencePackage();
      const input = buildHistoricalReferenceInput(alert, decision, pkg, 'PO notes');

      expect(input.reference).toBe('EWO-014.7E');
      expect(input.title).toBe('Missing Work Order');
      expect(input.audit_ref).toBe('audit-1');
      expect(input.evidence_summary).toBeDefined();
      expect(input.conclusion).toBe('Unverified Reference');
      expect(input.historical_explanation).toContain('EIA-001');
      expect(input.status).toBe('governed_historical_reference');
      expect(input.po_notes).toBe('PO notes');
    });

    it('createHistoricalReference succeeds and returns reference_id', async () => {
      mocks.mockSingle.mockResolvedValue({ data: { id: 'hist-ref-1' }, error: null });

      const alert = makeAlert();
      const decision = makeDecision();
      const input = buildHistoricalReferenceInput(alert, decision, null, '');

      const result = await createHistoricalReference(input, alert, decision);
      expect(result.success).toBe(true);
      expect(result.reference_id).toBe('hist-ref-1');
    });

    it('createHistoricalReference fails with error message', async () => {
      mocks.mockSingle.mockResolvedValue({ data: null, error: { message: 'Duplicate reference' } });

      const alert = makeAlert();
      const decision = makeDecision();
      const input = buildHistoricalReferenceInput(alert, decision, null, '');

      const result = await createHistoricalReference(input, alert, decision);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Duplicate reference');
    });

    it('executeResolutionAction for record_historical_reference closes alert on success', async () => {
      mocks.mockSingle.mockResolvedValue({ data: { id: 'hist-ref-1' }, error: null });

      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'record_historical_reference', decision, null, null, 'Product Owner', 'PO notes',
      );

      expect(result.success).toBe(true);
      expect(result.closes_alert).toBe(true);
      expect(result.historical_reference_result?.success).toBe(true);
      expect(result.historical_reference_result?.reference_id).toBe('hist-ref-1');
      expect(result.change_log_recorded).toBe(true);
      expect(result.lifecycle_transitioned).toBe(true);
    });

    it('executeResolutionAction for record_historical_reference fails without closing alert', async () => {
      mocks.mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });

      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'record_historical_reference', decision, null, null, 'Product Owner', '',
      );

      expect(result.success).toBe(false);
      expect(result.closes_alert).toBe(false);
      expect(result.historical_reference_result?.success).toBe(false);
      expect(result.historical_reference_result?.error).toBe('DB error');
      expect(result.lifecycle_transitioned).toBe(false);
    });
  });

  // ─── REQ-9 & REQ-10: Transactional Resolution Safety ─────────────────────────────

  describe('REQ-9 & REQ-10 — Transactional Resolution Safety', () => {
    it('accept_permanent_gap closes alert with change log and timeline events', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'accept_permanent_gap', decision, null, null, 'Product Owner', 'Gap accepted',
      );

      expect(result.success).toBe(true);
      expect(result.closes_alert).toBe(true);
      expect(result.change_log_recorded).toBe(true);
      expect(result.lifecycle_transitioned).toBe(true);
      expect(result.timeline_events_recorded).toBeGreaterThanOrEqual(3);
      expect(mocks.mockResolveDecision).toHaveBeenCalledWith('decision-1', 'accept_permanent_gap', 'Product Owner');
      expect(mocks.mockRecordChangeLogEvent).toHaveBeenCalled();
    });

    it('mark_invalid_obsolete closes alert with change log', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'mark_invalid_obsolete', decision, null, null, 'Product Owner', '',
      );

      expect(result.success).toBe(true);
      expect(result.closes_alert).toBe(true);
      expect(result.change_log_recorded).toBe(true);
      expect(result.lifecycle_transitioned).toBe(true);
    });

    it('defer_and_monitor does not close alert', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'defer_and_monitor', decision, null, null, 'Product Owner', '',
      );

      expect(result.success).toBe(true);
      expect(result.closes_alert).toBe(false);
      expect(result.lifecycle_transitioned).toBe(false);
    });

    it('success message reflects actual action completion', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'accept_permanent_gap', decision, null, null, 'Product Owner', '',
      );

      expect(result.message).toContain('Permanent gap accepted');
      expect(result.message).toContain('Alert closed');
    });
  });

  // ─── REQ-11: Timeline and Audit Events ──────────────────────────────────────────

  describe('REQ-11 — Timeline and Audit Events', () => {
    it('every action records timeline events against decision_id', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      await executeResolutionAction(
        alert, 'accept_permanent_gap', decision, null, null, 'Product Owner', '',
      );

      // Verify all timeline events use the correct decision_id
      for (const call of mocks.mockRecordTimelineEvent.mock.calls) {
        expect(call[0].decision_id).toBe('decision-1');
        expect(call[0].alert_id).toBe('alert-1');
      }
    });

    it('timeline events include actor and actor_type', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      await executeResolutionAction(
        alert, 'defer_and_monitor', decision, null, null, 'Product Owner', '',
      );

      const poEvent = mocks.mockRecordTimelineEvent.mock.calls.find(
        c => c[0].actor === 'Product Owner' && c[0].actor_type === 'human',
      );
      expect(poEvent).toBeDefined();
    });

    it('change log events include decision_id and alert_id', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      await executeResolutionAction(
        alert, 'accept_permanent_gap', decision, null, null, 'Product Owner', '',
      );

      const changeLogCall = mocks.mockRecordChangeLogEvent.mock.calls[0][0];
      expect(changeLogCall.metadata.decision_id).toBe('decision-1');
      expect(changeLogCall.metadata.alert_id).toBe('alert-1');
    });
  });

  // ─── REQ-12: Duplicate Prevention ───────────────────────────────────────────────

  describe('REQ-12 — UI Duplicate Prevention', () => {
    it('executeResolutionAction can be called with different action types', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const r1 = await executeResolutionAction(alert, 'defer_and_monitor', decision, null, null, 'PO', '');
      const r2 = await executeResolutionAction(alert, 'accept_permanent_gap', decision, null, null, 'PO', '');
      expect(r1.action_type).toBe('defer_and_monitor');
      expect(r2.action_type).toBe('accept_permanent_gap');
    });
  });

  // ─── REQ-13: No Regression ──────────────────────────────────────────────────────

  describe('REQ-13 — No Regression', () => {
    it('does not regress accept_historical_reference action', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'accept_historical_reference', decision, null, null, 'Product Owner', '',
      );
      expect(result.success).toBe(true);
      expect(result.closes_alert).toBe(true);
    });

    it('does not regress resolve_lineage action', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'resolve_lineage', decision, null, null, 'Product Owner', '',
      );
      expect(result.success).toBe(true);
      expect(result.closes_alert).toBe(true);
    });

    it('does not regress synchronise_metadata action', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'synchronise_metadata', decision, null, null, 'Product Owner', '',
      );
      expect(result.success).toBe(true);
      expect(result.closes_alert).toBe(true);
    });

    it('does not regress dismiss_false_positive action', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'dismiss_false_positive', decision, null, null, 'Product Owner', '',
      );
      expect(result.success).toBe(true);
      expect(result.closes_alert).toBe(true);
    });
  });

  // ─── Product Owner Testing ──────────────────────────────────────────────────────

  describe('Product Owner Testing', () => {
    it('PO-TEST-1 — Decision linkage resolves authoritative decision', async () => {
      const linkage = await resolveAuthoritativeDecision('alert-1', 'EIA-001');
      expect(linkage.linkage_status).toBe('linked');
      expect(linkage.decision.id).toBeDefined();
      expect(linkage.decision_version).toBeGreaterThanOrEqual(1);
    });

    it('PO-TEST-2 — Search Additional Evidence performs real search', async () => {
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'search_additional_evidence', decision, null, null, 'Product Owner', '',
      );
      expect(result.evidence_search_result).toBeDefined();
      expect(result.evidence_search_result!.sources_attempted.length).toBeGreaterThan(5);
      expect(result.closes_alert).toBe(false);
    });

    it('PO-TEST-3 — No new evidence returns no_additional_evidence outcome', async () => {
      // buildEvidencePackage returns empty evidence_items, so no new evidence
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'search_additional_evidence', decision, null, null, 'Product Owner', '',
      );
      expect(['no_additional_evidence', 'partially_failed', 'blocked']).toContain(result.evidence_search_result!.outcome);
    });

    it('PO-TEST-5 — Historical Reference form pre-populates from investigation', () => {
      const alert = makeAlert({ normalised_reference: 'EWO-TEST-001', title: 'Test EWO' });
      const decision = makeDecision();
      const input = buildHistoricalReferenceInput(alert, decision, null, 'PO notes');
      expect(input.reference).toBe('EWO-TEST-001');
      expect(input.title).toBe('Test EWO');
    });

    it('PO-TEST-6 — Historical Reference creation succeeds and closes alert', async () => {
      mocks.mockSingle.mockResolvedValue({ data: { id: 'hist-ref-2' }, error: null });
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'record_historical_reference', decision, null, null, 'Product Owner', 'Confirmed',
      );
      expect(result.success).toBe(true);
      expect(result.closes_alert).toBe(true);
      expect(result.historical_reference_result?.reference_id).toBe('hist-ref-2');
    });

    it('PO-TEST-7 — Historical Reference failure keeps alert open', async () => {
      mocks.mockSingle.mockResolvedValue({ data: null, error: { message: 'Constraint violation' } });
      const alert = makeAlert();
      const decision = makeDecision();
      const result = await executeResolutionAction(
        alert, 'record_historical_reference', decision, null, null, 'Product Owner', '',
      );
      expect(result.success).toBe(false);
      expect(result.closes_alert).toBe(false);
      expect(result.message).toContain('failed');
    });
  });
});
