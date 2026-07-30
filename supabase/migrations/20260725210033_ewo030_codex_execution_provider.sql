/*
# EWO-030: OpenAI Codex Governed Execution Provider

## Purpose
Registers OpenAI Codex as a governed execution provider within EIOS and adds
the supporting infrastructure for credentials, budgets, trial metrics, and
execution attempts.

## Changes

### 1. Register Codex in execution_provider_registry
- Inserts a new row for provider_id = 'codex'
- Codex is registered as INACTIVE (is_active = false)
- Provider type = 'external' (external API provider)
- Governance rules include constitutional compliance, audit trail, budget enforcement,
  credential isolation, read-only boundary, and deterministic behaviour
- Provider config declares supported operations, models, and feature flags
- Bolt provider remains unchanged

### 2. New Table: codex_provider_credentials
- Stores opaque secret references (NOT secret values) for Codex API credentials
- Supports environment-specific credentials (staging, production)
- Tracks credential status: configured, valid, invalid, expired, revoked, unavailable
- Supports rotation (new credential reference replaces old, old is revoked)
- credential_reference is an opaque string referencing the EIOS secret store
- The actual API key is NEVER stored in this table

### 3. New Table: codex_budget_config
- Governed budget configuration for Codex executions
- Supports per-execution, per-EWO, daily, monthly limits
- Warning, approval, and hard-stop thresholds
- Pricing metadata (input/output/cached token prices, currency, effective date, source)
- Pricing is configurable governed metadata, not embedded in routing logic

### 4. New Table: codex_execution_attempts
- Records every attempt for a Codex execution separately
- Links to the original execution via execution_ref
- Tracks attempt status, failure reason, tokens used, cost, duration
- Enables retry tracking and budget accumulation

### 5. New Table: codex_trial_metrics
- Captures comparison metrics for every Codex execution
- Task type, complexity, risk, duration, cost, token usage, files changed
- Tests passed/failed, retry count, manual corrections, governance interventions
- Completion package quality, PO result, accepted/rejected
- Whether Bolt was subsequently required, rejection/escalation reason

### 6. New Table: codex_provider_health
- Records provider health check results
- Tracks configuration, secret, auth, API, model, contract, rate-limit status
- Last successful and last failed health check timestamps

### 7. RLS Policies
- All new tables: SELECT for anon + authenticated (governed inspection access)
- INSERT/UPDATE for authenticated only (governed operations)
- DELETE for authenticated only (governed cleanup)

### 8. Indexes
- Indexes on frequently queried columns (provider_id, execution_ref, ewo_ref, environment)
*/

-- ─── 1. Register Codex in execution_provider_registry ────────────────────────

INSERT INTO execution_provider_registry (
  provider_id, provider_name, provider_version, provider_type,
  is_active, is_governed, governance_rules, provider_config,
  canonical_contract_version, registered_by
) VALUES (
  'codex',
  'OpenAI Codex Execution Provider',
  '1.0.0',
  'external',
  false,
  true,
  '["constitutional_compliance","audit_trail","budget_enforcement","credential_isolation","read_only_boundary","deterministic_behaviour","provider_independence","po_approval_gate"]'::jsonb,
  '{
    "engine_id": "codex",
    "api_base_url": "https://api.openai.com/v1",
    "supported_operations": [
      "inspect_repository_context",
      "analyse_engineering_task",
      "propose_implementation_plan",
      "generate_code_changes",
      "modify_files",
      "create_new_files",
      "delete_files_authorised",
      "execute_approved_commands",
      "run_tests",
      "analyse_test_failures",
      "refine_implementation",
      "produce_execution_diagnostics",
      "produce_completion_package",
      "return_structured_execution_results"
    ],
    "supported_models": ["codex-mini-latest", "o3-mini", "o4-mini"],
    "default_model": "codex-mini-latest",
    "supports_file_writes": true,
    "supports_database_migrations": false,
    "supports_tests": true,
    "supports_builds": true,
    "supports_deploy": false,
    "supports_rollback": false,
    "requires_credential": true,
    "requires_budget": true,
    "max_context_tokens": 192000,
    "max_output_tokens": 16384
  }'::jsonb,
  '1.0',
  'system'
) ON CONFLICT (provider_id) DO UPDATE SET
  provider_name = EXCLUDED.provider_name,
  provider_version = EXCLUDED.provider_version,
  provider_type = EXCLUDED.provider_type,
  governance_rules = EXCLUDED.governance_rules,
  provider_config = EXCLUDED.provider_config,
  canonical_contract_version = EXCLUDED.canonical_contract_version,
  updated_at = now();

-- ─── 2. codex_provider_credentials ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS codex_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_ref text UNIQUE NOT NULL,
  environment text NOT NULL DEFAULT 'staging',
  credential_reference text NOT NULL,
  credential_status text NOT NULL DEFAULT 'unavailable',
  configured_by text,
  configured_at timestamptz DEFAULT now(),
  validated_at timestamptz,
  last_validation_status text,
  last_validation_detail text,
  rotated_from text,
  rotated_at timestamptz,
  revoked_at timestamptz,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE codex_provider_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_codex_credentials" ON codex_provider_credentials;
