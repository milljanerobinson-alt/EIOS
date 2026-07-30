-- Testing Framework extension
-- 1. RC checklist instances (apply templates to specific releases)
-- 2. Feature-test case junction (link test cases to product features)
-- 3. Test run results (detailed per-case results for a run)

-- ── 1. RC Checklist Instances ─────────────────────────────────────────────────
-- Instantiates a checklist template against a specific RC

CREATE TABLE IF NOT EXISTS ecc_rc_checklist_instances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_id           uuid NOT NULL REFERENCES ecc_release_candidates(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES ecc_checklist_templates(id) ON DELETE SET NULL,
  item_id         uuid REFERENCES ecc_checklist_template_items(id) ON DELETE CASCADE,
  title           text NOT NULL,
  category        text,
  item_type       text DEFAULT 'mandatory',
  status          text NOT NULL DEFAULT 'pending',  -- pending | pass | fail | blocked | na | deferred
  notes           text,
  completed_by    text,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_rcchi_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER rcchi_updated_at
  BEFORE UPDATE ON ecc_rc_checklist_instances
  FOR EACH ROW EXECUTE FUNCTION update_rcchi_updated_at();

ALTER TABLE ecc_rc_checklist_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_rcchi" ON ecc_rc_checklist_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_rcchi" ON ecc_rc_checklist_instances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_rcchi" ON ecc_rc_checklist_instances FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_rcchi" ON ecc_rc_checklist_instances FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_rcchi_rc_id ON ecc_rc_checklist_instances(rc_id);

-- ── 2. Feature–Test Case Junction ────────────────────────────────────────────
-- Many-to-many: product features <-> test cases (supplements the text feature_id column)

CREATE TABLE IF NOT EXISTS ecc_feature_test_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id      uuid NOT NULL REFERENCES ecc_product_features(id) ON DELETE CASCADE,
  test_case_id    uuid NOT NULL REFERENCES ecc_test_cases(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_id, test_case_id)
);

ALTER TABLE ecc_feature_test_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ftl" ON ecc_feature_test_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_ftl" ON ecc_feature_test_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_ftl" ON ecc_feature_test_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_ftl" ON ecc_feature_test_links FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_ftl_feature_id   ON ecc_feature_test_links(feature_id);
CREATE INDEX idx_ftl_test_case_id ON ecc_feature_test_links(test_case_id);

-- ── 3. Extend test_runs with per-case results ────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_test_run_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES ecc_test_runs(id) ON DELETE CASCADE,
  test_case_id  uuid NOT NULL REFERENCES ecc_test_cases(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending',  -- pending | pass | fail | skipped | blocked
  actual_result text,
  notes         text,
  run_by        text,
  run_at        timestamptz DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_test_run_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_trr" ON ecc_test_run_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_trr" ON ecc_test_run_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_trr" ON ecc_test_run_results FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_trr" ON ecc_test_run_results FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_trr_run_id       ON ecc_test_run_results(run_id);
CREATE INDEX idx_trr_test_case_id ON ecc_test_run_results(test_case_id);

-- ── 4. Extend ecc_product_features with test plan linkage ────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_product_features' AND column_name = 'linked_test_plan_ids'
  ) THEN
    ALTER TABLE ecc_product_features ADD COLUMN linked_test_plan_ids uuid[] DEFAULT '{}';
  END IF;
END $$;

-- ── 5. Extend ecc_testing_reports with audit linkage ────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_testing_reports' AND column_name = 'linked_audit_id'
  ) THEN
    ALTER TABLE ecc_testing_reports ADD COLUMN linked_audit_id uuid REFERENCES ecc_audits(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_testing_reports' AND column_name = 'linked_feature_ids'
  ) THEN
    ALTER TABLE ecc_testing_reports ADD COLUMN linked_feature_ids uuid[] DEFAULT '{}';
  END IF;
END $$;
