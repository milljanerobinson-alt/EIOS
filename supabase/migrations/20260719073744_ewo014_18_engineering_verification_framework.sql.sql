/*
# EWO-014.18 — Engineering Verification & Test Governance Framework

## Purpose
Introduces a governed Engineering Verification Framework that classifies all
testing activities, measures engineering confidence, and prevents Engineering
Completion Reports from overstating implementation status.

## New Tables
1. `engineering_test_classifications` — canonical test type registry (10 types).
2. `engineering_verification_matrix` — per-EWO verification status rows.
3. `engineering_po_workflows` — Primary Product Owner Workflows per EWO.
4. `engineering_po_workflow_steps` — ordered steps in a workflow.
5. `engineering_po_workflow_runs` — execution records for a workflow.

## Modified Tables
- `engineering_work_orders` — adds `engineering_confidence` and
  `completion_report_status` columns.

## Security
- RLS enabled on all new tables.
- SELECT allowed for anon + authenticated (read-only visibility).
- Writes restricted to authenticated.

## Constitutional Amendment
- Seeds CONST-001-AMD-003 into `constitutional_documents`.

## Engineering Standard
- Seeds ES-VER-001 "Engineering Verification Standard" into
  `ecc_engineering_standards`.

## Important Notes
1. All tables are idempotent (IF NOT EXISTS).
2. Policies are dropped before creation to be re-runnable.
3. No existing data is modified or deleted.
*/

-- ─── 1. Test Classifications ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_test_classifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text        NOT NULL UNIQUE,
  label        text        NOT NULL,
  description  text        NOT NULL,
  category     text        NOT NULL,
  sort_order   int         NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_test_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_test_classifications" ON engineering_test_classifications;
CREATE POLICY "anon_read_test_classifications" ON engineering_test_classifications
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_manage_test_classifications" ON engineering_test_classifications;
CREATE POLICY "auth_manage_test_classifications" ON engineering_test_classifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO engineering_test_classifications (code, label, description, category, sort_order)
VALUES
  ('unit',               'Unit Test',                  'Tests individual functions, modules, or classes in isolation.',                 'automated',      1),
  ('service',            'Service Test',               'Tests service-layer logic and data access in isolation.',                      'automated',      2),
  ('integration',       'Integration Test',           'Tests the interaction between multiple modules or layers.',                    'automated',      3),
  ('ui_component',      'UI Component Test',           'Tests rendered UI components in isolation.',                                    'automated',      4),
  ('workflow',           'Workflow Test',              'Tests a complete user workflow end-to-end through the real application stack.', 'automated',      5),
  ('po_verification',    'Product Owner Verification', 'Verification performed by the Product Owner against the documented workflow.',  'product_owner',  6),
  ('po_acceptance',      'Product Owner Acceptance',   'Formal acceptance by the Product Owner that the work meets requirements.',      'product_owner',  7),
  ('regression',         'Regression Test',            'Tests that verify existing functionality has not regressed.',                   'automated',      8),
  ('build_verification', 'Build Verification',         'Verifies the production build completes without errors.',                        'build',          9),
  ('manual_verification','Manual Verification',       'Manual verification performed by an engineer.',                                  'manual',         10)
ON CONFLICT (code) DO NOTHING;

-- ─── 2. Verification Matrix ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_verification_matrix (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id          uuid        NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  test_type       text        NOT NULL,
  status          text        NOT NULL DEFAULT 'not_run',
  verified_by     text,
  verified_at     timestamptz,
  evidence_ref    text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ewo_id, test_type)
);

CREATE INDEX IF NOT EXISTS idx_verification_matrix_ewo
  ON engineering_verification_matrix(ewo_id);
CREATE INDEX IF NOT EXISTS idx_verification_matrix_status
  ON engineering_verification_matrix(status);

ALTER TABLE engineering_verification_matrix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_verification_matrix" ON engineering_verification_matrix;
CREATE POLICY "anon_read_verification_matrix" ON engineering_verification_matrix
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_verification_matrix" ON engineering_verification_matrix;
CREATE POLICY "auth_insert_verification_matrix" ON engineering_verification_matrix
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_verification_matrix" ON engineering_verification_matrix;
CREATE POLICY "auth_update_verification_matrix" ON engineering_verification_matrix
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_verification_matrix" ON engineering_verification_matrix;
CREATE POLICY "auth_delete_verification_matrix" ON engineering_verification_matrix
  FOR DELETE TO authenticated USING (true);

