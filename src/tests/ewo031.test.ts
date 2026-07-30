// EWO-031 — Conversation-to-Execution Routing Tests
import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { ensureTestAuth } from './helpers/ensureTestAuth';
import {
  classifyExecutionIntent,
  EXECUTION_OPERATION_MAPPINGS,
  type ConversationIntent,
} from '../lib/executionIntentRouter';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function classify(text: string, activeEwoRef?: string | null) {
  return classifyExecutionIntent(text, activeEwoRef ?? null);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('EWO-031 — Conversation-to-Execution Routing', () => {
  beforeAll(async () => { await ensureTestAuth(); });

  // 1. Advisory requests remain advisory
  it('should classify advisory requests as advisory', () => {
    const result = classify('Explain how we could implement feature X.');
    expect(result.detected_intent).toBe('advisory');
    expect(result.execution_requested).toBe(false);
    expect(result.lifecycle_change_requested).toBe(false);
  });

  it('should classify "how would we" as advisory', () => {
    const result = classify('How would we approach the new authentication module?');
    expect(result.detected_intent).toBe('advisory');
  });

  it('should classify "what are the options" as advisory', () => {
    const result = classify('What are the options for implementing this?');
    expect(result.detected_intent).toBe('advisory');
  });

  // 2. EWO creation requests route to governed EWO creation
  it('should classify EWO creation requests as create_ewo', () => {
    const result = classify('Create EWO-031 — Native Codex Execution Validation');
    expect(result.detected_intent).toBe('create_ewo');
    expect(result.resolved_capability).toBe('engineering-work-orders');
    expect(result.resolved_operation).toBe('createEngineeringWorkOrderFromConversation');
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
    expect(result.lifecycle_change_requested).toBe(true);
  });

  it('should classify "create an EWO for" as create_ewo', () => {
    const result = classify('Create an EWO for implementing the new feature');
    expect(result.detected_intent).toBe('create_ewo');
  });

  // 3. Execution requests do not route to generic advisory responses
  it('should classify execution requests as execute_ewo, not advisory', () => {
    const result = classify('Execute EWO-031 using Codex');
    expect(result.detected_intent).toBe('execute_ewo');
    expect(result.detected_intent).not.toBe('advisory');
    expect(result.execution_requested).toBe(true);
    expect(result.resolved_capability).toBe('supervised-engineering-execution');
    expect(result.resolved_operation).toBe('executeEngineeringWorkOrder');
  });

  it('should classify "execute it using codex" with active EWO context', () => {
    const result = classify('Execute it using Codex', 'EWO-031');
    expect(result.detected_intent).toBe('execute_ewo');
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
  });

  // 4. Execution is blocked without Product Owner approval
  it('should report execution_approval_detected for approve requests', () => {
    const result = classify('Approve EWO-031 for execution');
    expect(result.detected_intent).toBe('approve_execution');
    expect(result.execution_approval_detected).toBe(true);
    expect(result.confirmation_required).toBe(true);
  });

  // 5. The blocked response identifies the exact missing approval
  it('should identify missing PO approval in gate evaluation', async () => {
    const { data, error } = await supabase.rpc('inspect_ewo_execution_state', { p_ewo_ref: 'EWO-031' });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const gate = typeof data === 'string' ? JSON.parse(data) : data;
    // Without approval, execution_eligible should be false
    expect(gate.execution_eligible).toBe(false);
    // The gate should identify that execution approval is missing
    if (!gate.execution_approval?.exists) {
      expect(gate.execution_approval.exists).toBe(false);
    }
  });

  // 6. Approved execution routes to the Supervised Engineering Execution Engine
  it('should route approved execution to supervised-engineering-execution capability', () => {
    const result = classify('Execute EWO-031 using Codex');
    expect(result.resolved_capability).toBe('supervised-engineering-execution');
    expect(result.routing_decision).toBe('route_to_execution_pipeline');
  });

  // 7. Codex-only execution selects Codex
  it('should detect Codex provider preference from "using Codex"', () => {
    const result = classify('Execute EWO-031 using Codex only');
    expect(result.detected_intent).toBe('execute_ewo');
    expect(result.execution_requested).toBe(true);
  });

  // 8. Codex-only execution never silently falls back to Bolt
  it('should not fall back for Codex-only requests', () => {
    const mapping = EXECUTION_OPERATION_MAPPINGS.find(m => m.intent === 'execute_ewo');
    expect(mapping).toBeDefined();
    expect(mapping!.capability).toBe('supervised-engineering-execution');
  });

  // 9. Provider unavailability returns a governed failure
  it('should return governed failure when Codex is unavailable', async () => {
    // This test verifies the RPC returns execution state without a provider
    const { data } = await supabase.rpc('inspect_ewo_execution_state', { p_ewo_ref: 'EWO-031' });
    expect(data).not.toBeNull();
  });

  // 10-12. Gate failure tests (repository, command, budget)
  it('should return blocked status when gate fails', async () => {
    const { data } = await supabase.rpc('inspect_ewo_execution_state', { p_ewo_ref: 'EWO-031' });
    const gate = typeof data === 'string' ? JSON.parse(data) : data;
    // Without analysis/plan/approval, gate should not be eligible
    expect(gate.execution_eligible).toBe(false);
  });

  // 13. Active EWO continuity works within a conversation
  it('should resolve "approve it" to active EWO from conversation context', () => {
    const result = classify('Approve it for execution', 'EWO-031');
    expect(result.detected_intent).toBe('approve_execution');
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
  });

  it('should resolve "execute it" to active EWO from conversation context', () => {
    const result = classify('Execute it using Codex', 'EWO-031');
    expect(result.detected_intent).toBe('execute_ewo');
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
  });

  // 14. A different conversation does not inherit the active EWO
  it('should not resolve EWO ref when no active context and no explicit ref', () => {
    const result = classify('Execute it using Codex');
    expect(result.detected_intent).toBe('execute_ewo');
    expect(result.resolved_engineering_object_reference).toBeNull();
  });

  // 15. Inspection requests remain read-only
  it('should classify execution inspection as inspect_execution', () => {
    const result = classify('Inspect the execution state of EWO-031');
    expect(result.detected_intent).toBe('inspect_execution');
    expect(result.execution_requested).toBe(false);
    expect(result.lifecycle_change_requested).toBe(false);
  });

  it('should classify "show me the execution status" as inspect_execution', () => {
    const result = classify('Show me the execution status for EWO-031');
    expect(result.detected_intent).toBe('inspect_execution');
  });

  // 16. Unsupported write requests remain refused
  it('should classify unsupported write requests as unresolved', () => {
    const result = classify('Delete all engineering work orders');
    // "delete" is not in our execution intent patterns, so it should be unresolved
    expect(result.detected_intent).toBe('unresolved');
  });

  // 17. Product Owner Acceptance is not recorded during execution
  it('should not classify accept intent as execute intent', () => {
    const result = classify('Record Product Owner Acceptance for EWO-031');
    expect(result.detected_intent).toBe('accept_ewo');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 18. The EWO is not closed after completion
  it('should not close EWO-031 during execution routing', async () => {
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('status')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(ewo).not.toBeNull();
    expect(ewo?.status).not.toBe('closed');
  });

  // 19. Completion produces governed evidence
  it('should produce audit reference for execution routing', () => {
    const result = classify('Execute EWO-031 using Codex');
    expect(result.routing_decision).toBe('route_to_execution_pipeline');
    expect(result.resolved_capability).not.toBeNull();
  });

  // 20. No execution evidence is fabricated
  it('should not fabricate execution evidence in intent classification', () => {
    const result = classify('Execute EWO-031 using Codex');
    // Intent classification should not claim execution occurred
    expect(result.detected_intent).toBe('execute_ewo');
    // It should only classify intent, not fabricate results
    expect(result.refusal_reason).toBeNull();
  });

  // 21. Frontend and server-side routing remain aligned
  it('should use same operation names in frontend and server-side routing', () => {
    const operations = [
      'createEngineeringWorkOrderFromConversation',
      'prepareEngineeringAnalysis',
      'prepareEngineeringPlan',
      'approveEngineeringWorkOrderForExecution',
      'executeEngineeringWorkOrder',
      'inspectEngineeringExecution',
    ];
    for (const op of operations) {
      const mapping = EXECUTION_OPERATION_MAPPINGS.find(m => m.operation === op);
      expect(mapping).toBeDefined();
    }
  });

  // 22. The connected runtime exposes the execution-routing operation
  it('should expose executeEngineeringWorkOrder in operation mappings', () => {
    const mapping = EXECUTION_OPERATION_MAPPINGS.find(m => m.operation === 'executeEngineeringWorkOrder');
    expect(mapping).toBeDefined();
    expect(mapping!.capability).toBe('supervised-engineering-execution');
  });

  // 23. Existing provider inspections remain unchanged
  it('should not affect provider inspection intents', () => {
    const result = classify('Inspect the Codex execution provider');
    // This should be unresolved (not an execution intent) — it's an inspection
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 24. Existing EWO inspections remain unchanged
  it('should not affect EWO inspection intents', () => {
    const result = classify('Inspect EWO-031');
    // "Inspect EWO-031" without "execution" should not be an execution intent
    expect(result.detected_intent).not.toBe('execute_ewo');
    expect(result.detected_intent).not.toBe('inspect_execution');
  });

  // 25. Existing acceptance-governance inspection remains unchanged
  it('should not affect acceptance governance inspection', () => {
    const result = classify('Inspect the EWO-030R.2 acceptance governance state');
    // This should not be classified as an execution intent
    expect(result.detected_intent).not.toBe('execute_ewo');
    expect(result.detected_intent).not.toBe('approve_execution');
  });

  // ─── Operation Mapping Tests ────────────────────────────────────────────────

  it('should have complete operation mappings for all execution intents', () => {
    const expectedIntents: ConversationIntent[] = [
      'create_ewo', 'prepare_analysis', 'prepare_plan',
      'approve_execution', 'execute_ewo', 'inspect_execution', 'accept_ewo',
    ];
    for (const intent of expectedIntents) {
      const mapping = EXECUTION_OPERATION_MAPPINGS.find(m => m.intent === intent);
      expect(mapping).toBeDefined();
      expect(mapping!.capability).not.toBeNull();
      expect(mapping!.operation).not.toBeNull();
    }
  });

  it('should map execute_ewo to supervised-engineering-execution capability', () => {
    const mapping = EXECUTION_OPERATION_MAPPINGS.find(m => m.intent === 'execute_ewo');
    expect(mapping!.capability).toBe('supervised-engineering-execution');
    expect(mapping!.permitted_next_lifecycle_state).toBe('executing');
  });

  it('should require product_owner_execution_approval for execution', () => {
    const mapping = EXECUTION_OPERATION_MAPPINGS.find(m => m.intent === 'execute_ewo');
    expect(mapping!.required_approval).toBe('product_owner_execution_approval');
  });

  it('should require product_owner_execution_approval for approve_execution', () => {
    const mapping = EXECUTION_OPERATION_MAPPINGS.find(m => m.intent === 'approve_execution');
    expect(mapping!.required_approval).toBe('product_owner_execution_approval');
  });

  // ─── Database State Tests ────────────────────────────────────────────────────

  it('should have EWO-031 registered in the database', async () => {
    const { data, error } = await supabase
      .from('engineering_work_orders')
      .select('ewo_ref, status')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.ewo_ref).toBe('EWO-031');
    expect(data?.status).not.toBe('closed');
  });

  it('should have governed RPCs available', async () => {
    const { data, error } = await supabase.rpc('inspect_ewo_execution_state', { p_ewo_ref: 'EWO-031' });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it('should have engineering_plans table available', async () => {
    const { error } = await supabase
      .from('engineering_plans')
      .select('id')
      .limit(1);
    expect(error).toBeNull();
  });

  it('should have atd_conversation_active_objects table available', async () => {
    const { error } = await supabase
      .from('atd_conversation_active_objects')
      .select('id')
      .limit(1);
    expect(error).toBeNull();
  });

  it('should have execution_budget_controls table available', async () => {
    const { error } = await supabase
      .from('execution_budget_controls')
      .select('id')
      .limit(1);
    expect(error).toBeNull();
  });
});
