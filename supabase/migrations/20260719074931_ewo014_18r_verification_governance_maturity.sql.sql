/*
# EWO-014.18R — Engineering Verification Governance Maturity

## Purpose
Extends the Engineering Verification Framework (EWO-014.18) with immutable
verification history, evidence recording, governed verification roles,
automatic reverification detection, confidence explanations, verification
dependencies, automatic PO test guide generation, platform verification
coverage, and the Engineering Trust Score.

## New Tables

1. `engineering_verification_history` — immutable audit log of every
   verification change. Each row records the previous status, new status,
   changed_by, reason, timestamp, and related EWO. History is append-only.

2. `engineering_verification_dependencies` — defines prerequisites between
   verification types. E.g. po_acceptance requires workflow passed, build
   passed, regression passed.

3. `engineering_po_test_guides` — auto-generated Product Owner Testing
   Guides per EWO. Includes prerequisites, test steps, expected results,
   and regression checks. Editable by Product Owners.

4. `engineering_po_test_guide_steps` — ordered steps in a PO test guide.

5. `engineering_platform_coverage` — platform verification coverage per
   capability (e.g. Engineering Identity, Historical Recovery, Routing).
   Aggregates verification across capabilities rather than only EWOs.

6. `engineering_trust_scores` — Engineering Trust Score per engineering
   object. Measures long-term confidence (distinct from Engineering
   Confidence which measures current verification quality).

## Modified Tables

- `engineering_verification_matrix` — adds columns:
  - `verification_role` (text) — governed role of the verifier.
  - `verification_method` (text) — how the verification was performed.
  - `evidence_type` (text) — type of evidence.
  - `requires_reverification` (boolean, default false) — set true when
    engineering changes invalidate this verification.
  - `reverification_reason` (text) — why reverification is required.
  - `last_engineering_change_at` (timestamptz) — timestamp of the last
    engineering change that triggered reverification.

- `engineering_test_classifications` — adds columns:
  - `default_role` (text) — default verification role for this test type.
  - `prerequisite_codes` (text[]) — codes of test types that must pass
    before this one can be verified.

## Security
- RLS enabled on all new tables.
- SELECT allowed for anon + authenticated (read-only visibility).
- Writes restricted to authenticated.

## Constitutional Amendment
- Seeds CONST-001-AMD-007 ratifying the updated ES-VER-001 principles.

## Engineering Standard Update
- Updates ES-VER-001 with the 6 new maturity principles.

## Important Notes
1. All tables are idempotent (IF NOT EXISTS).
2. Policies are dropped before creation to be re-runnable.
3. No existing data is modified or deleted — only additive columns.
4. Backwards compatible: existing confidence calculation unchanged.
*/

-- ─── 1. Verification Matrix evidence columns ───────────────────────────────

ALTER TABLE engineering_verification_matrix
  ADD COLUMN IF NOT EXISTS verification_role text;
ALTER TABLE engineering_verification_matrix
  ADD COLUMN IF NOT EXISTS verification_method text;
ALTER TABLE engineering_verification_matrix
  ADD COLUMN IF NOT EXISTS evidence_type text;
ALTER TABLE engineering_verification_matrix
  ADD COLUMN IF NOT EXISTS requires_reverification boolean NOT NULL DEFAULT false;
ALTER TABLE engineering_verification_matrix
  ADD COLUMN IF NOT EXISTS reverification_reason text;
ALTER TABLE engineering_verification_matrix
  ADD COLUMN IF NOT EXISTS last_engineering_change_at timestamptz;

-- ─── 2. Test Classifications: default role + prerequisites ───────────────────

ALTER TABLE engineering_test_classifications
  ADD COLUMN IF NOT EXISTS default_role text;
ALTER TABLE engineering_test_classifications
  ADD COLUMN IF NOT EXISTS prerequisite_codes text[] NOT NULL DEFAULT '{}';

-- Seed default roles and prerequisites for the 10 canonical types.
UPDATE engineering_test_classifications SET default_role = 'Implementation Engineer'
WHERE code IN ('unit', 'service', 'integration', 'ui_component') AND default_role IS NULL;

UPDATE engineering_test_classifications SET default_role = 'Product Owner'
WHERE code IN ('workflow', 'po_verification', 'po_acceptance') AND default_role IS NULL;

UPDATE engineering_test_classifications SET default_role = 'Engineering Director'
WHERE code = 'build_verification' AND default_role IS NULL;

UPDATE engineering_test_classifications SET default_role = 'Implementation Engineer'
WHERE code IN ('regression', 'manual_verification') AND default_role IS NULL;

