/*
# Centralised AI Provider Configuration

## Summary
Introduces infrastructure for a single platform-managed AI provider so customers
never need to supply their own API keys. All AI features route through one
central configuration owned by the platform operator.

## Changes

### New Tables

1. `ai_usage_log`
   Records every AI request made across all platform features.
   Columns: id, feature, provider, model, prompt_tokens, completion_tokens,
            estimated_cost_usd, duration_ms, success, error_message,
            cache_hit, user_id, organisation_id, created_at

2. `ai_response_cache`
   Stores hashed request fingerprints so identical requests are served from
   cache, reducing provider costs for repeated unit lookups and common queries.
   Columns: id, cache_key (unique), feature, response_body, hit_count,
            expires_at, created_at

### Extended Settings Keys (documentation only — stored in existing `settings` table)
The following setting keys are now formally recognised by the platform:
  - ai_provider          : "openai" | "anthropic"
  - llm_api_key          : encrypted API key (existing)
  - llm_model            : model identifier (existing)
  - llm_base_url         : optional custom endpoint (existing)
  - ai_temperature       : float 0.0-2.0, default 0.7
  - ai_max_tokens        : integer, default 4096
  - ai_request_timeout   : integer seconds, default 30
  - ai_retry_count       : integer 0-5, default 2
  - ai_daily_usage_limit : integer max requests/day, 0 = unlimited

## Security
- RLS enabled on both tables.
- `ai_usage_log`: authenticated users can read, only service role inserts.
- `ai_response_cache`: service role only (internal caching layer).

## Notes
- The `estimated_cost_usd` is an approximation based on public pricing tiers.
- Cache TTL is managed via `expires_at`; expired rows are safe to delete.
- `cache_key` is a SHA-256 hex digest of the canonical request payload.
*/

-- ── ai_usage_log ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature          text NOT NULL,
  provider         text NOT NULL DEFAULT 'openai',
  model            text NOT NULL,
  prompt_tokens    integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  duration_ms      integer NOT NULL DEFAULT 0,
  success          boolean NOT NULL DEFAULT true,
  error_message    text,
  cache_hit        boolean NOT NULL DEFAULT false,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature     ON ai_usage_log(feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created_at  ON ai_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_id     ON ai_usage_log(user_id);

DROP POLICY IF EXISTS "admins_read_ai_usage_log" ON ai_usage_log;
CREATE POLICY "admins_read_ai_usage_log" ON ai_usage_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Service role performs inserts; no INSERT policy needed for anon/authenticated.

-- ── ai_response_cache ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_response_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key     text NOT NULL UNIQUE,
  feature       text NOT NULL,
  response_body jsonb NOT NULL,
  hit_count     integer NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_response_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_key        ON ai_response_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires_at ON ai_response_cache(expires_at);

-- No anon/authenticated policies — this table is service-role only.
-- Service role bypasses RLS; no policies are needed for internal access.