CREATE POLICY "anon_select_codex_credentials" ON codex_provider_credentials
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_codex_credentials" ON codex_provider_credentials;
CREATE POLICY "auth_insert_codex_credentials" ON codex_provider_credentials
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_codex_credentials" ON codex_provider_credentials;
CREATE POLICY "auth_update_codex_credentials" ON codex_provider_credentials
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_codex_credentials" ON codex_provider_credentials;
CREATE POLICY "auth_delete_codex_credentials" ON codex_provider_credentials
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_codex_credentials_env ON codex_provider_credentials(environment);
CREATE INDEX IF NOT EXISTS idx_codex_credentials_current ON codex_provider_credentials(is_current) WHERE is_current = true;

-- ─── 3. codex_budget_config ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS codex_budget_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL DEFAULT 'staging',
  per_execution_limit_usd numeric(12,4) NOT NULL DEFAULT 10.0000,
  per_ewo_limit_usd numeric(12,4) NOT NULL DEFAULT 50.0000,
  daily_limit_usd numeric(12,4) NOT NULL DEFAULT 100.0000,
  monthly_limit_usd numeric(12,4) NOT NULL DEFAULT 1000.0000,
  warning_threshold_pct numeric(5,2) NOT NULL DEFAULT 50.00,
  approval_threshold_pct numeric(5,2) NOT NULL DEFAULT 80.00,
  hard_stop_threshold_pct numeric(5,2) NOT NULL DEFAULT 100.00,
  currency text NOT NULL DEFAULT 'USD',
  input_token_price_per_1m numeric(12,6) NOT NULL DEFAULT 1.500000,
  cached_input_token_price_per_1m numeric(12,6) NOT NULL DEFAULT 0.375000,
  output_token_price_per_1m numeric(12,6) NOT NULL DEFAULT 6.000000,
  pricing_effective_date date NOT NULL DEFAULT CURRENT_DATE,
  pricing_source text NOT NULL DEFAULT 'governed_registry',
  pricing_snapshot jsonb DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  configured_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE codex_budget_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_codex_budget" ON codex_budget_config;
CREATE POLICY "anon_select_codex_budget" ON codex_budget_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_codex_budget" ON codex_budget_config;
CREATE POLICY "auth_insert_codex_budget" ON codex_budget_config
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_codex_budget" ON codex_budget_config;
CREATE POLICY "auth_update_codex_budget" ON codex_budget_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_codex_budget" ON codex_budget_config;
CREATE POLICY "auth_delete_codex_budget" ON codex_budget_config
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_codex_budget_env ON codex_budget_config(environment);

-- ─── 4. codex_execution_attempts ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS codex_execution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_ref text UNIQUE NOT NULL,
  execution_ref text NOT NULL,
  ewo_ref text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  attempt_status text NOT NULL DEFAULT 'pending',
  failure_reason text,
  model_used text,
  estimated_input_tokens bigint,
  estimated_cached_input_tokens bigint,
  estimated_output_tokens bigint,
  actual_input_tokens bigint,
  actual_cached_input_tokens bigint,
  actual_output_tokens bigint,
  estimated_cost_usd numeric(12,6),
  actual_cost_usd numeric(12,6),
  cost_variance_usd numeric(12,6),
  attempt_start timestamptz,
  attempt_finish timestamptz,
  duration_ms integer,
  provider_diagnostics jsonb DEFAULT '{}',
  response_contract_valid boolean,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE codex_execution_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_codex_attempts" ON codex_execution_attempts;
CREATE POLICY "anon_select_codex_attempts" ON codex_execution_attempts
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_codex_attempts" ON codex_execution_attempts;
CREATE POLICY "auth_insert_codex_attempts" ON codex_execution_attempts
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_codex_attempts" ON codex_execution_attempts;
CREATE POLICY "auth_update_codex_attempts" ON codex_execution_attempts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_codex_attempts" ON codex_execution_attempts;
CREATE POLICY "auth_delete_codex_attempts" ON codex_execution_attempts
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_codex_attempts_exec ON codex_execution_attempts(execution_ref);
CREATE INDEX IF NOT EXISTS idx_codex_attempts_ewo ON codex_execution_attempts(ewo_ref);

-- ─── 5. codex_trial_metrics ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS codex_trial_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_ref text NOT NULL,
  ewo_ref text NOT NULL,
  task_type text,
  complexity_classification text,
  risk_classification text,
  execution_duration_ms integer,
  estimated_cost_usd numeric(12,6),
  actual_cost_usd numeric(12,6),
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  files_changed integer DEFAULT 0,
  files_created integer DEFAULT 0,
  files_modified integer DEFAULT 0,
  files_deleted integer DEFAULT 0,
  tests_passed integer DEFAULT 0,
  tests_failed integer DEFAULT 0,
  retry_count integer DEFAULT 0,
  manual_corrections_required integer DEFAULT 0,
  governance_interventions integer DEFAULT 0,
  completion_package_quality text,
  product_owner_result text,
  accepted_or_rejected text,
  bolt_subsequently_required boolean DEFAULT false,
  rejection_or_escalation_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE codex_trial_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_codex_trial" ON codex_trial_metrics;
