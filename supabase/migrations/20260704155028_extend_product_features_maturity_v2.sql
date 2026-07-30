
-- ─────────────────────────────────────────────────────────────────────────────
-- Extend ecc_product_features with maturity, evidence, testing, business,
-- release, screenshot, and AI Product Manager preparation columns
-- ─────────────────────────────────────────────────────────────────────────────

-- Lifecycle Stage (replaces simple production_ready boolean)
ALTER TABLE ecc_product_features
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'live';
  -- planned | in_development | feature_complete | internally_tested
  -- | regression_tested | production_ready | released | live | deprecated

-- Business & Product Management
ALTER TABLE ecc_product_features
  ADD COLUMN IF NOT EXISTS business_value        text,        -- low | medium | high | critical
  ADD COLUMN IF NOT EXISTS customer_impact       text,
  ADD COLUMN IF NOT EXISTS compliance_critical   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_critical        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS operational_risk      text,        -- low | medium | high | critical
  ADD COLUMN IF NOT EXISTS technical_complexity  text,        -- low | medium | high | very_high
  ADD COLUMN IF NOT EXISTS estimated_maintenance_effort text,
  ADD COLUMN IF NOT EXISTS owner                 text,
  ADD COLUMN IF NOT EXISTS review_frequency      text;

-- Test Management
ALTER TABLE ecc_product_features
  ADD COLUMN IF NOT EXISTS testing_phase              text,   -- smoke | functional | regression | performance | security | uat
  ADD COLUMN IF NOT EXISTS last_tested_at             timestamptz,
  ADD COLUMN IF NOT EXISTS tested_by                  text,
  ADD COLUMN IF NOT EXISTS regression_required        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regression_completed       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_evidence              text,
  ADD COLUMN IF NOT EXISTS test_notes                 text,
  ADD COLUMN IF NOT EXISTS bug_history                text,
  ADD COLUMN IF NOT EXISTS future_test_requirements   text;

-- Implementation Evidence (structured arrays)
ALTER TABLE ecc_product_features
  ADD COLUMN IF NOT EXISTS impl_db_tables        text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_migrations       text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_edge_functions   text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_pages            text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_components       text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_hooks_utilities  text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_api_endpoints    text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_cron_jobs        text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_email_templates  text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_env_variables    text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impl_ai_services      text[] DEFAULT '{}';

-- Release History
ALTER TABLE ecc_product_features
  ADD COLUMN IF NOT EXISTS first_release_version    text,
  ADD COLUMN IF NOT EXISTS first_release_date       timestamptz,
  ADD COLUMN IF NOT EXISTS current_release_version  text,
  ADD COLUMN IF NOT EXISTS last_modified_release    text,
  ADD COLUMN IF NOT EXISTS deployment_date          timestamptz,
  ADD COLUMN IF NOT EXISTS release_notes            text;

-- Screenshot & Media Support (URLs only; actual storage is external)
ALTER TABLE ecc_product_features
  ADD COLUMN IF NOT EXISTS screenshot_desktop   text,  -- URL or storage path
  ADD COLUMN IF NOT EXISTS screenshot_mobile    text,
  ADD COLUMN IF NOT EXISTS screenshot_workflow  text,
  ADD COLUMN IF NOT EXISTS diagram_url          text,
  ADD COLUMN IF NOT EXISTS architecture_image   text;

-- AI Product Manager Preparation
ALTER TABLE ecc_product_features
  ADD COLUMN IF NOT EXISTS ai_scan_hash      text,   -- fingerprint of last auto-scan
  ADD COLUMN IF NOT EXISTS ai_detected       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_scan_notes     text,
  ADD COLUMN IF NOT EXISTS ai_scan_date      timestamptz;

-- Full-text search index on name + description + category
CREATE INDEX IF NOT EXISTS idx_ecc_pf_fts ON ecc_product_features
  USING gin(to_tsvector('english',
    coalesce(name,'') || ' ' ||
    coalesce(description,'') || ' ' ||
    coalesce(category,'') || ' ' ||
    coalesce(sub_category,'') || ' ' ||
    coalesce(purpose,'')
  ));
