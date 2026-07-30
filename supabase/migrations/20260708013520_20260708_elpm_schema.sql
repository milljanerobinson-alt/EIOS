/*
# Engineering Learning, Precedent & Memory Engine (ELPM) — Schema

## Purpose
Adds persistent Engineering Memory storage and ELPM result columns to
ecc_engineering_reviews so the AI Technical Director can accumulate and
apply engineering knowledge across all future reviews.

## New Tables

### ecc_engineering_memory
Stores permanent Product Owner decisions, governance standards, architecture
principles, and engineering preferences. The AI Technical Director consults
this table before generating every Engineering Review.

Columns:
- id (uuid, PK)
- memory_type — 'governance_standard' | 'architecture_principle' |
  'engineering_preference' | 'documentation_standard' | 'testing_standard' |
  'review_convention' | 'platform_decision' | 'po_decision'
- title — short title of the memory entry
- content — full text of the decision or principle
- weight — authority weight 1–5 (5 = highest: accepted PO decisions)
- source_type — 'engineering_review' | 'po_decision' | 'audit' | 'manual'
- source_ref — reference of the source artefact (e.g. ERC-001)
- is_superseded (boolean, default false)
- superseded_by — ref of the newer entry that replaces this one
- applies_to (text[]) — engineering areas or types this applies to
- created_at / updated_at

### ecc_engineering_lineage (lightweight; most lineage is computed in-memory)
Tracks explicit supersession relationships between engineering artefacts.

Columns:
- id (uuid, PK)
- from_ref — the older artefact reference
- to_ref — the newer artefact reference
- relationship_type — 'supersedes' | 'superseded_by' | 'replaced_by' | 'related'
- artefact_type — 'engineering_review' | 'ewo' | 'specification' | etc.
- created_at

## Modified Table: ecc_engineering_reviews
Adds 8 ELPM result columns (all nullable / additive only):

- elpm_similar_reviews (jsonb) — array of SimilarArtefact objects
- elpm_learning_summary (jsonb) — EngineeringLearningSummary
- elpm_evolution_summary (jsonb) — EngineeringEvolutionSummary
- elpm_historical_comparison (jsonb) — HistoricalComparison
- elpm_memory_summary (jsonb) — condensed memory application summary
- elpm_historical_confidence (numeric) — 0.0–1.0
- elpm_generated_at (timestamptz) — when ELPM last ran
- elpm_engine_version (text) — for cache invalidation

## Security
RLS is enabled on both new tables with anon + authenticated policies
(single-tenant no-auth admin app).

## Important Notes
1. All column additions use IF NOT EXISTS for idempotency.
2. No existing columns are dropped or modified.
3. ecc_engineering_memory is designed for long-term accumulation —
   never delete rows, only set is_superseded = true.
*/

