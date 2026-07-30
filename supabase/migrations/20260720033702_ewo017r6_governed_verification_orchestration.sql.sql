/*
# EWO-017R.6 — Governed Verification Orchestration, Verify-All Workflow & Evidence-Aware Batch Progression

## Changes

### 1. New Table: `ewo_verification_orchestrations`
Canonical record of each batch/single verification orchestration run.
- id, ewo_id, orchestration_ref, mode, requested_by, notes
- total_gates, already_verified, eligible, attempted, passed, failed, blocked, skipped, evidence_missing
- results_by_gate (jsonb), lifecycle_impact (jsonb), next_recommended_action
- final_status (text), started_at, completed_at, created_at

### 2. New Table: `ewo_verification_gate_dependencies`
Canonical dependency model between verification gates.
- id, gate_key, depends_on_gate_key, dependency_order
- UNIQUE(gate_key, depends_on_gate_key)

### 3. New Table: `ewo_verification_orchestration_audit`
Permanent audit trail for orchestration events.
- id, orchestration_id, ewo_id, event_type, gate_key, event_data (jsonb), created_at

### 4. Seed gate dependencies
- functional depends on build
- ui depends on functional
- data depends on functional
- constitutional depends on ui, data

### 5. EWO-017R.6 registration

### 6. ATD knowledge sync
*/

-- ─── 1. Orchestration record table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ewo_verification_orchestrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  orchestration_ref text NOT NULL UNIQUE,
  mode text NOT NULL CHECK (mode IN ('single_gate', 'verify_all_eligible', 'verify_remaining')),
  requested_by text NOT NULL DEFAULT 'platform',
  notes text,
  total_gates integer NOT NULL DEFAULT 0,
  already_verified integer NOT NULL DEFAULT 0,
  eligible integer NOT NULL DEFAULT 0,
  attempted integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  blocked integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  evidence_missing integer NOT NULL DEFAULT 0,
  results_by_gate jsonb DEFAULT '{}'::jsonb,
  lifecycle_impact jsonb DEFAULT '{}'::jsonb,
  next_recommended_action text,
  final_status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ewo_verification_orchestrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_orchestrations" ON ewo_verification_orchestrations;
CREATE POLICY "select_orchestrations" ON ewo_verification_orchestrations
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_orchestrations" ON ewo_verification_orchestrations;
CREATE POLICY "insert_orchestrations" ON ewo_verification_orchestrations
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_orchestrations" ON ewo_verification_orchestrations;
CREATE POLICY "update_orchestrations" ON ewo_verification_orchestrations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_orchestrations" ON ewo_verification_orchestrations;
CREATE POLICY "delete_orchestrations" ON ewo_verification_orchestrations
  FOR DELETE TO authenticated USING (true);

-- ─── 2. Gate dependency model ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ewo_verification_gate_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_key text NOT NULL,
  depends_on_gate_key text NOT NULL,
  dependency_order integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE (gate_key, depends_on_gate_key)
);

ALTER TABLE ewo_verification_gate_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_gate_deps" ON ewo_verification_gate_dependencies;
CREATE POLICY "select_gate_deps" ON ewo_verification_gate_dependencies
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_gate_deps" ON ewo_verification_gate_dependencies;
CREATE POLICY "insert_gate_deps" ON ewo_verification_gate_dependencies
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_gate_deps" ON ewo_verification_gate_dependencies;
CREATE POLICY "update_gate_deps" ON ewo_verification_gate_dependencies
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_gate_deps" ON ewo_verification_gate_dependencies;
CREATE POLICY "delete_gate_deps" ON ewo_verification_gate_dependencies
  FOR DELETE TO authenticated USING (true);

-- ─── 3. Orchestration audit trail ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ewo_verification_orchestration_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id uuid REFERENCES ewo_verification_orchestrations(id) ON DELETE CASCADE,
  ewo_id uuid REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  gate_key text,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ewo_verification_orchestration_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_orch_audit" ON ewo_verification_orchestration_audit;
CREATE POLICY "select_orch_audit" ON ewo_verification_orchestration_audit
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_orch_audit" ON ewo_verification_orchestration_audit;
CREATE POLICY "insert_orch_audit" ON ewo_verification_orchestration_audit
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_orch_audit" ON ewo_verification_orchestration_audit;
CREATE POLICY "update_orch_audit" ON ewo_verification_orchestration_audit
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_orch_audit" ON ewo_verification_orchestration_audit;
CREATE POLICY "delete_orch_audit" ON ewo_verification_orchestration_audit
  FOR DELETE TO authenticated USING (true);

-- ─── 4. Seed canonical gate dependencies ────────────────────────────────────────

INSERT INTO ewo_verification_gate_dependencies (gate_key, depends_on_gate_key, dependency_order) VALUES
  ('functional', 'build', 1),
  ('ui', 'functional', 2),
  ('data', 'functional', 2),
  ('constitutional', 'ui', 3),
  ('constitutional', 'data', 3)
ON CONFLICT (gate_key, depends_on_gate_key) DO NOTHING;

-- ─── 5. EWO-017R.6 registration ─────────────────────────────────────────────────

INSERT INTO engineering_work_orders (ewo_ref, title, executive_summary, status, priority, risk_level, parent_ref, created_at, updated_at)
SELECT
  'EWO-017R.6',
  'Governed Verification Orchestration, Verify-All Workflow & Evidence-Aware Batch Progression',
  'Add governed batch verification capability (Verify All Eligible / Verify Remaining) with canonical orchestration service, prerequisite ordering, evidence-aware verification, automated vs PO gate classification, failure policy, pre-execution review dialog, live progress, governed completion summary, retry, matrix synchronisation, completion report evidence mapping, historical EWO support, permissions, audit trail, and ATD knowledge sync.',
  'engineering_complete',
  'high',
  'low',
  'EWO-017R.5',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-017R.6');

-- ─── 6. ATD knowledge sync ──────────────────────────────────────────────────────

INSERT INTO audit_trail (event_type, event_data, timestamp, category, severity, description)
SELECT
  'atd_knowledge_sync',
  jsonb_build_object(
    'ewo_ref', 'EWO-017R.6',
    'knowledge_added', jsonb_build_array(
      'Can I verify all remaining gates?',
      'Which verification gates are eligible?',
      'Which gates are blocked?',
      'What evidence is missing?',
      'Why did Verify All stop?',
      'Which gates require Product Owner judgement?',
      'Can this EWO proceed to Report Ready?',
      'What did the latest verification orchestration do?',
      'Which historical EWOs can be batch verified?'
    ),
    'synced_at', now()
  ),
  now(),
  'governance',
  'info',
  'ATD knowledge sync for EWO-017R.6 governed verification orchestration'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_trail
  WHERE event_type = 'atd_knowledge_sync'
  AND event_data->>'ewo_ref' = 'EWO-017R.6'
);
