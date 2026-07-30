/*
# EWO-023R.1: Historical Engineering Bootstrap & AI Knowledge Preparation

## Summary
Creates infrastructure for one-time governed bootstrap of all historical
engineering artefacts into the Engineering Records Library, with draft
knowledge packages for AI preparation.

## New Tables

### 1. `historical_bootstrap_runs`
Tracks each execution of the bootstrap, with statistics and runtime.
- id (uuid PK)
- run_id (text, unique) — unique identifier for each run
- status (text) — 'running', 'completed', 'failed'
- artefacts_discovered (integer)
- artefacts_imported (integer)
- artefacts_skipped (integer)
- relationships_reconstructed (integer)
- health_issues_detected (integer)
- draft_packages_prepared (integer)
- started_at (timestamptz)
- completed_at (timestamptz)
- runtime_seconds (integer)
- metadata (jsonb)

### 2. `draft_knowledge_packages`
Draft AI knowledge packages for each EWO, prepared for EWO-024.
- id (uuid PK)
- ewo_ref (text, not null)
- ewo_id (uuid, nullable)
- package_ref (text, unique) — e.g., 'DKP-EWO-001'
- status (text, default 'draft') — 'draft', 'processed', 'archived'
- engineering_summary (text)
- architectural_decisions (text[])
- components_affected (text[])
- services_affected (text[])
- database_changes (text[])
- ui_changes (text[])
- engineering_patterns (text[])
- lessons_learned (text[])
- regression_areas (text[])
- constitutional_references (text[])
- engineering_standards_referenced (text[])
- confidence_score (text)
- metadata (jsonb)
- created_at (timestamptz)
- updated_at (timestamptz)

## Security
- RLS enabled on all new tables
- TO anon, authenticated for read; TO authenticated for insert/update
*/

-- ─── 1. historical_bootstrap_runs ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS historical_bootstrap_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'running',
  artefacts_discovered integer NOT NULL DEFAULT 0,
  artefacts_imported integer NOT NULL DEFAULT 0,
  artefacts_skipped integer NOT NULL DEFAULT 0,
  relationships_reconstructed integer NOT NULL DEFAULT 0,
  health_issues_detected integer NOT NULL DEFAULT 0,
  draft_packages_prepared integer NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  runtime_seconds integer,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE historical_bootstrap_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_bootstrap_runs" ON historical_bootstrap_runs;
CREATE POLICY "anon_read_bootstrap_runs" ON historical_bootstrap_runs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_manage_bootstrap_runs" ON historical_bootstrap_runs;
CREATE POLICY "auth_manage_bootstrap_runs" ON historical_bootstrap_runs FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ─── 2. draft_knowledge_packages ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draft_knowledge_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_ref text NOT NULL,
  ewo_id uuid,
  package_ref text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  engineering_summary text,
  architectural_decisions text[] DEFAULT '{}',
  components_affected text[] DEFAULT '{}',
  services_affected text[] DEFAULT '{}',
  database_changes text[] DEFAULT '{}',
  ui_changes text[] DEFAULT '{}',
  engineering_patterns text[] DEFAULT '{}',
  lessons_learned text[] DEFAULT '{}',
  regression_areas text[] DEFAULT '{}',
  constitutional_references text[] DEFAULT '{}',
  engineering_standards_referenced text[] DEFAULT '{}',
  confidence_score text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE draft_knowledge_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_draft_packages" ON draft_knowledge_packages;
CREATE POLICY "anon_read_draft_packages" ON draft_knowledge_packages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_draft_packages" ON draft_knowledge_packages;
CREATE POLICY "auth_insert_draft_packages" ON draft_knowledge_packages FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_draft_packages" ON draft_knowledge_packages;
CREATE POLICY "auth_update_draft_packages" ON draft_knowledge_packages FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_draft_packages_ewo ON draft_knowledge_packages (ewo_ref);
CREATE INDEX IF NOT EXISTS idx_draft_packages_status ON draft_knowledge_packages (status);
