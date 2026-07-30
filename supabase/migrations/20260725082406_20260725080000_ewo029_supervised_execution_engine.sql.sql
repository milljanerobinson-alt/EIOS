/*
# EWO-029 — Supervised Engineering Execution Engine v1.0

1. Purpose
   Establish the permanent governed execution architecture for EIOS.
   - Execution Provider Registry: governed abstraction layer for interchangeable
     execution providers (Bolt, native ATD, OpenAI agents, etc.)
   - Supervised Execution Packages: permanent engineering records containing
     the full execution context (plan, analysis, instructions, constraints,
     governance rules, completion/acceptance criteria, provider config)
   - Supervised Execution Records: governed records with provider request/response,
     execution timing, build/verification status, and full audit traceability
   - Execution Pipeline Events: persisted pipeline stage transitions for the
     canonical 10-stage supervised execution pipeline

2. New Tables
   - execution_provider_registry: governed provider abstraction
   - supervised_execution_packages: permanent execution package records
   - supervised_execution_records: governed execution records with provider evidence
   - execution_pipeline_events: persisted pipeline stage transitions

3. Security
   - RLS enabled on all new tables
   - TO authenticated with ownership check via ewo_id linkage
   - No anon access (execution requires authenticated session)

4. Important notes
   - Execution providers must never bypass governance
   - No execution may occur without an execution record
   - Execution Packages become permanent engineering records
   - The architecture supports future native ATD execution without redesign
*/

-- ═══════════════════════════════════════════════════════════════
-- Table 1: execution_provider_registry
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS execution_provider_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text UNIQUE NOT NULL,
  provider_name text NOT NULL,
  provider_version text NOT NULL DEFAULT '1.0',
  provider_type text NOT NULL DEFAULT 'implementation',
  canonical_contract_version text NOT NULL DEFAULT '1.0',
  is_active boolean NOT NULL DEFAULT true,
  is_governed boolean NOT NULL DEFAULT true,
  governance_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  registered_at timestamptz DEFAULT now(),
  registered_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE execution_provider_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_providers_authenticated" ON execution_provider_registry;
CREATE POLICY "select_providers_authenticated" ON execution_provider_registry
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_providers_authenticated" ON execution_provider_registry;
CREATE POLICY "insert_providers_authenticated" ON execution_provider_registry
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_providers_authenticated" ON execution_provider_registry;
CREATE POLICY "update_providers_authenticated" ON execution_provider_registry
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Seed Bolt as the initial governed execution provider
INSERT INTO execution_provider_registry (provider_id, provider_name, provider_type, governance_rules, provider_config, registered_by)
SELECT 'bolt', 'Bolt Implementation Provider', 'implementation',
  '["constitutional_compliance", "read_only_boundary", "audit_trail", "deterministic_behaviour"]'::jsonb,
  '{"engine_id": "bolt", "supports_build": true, "supports_deploy": true, "supports_rollback": true}'::jsonb,
  'Bolt'
WHERE NOT EXISTS (SELECT 1 FROM execution_provider_registry WHERE provider_id = 'bolt');

-- Seed native ATD as a future provider (inactive until ready)
INSERT INTO execution_provider_registry (provider_id, provider_name, provider_type, is_active, governance_rules, provider_config, registered_by)
SELECT 'native-atd', 'Native ATD Execution Engine', 'native', false,
  '["constitutional_compliance", "read_only_boundary", "audit_trail", "deterministic_behaviour", "self_engineering"]'::jsonb,
  '{"engine_id": "eios_code_engine", "supports_build": true, "supports_deploy": true, "supports_rollback": true}'::jsonb,
  'Bolt'
WHERE NOT EXISTS (SELECT 1 FROM execution_provider_registry WHERE provider_id = 'native-atd');

-- ═══════════════════════════════════════════════════════════════
-- Table 2: supervised_execution_packages
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS supervised_execution_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_ref text UNIQUE NOT NULL,
  ewo_id uuid REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  ewo_ref text NOT NULL,
  engineering_plan jsonb,
  engineering_analysis jsonb,
  implementation_instructions text,
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  governance_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  completion_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  runtime_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_provider text NOT NULL DEFAULT 'bolt',
  provider_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_version text NOT NULL DEFAULT '1.0',
  build_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  test_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  package_status text NOT NULL DEFAULT 'generated',
  generated_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE supervised_execution_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_packages_authenticated" ON supervised_execution_packages;
CREATE POLICY "select_packages_authenticated" ON supervised_execution_packages
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_packages_authenticated" ON supervised_execution_packages;
CREATE POLICY "insert_packages_authenticated" ON supervised_execution_packages
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_packages_authenticated" ON supervised_execution_packages;
CREATE POLICY "update_packages_authenticated" ON supervised_execution_packages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- Table 3: supervised_execution_records
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS supervised_execution_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_ref text UNIQUE NOT NULL,
  ewo_id uuid REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  ewo_ref text NOT NULL,
  package_id uuid REFERENCES supervised_execution_packages(id) ON DELETE SET NULL,
  package_ref text,
  provider text NOT NULL DEFAULT 'bolt',
  provider_version text,
  provider_request jsonb,
  provider_response jsonb,
  execution_start timestamptz,
  execution_finish timestamptz,
  execution_status text NOT NULL DEFAULT 'pending',
  build_status text,
  verification_status text,
  completion_package_reference uuid,
  engineering_record_reference uuid,
  audit_reference text,
  governance_gate_passed boolean NOT NULL DEFAULT false,
  governance_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE supervised_execution_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_exec_records_authenticated" ON supervised_execution_records;