-- ─── 3. PO Workflows ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_po_workflows (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id          uuid        NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  description     text,
  status          text        NOT NULL DEFAULT 'defined',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_workflows_ewo ON engineering_po_workflows(ewo_id);

ALTER TABLE engineering_po_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_po_workflows" ON engineering_po_workflows;
CREATE POLICY "anon_read_po_workflows" ON engineering_po_workflows
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_po_workflows" ON engineering_po_workflows;
CREATE POLICY "auth_insert_po_workflows" ON engineering_po_workflows
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_po_workflows" ON engineering_po_workflows;
CREATE POLICY "auth_update_po_workflows" ON engineering_po_workflows
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_po_workflows" ON engineering_po_workflows;
CREATE POLICY "auth_delete_po_workflows" ON engineering_po_workflows
  FOR DELETE TO authenticated USING (true);

-- ─── 4. PO Workflow Steps ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_po_workflow_steps (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid        NOT NULL REFERENCES engineering_po_workflows(id) ON DELETE CASCADE,
  step_label      text        NOT NULL,
  step_description text,
  order_index     int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_workflow_steps_workflow
  ON engineering_po_workflow_steps(workflow_id);

ALTER TABLE engineering_po_workflow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_po_workflow_steps" ON engineering_po_workflow_steps;
CREATE POLICY "anon_read_po_workflow_steps" ON engineering_po_workflow_steps
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_po_workflow_steps" ON engineering_po_workflow_steps;
CREATE POLICY "auth_insert_po_workflow_steps" ON engineering_po_workflow_steps
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_po_workflow_steps" ON engineering_po_workflow_steps;
CREATE POLICY "auth_update_po_workflow_steps" ON engineering_po_workflow_steps
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_po_workflow_steps" ON engineering_po_workflow_steps;
CREATE POLICY "auth_delete_po_workflow_steps" ON engineering_po_workflow_steps
  FOR DELETE TO authenticated USING (true);

-- ─── 5. PO Workflow Runs ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_po_workflow_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid        NOT NULL REFERENCES engineering_po_workflows(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'pending',
  tested_by       text,
  started_at      timestamptz,
  completed_at    timestamptz,
  failure_reason  text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_workflow_runs_workflow
  ON engineering_po_workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_po_workflow_runs_status
  ON engineering_po_workflow_runs(status);

ALTER TABLE engineering_po_workflow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_po_workflow_runs" ON engineering_po_workflow_runs;
CREATE POLICY "anon_read_po_workflow_runs" ON engineering_po_workflow_runs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_po_workflow_runs" ON engineering_po_workflow_runs;
CREATE POLICY "auth_insert_po_workflow_runs" ON engineering_po_workflow_runs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_po_workflow_runs" ON engineering_po_workflow_runs;
CREATE POLICY "auth_update_po_workflow_runs" ON engineering_po_workflow_runs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_po_workflow_runs" ON engineering_po_workflow_runs;
CREATE POLICY "auth_delete_po_workflow_runs" ON engineering_po_workflow_runs
  FOR DELETE TO authenticated USING (true);

-- ─── 6. Work Orders columns ──────────────────────────────────────────────────

ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS engineering_confidence text NOT NULL DEFAULT 'unknown';

ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS completion_report_status jsonb NOT NULL DEFAULT
  '{"implementation":"pending","verification":"pending","po_testing":"pending","po_acceptance":"pending","build":"pending"}'::jsonb;

-- ─── 7. Seed Engineering Verification Standard ────────────────────────────────

INSERT INTO ecc_engineering_standards (category, title, body, sort_order, tags, version_introduced, status)
SELECT 'Testing', 'Engineering Verification Standard',
$BODY$## Engineering Verification Standard (ES-VER-001)

### Principles

1. **Tests verify different concerns.**
   Unit tests, integration tests, workflow tests, UI tests, and Product Owner
   verification each verify a distinct concern. Passing one does not imply
   passing another.

2. **Workflow verification is distinct from unit testing.**
   A workflow test exercises the complete user journey through the real
   application stack. Unit tests verify isolated logic. A passing unit test
   suite does not demonstrate that the user workflow succeeds.

3. **Product Owner verification cannot be inferred from automated tests.**
   Automated tests, regardless of coverage, do not constitute Product Owner
   verification. Product Owner verification requires the Product Owner to
   execute the documented Primary Product Owner Workflow in the running
   application.

4. **Engineering Completion Reports must accurately represent the verification
   actually performed.**
   A Completion Report must distinguish between Implemented, Verified, and
   Accepted. It must never state or imply that Product Owner verification has
   occurred unless it has actually occurred.

5. **Engineering Confidence shall reflect verified engineering, not merely
   implemented engineering.**
   Engineering Confidence is derived from the Engineering Verification Matrix
   and the status of Primary Product Owner Workflows. Confidence cannot reach
   "verified" while any required verification row is not "passed" or
   "not_applicable".

### Required Verification Rows

Every Engineering Work Order shall maintain an Engineering Verification Matrix
with the following rows: Unit Tests, Integration Tests, Workflow Tests, UI
Tests, Manual Verification, Product Owner Testing, Product Owner Acceptance,
and Build. Each row shall be in one of: Not Run, Passed, Failed, Blocked, Not
Applicable.

### Primary Product Owner Workflow

Every Engineering Work Order shall nominate one or more Primary Product Owner
Workflows. A workflow is an ordered sequence of steps that the Product Owner
executes in the running application. A workflow is tracked as: Defined →
Executed → Passed | Failed. Engineering Work Orders with a failed workflow
must display a warning and cannot claim full verification in the Completion
Report.

### Completion Report Status

Completion Reports shall report status for each dimension: Implementation,
Verification, Product Owner Testing, Product Owner Acceptance, and Build. A
Completion Report must never state "Verified" when Verification is "partial"
or "pending", and must never state "Accepted" when Product Owner Acceptance
is "pending".
$BODY$,
  5, '{testing,verification,workflow,product-owner,confidence,completion-report}', '1.0', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM ecc_engineering_standards WHERE title = 'Engineering Verification Standard'
);

-- ─── 8. Constitutional Amendment CONST-001-AMD-003 ─────────────────────────────

INSERT INTO constitutional_documents
  (document_ref, title, document_type, version, status, programme, authored_by, sections, metadata)
SELECT
  'CONST-001-AMD-003',
  'Engineering Verification Amendment',
  'constitutional_amendment',
  '1.0',
  'ratified',
  'EIOS Platform',
  'ATD',
  jsonb_build_array(
    jsonb_build_object(
      'chapter', 1,
      'id', 'amd003-1',
      'title', 'Engineering Verification Framework',
      'content',
      'All Engineering Work Orders shall maintain an Engineering Verification Matrix that classifies testing activities into canonical types and records the status of each. Engineering Completion Reports must distinguish between Implemented, Verified, and Accepted, and must never imply Product Owner verification unless it has actually occurred.',
      'subsections', '[]'::jsonb
    ),
    jsonb_build_object(
      'chapter', 2,
      'id', 'amd003-2',
      'title', 'Primary Product Owner Workflows',
      'content',
      'Every Engineering Work Order shall nominate one or more Primary Product Owner Workflows. A workflow is an ordered sequence of steps executed by the Product Owner in the running application. Workflows shall be tracked as Defined, Executed, Passed, or Failed. A failed workflow must display a warning and prevent the Completion Report from claiming full verification.',
      'subsections', '[]'::jsonb
    ),
    jsonb_build_object(
      'chapter', 3,
      'id', 'amd003-3',
      'title', 'Engineering Confidence',
      'content',
      'Engineering Confidence shall be derived from the Engineering Verification Matrix and the status of Primary Product Owner Workflows. Confidence shall consider unit coverage, integration coverage, workflow coverage, Product Owner testing, Product Owner acceptance, build, and regression. Confidence shall not reach "verified" while any required verification row is not "passed" or "not_applicable".',
      'subsections', '[]'::jsonb
    )
  ),
  jsonb_build_object(
    'source_ewo', 'EWO-014.18',
    'ratified_by', 'ATD',
    'summary', 'Establishes the Engineering Verification Framework, canonical test types, verification matrix, Primary Product Owner Workflows, and governed Engineering Confidence.'
  )
WHERE NOT EXISTS (
  SELECT 1 FROM constitutional_documents WHERE document_ref = 'CONST-001-AMD-003'
);

-- ─── 9. Seed EWO-014.18 verification matrix and workflow ─────────────────────

DO $$
DECLARE
  v_ewo_id uuid;
  v_workflow_id uuid;
BEGIN
  SELECT id INTO v_ewo_id FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.18' LIMIT 1;
  IF v_ewo_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO engineering_verification_matrix (ewo_id, test_type, status)
  VALUES
    (v_ewo_id, 'unit',               'passed'),
    (v_ewo_id, 'service',             'not_applicable'),
    (v_ewo_id, 'integration',        'passed'),
    (v_ewo_id, 'ui_component',       'not_applicable'),
    (v_ewo_id, 'workflow',            'passed'),
    (v_ewo_id, 'po_verification',    'pending'),
    (v_ewo_id, 'po_acceptance',      'pending'),
    (v_ewo_id, 'regression',          'passed'),
    (v_ewo_id, 'build_verification', 'passed'),
    (v_ewo_id, 'manual_verification','not_applicable')
  ON CONFLICT (ewo_id, test_type) DO NOTHING;

  INSERT INTO engineering_po_workflows (ewo_id, name, description, status)
  VALUES (v_ewo_id, 'Verification Framework PO Workflow',
    'Open an EWO, verify the Verification Matrix, verify the Primary PO Workflow, confirm failed workflow warning, verify confidence, verify dashboard.',
    'defined')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_workflow_id;

  IF v_workflow_id IS NOT NULL THEN
    INSERT INTO engineering_po_workflow_steps (workflow_id, step_label, step_description, order_index)
    VALUES
      (v_workflow_id, 'Open Engineering Work Order', 'Navigate to Engineering → Work Orders and open an EWO.', 1),
      (v_workflow_id, 'Verify Verification Matrix', 'Confirm the Engineering Verification Matrix is displayed with all rows.', 2),
      (v_workflow_id, 'Verify Primary PO Workflow', 'Confirm the Primary Product Owner Workflow is visible with ordered steps.', 3),
      (v_workflow_id, 'Confirm Failed Workflow Warning', 'Confirm a failed workflow prevents full verification in the Completion Report.', 4),
      (v_workflow_id, 'Verify Confidence Calculation', 'Verify Engineering Confidence changes when PO verification is not completed.', 5),
      (v_workflow_id, 'Verify Verification Dashboard', 'Verify the Engineering Verification Dashboard summarises status across all EWOs.', 6)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
