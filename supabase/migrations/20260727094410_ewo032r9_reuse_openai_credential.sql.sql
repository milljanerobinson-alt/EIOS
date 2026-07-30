-- EWO-032R.9: Reuse existing OpenAI credential for governed Codex Execution
--
-- The Codex provider no longer maintains an independent credential. It
-- references the existing AI Infrastructure OpenAI credential via an opaque
-- identifier. The raw key continues to live in settings.openai_api_key (the
-- pre-existing source of truth) and is never duplicated into Codex tables.
--
-- SECURITY NOTE: settings.openai_api_key stores the raw key in plaintext. This
-- is a pre-existing limitation of the AI Infrastructure credential model
-- (save-provider-key edge function). Codex reuses this source as an interim
-- compatibility path and does not expand the pattern.

-- 1. Drop the vault table from the aborted independent-credential direction.
DROP TABLE IF EXISTS codex_secret_vault;

-- 2. Add a credential source reference column to the registry so the opaque
--    identifier is persisted alongside provider readiness state.
ALTER TABLE execution_provider_registry
  ADD COLUMN IF NOT EXISTS credential_source_reference text;

-- 3. Seed the opaque reference for the Codex provider.
UPDATE execution_provider_registry
SET credential_source_reference = 'shared-provider://openai/default',
    configuration_status = 'not_configured',
    credential_reference_status = 'unavailable',
    updated_at = now()
WHERE provider_id = 'codex';
