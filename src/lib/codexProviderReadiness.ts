// EWO-036 — Codex Execution Provider Readiness Service
// Non-mutating provider readiness check that proves the Codex provider can be
// selected and contacted without asking it to change source code.

import { supabase } from './supabase';
import { getActiveProviderPolicy, getRegisteredProviders, selectGovernedProvider } from './providerPolicyService';
import { resolveExecutionProvider } from './codexProviderResolver';
import { loadRepositoryConfig } from './githubRepositoryService';
import type { CodexHealthCheckResult } from './codex/codexTypes';

export type ProviderReadinessErrorLayer =
  | 'provider_registration'
  | 'provider_policy'
  | 'credential_missing'
  | 'credential_invalid'
  | 'provider_unreachable'
  | 'execution_contract_invalid'
  | 'github_configuration_missing'
  | 'governance_gate_missing'
  | 'fallback_policy_invalid'
  | 'runtime_error';

export interface CodexProviderReadinessResult {
  provider_registered: boolean;
  provider_active: boolean;
  provider_governed: boolean;
  provider_selected_by_policy: boolean;
  credential_configured: boolean;
  credential_valid: boolean;
  execution_contract_supported: boolean;
  github_pipeline_connected: boolean;
  po_approval_gate_active: boolean;
  fallback_disabled: boolean;
  overall_ready: boolean;
  error_layer: ProviderReadinessErrorLayer | null;
  error_message: string | null;
  diagnostics: {
    provider_id: string | null;
    provider_name: string | null;
    provider_version: string | null;
    provider_type: string | null;
    credential_reference: string | null;
    credential_source: string | null;
    selected_model: string | null;
    model_supported: boolean | null;
    repository_owner: string | null;
    repository_name: string | null;
    base_branch: string | null;
    workflow_path: string | null;
    policy_version: number | null;
    health_check: CodexHealthCheckResult | null;
  };
  checked_at: string;
}

