/*
# EWO-017R.2 — Canonical Execution Eligibility & Testable Launch Correction

## Purpose

This migration creates the canonical evidence sources required for governed
Engineering Execution eligibility:

1. A new `ewo_execution_approvals` table — the canonical source for Product
   Owner approval *to begin engineering execution*. This is distinct from
   post-verification PO acceptance and from closure acceptance. Only this
   table authorises execution launch.

2. A governed test Engineering Work Order (`EWO-TEST-001`) with all canonical
   prerequisites satisfied: engineering package, engineering review, PO
   execution approval, and a valid execution target.

3. A test execution target (`ET-TEST`) that is active, not protected, and
   clearly labelled as a test target.

## New Tables

### ewo_execution_approvals
- `id` (uuid, primary key)
- `ewo_id` (uuid, FK to engineering_work_orders, NOT NULL)
- `approval_ref` (text, unique)
- `decision` (text — 'approved' | 'rejected' | 'withdrawn')
- `product_owner` (text)
- `approval_statement` (text)
- `evidence_metadata` (jsonb)
- `is_test` (boolean, default false)
- `created_at` (timestamptz)

## Security
- RLS enabled on `ewo_execution_approvals` with authenticated CRUD policies.

## Important Notes
- `engineering_plans` table does NOT exist — eligibility resolver uses
  `ewo_engineering_packages` with `package_status = 'approved'`.
- `engineering_reviews` table does NOT exist — eligibility resolver uses
  `ecc_engineering_reviews` with `status = 'approved'`, matched via
  `metadata->>'ewo_ref'`.
- `ewo_lifecycle_events` has no `event_type` column — PO execution approval
  is tracked in the new `ewo_execution_approvals` table.
*/

-- ── 1. Create ewo_execution_approvals table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS ewo_execution_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  approval_ref text UNIQUE NOT NULL,
  decision text NOT NULL DEFAULT 'approved' CHECK (decision IN ('approved', 'rejected', 'withdrawn')),
  product_owner text NOT NULL,
  approval_statement text,
  evidence_metadata jsonb DEFAULT '{}'::jsonb,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ewo_execution_approvals_ewo_id
  ON ewo_execution_approvals(ewo_id);
CREATE INDEX IF NOT EXISTS idx_ewo_execution_approvals_decision
  ON ewo_execution_approvals(decision);

ALTER TABLE ewo_execution_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_execution_approvals" ON ewo_execution_approvals;
CREATE POLICY "select_execution_approvals" ON ewo_execution_approvals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_execution_approvals" ON ewo_execution_approvals;
CREATE POLICY "insert_execution_approvals" ON ewo_execution_approvals
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_execution_approvals" ON ewo_execution_approvals;
CREATE POLICY "update_execution_approvals" ON ewo_execution_approvals
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_execution_approvals" ON ewo_execution_approvals;
CREATE POLICY "delete_execution_approvals" ON ewo_execution_approvals
  FOR DELETE TO authenticated USING (true);

-- ── 2. Create governed test execution target ─────────────────────────────────

INSERT INTO execution_targets (id, target_ref, platform, repository, default_branch, staging_branch, production_branch, description, is_protected, is_active)
SELECT 'a1111111-0000-0000-0000-000000000001', 'ET-TEST', 'Test Platform', 'test-repository',
       'main', 'staging', 'main',
       'Governed test execution target for Product Owner execution testing (EWO-017R.2). Non-production.',
       false, true
WHERE NOT EXISTS (SELECT 1 FROM execution_targets WHERE target_ref = 'ET-TEST');

-- ── 3. Create governed test Engineering Work Order ───────────────────────────

INSERT INTO engineering_work_orders (
  id, ewo_ref, title, executive_summary, business_objective, engineering_objective,
  priority, risk_level, status, implementation_status, engineering_package_status,
  scope, validation_requirements, engineering_notes, implementation_notes,
  is_historical_import, po_testing_status, closure_eligible
)
SELECT
  'a1111111-0000-0000-0000-000000000002',
  'EWO-TEST-001',
  'EWO-TEST-001 — Product Owner Execution Launch Test Candidate',
  'Governed non-production test Engineering Work Order for validating the Begin Engineering Execution flow. This EWO has all canonical prerequisites satisfied: engineering package approved, engineering review approved, and Product Owner execution approval recorded. It contains a minimal safe implementation package and is intended for Product Owner testing only.',
  'Validate that the Product Owner can successfully launch an Engineering Execution through the governed UI flow.',
  'Provide a genuinely eligible EWO with all canonical prerequisites so the execution launch pipeline can be tested end to end.',
  'low', 'low', 'draft', 'Not Started', 'approved',
  'Create a minimal test component to validate the execution pipeline. No production functionality is affected.',
  'Verify that the execution pipeline completes successfully and produces a completion report.',
  'Test EWO created by EWO-017R.2 migration. All prerequisites are canonical and verified.',
  'No implementation has been performed. This EWO is genuinely eligible for execution.',
  false, 'pending', false
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-TEST-001');

