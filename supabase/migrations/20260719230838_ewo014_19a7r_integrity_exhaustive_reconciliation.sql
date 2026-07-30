/*
# EWO-014.19A.7R — Engineering Integrity Exhaustive Reconciliation & Truthful Scoring

## Purpose

Corrects the integrity audit engine so that:
- Historical reconciliation is exhaustive across every authoritative source.
- Audits are repeatable and idempotent.
- The integrity score is always truthful — 100% is only possible when ALL
  required sources scanned successfully, reconciliation reached a stable
  state, and zero unresolved issues remain.
- The platform never reports 100% from a partial scan.

## Changes to engineering_integrity_audits

New columns:
- `audit_phase` (text) — 'historical_reconciliation' | 'validation' | 'partial' | 'failed'
- `reconciliation_passes` (integer, default 0) — number of passes executed
- `stable_result` (boolean, default false) — whether reconciliation reached stability
- `score_eligible` (boolean, default false) — whether the score is eligible to be 100%
- `source_completion_envelope` (jsonb) — machine-produced per-source completion data
- `all_sources_attempted` (boolean, default false)
- `all_required_sources_succeeded` (boolean, default false)
- `unresolved_issue_count` (integer, default 0)
- `current_run_repairs` (integer, default 0) — repairs in THIS run (not cumulative)
- `cumulative_historical_repairs` (integer, default 0) — total repairs across all runs
- `baseline_established` (boolean, default false) — whether a stable baseline exists

## Changes to engineering_integrity_alerts

New columns:
- `object_type` (text) — inferred canonical object type: ewo | bug | batch | constitutional | dev_seed | test_fixture | superseded | unknown
- `raw_reference` (text) — the raw reference as discovered
- `normalised_reference` (text) — normalised form
- `confidence` (real) — 0.0 to 1.0 confidence in the classification
- `classification_reason` (text) — why this classification was chosen
- `original_audit_id` (uuid) — preserved from original audit for re-evaluation tracking
- `re_evaluation_status` (text) — 'pending' | 're-evaluated' | 'auto_resolved' | 'confirmed'

## New table: integrity_reference_classifications

Records the classification of every discovered reference for audit transparency.
- `id` (uuid PK)
- `audit_id` (uuid, FK → engineering_integrity_audits)
- `raw_reference` (text)
- `normalised_reference` (text)
- `inferred_object_type` (text)
- `source` (text)
- `confidence` (real)
- `evidence` (jsonb)
- `eligible_for_auto_repair` (boolean)
- `reason` (text)
- `created_at` (timestamptz)

## Security

- RLS enabled on new table.
- All authenticated users have full CRUD (internal ECC governance tool).

## Important Notes

1. All changes are additive — no existing data is modified or lost.
2. The original 25 alerts are preserved with their original_audit_id intact.
3. The original audit (EIA-001) is preserved but marked as 'partial' phase.
4. New columns are nullable/defaulted so existing rows are unaffected.
*/

-- ─── Add columns to engineering_integrity_audits ──────────────────────────────

ALTER TABLE engineering_integrity_audits
  ADD COLUMN IF NOT EXISTS audit_phase text DEFAULT 'validation',
  ADD COLUMN IF NOT EXISTS reconciliation_passes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stable_result boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS score_eligible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_completion_envelope jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS all_sources_attempted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS all_required_sources_succeeded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS unresolved_issue_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_run_repairs integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cumulative_historical_repairs integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baseline_established boolean DEFAULT false;

-- Mark the original audit as partial (it was a manual insert, not an exhaustive scan)
UPDATE engineering_integrity_audits
SET audit_phase = 'partial',
    score_eligible = false,
    all_sources_attempted = false,
    all_required_sources_succeeded = false,
    stable_result = false,
    baseline_established = false
WHERE audit_ref = 'EIA-001';

-- ─── Add columns to engineering_integrity_alerts ──────────────────────────────

ALTER TABLE engineering_integrity_alerts
  ADD COLUMN IF NOT EXISTS object_type text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS raw_reference text,
  ADD COLUMN IF NOT EXISTS normalised_reference text,
  ADD COLUMN IF NOT EXISTS confidence real DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS classification_reason text,
  ADD COLUMN IF NOT EXISTS original_audit_id uuid,
  ADD COLUMN IF NOT EXISTS re_evaluation_status text DEFAULT 'pending';

-- Preserve original audit origin for existing alerts
UPDATE engineering_integrity_alerts
SET original_audit_id = audit_id,
    re_evaluation_status = 'pending'
WHERE original_audit_id IS NULL;

-- ─── New table: integrity_reference_classifications ───────────────────────────

CREATE TABLE IF NOT EXISTS integrity_reference_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid REFERENCES engineering_integrity_audits(id) ON DELETE CASCADE,
  raw_reference text NOT NULL,
  normalised_reference text NOT NULL,
  inferred_object_type text NOT NULL,
  source text NOT NULL,
  confidence real DEFAULT 0.0,
  evidence jsonb DEFAULT '{}'::jsonb,
  eligible_for_auto_repair boolean DEFAULT false,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE integrity_reference_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_reference_classifications" ON integrity_reference_classifications;
CREATE POLICY "select_reference_classifications" ON integrity_reference_classifications FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_reference_classifications" ON integrity_reference_classifications;
CREATE POLICY "insert_reference_classifications" ON integrity_reference_classifications FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_reference_classifications" ON integrity_reference_classifications;
CREATE POLICY "update_reference_classifications" ON integrity_reference_classifications FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_reference_classifications" ON integrity_reference_classifications;
CREATE POLICY "delete_reference_classifications" ON integrity_reference_classifications FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_irc_audit_id ON integrity_reference_classifications(audit_id);
CREATE INDEX IF NOT EXISTS idx_irc_object_type ON integrity_reference_classifications(inferred_object_type);
