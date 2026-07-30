// EWO-031R.3 — Provider Policy Inspection Intent Classification Correction
import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { ensureTestAuth } from './helpers/ensureTestAuth';
import { classifyExecutionIntent } from '../lib/executionIntentRouter';
import { interpretRequest } from '../lib/atdConnect/conversationBridge';
import { routeConversation } from '../lib/conversationContextRouter';
import { detectConversationIntent } from '../lib/engineeringReferenceResolver';

const PO_PROMPT = 'Inspect the supervised execution engine and provider selection for EWO-031.';

describe('EWO-031R.3 — Provider Policy Inspection Intent Classification Correction', () => {
  beforeAll(async () => { await ensureTestAuth(); });

  // 1. Exact Product Owner prompt resolves to provider-policy inspection
  it('1. should resolve exact PO prompt to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.detected_intent).toBe('inspection');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
  });

  // 2. "Do not execute" suppresses execution intent
  it('2. should suppress execution intent when "do not execute" is present', () => {
    const result = classifyExecutionIntent('Do not execute EWO-031. Inspect the provider policy.');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 3. "Execution engine" does not trigger execution intent
  it('3. should not trigger execution intent for "execution engine"', () => {
    const result = classifyExecutionIntent('Inspect the supervised execution engine');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 4. EWO-031 is resolved as an object reference, not a capability
  it('4. should resolve EWO-031 as object reference not capability', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
    expect(result.resolved_capability).toBe('supervised-engineering-execution');
  });

  // 5. Capability resolves to supervised-engineering-execution
  it('5. should resolve capability to supervised-engineering-execution', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.resolved_capability).toBe('supervised-engineering-execution');
  });

  // 6. Operation resolves to inspectExecutionProviderPolicy
  it('6. should resolve operation to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  // 7. RPC is invoked with EWO-031
  it('7. should invoke RPC with EWO-031', async () => {
    const { data, error } = await supabase.rpc('inspect_execution_provider_policy', {
      p_ewo_ref: 'EWO-031',
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  // 8. Provider-policy result is returned
  it('8. should return provider policy result from RPC', async () => {
    const { data, error } = await supabase.rpc('inspect_execution_provider_policy', {
      p_ewo_ref: 'EWO-031',
    });
    expect(error).toBeNull();
    const policy = typeof data === 'string' ? JSON.parse(data) : data;
    expect(policy.success).toBe(true);
    expect(policy.preferred_provider_id).toBe('codex');
  });

  // 9. Knowledge Package fallback is not used
  it('9. should not use knowledge package fallback', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.routing_decision).toContain('inspectExecutionProviderPolicy');
    expect(result.routing_decision).not.toBe('route_to_knowledge_package');
  });

  // 10. Generic EWO validation does not take precedence
  it('10. should not route to generic EWO validation', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.resolved_operation).not.toBe('validation');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  // 11. Active conversation EWO does not override explicit inspection intent
  it('11. should not let active conversation EWO override inspection', () => {
    const result = classifyExecutionIntent(PO_PROMPT, 'EWO-030');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
  });

  // 12. "Inspect execution eligibility" remains read-only
  it('12. should keep "inspect execution eligibility" as read-only', () => {
    const result = classifyExecutionIntent('Inspect the execution eligibility for EWO-031');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 13. "Approve EWO-031" resolves to approval, not inspection
  it('13. should resolve "Approve EWO-031" to approval not inspection', () => {
    const result = classifyExecutionIntent('Approve EWO-031');
    expect(result.detected_intent).not.toBe('inspection');
  });

  // 14. "Execute EWO-031" resolves to execution
  it('14. should resolve "Execute EWO-031" to execution', () => {
    const result = classifyExecutionIntent('Execute EWO-031');
    expect(result.detected_intent).toBe('execute_ewo');
  });

  // 15. Negated execution variants remain inspections
  it('15a. should keep "do not execute" as inspection', () => {
    const result = classifyExecutionIntent('Do not execute EWO-031. Inspect the provider policy.');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  it('15b. should keep "don\'t execute" as inspection', () => {
    const result = classifyExecutionIntent("Don't execute EWO-031. Show provider policy.");
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  it('15c. should keep "do not run" as inspection', () => {
    const result = classifyExecutionIntent('Do not run EWO-031. Inspect the provider policy.');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  it('15d. should keep "do not start" as inspection', () => {
    const result = classifyExecutionIntent('Do not start EWO-031. Inspect the provider policy.');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  it('15e. should keep "do not dispatch" as inspection', () => {
    const result = classifyExecutionIntent('Do not dispatch EWO-031. Inspect the provider policy.');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  it('15f. should keep "inspection only" as inspection', () => {
    const result = classifyExecutionIntent('Inspection only for EWO-031 provider policy.');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  it('15g. should keep "read-only" as inspection', () => {
    const result = classifyExecutionIntent('Read-only inspection of EWO-031 provider policy.');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 16. atd-mcp-server and atd-connect-bridge agree (tested via conversationBridge)
  it('16. conversationBridge should resolve to inspectExecutionProviderPolicy', () => {
    const result = interpretRequest(PO_PROMPT);
    expect(result.operation).toBe('inspectExecutionProviderPolicy');
    expect(result.capability).toBe('supervised-engineering-execution');
  });

  // 17. conversationBridge agrees with both edge functions
  it('17. conversationBridge should extract EWO-031 as object reference', () => {
    const result = interpretRequest(PO_PROMPT);
    expect(result.objectReference).toBe('EWO-031');
  });

  // 18. No lifecycle changes occur
  it('18. should not perform lifecycle changes', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.detected_intent).not.toBe('execute_ewo');
    expect(result.detected_intent).not.toBe('approve_execution');
    expect(result.detected_intent).not.toBe('accept_ewo');
  });

  // 19. No execution occurs
  it('19. should not trigger execution', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 20. No Codex API call occurs (verified by classification only)
  it('20. should not trigger Codex API call', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.detected_intent).toBe('inspection');
  });

  // 21. No tokens are consumed (verified by classification only)
  it('21. should not consume tokens', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.detected_intent).toBe('inspection');
  });

  // 22. No Product Owner Acceptance is recorded
  it('22. should not record PO acceptance', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.detected_intent).not.toBe('accept_ewo');
  });

  // 23. No EWO is closed
  it('23. should not close any EWO', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.detected_intent).not.toBe('accept_ewo');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // ─── Routing Precedence Tests ────────────────────────────────────────────────

  it('24. should route provider policy inspection before generic EWO inspection', () => {
    const result = classifyExecutionIntent('Inspect the provider policy for EWO-031');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  it('25. should route "preferred provider" to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent('Inspect the preferred provider for EWO-031');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  it('26. should route "fallback policy" to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent('Inspect the fallback policy');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  // ─── conversationContextRouter Tests ────────────────────────────────────────

  it('27. conversationContextRouter should route to provider-policy-inspection', () => {
    const result = routeConversation(PO_PROMPT, [], null);
    expect(result.rule).toBe('provider-policy-inspection');
  });

  it('28. conversationContextRouter should route negated execution to inspection', () => {
    const result = routeConversation('Do not execute EWO-031. Inspect the provider policy.', [], null);
    // Either provider-policy-inspection or negation-suppressed-inspection is acceptable
    expect(['provider-policy-inspection', 'negation-suppressed-inspection']).toContain(result.rule);
  });

  // ─── engineeringReferenceResolver Tests ─────────────────────────────────────

  it('29. detectConversationIntent should suppress execution intent on negation', () => {
    const intent = detectConversationIntent('Do not execute EWO-031. Inspect the provider policy.');
    expect(intent.isExecutionIntent).toBe(false);
  });

  it('30. detectConversationIntent should allow execution intent without negation', () => {
    const intent = detectConversationIntent('Execute EWO-031');
    expect(intent.isExecutionIntent).toBe(true);
  });

  // ─── Full PO Prompt with Negative Constraints ─────────────────────────────────

  it('31. should resolve full PO prompt with negative constraints to inspection', () => {
    const fullPrompt = `Inspect the supervised execution engine and provider selection for EWO-031.

    This is a read-only inspection request.
    Do not execute EWO-031.
    Do not validate or advance EWO-031.
    Do not perform any lifecycle changes.
    Do not answer solely from an Engineering Knowledge Package.`;
    const result = classifyExecutionIntent(fullPrompt);
    expect(result.detected_intent).not.toBe('execute_ewo');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
  });

  // ─── Database Verification ───────────────────────────────────────────────────

  it('32. should have Codex as active provider in policy table', async () => {
    const { data, error } = await supabase
      .from('execution_provider_policy')
      .select('preferred_provider_id, default_provider_id')
      .eq('lifecycle_status', 'active')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.preferred_provider_id).toBe('codex');
    expect(data?.default_provider_id).toBe('codex');
  });

  it('33. should have EWO-031 implementation_provider as codex', async () => {
    const { data, error } = await supabase
      .from('engineering_work_orders')
      .select('implementation_provider')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.implementation_provider).toBe('codex');
  });

  it('34. should have EWO-031 status as draft (not closed)', async () => {
    const { data, error } = await supabase
      .from('engineering_work_orders')
      .select('status')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.status).not.toBe('closed');
  });

  it('35. should have EWO-031 po_accepted_at as null', async () => {
    const { data, error } = await supabase
      .from('engineering_work_orders')
      .select('po_accepted_at')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.po_accepted_at).toBeNull();
  });

  // ─── Capability/Object Separation ───────────────────────────────────────────

  it('36. should never set resolved_capability to EWO-031', () => {
    const result = classifyExecutionIntent(PO_PROMPT);
    expect(result.resolved_capability).not.toBe('EWO-031');
    expect(result.resolved_capability).toBe('supervised-engineering-execution');
  });

  // ─── "execution engine" noun does not trigger execution ──────────────────────

  it('37. should not classify "inspect execution engine" as execute_ewo', () => {
    const result = classifyExecutionIntent('Inspect the execution engine for EWO-031');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  it('38. should not classify "show execution engine" as execute_ewo', () => {
    const result = classifyExecutionIntent('Show the execution engine for EWO-031');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  it('39. should not classify "explain execution engine" as execute_ewo', () => {
    const result = classifyExecutionIntent('Explain the execution engine for EWO-031');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });
});