export async function checkCodexProviderReadiness(
  skipApiCheck = false,
): Promise<CodexProviderReadinessResult> {
  const checkedAt = new Date().toISOString();
  const baseResult: CodexProviderReadinessResult = {
    provider_registered: false,
    provider_active: false,
    provider_governed: false,
    provider_selected_by_policy: false,
    credential_configured: false,
    credential_valid: false,
    execution_contract_supported: false,
    github_pipeline_connected: false,
    po_approval_gate_active: false,
    fallback_disabled: false,
    overall_ready: false,
    error_layer: null,
    error_message: null,
    diagnostics: {
      provider_id: null,
      provider_name: null,
      provider_version: null,
      provider_type: null,
      credential_reference: null,
      credential_source: null,
      selected_model: null,
      model_supported: null,
      repository_owner: null,
      repository_name: null,
      base_branch: null,
      workflow_path: null,
      policy_version: null,
      health_check: null,
    },
    checked_at: checkedAt,
  };

  // 1. Provider registration
  const providers = await getRegisteredProviders();
  const codexProvider = providers.find(p => p.provider_id === 'codex');
  if (!codexProvider) {
    baseResult.error_layer = 'provider_registration';
    baseResult.error_message = 'Codex provider is not registered in execution_provider_registry';
    return baseResult;
  }
  baseResult.provider_registered = true;
  baseResult.diagnostics.provider_id = codexProvider.provider_id;
  baseResult.diagnostics.provider_name = codexProvider.provider_name;
  baseResult.diagnostics.provider_version = codexProvider.provider_version;
  baseResult.diagnostics.provider_type = codexProvider.provider_type;

  // 2. Provider active
  if (!codexProvider.is_active) {
    baseResult.error_layer = 'provider_registration';
    baseResult.error_message = 'Codex provider is registered but not active';
    return baseResult;
  }
  baseResult.provider_active = true;

  // 3. Provider governed
  if (!codexProvider.is_governed) {
    baseResult.error_layer = 'provider_registration';
    baseResult.error_message = 'Codex provider is active but not governed';
    return baseResult;
  }
  baseResult.provider_governed = true;

  // 4. Provider policy — Codex selected, fallback disabled
  const policy = await getActiveProviderPolicy();
  if (!policy) {
    baseResult.error_layer = 'provider_policy';
    baseResult.error_message = 'No active execution provider policy found';
    return baseResult;
  }
  baseResult.diagnostics.policy_version = policy.policy_version;

  if (policy.preferred_provider_id !== 'codex' || policy.default_provider_id !== 'codex') {
    baseResult.error_layer = 'provider_policy';
    baseResult.error_message = `Policy does not select Codex (preferred: ${policy.preferred_provider_id}, default: ${policy.default_provider_id})`;
    return baseResult;
  }
  if (!policy.allowed_provider_ids.includes('codex')) {
    baseResult.error_layer = 'provider_policy';
    baseResult.error_message = 'Codex is not in the allowed providers list';
    return baseResult;
  }
  baseResult.provider_selected_by_policy = true;

  if (policy.fallback_permitted) {
    baseResult.error_layer = 'fallback_policy_invalid';
    baseResult.error_message = 'Fallback is permitted — Product Owner policy requires fallback disabled';
    return baseResult;
  }
  baseResult.fallback_disabled = true;

  // 5. Governed provider selection (full algorithm)
  const selection = await selectGovernedProvider(null, 'codex');
  if (selection.rejection_reason) {
    baseResult.error_layer = 'provider_policy';
    baseResult.error_message = `Provider selection rejected: ${selection.rejection_reason}`;
    return baseResult;
  }

  // 6. Credential resolution (server-side via edge function)
  const provider = await resolveExecutionProvider();
  if (!provider.resolved) {
    baseResult.error_layer = 'credential_missing';
    baseResult.error_message = `Credential resolution failed: ${provider.reason ?? 'unknown'}`;
    return baseResult;
  }
  baseResult.credential_configured = true;
  baseResult.diagnostics.credential_reference = provider.credential_reference;
  baseResult.diagnostics.selected_model = provider.model || null;
  baseResult.diagnostics.model_supported = provider.has_api_key;

  // 7. Execution contract — check supported operations exist
  const { data: registryRow } = await supabase
    .from('execution_provider_registry')
    .select('provider_config, canonical_contract_version')
    .eq('provider_id', 'codex')
    .maybeSingle();

  const supportedOps = (registryRow?.provider_config as Record<string, unknown>)?.supported_operations;
  const contractVersion = registryRow?.canonical_contract_version;
  if (!Array.isArray(supportedOps) || supportedOps.length === 0 || !contractVersion) {
    baseResult.error_layer = 'execution_contract_invalid';
    baseResult.error_message = 'Execution contract is missing supported operations or contract version';
    return baseResult;
  }
  baseResult.execution_contract_supported = true;

  // 8. GitHub pipeline configuration
  const repoConfig = await loadRepositoryConfig('default');
  if (!repoConfig) {
    baseResult.error_layer = 'github_configuration_missing';
    baseResult.error_message = 'GitHub repository configuration not found';
    return baseResult;
  }
  if (!repoConfig.repository_owner || !repoConfig.repository_name || !repoConfig.default_base_branch) {
    baseResult.error_layer = 'github_configuration_missing';
    baseResult.error_message = 'GitHub repository configuration is incomplete';
    return baseResult;
  }
  baseResult.github_pipeline_connected = true;
  baseResult.diagnostics.repository_owner = repoConfig.repository_owner;
  baseResult.diagnostics.repository_name = repoConfig.repository_name;
  baseResult.diagnostics.base_branch = repoConfig.default_base_branch;
  baseResult.diagnostics.workflow_path = repoConfig.workflow_file;

  // 9. PO approval gate — check governance rules include po_approval_gate
  const { data: govRow } = await supabase
    .from('execution_provider_registry')
    .select('governance_rules')
    .eq('provider_id', 'codex')
    .maybeSingle();
  const govRules = govRow?.governance_rules;
  const hasApprovalGate = Array.isArray(govRules) && govRules.includes('po_approval_gate');
  if (!hasApprovalGate) {
    baseResult.error_layer = 'governance_gate_missing';
    baseResult.error_message = 'Product Owner approval gate is not present in provider governance rules';
    return baseResult;
  }
  baseResult.po_approval_gate_active = true;

  // 10. Live health check (non-mutating, zero tokens)
  try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const healthResp = await fetch(`${SUPABASE_URL}/functions/v1/codex-health-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ environment: 'staging', skipApiCheck }),
    });
    const healthData = await healthResp.json().catch(() => ({ error: `HTTP ${healthResp.status}` })) as CodexHealthCheckResult;
    baseResult.diagnostics.health_check = healthData;

    if (!healthData.is_healthy) {
      if (healthData.secret_availability_status !== 'available') {
        baseResult.error_layer = 'credential_missing';
        baseResult.error_message = `Credential not available: ${healthData.secret_availability_status}`;
        return baseResult;
      }
      if (healthData.authentication_status === 'failed') {
        baseResult.error_layer = 'credential_invalid';
        baseResult.error_message = 'Credential authentication failed against OpenAI API';
        return baseResult;
      }
      if (healthData.api_accessibility_status === 'unreachable') {
        baseResult.error_layer = 'provider_unreachable';
        baseResult.error_message = 'OpenAI API endpoint is unreachable';
        return baseResult;
      }
      baseResult.error_layer = 'runtime_error';
      baseResult.error_message = `Health check unhealthy: ${JSON.stringify(healthData)}`;
      return baseResult;
    }
    baseResult.credential_valid = true;
  } catch (err) {
    baseResult.error_layer = 'provider_unreachable';
    baseResult.error_message = `Health check failed: ${err instanceof Error ? err.message : 'unknown error'}`;
    return baseResult;
  }

  // All checks passed
  baseResult.overall_ready = true;
  return baseResult;
}
