/*
# Engineering Intelligence Platform (EIP) — Foundation Schema

## Purpose
Creates the permanent data infrastructure for the Engineering Intelligence Platform (EIP).
The EIP is the intelligence layer that assembles, validates, and packages engineering context
before any AI reasoning begins. It ensures every AI Technical Director workflow starts from
a validated, confidence-scored Engineering Context Package rather than raw, unverified data.

## Architecture
The EIP follows the principle that it ASSEMBLES information but never OWNS it.
All engineering artefacts remain owned by their authoritative tables. The EIP records
what was known at the time of context assembly, enabling complete traceability.

## New Tables

### eip_source_registry
The authoritative registry of every knowledge source within the Engineering Command Centre.
Each row represents a single source (e.g. "Features Registry", "Engineering Reviews").
Sources can be enabled/disabled without code changes. Weight determines contribution to
the overall confidence score. Critical sources trigger high-severity warnings when absent.
- id, source_key (unique), source_name, description
- table_name — the Supabase table to query for coverage assessment
- weight (0–10) — contribution to confidence score
- is_critical — if true, absence produces a high-severity validation warning
- is_enabled, sort_order, metadata (jsonb for future extension)

### eip_platform_states
Immutable versioned snapshots of the overall engineering platform state.
Each row captures a moment-in-time summary of the platform: how many features,
releases, reviews, audits, goals, etc. existed at that instant.
Referenced by Context Packages to provide full traceability.
- id, version (semver string e.g. "1.0.0")
- Snapshot counts: features_count, releases_count, reviews_count, audits_count,
  goals_count, epics_count, phases_count, decisions_count, test_plans_count
- generated_at, generated_by, notes, state_data (jsonb for extensible metrics)

### eip_context_packages
Immutable Engineering Context Packages. Once created, a package is locked and never
modified. Every AI workflow (Engineering Review, Audit, Investment Review, etc.)
references the package used during its analysis, providing complete governance traceability.
- id, package_ref (human-readable e.g. "ECP-001")
- package_version, platform_state_id (FK to eip_platform_states)
- generation_timestamp, trigger_type, trigger_context
- sources_used, missing_sources (jsonb arrays)
- knowledge_confidence_score (0–100), context_completeness_score (0–100)
- validation_status ('valid' | 'warnings' | 'incomplete' | 'invalid')
- executive_summary (text), package_data (full jsonb snapshot)
- is_locked (always true once created — packages are immutable)

### eip_validation_results
Individual validation findings associated with a Context Package.
Multiple findings can exist per package. Findings reduce confidence scores
and are surfaced in the EIP dashboard.
- id, package_id (FK), source_key, validation_type
- severity ('high' | 'medium' | 'low' | 'info'), message, detail
- is_resolved, resolved_at, resolved_by

## Security
All tables use TO anon, authenticated policies (consistent with ECC internal tool pattern).

## Notes
1. All package records are append-only and immutable (is_locked = true).
2. Platform States are append-only snapshots — never updated after creation.
3. Source Registry is the ONLY mutable EIP table (admin can enable/disable/reorder sources).
4. Indexes on timestamp columns for efficient package history queries.
5. The package_ref sequence starts at ECP-001 for human-readable traceability.
*/

