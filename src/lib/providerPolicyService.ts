// EWO-031R.1 — Governed Execution Provider Policy Service
// Canonical provider selection policy that makes Codex the preferred/default
// provider and disables fallback to Bolt.

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderPolicy {
  policy_version: number;
  preferred_provider_id: string;
  default_provider_id: string;
  allowed_provider_ids: string[];
  fallback_provider_id: string | null;
  fallback_permitted: boolean;
  lifecycle_status: string;
}

export interface ProviderRecord {
  provider_id: string;
  provider_name: string;
  provider_version: string | null;
  provider_type: string;
  provider_type_detail: string | null;
  is_active: boolean;
  is_governed: boolean;
  configuration_status: string | null;
  credential_reference_status: string | null;
  provider_health: string | null;
  permitted_environments: string[] | null;
}

export interface ProviderSelectionDiagnostics {
  requested_provider: string | null;
  selected_provider_id: string | null;
  selected_provider_name: string | null;
  selected_provider_version: string | null;
  provider_lifecycle_status: string | null;
  provider_active_status: boolean;
  provider_governed_status: boolean;
  provider_configuration_status: string | null;
  provider_health_status: string | null;
  provider_selection_reason: string;
  fallback_permitted: boolean;
  fallback_performed: boolean;
  rejection_reason: string | null;
  policy_version: number | null;
}

export interface ProviderPolicyInspection {
  registered_providers: ProviderRecord[];
  active_execution_provider: string | null;
  default_execution_provider: string | null;
  preferred_execution_provider: string | null;
  allowed_execution_providers: string[];
  fallback_provider: string | null;
  fallback_permitted: boolean;
  fallback_performed: boolean;
  provider_precedence_order: string[];
  policy_version: number | null;
  selected_provider_for_ewo: string | null;
  requested_provider_for_ewo: string | null;
  provider_selection_reason: string | null;
  provider_lifecycle_statuses: Record<string, string>;
  provider_active_statuses: Record<string, boolean>;
  provider_governed_statuses: Record<string, boolean>;
  provider_configuration_statuses: Record<string, string>;
  unresolved_blockers: string[];
  provider_diagnostics: Record<string, unknown>;
  runtime_diagnostics: Record<string, unknown>;
  lifecycle_change_performed: boolean;
  audit_reference: string;
}

// ─── Policy Retrieval ──────────────────────────────────────────────────────────

export async function getActiveProviderPolicy(): Promise<ProviderPolicy | null> {
  const { data, error } = await supabase
    .from('execution_provider_policy')
    .select('*')
    .eq('lifecycle_status', 'active')
    .maybeSingle();

  if (error || !data) return null;

  return {
    policy_version: data.policy_version,
    preferred_provider_id: data.preferred_provider_id,
    default_provider_id: data.default_provider_id,
    allowed_provider_ids: Array.isArray(data.allowed_provider_ids) ? data.allowed_provider_ids : JSON.parse(data.allowed_provider_ids || '[]'),
    fallback_provider_id: data.fallback_provider_id ?? null,
    fallback_permitted: data.fallback_permitted ?? false,
    lifecycle_status: data.lifecycle_status,
  };
}

export async function getRegisteredProviders(): Promise<ProviderRecord[]> {
  const { data, error } = await supabase
    .from('execution_provider_registry')
    .select('*')
    .order('provider_id');

  if (error || !data) return [];

  return data.map((row: Record<string, unknown>) => ({
    provider_id: row.provider_id as string,
    provider_name: row.provider_name as string,
    provider_version: (row.provider_version as string) ?? null,
    provider_type: row.provider_type as string,
    provider_type_detail: (row.provider_type_detail as string) ?? null,
    is_active: row.is_active as boolean,
    is_governed: row.is_governed as boolean,
    configuration_status: (row.configuration_status as string) ?? null,
    credential_reference_status: (row.credential_reference_status as string) ?? null,
    provider_health: (row.provider_health as string) ?? null,
    permitted_environments: Array.isArray(row.permitted_environments) ? row.permitted_environments : null,
  }));
}

// ─── Canonical Provider Selection ─────────────────────────────────────────────

