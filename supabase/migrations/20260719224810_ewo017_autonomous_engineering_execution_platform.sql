/*
# EWO-017 — Autonomous Engineering Execution Platform v1.0

## Purpose

Establishes the permanent database foundation for governed autonomous
engineering execution. ATD can now take an approved Engineering Work Order
and execute the complete engineering lifecycle through staging without
manual engineering intervention. Production deployment remains governed by
Product Owner approval.

## New Tables

### execution_targets
Registers the multi-repository targets ATD can execute against.
- `id` (uuid PK)
- `target_ref` (text, unique — e.g. "ET-001")
- `platform` (text — e.g. "EIOS Platform", "LLND Automate")
- `repository` (text — e.g. "eios-platform", "llnd-automate")
- `default_branch` (text — e.g. "main", "staging")
- `staging_branch` (text — e.g. "staging")
- `production_branch` (text — e.g. "main")
- `description` (text)
- `is_protected` (bool — if true, modifications require constitutional approval)
- `is_active` (bool, default true)
- `created_at`, `updated_at`

### execution_sessions
A session represents one orchestrated execution of an EWO through the
complete 10-stage pipeline. Sessions are resumable — every stage is recorded.
- `id` (uuid PK)
- `session_ref` (text, unique — e.g. "ES-001")
- `execution_id` (uuid, FK → engineering_executions ON DELETE CASCADE)
- `ewo_id` (uuid, FK → engineering_work_orders)
- `target_id` (uuid, FK → execution_targets)
- `current_stage` (text — one of the 10 pipeline stages)
- `stage_status` (text — pending | running | complete | failed | skipped)
- `is_resumable` (bool, default true)
- `started_at`, `completed_at`, `resumed_at`
- `failure_stage` (text, nullable)
- `failure_reason` (text, nullable)
- `recovery_action` (text — resume | retry | abort | rollback | null)
- `metadata` (jsonb)
- `created_at`, `updated_at`

### execution_stage_records
One row per stage per session — the observable, resumable pipeline log.
- `id` (uuid PK)
- `session_id` (uuid, FK → execution_sessions ON DELETE CASCADE)
- `stage_key` (text — load_context | load_ewo | load_plan | load_related | determine_components | prepare_package | invoke_engine | receive_impl | validate_impl | record_evidence)
- `stage_label` (text)
- `status` (text — pending | running | complete | failed | skipped)
- `started_at`, `completed_at` (timestamptz)
- `duration_ms` (integer)
- `detail` (text)
- `error` (text)
- `evidence` (jsonb)
- `created_at`

### execution_deployments
Records each staging and production deployment with health and rollback.
- `id` (uuid PK)
- `deployment_ref` (text, unique — e.g. "ED-001")
- `session_id` (uuid, FK → execution_sessions ON DELETE CASCADE)
- `execution_id` (uuid, FK → engineering_executions)
- `environment` (text — staging | production)
- `target_id` (uuid, FK → execution_targets)
- `branch` (text)
- `commit_ref` (text)
- `status` (text — pending | deploying | healthy | failed | rolled_back)
- `health_checks` (jsonb — { app, database, apis, background_jobs })
- `deployed_at`, `verified_at`, `rolled_back_at`
- `rollback_reason` (text, nullable)
- `evidence` (jsonb)
- `created_at`, `updated_at`

### execution_audit_trail
The comprehensive, reproducible audit record for every execution.
- `id` (uuid PK)
- `audit_ref` (text, unique — e.g. "EAT-001")
- `session_id` (uuid, FK → execution_sessions ON DELETE CASCADE)
- `execution_id` (uuid, FK → engineering_executions)
- `ewo_ref` (text)
- `implementation_engine` (text)
- `implementation_engine_version` (text)
- `target_platform` (text)
- `target_repository` (text)
- `target_branch` (text)
- `commit_ref` (text)
- `deployment_refs` (text[] — array of deployment refs)
- `verification_summary` (jsonb)
- `evidence_summary` (jsonb)
- `approvals` (jsonb — { plan, review, po, production })
- `rollback_events` (jsonb)
- `reproducibility_hash` (text)
- `created_at`

### protected_components
Self-engineering governance — components that cannot be modified without
constitutional approval.
- `id` (uuid PK)
- `component_ref` (text, unique)
- `component_path` (text — file path or directory)
- `component_type` (text — source | migration | config | standard | runtime)
- `protection_level` (text — constitutional | governed)
- `requires_constitutional_approval` (bool, default true)
- `description` (text)
- `created_at`, `updated_at`

### implementation_engine_registry
Registry of available implementation engines behind the abstraction.
- `id` (uuid PK)
- `engine_id` (text, unique — e.g. "bolt", "claude_code", "codex")
- `engine_name` (text)
- `engine_version` (text)
- `is_active` (bool, default true)
- `supports_file_writes` (bool)
- `supports_database_migrations` (bool)
- `supports_tests` (bool)
- `supports_builds` (bool)
- `capabilities` (jsonb)
- `created_at`, `updated_at`

## Modified Tables

### engineering_executions
- Added `session_id` (uuid, nullable) — link to the active execution session
- Added `target_id` (uuid, nullable) — link to the execution target
- Added `commit_ref` (text, nullable) — VCS commit reference
- Added `deployment_id` (uuid, nullable) — link to the active deployment
- Added `is_self_engineering` (bool, default false) — flags self-modifications

## Security

- RLS enabled on all new tables.
- All authenticated users have full CRUD (internal ECC governance tool).
- No anon access.

## Important Notes

1. All new tables are additive — no existing data is modified or lost.
2. The `engineering_executions` columns are nullable so existing rows are
   unaffected.
3. Indexes are created on foreign keys and frequently-queried columns.
4. Initial execution targets (EIOS Platform, LLND Automate) are seeded.
5. Initial implementation engines (Bolt, Claude Code, Codex) are seeded.
6. Protected components for the constitutional layer are seeded.
*/