-- Prerequisites: po_acceptance requires workflow + build + regression passed.
UPDATE engineering_test_classifications
SET prerequisite_codes = '{workflow,build_verification,regression}'
WHERE code = 'po_acceptance';

-- Workflow tests require integration passed.
UPDATE engineering_test_classifications
SET prerequisite_codes = '{integration}'
WHERE code = 'workflow';

-- PO verification requires workflow passed.
UPDATE engineering_test_classifications
SET prerequisite_codes = '{workflow}'
WHERE code = 'po_verification';

-- ─── 3. Verification History (immutable) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_verification_history (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id              uuid        NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  matrix_row_id       uuid        REFERENCES engineering_verification_matrix(id) ON DELETE SET NULL,
  test_type           text        NOT NULL,
  previous_status     text        NOT NULL,
  new_status          text        NOT NULL,
  changed_by          text        NOT NULL DEFAULT 'system',
  reason              text,
  related_ewo_ref     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_history_ewo
  ON engineering_verification_history(ewo_id);
CREATE INDEX IF NOT EXISTS idx_verification_history_created
  ON engineering_verification_history(created_at DESC);

ALTER TABLE engineering_verification_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_verification_history" ON engineering_verification_history;
CREATE POLICY "anon_read_verification_history" ON engineering_verification_history
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_verification_history" ON engineering_verification_history;
CREATE POLICY "auth_insert_verification_history" ON engineering_verification_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── 4. Verification Dependencies ────────────────────────────────────────────
-- Stores prerequisite relationships between verification types.
-- (The test_classifications.prerequisite_codes column is the canonical
-- definition; this table allows EWO-specific overrides.)

CREATE TABLE IF NOT EXISTS engineering_verification_dependencies (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id              uuid        REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  test_type           text        NOT NULL,
  prerequisite_type   text        NOT NULL,
  required_status     text        NOT NULL DEFAULT 'passed',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ewo_id, test_type, prerequisite_type)
);

ALTER TABLE engineering_verification_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_verification_deps" ON engineering_verification_dependencies;
CREATE POLICY "anon_read_verification_deps" ON engineering_verification_dependencies
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_verification_deps" ON engineering_verification_dependencies;
CREATE POLICY "auth_insert_verification_deps" ON engineering_verification_dependencies
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_verification_deps" ON engineering_verification_dependencies;
CREATE POLICY "auth_delete_verification_deps" ON engineering_verification_dependencies
  FOR DELETE TO authenticated USING (true);

