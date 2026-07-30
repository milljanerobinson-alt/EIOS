/*
# EWO-010: EIOS Engineering Execution Platform Foundation

## Purpose
Creates the foundational schema for the EIOS Engineering Execution Platform.
This is a shared EIOS platform capability — NOT an ATD-specific feature.
ATD and future applications consume these services.

## Architecture
The Engineering Execution Platform provides:
- A constitutional execution domain model (13 objects)
- A deterministic execution state machine (14 states)
- A pluggable Engineering Agent framework (no vendor coupling)
- Execution Context, Evidence, Contracts, and Policies
- Engineering Memory integration hooks

## New Tables

### 1. execution_capability_profile
Agent capability declarations — what an agent can do, what languages/frameworks it supports.
- id, profile_name, capabilities (text[]), supported_languages (text[]), supported_frameworks (text[])
- execution_modes (text[]), max_session_duration_minutes, supports_rollback, supports_guardian
- supports_parallel_tasks, created_at

### 2. engineering_agent
Agent registry — pluggable execution agents. No vendor coupling to EIOS.
- id, agent_ref (unique), name, vendor, version, agent_type, status, health
- capability_profile_id (FK), description, last_health_check_at, execution_count, registered_at, metadata (jsonb)

### 3. engineering_intent
The constitutional "why" behind an execution — business driver, strategic alignment.
- id, intent_ref (unique), title, description, programme, business_driver
- strategic_alignment, priority, status, outcome_definition, created_at

### 4. execution_strategy
How an intent will be executed — strategy type, approach, constraints, success criteria.
- id, intent_id (FK), strategy_type, approach, constraints (jsonb), risks (jsonb)
- success_criteria (text[]), rollback_plan, created_at

### 5. execution_context
Where/environment execution occurs — repo, workspace, branch, risk, budget, memory snapshot.
- id, context_ref (unique), name, repository, workspace_id, branch, application
- product, environment, risk_level, budget_hours, memory_snapshot_at
- policies (jsonb), contracts (jsonb), capabilities (jsonb), created_at

### 6. execution_plan
The structured plan — connects intent, strategy, context into ordered phases.
- id, plan_ref (unique), intent_id (FK), strategy_id (FK), context_id (FK)
- title, description, phases (jsonb), estimated_effort_hours, status, version, created_at

### 7. execution_session
An active execution run — the central entity of the state machine.
- id, session_ref (unique), plan_id (FK), agent_id (FK), context_id (FK)
- title, state (14-state enum), state_history (jsonb), ewo_ref, engineering_record_id
- guardian_required, guardian_approved_at, po_review_required, po_accepted_at
- started_at, completed_at, duration_minutes, exit_reason, error_summary, created_at

### 8. execution_task
Individual tasks within a session — ordered, typed, state-tracked.
- id, session_id (FK), title, description, sequence_number, task_type, state
- assigned_agent_id (FK), estimated_minutes, actual_minutes, started_at, completed_at
- notes, created_at

### 9. execution_operation
Atomic operations within tasks — input/output, duration, error tracking.
- id, task_id (FK), operation_type, description, state, input (jsonb), output (jsonb)
- duration_ms, error_message, error_code, retry_count, created_at

### 10. execution_evidence
First-class evidence artifacts from execution — build, test, logs, telemetry, guardian validation.
- id, session_id (FK), task_id (FK, nullable), evidence_type, title, content (text)
- metadata (jsonb), file_path, verified_at, verified_by, created_at

### 11. execution_contract
Formal agreements governing execution — obligations, constraints, acceptance criteria.
- id, contract_ref (unique), name, contract_type, scope, obligations (jsonb)
- constraints (jsonb), acceptance_criteria (jsonb), active, version, created_at

### 12. execution_policy
Rules governing execution behaviour — enforcement level, applies_to scope.
- id, policy_ref (unique), name, policy_type, description, rules (jsonb)
- enforcement_level, applies_to (text[]), active, version, created_at

### 13. execution_memory_integration
Engineering Memory integration tracking — pre/post execution memory operations.
- id, session_id (FK), phase (pre_execution/post_execution)
- records_retrieved (uuid[]), patterns_applied (text[]), standards_referenced (text[])
- risks_identified (text[]), recommendations_applied (text[])
- knowledge_updated, lineage_updated, memory_updated, created_at

## Security
- RLS enabled on all 13 tables
- All policies: TO anon, authenticated (single-tenant platform, no user auth isolation)
- CRUD policies split into 4 per table (no FOR ALL)

## Notes
1. execution_session.state uses a text column with CHECK constraint for the 14 execution states
2. engineering_agent has no direct Bolt reference — agents are pluggable by design
3. All FK relationships use ON DELETE SET NULL or ON DELETE CASCADE as appropriate
4. All tables support idempotent re-run via IF NOT EXISTS
*/