-- ─── ecc_engineering_memory ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_engineering_memory (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_type    text NOT NULL CHECK (memory_type IN (
    'governance_standard','architecture_principle','engineering_preference',
    'documentation_standard','testing_standard','review_convention',
    'platform_decision','po_decision'
  )),
  title          text NOT NULL,
  content        text NOT NULL,
  weight         integer NOT NULL DEFAULT 3 CHECK (weight BETWEEN 1 AND 5),
  source_type    text NOT NULL DEFAULT 'manual',
  source_ref     text NOT NULL DEFAULT '',
  is_superseded  boolean NOT NULL DEFAULT false,
  superseded_by  text,
  applies_to     text[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_engineering_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_memory" ON ecc_engineering_memory;
CREATE POLICY "anon_select_memory" ON ecc_engineering_memory FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_memory" ON ecc_engineering_memory;
CREATE POLICY "anon_insert_memory" ON ecc_engineering_memory FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_memory" ON ecc_engineering_memory;
CREATE POLICY "anon_update_memory" ON ecc_engineering_memory FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_memory" ON ecc_engineering_memory;
CREATE POLICY "anon_delete_memory" ON ecc_engineering_memory FOR DELETE TO anon, authenticated USING (true);

-- ─── ecc_engineering_lineage ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_engineering_lineage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_ref          text NOT NULL,
  to_ref            text NOT NULL,
  relationship_type text NOT NULL DEFAULT 'superseded_by' CHECK (relationship_type IN (
    'supersedes','superseded_by','replaced_by','related'
  )),
  artefact_type     text NOT NULL DEFAULT 'engineering_review',
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_engineering_lineage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_lineage" ON ecc_engineering_lineage;
CREATE POLICY "anon_select_lineage" ON ecc_engineering_lineage FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_lineage" ON ecc_engineering_lineage;
CREATE POLICY "anon_insert_lineage" ON ecc_engineering_lineage FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_lineage" ON ecc_engineering_lineage;
CREATE POLICY "anon_update_lineage" ON ecc_engineering_lineage FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_lineage" ON ecc_engineering_lineage;
CREATE POLICY "anon_delete_lineage" ON ecc_engineering_lineage FOR DELETE TO anon, authenticated USING (true);

-- ─── ELPM columns on ecc_engineering_reviews ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='elpm_similar_reviews') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN elpm_similar_reviews jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='elpm_learning_summary') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN elpm_learning_summary jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='elpm_evolution_summary') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN elpm_evolution_summary jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='elpm_historical_comparison') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN elpm_historical_comparison jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='elpm_memory_summary') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN elpm_memory_summary jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='elpm_historical_confidence') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN elpm_historical_confidence numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='elpm_generated_at') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN elpm_generated_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ecc_engineering_reviews' AND column_name='elpm_engine_version') THEN
    ALTER TABLE ecc_engineering_reviews ADD COLUMN elpm_engine_version text;
  END IF;
END $$;

-- ─── Seed initial Engineering Memory entries ──────────────────────────────────

INSERT INTO ecc_engineering_memory (memory_type, title, content, weight, source_type, source_ref, applies_to) VALUES
(
  'architecture_principle',
  'RLS mandatory on all new Supabase tables',
  'Every new database table must have Row Level Security enabled with appropriate policies. Tables without RLS are considered a security defect and must not be deployed to production.',
  5, 'manual', 'ECC-ARCH-001', ARRAY['database', 'security', 'platform']
),
(
  'testing_standard',
  'Regression testing required for all defect resolutions',
  'Any defect resolution or root cause analysis must include regression testing evidence before the Engineering Review can be closed. Test results must be documented in the Engineering Review.',
  5, 'manual', 'ECC-TEST-001', ARRAY['defect_resolution', 'root_cause_analysis', 'quality']
),
(
  'documentation_standard',
  'Engineering Specification required before architecture changes',
  'Architecture changes must be preceded by an approved Engineering Specification. Direct implementation of architecture changes without a prior specification is not permitted.',
  4, 'manual', 'ECC-DOC-001', ARRAY['architecture_review', 'platform']
),
(
  'governance_standard',
  'Product Owner approval gate before release',
  'All Engineering Reviews require Product Owner approval before the associated change can be included in a Release Candidate. Engineering decisions cannot bypass the PO approval gate.',
  5, 'manual', 'ECC-GOV-001', ARRAY['release', 'governance', 'all']
),
(
  'engineering_preference',
  'Modular, pure-function architecture for engine modules',
  'Analysis engines (ERIE, ELPM, etc.) must follow a modular architecture where each analysis module is a pure function. No global mutable state. Context is passed as function arguments.',
  4, 'manual', 'ECC-ARCH-002', ARRAY['engineering_reviews', 'ai_platform', 'backend']
),
(
  'testing_standard',
  'Permanent Test Plans must be linked before release',
  'Every release must reference at least one active Test Plan. Releases without linked Test Plans are considered not ready for PO approval.',
  4, 'manual', 'ECC-TEST-002', ARRAY['release', 'testing', 'all']
)
ON CONFLICT DO NOTHING;