export async function selectGovernedProvider(
  ewoRef?: string | null,
  requestedProvider?: string | null
): Promise<ProviderSelectionDiagnostics> {
  const auditRef = `EWO031R1-SELECT-${Date.now()}`;
  const policy = await getActiveProviderPolicy();
  const providers = await getRegisteredProviders();

  // No policy — governed failure
  if (!policy) {
    return {
      requested_provider: requestedProvider ?? null,
      selected_provider_id: null,
      selected_provider_name: null,
      selected_provider_version: null,
      provider_lifecycle_status: null,
      provider_active_status: false,
      provider_governed_status: false,
      provider_configuration_status: null,
      provider_health_status: null,
      provider_selection_reason: 'No active provider policy found',
      fallback_permitted: false,
      fallback_performed: false,
      rejection_reason: 'no_active_policy',
      policy_version: null,
    };
  }

  // Step 1: Resolve explicit provider request
  let resolvedProviderId = requestedProvider ?? null;

  // Step 2: Validate requested provider is allowed by policy
  if (resolvedProviderId) {
    if (!policy.allowed_provider_ids.includes(resolvedProviderId)) {
      return {
        requested_provider: requestedProvider ?? null,
        selected_provider_id: null,
        selected_provider_name: null,
        selected_provider_version: null,
        provider_lifecycle_status: null,
        provider_active_status: false,
        provider_governed_status: false,
        provider_configuration_status: null,
        provider_health_status: null,
        provider_selection_reason: `Provider "${resolvedProviderId}" is not in the allowed providers list`,
        fallback_permitted: policy.fallback_permitted,
        fallback_performed: false,
        rejection_reason: 'provider_policy_denied',
        policy_version: policy.policy_version,
      };
    }
  } else {
    // Step 3: Resolve governed default provider
    resolvedProviderId = policy.default_provider_id;
  }

  // Step 4: Confirm provider is registered
  const provider = providers.find(p => p.provider_id === resolvedProviderId);
  if (!provider) {
    return {
      requested_provider: requestedProvider ?? null,
      selected_provider_id: null,
      selected_provider_name: null,
      selected_provider_version: null,
      provider_lifecycle_status: null,
      provider_active_status: false,
      provider_governed_status: false,
      provider_configuration_status: null,
      provider_health_status: null,
      provider_selection_reason: `Provider "${resolvedProviderId}" is not registered`,
      fallback_permitted: policy.fallback_permitted,
      fallback_performed: false,
      rejection_reason: 'provider_not_registered',
      policy_version: policy.policy_version,
    };
  }

  // Step 5: Confirm provider is active
  if (!provider.is_active) {
    return {
      requested_provider: requestedProvider ?? null,
      selected_provider_id: provider.provider_id,
      selected_provider_name: provider.provider_name,
      selected_provider_version: provider.provider_version,
      provider_lifecycle_status: 'inactive',
      provider_active_status: false,
      provider_governed_status: provider.is_governed,
      provider_configuration_status: provider.configuration_status,
      provider_health_status: provider.provider_health,
      provider_selection_reason: `Provider "${provider.provider_id}" is registered but not active`,
      fallback_permitted: policy.fallback_permitted,
      fallback_performed: false,
      rejection_reason: 'provider_inactive',
      policy_version: policy.policy_version,
    };
  }

  // Step 6: Confirm provider is governed
  if (!provider.is_governed) {
    return {
      requested_provider: requestedProvider ?? null,
      selected_provider_id: provider.provider_id,
      selected_provider_name: provider.provider_name,
      selected_provider_version: provider.provider_version,
      provider_lifecycle_status: 'active',
      provider_active_status: true,
      provider_governed_status: false,
      provider_configuration_status: provider.configuration_status,
      provider_health_status: provider.provider_health,
      provider_selection_reason: `Provider "${provider.provider_id}" is not governed`,
      fallback_permitted: policy.fallback_permitted,
      fallback_performed: false,
      rejection_reason: 'provider_not_governed',
      policy_version: policy.policy_version,
    };
  }

  // Steps 7-12: All passed — select the provider
  const selectionReason = requestedProvider
    ? `Explicitly requested provider "${provider.provider_id}" is registered, active, and governed. Selected per policy v${policy.policy_version}.`
    : `Default governed provider "${provider.provider_id}" selected per policy v${policy.policy_version}.`;

  return {
    requested_provider: requestedProvider ?? null,
    selected_provider_id: provider.provider_id,
    selected_provider_name: provider.provider_name,
    selected_provider_version: provider.provider_version,
    provider_lifecycle_status: 'active',
    provider_active_status: true,
    provider_governed_status: true,
    provider_configuration_status: provider.configuration_status,
    provider_health_status: provider.provider_health,
    provider_selection_reason: selectionReason,
    fallback_permitted: policy.fallback_permitted,
    fallback_performed: false,
    rejection_reason: null,
    policy_version: policy.policy_version,
  };
}

// ─── Full Policy Inspection ─────────────────────────────────────────────────────