-- ─── 1. execution_capability_profile ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_capability_profile (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_name                text NOT NULL,
  capabilities                text[] NOT NULL DEFAULT '{}',
  supported_languages         text[] NOT NULL DEFAULT '{}',
  supported_frameworks        text[] NOT NULL DEFAULT '{}',
  execution_modes             text[] NOT NULL DEFAULT '{}',
  max_session_duration_minutes integer NOT NULL DEFAULT 480,
  supports_rollback           boolean NOT NULL DEFAULT false,
  supports_guardian           boolean NOT NULL DEFAULT false,
  supports_parallel_tasks     boolean NOT NULL DEFAULT false,
  description                 text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE execution_capability_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_capability_profile" ON execution_capability_profile;
CREATE POLICY "anon_select_execution_capability_profile" ON execution_capability_profile FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_capability_profile" ON execution_capability_profile;
CREATE POLICY "anon_insert_execution_capability_profile" ON execution_capability_profile FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_capability_profile" ON execution_capability_profile;
CREATE POLICY "anon_update_execution_capability_profile" ON execution_capability_profile FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_capability_profile" ON execution_capability_profile;
CREATE POLICY "anon_delete_execution_capability_profile" ON execution_capability_profile FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 2. engineering_agent ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_agent (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_ref               text UNIQUE NOT NULL,
  name                    text NOT NULL,
  vendor                  text NOT NULL,
  version                 text NOT NULL DEFAULT '1.0',
  agent_type              text NOT NULL DEFAULT 'general',
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','inactive','maintenance','deprecated')),
  health                  text NOT NULL DEFAULT 'healthy'
                            CHECK (health IN ('healthy','degraded','unavailable','unknown')),
  capability_profile_id   uuid REFERENCES execution_capability_profile(id) ON DELETE SET NULL,
  description             text,
  last_health_check_at    timestamptz,
  execution_count         integer NOT NULL DEFAULT 0,
  registered_at           timestamptz NOT NULL DEFAULT now(),
  metadata                jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE engineering_agent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_engineering_agent" ON engineering_agent;
CREATE POLICY "anon_select_engineering_agent" ON engineering_agent FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_engineering_agent" ON engineering_agent;
CREATE POLICY "anon_insert_engineering_agent" ON engineering_agent FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_engineering_agent" ON engineering_agent;
CREATE POLICY "anon_update_engineering_agent" ON engineering_agent FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_engineering_agent" ON engineering_agent;
CREATE POLICY "anon_delete_engineering_agent" ON engineering_agent FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 3. engineering_intent ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_intent (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_ref           text UNIQUE NOT NULL,
  title                text NOT NULL,
  description          text,
  programme            text NOT NULL DEFAULT 'EIOS',
  business_driver      text,
  strategic_alignment  text,
  priority             text NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('critical','high','medium','low')),
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('draft','active','executing','completed','cancelled')),
  outcome_definition   text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_intent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_engineering_intent" ON engineering_intent;
CREATE POLICY "anon_select_engineering_intent" ON engineering_intent FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_engineering_intent" ON engineering_intent;
CREATE POLICY "anon_insert_engineering_intent" ON engineering_intent FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_engineering_intent" ON engineering_intent;
CREATE POLICY "anon_update_engineering_intent" ON engineering_intent FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_engineering_intent" ON engineering_intent;
CREATE POLICY "anon_delete_engineering_intent" ON engineering_intent FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 4. execution_strategy ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_strategy (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id        uuid REFERENCES engineering_intent(id) ON DELETE CASCADE,
  strategy_type    text NOT NULL DEFAULT 'incremental'
                     CHECK (strategy_type IN ('incremental','parallel','phased','spike','iterative','experimental')),
  approach         text,
  constraints      jsonb NOT NULL DEFAULT '[]',
  risks            jsonb NOT NULL DEFAULT '[]',
  success_criteria text[] NOT NULL DEFAULT '{}',
  rollback_plan    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE execution_strategy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_strategy" ON execution_strategy;
CREATE POLICY "anon_select_execution_strategy" ON execution_strategy FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_strategy" ON execution_strategy;
CREATE POLICY "anon_insert_execution_strategy" ON execution_strategy FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_strategy" ON execution_strategy;
CREATE POLICY "anon_update_execution_strategy" ON execution_strategy FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_strategy" ON execution_strategy;
CREATE POLICY "anon_delete_execution_strategy" ON execution_strategy FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 5. execution_context ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_context (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_ref          text UNIQUE NOT NULL,
  name                 text NOT NULL,
  repository           text,
  workspace_id         text,
  branch               text DEFAULT 'main',
  application          text,
  product              text,
  environment          text NOT NULL DEFAULT 'development'
                         CHECK (environment IN ('development','staging','production','sandbox','test')),
  risk_level           text NOT NULL DEFAULT 'medium'
                         CHECK (risk_level IN ('low','medium','high','critical')),
  budget_hours         numeric(10,2),
  memory_snapshot_at   timestamptz,
  policies             jsonb NOT NULL DEFAULT '[]',
  contracts            jsonb NOT NULL DEFAULT '[]',
  capabilities         jsonb NOT NULL DEFAULT '[]',
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE execution_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_context" ON execution_context;
CREATE POLICY "anon_select_execution_context" ON execution_context FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_context" ON execution_context;
CREATE POLICY "anon_insert_execution_context" ON execution_context FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_context" ON execution_context;
CREATE POLICY "anon_update_execution_context" ON execution_context FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_context" ON execution_context;
CREATE POLICY "anon_delete_execution_context" ON execution_context FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 6. execution_plan ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_plan (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_ref              text UNIQUE NOT NULL,
  intent_id             uuid REFERENCES engineering_intent(id) ON DELETE SET NULL,
  strategy_id           uuid REFERENCES execution_strategy(id) ON DELETE SET NULL,
  context_id            uuid REFERENCES execution_context(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  description           text,
  phases                jsonb NOT NULL DEFAULT '[]',
  estimated_effort_hours numeric(10,2),
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','approved','executing','completed','cancelled')),
  version               integer NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE execution_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_plan" ON execution_plan;
CREATE POLICY "anon_select_execution_plan" ON execution_plan FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_plan" ON execution_plan;
CREATE POLICY "anon_insert_execution_plan" ON execution_plan FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_plan" ON execution_plan;
CREATE POLICY "anon_update_execution_plan" ON execution_plan FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_plan" ON execution_plan;
CREATE POLICY "anon_delete_execution_plan" ON execution_plan FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 7. execution_session ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_session (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_ref             text UNIQUE NOT NULL,
  plan_id                 uuid REFERENCES execution_plan(id) ON DELETE SET NULL,
  agent_id                uuid REFERENCES engineering_agent(id) ON DELETE SET NULL,
  context_id              uuid REFERENCES execution_context(id) ON DELETE SET NULL,
  title                   text NOT NULL,
  state                   text NOT NULL DEFAULT 'requested'
                            CHECK (state IN (
                              'requested','prepared','sandbox_ready','executing',
                              'paused','validation','guardian_review','awaiting_product_owner',
                              'accepted','rolled_back','completed','cancelled','aborted','recovery'
                            )),
  state_history           jsonb NOT NULL DEFAULT '[]',
  ewo_ref                 text,
  engineering_record_id   uuid,
  guardian_required       boolean NOT NULL DEFAULT false,
  guardian_approved_at    timestamptz,
  po_review_required      boolean NOT NULL DEFAULT false,
  po_accepted_at          timestamptz,
  started_at              timestamptz,
  completed_at            timestamptz,
  duration_minutes        numeric(10,2),
  exit_reason             text,
  error_summary           text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_session_state   ON execution_session(state);
CREATE INDEX IF NOT EXISTS idx_execution_session_agent   ON execution_session(agent_id);
CREATE INDEX IF NOT EXISTS idx_execution_session_created ON execution_session(created_at DESC);

ALTER TABLE execution_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_session" ON execution_session;
CREATE POLICY "anon_select_execution_session" ON execution_session FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_session" ON execution_session;
CREATE POLICY "anon_insert_execution_session" ON execution_session FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_session" ON execution_session;
CREATE POLICY "anon_update_execution_session" ON execution_session FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_session" ON execution_session;
CREATE POLICY "anon_delete_execution_session" ON execution_session FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 8. execution_task ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_task (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES execution_session(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  sequence_number     integer NOT NULL DEFAULT 1,
  task_type           text NOT NULL DEFAULT 'implementation'
                        CHECK (task_type IN (
                          'implementation','validation','testing','deployment',
                          'review','documentation','analysis','rollback','recovery'
                        )),
  state               text NOT NULL DEFAULT 'pending'
                        CHECK (state IN ('pending','in_progress','completed','failed','skipped','blocked')),
  assigned_agent_id   uuid REFERENCES engineering_agent(id) ON DELETE SET NULL,
  estimated_minutes   integer,
  actual_minutes      integer,
  started_at          timestamptz,
  completed_at        timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_task_session ON execution_task(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_task_state   ON execution_task(state);

ALTER TABLE execution_task ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_task" ON execution_task;
CREATE POLICY "anon_select_execution_task" ON execution_task FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_task" ON execution_task;
CREATE POLICY "anon_insert_execution_task" ON execution_task FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_task" ON execution_task;
CREATE POLICY "anon_update_execution_task" ON execution_task FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_task" ON execution_task;
CREATE POLICY "anon_delete_execution_task" ON execution_task FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 9. execution_operation ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_operation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES execution_task(id) ON DELETE CASCADE,
  operation_type  text NOT NULL DEFAULT 'generic',
  description     text,
  state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','running','completed','failed','skipped')),
  input           jsonb NOT NULL DEFAULT '{}',
  output          jsonb NOT NULL DEFAULT '{}',
  duration_ms     integer,
  error_message   text,
  error_code      text,
  retry_count     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_operation_task ON execution_operation(task_id);

ALTER TABLE execution_operation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_operation" ON execution_operation;
CREATE POLICY "anon_select_execution_operation" ON execution_operation FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_operation" ON execution_operation;
CREATE POLICY "anon_insert_execution_operation" ON execution_operation FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_operation" ON execution_operation;
CREATE POLICY "anon_update_execution_operation" ON execution_operation FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_operation" ON execution_operation;
CREATE POLICY "anon_delete_execution_operation" ON execution_operation FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 10. execution_evidence ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_evidence (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES execution_session(id) ON DELETE CASCADE,
  task_id        uuid REFERENCES execution_task(id) ON DELETE SET NULL,
  evidence_type  text NOT NULL DEFAULT 'log'
                   CHECK (evidence_type IN (
                     'build_result','test_result','log','telemetry',
                     'guardian_validation','generated_artefact','rollback_evidence',
                     'screenshot','diff','metric'
                   )),
  title          text NOT NULL,
  content        text,
  metadata       jsonb NOT NULL DEFAULT '{}',
  file_path      text,
  verified_at    timestamptz,
  verified_by    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_evidence_session ON execution_evidence(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_evidence_type    ON execution_evidence(evidence_type);

ALTER TABLE execution_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_evidence" ON execution_evidence;
CREATE POLICY "anon_select_execution_evidence" ON execution_evidence FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_evidence" ON execution_evidence;
CREATE POLICY "anon_insert_execution_evidence" ON execution_evidence FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_evidence" ON execution_evidence;
CREATE POLICY "anon_update_execution_evidence" ON execution_evidence FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_evidence" ON execution_evidence;
CREATE POLICY "anon_delete_execution_evidence" ON execution_evidence FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 11. execution_contract ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_contract (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_ref         text UNIQUE NOT NULL,
  name                 text NOT NULL,
  contract_type        text NOT NULL DEFAULT 'general'
                         CHECK (contract_type IN ('general','quality','security','performance','compliance','constitutional')),
  scope                text,
  obligations          jsonb NOT NULL DEFAULT '[]',
  constraints          jsonb NOT NULL DEFAULT '[]',
  acceptance_criteria  jsonb NOT NULL DEFAULT '[]',
  active               boolean NOT NULL DEFAULT true,
  version              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE execution_contract ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_contract" ON execution_contract;
CREATE POLICY "anon_select_execution_contract" ON execution_contract FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_contract" ON execution_contract;
CREATE POLICY "anon_insert_execution_contract" ON execution_contract FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_contract" ON execution_contract;
CREATE POLICY "anon_update_execution_contract" ON execution_contract FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_contract" ON execution_contract;
CREATE POLICY "anon_delete_execution_contract" ON execution_contract FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 12. execution_policy ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_policy (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_ref        text UNIQUE NOT NULL,
  name              text NOT NULL,
  policy_type       text NOT NULL DEFAULT 'general'
                      CHECK (policy_type IN ('general','quality','security','governance','guardian','memory','constitutional')),
  description       text,
  rules             jsonb NOT NULL DEFAULT '[]',
  enforcement_level text NOT NULL DEFAULT 'advisory'
                      CHECK (enforcement_level IN ('strict','advisory','informational')),
  applies_to        text[] NOT NULL DEFAULT '{}',
  active            boolean NOT NULL DEFAULT true,
  version           integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE execution_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_policy" ON execution_policy;
CREATE POLICY "anon_select_execution_policy" ON execution_policy FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_policy" ON execution_policy;
CREATE POLICY "anon_insert_execution_policy" ON execution_policy FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_policy" ON execution_policy;
CREATE POLICY "anon_update_execution_policy" ON execution_policy FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_policy" ON execution_policy;
CREATE POLICY "anon_delete_execution_policy" ON execution_policy FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 13. execution_memory_integration ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_memory_integration (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid NOT NULL REFERENCES execution_session(id) ON DELETE CASCADE,
  phase                    text NOT NULL DEFAULT 'pre_execution'
                             CHECK (phase IN ('pre_execution','post_execution')),
  records_retrieved        uuid[] NOT NULL DEFAULT '{}',
  patterns_applied         text[] NOT NULL DEFAULT '{}',
  standards_referenced     text[] NOT NULL DEFAULT '{}',
  risks_identified         text[] NOT NULL DEFAULT '{}',
  recommendations_applied  text[] NOT NULL DEFAULT '{}',
  knowledge_updated        boolean NOT NULL DEFAULT false,
  lineage_updated          boolean NOT NULL DEFAULT false,
  memory_updated           boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_memory_session ON execution_memory_integration(session_id);

ALTER TABLE execution_memory_integration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_execution_memory_integration" ON execution_memory_integration;
CREATE POLICY "anon_select_execution_memory_integration" ON execution_memory_integration FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_execution_memory_integration" ON execution_memory_integration;
CREATE POLICY "anon_insert_execution_memory_integration" ON execution_memory_integration FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_execution_memory_integration" ON execution_memory_integration;
CREATE POLICY "anon_update_execution_memory_integration" ON execution_memory_integration FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_execution_memory_integration" ON execution_memory_integration;
CREATE POLICY "anon_delete_execution_memory_integration" ON execution_memory_integration FOR DELETE
  TO anon, authenticated USING (true);