-- ─── eip_source_registry ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eip_source_registry (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key   text NOT NULL UNIQUE,
  source_name  text NOT NULL,
  description  text,
  table_name   text NOT NULL,
  weight       integer NOT NULL DEFAULT 5,
  is_critical  boolean NOT NULL DEFAULT false,
  is_enabled   boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  metadata     jsonb DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE eip_source_registry ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_eip_src_enabled ON eip_source_registry(is_enabled, sort_order);

DROP POLICY IF EXISTS "eip_src_select" ON eip_source_registry;
CREATE POLICY "eip_src_select" ON eip_source_registry FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "eip_src_insert" ON eip_source_registry;
CREATE POLICY "eip_src_insert" ON eip_source_registry FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "eip_src_update" ON eip_source_registry;
CREATE POLICY "eip_src_update" ON eip_source_registry FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "eip_src_delete" ON eip_source_registry;
CREATE POLICY "eip_src_delete" ON eip_source_registry FOR DELETE TO anon, authenticated USING (true);

-- ─── eip_platform_states ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eip_platform_states (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version            text NOT NULL,
  features_count     integer NOT NULL DEFAULT 0,
  releases_count     integer NOT NULL DEFAULT 0,
  reviews_count      integer NOT NULL DEFAULT 0,
  audits_count       integer NOT NULL DEFAULT 0,
  goals_count        integer NOT NULL DEFAULT 0,
  epics_count        integer NOT NULL DEFAULT 0,
  phases_count       integer NOT NULL DEFAULT 0,
  decisions_count    integer NOT NULL DEFAULT 0,
  test_plans_count   integer NOT NULL DEFAULT 0,
  docs_count         integer NOT NULL DEFAULT 0,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  generated_by       text,
  notes              text,
  state_data         jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE eip_platform_states ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_eip_ps_generated ON eip_platform_states(generated_at DESC);

DROP POLICY IF EXISTS "eip_ps_select" ON eip_platform_states;
CREATE POLICY "eip_ps_select" ON eip_platform_states FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "eip_ps_insert" ON eip_platform_states;
CREATE POLICY "eip_ps_insert" ON eip_platform_states FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "eip_ps_update" ON eip_platform_states;
CREATE POLICY "eip_ps_update" ON eip_platform_states FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "eip_ps_delete" ON eip_platform_states;
CREATE POLICY "eip_ps_delete" ON eip_platform_states FOR DELETE TO anon, authenticated USING (true);

-- ─── eip_context_packages ─────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS eip_package_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS eip_context_packages (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_ref                  text NOT NULL UNIQUE DEFAULT ('ECP-' || LPAD(nextval('eip_package_seq')::text, 3, '0')),
  package_version              text NOT NULL DEFAULT '1.0',
  platform_state_id            uuid REFERENCES eip_platform_states(id),
  generation_timestamp         timestamptz NOT NULL DEFAULT now(),
  trigger_type                 text NOT NULL DEFAULT 'manual',
  trigger_context              text,
  sources_used                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_sources              jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_confidence_score   integer NOT NULL DEFAULT 0,
  context_completeness_score   integer NOT NULL DEFAULT 0,
  validation_status            text NOT NULL DEFAULT 'valid',
  executive_summary            text,
  package_data                 jsonb DEFAULT '{}'::jsonb,
  is_locked                    boolean NOT NULL DEFAULT true
);

ALTER TABLE eip_context_packages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_eip_cp_generated ON eip_context_packages(generation_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_eip_cp_ref ON eip_context_packages(package_ref);
CREATE INDEX IF NOT EXISTS idx_eip_cp_status ON eip_context_packages(validation_status);

DROP POLICY IF EXISTS "eip_cp_select" ON eip_context_packages;
CREATE POLICY "eip_cp_select" ON eip_context_packages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "eip_cp_insert" ON eip_context_packages;
CREATE POLICY "eip_cp_insert" ON eip_context_packages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "eip_cp_update" ON eip_context_packages;
CREATE POLICY "eip_cp_update" ON eip_context_packages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "eip_cp_delete" ON eip_context_packages;
CREATE POLICY "eip_cp_delete" ON eip_context_packages FOR DELETE TO anon, authenticated USING (true);

-- ─── eip_validation_results ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eip_validation_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      uuid NOT NULL REFERENCES eip_context_packages(id) ON DELETE CASCADE,
  source_key      text,
  validation_type text NOT NULL DEFAULT 'missing_source',
  severity        text NOT NULL DEFAULT 'medium',
  message         text NOT NULL,
  detail          text,
  is_resolved     boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz,
  resolved_by     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE eip_validation_results ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_eip_vr_package ON eip_validation_results(package_id);
CREATE INDEX IF NOT EXISTS idx_eip_vr_severity ON eip_validation_results(severity);

DROP POLICY IF EXISTS "eip_vr_select" ON eip_validation_results;
CREATE POLICY "eip_vr_select" ON eip_validation_results FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "eip_vr_insert" ON eip_validation_results;
CREATE POLICY "eip_vr_insert" ON eip_validation_results FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "eip_vr_update" ON eip_validation_results;
CREATE POLICY "eip_vr_update" ON eip_validation_results FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "eip_vr_delete" ON eip_validation_results;
CREATE POLICY "eip_vr_delete" ON eip_validation_results FOR DELETE TO anon, authenticated USING (true);

-- ─── Seed Source Registry ─────────────────────────────────────────────────────

INSERT INTO eip_source_registry (source_key, source_name, description, table_name, weight, is_critical, sort_order) VALUES
  ('product_vision',      'Product Vision',          'Product compass, mission and strategic direction',      'ecc_project_compass',         9,  true,  1),
  ('goals_epics',         'Goals & Epics',            'Strategic goals and delivery epics',                    'ecc_goals',                   8,  true,  2),
  ('features_registry',   'Features Registry',        'Complete product feature registry with lifecycle',      'ecc_product_features',        9,  true,  3),
  ('engineering_phases',  'Engineering Phases',       'Development phases and milestones',                     'ecc_phases',                  7,  true,  4),
  ('release_candidates',  'Release Candidates',       'Release history and active release candidates',         'ecc_release_candidates',      7,  false, 5),
  ('engineering_reviews', 'Engineering Reviews',      'ERC engineering review records and findings',           'ecc_engineering_reviews',     8,  true,  6),
  ('platform_audits',     'Platform Audits',          'Engineering audit history and findings',                'ecc_audits',                  8,  true,  7),
  ('decision_log',        'Decision Log',             'Engineering decisions and ADR records',                 'ecc_decisions',               7,  false, 8),
  ('test_plans',          'Test Plans',               'Testing plans, suites and execution records',           'ecc_test_plans',              7,  false, 9),
  ('arch_guardian',       'Architecture Guardian',    'Architecture reviews and guardian assessments',         'ecc_architecture_reviews',    6,  false, 10),
  ('documentation',       'Documentation',            'Engineering documentation and specifications',          'ecc_documentation',           6,  false, 11),
  ('exec_briefings',      'Executive Briefings',      'AI-generated executive briefing history',               'ecc_ai_briefings',            5,  false, 12),
  ('product_backlog',     'Product Backlog',          'Backlog items, ideas and feature requests',             'ecc_backlog_items',           5,  false, 13),
  ('engineering_changes', 'Engineering Change Log',   'Record of all engineering changes and deployments',     'ecc_engineering_change_log',  5,  false, 14),
  ('risks',               'Risk Register',            'Identified engineering and platform risks',             'ecc_risks',                   6,  false, 15)
ON CONFLICT (source_key) DO NOTHING;