CREATE POLICY "anon_select_codex_trial" ON codex_trial_metrics
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_codex_trial" ON codex_trial_metrics;
CREATE POLICY "auth_insert_codex_trial" ON codex_trial_metrics
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_codex_trial" ON codex_trial_metrics;
CREATE POLICY "auth_update_codex_trial" ON codex_trial_metrics
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_codex_trial" ON codex_trial_metrics;
CREATE POLICY "auth_delete_codex_trial" ON codex_trial_metrics
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_codex_trial_ewo ON codex_trial_metrics(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_codex_trial_exec ON codex_trial_metrics(execution_ref);

-- ─── 6. codex_provider_health ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS codex_provider_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL DEFAULT 'staging',
  check_ref text UNIQUE NOT NULL,
  configuration_status text NOT NULL DEFAULT 'unknown',
  secret_availability_status text NOT NULL DEFAULT 'unknown',
  authentication_status text NOT NULL DEFAULT 'unknown',
  api_accessibility_status text NOT NULL DEFAULT 'unknown',
  model_availability_status text NOT NULL DEFAULT 'unknown',
  contract_compatibility_status text NOT NULL DEFAULT 'unknown',
  rate_limit_status text,
  diagnostics jsonb DEFAULT '{}',
  is_healthy boolean NOT NULL DEFAULT false,
  checked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE codex_provider_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_codex_health" ON codex_provider_health;
CREATE POLICY "anon_select_codex_health" ON codex_provider_health
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_codex_health" ON codex_provider_health;
CREATE POLICY "auth_insert_codex_health" ON codex_provider_health
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_codex_health" ON codex_provider_health;
CREATE POLICY "auth_update_codex_health" ON codex_provider_health
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_codex_health" ON codex_provider_health;
CREATE POLICY "auth_delete_codex_health" ON codex_provider_health
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_codex_health_env ON codex_provider_health(environment);
CREATE INDEX IF NOT EXISTS idx_codex_health_checked ON codex_provider_health(checked_at DESC);

-- ─── 7. Update execution_provider_registry with additional columns ───────────

DO $$ BEGIN
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS provider_type_detail text;
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS configuration_status text DEFAULT 'not_configured';
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS credential_reference_status text DEFAULT 'unavailable';
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS provider_health text DEFAULT 'unknown';
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS last_successful_health_check timestamptz;
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS last_failed_health_check timestamptz;
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS pricing_metadata jsonb DEFAULT '{}';
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS pricing_effective_date date;
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS configured_budget_limits jsonb DEFAULT '{}';
  ALTER TABLE execution_provider_registry ADD COLUMN IF NOT EXISTS permitted_environments jsonb DEFAULT '["staging","production"]'::jsonb;
END $$;

-- Update Bolt with its metadata
UPDATE execution_provider_registry SET
  provider_type_detail = 'native_implementation',
  configuration_status = 'configured',
  credential_reference_status = 'not_required',
  provider_health = 'healthy',
  pricing_metadata = '{"model": "bolt_agent", "pricing_source": "platform_included"}'::jsonb,
  pricing_effective_date = CURRENT_DATE,
  configured_budget_limits = '{}'::jsonb
WHERE provider_id = 'bolt';

-- Update Codex with its metadata
UPDATE execution_provider_registry SET
  provider_type_detail = 'external_api',
  configuration_status = 'not_configured',
  credential_reference_status = 'unavailable',
  provider_health = 'unknown',
  pricing_metadata = '{}'::jsonb,
  pricing_effective_date = NULL,
  configured_budget_limits = '{}'::jsonb,
  permitted_environments = '["staging"]'::jsonb
WHERE provider_id = 'codex';

-- ─── 8. Seed default budget config for staging ───────────────────────────────

INSERT INTO codex_budget_config (
  environment, per_execution_limit_usd, per_ewo_limit_usd,
  daily_limit_usd, monthly_limit_usd,
  warning_threshold_pct, approval_threshold_pct, hard_stop_threshold_pct,
  currency, input_token_price_per_1m, cached_input_token_price_per_1m,
  output_token_price_per_1m, pricing_effective_date, pricing_source,
  is_active, configured_by
) VALUES (
  'staging', 10.0000, 50.0000, 100.0000, 1000.0000,
  50.00, 80.00, 100.00,
  'USD', 1.500000, 0.375000, 6.000000,
  CURRENT_DATE, 'governed_registry',
  true, 'system'
) ON CONFLICT DO NOTHING;