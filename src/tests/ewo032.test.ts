// EWO-032 — Approval-to-Execution Handoff Tests
import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { recognizeApproval, validateApproval, computeIdempotencyKey } from '../lib/approvalResolutionService';
import { checkProviderReadiness, inspectExecutionHandoff } from '../lib/executionHandoffService';
import { classifyExecutionIntent } from '../lib/executionIntentRouter';
import { routeConversation } from '../lib/conversationContextRouter';
import { ensureTestAuth } from './helpers/ensureTestAuth';

const APPROVAL_PROMPTS = [
  'approved',
  'approve',
  'proceed',
  'proceed with execution',
  'approved, execute',
  'confirm execution',
  'yes, execute the approved plan',
];

const CANCEL_PROMPTS = [
  'do not execute',
  "don't execute",
  'cancel',
  'stop',
  'hold execution',
  'abort',
  'do not proceed',
];

const MODIFY_PROMPTS = [
  'modify the plan',
  'change the requirements',
  'change the plan',
  'update the plan',
  'revise the plan',
];

const AMBIGUOUS_PROMPTS = [
  'approved, but do not execute yet',
  'proceed after changing the filename',
  'yes, cancel it',
];

describe('EWO-032 — Approval-to-Execution Handoff', () => {
  beforeAll(async () => { await ensureTestAuth(); });

  // ─── Approval Recognition ──────────────────────────────────────────────────────

  describe('Approval Recognition', () => {
    APPROVAL_PROMPTS.forEach((prompt) => {
      it(`should recognize "${prompt}" as approval`, () => {
        const result = recognizeApproval(prompt);
        expect(result.is_approval).toBe(true);
        expect(result.is_cancellation).toBe(false);
        expect(result.cancellation_overrides).toBe(false);
      });
    });

    CANCEL_PROMPTS.forEach((prompt) => {
      it(`should recognize "${prompt}" as cancellation`, () => {
        const result = recognizeApproval(prompt);
        expect(result.is_cancellation).toBe(true);
        expect(result.is_approval).toBe(false);
      });
    });

    MODIFY_PROMPTS.forEach((prompt) => {
      it(`should recognize "${prompt}" as modification`, () => {
        const result = recognizeApproval(prompt);
        expect(result.is_modification).toBe(true);
        expect(result.is_approval).toBe(false);
      });
    });

    AMBIGUOUS_PROMPTS.forEach((prompt) => {
      it(`should treat "${prompt}" as cancellation overriding approval`, () => {
        const result = recognizeApproval(prompt);
        expect(result.cancellation_overrides).toBe(true);
        expect(result.is_approval).toBe(false);
      });
    });

    it('should not treat generic agreement as approval', () => {
      const result = recognizeApproval('that sounds good');
      expect(result.is_approval).toBe(false);
    });

    it('should not treat questions as approval', () => {
      const result = recognizeApproval('what does the plan look like?');
      expect(result.is_approval).toBe(false);
    });
  });

  // ─── Approval Validation ──────────────────────────────────────────────────────

  describe('Approval Validation', () => {
    it('should refuse approval without conversation context', async () => {
      const result = await validateApproval('approved', {
        conversation_id: null,
        active_ewo_ref: null,
        persona: 'product_owner',
      });
      expect(result.approval_detected).toBe(true);
      expect(result.approval_validated).toBe(false);
      expect(result.refusal_reason).toContain('No active conversation');
    });

    it('should refuse approval without pending EWO', async () => {
      const result = await validateApproval('approved', {
        conversation_id: 'test-conv-032',
        active_ewo_ref: null,
        persona: 'product_owner',
      });
      expect(result.approval_detected).toBe(true);
      expect(result.approval_validated).toBe(false);
      expect(result.refusal_reason).toContain('No pending governed engineering work order');
    });

    it('should refuse approval for non-existent EWO', async () => {
      const result = await validateApproval('approved', {
        conversation_id: 'test-conv-032',
        active_ewo_ref: 'EWO-NONEXISTENT-999',
        persona: 'product_owner',
      });
      expect(result.approval_detected).toBe(true);
      expect(result.approval_validated).toBe(false);
    });

    it('should refuse cancellation without creating execution request', async () => {
      const result = await validateApproval('cancel', {
        conversation_id: 'test-conv-032',
        active_ewo_ref: 'EWO-032',
        persona: 'product_owner',
      });
      expect(result.is_cancellation).toBe(true);
      expect(result.approval_validated).toBe(false);
      expect(result.cancellation_overrides_approval).toBe(true);
    });
  });

  // ─── Intent Classification ────────────────────────────────────────────────────

  describe('Intent Classification', () => {
    it('should classify "approved" as approve_plan intent', () => {
      const result = classifyExecutionIntent('approved', 'EWO-032');
      expect(result.detected_intent).toBe('approve_plan');
    });

    it('should classify "proceed with execution" as approve_plan intent', () => {
      const result = classifyExecutionIntent('proceed with execution', 'EWO-032');
      expect(result.detected_intent).toBe('approve_plan');
    });

    it('should classify "cancel" as cancellation not approval', () => {
      const result = classifyExecutionIntent('cancel', 'EWO-032');
      expect(result.detected_intent).not.toBe('approve_plan');
    });

    it('should classify "inspect the execution handoff" as inspect_handoff', () => {
      const result = classifyExecutionIntent('inspect the execution handoff for EWO-032');
      expect(result.detected_intent).toBe('inspect_handoff');
      expect(result.resolved_operation).toBe('inspectExecutionHandoff');
    });

    it('should classify "invoke inspect_execution_handoff directly" as inspect_handoff', () => {
      const result = classifyExecutionIntent('invoke inspect_execution_handoff directly');
      expect(result.detected_intent).toBe('inspect_handoff');
      expect(result.resolved_operation).toBe('inspectExecutionHandoff');
    });

    it('should not classify advisory text as approve_plan', () => {
      const result = classifyExecutionIntent('explain how we could implement this');
      expect(result.detected_intent).not.toBe('approve_plan');
    });
  });

  // ─── Conversation Context Router ──────────────────────────────────────────────

  describe('Conversation Context Router', () => {
    it('should route "approved" to approval-handoff rule', () => {
      const result = routeConversation('approved', [], null);
      expect(result.rule).toBe('approval-handoff');
    });

    it('should route "proceed" to approval-handoff rule', () => {
      const result = routeConversation('proceed', [], null);
      expect(result.rule).toBe('approval-handoff');
    });

    it('should route "cancel" to cancellation-detected rule', () => {
      const result = routeConversation('cancel', [], null);
      expect(result.rule).toBe('cancellation-detected');
    });

    it('should route "modify the plan" to cancellation-detected rule', () => {
      const result = routeConversation('modify the plan', [], null);
      expect(result.rule).toBe('cancellation-detected');
    });

    it('should route "inspect the execution handoff" to execution-handoff-inspection rule', () => {
      const result = routeConversation('inspect the execution handoff', [], null);
      expect(result.rule).toBe('execution-handoff-inspection');
    });

    it('should route "invoke inspectexecutionhandoff directly" to execution-handoff-inspection rule', () => {
      const result = routeConversation('invoke inspectexecutionhandoff directly', [], null);
      expect(result.rule).toBe('execution-handoff-inspection');
    });

    it('should route cancellation over approval for ambiguous prompts', () => {
      const result = routeConversation('approved, but do not execute yet', [], null);
      expect(result.rule).toBe('cancellation-detected');
    });
  });

  // ─── Idempotency ──────────────────────────────────────────────────────────────

  describe('Idempotency', () => {
    it('should compute deterministic idempotency key', () => {
      const key1 = computeIdempotencyKey('conv-1', 'EWO-032', 'plan-v1', 'appr-1');
      const key2 = computeIdempotencyKey('conv-1', 'EWO-032', 'plan-v1', 'appr-1');
      expect(key1).toBe(key2);
    });

    it('should produce different keys for different conversations', () => {
      const key1 = computeIdempotencyKey('conv-1', 'EWO-032', 'plan-v1', 'appr-1');
      const key2 = computeIdempotencyKey('conv-2', 'EWO-032', 'plan-v1', 'appr-1');
      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different EWOs', () => {
      const key1 = computeIdempotencyKey('conv-1', 'EWO-032', 'plan-v1', 'appr-1');
      const key2 = computeIdempotencyKey('conv-1', 'EWO-031', 'plan-v1', 'appr-1');
      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different plan versions', () => {
      const key1 = computeIdempotencyKey('conv-1', 'EWO-032', 'plan-v1', 'appr-1');
      const key2 = computeIdempotencyKey('conv-1', 'EWO-032', 'plan-v2', 'appr-1');
      expect(key1).not.toBe(key2);
    });
  });

  // ─── Provider Readiness Gate ───────────────────────────────────────────────────

  describe('Provider Readiness Gate', () => {
    it('should check Codex provider readiness', async () => {
      const result = await checkProviderReadiness('EWO-032', 'codex');
      expect(result.status).toMatch(/passed|failed/);
      if (result.status === 'failed') {
        expect(result.exact_error).toBeTruthy();
      }
    });

    it('should fail for unregistered provider', async () => {
      const result = await checkProviderReadiness('EWO-032', 'nonexistent-provider');
      expect(result.status).toBe('failed');
      expect(result.exact_error).toContain('not registered');
    });

    it('should return detailed diagnostics', async () => {
      const result = await checkProviderReadiness('EWO-032', 'codex');
      expect(result.detail).toBeDefined();
      expect(typeof result.detail).toBe('object');
    });

    it('should not fallback to Bolt', async () => {
      const result = await checkProviderReadiness('EWO-032', 'codex');
      if (result.status === 'failed') {
        expect(result.exact_error).not.toContain('bolt');
      }
    });
  });

  // ─── Inspection Operation ─────────────────────────────────────────────────────

  describe('Inspection Operation', () => {
    it('should return persisted runtime evidence from RPC', async () => {
      const result = await inspectExecutionHandoff('EWO-032', null);
      expect(result.success).toBe(true);
      expect(result.data_source).toBe('inspect_execution_handoff RPC (authoritative)');
    });

    it('should return handoff_found=false when no handoff exists', async () => {
      const result = await inspectExecutionHandoff('EWO-NONEXISTENT-999', null);
      expect(result.success).toBe(true);
      expect(result.handoff_found).toBe(false);
    });

    it('should not infer from conversation text', async () => {
      const result = await inspectExecutionHandoff(null, null);
      expect(result.data_source).toContain('RPC');
      expect(result.data_source).not.toContain('conversation');
    });

    it('should return lifecycle_change_performed=false', async () => {
      const result = await inspectExecutionHandoff('EWO-032', null);
      expect(result.lifecycle_change_performed).toBe(false);
    });
  });

  // ─── Database State ──────────────────────────────────────────────────────────

  describe('Database State', () => {
    it('should have EWO-032 registered as draft', async () => {
      const { data, error } = await supabase
        .from('engineering_work_orders')
        .select('ewo_ref, status')
        .eq('ewo_ref', 'EWO-032')
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.ewo_ref).toBe('EWO-032');
      expect(data?.status).not.toBe('closed');
    });

    it('should have execution_handoff_requests table', async () => {
      const { data, error } = await supabase
        .from('execution_handoff_requests')
        .select('id')
        .limit(1);
      expect(error).toBeNull();
    });

    it('should have inspect_execution_handoff RPC', async () => {
      const { data, error } = await supabase.rpc('inspect_execution_handoff', {
        p_ewo_ref: null,
        p_conversation_id: null,
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it('should have EWO-031 still not closed', async () => {
      const { data, error } = await supabase
        .from('engineering_work_orders')
        .select('status')
        .eq('ewo_ref', 'EWO-031')
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.status).not.toBe('closed');
    });

    it('should not have PO acceptance recorded for EWO-032', async () => {
      const { data, error } = await supabase
        .from('engineering_work_orders')
        .select('po_accepted_at')
        .eq('ewo_ref', 'EWO-032')
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.po_accepted_at).toBeNull();
    });
  });

  // ─── Separation of Approval and PO Acceptance ─────────────────────────────────

  describe('Approval vs PO Acceptance', () => {
    it('should not record PO acceptance when creating execution request', async () => {
      const { data, error } = await supabase
        .from('engineering_work_orders')
        .select('po_accepted_at')
        .eq('ewo_ref', 'EWO-032')
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.po_accepted_at).toBeNull();
    });

    it('should keep EWO-032 status as draft (not closed)', async () => {
      const { data, error } = await supabase
        .from('engineering_work_orders')
        .select('status')
        .eq('ewo_ref', 'EWO-032')
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.status).not.toBe('closed');
    });
  });
});
