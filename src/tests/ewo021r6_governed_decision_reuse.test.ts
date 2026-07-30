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
  lookupPriorResolution,
  checkHistoricalReferenceSatisfies,
  cleanupDuplicateAlerts,
  createReconciliationResultCounts,
  type EvidenceFingerprint,
} from '../lib/integritySuppressionService';

describe('EWO-021R.6 — Governed Integrity Decision Reuse & Intelligent Alert Suppression', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── REQ-1: Canonical Condition Identity ────────────────────────────────────────

  describe('REQ-1 — Canonical Integrity Condition Identity', () => {
    it('builds a deterministic condition key from alert type + reference + scope', () => {
      const key = buildConditionKey('missing_ewo', 'EWO-014.7E', 'ewo', 'platform');
      expect(key.condition_key).toBe('missing_ewo:EWO-014.7E:platform');
      expect(key.alert_type).toBe('missing_ewo');
      expect(key.normalised_reference).toBe('EWO-014.7E');
      expect(key.scope).toBe('platform');
    });

    it('produces the same key for the same inputs regardless of call order', () => {
      const k1 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      const k2 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      expect(k1.condition_key).toBe(k2.condition_key);
    });

    it('produces different keys for different alert types on the same reference', () => {
      const k1 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      const k2 = buildConditionKey('parent_child', 'EWO-014.7E');
      expect(k1.condition_key).not.toBe(k2.condition_key);
    });

    it('produces different keys for the same alert type on different references', () => {
      const k1 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      const k2 = buildConditionKey('missing_ewo', 'EWO-014.8');
      expect(k1.condition_key).not.toBe(k2.condition_key);
    });
  });

  // ─── REQ-6: Evidence Fingerprinting ─────────────────────────────────────────────

  describe('REQ-6 — Evidence Fingerprinting', () => {
    it('computes a deterministic fingerprint from evidence items', () => {
      const items = [
        { source_type: 'engineering_work_orders', field_value: 'EWO-014.7E', confidence: 1.0 },
        { source_type: 'ewo_completion_reports', field_value: 'EWO-014.7E', confidence: 0.8 },
      ];
      const fp1 = computeEvidenceFingerprint({}, items);
      const fp2 = computeEvidenceFingerprint({}, items);
      expect(fp1.hash).toBe(fp2.hash);
      expect(fp1.source_count).toBe(2);
      expect(fp1.evidence_count).toBe(2);
      expect(fp1.authoritative_count).toBe(1);
    });

    it('produces different fingerprints for different evidence', () => {
      const items1 = [
        { source_type: 'engineering_work_orders', field_value: 'EWO-014.7E', confidence: 1.0 },
      ];
      const items2 = [
        { source_type: 'engineering_work_orders', field_value: 'EWO-014.7E', confidence: 1.0 },
        { source_type: 'ewo_completion_reports', field_value: 'EWO-014.7E', confidence: 0.8 },
      ];
      const fp1 = computeEvidenceFingerprint({}, items1);
      const fp2 = computeEvidenceFingerprint({}, items2);
      expect(fp1.hash).not.toBe(fp2.hash);
    });

    it('produces the same fingerprint regardless of item order', () => {
      const items1 = [
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
        { source_type: 'b', field_value: 'y', confidence: 0.9 },
      ];
      const items2 = [
        { source_type: 'b', field_value: 'y', confidence: 0.9 },
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
      ];
      const fp1 = computeEvidenceFingerprint({}, items1);
      const fp2 = computeEvidenceFingerprint({}, items2);
      expect(fp1.hash).toBe(fp2.hash);
    });

    it('evidenceFingerprintChanged detects when fingerprints differ', () => {
      const fp1: EvidenceFingerprint = { hash: 'abc123', source_count: 2, evidence_count: 2, authoritative_count: 1, sources: ['a', 'b'] };
      const fp2: EvidenceFingerprint = { hash: 'def456', source_count: 3, evidence_count: 3, authoritative_count: 1, sources: ['a', 'b', 'c'] };
      expect(evidenceFingerprintChanged(fp1, fp2)).toBe(true);
    });

    it('evidenceFingerprintChanged returns false for identical fingerprints', () => {
      const fp1: EvidenceFingerprint = { hash: 'abc123', source_count: 2, evidence_count: 2, authoritative_count: 1, sources: ['a', 'b'] };
      const fp2: EvidenceFingerprint = { hash: 'abc123', source_count: 2, evidence_count: 2, authoritative_count: 1, sources: ['a', 'b'] };
      expect(evidenceFingerprintChanged(fp1, fp2)).toBe(false);
    });
  });

  // ─── REQ-5: Material Change Detection ───────────────────────────────────────────

  describe('REQ-5 — Material Change Detection', () => {
    it('detects new authoritative evidence as material change', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 1, evidence_count: 1, authoritative_count: 0, sources: ['a'] };
      const newItems = [
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
        { source_type: 'b', field_value: 'y', confidence: 1.0 },
      ];
      const result = detectMaterialChange(oldFp, {}, newItems);
      expect(result.has_material_change).toBe(true);
      expect(result.change_type).toBe('new_authoritative_evidence');
    });

    it('detects canonical object now exists as material change', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 1, evidence_count: 1, authoritative_count: 0, sources: ['a'] };
      const result = detectMaterialChange(oldFp, {}, undefined, true);
      expect(result.has_material_change).toBe(true);
      expect(result.change_type).toBe('canonical_object_now_exists');
    });

    it('does not detect non-material changes (same fingerprint)', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 1, evidence_count: 1, authoritative_count: 0, sources: ['a'] };
      const newItems = [
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
      ];
      const result = detectMaterialChange(oldFp, {}, newItems);
      expect(result.has_material_change).toBe(false);
      expect(result.change_type).toBe('none');
    });

    it('treats null old fingerprint as material change', () => {
      const result = detectMaterialChange(null, {}, undefined);
      expect(result.has_material_change).toBe(true);
      expect(result.change_type).toBe('new_authoritative_evidence');
    });

    it('detects new supporting evidence as material change', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 1, evidence_count: 1, authoritative_count: 0, sources: ['a'] };
      const newItems = [
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
        { source_type: 'b', field_value: 'y', confidence: 0.5 },
      ];
      const result = detectMaterialChange(oldFp, {}, newItems);
      expect(result.has_material_change).toBe(true);
      expect(['new_supporting_evidence', 'new_authoritative_evidence']).toContain(result.change_type);
    });

    it('detects evidence removal as material change', () => {
      const oldFp: EvidenceFingerprint = { hash: 'a1', source_count: 2, evidence_count: 2, authoritative_count: 0, sources: ['a', 'b'] };
      const newItems = [
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
      ];
      const result = detectMaterialChange(oldFp, {}, newItems);
      expect(result.has_material_change).toBe(true);
      expect(result.change_type).toBe('canonical_object_deleted');
    });
  });

  // ─── REQ-2: Pre-Creation Decision Lookup ─────────────────────────────────────────

  describe('REQ-2 — Pre-Creation Decision Lookup', () => {
    it('returns should_create_new=true when no existing alerts found', async () => {
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

      const result = await checkHistoricalReferenceSatisfies('EWO-014.7E');
      expect(result).toBe(true);
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

      const result = await checkHistoricalReferenceSatisfies('EWO-NONEXISTENT');
      expect(result).toBe(false);
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

      const result = await checkHistoricalReferenceSatisfies('EWO-014.7E');
      expect(result).toBe(false);
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
        obj.order = vi.fn().mockReturnValue(obj);
        obj.limit = vi.fn().mockReturnValue(obj);
        obj.maybeSingle = vi.fn().mockResolvedValue({
          data: [{ id: 'alert-1', alert_ref: 'EIAL-1', alert_type: 'missing_ewo', normalised_reference: 'EWO-014.7E', resolution_status: 'resolved', status: 'resolved' }],
          error: null,
        });
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
        obj.select = vi.fn().mockReturnValue(obj);
        obj.insert = vi.fn().mockReturnValue(obj);
        obj.update = vi.fn().mockReturnValue(obj);
        return obj;
      });

      const result = await cleanupDuplicateAlerts('missing_ewo', 'EWO-014.7E');
      expect(result.duplicates_superseded).toBe(0);
      expect(result.duplicate_alert_ids).toEqual([]);
    });
  });

  // ─── Product Owner Testing ──────────────────────────────────────────────────────

  describe('Product Owner Testing', () => {
    it('PO-TEST-1 — Condition key is deterministic for EWO-014.7E', () => {
      const key = buildConditionKey('missing_ewo', 'EWO-014.7E', 'ewo', 'platform');
      expect(key.condition_key).toBe('missing_ewo:EWO-014.7E:platform');
    });

    it('PO-TEST-5 — Same evidence with different ordering produces same fingerprint', () => {
      const items1 = [
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
        { source_type: 'b', field_value: 'y', confidence: 0.9 },
      ];
      const items2 = [
        { source_type: 'b', field_value: 'y', confidence: 0.9 },
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
      ];
      const fp1 = computeEvidenceFingerprint({}, items1);
      const fp2 = computeEvidenceFingerprint({}, items2);
      expect(fp1.hash).toBe(fp2.hash);
    });

    it('PO-TEST-5 — Same fingerprint does not trigger material change', () => {
      const oldFp = computeEvidenceFingerprint({}, [
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
      ]);
      const result = detectMaterialChange(oldFp, {}, [
        { source_type: 'a', field_value: 'x', confidence: 0.5 },
      ]);
      expect(result.has_material_change).toBe(false);
    });

    it('PO-TEST-6 — Historical Reference with governed status satisfies condition', async () => {
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
      const satisfied = await checkHistoricalReferenceSatisfies('EWO-014.7E');
      expect(satisfied).toBe(true);
    });

    it('PO-TEST-9 — Condition key is deterministic and consistent', () => {
      const key1 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      const key2 = buildConditionKey('missing_ewo', 'EWO-014.7E');
      expect(key1.condition_key).toBe(key2.condition_key);
    });
  });

  // ─── REQ-17: No Regression ──────────────────────────────────────────────────────

  describe('REQ-17 — No Regression', () => {
    it('does not regress evidence fingerprint computation', () => {
      const items = [
        { source_type: 'engineering_work_orders', field_value: 'EWO-014.7E', confidence: 1.0 },
      ];
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
  });
});
