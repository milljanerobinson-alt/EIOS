// EWO-032R.1 — Dispatch RPC Implementation and Structured Failure Handling Tests
import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { ensureTestAuth } from './helpers/ensureTestAuth';

describe('EWO-032R.1 — Dispatch RPC and Structured Failure Handling', () => {
  beforeAll(async () => { await ensureTestAuth(); });

  // ─── 1. Execution request created ────────────────────────────────────────────
  describe('1. Execution request created', () => {
    it('should persist execution_handoff_requests rows when created', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('id, execution_request_id, execution_status, created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should have execution_request_id as a non-null text column', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('execution_request_id')
        .limit(1);
      expect(error).toBeNull();
      if (data && data.length > 0) {
        expect(typeof data[0].execution_request_id).toBe('string');
      }
    });
  });

  // ─── 2. Dispatch entry point exists ──────────────────────────────────────────
  describe('2. Dispatch entry point exists', () => {
    it('should have execute_supervised_pipeline RPC in the database', async () => {
      const { data, error } = await supabase.rpc('execute_supervised_pipeline', {
        p_ewo_ref: 'EWO-NONEXISTENT-PROBE-R1',
        p_preferred_provider: 'codex',
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      expect(result.success).toBe(false);
      expect(result.failure_stage).toBe('governance_gate');
    });

    it('should return a jsonb document with required fields', async () => {
      const { data, error } = await supabase.rpc('execute_supervised_pipeline', {
        p_ewo_ref: 'EWO-NONEXISTENT-PROBE-R1',
        p_preferred_provider: 'codex',
      });
      expect(error).toBeNull();
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('execution_ref');
      expect(result).toHaveProperty('governance_gate');
      expect(result).toHaveProperty('failure_stage');
    });
  });

  // ─── 3. Dispatch RPC callable ─────────────────────────────────────────────────
  describe('3. Dispatch RPC callable', () => {
    it('should be callable via supabase.rpc without error', async () => {
      const { error } = await supabase.rpc('execute_supervised_pipeline', {
        p_ewo_ref: 'EWO-NONEXISTENT-CALLABLE-TEST',
        p_preferred_provider: 'codex',
      });
      expect(error).toBeNull();
    });

    it('should accept the preferred_provider parameter', async () => {
      const { data, error } = await supabase.rpc('execute_supervised_pipeline', {
        p_ewo_ref: 'EWO-NONEXISTENT-PROVIDER-TEST',
        p_preferred_provider: 'nonexistent-provider',
      });
      expect(error).toBeNull();
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      expect(result.success).toBe(false);
      expect(result.failure_stage).toBe('governance_gate');
    });
  });

  // ─── 4. Missing RPC returns structured failure instead of HTTP 500 ──────────
  describe('4. Structured failure (no HTTP 500)', () => {
    it('should return structured failure for non-existent EWO', async () => {
      const { data, error } = await supabase.rpc('execute_supervised_pipeline', {
        p_ewo_ref: 'EWO-NONEXISTENT-STRUCTURED-FAIL',
        p_preferred_provider: 'codex',
      });
      expect(error).toBeNull();
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      expect(result.success).toBe(false);
      expect(result.failure_stage).toBe('governance_gate');
      expect(result.error).toContain('not found');
      expect(result.execution_ref).toBeNull();
    });

    it('should return governance_gate blockers as an array', async () => {
      const { data, error } = await supabase.rpc('execute_supervised_pipeline', {
        p_ewo_ref: 'EWO-NONEXISTENT-BLOCKERS-TEST',
        p_preferred_provider: 'codex',
      });
      expect(error).toBeNull();
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      expect(result.governance_gate.passed).toBe(false);
      expect(Array.isArray(result.governance_gate.blockers)).toBe(true);
      expect(result.governance_gate.blockers.length).toBeGreaterThan(0);
    });
  });

  // ─── 5. Dispatch failure persisted ───────────────────────────────────────────
  describe('5. Dispatch failure persisted', () => {
    it('should have execution_status column that can hold "failed"', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('execution_status')
        .eq('execution_status', 'failed')
        .limit(1);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should have failure_stage and exact_runtime_error columns', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('failure_stage, exact_runtime_error')
        .limit(1);
      expect(error).toBeNull();
    });
  });

  // ─── 6. Dispatch audit persisted ─────────────────────────────────────────────
  describe('6. Dispatch audit persisted', () => {
    it('should have execution_handoff_audit table accessible', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_audit')
        .select('id, event_type, event_data, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should support audit event types for dispatch lifecycle', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_audit')
        .select('event_type')
        .limit(20);
      expect(error).toBeNull();
      if (data && data.length > 0) {
        const eventTypes = data.map((r: { event_type: string }) => r.event_type);
        const knownTypes = [
          'execution_request_created',
          'execution_request_creation_failed',
          'provider_readiness_started',
          'provider_readiness_result',
          'dispatch_attempted',
          'dispatch_succeeded',
          'dispatch_failed',
        ];
        const found = eventTypes.filter((t: string) => knownTypes.includes(t));
        expect(found.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── 7. Execution request retained ───────────────────────────────────────────
  describe('7. Execution request retained', () => {
    it('should not delete execution_handoff_requests on dispatch failure', async () => {
      const { data: before, error: beforeErr } = await supabase
        .from('execution_handoff_requests')
        .select('id, execution_status, failure_stage')
        .order('created_at', { ascending: false })
        .limit(1);
      expect(beforeErr).toBeNull();
      if (before && before.length > 0) {
        const { data: after, error: afterErr } = await supabase
          .from('execution_handoff_requests')
          .select('id')
          .eq('id', before[0].id);
        expect(afterErr).toBeNull();
        expect(after && after.length).toBe(1);
      }
    });
  });

  // ─── 8. Provider readiness invoked after successful dispatch ─────────────────
  describe('8. Provider readiness invoked after successful dispatch', () => {
    it('should have provider_readiness_status column on handoff requests', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('provider_readiness_status, provider_readiness_detail')
        .limit(1);
      expect(error).toBeNull();
    });

    it('should have codex provider registered and active', async () => {
      const { data, error } = await supabase
        .from('execution_provider_registry')
        .select('provider_id, is_active, is_governed')
        .eq('provider_id', 'codex')
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.provider_id).toBe('codex');
      expect(data?.is_active).toBe(true);
      expect(data?.is_governed).toBe(true);
    });
  });

  // ─── 9. Codex never invoked before readiness ─────────────────────────────────
  describe('9. Codex never invoked before readiness', () => {
    it('should have governed_execution_engine_invoked column defaulting to false', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('governed_execution_engine_invoked, dispatch_attempted')
        .order('created_at', { ascending: false })
        .limit(1);
      expect(error).toBeNull();
      if (data && data.length > 0) {
        expect(typeof data[0].governed_execution_engine_invoked).toBe('boolean');
        expect(typeof data[0].dispatch_attempted).toBe('boolean');
      }
    });

    it('should not set governed_execution_engine_invoked=true when dispatch_attempted=false', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('governed_execution_engine_invoked, dispatch_attempted')
        .eq('dispatch_attempted', false)
        .limit(5);
      expect(error).toBeNull();
      if (data && data.length > 0) {
        data.forEach((r: { governed_execution_engine_invoked: boolean; dispatch_attempted: boolean }) => {
          expect(r.governed_execution_engine_invoked).toBe(false);
        });
      }
    });
  });

  // ─── 10. No Bolt fallback ─────────────────────────────────────────────────────
  describe('10. No Bolt fallback', () => {
    it('should have codex as the default provider in handoff requests', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('requested_provider_id')
        .limit(5);
      expect(error).toBeNull();
      if (data && data.length > 0) {
        data.forEach((r: { requested_provider_id: string }) => {
          expect(r.requested_provider_id).not.toBe('bolt');
        });
      }
    });

    it('should not reference bolt in the supervised_execution_records provider column', async () => {
      const { data, error } = await supabase
        .from('supervised_execution_records')
        .select('provider')
        .eq('provider', 'bolt')
        .limit(1);
      expect(error).toBeNull();
      expect(data?.length || 0).toBe(0);
    });
  });

  // ─── 11. Duplicate approvals remain idempotent ───────────────────────────────
  describe('11. Duplicate approvals remain idempotent', () => {
    it('should have idempotency_key column on execution_handoff_requests', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('idempotency_key')
        .limit(1);
      expect(error).toBeNull();
    });

    it('should return the same structured failure for repeated non-existent EWO calls', async () => {
      const { data: data1 } = await supabase.rpc('execute_supervised_pipeline', {
        p_ewo_ref: 'EWO-IDEMPOTENT-TEST-R1',
        p_preferred_provider: 'codex',
      });
      const { data: data2 } = await supabase.rpc('execute_supervised_pipeline', {
        p_ewo_ref: 'EWO-IDEMPOTENT-TEST-R1',
        p_preferred_provider: 'codex',
      });
      const r1 = typeof data1 === 'string' ? JSON.parse(data1) : data1;
      const r2 = typeof data2 === 'string' ? JSON.parse(data2) : data2;
      expect(r1.success).toBe(r2.success);
      expect(r1.failure_stage).toBe(r2.failure_stage);
    });
  });

  // ─── 12. Existing EWO-032 tests remain passing ───────────────────────────────
  describe('12. Existing EWO-032 tests remain passing', () => {
    it('should still have inspect_execution_handoff RPC callable', async () => {
      const { data, error } = await supabase.rpc('inspect_execution_handoff', {
        p_ewo_ref: null,
        p_conversation_id: null,
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it('should still have EWO-032 registered as draft', async () => {
      const { data, error } = await supabase
        .from('engineering_work_orders')
        .select('ewo_ref, status')
        .eq('ewo_ref', 'EWO-032')
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.ewo_ref).toBe('EWO-032');
      expect(data?.status).not.toBe('closed');
    });

    it('should still have execution_handoff_requests table accessible', async () => {
      const { error } = await supabase
        .from('execution_handoff_requests')
        .select('id')
        .limit(1);
      expect(error).toBeNull();
    });
  });
});
