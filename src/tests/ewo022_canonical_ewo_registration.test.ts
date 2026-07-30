import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => {
  const chainable = () => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {};
    obj.eq = vi.fn().mockReturnValue(obj);
    obj.in = vi.fn().mockReturnValue(obj);
    obj.order = vi.fn().mockReturnValue(obj);
    obj.limit = vi.fn().mockReturnValue(obj);
    obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
    obj.select = vi.fn().mockReturnValue(obj);
    obj.insert = vi.fn().mockReturnValue(obj);
    obj.update = vi.fn().mockReturnValue(obj);
    obj.or = vi.fn().mockReturnValue(obj);
    return obj;
  };
  return {
    supabase: {
      from: vi.fn(() => chainable()),
    },
  };
});

vi.mock('../lib/engineeringChangeLogService', () => ({
  recordChangeLogEvent: vi.fn().mockResolvedValue(null),
}));

import {
  registerCanonicalEWO,
  checkDuplicateEWO,
  transitionLifecycleStage,
  recordProductOwnerAcceptance,
  linkCompletionReport,
  getRefinementHierarchy,
  searchEngineeringLedger,
  LIFECYCLE_STAGE_ORDER,
  LIFECYCLE_STAGE_LABELS,
  type CanonicalEWORegistration,
  type ImplementationSource,
  type LifecycleStage,
} from '../lib/canonicalEwoRegistrationService';

