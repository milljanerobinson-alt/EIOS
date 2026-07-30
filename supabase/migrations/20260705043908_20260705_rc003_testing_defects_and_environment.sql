/*
# RC-003: Defect Tracking, Environment Configuration, and Checklist Templates

## Summary
This migration adds three core capabilities needed for RC-003 Engineering Excellence:

### 1. Defect Tracking (ecc_defects)
A permanent defect registry linked to test cases, features, releases, and recommendations.
Each defect has a unique DEF-nnn number, severity, status lifecycle, reproducibility,
environment discovered in, fix details, and linkage to the test case that found it.

### 2. Release Readiness Checklist Templates (ecc_checklist_templates)
Reusable checklist templates that can be applied to any release candidate.
Templates contain versioned item sets with categories, mandatory/optional flags,
and acceptance criteria. Templates replace the ad-hoc checklist approach.

### 3. Environment Configuration (ecc_environments)
Tracks Development, Staging, and Production environment definitions.
Prevents accidental production changes by recording the active environment
and providing change history.

### 4. Feature Documentation Enhancement
Adds structured documentation columns to ecc_product_features:
- business_value, business_problem, user_story
- api_endpoints, known_issues, future_improvements
- doc_version, doc_owner, doc_last_reviewed_at

### 5. Sequence Registration
Registers DEF (defect) sequence in ecc_register_sequences.

## Tables Modified
- ecc_product_features: documentation enhancement columns
- ecc_register_sequences: DEF sequence added

## New Tables
- ecc_defects: defect registry linked to test cases and features
- ecc_checklist_templates: reusable Release Readiness Checklist templates
- ecc_checklist_template_items: items within a checklist template
- ecc_environments: environment configuration (dev/staging/prod)

## Security
- RLS enabled on all new tables with anon + authenticated policies (single-tenant app)
*/

-- ─── 1. Register DEF sequence ─────────────────────────────────────────────────

INSERT INTO ecc_register_sequences (register_type, last_number)
VALUES ('def', 0)
ON CONFLICT (register_type) DO NOTHING;

-- ─── 2. Defect tracking ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_number text UNIQUE NOT NULL,              -- DEF-001, DEF-002, ...
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium',         -- critical / high / medium / low
  status text NOT NULL DEFAULT 'open',             -- open / in_progress / fixed / verified / closed / deferred / wont_fix
  priority text NOT NULL DEFAULT 'medium',         -- critical / high / medium / low
  environment_found text DEFAULT 'production',     -- production / staging / development
  reproducibility text DEFAULT 'consistent',       -- consistent / intermittent / unable_to_reproduce
  steps_to_reproduce text,
  expected_behaviour text,
  actual_behaviour text,
  root_cause text,
  fix_description text,
  workaround text,
  -- Linkages
  test_case_id uuid REFERENCES ecc_test_cases(id) ON DELETE SET NULL,
  feature_id text,                                 -- FEAT-nnn reference
  linked_release text,                             -- RC-nnn reference
  linked_audit text,                               -- AUD-nnn reference
  linked_rec_id text,                              -- REC-nnn reference
  -- Workflow
  reported_by text,
  reported_date date DEFAULT CURRENT_DATE,
  assigned_to text,
  target_fix_date date,
  fixed_date date,
  verified_by text,
  verified_date date,
  -- Evidence
  evidence_url text,
  screenshot_notes text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_defects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_defects" ON ecc_defects;
CREATE POLICY "anon_select_defects" ON ecc_defects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_defects" ON ecc_defects;
CREATE POLICY "anon_insert_defects" ON ecc_defects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_defects" ON ecc_defects;
CREATE POLICY "anon_update_defects" ON ecc_defects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_defects" ON ecc_defects;
CREATE POLICY "anon_delete_defects" ON ecc_defects FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ecc_defects_status ON ecc_defects(status);
CREATE INDEX IF NOT EXISTS idx_ecc_defects_severity ON ecc_defects(severity);
CREATE INDEX IF NOT EXISTS idx_ecc_defects_feature_id ON ecc_defects(feature_id);
CREATE INDEX IF NOT EXISTS idx_ecc_defects_test_case_id ON ecc_defects(test_case_id);

-- ─── 3. Checklist templates ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_number text UNIQUE NOT NULL,            -- CHK-001, CHK-002, ...
  name text NOT NULL,
  description text,
  template_type text NOT NULL DEFAULT 'release_readiness',  -- release_readiness / qa / compliance / deployment
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',           -- active / archived
  total_items int DEFAULT 0,
  mandatory_items int DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chk_templates" ON ecc_checklist_templates;