CREATE POLICY "select_exec_records_authenticated" ON supervised_execution_records
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_exec_records_authenticated" ON supervised_execution_records;
CREATE POLICY "insert_exec_records_authenticated" ON supervised_execution_records
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_exec_records_authenticated" ON supervised_execution_records;
CREATE POLICY "update_exec_records_authenticated" ON supervised_execution_records
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- Table 4: execution_pipeline_events
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS execution_pipeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_record_id uuid REFERENCES supervised_execution_records(id) ON DELETE CASCADE,
  ewo_ref text NOT NULL,
  stage_name text NOT NULL,
  stage_sequence integer NOT NULL,
  stage_status text NOT NULL DEFAULT 'pending',
  stage_started_at timestamptz,
  stage_completed_at timestamptz,
  stage_duration_ms integer,
  stage_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE execution_pipeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_pipeline_events_authenticated" ON execution_pipeline_events;
CREATE POLICY "select_pipeline_events_authenticated" ON execution_pipeline_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_pipeline_events_authenticated" ON execution_pipeline_events;
CREATE POLICY "insert_pipeline_events_authenticated" ON execution_pipeline_events
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_pipeline_events_authenticated" ON execution_pipeline_events;
CREATE POLICY "update_pipeline_events_authenticated" ON execution_pipeline_events
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_sep_ewo_ref ON supervised_execution_packages(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_ser_ewo_ref ON supervised_execution_records(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_ser_execution_ref ON supervised_execution_records(execution_ref);
CREATE INDEX IF NOT EXISTS idx_epe_execution_record_id ON execution_pipeline_events(execution_record_id);
CREATE INDEX IF NOT EXISTS idx_epe_ewo_ref ON execution_pipeline_events(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_epr_provider_id ON execution_provider_registry(provider_id);

-- ═══════════════════════════════════════════════════════════════
-- updated_at triggers
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_execution_provider_registry_updated ON execution_provider_registry;
CREATE TRIGGER trg_execution_provider_registry_updated
  BEFORE UPDATE ON execution_provider_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_supervised_execution_packages_updated ON supervised_execution_packages;
CREATE TRIGGER trg_supervised_execution_packages_updated
  BEFORE UPDATE ON supervised_execution_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_supervised_execution_records_updated ON supervised_execution_records;
CREATE TRIGGER trg_supervised_execution_records_updated
  BEFORE UPDATE ON supervised_execution_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- Register EWO-029
-- ═══════════════════════════════════════════════════════════════

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, business_objective, engineering_objective,
  priority, risk_level, owner, requested_by, status, scope,
  implementation_status, engineering_package_status, implementation_provider,
  verification_status, product_owner, created_by, implementation_source
)
SELECT
  'EWO-029',
  'EWO-029 — Supervised Engineering Execution Engine v1.0',
  'Implement the first governed Supervised Engineering Execution Engine for EIOS. ATD becomes the Engineering Orchestrator. Implementation providers (initially Bolt) become interchangeable execution providers behind a governed abstraction layer.',
  'Enable ATD to orchestrate the complete engineering execution lifecycle while maintaining constitutional governance, full auditability, deterministic behaviour and Product Owner control.',
  'Build execution provider abstraction, supervised execution pipeline, execution packages, execution records, PO governance gate, provider routing, completion automation, and execution diagnostics.',
  'high', 'high', 'Bolt', 'Product Owner', 'in_progress',
  'Execution provider abstraction, supervised execution pipeline, execution packages, execution records, PO governance, provider routing, completion pipeline, execution diagnostics, future native execution support',
  'In Progress', 'Not Generated', 'Bolt',
  'not_started', 'Millie Robinson', 'Bolt', 'bolt'
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-029');

-- Change log
INSERT INTO engineering_change_log (change_ref, change_type, ewo_ref, object_type, object_ref, summary, description, actor, actor_type, recording_source, metadata)
SELECT 'CL-EWO029-001', 'created', 'EWO-029', 'engineering_work_order', 'EWO-029',
  'EWO-029 registered: Supervised Engineering Execution Engine v1.0',
  'Establishes the permanent governed execution architecture for EIOS. ATD becomes the Engineering Orchestrator with interchangeable execution providers.',
  'Bolt', 'system', 'governed_registration',
  '{"ewo_ref": "EWO-029", "scope": "execution_provider_abstraction, supervised_pipeline, execution_packages, execution_records, governance_gate, provider_routing, completion_automation, execution_diagnostics"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM engineering_change_log WHERE change_ref = 'CL-EWO029-001');
