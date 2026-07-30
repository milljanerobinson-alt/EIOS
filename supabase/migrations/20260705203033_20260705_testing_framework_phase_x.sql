/*
# Testing Framework Phase X — Enterprise Architecture Refinement

## Summary
Renames TP-001 to "Core Platform Validation", extends execution tracking with
version/traceability columns, and introduces the ecc_versions table for
Engineering Command Centre versioning.

## Changes

### 1. Rename TP-001
- Updates title in ecc_test_plans from "Platform Release Validation Suite" to
  "Core Platform Validation" for plan_number = 'TP-001'

### 2. Extend ecc_tp001_executions with version tracking
- platform_version (text) — LLN+D platform version under test
- ecc_version (text) — Engineering Command Centre version
- spec_version (text) — Specification register version
- release_candidate (text) — Linked RC identifier
- linked_release (text) — Linked release label
- linked_guardian_review_id (uuid) — FK to architecture_guardian_reviews
- linked_audit_id (uuid) — FK to ecc_audits
- duration_minutes (integer) — Execution wall-clock duration

### 3. New table: ecc_versions
Tracks Engineering Command Centre version history independently of the
LLN+D platform while maintaining traceability between both.

Columns:
- id (uuid, PK)
- version_number (text, unique) — e.g. "ECC v1.0.0"
- release_date (date)
- release_notes (text)
- status (text) — draft | active | superseded
- linked_features (uuid[]) — feature IDs
- linked_spec_ids (text[]) — specification identifiers
- linked_test_run_ids (uuid[]) — execution IDs
- linked_audit_id (uuid) — FK to ecc_audits
- linked_guardian_review_id (uuid) — FK to architecture_guardian_reviews
- platform_version (text) — corresponding LLN+D version
- created_at, updated_at

### Security
- RLS enabled, 4 separate policies (TO authenticated)

### Seed
- Initial ECC version record: ECC v1.0.0 (status: active)
*/

-- ── 1. Rename TP-001 ──────────────────────────────────────────────────────────
UPDATE ecc_test_plans
  SET title = 'Core Platform Validation'
  WHERE plan_number = 'TP-001' AND title != 'Core Platform Validation';

-- ── 2. Extend executions with version/traceability columns ────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='platform_version') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN platform_version text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='ecc_version') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN ecc_version text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='spec_version') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN spec_version text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='release_candidate') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN release_candidate text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='linked_release') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN linked_release text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='linked_guardian_review_id') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN linked_guardian_review_id uuid REFERENCES architecture_guardian_reviews(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='linked_audit_id') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN linked_audit_id uuid REFERENCES ecc_audits(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_tp001_executions' AND column_name='duration_minutes') THEN
    ALTER TABLE ecc_tp001_executions ADD COLUMN duration_minutes integer;
  END IF;
END $$;

-- ── 3. ecc_versions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecc_versions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number            text NOT NULL UNIQUE,
  release_date              date,
  release_notes             text,
  status                    text NOT NULL DEFAULT 'draft'
    CHECK (status = ANY(ARRAY['draft','active','superseded'])),
  platform_version          text,
  linked_features           uuid[] DEFAULT '{}',
  linked_spec_ids           text[] DEFAULT '{}',
  linked_test_run_ids       uuid[] DEFAULT '{}',
  linked_audit_id           uuid REFERENCES ecc_audits(id) ON DELETE SET NULL,
  linked_guardian_review_id uuid REFERENCES architecture_guardian_reviews(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_ecc_versions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS ecc_versions_updated_at ON ecc_versions;
CREATE TRIGGER ecc_versions_updated_at
  BEFORE UPDATE ON ecc_versions
  FOR EACH ROW EXECUTE FUNCTION update_ecc_versions_updated_at();

ALTER TABLE ecc_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_ecc_versions" ON ecc_versions;
CREATE POLICY "select_ecc_versions" ON ecc_versions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_ecc_versions" ON ecc_versions;
CREATE POLICY "insert_ecc_versions" ON ecc_versions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_ecc_versions" ON ecc_versions;
CREATE POLICY "update_ecc_versions" ON ecc_versions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_ecc_versions" ON ecc_versions;
CREATE POLICY "delete_ecc_versions" ON ecc_versions FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ecc_versions_status ON ecc_versions(status);

-- Seed initial ECC version
INSERT INTO ecc_versions (version_number, release_date, status, platform_version, release_notes)
  VALUES ('ECC v1.0.0', CURRENT_DATE, 'active', 'LLN+D v1.0', 'Initial Engineering Command Centre release. Includes Mission Control, Testing Framework, Engineering Guardian, Release Centre, Product Audit, Architecture, Documentation, AI Platform, Change Log, and all core engineering infrastructure.')
  ON CONFLICT (version_number) DO NOTHING;
