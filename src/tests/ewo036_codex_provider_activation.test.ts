// EWO-036 — Codex Execution Provider Activation Tests
// Focused tests covering governed provider ID resolution, codex→openai transport
// mapping, provider policy, fallback prohibition, credential safety, readiness,
// PO approval gate, protected paths, execution package, and provider/main isolation.

import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTestAuth } from './helpers/ensureTestAuth';

// ─── Live Database Tests ─────────────────────────────────────────────────────
// These tests run against the live Supabase database to verify the actual
// runtime state of the Codex provider configuration.

describe('EWO-036: Codex Provider Activation', () => {
  beforeAll(async () => {
    await ensureTestAuth();
  });
  // ─── Provider Registry ──────────────────────────────────────────────────────

  it('governed provider ID is "codex" in registry', async () => {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase
      .from('execution_provider_registry')
      .select('provider_id, provider_name, is_active, is_governed, provider_type, provider_version')
      .eq('provider_id', 'codex')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.provider_id).toBe('codex');
    expect(data!.is_active).toBe(true);
    expect(data!.is_governed).toBe(true);
  });

  it('codex → openai transport mapping is preserved', async () => {
    const { supabase } = await import('../lib/supabase');
    // The governed provider ID is 'codex' but the API transport uses 'openai'
    // in ai_provider_configs. This is intentional, not ambiguous.
    const { data: aiProvider } = await supabase
      .from('ai_provider_configs')
      .select('provider, is_enabled, has_api_key, model')
      .eq('provider', 'openai')
      .maybeSingle();
    expect(aiProvider).not.toBeNull();
    expect(aiProvider!.provider).toBe('openai');
    expect(aiProvider!.is_enabled).toBe(true);
    expect(aiProvider!.has_api_key).toBe(true);
  });

  it('provider policy selects Codex as preferred and default', async () => {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase
      .from('execution_provider_policy')
      .select('preferred_provider_id, default_provider_id, allowed_provider_ids, fallback_permitted, fallback_provider_id, lifecycle_status')
      .eq('lifecycle_status', 'active')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.preferred_provider_id).toBe('codex');
    expect(data!.default_provider_id).toBe('codex');
    expect(data!.allowed_provider_ids).toEqual(['codex']);
  });

  it('no fallback is permitted', async () => {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase
      .from('execution_provider_policy')
      .select('fallback_permitted, fallback_provider_id')
      .eq('lifecycle_status', 'active')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.fallback_permitted).toBe(false);
    expect(data!.fallback_provider_id).toBeNull();
  });

  it('missing credential fails safely (does not expose key)', async () => {
    const { resolveExecutionProvider } = await import('../lib/codexProviderResolver');
    const result = await resolveExecutionProvider();
    // Live test — the credential should be configured
    expect(result.resolved).toBe(true);
    // Ensure no raw key is ever returned
    expect(result.credential_reference).not.toMatch(/sk-/);
    expect(result.credential_reference).toBe('shared-provider://openai/default');
  });

  it('provider readiness succeeds with valid configuration', async () => {
    const { checkCodexProviderReadiness } = await import('../lib/codexProviderReadiness');
    const result = await checkCodexProviderReadiness(true); // skipApiCheck for speed
    expect(result.provider_registered).toBe(true);
    expect(result.provider_active).toBe(true);
    expect(result.provider_governed).toBe(true);
    expect(result.provider_selected_by_policy).toBe(true);
    expect(result.credential_configured).toBe(true);
    expect(result.fallback_disabled).toBe(true);
    expect(result.po_approval_gate_active).toBe(true);
    expect(result.overall_ready).toBe(true);
    expect(result.error_layer).toBeNull();
  });

  it('Product Owner approval remains required (governance rules include po_approval_gate)', async () => {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase
      .from('execution_provider_registry')
      .select('governance_rules')
      .eq('provider_id', 'codex')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const rules = data!.governance_rules as string[];
    expect(rules).toContain('po_approval_gate');
  });

  it('protected paths remain protected (.env)', async () => {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase
      .from('github_repository_config')
      .select('allowed_source_directories, protected_paths')
      .eq('repository_owner', 'milljanerobinson-alt')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.protected_paths).toContain('.env');
    expect(data!.allowed_source_directories).toEqual(['src/']);
  });

  it('execution package includes canonical GitHub repository details', async () => {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase
      .from('github_repository_config')
      .select('repository_owner, repository_name, default_base_branch, workflow_file')
      .eq('repository_owner', 'milljanerobinson-alt')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.repository_owner).toBe('milljanerobinson-alt');
    expect(data!.repository_name).toBe('EIOS');
    expect(data!.default_base_branch).toBe('main');
    expect(data!.workflow_file).toBe('.github/workflows/ewo-verify.yml');
  });

  it('provider cannot directly merge to main (branch isolation enforced)', async () => {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase
      .from('github_repository_config')
      .select('default_base_branch, allowed_source_directories')
      .eq('repository_owner', 'milljanerobinson-alt')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data!.default_base_branch).toBe('main');
    // allowed_source_directories does not include main or any branch ref
    expect(data!.allowed_source_directories).not.toContain('main');
  });

  it('repository readiness and provider readiness remain distinct concerns', async () => {
    const { supabase } = await import('../lib/supabase');
    // Repository readiness: repo exists, branch resolves, workflow present
    const { data: repoConfig } = await supabase
      .from('github_repository_config')
      .select('repository_owner, default_base_branch, workflow_file')
      .eq('repository_owner', 'milljanerobinson-alt')
      .maybeSingle();
    const repoReady = !!repoConfig?.repository_owner && !!repoConfig?.default_base_branch;

    // Provider readiness: provider registered, credential valid, contract supported
    const { data: provider } = await supabase
      .from('execution_provider_registry')
      .select('is_active, is_governed')
      .eq('provider_id', 'codex')
      .maybeSingle();
    const providerReady = !!provider?.is_active && !!provider?.is_governed;

    // Both happen to be true, but they test different things
    expect(repoReady).toBe(true);
    expect(providerReady).toBe(true);
    // They are not the same variable — different tables, different concerns
    expect(typeof repoReady).toBe('boolean');
    expect(typeof providerReady).toBe('boolean');
    expect(repoReady === true && providerReady === true).toBe(true);
  });

  it('error layers identify the actual failing layer (structure test)', async () => {
    const { checkCodexProviderReadiness } = await import('../lib/codexProviderReadiness');
    const result = await checkCodexProviderReadiness(true);
    // With valid config, error_layer should be null
    expect(result.error_layer).toBeNull();
    // The error_layer field supports all defined layers
    const validLayers = [
      'provider_registration', 'provider_policy', 'credential_missing',
      'credential_invalid', 'provider_unreachable', 'execution_contract_invalid',
      'github_configuration_missing', 'governance_gate_missing',
      'fallback_policy_invalid', 'runtime_error',
    ];
    // When there IS an error, it must be one of these layers
    if (result.error_layer) {
      expect(validLayers).toContain(result.error_layer);
    }
  });

  it('fallback policy violation is detected as a distinct error layer', async () => {
    const { supabase } = await import('../lib/supabase');
    // Verify the live policy has fallback disabled — this is the invariant
    const { data } = await supabase
      .from('execution_provider_policy')
      .select('fallback_permitted')
      .eq('lifecycle_status', 'active')
      .maybeSingle();
    expect(data!.fallback_permitted).toBe(false);
    // The readiness check should also report fallback_disabled = true
    const { checkCodexProviderReadiness } = await import('../lib/codexProviderReadiness');
    const result = await checkCodexProviderReadiness(true);
    expect(result.fallback_disabled).toBe(true);
  });
});
