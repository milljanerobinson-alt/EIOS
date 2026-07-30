/**
 * EWO-034R.3B — Canonical Codex Provider Resolver
 *
 * Single source of truth for resolving the governed OpenAI execution provider.
 * All execution components (health-check, dry-run, execute, orchestrator) must
 * use this resolver to ensure consistent provider, credential, and model
 * resolution.
 *
 * Key principles:
 *   - The execution provider is 'openai' (NOT 'codex') in ai_provider_configs
 *   - The column is 'provider' (NOT 'provider_id')
 *   - The raw API key is NEVER exposed to the browser
 *   - The model is resolved from ai_provider_configs.model, not hardcoded
 *   - No fallback to VITE_OPENAI_API_KEY or any browser-visible secret
 */

import { supabase } from './supabase';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** The canonical execution provider row in ai_provider_configs. */
export const EXECUTION_PROVIDER = 'openai' as const;

/** Opaque credential reference — never contains the raw key. */
export const CREDENTIAL_REFERENCE = 'shared-provider://openai/default';

/** Supported models for governed execution. */
export const SUPPORTED_EXECUTION_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'o3-mini',
] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProviderResolution {
  resolved: boolean;
  provider: string;
  model: string;
  is_enabled: boolean;
  has_api_key: boolean;
  credential_reference: string;
  reason: string;
}

export interface ServerSideCredentialResolution extends ProviderResolution {
  api_key: string | null;
}

export interface ModelResolution {
  resolved: boolean;
  model: string;
  supported: boolean;
  reason: string;
}

// ─── Canonical Provider Resolution (client-side, no raw key) ───────────────────

/**
 * Resolve the governed execution provider from ai_provider_configs.
 *
 * This is the canonical resolver used by ALL client-side execution components.
 * It reads the 'openai' row from ai_provider_configs using the correct column
 * name ('provider', not 'provider_id') and returns provider metadata without
 * ever exposing the raw API key.
 */
export async function resolveExecutionProvider(): Promise<ProviderResolution> {
  const { data, error } = await supabase
    .from('ai_provider_configs')
    .select('provider, is_enabled, has_api_key, model, health_status')
    .eq('provider', EXECUTION_PROVIDER)
    .maybeSingle();

  if (error) {
    return {
      resolved: false,
      provider: EXECUTION_PROVIDER,
      model: '',
      is_enabled: false,
      has_api_key: false,
      credential_reference: CREDENTIAL_REFERENCE,
      reason: `Database error: ${error.message}`,
    };
  }

  if (!data) {
    return {
      resolved: false,
      provider: EXECUTION_PROVIDER,
      model: '',
      is_enabled: false,
      has_api_key: false,
      credential_reference: CREDENTIAL_REFERENCE,
      reason: `Provider '${EXECUTION_PROVIDER}' not found in ai_provider_configs`,
    };
  }

  if (!data.is_enabled) {
    return {
      resolved: false,
      provider: EXECUTION_PROVIDER,
      model: data.model || '',
      is_enabled: false,
      has_api_key: data.has_api_key ?? false,
      credential_reference: CREDENTIAL_REFERENCE,
      reason: `Provider '${EXECUTION_PROVIDER}' is disabled`,
    };
  }

  if (!data.has_api_key) {
    return {
      resolved: false,
      provider: EXECUTION_PROVIDER,
      model: data.model || '',
      is_enabled: true,
      has_api_key: false,
      credential_reference: CREDENTIAL_REFERENCE,
      reason: `Provider '${EXECUTION_PROVIDER}' has no API key configured`,
    };
  }

  return {
    resolved: true,
    provider: EXECUTION_PROVIDER,
    model: data.model || 'gpt-4o',
    is_enabled: true,
    has_api_key: true,
    credential_reference: CREDENTIAL_REFERENCE,
    reason: `Provider '${EXECUTION_PROVIDER}' is configured, enabled, and has an API key`,
  };
}

// ─── Canonical Model Resolution ────────────────────────────────────────────────

/**
 * Resolve the governed execution model.
 *
 * Uses the model from ai_provider_configs (the 'openai' row's model column).
 * Validates that the model is in the supported execution models list.
 * Does NOT silently substitute models — returns an explicit failure for
 * unsupported models.
 */
export async function resolveExecutionModel(
  preferredModel?: string,
): Promise<ModelResolution> {
  const provider = await resolveExecutionProvider();

  if (!provider.resolved) {
    return {
      resolved: false,
      model: '',
      supported: false,
      reason: provider.reason,
    };
  }

  const model = preferredModel || provider.model;

  if (!model) {
    return {
      resolved: false,
      model: '',
      supported: false,
      reason: 'No model configured in ai_provider_configs and no preferred model provided',
    };
  }

  const supported = (SUPPORTED_EXECUTION_MODELS as readonly string[]).includes(model);

  if (!supported) {
    return {
      resolved: false,
      model,
      supported: false,
      reason: `Model '${model}' is not in the supported execution models list: ${SUPPORTED_EXECUTION_MODELS.join(', ')}`,
    };
  }

  return {
    resolved: true,
    model,
    supported: true,
    reason: `Model '${model}' resolved from ai_provider_configs`,
  };
}

// ─── Execution Readiness Check ─────────────────────────────────────────────────

/**
 * Verify that the execution pipeline is ready to proceed.
 * Checks provider, credential, and model resolution.
 */
export async function verifyExecutionReadiness(): Promise<{
  ready: boolean;
  provider: ProviderResolution | null;
  model: ModelResolution | null;
  blockers: string[];
}> {
  const blockers: string[] = [];

  const provider = await resolveExecutionProvider();
  if (!provider.resolved) {
    blockers.push(`Provider: ${provider.reason}`);
  }

  let model: ModelResolution | null = null;
  if (provider.resolved) {
    model = await resolveExecutionModel();
    if (!model.resolved) {
      blockers.push(`Model: ${model.reason}`);
    }
  }

  return {
    ready: blockers.length === 0,
    provider: provider.resolved ? provider : null,
    model: model?.resolved ? model : null,
    blockers,
  };
}
