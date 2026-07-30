
-- EOC Product Feature Registry
-- Stores every implemented feature as a single source of truth

CREATE TABLE IF NOT EXISTS ecc_product_features (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  feature_id            text UNIQUE NOT NULL,          -- e.g. FEAT-001
  name                  text NOT NULL,
  category              text NOT NULL,                 -- see categories below
  sub_category          text,

  -- Description
  description           text,
  purpose               text,

  -- Status & Priority
  status                text NOT NULL DEFAULT 'implemented',
  -- values: planned | in_progress | implemented | deprecated | removed
  priority              text,
  -- values: critical | high | medium | low

  -- Release & Version
  release_version       text,
  release_id            uuid,

  -- Dates
  created_date          timestamptz,
  updated_date          timestamptz,
  implementation_date   timestamptz,
  deprecated_date       timestamptz,

  -- Source
  implementation_source text,
  -- values: Migration | Component | Edge Function | Library | Scheduled Job | External API | Configuration
  source_file           text,
  developer             text DEFAULT 'AI',
  -- values: AI | Manual | Mixed

  -- Testing
  testing_status        text DEFAULT 'requires_review',
  -- values: not_tested | testing | passed | failed | requires_retest | requires_review

  -- Production Readiness
  production_ready      boolean DEFAULT false,

  -- Relationships (stored as text arrays for simplicity)
  dependencies          text[] DEFAULT '{}',
  related_feature_ids   text[] DEFAULT '{}',

  -- Impact
  database_changes      text,
  api_changes           text,
  ui_changes            text,
  compliance_impact     text,
  audit_impact          text,
  security_impact       text,

  -- Documentation
  documentation_status  text DEFAULT 'unknown',
  -- values: complete | partial | missing | unknown
  known_issues          text,
  future_enhancements   text,
  notes                 text,

  -- Roadmap linkage
  roadmap_item_id       uuid REFERENCES ecc_roadmap_items(id) ON DELETE SET NULL,

  -- Audit support (for future auto-scan)
  last_audit_date       timestamptz,
  audit_flags           text[] DEFAULT '{}',
  -- e.g. ['missing_tests', 'no_docs', 'unknown_date', 'roadmap_mismatch']

  -- Metadata
  tags                  text[] DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_product_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_product_features"
  ON ecc_product_features FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ecc_product_features_category   ON ecc_product_features(category);
CREATE INDEX IF NOT EXISTS idx_ecc_product_features_status     ON ecc_product_features(status);
CREATE INDEX IF NOT EXISTS idx_ecc_product_features_feature_id ON ecc_product_features(feature_id);


-- Product Audit Reports
-- One row per audit run; stores summary metrics

CREATE TABLE IF NOT EXISTS ecc_product_audit_reports (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date                  timestamptz NOT NULL DEFAULT now(),
  triggered_by                text,

  -- Summary counts
  total_features              integer DEFAULT 0,
  features_implemented        integer DEFAULT 0,
  features_planned            integer DEFAULT 0,
  features_deprecated         integer DEFAULT 0,

  new_features_added          integer DEFAULT 0,
  existing_features_updated   integer DEFAULT 0,
  possible_duplicates         integer DEFAULT 0,

  missing_documentation       integer DEFAULT 0,
  missing_testing             integer DEFAULT 0,
  unknown_dates               integer DEFAULT 0,
  unknown_versions            integer DEFAULT 0,

  -- Roadmap comparison
  roadmap_differences         jsonb DEFAULT '[]',

  -- Recommended clean-up
  recommended_cleanup         jsonb DEFAULT '[]',

  -- Audit flags summary
  features_with_flags         integer DEFAULT 0,
  all_flags_summary           jsonb DEFAULT '{}',

  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_product_audit_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_product_audit_reports"
  ON ecc_product_audit_reports FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMENT ON TABLE ecc_product_features IS
  'Single source of truth for every implemented, planned, or deprecated product feature. Designed to support future auto-scan capability.';

COMMENT ON TABLE ecc_product_audit_reports IS
  'Summary reports generated each time a product audit is run. Tracks drift between implementation and documentation over time.';