-- ─── Add columns to engineering_executions ───────────────────────────────────

ALTER TABLE engineering_executions
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS commit_ref text,
  ADD COLUMN IF NOT EXISTS deployment_id uuid,
  ADD COLUMN IF NOT EXISTS is_self_engineering boolean DEFAULT false;

-- ─── execution_targets ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_ref text UNIQUE NOT NULL,
  platform text NOT NULL,
  repository text NOT NULL,
  default_branch text DEFAULT 'main',
  staging_branch text DEFAULT 'staging',
  production_branch text DEFAULT 'main',
  description text,
  is_protected boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE execution_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_targets" ON execution_targets;
CREATE POLICY "select_execution_targets" ON execution_targets FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_execution_targets" ON execution_targets;
CREATE POLICY "insert_execution_targets" ON execution_targets FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_execution_targets" ON execution_targets;
CREATE POLICY "update_execution_targets" ON execution_targets FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_execution_targets" ON execution_targets;
CREATE POLICY "delete_execution_targets" ON execution_targets FOR DELETE
  TO authenticated USING (true);

-- ─── execution_sessions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_ref text UNIQUE NOT NULL,
  execution_id uuid REFERENCES engineering_executions(id) ON DELETE CASCADE,
  ewo_id uuid REFERENCES engineering_work_orders(id),
  target_id uuid REFERENCES execution_targets(id),
  current_stage text,
  stage_status text DEFAULT 'pending',
  is_resumable boolean DEFAULT true,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  resumed_at timestamptz,
  failure_stage text,
  failure_reason text,
  recovery_action text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE execution_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_sessions" ON execution_sessions;
CREATE POLICY "select_execution_sessions" ON execution_sessions FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_execution_sessions" ON execution_sessions;
CREATE POLICY "insert_execution_sessions" ON execution_sessions FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_execution_sessions" ON execution_sessions;
CREATE POLICY "update_execution_sessions" ON execution_sessions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_execution_sessions" ON execution_sessions;
CREATE POLICY "delete_execution_sessions" ON execution_sessions FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_es_execution_id ON execution_sessions(execution_id);
CREATE INDEX IF NOT EXISTS idx_es_ewo_id ON execution_sessions(ewo_id);
CREATE INDEX IF NOT EXISTS idx_es_target_id ON execution_sessions(target_id);
CREATE INDEX IF NOT EXISTS idx_es_current_stage ON execution_sessions(current_stage);

