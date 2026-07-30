/*
# Engineering Audit Phase X — Enhanced Governance Schema

## Overview
Enhances the engineering audit system to support executive governance capabilities by
separating audit creation methods from audit domains, enabling historical comparison,
adding executive KPI tracking, lifecycle history logging, and full artefact traceability.

## Changes to ecc_audits

1. NEW COLUMN `creation_method` (text, default 'manual')
   Captures HOW the audit was created, separate from what domain it covers.
   Values: ai_generated | manual | imported | historical
   Backfilled from the existing audit_type column (which held creation-method-style values).

2. UPDATED `audit_type` semantic
   Previously held creation-method values (ai_generated, manual, historical).
   Now represents the DOMAIN being audited.
   Values: ai_platform | engineering | architecture | performance | security |
           compliance | release_readiness | cost_efficiency | accessibility | other
   AUD-001 → ai_platform (platform baseline).
   AUD-002 → engineering (engineering OS baseline).

3. NEW COLUMN `executive_kpis` (jsonb)
   Structured executive KPI scores: engineering_health, architecture_health,
   testing_health, compliance_health, documentation_health, release_readiness,
   ai_platform_health, performance_health, operational_health.

4. NEW COLUMN `lifecycle_history` (jsonb array, default [])
   Immutable log of all lifecycle status transitions.
   Each entry: { from, to, at, by, notes }.

5. NEW COLUMN `previous_audit_id` (uuid FK → ecc_audits)
   Links to the previous audit of the same domain type for comparison.
   Set automatically by the application when creating new audits.

## New Tables

### ecc_audit_artefact_links
Links audits to engineering artefacts for full traceability.
- id             (uuid PK)
- audit_id       (uuid FK → ecc_audits, CASCADE DELETE)
- artefact_type  (text) — feature, epic, test_plan, release, guardian_finding, adr, spec, investment_review, other
- artefact_id    (text) — optional DB row ID of the linked record
- artefact_ref   (text) — human-readable ref (e.g. F-001, TP-001, RC-003)
- artefact_title (text NOT NULL) — display name
- notes          (text) — context for the link
- linked_at      (timestamptz)
- linked_by      (text)

## Security
- ecc_audit_artefact_links: RLS enabled, anon + authenticated CRUD (single-tenant ECC pattern).

## Indexes
- idx_ecc_audits_creation_method
- idx_ecc_audits_audit_type_domain
- idx_ecc_audits_previous_audit_id
- idx_audit_artefact_links_audit_id

## Notes
1. All operations are idempotent — safe to re-run.
2. Backfill of creation_method only updates rows where creation_method is still the default 'manual'.
3. audit_type update for remaining legacy values defaults to 'ai_platform'.
4. previous_audit_id is NULL for all existing records; the application sets this going forward.
*/

-- 1. Add creation_method column
ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS creation_method text NOT NULL DEFAULT 'manual';

-- 2. Backfill creation_method from current audit_type (which held creation-method-style values)
DO $$
BEGIN
  UPDATE ecc_audits SET creation_method =
    CASE audit_type
      WHEN 'ai_generated' THEN 'ai_generated'
      WHEN 'historical'   THEN 'historical'
      WHEN 'imported'     THEN 'imported'
      ELSE 'manual'
    END
  WHERE creation_method = 'manual';
END $$;

-- 3. Update audit_type to domain for known records
UPDATE ecc_audits SET audit_type = 'ai_platform'  WHERE audit_number = 'AUD-001';
UPDATE ecc_audits SET audit_type = 'engineering'  WHERE audit_number = 'AUD-002';

-- 4. Any remaining rows with old creation-method-style audit_type values → ai_platform
UPDATE ecc_audits SET audit_type = 'ai_platform'
  WHERE audit_type IN ('ai_generated', 'manual', 'historical', 'imported');

-- 5. Add executive_kpis column
ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS executive_kpis jsonb;

-- 6. Add lifecycle_history column
ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS lifecycle_history jsonb DEFAULT '[]'::jsonb;

-- 7. Add previous_audit_id FK
ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS previous_audit_id uuid REFERENCES ecc_audits(id);

-- 8. Create ecc_audit_artefact_links table
CREATE TABLE IF NOT EXISTS ecc_audit_artefact_links (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id       uuid        NOT NULL REFERENCES ecc_audits(id) ON DELETE CASCADE,
  artefact_type  text        NOT NULL DEFAULT 'other',
  artefact_id    text,
  artefact_ref   text,
  artefact_title text        NOT NULL,
  notes          text,
  linked_at      timestamptz DEFAULT now(),
  linked_by      text
);

ALTER TABLE ecc_audit_artefact_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_audit_artefact_links" ON ecc_audit_artefact_links;
CREATE POLICY "anon_select_audit_artefact_links" ON ecc_audit_artefact_links
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_audit_artefact_links" ON ecc_audit_artefact_links;
CREATE POLICY "anon_insert_audit_artefact_links" ON ecc_audit_artefact_links
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_audit_artefact_links" ON ecc_audit_artefact_links;
CREATE POLICY "anon_update_audit_artefact_links" ON ecc_audit_artefact_links
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_audit_artefact_links" ON ecc_audit_artefact_links;
CREATE POLICY "anon_delete_audit_artefact_links" ON ecc_audit_artefact_links
  FOR DELETE TO anon, authenticated USING (true);

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_ecc_audits_creation_method    ON ecc_audits(creation_method);
CREATE INDEX IF NOT EXISTS idx_ecc_audits_audit_type_domain  ON ecc_audits(audit_type);
CREATE INDEX IF NOT EXISTS idx_ecc_audits_previous_audit_id  ON ecc_audits(previous_audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_artefact_links_audit_id ON ecc_audit_artefact_links(audit_id);