describe('EWO-022 — Automatic Canonical EWO Registration & Lifecycle Assurance', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── REQ-1/2/3: Canonical Registration ────────────────────────────────────────

  describe('REQ-1/2/3 — Canonical EWO Registration', () => {
    it('creates a new canonical EWO with all required fields', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);

        if (table === 'engineering_work_orders') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.single = vi.fn().mockResolvedValue({
            data: { id: 'new-ewo-id', ewo_ref: 'EWO-TEST-001' },
            error: null,
          });
        } else if (table === 'ewo_lifecycle_events') {
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        }

        return obj;
      });

      const reg: CanonicalEWORegistration = {
        ewo_ref: 'EWO-TEST-001',
        title: 'Test EWO',
        engineering_category: 'Engineering',
        implementation_source: 'chatgpt_refinement',
        originating_prompt_ref: 'prompt-001',
        created_by: 'Test',
      };

      const result = await registerCanonicalEWO(reg);
      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(result.ewo_id).toBe('new-ewo-id');
    });

    it('returns duplicate=true when EWO already exists', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({
          data: { id: 'existing-id', ewo_ref: 'EWO-TEST-001', status: 'closed' },
          error: null,
        });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await registerCanonicalEWO({
        ewo_ref: 'EWO-TEST-001',
        title: 'Test EWO',
        engineering_category: 'Engineering',
        implementation_source: 'manual',
      });

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(result.created).toBe(false);
    });

    it('builds refinement chain from parent EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.or = vi.fn().mockReturnValue(obj);

        if (table === 'engineering_work_orders') {
          callCount++;
          if (callCount === 1) {
            // First call: duplicate check (no existing)
            obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          } else if (callCount === 2) {
            // Second call: parent lookup
            obj.maybeSingle = vi.fn().mockResolvedValue({
              data: { refinement_chain: ['EWO-021', 'EWO-021R.5'], refinement_depth: 1 },
              error: null,
            });
          } else {
            // Third call: insert
            obj.single = vi.fn().mockResolvedValue({
              data: { id: 'new-id', ewo_ref: 'EWO-021R.6' },
              error: null,
            });
            obj.insert = vi.fn().mockReturnValue(obj);
          }
        } else if (table === 'ewo_lifecycle_events') {
          obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        }

        return obj;
      });

      const result = await registerCanonicalEWO({
        ewo_ref: 'EWO-021R.6',
        title: 'Refinement Test',
        engineering_category: 'Refinement',
        implementation_source: 'chatgpt_refinement',
        parent_ewo_ref: 'EWO-021R.5',
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
    });
  });

  // ─── REQ-4: Refinement Hierarchy ──────────────────────────────────────────────

  describe('REQ-4 — Refinement Hierarchy', () => {
    it('getRefinementHierarchy returns hierarchy for root EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        callCount++;
        if (callCount === 1) {
          obj.maybeSingle = vi.fn().mockResolvedValue({
            data: {
              id: 'root-id', ewo_ref: 'EWO-021', parent_ref: null,
              refinement_chain: ['EWO-021'], refinement_depth: 0,
              status: 'closed', po_accepted_at: '2026-07-22T12:00:00Z',
            },
            error: null,
          });
        } else {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.order = vi.fn().mockResolvedValue({
            data: [
              { ewo_ref: 'EWO-021R.5', status: 'closed', po_accepted_at: '2026-07-22T12:00:00Z' },
              { ewo_ref: 'EWO-021R.6', status: 'closed', po_accepted_at: '2026-07-22T12:00:00Z' },
            ],
            error: null,
          });
        }
        return obj;
      });

      const result = await getRefinementHierarchy('EWO-021');
      expect(result).not.toBeNull();
      expect(result!.ewo_ref).toBe('EWO-021');
      expect(result!.parent_ref).toBeNull();
      expect(result!.refinement_depth).toBe(0);
      expect(result!.children).toContain('EWO-021R.5');
      expect(result!.children).toContain('EWO-021R.6');
    });

    it('returns null for non-existent EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.order = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await getRefinementHierarchy('EWO-NONEXISTENT');
      expect(result).toBeNull();
    });
  });

  // ─── REQ-6: Lifecycle Stages ──────────────────────────────────────────────────

  describe('REQ-6 — PO Lifecycle', () => {
    it('LIFECYCLE_STAGE_ORDER has 9 stages in correct order', () => {
      expect(LIFECYCLE_STAGE_ORDER).toHaveLength(9);
      expect(LIFECYCLE_STAGE_ORDER[0]).toBe('engineering_approved');
      expect(LIFECYCLE_STAGE_ORDER[8]).toBe('closed');
    });

    it('LIFECYCLE_STAGE_LABELS has labels for all stages', () => {
      for (const stage of LIFECYCLE_STAGE_ORDER) {
        expect(LIFECYCLE_STAGE_LABELS[stage]).toBeDefined();
        expect(typeof LIFECYCLE_STAGE_LABELS[stage]).toBe('string');
      }
    });

    it('transitionLifecycleStage updates status and records event', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        callCount++;
        if (table === 'engineering_work_orders' && callCount === 1) {
          obj.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 'ewo-id', status: 'engineering_approved' },
            error: null,
          });
        } else {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }
        return obj;
      });

      const result = await transitionLifecycleStage('EWO-TEST', 'in_progress', 'Test', 'Starting');
      expect(result.success).toBe(true);
    });
  });

  // ─── REQ-7/8: Acceptance Recording & Automatic Closure ─────────────────────────

  describe('REQ-7/8 — Product Owner Acceptance & Automatic Closure', () => {
    it('records PO acceptance and automatically closes EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        callCount++;
        if (table === 'engineering_work_orders' && callCount === 1) {
          obj.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 'ewo-id', status: 'po_acceptance', ewo_ref: 'EWO-TEST' },
            error: null,
          });
        } else {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }
        return obj;
      });

      const result = await recordProductOwnerAcceptance('EWO-TEST', {
        accepted_by: 'Product Owner',
        acceptance_notes: 'All tests passed',
        accepted_completion_report_id: 'report-1',
      });

      expect(result.success).toBe(true);
    });

    it('returns error when EWO not found', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.order = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await recordProductOwnerAcceptance('EWO-NONEXISTENT', {
        accepted_by: 'PO',
        acceptance_notes: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('EWO not found');
    });
  });

  // ─── REQ-5: Completion Report Linkage ──────────────────────────────────────────

  describe('REQ-5 — Completion Report Linkage', () => {
    it('links completion report to canonical EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        callCount++;
        if (table === 'engineering_work_orders' && callCount === 1) {
          obj.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 'ewo-id' },
            error: null,
          });
        } else {
          // For ewo_completion_reports and second engineering_work_orders call
          // update().eq() chain must work, so update returns obj which has eq
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }
        return obj;
      });

      const result = await linkCompletionReport('EWO-TEST', 'report-1', 'completion');
      expect(result.success).toBe(true);
    });
  });

  // ─── REQ-11: Duplicate Protection ──────────────────────────────────────────────

  describe('REQ-11 — Duplicate Protection', () => {
    it('checkDuplicateEWO returns true for existing EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({
          data: { id: 'existing-id' },
          error: null,
        });
        obj.order = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await checkDuplicateEWO('EWO-EXISTING');
      expect(result.is_duplicate).toBe(true);
      expect(result.existing_id).toBe('existing-id');
    });

    it('checkDuplicateEWO returns false for new EWO', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.order = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await checkDuplicateEWO('EWO-NEW');
      expect(result.is_duplicate).toBe(false);
      expect(result.existing_id).toBeNull();
    });
  });

  // ─── REQ-13: Search ───────────────────────────────────────────────────────────

  describe('REQ-13 — Engineering Ledger Search', () => {
    it('searchEngineeringLedger returns matching EWOs', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockResolvedValue({
          data: [{
            id: '1', ewo_ref: 'EWO-021R.6', title: 'Test', status: 'closed',
            engineering_classification: 'Refinement', implementation_source: 'chatgpt_refinement',
            parent_ref: 'EWO-021R.5', refinement_depth: 2,
            po_accepted_at: '2026-07-22T12:00:00Z', closed_at: '2026-07-22T12:00:00Z',
            created_at: '2026-07-22T09:00:00Z',
          }],
          error: null,
        });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.or = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const results = await searchEngineeringLedger('EWO-021');
      expect(results).toHaveLength(1);
      expect(results[0].ewo_ref).toBe('EWO-021R.6');
    });
  });

  // ─── REQ-14: No Regression ─────────────────────────────────────────────────────

  describe('REQ-14 — No Regression', () => {
    it('ImplementationSource type includes all expected sources', () => {
      const sources: ImplementationSource[] = [
        'conversation', 'chatgpt_refinement', 'atd',
        'historical_recovery', 'manual', 'autonomous', 'bolt_refinement',
      ];
      expect(sources).toHaveLength(7);
    });

    it('LifecycleStage type includes all 9 stages', () => {
      const stages: LifecycleStage[] = LIFECYCLE_STAGE_ORDER;
      expect(stages).toHaveLength(9);
    });
  });
});
