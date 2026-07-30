/*
# AI Multi-Provider Registry

## Purpose
Stores configuration, health status, and metadata for each AI provider (OpenAI, Gemini, Anthropic).
Enables the platform to support multiple providers simultaneously with one designated as default.
API keys are stored separately in the `settings` table as `{provider}_api_key`.

## New Tables
- `ai_provider_configs`
  - `provider` (text, unique) — 'openai' | 'gemini' | 'anthropic'
  - `display_name` (text) — human-readable name
  - `is_enabled` (boolean) — whether this provider is available for use
  - `is_default` (boolean) — only one provider should be default at a time
  - `model` (text) — currently selected model for this provider
  - `available_models` (jsonb) — array of model strings
  - `base_url` (text) — custom base URL override
  - `has_api_key` (boolean) — whether a key has been stored
  - `health_status`, `health_latency_ms`, `health_message`, `health_checked_at`

## Security
- RLS enabled with anon + authenticated access

## Notes
1. `has_api_key` is set by save-provider-key edge function
2. api-service.ts checks this table for the active default provider
3. API keys live in settings as `{provider}_api_key` — not in this table
*/

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text        UNIQUE NOT NULL,
  display_name      text        NOT NULL DEFAULT '',
  is_enabled        boolean     NOT NULL DEFAULT false,
  is_default        boolean     NOT NULL DEFAULT false,
  model             text        NOT NULL DEFAULT '',
  available_models  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  base_url          text        NOT NULL DEFAULT '',
  has_api_key       boolean     NOT NULL DEFAULT false,
  health_status     text        NOT NULL DEFAULT 'unknown',
  health_latency_ms integer,
  health_message    text,
  health_checked_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_provider_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ai_provider_configs"  ON ai_provider_configs;
DROP POLICY IF EXISTS "anon_insert_ai_provider_configs"  ON ai_provider_configs;
DROP POLICY IF EXISTS "anon_update_ai_provider_configs"  ON ai_provider_configs;
DROP POLICY IF EXISTS "anon_delete_ai_provider_configs"  ON ai_provider_configs;

CREATE POLICY "anon_select_ai_provider_configs" ON ai_provider_configs FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_ai_provider_configs" ON ai_provider_configs FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_ai_provider_configs" ON ai_provider_configs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_ai_provider_configs" ON ai_provider_configs FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO ai_provider_configs (provider, display_name, is_enabled, is_default, model, available_models)
VALUES
  ('openai',    'OpenAI',           false, false, 'gpt-4o',
   '["gpt-4o","gpt-4o-mini","gpt-4-turbo","gpt-3.5-turbo","o1","o1-mini","o3-mini"]'::jsonb),
  ('gemini',    'Google Gemini',    false, false, 'gemini-2.5-flash',
   '["gemini-2.5-flash","gemini-2.5-pro","gemini-1.5-flash","gemini-1.5-pro","gemini-flash-8b"]'::jsonb),
  ('anthropic', 'Anthropic Claude', false, false, 'claude-3-5-sonnet-20241022',
   '["claude-opus-4-5","claude-3-5-sonnet-20241022","claude-3-5-haiku-20241022","claude-3-opus-20240229"]'::jsonb)
ON CONFLICT (provider) DO NOTHING;
