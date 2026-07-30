
-- ─────────────────────────────────────────────────────────────────────────────
-- Feature Relationships
-- Bi-directional dependency and hierarchy graph between features
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecc_feature_relationships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_feature_id     text NOT NULL,
  to_feature_id       text NOT NULL,
  relationship_type   text NOT NULL,
  -- parent | child | depends_on | used_by | blocks | blocked_by | related
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_feature_id, to_feature_id, relationship_type)
);
ALTER TABLE ecc_feature_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_feature_relationships" ON ecc_feature_relationships
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_efr_from ON ecc_feature_relationships(from_feature_id);
CREATE INDEX IF NOT EXISTS idx_efr_to   ON ecc_feature_relationships(to_feature_id);
CREATE INDEX IF NOT EXISTS idx_efr_type ON ecc_feature_relationships(relationship_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature Timeline
-- Chronological audit history per feature
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecc_feature_timeline (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id   text NOT NULL,
  event_type   text NOT NULL,
  -- created | db_updated | ui_added | logic_updated | testing_started
  -- | testing_passed | testing_failed | released | docs_updated
  -- | regression_started | regression_passed | deprecated | restored
  -- | issue_found | issue_resolved | owner_changed | review_completed
  event_label  text NOT NULL,
  description  text,
  actor        text,              -- who triggered this; NULL → Unknown
  event_date   timestamptz NOT NULL DEFAULT now(),
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ecc_feature_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_feature_timeline" ON ecc_feature_timeline
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_eft_feature_id  ON ecc_feature_timeline(feature_id);
CREATE INDEX IF NOT EXISTS idx_eft_event_date  ON ecc_feature_timeline(event_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature Test Cases
-- Per-feature test case library and results
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecc_feature_test_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id      text NOT NULL,
  title           text NOT NULL,
  description     text,
  test_type       text DEFAULT 'manual',
  -- manual | automated | regression | edge_case | smoke | security | performance
  steps           text,
  expected_result text,
  actual_result   text,
  status          text DEFAULT 'not_run',
  -- not_run | passed | failed | blocked | skipped
  tested_at       timestamptz,
  tested_by       text,
  notes           text,
  position        integer DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ecc_feature_test_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_feature_test_cases" ON ecc_feature_test_cases
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_eftc_feature_id ON ecc_feature_test_cases(feature_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature Versions
-- Version history per feature
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecc_feature_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id      text NOT NULL,
  version         text NOT NULL,
  release_date    timestamptz,
  deployment_date timestamptz,
  changes         text,
  breaking_change boolean DEFAULT false,
  released_by     text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ecc_feature_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_feature_versions" ON ecc_feature_versions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_efv_feature_id ON ecc_feature_versions(feature_id);
