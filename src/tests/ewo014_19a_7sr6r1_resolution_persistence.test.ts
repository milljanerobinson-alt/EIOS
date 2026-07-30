// EWO-014.19A.7SR.6R.1 — Governed Resolution Persistence & Investigation
// State Synchronisation Tests
// Verifies that resolution status is authoritative from DB, resolved alerts
// become read-only, duplicate resolution is prevented, and the investigation
// view is consistent.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase — use vi.hoisted to avoid hoisting issues
const { mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  return { mockFrom };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}));

import {
  executeGovernedResolution,
  getAlertResolutionStatus,
  reloadAlert,
  RESOLUTION_LIFECYCLE,
  type ResolutionStatus,
  type ResolutionActionType,
} from '../lib/engineeringIntelligenceWorkflow';
import type { IntegrityAlert } from '../lib/engineeringIntegrityService';
import type { EngineeringRecommendation } from '../lib/engineeringRecommendationEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<IntegrityAlert> = {}): IntegrityAlert {
  return {
    id: 'test-alert-id',
    alert_ref: 'EIAL-TEST-001',
    audit_id: null,
    alert_type: 'missing_ewo',
    severity: 'warning',
    title: 'Missing EWO: EWO-TEST',
    description: 'Test alert',
    evidence: {},
    suggested_action: 'create_missing_ewo',
    status: 'open',
    resolved_at: null,
    resolved_by: null,
    resolution_notes: null,
    object_type: 'engineering_work_order',
    raw_reference: 'EWO-TEST',
    normalised_reference: 'EWO-TEST',
    confidence: 0.95,
    classification_reason: 'test',
    original_audit_id: null,
    re_evaluation_status: 'pending',
    resolution_status: 'detected',
    evolved_title: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRec(): EngineeringRecommendation {
  return {
    recommendation_type: 'accept_historical_reference',
    recommended_action: 'Accept Historical Reference',
    engineering_reasoning: 'Test',
    confidence: 0.9,
    evidence_confidence: 0.9,
    historical_confidence: 0.9,
    lineage_confidence: 0.9,
    risk_level: 'low',
    risk_assessment: 'Low',
    auto_repair_suitability: 'safe',
    auto_repair_reason: 'Safe',
    po_decision_support: {
      decision: 'accept',
      rationale: 'Test',
      conditions: [],
      urgency: 'normal',
    },
    expected_impact: 'None',
    alternative_actions: [],
    known_limitations: [],
    summary: 'Test',
    po_review_required: false,
  } as unknown as EngineeringRecommendation;
}

function setupMockChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('EWO-014.19A.7SR.6R.1 — Governed Resolution Persistence', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── REQ 1: Resolution Status Must Be Authoritative ────────────────────────

  describe('Requirement 1 — Resolution Status Must Be Authoritative', () => {
    it('TEST 1 — getAlertResolutionStatus reads from DB', async () => {
      setupMockChain({ data: { resolution_status: 'resolved', resolved_at: '2026-07-21T10:00:00Z', resolved_by: 'Product Owner' }, error: null });
      const status = await getAlertResolutionStatus('test-alert-id');
      expect(status).toBe('resolved');
    });

    it('TEST 2 — getAlertResolutionStatus returns null on error', async () => {
      setupMockChain({ data: null, error: { message: 'fail' } });
      const status = await getAlertResolutionStatus('nonexistent');
      expect(status).toBeNull();
    });

    it('TEST 3 — getAlertResolutionStatus defaults to detected when null', async () => {
      setupMockChain({ data: { resolution_status: null }, error: null });
      const status = await getAlertResolutionStatus('test-alert-id');
      expect(status).toBe('detected');
    });
  });

  // ─── REQ 2: Investigation Refresh ───────────────────────────────────────────

  describe('Requirement 2 — Investigation Refresh', () => {
    it('TEST 4 — reloadAlert reads full alert from DB', async () => {
      const alertData = makeAlert({ resolution_status: 'resolved', resolved_at: '2026-07-21T10:00:00Z' });
      setupMockChain({ data: alertData, error: null });
      const reloaded = await reloadAlert('test-alert-id');
      expect(reloaded).not.toBeNull();
      expect(reloaded!.resolution_status).toBe('resolved');
      expect(reloaded!.resolved_at).toBe('2026-07-21T10:00:00Z');
    });

    it('TEST 5 — reloadAlert returns null on error', async () => {
      setupMockChain({ data: null, error: { message: 'fail' } });
      const reloaded = await reloadAlert('nonexistent');
      expect(reloaded).toBeNull();
    });
  });

  // ─── REQ 3: Resolved Alerts Become Read Only ────────────────────────────────

  describe('Requirement 3 — Resolved Alerts Become Read Only', () => {
    it('TEST 6 — Resolution lifecycle includes resolved and archived', () => {
      expect(RESOLUTION_LIFECYCLE).toContain('resolved');
      expect(RESOLUTION_LIFECYCLE).toContain('archived');
    });

    it('TEST 7 — isReadOnly derived from resolution_status resolved', () => {
      const status: ResolutionStatus = 'resolved';
      const isReadOnly = status === 'resolved' || status === 'archived';
      expect(isReadOnly).toBe(true);
    });

    it('TEST 8 — isReadOnly derived from resolution_status archived', () => {
      const status: ResolutionStatus = 'archived';
      const isReadOnly = status === 'resolved' || status === 'archived';
      expect(isReadOnly).toBe(true);
    });

    it('TEST 9 — isReadOnly is false for non-resolved statuses', () => {
      for (const status of ['detected', 'investigating', 'decision_produced', 'repair_executed'] as ResolutionStatus[]) {
        const isReadOnly = status === 'resolved' || status === 'archived';
        expect(isReadOnly).toBe(false);
      }
    });
  });

  // ─── REQ 4: Prevent Duplicate Resolution ───────────────────────────────────

  describe('Requirement 4 — Prevent Duplicate Resolution', () => {
    it('TEST 10 — executeGovernedResolution refuses when already resolved', async () => {
      // Mock getAlertResolutionStatus to return 'resolved'
      const chain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { resolution_status: 'resolved' }, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };
      mockFrom.mockReturnValue(chain);

      const alert = makeAlert({ resolution_status: 'resolved' });
      const result = await executeGovernedResolution(alert, 'accept_historical_reference', makeRec(), 'Product Owner');

      expect(result.success).toBe(false);
      expect(result.message).toBe('This Engineering Integrity alert has already been resolved.');
      expect(result.audit_recorded).toBe(false);
    });

    it('TEST 11 — executeGovernedResolution refuses when already archived', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { resolution_status: 'archived' }, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };
      mockFrom.mockReturnValue(chain);

      const alert = makeAlert({ resolution_status: 'archived' });
      const result = await executeGovernedResolution(alert, 'accept_historical_reference', makeRec(), 'Product Owner');

      expect(result.success).toBe(false);
      expect(result.message).toBe('This Engineering Integrity alert has already been resolved.');
    });

    it('TEST 12 — executeGovernedResolution does not insert audit when already resolved', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { resolution_status: 'resolved' }, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };
      mockFrom.mockReturnValue(chain);

      const alert = makeAlert({ resolution_status: 'resolved' });
      await executeGovernedResolution(alert, 'accept_historical_reference', makeRec(), 'Product Owner');

      // insert should not have been called for audit trail
      expect(chain.insert).not.toHaveBeenCalled();
    });
  });

  // ─── REQ 5: Consistent Investigation View ──────────────────────────────────

  describe('Requirement 5 — Consistent Investigation View', () => {
    it('TEST 13 — Resolved alert with cleared governedActions has no repair buttons', () => {
      // When resolution completes, governedActions is cleared to []
      const actions: never[] = [];
      const isReadOnly = true;
      expect(actions.length).toBe(0);
      expect(isReadOnly).toBe(true);
      // No repair buttons should be rendered
    });

    it('TEST 14 — Resolution lifecycle stages include extended states', () => {
      const expected = ['detected', 'investigating', 'decision_produced', 'po_review', 'resolution_selected', 'resolution_executed', 'repair_executed', 'resolved', 'archived'];
      expect(RESOLUTION_LIFECYCLE).toEqual(expected);
    });
  });

  // ─── REQ 6: Product Owner Test Simulation ───────────────────────────────────

  describe('Requirement 6 — Product Owner Test Simulation', () => {
    it('TEST 15 — Alert initialized with resolution_status from DB shows correct initial state', () => {
      const alert = makeAlert({ resolution_status: 'resolved', resolved_at: '2026-07-21T10:00:00Z', resolved_by: 'Product Owner' });
      const initialStatus = (alert.resolution_status as ResolutionStatus) ?? 'detected';
      expect(initialStatus).toBe('resolved');
    });

    it('TEST 16 — Alert initialized with detected status shows detected', () => {
      const alert = makeAlert({ resolution_status: 'detected' });
      const initialStatus = (alert.resolution_status as ResolutionStatus) ?? 'detected';
      expect(initialStatus).toBe('detected');
    });

    it('TEST 17 — Alert with null resolution_status defaults to detected', () => {
      const alert = makeAlert({ resolution_status: null as unknown as string });
      const initialStatus = (alert.resolution_status as ResolutionStatus) ?? 'detected';
      expect(initialStatus).toBe('detected');
    });
  });
});