-- ── 4. Create approved engineering package for the test EWO ──────────────────

INSERT INTO ewo_engineering_packages (
  id, ewo_id, version, package_status, summary, engineering_objectives,
  implementation_scope, acceptance_criteria, relevant_standards,
  implementation_notes, expected_deliverables, verification_requirements,
  completion_requirements, constitutional_references, constraints, package_body
)
SELECT
  'a1111111-0000-0000-0000-000000000003',
  e.id, 1, 'approved',
  'Minimal test implementation package for EWO-TEST-001. Contains a safe, non-production implementation scope.',
  'Validate execution pipeline end to end',
  'Create a minimal test file in the test repository. No production code is affected.',
  'Execution pipeline completes successfully',
  'ES-002 Canonical Engineering Governance',
  'This package is for testing purposes only. Implementation is minimal and safe.',
  'Test component created',
  'Build passes; Tests pass',
  'Completion report generated',
  ARRAY['AMD-001: Self-Engineering Prohibition (N/A — test target is not protected)'],
  'No production constraints apply. Test target ET-TEST is not protected.',
  'Minimal test implementation package body. Safe for execution testing.'
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-TEST-001'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_engineering_packages p
    WHERE p.ewo_id = e.id
  );

-- ── 5. Create approved engineering review for the test EWO ────────────────────

INSERT INTO ecc_engineering_reviews (
  id, erc_number, title, type, status, engineering_area, author, review_date,
  executive_summary, problem_statement, engineering_analysis, root_cause,
  engineering_decision, changes_implemented, files_modified, validation_performed,
  regression_testing, lessons_learned, future_recommendations, engineering_assessment,
  full_review, metadata
)
SELECT
  'a1111111-0000-0000-0000-000000000004',
  'ERC-TEST-001',
  'Engineering Review: EWO-TEST-001 Execution Launch Test',
  'execution_readiness',
  'approved',
  'Test',
  'Bolt Implementation',
  now(),
  'Engineering review for the governed test EWO. Verifies that the test candidate is safe for execution testing.',
  'No production risk. Test EWO targets a non-protected test repository.',
  'The test EWO has a minimal approved engineering package, a valid non-protected execution target, and no prior implementation.',
  'No issues identified. All prerequisites are satisfied.',
  'Approve execution readiness for test EWO-TEST-001.',
  'No changes required. This is a test review.',
  ARRAY[]::text[],
  'Review completed. All prerequisites verified.',
  'No regression risk — test target only.',
  'Test execution candidate is safe for Product Owner testing.',
  'Archive test EWO after testing is complete.',
  'PASS — execution readiness confirmed for test EWO-TEST-001.',
  'Engineering review for EWO-TEST-001 (governed test candidate). Verdict: PASS.',
  jsonb_build_object('ewo_ref', 'EWO-TEST-001', 'verdict', 'pass', 'is_test', true)
WHERE NOT EXISTS (SELECT 1 FROM ecc_engineering_reviews WHERE erc_number = 'ERC-TEST-001');

-- ── 6. Create canonical PO execution approval for the test EWO ───────────────

INSERT INTO ewo_execution_approvals (
  id, ewo_id, approval_ref, decision, product_owner, approval_statement,
  evidence_metadata, is_test
)
SELECT
  'a1111111-0000-0000-0000-000000000005',
  e.id,
  'POEA-TEST-001',
  'approved',
  'Product Owner',
  'Product Owner approval to begin engineering execution for test EWO-TEST-001. This approval authorises execution launch testing only.',
  jsonb_build_object('ewo_ref', 'EWO-TEST-001', 'is_test', true, 'approval_type', 'begin_engineering'),
  true
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-TEST-001'
  AND NOT EXISTS (SELECT 1 FROM ewo_execution_approvals WHERE approval_ref = 'POEA-TEST-001');

-- ── 7. Create lifecycle event for the test EWO ───────────────────────────────

INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT
  e.id, NULL, 'draft', 'bolt_implementation',
  'EWO-TEST-001 created as governed test execution candidate (EWO-017R.2). All canonical prerequisites satisfied: engineering package approved, engineering review approved (ERC-TEST-001), PO execution approval recorded (POEA-TEST-001), execution target ET-TEST configured.',
  jsonb_build_object('is_test', true, 'standard', 'ES-002', 'created_by', 'EWO-017R.2')
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-TEST-001'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events le WHERE le.ewo_id = e.id
  );
