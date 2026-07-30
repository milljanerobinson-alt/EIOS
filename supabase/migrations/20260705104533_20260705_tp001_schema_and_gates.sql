/*
# TP-001 Platform Release Validation Suite — Schema

## Changes
1. Extends engineering_guardian_release_gates gate_type CHECK constraint to include 'tp001_pass'
2. Creates ecc_tp001_executions table for execution history
3. Creates ecc_tp001_results table for per-case results
4. Inserts tp001_pass release gate (blocking, threshold 85%)

## Notes
- Both new tables use authenticated-scoped RLS (ECC is admin-only)
- tp001_pass gate is blocking by default — release cannot proceed if TP-001 fails
*/

-- ── 0. Extend gate_type CHECK to include tp001_pass ───────────────────────────

ALTER TABLE engineering_guardian_release_gates
  DROP CONSTRAINT IF EXISTS engineering_guardian_release_gates_gate_type_check;

ALTER TABLE engineering_guardian_release_gates
  ADD CONSTRAINT engineering_guardian_release_gates_gate_type_check
  CHECK (gate_type = ANY (ARRAY[
    'no_critical_findings', 'max_high_risk', 'min_engineering_health',
    'min_mc_compliance', 'no_security_issues', 'no_layout_regressions',
    'max_technical_debt', 'min_maintainability', 'tp001_pass'
  ]));

-- ── 1. Execution history ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_tp001_executions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_number         text        NOT NULL UNIQUE,
  status                   text        NOT NULL DEFAULT 'in_progress',
  release_id               uuid        REFERENCES ecc_release_candidates(id) ON DELETE SET NULL,
  platform_version         text,
  tester                   text        NOT NULL DEFAULT 'Product Owner',
  guardian_review_id       uuid        REFERENCES architecture_guardian_reviews(id) ON DELETE SET NULL,
  total_cases              integer     NOT NULL DEFAULT 0,
  pass_count               integer     NOT NULL DEFAULT 0,
  fail_count               integer     NOT NULL DEFAULT 0,
  blocked_count            integer     NOT NULL DEFAULT 0,
  skip_count               integer     NOT NULL DEFAULT 0,
  pass_rate                numeric(5,2),
  engineering_health_score integer,
  release_recommendation   text        NOT NULL DEFAULT 'pending',
  confidence_score         integer,
  suite_breakdown          jsonb       NOT NULL DEFAULT '[]',
  critical_failures        jsonb       NOT NULL DEFAULT '[]',
  markdown_report          text,
  notes                    text,
  duration_minutes         integer,
  executed_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_tp001_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sel_tp001_exec" ON ecc_tp001_executions;
DROP POLICY IF EXISTS "ins_tp001_exec" ON ecc_tp001_executions;
DROP POLICY IF EXISTS "upd_tp001_exec" ON ecc_tp001_executions;
DROP POLICY IF EXISTS "del_tp001_exec" ON ecc_tp001_executions;

CREATE POLICY "sel_tp001_exec" ON ecc_tp001_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "ins_tp001_exec" ON ecc_tp001_executions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "upd_tp001_exec" ON ecc_tp001_executions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "del_tp001_exec" ON ecc_tp001_executions FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION upd_tp001_exec_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tp001_exec_ts ON ecc_tp001_executions;
CREATE TRIGGER tp001_exec_ts
  BEFORE UPDATE ON ecc_tp001_executions
  FOR EACH ROW EXECUTE FUNCTION upd_tp001_exec_ts();

CREATE INDEX IF NOT EXISTS idx_tp001_exec_status  ON ecc_tp001_executions(status);
CREATE INDEX IF NOT EXISTS idx_tp001_exec_release ON ecc_tp001_executions(release_id);
CREATE INDEX IF NOT EXISTS idx_tp001_exec_created ON ecc_tp001_executions(created_at DESC);

-- ── 2. Per-case results ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_tp001_results (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id    uuid        NOT NULL REFERENCES ecc_tp001_executions(id) ON DELETE CASCADE,
  test_case_id    uuid        REFERENCES ecc_test_cases(id) ON DELETE SET NULL,
  suite_name      text        NOT NULL,
  case_number     text        NOT NULL,
  title           text        NOT NULL,
  category        text        NOT NULL DEFAULT 'functional',
  priority        text        NOT NULL DEFAULT 'medium',
  steps           text,
  expected_result text,
  status          text        NOT NULL DEFAULT 'pending',
  actual_result   text,
  notes           text,
  tester          text,
  executed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (execution_id, case_number)
);

ALTER TABLE ecc_tp001_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sel_tp001_res" ON ecc_tp001_results;
DROP POLICY IF EXISTS "ins_tp001_res" ON ecc_tp001_results;
DROP POLICY IF EXISTS "upd_tp001_res" ON ecc_tp001_results;
DROP POLICY IF EXISTS "del_tp001_res" ON ecc_tp001_results;

CREATE POLICY "sel_tp001_res" ON ecc_tp001_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "ins_tp001_res" ON ecc_tp001_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "upd_tp001_res" ON ecc_tp001_results FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "del_tp001_res" ON ecc_tp001_results FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_tp001_res_exec   ON ecc_tp001_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_tp001_res_status ON ecc_tp001_results(status);

-- ── 3. Add tp001_pass release gate ────────────────────────────────────────────

INSERT INTO engineering_guardian_release_gates (name, description, gate_type, is_enabled, threshold_value, severity)
SELECT
  'TP-001 Pass Required',
  'Latest TP-001 execution must achieve pass rate >= threshold with release_recommendation = proceed.',
  'tp001_pass',
  true,
  85,
  'blocking'
WHERE NOT EXISTS (
  SELECT 1 FROM engineering_guardian_release_gates WHERE gate_type = 'tp001_pass'
);
