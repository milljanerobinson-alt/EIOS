/*
# EWO-014.15: Historical Engineering History Import Schema

## Purpose
Support governed import of historical Engineering Work Orders into the Engineering Ledger,
with full engineering provenance, evidence confidence scoring, and enrichment audit trail.

## New Tables

### ewo_engineering_provenance
Stores provenance metadata for each EWO — source, import date, confidence score,
evidence availability flags, and historical notes. One row per EWO.

### ewo_historical_imports
Audit log for each historical import operation — who imported, when, source,
objects created, warnings, and summary.

### ewo_evidence_enrichments
Audit trail for evidence enrichment actions on historical records — what was
attached, by whom, when, and what evidence type.

## Modified Tables

### engineering_work_orders
Added columns:
- is_historical_import (boolean, default false) — flags historical imports
- import_source (text, nullable) — where the record was imported from
- imported_at (timestamptz, nullable) — when the import occurred
- imported_by (text, nullable) — who performed the import
- historical_notes (text, nullable) — notes about the historical record

## Security
- RLS enabled on all new tables with TO anon, authenticated (admin-managed data)
- 4 CRUD policies per table

## Important Notes
1. Existing Historical Migration EWOs are backfilled in a separate migration
2. Confidence scoring is done via a PL/pgSQL function calculate_ewo_confidence()
3. Evidence availability is stored as a jsonb array of evidence type objects
*/

-- ─── Add historical import columns to engineering_work_orders ───────────────
ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS is_historical_import boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS import_source text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_by text,
  ADD COLUMN IF NOT EXISTS historical_notes text;

-- ─── Engineering Provenance table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewo_engineering_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'Historical Engineering Archive',
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by text,
  confidence_level text NOT NULL DEFAULT 'Medium' CHECK (confidence_level IN ('High', 'Medium', 'Low')),
  confidence_score integer NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  evidence_available jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_summary text,
  historical_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ewo_id)
);

ALTER TABLE ewo_engineering_provenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_provenance" ON ewo_engineering_provenance;
CREATE POLICY "select_provenance" ON ewo_engineering_provenance FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_provenance" ON ewo_engineering_provenance;
CREATE POLICY "insert_provenance" ON ewo_engineering_provenance FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_provenance" ON ewo_engineering_provenance;
CREATE POLICY "update_provenance" ON ewo_engineering_provenance FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_provenance" ON ewo_engineering_provenance;
CREATE POLICY "delete_provenance" ON ewo_engineering_provenance FOR DELETE
  TO anon, authenticated USING (true);

-- ─── Historical Import Audit Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewo_historical_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  import_source text NOT NULL DEFAULT 'Historical Engineering Archive',
  ewo_refs text[] NOT NULL DEFAULT '{}',
  objects_created integer NOT NULL DEFAULT 0,
  warnings text[] NOT NULL DEFAULT '{}',
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ewo_historical_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_imports" ON ewo_historical_imports;
CREATE POLICY "select_imports" ON ewo_historical_imports FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_imports" ON ewo_historical_imports;
CREATE POLICY "insert_imports" ON ewo_historical_imports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_imports" ON ewo_historical_imports;
CREATE POLICY "update_imports" ON ewo_historical_imports FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_imports" ON ewo_historical_imports;
CREATE POLICY "delete_imports" ON ewo_historical_imports FOR DELETE
  TO anon, authenticated USING (true);

-- ─── Evidence Enrichment Audit Trail ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewo_evidence_enrichments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  evidence_description text,
  evidence_content text,
  enriched_by text NOT NULL,
  enriched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ewo_evidence_enrichments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_enrichments" ON ewo_evidence_enrichments;
CREATE POLICY "select_enrichments" ON ewo_evidence_enrichments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_enrichments" ON ewo_evidence_enrichments;
CREATE POLICY "insert_enrichments" ON ewo_evidence_enrichments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_enrichments" ON ewo_evidence_enrichments;
CREATE POLICY "update_enrichments" ON ewo_evidence_enrichments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_enrichments" ON ewo_evidence_enrichments;
CREATE POLICY "delete_enrichments" ON ewo_evidence_enrichments FOR DELETE
  TO anon, authenticated USING (true);

-- ─── Confidence Scoring Function ─────────────────────────────────────────────
/*
 * Calculates engineering confidence score (0-100) for an EWO based on
 * available evidence. Each evidence type has a weight. The score is
 * informational only and never fabricates certainty.
 *
 * Evidence weights:
 *   Engineering Record:     15
 *   Engineering Plan:       15
 *   Completion Report:      15
 *   Implementation Evidence: 15
 *   Verification Evidence:   15
 *   Product Owner Acceptance: 10
 *   Original Prompt:         10
 *   Engineering Package:      5
 */
