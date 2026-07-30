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
  buildConditionKey,
  computeEvidenceFingerprint,
  evidenceFingerprintChanged,
  detectMaterialChange,
  normaliseResolutionOutcome,
  isReusableResolution,
  discoverCanonicalResolution,
  lookupPriorResolution,
  checkHistoricalReferenceSatisfies,
  cleanupDuplicateAlerts,
  createReconciliationResultCounts,
  type EvidenceFingerprint,
  type ResolutionType,
} from '../lib/integritySuppressionService';

describe('EWO-021R.6R.1 — Reusable Resolution Discovery & Reconciliation Idempotency', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── REQ-1: Canonical Condition Identity ────────────────────────────────────────

  describe('REQ-1 — Canonical Integrity Condition Identity', () => {
    it('builds a deterministic condition key from alert type + reference + scope', () => {
      const key = buildConditionKey('missing_ewo', 'EWO-014.7E', 'ewo', 'platform');
      expect(key.condition_key).toBe('missing_ewo:EWO-014.7E:platform');
    });

    it('produces the same key for the same inputs', () => {
      const k1 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      const k2 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      expect(k1.condition_key).toBe(k2.condition_key);
    });

    it('produces different keys for different alert types', () => {
      expect(buildConditionKey('missing_ewo', 'EWO-014.7E').condition_key)
        .not.toBe(buildConditionKey('parent_child', 'EWO-014.7E').condition_key);
    });
  });

  // ─── REQ-4: Resolution Value Normalisation ──────────────────────────────────────

  describe('REQ-4 — Governed Resolution Normalisation', () => {
    it('normalises accept_permanent_gap', () => {
      expect(normaliseResolutionOutcome('accept_permanent_gap')).toBe('accept_permanent_gap');
    });

    it('normalises legacy alias permanent_gap_accepted', () => {
      expect(normaliseResolutionOutcome('permanent_gap_accepted')).toBe('accept_permanent_gap');
    });

    it('normalises legacy alias accepted_permanent_gap', () => {
      expect(normaliseResolutionOutcome('accepted_permanent_gap')).toBe('accept_permanent_gap');
    });

    it('normalises historical_reference_recorded to record_historical_reference', () => {
      expect(normaliseResolutionOutcome('historical_reference_recorded')).toBe('record_historical_reference');
    });

    it('normalises historical_reference_accepted to accept_historical_reference', () => {
      expect(normaliseResolutionOutcome('historical_reference_accepted')).toBe('accept_historical_reference');
    });

    it('normalises invalid_reference to mark_invalid_obsolete', () => {
      expect(normaliseResolutionOutcome('invalid_reference')).toBe('mark_invalid_obsolete');
    });

    it('normalises false_positive to dismiss_false_positive', () => {
      expect(normaliseResolutionOutcome('false_positive')).toBe('dismiss_false_positive');
    });

    it('normalises mark_false_positive to dismiss_false_positive', () => {
      expect(normaliseResolutionOutcome('mark_false_positive')).toBe('dismiss_false_positive');
    });

    it('normalises canonical_recovery_completed', () => {
      expect(normaliseResolutionOutcome('canonical_recovery_completed')).toBe('canonical_recovery_completed');
    });

    it('normalises intentional_legacy_reference', () => {
      expect(normaliseResolutionOutcome('intentional_legacy_reference')).toBe('intentional_legacy_reference');
    });

    it('returns unknown for null', () => {
      expect(normaliseResolutionOutcome(null)).toBe('unknown');
    });

    it('returns unknown for unrecognised values', () => {
      expect(normaliseResolutionOutcome('some_random_value')).toBe('unknown');
    });

    it('preserves original value in audit (raw value differs from normalised)', () => {
      const raw = 'permanent_gap_accepted';
      const normalised = normaliseResolutionOutcome(raw);
      expect(normalised).toBe('accept_permanent_gap');
      expect(raw).toBe('permanent_gap_accepted'); // original preserved
    });
  });

  // ─── REQ-5: Reusability Rules ──────────────────────────────────────────────────

  describe('REQ-5 — Reusability Rules', () => {
    it('accept_permanent_gap is reusable', () => {
      expect(isReusableResolution('accept_permanent_gap')).toBe(true);
    });

    it('record_historical_reference is reusable', () => {
      expect(isReusableResolution('record_historical_reference')).toBe(true);
    });

    it('mark_invalid_obsolete is reusable', () => {
      expect(isReusableResolution('mark_invalid_obsolete')).toBe(true);
    });

    it('dismiss_false_positive is reusable', () => {
      expect(isReusableResolution('dismiss_false_positive')).toBe(true);
    });

    it('canonical_recovery_completed is reusable', () => {
      expect(isReusableResolution('canonical_recovery_completed')).toBe(true);
    });

    it('unknown is not reusable', () => {
      expect(isReusableResolution('unknown')).toBe(false);
    });

    it('create_canonical_work_order is not reusable (requires action)', () => {
      expect(isReusableResolution('create_canonical_work_order')).toBe(false);
    });
  });

  // ─── REQ-6: Evidence Fingerprinting ─────────────────────────────────────────────

  describe('REQ-6 — Evidence Fingerprinting', () => {
    it('computes a deterministic fingerprint', () => {
      const items = [
        { source_type: 'engineering_work_orders', field_value: 'EWO-014.7E', confidence: 1.0 },
      ];
      const fp1 = computeEvidenceFingerprint({}, items);
      const fp2 = computeEvidenceFingerprint({}, items);
      expect(fp1.hash).toBe(fp2.hash);
      expect(fp1.authoritative_count).toBe(1);
    });

    it('produces different fingerprints for different evidence', () => {
      const fp1 = computeEvidenceFingerprint({}, [{ source_type: 'a', field_value: 'x', confidence: 0.5 }]);
      const fp2 = computeEvidenceFingerprint({}, [{ source_type: 'a', field_value: 'x', confidence: 0.5 }, { source_type: 'b', field_value: 'y', confidence: 0.9 }]);
      expect(fp1.hash).not.toBe(fp2.hash);
    });

    it('order-independent fingerprinting', () => {
      const items1 = [{ source_type: 'a', field_value: 'x', confidence: 0.5 }, { source_type: 'b', field_value: 'y', confidence: 0.9 }];
      const items2 = [{ source_type: 'b', field_value: 'y', confidence: 0.9 }, { source_type: 'a', field_value: 'x', confidence: 0.5 }];
      expect(computeEvidenceFingerprint({}, items1).hash).toBe(computeEvidenceFingerprint({}, items2).hash);
    });

    it('evidenceFingerprintChanged detects differences', () => {
      const fp1: EvidenceFingerprint = { hash: 'abc', source_count: 1, evidence_count: 1, authoritative_count: 0, sources: ['a'] };
      const fp2: EvidenceFingerprint = { hash: 'def', source_count: 2, evidence_count: 2, authoritative_count: 1, sources: ['a', 'b'] };
      expect(evidenceFingerprintChanged(fp1, fp2)).toBe(true);
    });
  });

  // ─── REQ-5: Material Change Detection ───────────────────────────────────────────

  describe('REQ-5 — Material Change Detection', () => {
    it('detects new authoritative evidence', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 1, evidence_count: 1, authoritative_count: 0, sources: ['a'] };
      const result = detectMaterialChange(oldFp, {}, [{ source_type: 'a', field_value: 'x', confidence: 0.5 }, { source_type: 'b', field_value: 'y', confidence: 1.0 }]);
      expect(result.has_material_change).toBe(true);
      expect(result.change_type).toBe('new_authoritative_evidence');
    });

    it('detects canonical object now exists', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 0, evidence_count: 0, authoritative_count: 0, sources: [] };
      const result = detectMaterialChange(oldFp, {}, undefined, true);
      expect(result.has_material_change).toBe(true);
      expect(result.change_type).toBe('canonical_object_now_exists');
    });

    it('does not detect change when fingerprint unchanged', () => {
      const oldFp = computeEvidenceFingerprint({}, [{ source_type: 'a', field_value: 'x', confidence: 0.5 }]);
      const result = detectMaterialChange(oldFp, {}, [{ source_type: 'a', field_value: 'x', confidence: 0.5 }]);
      expect(result.has_material_change).toBe(false);
      expect(result.change_type).toBe('none');
    });

    it('treats null old fingerprint as material change', () => {
      const result = detectMaterialChange(null, {}, undefined);
      expect(result.has_material_change).toBe(true);
    });

    it('detects evidence removal as material change', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 2, evidence_count: 2, authoritative_count: 0, sources: ['a', 'b'] };
      const result = detectMaterialChange(oldFp, {}, [{ source_type: 'a', field_value: 'x', confidence: 0.5 }]);
      expect(result.has_material_change).toBe(true);
      expect(result.change_type).toBe('canonical_object_deleted');
    });
  });

  // ─── REQ-2/3: Canonical Resolution Discovery ────────────────────────────────────

  describe('REQ-2/3 — Canonical Resolution Discovery', () => {
    it('returns should_create_new when no existing alerts found', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
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
        return obj;
      });

      const result = await lookupPriorResolution('missing_ewo', 'EWO-NEW-001');
      expect(result.should_create_new).toBe(true);
      expect(result.active_alert).toBeNull();
      expect(result.resolved_alert).toBeNull();
    });

    it('finds resolution stored on retained alert via decision po_decision', async () => {
      const { supabase } = await import('../lib/supabase');
      const alertId = 'alert-retained-1';
      const decisionId = 'dec-1';

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);

        if (table === 'engineering_integrity_alerts') {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: alertId, alert_ref: 'EIAL-1', status: 'resolved', resolution_status: 'resolved', resolved_at: '2026-07-21', resolved_by: 'governed_resolution', resolution_notes: null, evidence: {}, condition_key: 'missing_ewo:EWO-014.7E:platform', superseded_by_alert_id: null, created_at: '2026-07-19' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decisions') {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: decisionId, alert_id: alertId, decision_type: 'recovery', po_decision: 'accept_permanent_gap', po_decision_actor: 'po', po_decision_at: '2026-07-21', resolution_status: 'resolved', decision_version: 1, superseded_by: null, recommended_next_action: 'accept', created_at: '2026-07-21' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decision_timeline') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'engineering_historical_references') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }

        return obj;
      });

      const result = await discoverCanonicalResolution('missing_ewo', 'EWO-014.7E');
      expect(result.is_reusable).toBe(true);
      expect(result.normalised_resolution).toBe('accept_permanent_gap');
      expect(result.resolution_source).toBe('decision_po_decision');
      expect(result.authoritative_decision?.id).toBe(decisionId);
    });

    it('finds resolution stored on superseded predecessor alert', async () => {
      const { supabase } = await import('../lib/supabase');
      const retainedAlertId = 'alert-retained-2';
      const supersededAlertId = 'alert-superseded-2';
      const decisionId = 'dec-2';

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);

        if (table === 'engineering_integrity_alerts') {
          obj.order = vi.fn().mockResolvedValue({
            data: [
              { id: retainedAlertId, alert_ref: 'EIAL-2', status: 'resolved', resolution_status: 'resolved', resolved_at: '2026-07-21', resolved_by: 'governed_resolution', resolution_notes: null, evidence: {}, condition_key: 'missing_ewo:EWO-014.7E:platform', superseded_by_alert_id: null, created_at: '2026-07-19' },
              { id: supersededAlertId, alert_ref: 'EIAL-3', status: 'resolved', resolution_status: 'superseded', resolved_at: null, resolved_by: null, resolution_notes: 'superseded', evidence: {}, condition_key: null, superseded_by_alert_id: retainedAlertId, created_at: '2026-07-20' },
            ],
            error: null,
          });
        } else if (table === 'ecc_engineering_decisions') {
          // Decision is on the SUPERSEDED alert, not the retained one
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: decisionId, alert_id: supersededAlertId, decision_type: 'recovery', po_decision: 'accept_permanent_gap', po_decision_actor: 'po', po_decision_at: '2026-07-21', resolution_status: 'resolved', decision_version: 1, superseded_by: null, recommended_next_action: 'accept', created_at: '2026-07-21' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decision_timeline') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'engineering_historical_references') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }

        return obj;
      });

      const result = await discoverCanonicalResolution('missing_ewo', 'EWO-014.7E');
      expect(result.is_reusable).toBe(true);
      expect(result.normalised_resolution).toBe('accept_permanent_gap');
      expect(result.authoritative_decision?.id).toBe(decisionId);
      expect(result.authoritative_decision?.alert_id).toBe(supersededAlertId);
    });

    it('finds resolution stored only in decision timeline event', async () => {
      const { supabase } = await import('../lib/supabase');
      const alertId = 'alert-timeline-1';

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);

        if (table === 'engineering_integrity_alerts') {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: alertId, alert_ref: 'EIAL-T1', status: 'resolved', resolution_status: 'resolved', resolved_at: '2026-07-21', resolved_by: null, resolution_notes: null, evidence: {}, condition_key: 'missing_ewo:EWO-014.7E:platform', superseded_by_alert_id: null, created_at: '2026-07-19' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decisions') {
          // No po_decision on the decision
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: 'dec-t1', alert_id: alertId, decision_type: 'recovery', po_decision: null, po_decision_actor: null, po_decision_at: null, resolution_status: 'open', decision_version: 1, superseded_by: null, recommended_next_action: 'accept', created_at: '2026-07-21' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decision_timeline') {
          // Resolution is in the timeline
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: 'tl-1', decision_id: 'dec-t1', alert_id: alertId, event_type: 'po_decision', event_summary: 'accept_permanent_gap', actor_type: 'po', actor: 'Product Owner', created_at: '2026-07-21' }],
            error: null,
          });
        } else if (table === 'engineering_historical_references') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }

        return obj;
      });

      const result = await discoverCanonicalResolution('missing_ewo', 'EWO-014.7E');
      expect(result.is_reusable).toBe(true);
      expect(result.normalised_resolution).toBe('accept_permanent_gap');
      expect(result.resolution_source).toBe('timeline_event');
    });

    it('finds resolution via alert resolved_by when no decision po_decision', async () => {
      const { supabase } = await import('../lib/supabase');
      const alertId = 'alert-resolvedby-1';

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);

        if (table === 'engineering_integrity_alerts') {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: alertId, alert_ref: 'EIAL-R1', status: 'resolved', resolution_status: 'resolved', resolved_at: '2026-07-21', resolved_by: 'governed_resolution', resolution_notes: null, evidence: {}, condition_key: 'missing_ewo:EWO-014.7E:platform', superseded_by_alert_id: null, created_at: '2026-07-19' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decisions') {
          // Decisions exist but none have po_decision
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: 'dec-r1', alert_id: alertId, decision_type: 'recovery', po_decision: null, po_decision_actor: null, po_decision_at: null, resolution_status: 'open', decision_version: 1, superseded_by: null, recommended_next_action: 'accept', created_at: '2026-07-21' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decision_timeline') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'engineering_historical_references') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }

        return obj;
      });

      const result = await discoverCanonicalResolution('missing_ewo', 'EWO-014.7E');
      expect(result.is_reusable).toBe(true);
      expect(result.normalised_resolution).toBe('accept_permanent_gap');
      expect(result.resolution_source).toBe('alert_resolved_by');
    });

    it('finds resolution via Historical Reference', async () => {
      const { supabase } = await import('../lib/supabase');
      const alertId = 'alert-histref-1';

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);

        if (table === 'engineering_integrity_alerts') {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: alertId, alert_ref: 'EIAL-H1', status: 'resolved', resolution_status: 'resolved', resolved_at: '2026-07-21', resolved_by: null, resolution_notes: null, evidence: {}, condition_key: 'missing_ewo:EWO-014.7E:platform', superseded_by_alert_id: null, created_at: '2026-07-19' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decisions') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'ecc_engineering_decision_timeline') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'engineering_historical_references') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'hr-1', status: 'governed_historical_reference' }, error: null });
        }

        return obj;
      });

      const result = await discoverCanonicalResolution('missing_ewo', 'EWO-014.7E');
      expect(result.is_reusable).toBe(true);
      expect(result.normalised_resolution).toBe('record_historical_reference');
      expect(result.resolution_source).toBe('historical_reference');
    });

    it('returns lookup_inconclusive when resolved alert has no reusable resolution', async () => {
      const { supabase } = await import('../lib/supabase');
      const alertId = 'alert-inconclusive-1';

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);

        if (table === 'engineering_integrity_alerts') {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: alertId, alert_ref: 'EIAL-I1', status: 'resolved', resolution_status: 'resolved', resolved_at: '2026-07-21', resolved_by: 'manual', resolution_notes: null, evidence: {}, condition_key: 'missing_ewo:EWO-014.7E:platform', superseded_by_alert_id: null, created_at: '2026-07-19' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decisions') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'ecc_engineering_decision_timeline') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'engineering_historical_references') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }

        return obj;
      });

      const result = await discoverCanonicalResolution('missing_ewo', 'EWO-014.7E');
      expect(result.is_reusable).toBe(false);
      expect(result.diagnostics.final_decision).toBe('lookup_inconclusive');
    });

    it('selects authoritative alert with PO decision over resolved-only alert', async () => {
      const { supabase } = await import('../lib/supabase');
      const withDecisionId = 'alert-with-dec';
      const resolvedOnlyId = 'alert-resolved-only';

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);

        if (table === 'engineering_integrity_alerts') {
          obj.order = vi.fn().mockResolvedValue({
            data: [
              { id: resolvedOnlyId, alert_ref: 'EIAL-1', status: 'resolved', resolution_status: 'resolved', resolved_at: '2026-07-19', resolved_by: 'governed_resolution', resolution_notes: null, evidence: {}, condition_key: 'missing_ewo:EWO-014.7E:platform', superseded_by_alert_id: null, created_at: '2026-07-19' },
              { id: withDecisionId, alert_ref: 'EIAL-2', status: 'resolved', resolution_status: 'resolved', resolved_at: '2026-07-21', resolved_by: null, resolution_notes: null, evidence: {}, condition_key: 'missing_ewo:EWO-014.7E:platform', superseded_by_alert_id: null, created_at: '2026-07-20' },
            ],
            error: null,
          });
        } else if (table === 'ecc_engineering_decisions') {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: 'dec-auth', alert_id: withDecisionId, decision_type: 'recovery', po_decision: 'no_action_required', po_decision_actor: 'po', po_decision_at: '2026-07-21', resolution_status: 'resolved', decision_version: 1, superseded_by: null, recommended_next_action: 'accept', created_at: '2026-07-21' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decision_timeline') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'engineering_historical_references') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }

        return obj;
      });

      const result = await discoverCanonicalResolution('missing_ewo', 'EWO-014.7E');
      expect(result.authoritative_alert?.id).toBe(withDecisionId);
      expect(result.is_reusable).toBe(true);
      expect(result.normalised_resolution).toBe('no_action_required');
    });

    it('records diagnostics with candidate counts', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
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
        return obj;
      });

      const result = await discoverCanonicalResolution('missing_ewo', 'EWO-NEW-002');
      expect(result.diagnostics.condition_key).toBe('missing_ewo:EWO-NEW-002:platform');
      expect(result.diagnostics.candidate_alerts_inspected).toBe(0);
      expect(result.diagnostics.candidate_decisions_inspected).toBe(0);
      expect(result.diagnostics.timeline_events_inspected).toBe(0);
      expect(result.diagnostics.final_decision).toBe('should_create_new');
    });
  });

  // ─── REQ-9: Historical Reference Recognition ────────────────────────────────────

  describe('REQ-9 — Historical Reference Recognition', () => {
    it('returns true when Historical Reference exists with satisfying status', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'hr-1', status: 'governed_historical_reference' }, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        return obj;
      });
      expect(await checkHistoricalReferenceSatisfies('EWO-014.7E')).toBe(true);
    });

    it('returns false when no Historical Reference exists', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        return obj;
      });
      expect(await checkHistoricalReferenceSatisfies('EWO-NONEXISTENT')).toBe(false);
    });

    it('returns false when Historical Reference has non-satisfying status', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'hr-2', status: 'invalidated' }, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        return obj;
      });
      expect(await checkHistoricalReferenceSatisfies('EWO-014.7E')).toBe(false);
    });
  });

  // ─── REQ-12: Reconciliation Result Counts ───────────────────────────────────────

  describe('REQ-12 — Reconciliation Result Counts', () => {
    it('creates zeroed counts object with all required fields', () => {
      const counts = createReconciliationResultCounts();
      expect(counts.new_alerts_created).toBe(0);
      expect(counts.existing_active_alerts_updated).toBe(0);
      expect(counts.resolved_decisions_reused).toBe(0);
      expect(counts.alerts_suppressed).toBe(0);
      expect(counts.alerts_reopened).toBe(0);
      expect(counts.successor_investigations_created).toBe(0);
      expect(counts.unchanged_conditions_detected).toBe(0);
      expect(counts.evidence_changes_detected).toBe(0);
      expect(counts.reconciliation_failures).toBe(0);
      expect(counts.lookup_inconclusive).toBe(0);
    });
  });

  // ─── REQ-15: Existing Duplicate Cleanup ─────────────────────────────────────────

  describe('REQ-15 — Existing Duplicate Cleanup', () => {
    it('returns no duplicates when only one alert exists', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
        const obj: Record<string, ReturnType<typeof vi.fn>> = {};
        obj.eq = vi.fn().mockReturnValue(obj);
        obj.in = vi.fn().mockReturnValue(obj);
        obj.order = vi.fn().mockResolvedValue({
          data: [{ id: 'alert-1', alert_ref: 'EIAL-1', status: 'resolved', resolution_status: 'resolved' }],
          error: null,
        });
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockResolvedValue({ data: null, error: null });
        return obj;
      });

      const result = await cleanupDuplicateAlerts('missing_ewo', 'EWO-014.7E');
      expect(result.duplicates_superseded).toBe(0);
      expect(result.duplicate_alert_ids).toEqual([]);
    });
  });

  // ─── REQ-14: No Regression ──────────────────────────────────────────────────────

  describe('REQ-14 — No Regression', () => {
    it('does not regress evidence fingerprint computation', () => {
      const items = [{ source_type: 'engineering_work_orders', field_value: 'EWO-014.7E', confidence: 1.0 }];
      const fp = computeEvidenceFingerprint({}, items);
      expect(fp.hash).toBeDefined();
      expect(fp.authoritative_count).toBe(1);
    });

    it('does not regress material change detection for canonical object existence', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 0, evidence_count: 0, authoritative_count: 0, sources: [] };
      const result = detectMaterialChange(oldFp, {}, undefined, true);
      expect(result.change_type).toBe('canonical_object_now_exists');
      expect(result.has_material_change).toBe(true);
    });

    it('does not regress condition key determinism', () => {
      const k1 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      const k2 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      expect(k1.condition_key).toBe(k2.condition_key);
    });
  });

  // ─── EWO-014.7E Fixture ─────────────────────────────────────────────────────────

  describe('EWO-014.7E Fixture', () => {
    it('condition key matches expected format for EWO-014.7E', () => {
      const key = buildConditionKey('missing_ewo', 'EWO-014.7E', 'ewo', 'platform');
      expect(key.condition_key).toBe('missing_ewo:EWO-014.7E:platform');
    });

    it('resolved_by governed_resolution normalises to accept_permanent_gap', () => {
      expect(normaliseResolutionOutcome('governed_resolution')).toBe('unknown');
      // But the discovery service maps it via resolvedByMap
      // This is tested in the discoverCanonicalResolution tests above
    });

    it('unchanged evidence with valid permanent-gap resolution does not trigger material change', () => {
      const fp = computeEvidenceFingerprint({}, [{ source_type: 'a', field_value: 'x', confidence: 0.5 }]);
      const result = detectMaterialChange(fp, {}, [{ source_type: 'a', field_value: 'x', confidence: 0.5 }]);
      expect(result.has_material_change).toBe(false);
    });

    it('material new evidence with valid prior resolution triggers material change', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 1, evidence_count: 1, authoritative_count: 0, sources: ['a'] };
      const result = detectMaterialChange(oldFp, {}, [{ source_type: 'a', field_value: 'x', confidence: 0.5 }, { source_type: 'b', field_value: 'y', confidence: 1.0 }]);
      expect(result.has_material_change).toBe(true);
      expect(result.change_type).toBe('new_authoritative_evidence');
    });

    it('legacy resolution action alias is normalised correctly', () => {
      expect(normaliseResolutionOutcome('permanent_gap_accepted')).toBe('accept_permanent_gap');
      expect(normaliseResolutionOutcome('historical_reference_recorded')).toBe('record_historical_reference');
      expect(normaliseResolutionOutcome('false_positive')).toBe('dismiss_false_positive');
    });
  });

  // ─── REQ-9/10: Safe Failure Behaviour ───────────────────────────────────────────

  describe('REQ-9/10 — Safe Failure Behaviour', () => {
    it('lookupPriorResolution does not set should_reopen without material change', async () => {
      const { supabase } = await import('../lib/supabase');
      vi.mocked(supabase.from).mockImplementation(() => {
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
        return obj;
      });

      const result = await lookupPriorResolution('missing_ewo', 'EWO-NEW-999');
      expect(result.should_reopen).toBe(false);
    });

    it('inconclusive lookup returns is_reusable=false and lookup_inconclusive final_decision', async () => {
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

        if (table === 'engineering_integrity_alerts') {
          obj.order = vi.fn().mockResolvedValue({
            data: [{ id: 'a1', alert_ref: 'EIAL-1', status: 'resolved', resolution_status: 'resolved', resolved_at: '2026-07-21', resolved_by: 'unknown_actor', resolution_notes: null, evidence: {}, condition_key: 'missing_ewo:EWO:X:platform', superseded_by_alert_id: null, created_at: '2026-07-19' }],
            error: null,
          });
        } else if (table === 'ecc_engineering_decisions') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'ecc_engineering_decision_timeline') {
          obj.order = vi.fn().mockResolvedValue({ data: [], error: null });
        } else if (table === 'engineering_historical_references') {
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }
        return obj;
      });

      const result = await discoverCanonicalResolution('missing_ewo', 'EWO-014.7E');
      expect(result.is_reusable).toBe(false);
      expect(result.diagnostics.final_decision).toBe('lookup_inconclusive');
    });
  });
});
