/*
# EWO-011.3 — Completion Governance Schema (delta additions only)

## Summary
Adds only the columns and tables that are NOT already present in the schema.
All existing columns are left unchanged.

## New Columns on engineering_records_library
- governance_status: tracks the Completion Governance Engine lifecycle
- knowledge_extracted: boolean flag (engineering_knowledge JSONB exists but no flag)
- lineage_established: boolean flag for lineage engine completion
- exports_generated: boolean flag for export automation completion
- is_backfill: marks records created by the historical backfill
- completion_report_ref: reference to the source Completion Report
- engineering_object_refs: array of related engineering refs
- export_urls: JSONB map of export types to content keys

## New Tables
- engineering_record_exports: per-record generated export artefacts
- engineering_governance_log: audit log for governance engine phases

## Security
New tables: RLS enabled with anon+authenticated policies (single-tenant ECC).

## Notes
All operations are idempotent (DO $$ IF NOT EXISTS blocks, CREATE TABLE IF NOT EXISTS).
*/

-- ─── 1. Add missing columns to engineering_records_library ───────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='governance_status') THEN
    ALTER TABLE engineering_records_library ADD COLUMN governance_status TEXT NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='knowledge_extracted') THEN
    ALTER TABLE engineering_records_library ADD COLUMN knowledge_extracted BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='lineage_established') THEN
    ALTER TABLE engineering_records_library ADD COLUMN lineage_established BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='exports_generated') THEN
    ALTER TABLE engineering_records_library ADD COLUMN exports_generated BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='is_backfill') THEN
    ALTER TABLE engineering_records_library ADD COLUMN is_backfill BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='completion_report_ref') THEN
    ALTER TABLE engineering_records_library ADD COLUMN completion_report_ref TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='engineering_object_refs') THEN
    ALTER TABLE engineering_records_library ADD COLUMN engineering_object_refs TEXT[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='export_urls') THEN
    ALTER TABLE engineering_records_library ADD COLUMN export_urls JSONB DEFAULT '{}';
  END IF;
END $$;

-- ─── 2. engineering_record_exports ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_record_exports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id       UUID NOT NULL REFERENCES engineering_records_library(id) ON DELETE CASCADE,
  export_type     TEXT NOT NULL,
  content         TEXT,
  file_size_bytes INT,
  generated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE engineering_record_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_rec_exports" ON engineering_record_exports;
CREATE POLICY "anon_select_rec_exports" ON engineering_record_exports FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_rec_exports" ON engineering_record_exports;
CREATE POLICY "anon_insert_rec_exports" ON engineering_record_exports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_rec_exports" ON engineering_record_exports;
CREATE POLICY "anon_update_rec_exports" ON engineering_record_exports FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_rec_exports" ON engineering_record_exports;
CREATE POLICY "anon_delete_rec_exports" ON engineering_record_exports FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_rec_exports_record_id ON engineering_record_exports(record_id);

-- ─── 3. engineering_governance_log ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_governance_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id  UUID REFERENCES engineering_records_library(id) ON DELETE CASCADE,
  ewo_ref    TEXT,
  phase      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  message    TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE engineering_governance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_gov_log" ON engineering_governance_log;
CREATE POLICY "anon_select_gov_log" ON engineering_governance_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_gov_log" ON engineering_governance_log;
CREATE POLICY "anon_insert_gov_log" ON engineering_governance_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_gov_log" ON engineering_governance_log;
CREATE POLICY "anon_update_gov_log" ON engineering_governance_log FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_gov_log" ON engineering_governance_log;
CREATE POLICY "anon_delete_gov_log" ON engineering_governance_log FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_gov_log_record_id ON engineering_governance_log(record_id);
CREATE INDEX IF NOT EXISTS idx_gov_log_ewo_ref   ON engineering_governance_log(ewo_ref);

-- ─── 4. Index for ewo_ref lookups on main table ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_records_library_ewo_ref
  ON engineering_records_library(ewo_ref);

CREATE INDEX IF NOT EXISTS idx_records_library_governance_status
  ON engineering_records_library(governance_status);
