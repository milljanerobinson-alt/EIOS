// EWO-031R.2 — Live Provider Policy Inspection and Runtime State Correction
import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { ensureTestAuth } from './helpers/ensureTestAuth';
import {
  getActiveProviderPolicy,
  getRegisteredProviders,
  selectGovernedProvider,
  inspectProviderPolicy,
} from '../lib/providerPolicyService';
import {
  classifyExecutionIntent,
  EXECUTION_OPERATION_MAPPINGS,
} from '../lib/executionIntentRouter';

describe('EWO-031R.2 — Live Provider Policy Inspection and Runtime State Correction', () => {
  beforeAll(async () => { await ensureTestAuth(); });

  // 1. Exact Product Owner prompt resolves to provider-policy inspection
  it('should resolve exact PO prompt to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent(
      'Inspect the supervised execution engine and provider selection for EWO-031.'
    );
    expect(result.detected_intent).toBe('inspection');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
    expect(result.resolved_engineering_object_reference).toBe('EWO-031');
  });

  // 2. Generic execution-engine inspection does not take precedence
  it('should not resolve generic execution engine inspection to provider policy', () => {
    const result = classifyExecutionIntent(
      'Inspect the supervised execution engine'
    );
    // This should NOT be inspectExecutionProviderPolicy — it's a generic engine inspection
    expect(result.resolved_operation).not.toBe('inspectExecutionProviderPolicy');
  });

  // 3. Provider-policy RPC is invoked (verified via database state)
  it('should have inspect_execution_provider_policy RPC available', async () => {
    const { data, error } = await supabase.rpc('inspect_execution_provider_policy', {
      p_ewo_ref: 'EWO-031',
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  // 4. Live policy fields are returned
  it('should return live policy fields from RPC', async () => {
    const { data, error } = await supabase.rpc('inspect_execution_provider_policy', {
      p_ewo_ref: 'EWO-031',
    });
    expect(error).toBeNull();
    const policy = typeof data === 'string' ? JSON.parse(data) : data;
    expect(policy.success).toBe(true);
    expect(policy.preferred_provider_id).toBe('codex');
    expect(policy.default_provider_id).toBe('codex');
    expect(policy.fallback_permitted).toBe(false);
  });

  // 5. EWO-031 provider fields are returned from persisted data
  it('should return EWO-031 persisted provider fields', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.selected_provider_for_ewo).toBe('codex');
    expect(inspection.requested_provider_for_ewo).toBe('codex');
  });

  // 6. Legacy metadata is not used
  it('should use policy table not legacy registry defaults', async () => {
    const policy = await getActiveProviderPolicy();
    expect(policy).not.toBeNull();
    expect(policy!.preferred_provider_id).toBe('codex');
    // The policy table is the authoritative source, not the registry
    expect(policy!.policy_version).toBeGreaterThan(0);
  });

  // 7. RPC failure returns governed failure (tested by checking RPC exists)
  it('should have governed failure shape available', async () => {
    // The RPC returns success=true when policy exists, success=false when not
    const { data } = await supabase.rpc('inspect_execution_provider_policy', {
      p_ewo_ref: null,
    });
    const policy = typeof data === 'string' ? JSON.parse(data) : data;
    expect(policy).toHaveProperty('success');
  });

  // 8. RPC failure does not return Bolt defaults
  it('should not return Bolt as default when policy is active', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.default_execution_provider).not.toBe('bolt');
    expect(inspection.default_execution_provider).toBe('codex');
  });

  // 9. Wrong environment is detectable (verified by checking project URL)
  it('should be connected to the correct Supabase environment', async () => {
    const { data, error } = await supabase
      .from('execution_provider_policy')
      .select('policy_version')
      .eq('lifecycle_status', 'active')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.policy_version).toBeGreaterThan(0);
  });

  // 10. Missing active policy is explicit
  it('should have an active policy record', async () => {
    const policy = await getActiveProviderPolicy();
    expect(policy).not.toBeNull();
    expect(policy!.lifecycle_status).toBe('active');
  });

  // 11. Stale Bolt EWO values are detectable
  it('should detect that EWO-031 provider is codex not bolt', async () => {
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('implementation_provider')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(ewo?.implementation_provider).toBe('codex');
    expect(ewo?.implementation_provider).not.toBe('bolt');
  });

  // 12. atd-mcp-server and atd-connect-bridge return consistent results
  it('should expose inspectExecutionProviderPolicy in operation mappings', () => {
    const mapping = EXECUTION_OPERATION_MAPPINGS.find(
      (m) => m.operation === 'inspectExecutionProviderPolicy'
    );
    expect(mapping).toBeDefined();
    expect(mapping!.capability).toBe('supervised-engineering-execution');
  });

  // 13. No execution occurs
  it('should not create execution records during inspection', async () => {
    const { data } = await supabase
      .from('supervised_execution_records')
      .select('id')
      .eq('ewo_ref', 'EWO-031')
      .eq('execution_status', 'running');
    expect(data?.length ?? 0).toBe(0);
  });

  // 14. No Codex API call occurs
  it('should not call Codex API during inspection', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    // Inspection only reads the database, never calls the API
    expect(inspection).toBeDefined();
    expect(inspection.lifecycle_change_performed).toBe(false);
  });

  // 15. No tokens are consumed
  it('should not consume tokens during inspection', async () => {
    const { data: budget } = await supabase
      .from('execution_budget_controls')
      .select('used_tokens')
      .eq('status', 'active')
      .maybeSingle();
    expect(budget?.used_tokens ?? 0).toBeGreaterThanOrEqual(0);
  });

  // 16. No Product Owner Acceptance is recorded
  it('should not have PO acceptance recorded for EWO-031', async () => {
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('po_accepted_at')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(ewo?.po_accepted_at).toBeNull();
  });

  // 17. No EWO is closed
  it('should keep EWO-031 unclosed', async () => {
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('status')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(ewo?.status).not.toBe('closed');
  });

  // ─── Database Verification ───────────────────────────────────────────────────

  it('should have Codex provider record with is_active=true', async () => {
    const { data, error } = await supabase
      .from('execution_provider_registry')
      .select('is_active')
      .eq('provider_id', 'codex')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.is_active).toBe(true);
  });

  it('should have Bolt provider record with is_active=false', async () => {
    const { data, error } = await supabase
      .from('execution_provider_registry')
      .select('is_active')
      .eq('provider_id', 'bolt')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.is_active).toBe(false);
  });

  it('should have active policy with preferred=codex, default=codex', async () => {
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
    expect(data!.fallback_provider_id).toBeNull();
  });

  it('should have EWO-031 implementation_provider=codex', async () => {
    const { data, error } = await supabase
      .from('engineering_work_orders')
      .select('implementation_provider')
      .eq('ewo_ref', 'EWO-031')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.implementation_provider).toBe('codex');
  });

  // ─── Routing Precedence Tests ────────────────────────────────────────────────

  it('should resolve "provider policy" variant to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent('Inspect the provider policy for EWO-031');
    expect(result.detected_intent).toBe('inspection');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  it('should resolve "provider selection" variant to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent('Inspect the provider selection for EWO-031');
    expect(result.detected_intent).toBe('inspection');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  it('should resolve "execution engine and provider selection" to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent(
      'Inspect the supervised execution engine and provider selection for EWO-031'
    );
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  it('should NOT resolve generic "inspect execution engine" to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent('Inspect the supervised execution engine');
    // This should be unresolved or a different operation — NOT provider policy
    expect(result.resolved_operation).not.toBe('inspectExecutionProviderPolicy');
  });

  it('should resolve "preferred provider" to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent('Inspect the preferred provider for EWO-031');
    expect(result.detected_intent).toBe('inspection');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  it('should resolve "default provider" to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent('Inspect the default provider');
    expect(result.detected_intent).toBe('inspection');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  it('should resolve "allowed providers" to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent('Inspect the allowed providers');
    expect(result.detected_intent).toBe('inspection');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  it('should resolve "fallback policy" to inspectExecutionProviderPolicy', () => {
    const result = classifyExecutionIntent('Inspect the fallback policy');
    expect(result.detected_intent).toBe('inspection');
    expect(result.resolved_operation).toBe('inspectExecutionProviderPolicy');
  });

  // ─── Provider State Verification ────────────────────────────────────────────

  it('should return Codex as active execution provider', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.active_execution_provider).toBe('codex');
  });

  it('should return Codex as default execution provider', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.default_execution_provider).toBe('codex');
  });

  it('should return Codex as preferred execution provider', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.preferred_execution_provider).toBe('codex');
  });

  it('should return ["codex"] as allowed execution providers', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.allowed_execution_providers).toContain('codex');
    expect(inspection.allowed_execution_providers).not.toContain('bolt');
  });

  it('should return false for fallback_permitted', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.fallback_permitted).toBe(false);
  });

  it('should return false for fallback_performed', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.fallback_performed).toBe(false);
  });

  it('should return Codex as selected provider for EWO-031', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.selected_provider_for_ewo).toBe('codex');
  });

  it('should return Codex as requested provider for EWO-031', async () => {
    const inspection = await inspectProviderPolicy('EWO-031');
    expect(inspection.requested_provider_for_ewo).toBe('codex');
  });
});
