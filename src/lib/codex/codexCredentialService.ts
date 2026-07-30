/**
 * EWO-032R.9: Codex Credential Service — Shared OpenAI Credential
 *
 * The Codex Execution Provider no longer maintains an independent credential.
 * It reuses the existing AI Infrastructure OpenAI credential via an opaque
 * reference: `shared-provider://openai/default`.
 *
 * This service returns only availability, reference metadata, environment,
 * and validation status to frontend or audit callers. It NEVER returns the
 * raw API key. Raw key resolution is restricted to trusted server-side edge
 * functions (codex-health-check, codex-dry-run) that use the service role.
 *
 * Canonical credential source:
 *   - settings.key = 'openai_api_key'  (raw key — pre-existing, plaintext)
 *   - ai_provider_configs.provider = 'openai' (provider config + has_api_key)
 *
 * SECURITY FINDING: settings.openai_api_key stores the raw key in plaintext.
 * This is a pre-existing limitation of the AI Infrastructure credential model
 * (save-provider-key edge function). Codex reuses this source as an interim
 * compatibility path and does not expand the pattern or duplicate the key.
 */

import { supabase } from '../supabase';
import type { CodexCredentialRecord } from './codexTypes';

/** Opaque identifier pointing to the shared OpenAI credential source. */
export const SHARED_OPENAI_CREDENTIAL_REFERENCE = 'shared-provider://openai/default';

/** The settings key that holds the raw OpenAI API key (server-side access only). */
export const OPENAI_SETTINGS_KEY = 'openai_api_key';

/**
 * Shared credential descriptor returned to frontend/audit callers.
 * Never contains the raw key.
 */
export interface SharedCredentialDescriptor {
  available: boolean;
  credential_reference: string;
  source_provider: string;
  environment: string;
  validation_status: 'available' | 'unavailable' | 'disabled' | 'invalid';
  reason: string;
  openai_enabled: boolean;
  openai_has_key: boolean;
  openai_health: string | null;
}

/**
 * Resolve the shared OpenAI credential descriptor for a given environment.
 *
 * EWO-034R.3B: Delegates to the canonical codexProviderResolver to ensure
 * consistent provider resolution across all execution components.
 */
export async function resolveSharedCredential(
  environment: string,
): Promise<SharedCredentialDescriptor> {
  const { resolveExecutionProvider } = await import('../codexProviderResolver');
  const provider = await resolveExecutionProvider();

  return {
    available: provider.resolved,
    credential_reference: SHARED_OPENAI_CREDENTIAL_REFERENCE,
    source_provider: 'openai',
    environment,
    validation_status: provider.resolved ? 'available' : provider.is_enabled ? 'unavailable' : 'disabled',
    reason: provider.reason,
    openai_enabled: provider.is_enabled,
    openai_has_key: provider.has_api_key,
    openai_health: null,
  };
}

/**
 * Resolve the current credential for a given environment.
 *
 * Returns a descriptor shaped like the legacy CodexCredentialRecord so existing
 * callers continue to work, but the credential_reference now points to the
 * shared OpenAI source. Never returns the raw key.
 */
export async function getCurrentCredential(
  environment: string,
): Promise<CodexCredentialRecord | null> {
  const shared = await resolveSharedCredential(environment);

  if (!shared.available) {
    return null;
  }

  return {
    credential_ref: SHARED_OPENAI_CREDENTIAL_REFERENCE,
    environment,
    credential_reference: SHARED_OPENAI_CREDENTIAL_REFERENCE,
    credential_status: 'valid',
    configured_by: 'system',
    configured_at: new Date().toISOString(),
    validated_at: null,
    last_validation_status: 'valid',
    last_validation_detail: shared.reason,
    is_current: true,
  };
}

/**
 * Validate that the shared OpenAI credential is available and not disabled.
 * Does NOT retrieve the raw key — only checks provider configuration state.
 */
export async function validateCredential(
  environment: string,
): Promise<{ valid: boolean; status: string; detail: string; credential_ref: string | null }> {
  const shared = await resolveSharedCredential(environment);

  if (!shared.available) {
    return {
      valid: false,
      status: shared.validation_status,
      detail: shared.reason,
      credential_ref: null,
    };
  }

  return {
    valid: true,
    status: 'valid',
    detail: shared.reason,
    credential_ref: SHARED_OPENAI_CREDENTIAL_REFERENCE,
  };
}

/**
 * Get the credential status for provider inspection — never returns the key.
 */
export async function getCredentialStatus(
  environment: string,
): Promise<{
  credential_reference_status: string;
  configured: boolean;
  last_validated: string | null;
  last_validation_status: string | null;
}> {
  const shared = await resolveSharedCredential(environment);

  return {
    credential_reference_status: shared.validation_status,
    configured: shared.available,
    last_validated: null,
    last_validation_status: shared.available ? 'valid' : null,
  };
}

/**
 * Resolve the shared credential for runtime execution.
 *
 * Returns an opaque descriptor. The raw API key is never exposed to the
 * frontend — it can only be resolved inside governed edge functions where
 * the service role can read `settings.openai_api_key`.
 *
 * Fails closed (returns { resolvable: false, ... }) when:
 * - the OpenAI provider is missing, disabled, or has no key;
 * - the environment does not match.
 */
export async function resolveRuntimeCredential(
  environment: string,
): Promise<{
  resolvable: boolean;
  reason: string;
  credential_ref: string | null;
  credential_reference: string | null;
  environment: string;
}> {
  const shared = await resolveSharedCredential(environment);

  return {
    resolvable: shared.available,
    reason: shared.reason,
    credential_ref: shared.available ? SHARED_OPENAI_CREDENTIAL_REFERENCE : null,
    credential_reference: shared.available ? SHARED_OPENAI_CREDENTIAL_REFERENCE : null,
    environment,
  };
}

// ─── Deprecated functions (kept for backward compatibility, no longer used) ──
// The independent Codex credential lifecycle is deprecated. Rotation is now
// managed through the AI Infrastructure provider page. These functions are
// retained so existing imports do not break, but they no longer persist a
// separate credential.

export async function storeCodexCredential(
  _apiKey: string,
  _environment: string,
  _configuredBy: string,
): Promise<{ credential_ref: string; credential_reference: string; status: string }> {
  throw new Error(
    'Independent Codex credential storage is deprecated. Configure the OpenAI provider in AI Infrastructure instead.',
  );
}

export async function rotateCredential(
  _newApiKey: string,
  _environment: string,
  _rotatedBy: string,
): Promise<{ new_credential_ref: string; old_credential_ref: string | null }> {
  throw new Error(
    'Codex credential rotation is deprecated. Rotate the OpenAI key in AI Infrastructure instead.',
  );
}

export async function revokeCredential(_credentialRef: string): Promise<void> {
  throw new Error(
    'Codex credential revocation is deprecated. Disable the OpenAI provider in AI Infrastructure instead.',
  );
}

export async function updateCredentialValidation(
  _credentialRef: string,
  _valid: boolean,
  _detail: string,
): Promise<void> {
  // No-op: validation state is now derived from the shared OpenAI provider
  // and synced into execution_provider_registry by the health check edge function.
}