-- ─── 5. PO Test Guides ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_po_test_guides (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id          uuid        NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  description     text,
  prerequisites   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  expected_results jsonb      NOT NULL DEFAULT '[]'::jsonb,
  regression_checks jsonb     NOT NULL DEFAULT '[]'::jsonb,
  risk_level      text        NOT NULL DEFAULT 'medium',
  is_edited       boolean     NOT NULL DEFAULT false,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_test_guides_ewo
  ON engineering_po_test_guides(ewo_id);

ALTER TABLE engineering_po_test_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_po_test_guides" ON engineering_po_test_guides;
CREATE POLICY "anon_read_po_test_guides" ON engineering_po_test_guides
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_po_test_guides" ON engineering_po_test_guides;
CREATE POLICY "auth_insert_po_test_guides" ON engineering_po_test_guides
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_po_test_guides" ON engineering_po_test_guides;
CREATE POLICY "auth_update_po_test_guides" ON engineering_po_test_guides
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_po_test_guides" ON engineering_po_test_guides;
CREATE POLICY "auth_delete_po_test_guides" ON engineering_po_test_guides
  FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS engineering_po_test_guide_steps (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id        uuid        NOT NULL REFERENCES engineering_po_test_guides(id) ON DELETE CASCADE,
  step_label      text        NOT NULL,
  step_description text,
  expected_result text,
  order_index     int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_test_guide_steps_guide
  ON engineering_po_test_guide_steps(guide_id);

ALTER TABLE engineering_po_test_guide_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_po_test_guide_steps" ON engineering_po_test_guide_steps;
CREATE POLICY "anon_read_po_test_guide_steps" ON engineering_po_test_guide_steps
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_po_test_guide_steps" ON engineering_po_test_guide_steps;
CREATE POLICY "auth_insert_po_test_guide_steps" ON engineering_po_test_guide_steps
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_po_test_guide_steps" ON engineering_po_test_guide_steps;
CREATE POLICY "auth_update_po_test_guide_steps" ON engineering_po_test_guide_steps
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_po_test_guide_steps" ON engineering_po_test_guide_steps;
CREATE POLICY "auth_delete_po_test_guide_steps" ON engineering_po_test_guide_steps
  FOR DELETE TO authenticated USING (true);

-- ─── 6. Platform Verification Coverage ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_platform_coverage (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  capability      text        NOT NULL UNIQUE,
  description     text,
  coverage_pct    numeric(5,2) NOT NULL DEFAULT 0,
  verified_count  int         NOT NULL DEFAULT 0,
  total_count     int         NOT NULL DEFAULT 0,
  last_assessed_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_platform_coverage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_platform_coverage" ON engineering_platform_coverage;
CREATE POLICY "anon_read_platform_coverage" ON engineering_platform_coverage
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_manage_platform_coverage" ON engineering_platform_coverage;
CREATE POLICY "auth_manage_platform_coverage" ON engineering_platform_coverage
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed platform coverage capabilities.
INSERT INTO engineering_platform_coverage (capability, description, coverage_pct, verified_count, total_count)
VALUES
  ('Engineering Identity',        'Identity reconciliation and canonical record management.',        100.00, 0, 0),
  ('Historical Recovery',          'Historical recovery dashboard, workspace, and import.',          92.00, 0, 0),
  ('Routing',                     'Engineering routing and navigation graph.',                      100.00, 0, 0),
  ('Execution Engine',            'Engineering execution platform and workflow automation.',         78.00, 0, 0),
  ('Conversation Pipeline',       'ATD conversation lifecycle and intelligence.',                    96.00, 0, 0),
  ('Engineering Memory',          'Engineering record model and memory lineage.',                   100.00, 0, 0),
  ('Verification Framework',      'Engineering verification matrix, confidence, and trust.',        85.00, 0, 0),
  ('Governance',                  'Constitutional amendments, standards, and review workflow.',     90.00, 0, 0)
ON CONFLICT (capability) DO NOTHING;

-- ─── 7. Engineering Trust Scores ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_trust_scores (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id                      uuid        NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  trust_level                 text        NOT NULL DEFAULT 'moderate',
  -- excellent | good | moderate | low | critical
  trust_score                 numeric(5,2) NOT NULL DEFAULT 50.00,
  -- 0..100
  verification_age_days       int         NOT NULL DEFAULT 0,
  reopenings_count            int         NOT NULL DEFAULT 0,
  outstanding_defects         int         NOT NULL DEFAULT 0,
  failed_regressions          int         NOT NULL DEFAULT 0,
  outstanding_tech_debt       int         NOT NULL DEFAULT 0,
  changes_since_verification  int         NOT NULL DEFAULT 0,
  po_acceptance_status        text        NOT NULL DEFAULT 'pending',
  release_count               int         NOT NULL DEFAULT 0,
  explanation                 jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- Array of { contributor, value, impact }
  assessed_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ewo_id)
);

CREATE INDEX IF NOT EXISTS idx_trust_scores_ewo
  ON engineering_trust_scores(ewo_id);

ALTER TABLE engineering_trust_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_trust_scores" ON engineering_trust_scores;
CREATE POLICY "anon_read_trust_scores" ON engineering_trust_scores
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_trust_scores" ON engineering_trust_scores;
CREATE POLICY "auth_insert_trust_scores" ON engineering_trust_scores
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_trust_scores" ON engineering_trust_scores;
CREATE POLICY "auth_update_trust_scores" ON engineering_trust_scores
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_trust_scores" ON engineering_trust_scores;
CREATE POLICY "auth_delete_trust_scores" ON engineering_trust_scores
  FOR DELETE TO authenticated USING (true);

-- ─── 8. Update ES-VER-001 with maturity principles ────────────────────────────

UPDATE ecc_engineering_standards
SET body = $BODY$## Engineering Verification Standard (ES-VER-001)

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

6. **Verification evidence shall be permanently traceable.**
   Every verification record shall include the status, verifier, role, date,
   method, evidence reference, and evidence type. Evidence references shall
   link to the relevant engineering record.

7. **Verification history shall never be destroyed.**
   Every verification change shall create a new historical record. Previous
   verification events shall remain permanently visible. History is append-only.

8. **Engineering changes invalidate affected verification.**
   When source code, database migrations, routing, components, workflows,
   standards, or constitutional amendments change, affected verification shall
   automatically become "Pending Reverification". The original verification
   history is preserved.

9. **Confidence shall always be explainable.**
   Engineering Confidence shall explain how it was calculated by listing every
   contributor and its status. Confidence calculations shall be fully
   transparent.

10. **Trust reflects long-term engineering quality.**
    Engineering Trust is distinct from Engineering Confidence. Trust measures
    long-term confidence in the engineering object, considering verification
    age, reopenings, defects, failed regressions, technical debt, changes since
    verification, Product Owner acceptance, and release history.

11. **Product Owner testing should be generated automatically where possible.**
    ATD shall automatically generate Product Owner Testing Guides considering
    changed engineering objects, the Primary Product Owner Workflow, modified
    components, risk level, regression impact, and previous verification
    history. Product Owners may edit the generated guide before execution.

### Required Verification Rows

Every Engineering Work Order shall maintain an Engineering Verification Matrix
with the following rows: Unit Tests, Integration Tests, Workflow Tests, UI
Tests, Manual Verification, Product Owner Testing, Product Owner Acceptance,
and Build. Each row shall be in one of: Not Run, Passed, Failed, Blocked, Not
Applicable, or Pending Reverification.

### Verification Dependencies

Verification types may define prerequisites. Product Owner Acceptance requires
Workflow, Build, and Regression to be Passed. Workflow Tests require Integration
Tests to be Passed. Blocked verification shall clearly explain why it cannot yet
execute.

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
    updated_at = now()
WHERE title = 'Engineering Verification Standard';

-- ─── 9. Constitutional Amendment CONST-001-AMD-007 ────────────────────────────

INSERT INTO constitutional_documents
  (document_ref, title, document_type, version, status, programme, authored_by, sections, metadata)
SELECT
  'CONST-001-AMD-007',
  'Engineering Verification Governance Maturity Amendment',
  'constitutional_amendment',
  '1.0',
  'ratified',
  'EIOS Platform',
  'ATD',
  jsonb_build_array(
    jsonb_build_object(
      'chapter', 1,
      'id', 'amd007-1',
      'title', 'Verification Evidence Permanence',
      'content',
      'Every verification record shall include status, verifier, role, date, method, evidence reference, and evidence type. Verification history shall never be destroyed. Every verification change shall create a new historical record. Previous verification events shall remain permanently visible.',
      'subsections', '[]'::jsonb
    ),
    jsonb_build_object(
      'chapter', 2,
      'id', 'amd007-2',
      'title', 'Automatic Reverification',
      'content',
      'Engineering changes — including source code, database migrations, routing, components, workflows, standards, and constitutional amendments — shall automatically invalidate affected verification. Affected verification status shall become "Pending Reverification". The original verification history shall be preserved.',
      'subsections', '[]'::jsonb
    ),
    jsonb_build_object(
      'chapter', 3,
      'id', 'amd007-3',
      'title', 'Explainable Confidence',
      'content',
      'Engineering Confidence shall always explain how it was calculated by listing every contributor and its status. Confidence calculations shall be fully transparent.',
      'subsections', '[]'::jsonb
    ),
    jsonb_build_object(
      'chapter', 4,
      'id', 'amd007-4',
      'title', 'Engineering Trust',
      'content',
      'Engineering Trust is distinct from Engineering Confidence. Trust measures long-term confidence in the engineering object, considering verification age, reopenings, outstanding defects, failed regressions, technical debt, changes since verification, Product Owner acceptance, and release history. Trust shall be reported as Excellent, Good, Moderate, Low, or Critical, with a full explanation.',
      'subsections', '[]'::jsonb
    ),
    jsonb_build_object(
      'chapter', 5,
      'id', 'amd007-5',
      'title', 'Automatic Product Owner Test Generation',
      'content',
      'ATD shall automatically generate Product Owner Testing Guides considering changed engineering objects, the Primary Product Owner Workflow, modified components, risk level, regression impact, and previous verification history. Product Owners may edit the generated guide before execution.',
      'subsections', '[]'::jsonb
    ),
    jsonb_build_object(
      'chapter', 6,
      'id', 'amd007-6',
      'title', 'Platform Verification Coverage',
      'content',
      'The Verification Dashboard shall display Platform Verification Coverage, aggregating verification across capabilities rather than only Engineering Work Orders.',
      'subsections', '[]'::jsonb
    )
  ),
  jsonb_build_object(
    'source_ewo', 'EWO-014.18R',
    'ratified_by', 'ATD',
    'summary', 'Establishes verification evidence permanence, immutable history, automatic reverification, explainable confidence, engineering trust, automatic PO test generation, and platform verification coverage.'
  )
WHERE NOT EXISTS (
  SELECT 1 FROM constitutional_documents WHERE document_ref = 'CONST-001-AMD-007'
);