-- ─── execution_stage_records ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_stage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES execution_sessions(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  stage_label text NOT NULL,
  status text DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  detail text,
  error text,
  evidence jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE execution_stage_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_stage_records" ON execution_stage_records;
CREATE POLICY "select_execution_stage_records" ON execution_stage_records FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_execution_stage_records" ON execution_stage_records;
CREATE POLICY "insert_execution_stage_records" ON execution_stage_records FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_execution_stage_records" ON execution_stage_records;
CREATE POLICY "update_execution_stage_records" ON execution_stage_records FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_execution_stage_records" ON execution_stage_records;
CREATE POLICY "delete_execution_stage_records" ON execution_stage_records FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_esr_session_id ON execution_stage_records(session_id);
CREATE INDEX IF NOT EXISTS idx_esr_status ON execution_stage_records(status);

-- ─── execution_deployments ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_ref text UNIQUE NOT NULL,
  session_id uuid REFERENCES execution_sessions(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES engineering_executions(id),
  environment text NOT NULL,
  target_id uuid REFERENCES execution_targets(id),
  branch text,
  commit_ref text,
  status text DEFAULT 'pending',
  health_checks jsonb DEFAULT '{}'::jsonb,
  deployed_at timestamptz,
  verified_at timestamptz,
  rolled_back_at timestamptz,
  rollback_reason text,
  evidence jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE execution_deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_deployments" ON execution_deployments;
CREATE POLICY "select_execution_deployments" ON execution_deployments FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_execution_deployments" ON execution_deployments;
CREATE POLICY "insert_execution_deployments" ON execution_deployments FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_execution_deployments" ON execution_deployments;
CREATE POLICY "update_execution_deployments" ON execution_deployments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_execution_deployments" ON execution_deployments;
CREATE POLICY "delete_execution_deployments" ON execution_deployments FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ed_session_id ON execution_deployments(session_id);
CREATE INDEX IF NOT EXISTS idx_ed_execution_id ON execution_deployments(execution_id);
CREATE INDEX IF NOT EXISTS idx_ed_environment ON execution_deployments(environment);
CREATE INDEX IF NOT EXISTS idx_ed_status ON execution_deployments(status);

-- ─── execution_audit_trail ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_ref text UNIQUE NOT NULL,
  session_id uuid REFERENCES execution_sessions(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES engineering_executions(id),
  ewo_ref text,
  implementation_engine text,
  implementation_engine_version text,
  target_platform text,
  target_repository text,
  target_branch text,
  commit_ref text,
  deployment_refs text[] DEFAULT '{}',
  verification_summary jsonb DEFAULT '{}'::jsonb,
  evidence_summary jsonb DEFAULT '{}'::jsonb,
  approvals jsonb DEFAULT '{}'::jsonb,
  rollback_events jsonb DEFAULT '[]'::jsonb,
  reproducibility_hash text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE execution_audit_trail ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_audit_trail" ON execution_audit_trail;
CREATE POLICY "select_execution_audit_trail" ON execution_audit_trail FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_execution_audit_trail" ON execution_audit_trail;
CREATE POLICY "insert_execution_audit_trail" ON execution_audit_trail FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_execution_audit_trail" ON execution_audit_trail;
CREATE POLICY "update_execution_audit_trail" ON execution_audit_trail FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_execution_audit_trail" ON execution_audit_trail;
CREATE POLICY "delete_execution_audit_trail" ON execution_audit_trail FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_eat_session_id ON execution_audit_trail(session_id);
CREATE INDEX IF NOT EXISTS idx_eat_execution_id ON execution_audit_trail(execution_id);
CREATE INDEX IF NOT EXISTS idx_eat_ewo_ref ON execution_audit_trail(ewo_ref);

-- ─── protected_components ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS protected_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_ref text UNIQUE NOT NULL,
  component_path text NOT NULL,
  component_type text NOT NULL,
  protection_level text DEFAULT 'governed',
  requires_constitutional_approval boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE protected_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_protected_components" ON protected_components;
CREATE POLICY "select_protected_components" ON protected_components FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_protected_components" ON protected_components;
CREATE POLICY "insert_protected_components" ON protected_components FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_protected_components" ON protected_components;
CREATE POLICY "update_protected_components" ON protected_components FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_protected_components" ON protected_components;
CREATE POLICY "delete_protected_components" ON protected_components FOR DELETE
  TO authenticated USING (true);

-- ─── implementation_engine_registry ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS implementation_engine_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id text UNIQUE NOT NULL,
  engine_name text NOT NULL,
  engine_version text,
  is_active boolean DEFAULT true,
  supports_file_writes boolean DEFAULT true,
  supports_database_migrations boolean DEFAULT true,
  supports_tests boolean DEFAULT true,
  supports_builds boolean DEFAULT true,
  capabilities jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE implementation_engine_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_implementation_engine_registry" ON implementation_engine_registry;
CREATE POLICY "select_implementation_engine_registry" ON implementation_engine_registry FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_implementation_engine_registry" ON implementation_engine_registry;
CREATE POLICY "insert_implementation_engine_registry" ON implementation_engine_registry FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_implementation_engine_registry" ON implementation_engine_registry;
CREATE POLICY "update_implementation_engine_registry" ON implementation_engine_registry FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_implementation_engine_registry" ON implementation_engine_registry;
CREATE POLICY "delete_implementation_engine_registry" ON implementation_engine_registry FOR DELETE
  TO authenticated USING (true);

-- ─── Seed initial execution targets ──────────────────────────────────────────

INSERT INTO execution_targets (target_ref, platform, repository, default_branch, staging_branch, production_branch, description, is_protected, is_active)
VALUES
  ('ET-001', 'EIOS Platform', 'eios-platform', 'main', 'staging', 'main', 'The EIOS Engineering Intelligence Platform itself — self-engineering target', true, true),
  ('ET-002', 'LLND Automate', 'llnd-automate', 'main', 'staging', 'main', 'LLND Automate customer-facing application', false, true)
ON CONFLICT (target_ref) DO NOTHING;

-- ─── Seed initial implementation engines ──────────────────────────────────────

INSERT INTO implementation_engine_registry (engine_id, engine_name, engine_version, is_active, supports_file_writes, supports_database_migrations, supports_tests, supports_builds, capabilities)
VALUES
  ('bolt', 'Bolt', '1.0', true, true, true, true, true, '{"description": "Bolt AI development platform"}'::jsonb),
  ('claude_code', 'Claude Code', '1.0', true, true, true, true, true, '{"description": "Anthropic Claude Code engine"}'::jsonb),
  ('codex', 'Codex', '1.0', true, true, true, true, true, '{"description": "OpenAI Codex engine"}'::jsonb),
  ('eios_code_engine', 'EIOS Code Engine', '1.0', true, true, true, true, true, '{"description": "Internal EIOS code engine"}'::jsonb),
  ('manual', 'Manual', '1.0', true, false, false, false, false, '{"description": "Manual implementation by human engineer"}'::jsonb)
ON CONFLICT (engine_id) DO NOTHING;

-- ─── Seed protected components (constitutional layer) ────────────────────────

INSERT INTO protected_components (component_ref, component_path, component_type, protection_level, requires_constitutional_approval, description)
VALUES
  ('PC-001', 'src/lib/engineeringIntegrityService.ts', 'source', 'constitutional', true, 'Engineering integrity governance service — self-modification requires constitutional approval'),
  ('PC-002', 'src/lib/executionOrchestrator.ts', 'source', 'constitutional', true, 'Execution orchestrator — self-modification requires constitutional approval'),
  ('PC-003', 'src/lib/implementationEngineInterface.ts', 'source', 'constitutional', true, 'Implementation engine abstraction — self-modification requires constitutional approval'),
  ('PC-004', 'supabase/migrations/', 'migration', 'constitutional', true, 'Database migrations — constitutional layer'),
  ('PC-005', 'docs/Platform_Overview.md', 'standard', 'constitutional', true, 'Platform overview and engineering standards')
ON CONFLICT (component_ref) DO NOTHING;