CREATE POLICY "anon_select_chk_templates" ON ecc_checklist_templates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_chk_templates" ON ecc_checklist_templates;
CREATE POLICY "anon_insert_chk_templates" ON ecc_checklist_templates FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_chk_templates" ON ecc_checklist_templates;
CREATE POLICY "anon_update_chk_templates" ON ecc_checklist_templates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_chk_templates" ON ecc_checklist_templates;
CREATE POLICY "anon_delete_chk_templates" ON ecc_checklist_templates FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS ecc_checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES ecc_checklist_templates(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'General',       -- Testing / Documentation / Security / Deployment / Compliance / General
  title text NOT NULL,
  description text,
  acceptance_criteria text,
  item_type text NOT NULL DEFAULT 'mandatory',     -- mandatory / optional / conditional
  allows_defer boolean NOT NULL DEFAULT false,
  allows_exception boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_checklist_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chk_items" ON ecc_checklist_template_items;
CREATE POLICY "anon_select_chk_items" ON ecc_checklist_template_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_chk_items" ON ecc_checklist_template_items;
CREATE POLICY "anon_insert_chk_items" ON ecc_checklist_template_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_chk_items" ON ecc_checklist_template_items;
CREATE POLICY "anon_update_chk_items" ON ecc_checklist_template_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_chk_items" ON ecc_checklist_template_items;
CREATE POLICY "anon_delete_chk_items" ON ecc_checklist_template_items FOR DELETE TO anon, authenticated USING (true);

-- ─── 4. Compliance versions (enhance existing table) ─────────────────────────

-- ecc_compliance_versions already created in rc_003_engineering_excellence_schema.sql
-- Ensure it has all needed columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_compliance_versions' AND column_name='template_id') THEN
    ALTER TABLE ecc_compliance_versions ADD COLUMN template_id uuid REFERENCES ecc_checklist_templates(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_compliance_versions' AND column_name='total_items') THEN
    ALTER TABLE ecc_compliance_versions ADD COLUMN total_items int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_compliance_versions' AND column_name='passed_items') THEN
    ALTER TABLE ecc_compliance_versions ADD COLUMN passed_items int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_compliance_versions' AND column_name='failed_items') THEN
    ALTER TABLE ecc_compliance_versions ADD COLUMN failed_items int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_compliance_versions' AND column_name='deferred_items') THEN
    ALTER TABLE ecc_compliance_versions ADD COLUMN deferred_items int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_compliance_versions' AND column_name='exception_items') THEN
    ALTER TABLE ecc_compliance_versions ADD COLUMN exception_items int DEFAULT 0;
  END IF;
END $$;

-- ─── 5. Environment configuration ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                              -- Development / Staging / Production
  env_key text UNIQUE NOT NULL,                    -- development / staging / production
  description text,
  url text,
  is_active boolean NOT NULL DEFAULT false,
  is_production boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT false,
  db_host text,
  notes text,
  last_deployment_at timestamptz,
  last_deployment_by text,
  last_deployment_rc text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_environments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_environments" ON ecc_environments;
CREATE POLICY "anon_select_environments" ON ecc_environments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_environments" ON ecc_environments;
CREATE POLICY "anon_insert_environments" ON ecc_environments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_environments" ON ecc_environments;
CREATE POLICY "anon_update_environments" ON ecc_environments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_environments" ON ecc_environments;
CREATE POLICY "anon_delete_environments" ON ecc_environments FOR DELETE TO anon, authenticated USING (true);

-- Seed environments
INSERT INTO ecc_environments (name, env_key, description, is_active, is_production, requires_approval)
VALUES
  ('Development', 'development', 'Local development environment. Fast iteration, experimental features. No data safety guarantees.', false, false, false),
  ('Staging', 'staging', 'Pre-production staging environment. Mirror of production schema. Used for final validation before release.', false, false, true),
  ('Production', 'production', 'Live production environment. Real customer data. All changes require formal RC and approval.', true, true, true)
ON CONFLICT (env_key) DO NOTHING;

-- ─── 6. Feature documentation enhancement ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='business_value') THEN
    ALTER TABLE ecc_product_features ADD COLUMN business_value text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='business_problem') THEN
    ALTER TABLE ecc_product_features ADD COLUMN business_problem text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='user_story') THEN
    ALTER TABLE ecc_product_features ADD COLUMN user_story text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='known_issues') THEN
    ALTER TABLE ecc_product_features ADD COLUMN known_issues text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='future_improvements') THEN
    ALTER TABLE ecc_product_features ADD COLUMN future_improvements text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='doc_version') THEN
    ALTER TABLE ecc_product_features ADD COLUMN doc_version text DEFAULT '1.0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='doc_owner') THEN
    ALTER TABLE ecc_product_features ADD COLUMN doc_owner text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='doc_last_reviewed_at') THEN
    ALTER TABLE ecc_product_features ADD COLUMN doc_last_reviewed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='api_endpoints') THEN
    ALTER TABLE ecc_product_features ADD COLUMN api_endpoints text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='open_defect_count') THEN
    ALTER TABLE ecc_product_features ADD COLUMN open_defect_count int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='last_tested_at') THEN
    ALTER TABLE ecc_product_features ADD COLUMN last_tested_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='last_passed_at') THEN
    ALTER TABLE ecc_product_features ADD COLUMN last_passed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_product_features' AND column_name='test_case_count') THEN
    ALTER TABLE ecc_product_features ADD COLUMN test_case_count int DEFAULT 0;
  END IF;
END $$;