CREATE OR REPLACE FUNCTION calculate_ewo_confidence(p_ewo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_level text;
  v_evidence jsonb := '[]'::jsonb;
  v_has_record boolean := false;
  v_has_plan boolean := false;
  v_has_report boolean := false;
  v_has_impl boolean := false;
  v_has_verification boolean := false;
  v_has_po boolean := false;
  v_has_prompt boolean := false;
  v_has_package boolean := false;
  v_ewo RECORD;
  v_report_count integer;
  v_enrichment_count integer;
BEGIN
  SELECT * INTO v_ewo FROM engineering_work_orders WHERE id = p_ewo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('score', 0, 'level', 'Low', 'evidence', '[]');
  END IF;

  -- Engineering Record (executive_summary + engineering_objective exist)
  v_has_record := v_ewo.executive_summary IS NOT NULL AND v_ewo.engineering_objective IS NOT NULL;
  IF v_has_record THEN
    v_score := v_score + 15;
    v_evidence := v_evidence || jsonb_build_object('type', 'Engineering Record', 'available', true, 'weight', 15);
  ELSE
    v_evidence := v_evidence || jsonb_build_object('type', 'Engineering Record', 'available', false, 'weight', 15);
  END IF;

  -- Engineering Plan (scope exists)
  v_has_plan := v_ewo.scope IS NOT NULL;
  IF v_has_plan THEN
    v_score := v_score + 15;
    v_evidence := v_evidence || jsonb_build_object('type', 'Engineering Plan', 'available', true, 'weight', 15);
  ELSE
    v_evidence := v_evidence || jsonb_build_object('type', 'Engineering Plan', 'available', false, 'weight', 15);
  END IF;

  -- Completion Report
  SELECT count(*) INTO v_report_count FROM ewo_completion_reports WHERE ewo_id = p_ewo_id;
  v_has_report := v_report_count > 0;
  IF v_has_report THEN
    v_score := v_score + 15;
    v_evidence := v_evidence || jsonb_build_object('type', 'Completion Report', 'available', true, 'weight', 15);
  ELSE
    v_evidence := v_evidence || jsonb_build_object('type', 'Completion Report', 'available', false, 'weight', 15);
  END IF;

  -- Implementation Evidence (implementation_summary or changed_files)
  v_has_impl := v_ewo.implementation_summary IS NOT NULL OR (v_ewo.changed_files::text != '[]' AND v_ewo.changed_files IS NOT NULL);
  IF v_has_impl THEN
    v_score := v_score + 15;
    v_evidence := v_evidence || jsonb_build_object('type', 'Implementation Evidence', 'available', true, 'weight', 15);
  ELSE
    v_evidence := v_evidence || jsonb_build_object('type', 'Implementation Evidence', 'available', false, 'weight', 15);
  END IF;

  -- Verification Evidence
  v_has_verification := v_ewo.verification_status IS NOT NULL AND v_ewo.verification_status != 'not_started';
  IF v_has_verification THEN
    v_score := v_score + 15;
    v_evidence := v_evidence || jsonb_build_object('type', 'Verification Evidence', 'available', true, 'weight', 15);
  ELSE
    v_evidence := v_evidence || jsonb_build_object('type', 'Verification Evidence', 'available', false, 'weight', 15);
  END IF;

  -- Product Owner Acceptance
  v_has_po := v_ewo.po_accepted_by IS NOT NULL OR v_ewo.closure_method = 'Product Owner Acceptance';
  IF v_has_po THEN
    v_score := v_score + 10;
    v_evidence := v_evidence || jsonb_build_object('type', 'Product Owner Acceptance', 'available', true, 'weight', 10);
  ELSE
    v_evidence := v_evidence || jsonb_build_object('type', 'Product Owner Acceptance', 'available', false, 'weight', 10);
  END IF;

  -- Original Prompt (implementation_reference)
  v_has_prompt := v_ewo.implementation_reference IS NOT NULL;
  IF v_has_prompt THEN
    v_score := v_score + 10;
    v_evidence := v_evidence || jsonb_build_object('type', 'Original Prompt', 'available', true, 'weight', 10);
  ELSE
    v_evidence := v_evidence || jsonb_build_object('type', 'Original Prompt', 'available', false, 'weight', 10);
  END IF;

  -- Engineering Package
  v_has_package := v_ewo.engineering_package_status = 'Generated';
  IF v_has_package THEN
    v_score := v_score + 5;
    v_evidence := v_evidence || jsonb_build_object('type', 'Engineering Package', 'available', true, 'weight', 5);
  ELSE
    v_evidence := v_evidence || jsonb_build_object('type', 'Engineering Package', 'available', false, 'weight', 5);
  END IF;

  -- Check enrichments for additional evidence
  SELECT count(*) INTO v_enrichment_count FROM ewo_evidence_enrichments WHERE ewo_id = p_ewo_id;
  IF v_enrichment_count > 0 THEN
    v_evidence := v_evidence || jsonb_build_object('type', 'Enrichment Evidence', 'available', true, 'weight', 0, 'count', v_enrichment_count);
  END IF;

  -- Determine confidence level
  IF v_score >= 80 THEN
    v_level := 'High';
  ELSIF v_score >= 50 THEN
    v_level := 'Medium';
  ELSE
    v_level := 'Low';
  END IF;

  RETURN jsonb_build_object(
    'score', v_score,
    'level', v_level,
    'evidence', v_evidence
  );
END;
$$;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ewo_historical_import ON engineering_work_orders (is_historical_import) WHERE is_historical_import = true;
CREATE INDEX IF NOT EXISTS idx_provenance_ewo_id ON ewo_engineering_provenance (ewo_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_ewo_id ON ewo_evidence_enrichments (ewo_id);
CREATE INDEX IF NOT EXISTS idx_imports_imported_at ON ewo_historical_imports (imported_at DESC);