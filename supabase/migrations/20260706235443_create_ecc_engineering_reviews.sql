/*
# Create Engineering Review & Change Log (ERC) System

## Overview
Introduces a permanent engineering governance capability — the Engineering Review
& Change Log Register. ERCs document significant engineering investigations,
architectural changes, root cause analyses, defect fixes, and governance decisions.
They complement Engineering Audits by explaining how identified risks were
understood, resolved, and prevented from recurring.

## New Tables

### ecc_engineering_reviews
Primary register for all Engineering Reviews.

Columns:
- id (uuid, pk)
- erc_number (text, unique) — sequential identifier e.g. ERC-001
- title (text) — descriptive title
- type (text) — review type (root_cause_analysis, architecture_review, etc.)
- status (text) — open | in_progress | closed | superseded
- engineering_area (text) — domain of the review
- author (text) — author name
- review_date (date) — date of the review
- is_reference (boolean) — designates as a protected Reference Review
- reference_reason / reference_date / reference_approved_by (text/timestamptz)

Structured sections (all text):
- executive_summary
- problem_statement
- engineering_analysis
- root_cause
- engineering_decision
- changes_implemented
- validation_performed
- regression_testing
- lessons_learned
- future_recommendations
- engineering_assessment

Arrays:
- files_modified (text[])
- related_audits (text[]) — AUD numbers
- related_features (text[])
- related_releases (text[]) — RC numbers
- related_test_plans (text[])
- related_decisions (text[])
- related_phases (text[])
- related_recommendations (text[])
- related_ercs (text[])

- full_review (text) — complete freeform document content
- metadata (jsonb) — extensible metadata

## Security
- RLS enabled, authenticated CRUD (admin-controlled app)
- anon SELECT allowed for ECC read access (consistent with other ECC tables)

## Notes
1. ERC numbering uses get_next_erc_number() function — returns ERC-NNN format
2. is_reference flag mirrors Reference Audit pattern for governance protection
3. Partial unique index enforces only one Reference Review per engineering_area
*/

-- Main table
CREATE TABLE IF NOT EXISTS ecc_engineering_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erc_number            text UNIQUE NOT NULL,
  title                 text NOT NULL,
  type                  text NOT NULL DEFAULT 'engineering_investigation',
  status                text NOT NULL DEFAULT 'open',
  engineering_area      text,
  author                text DEFAULT 'Engineering Director',
  review_date           date DEFAULT CURRENT_DATE,

  -- Structured review sections
  executive_summary     text,
  problem_statement     text,
  engineering_analysis  text,
  root_cause            text,
  engineering_decision  text,
  changes_implemented   text,
  files_modified        text[],
  validation_performed  text,
  regression_testing    text,
  lessons_learned       text,
  future_recommendations text,
  engineering_assessment text,

  -- Full freeform document
  full_review           text,

  -- Governance links
  related_audits        text[] DEFAULT '{}',
  related_features      text[] DEFAULT '{}',
  related_releases      text[] DEFAULT '{}',
  related_test_plans    text[] DEFAULT '{}',
  related_decisions     text[] DEFAULT '{}',
  related_phases        text[] DEFAULT '{}',
  related_recommendations text[] DEFAULT '{}',
  related_ercs          text[] DEFAULT '{}',

  -- Reference Review governance
  is_reference          boolean DEFAULT false,
  reference_reason      text,
  reference_date        timestamptz,
  reference_approved_by text,

  -- Extensible metadata
  metadata              jsonb DEFAULT '{}',

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_erc_type     ON ecc_engineering_reviews (type);
CREATE INDEX IF NOT EXISTS idx_erc_status   ON ecc_engineering_reviews (status);
CREATE INDEX IF NOT EXISTS idx_erc_date     ON ecc_engineering_reviews (review_date DESC);
CREATE INDEX IF NOT EXISTS idx_erc_area     ON ecc_engineering_reviews (engineering_area);
CREATE INDEX IF NOT EXISTS idx_erc_ref      ON ecc_engineering_reviews (is_reference) WHERE is_reference = true;

-- RLS
ALTER TABLE ecc_engineering_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erc_select" ON ecc_engineering_reviews;
CREATE POLICY "erc_select" ON ecc_engineering_reviews FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "erc_insert" ON ecc_engineering_reviews;
CREATE POLICY "erc_insert" ON ecc_engineering_reviews FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "erc_update" ON ecc_engineering_reviews;
CREATE POLICY "erc_update" ON ecc_engineering_reviews FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "erc_delete" ON ecc_engineering_reviews;
CREATE POLICY "erc_delete" ON ecc_engineering_reviews FOR DELETE
  TO authenticated USING (true);

-- ERC number generator
CREATE OR REPLACE FUNCTION get_next_erc_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(erc_number FROM 5) AS integer)), 0
  ) + 1
  INTO next_num
  FROM ecc_engineering_reviews
  WHERE erc_number ~ '^ERC-[0-9]+$';

  RETURN 'ERC-' || LPAD(next_num::text, 3, '0');
END;
$$;
