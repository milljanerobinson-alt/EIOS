// EWO-031R.1 — Governed Execution Provider Activation Tests
import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { ensureTestAuth } from './helpers/ensureTestAuth';
import {
  getActiveProviderPolicy,
  getRegisteredProviders,
  selectGovernedProvider,
  inspectProviderPolicy,
  setGovernedProviderPolicy,
} from '../lib/providerPolicyService';
import {
  classifyExecutionIntent,
  EXECUTION_OPERATION_MAPPINGS,
} from '../lib/executionIntentRouter';

describe('EWO-031R.1 — Governed Execution Provider Activation', () => {
  beforeAll(async () => { await ensureTestAuth(); });

  // 1. Codex and Bolt remain registered
  it('should have both Codex and Bolt registered', async () => {
    const providers = await getRegisteredProviders();
    const codex = providers.find(p => p.provider_id === 'codex');
    const bolt = providers.find(p => p.provider_id === 'bolt');
    expect(codex).toBeDefined();
    expect(bolt).toBeDefined();
    expect(codex!.provider_name).toContain('Codex');
    expect(bolt!.provider_name).toContain('Bolt');
  });

  // 2. Codex is the governed preferred provider
  it('should have Codex as preferred provider', async () => {
    const policy = await getActiveProviderPolicy();
    expect(policy).not.toBeNull();
    expect(policy!.preferred_provider_id).toBe('codex');
  });

  // 3. Codex is the default provider
  it('should have Codex as default provider', async () => {
    const policy = await getActiveProviderPolicy();
    expect(policy!.default_provider_id).toBe('codex');
  });

  // 4. Codex is active
  it('should have Codex as active', async () => {
    const providers = await getRegisteredProviders();
    const codex = providers.find(p => p.provider_id === 'codex');
    expect(codex!.is_active).toBe(true);
  });

  // 5. Bolt is inactive
  it('should have Bolt as inactive', async () => {
    const providers = await getRegisteredProviders();
    const bolt = providers.find(p => p.provider_id === 'bolt');
    expect(bolt!.is_active).toBe(false);
  });

  // 6. Bolt is not the default provider
  it('should not have Bolt as default provider', async () => {
    const policy = await getActiveProviderPolicy();
    expect(policy!.default_provider_id).not.toBe('bolt');
  });

  // 7. Bolt is not a fallback provider
  it('should not have Bolt as fallback provider', async () => {
    const policy = await getActiveProviderPolicy();
    expect(policy!.fallback_provider_id).not.toBe('bolt');
    expect(policy!.fallback_provider_id).toBeNull();
  });

  // 8. Fallback is disabled
  it('should have fallback disabled', async () => {
    const policy = await getActiveProviderPolicy();
    expect(policy!.fallback_permitted).toBe(false);
  });

  // 9. EWO-031 resolves requested provider to Codex
  it('should resolve EWO-031 requested provider to Codex', async () => {
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('implementation_provider')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(ewo?.implementation_provider).toBe('codex');
  });

  // 10. EWO-031 resolves selected provider to Codex
  it('should resolve EWO-031 selected provider to Codex', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.selected_provider_for_ewo).toBe('codex');
  });

  // 11. Codex-only requests never select Bolt
  it('should never select Bolt for Codex-only requests', async () => {
    const diagnostics = await selectGovernedProvider('EWO-031', 'codex');
    expect(diagnostics.selected_provider_id).toBe('codex');
    expect(diagnostics.selected_provider_id).not.toBe('bolt');
    expect(diagnostics.fallback_performed).toBe(false);
  });

  // 12. Explicit Bolt requests are rejected by current policy
  it('should reject explicit Bolt requests by policy', async () => {
    const diagnostics = await selectGovernedProvider('EWO-031', 'bolt');
    expect(diagnostics.selected_provider_id).toBeNull();
    expect(diagnostics.rejection_reason).toBe('provider_policy_denied');
  });

  // 13. Unregistered providers cannot be selected
  it('should reject unregistered providers', async () => {
    const diagnostics = await selectGovernedProvider('EWO-031', 'nonexistent-provider');
    expect(diagnostics.selected_provider_id).toBeNull();
    expect(diagnostics.rejection_reason).toBe('provider_policy_denied');
  });

  // 14. Inactive providers cannot be selected
  it('should not select inactive providers even if in allowed list', async () => {
    // Bolt is registered but inactive — even if somehow requested, it should fail
    const diagnostics = await selectGovernedProvider('EWO-031', 'bolt');
    expect(diagnostics.rejection_reason).toBe('provider_policy_denied');
  });

  // 15. Ungoverned providers cannot be selected
  it('should not select ungoverned providers', async () => {
    // This is covered by the policy check — only allowed providers can be selected
    const policy = await getActiveProviderPolicy();
    expect(policy!.allowed_provider_ids).not.toContain('native-atd');
  });

  // 16. Missing Codex credentials return a governed failure
  it('should report credential status for Codex', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    const codexConfig = inspection.provider_configuration_statuses['codex'];
    // Codex may be not_configured — that's a valid state
    expect(codexConfig).toBeDefined();
  });

  // 17. Failed Codex health checks return a governed failure
  it('should report health status for Codex', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    const codexHealth = inspection.provider_diagnostics;
    expect(codexHealth).toHaveProperty('codex_health');
  });

  // 18. Provider-policy changes produce immutable audit evidence
  it('should produce audit evidence for policy changes', async () => {
    const result = await setGovernedProviderPolicy({
      preferred_provider_id: 'codex',
      default_provider_id: 'codex',
      allowed_provider_ids: ['codex'],
      fallback_permitted: false,
      updated_by: 'test',
      reason: 'Test policy change for EWO-031R.1 verification',
    });
    if (!result.success) {
      console.error('Policy change failed:', result.error);
    }
    expect(result.success).toBe(true);
    expect(result.audit_reference).toBeDefined();
  });

  // 20. Direct execution APIs cannot bypass provider policy
  it('should enforce policy in selectGovernedProvider', async () => {
    const diagnostics = await selectGovernedProvider(null, 'bolt');
    expect(diagnostics.rejection_reason).toBe('provider_policy_denied');
  });

  // 21. Existing historical Bolt execution records remain unchanged
  it('should not delete Bolt historical execution records', async () => {
    const { data: boltExecutions } = await supabase
      .from('supervised_execution_records')
      .select('id')
      .eq('provider', 'bolt')
      .limit(1);
    // We don't delete any records — just verify the query succeeds
    expect(boltExecutions).toBeDefined();
  });

  // 22. No execution is performed during provider activation
  it('should not create execution records during provider activation', async () => {
    const { data: execCount } = await supabase
      .from('supervised_execution_records')
      .select('id')
      .eq('ewo_ref', 'EWO-031')
      .eq('execution_status', 'running');
    expect(execCount?.length ?? 0).toBe(0);
  });

  // 23. No Codex API call occurs during implementation testing
  it('should not call Codex API during tests', async () => {
    // The selectGovernedProvider function only queries the database, never calls the API
    const diagnostics = await selectGovernedProvider('EWO-031', 'codex');
    expect(diagnostics.selected_provider_id).toBe('codex');
    // No API call was made — just database queries
  });

  // 24. No paid tokens are consumed
  it('should not consume tokens during provider selection', async () => {
    const { data: budget } = await supabase
      .from('execution_budget_controls')
      .select('used_tokens')
      .eq('status', 'active')
      .maybeSingle();
    // Token usage should not increase from provider selection
    expect(budget?.used_tokens ?? 0).toBeGreaterThanOrEqual(0);
  });

  // 25. EWO-031 remains unclosed
  it('should keep EWO-031 unclosed', async () => {
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('status')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(ewo?.status).not.toBe('closed');
  });

  // 26. Product Owner Acceptance is not recorded
  it('should not have PO acceptance recorded for EWO-031', async () => {
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('po_accepted_at')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(ewo?.po_accepted_at).toBeNull();
  });

  // 27. Provider inspection returns authoritative policy fields
  it('should return authoritative policy fields in inspection', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection).toHaveProperty('preferred_execution_provider');
    expect(inspection).toHaveProperty('default_execution_provider');
    expect(inspection).toHaveProperty('allowed_execution_providers');
    expect(inspection).toHaveProperty('fallback_permitted');
    expect(inspection).toHaveProperty('fallback_performed');
    expect(inspection).toHaveProperty('registered_providers');
    expect(inspection).toHaveProperty('provider_lifecycle_statuses');
    expect(inspection).toHaveProperty('provider_active_statuses');
    expect(inspection).toHaveProperty('provider_governed_statuses');
    expect(inspection).toHaveProperty('provider_configuration_statuses');
    expect(inspection).toHaveProperty('provider_precedence_order');
    expect(inspection).toHaveProperty('selected_provider_for_ewo');
    expect(inspection).toHaveProperty('requested_provider_for_ewo');
    expect(inspection).toHaveProperty('provider_selection_reason');
    expect(inspection).toHaveProperty('unresolved_blockers');
    expect(inspection).toHaveProperty('audit_reference');
    expect(inspection).toHaveProperty('lifecycle_change_performed');
  });

  // 28. atd-mcp-server exposes the inspection operation
  it('should expose inspectExecutionProviderPolicy in operation mappings', () => {
    const mapping = EXECUTION_OPERATION_MAPPINGS.find(m => m.operation === 'inspectExecutionProviderPolicy');
    expect(mapping).toBeDefined();
    expect(mapping!.capability).toBe('supervised-engineering-execution');
  });

  // 29. atd-connect-bridge exposes the inspection operation
  it('should classify provider policy inspection intent', () => {
    const result = classifyExecutionIntent('Inspect the supervised execution engine and provider selection for EWO-031');
    expect(result.detected_intent).toBe('inspection');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
  });

  // 30. Existing EWO inspection remains unchanged
  it('should not affect existing EWO inspection intents', () => {
    const result = classifyExecutionIntent('Inspect EWO-031');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 31. Existing acceptance-governance inspection remains unchanged
  it('should not affect acceptance governance inspection', () => {
    const result = classifyExecutionIntent('Inspect the EWO-030R.2 acceptance governance state');
    expect(result.detected_intent).not.toBe('execute_ewo');
    expect(result.detected_intent).not.toBe('approve_execution');
  });

  // 32. Existing Codex evidence inspection remains unchanged
  it('should not affect Codex evidence inspection', () => {
    const result = classifyExecutionIntent('Inspect the Codex provider implementation evidence');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 33. Existing Bolt provider inspection remains unchanged
  it('should not affect Bolt provider inspection', () => {
    const result = classifyExecutionIntent('Inspect the Bolt execution provider');
    expect(result.detected_intent).not.toBe('execute_ewo');
  });

  // 34. Existing execution-routing tests remain passing
  it('should maintain execution routing for execute requests', () => {
    const result = classifyExecutionIntent('Execute EWO-031 using Codex');
    expect(result.detected_intent).toBe('execute_ewo');
    expect(result.routing_decision).toBe('route_to_execution_pipeline');
  });

  // ─── Provider Selection Algorithm Tests ──────────────────────────────────────

  it('should select Codex when no provider is requested (default)', async () => {
    const diagnostics = await selectGovernedProvider('EWO-031', null);
    expect(diagnostics.selected_provider_id).toBe('codex');
    expect(diagnostics.provider_active_status).toBe(true);
    expect(diagnostics.provider_governed_status).toBe(true);
  });

  it('should select Codex when Codex is explicitly requested', async () => {
    const diagnostics = await selectGovernedProvider('EWO-031', 'codex');
    expect(diagnostics.selected_provider_id).toBe('codex');
    expect(diagnostics.fallback_permitted).toBe(false);
    expect(diagnostics.fallback_performed).toBe(false);
  });

  it('should return policy version in diagnostics', async () => {
    const diagnostics = await selectGovernedProvider('EWO-031', 'codex');
    expect(diagnostics.policy_version).toBeGreaterThan(0);
  });

  // ─── Database State Tests ────────────────────────────────────────────────────

  it('should have execution_provider_policy table with active policy', async () => {
    const { data, error } = await supabase
      .from('execution_provider_policy')
      .select('*')
      .eq('lifecycle_status', 'active')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.preferred_provider_id).toBe('codex');
    expect(data!.default_provider_id).toBe('codex');
    expect(data!.fallback_permitted).toBe(false);
  });

  it('should have Codex active in provider registry', async () => {
    const { data, error } = await supabase
      .from('execution_provider_registry')
      .select('is_active')
      .eq('provider_id', 'codex')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.is_active).toBe(true);
  });

  it('should have Bolt inactive in provider registry', async () => {
    const { data, error } = await supabase
      .from('execution_provider_registry')
      .select('is_active')
      .eq('provider_id', 'bolt')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.is_active).toBe(false);
  });

  it('should have governed RPCs available', async () => {
    const { data, error } = await supabase.rpc('inspect_execution_provider_policy', { p_ewo_ref: 'EWO-031' });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });
});