export async function inspectProviderPolicy(ewoRef?: string | null): Promise<ProviderPolicyInspection> {
  const auditRef = `EWO031R1-INSPECT-${Date.now()}`;
  const policy = await getActiveProviderPolicy();
  const providers = await getRegisteredProviders();

  const lifecycleStatuses: Record<string, string> = {};
  const activeStatuses: Record<string, boolean> = {};
  const governedStatuses: Record<string, boolean> = {};
  const configStatuses: Record<string, string> = {};
  const blockers: string[] = [];

  for (const p of providers) {
    lifecycleStatuses[p.provider_id] = p.is_active ? 'active' : 'inactive';
    activeStatuses[p.provider_id] = p.is_active;
    governedStatuses[p.provider_id] = p.is_governed;
    configStatuses[p.provider_id] = p.configuration_status ?? 'unknown';

    if (p.is_active && p.provider_health && p.provider_health !== 'healthy') {
      blockers.push(`Provider "${p.provider_id}" health: ${p.provider_health}`);
    }
  }

  // Resolve EWO-specific provider
  let ewoProvider: string | null = null;
  let ewoRequestedProvider: string | null = null;
  if (ewoRef) {
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('implementation_provider')
      .eq('ewo_ref', ewoRef)
      .maybeSingle();

    if (ewo) {
      ewoProvider = ewo.implementation_provider ?? policy?.default_provider_id ?? null;
      ewoRequestedProvider = ewoProvider;
    }
  }

  const selectedProvider = ewoProvider ?? policy?.default_provider_id ?? null;

  // Build precedence order: preferred first, then allowed, then others
  const precedenceOrder: string[] = [];
  if (policy) {
    if (!precedenceOrder.includes(policy.preferred_provider_id)) precedenceOrder.push(policy.preferred_provider_id);
    for (const id of policy.allowed_provider_ids) {
      if (!precedenceOrder.includes(id)) precedenceOrder.push(id);
    }
  }
  for (const p of providers) {
    if (!precedenceOrder.includes(p.provider_id)) precedenceOrder.push(p.provider_id);
  }

  return {
    registered_providers: providers,
    active_execution_provider: providers.find(p => p.is_active)?.provider_id ?? null,
    default_execution_provider: policy?.default_provider_id ?? null,
    preferred_execution_provider: policy?.preferred_provider_id ?? null,
    allowed_execution_providers: policy?.allowed_provider_ids ?? [],
    fallback_provider: policy?.fallback_provider_id ?? null,
    fallback_permitted: policy?.fallback_permitted ?? false,
    fallback_performed: false,
    provider_precedence_order: precedenceOrder,
    policy_version: policy?.policy_version ?? null,
    selected_provider_for_ewo: selectedProvider,
    requested_provider_for_ewo: ewoRequestedProvider,
    provider_selection_reason: policy
      ? `Provider selected per governed policy v${policy.policy_version}. Default: ${policy.default_provider_id}.`
      : 'No active provider policy',
    provider_lifecycle_statuses: lifecycleStatuses,
    provider_active_statuses: activeStatuses,
    provider_governed_statuses: governedStatuses,
    provider_configuration_statuses: configStatuses,
    unresolved_blockers: blockers,
    provider_diagnostics: {
      codex_configuration: configStatuses['codex'] ?? 'unknown',
      codex_credential_status: providers.find(p => p.provider_id === 'codex')?.credential_reference_status ?? 'unknown',
      codex_health: providers.find(p => p.provider_id === 'codex')?.provider_health ?? 'unknown',
      bolt_configuration: configStatuses['bolt'] ?? 'unknown',
      bolt_active: activeStatuses['bolt'] ?? false,
    },
    runtime_diagnostics: {
      policy_source: 'execution_provider_policy table',
      selection_algorithm: 'governed_policy_v1',
      fallback_check: 'disabled',
    },
    lifecycle_change_performed: false,
    audit_reference: auditRef,
  };
}

// ─── Governed Policy Change ────────────────────────────────────────────────────

export async function setGovernedProviderPolicy(params: {
  preferred_provider_id: string;
  default_provider_id: string;
  allowed_provider_ids?: string[];
  fallback_provider_id?: string | null;
  fallback_permitted?: boolean;
  updated_by: string;
  reason?: string;
  linked_ewo_ref?: string;
}): Promise<{ success: boolean; audit_reference?: string; error?: string }> {
  const { data, error } = await supabase.rpc('set_governed_execution_provider_policy', {
    p_preferred_provider_id: params.preferred_provider_id,
    p_default_provider_id: params.default_provider_id,
    p_allowed_provider_ids: params.allowed_provider_ids ?? [params.preferred_provider_id],
    p_fallback_provider_id: params.fallback_provider_id ?? null,
    p_fallback_permitted: params.fallback_permitted ?? false,
    p_updated_by: params.updated_by,
    p_reason: params.reason ?? null,
    p_linked_ewo_ref: params.linked_ewo_ref ?? null,
  });

  if (error || !data) {
    return { success: false, error: error?.message ?? 'RPC returned no data' };
  }

  const result = typeof data === 'string' ? JSON.parse(data) : data;
  return {
    success: result.success ?? false,
    audit_reference: result.audit_reference,
    error: result.error,
  };
}
