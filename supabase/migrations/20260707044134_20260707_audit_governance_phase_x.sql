/*
# Audit Governance Phase X — Governance Events + Enhanced Metadata

## Summary
Extends the Engineering Audit module with a permanent governance events log and additional
metadata columns to support automated governance tracking, lifecycle traceability, and the
Reference Audit Register.

## Changes

### New columns on `ecc_audits`
- `approval_date` (timestamptz) — ISO timestamp when the audit was formally approved
- `approval_notes` (text) — notes recorded at the time of approval
- `governance_notes` (text) — general governance notes maintained throughout the audit lifecycle
- `governance_version` (text) — governance framework version tag (e.g. "Engineering Governance v1.0")
- `reference_superseded_by` (uuid FK → ecc_audits) — if this was a Reference Audit, records which audit later superseded it
- `review_frequency` (text) — how often this reference audit should be reviewed ('every_release', 'quarterly', 'biannual', 'annual')

### New table `ecc_audit_governance_events`
Permanent, append-only governance event log for every audit. Each row records one
discrete governance action — creation, generation, review submission, approval, reference
designation, closure, etc. This table is the authoritative governance history and must
never be deleted or overwritten.

Columns:
- `id` (uuid, PK)
- `audit_id` (uuid, FK → ecc_audits, CASCADE DELETE)
- `event_type` (text) — machine-readable event code (e.g. 'audit_created', 'approved', 'reference_designated')
- `event_timestamp` (timestamptz) — when the event occurred
- `performed_by` (text) — name/identity of the person who performed the action
- `notes` (text) — human-readable description of the event
- `metadata` (jsonb) — structured additional data (previous reference, version, score, etc.)
- `created_at` (timestamptz) — row insertion time (same as event_timestamp for most events)

### Security
- RLS enabled on `ecc_audit_governance_events`
- anon + authenticated policies for full CRUD (single-tenant ECC environment — no user isolation)
*/

-- ─── New columns on ecc_audits ────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_audits' AND column_name = 'approval_date'
  ) THEN
    ALTER TABLE ecc_audits ADD COLUMN approval_date timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_audits' AND column_name = 'approval_notes'
  ) THEN
    ALTER TABLE ecc_audits ADD COLUMN approval_notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_audits' AND column_name = 'governance_notes'
  ) THEN
    ALTER TABLE ecc_audits ADD COLUMN governance_notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_audits' AND column_name = 'governance_version'
  ) THEN
    ALTER TABLE ecc_audits ADD COLUMN governance_version text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_audits' AND column_name = 'reference_superseded_by'
  ) THEN
    ALTER TABLE ecc_audits ADD COLUMN reference_superseded_by uuid REFERENCES ecc_audits(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_audits' AND column_name = 'review_frequency'
  ) THEN
    ALTER TABLE ecc_audits ADD COLUMN review_frequency text;
  END IF;
END $$;

-- ─── Governance Events table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_audit_governance_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id        uuid        NOT NULL REFERENCES ecc_audits(id) ON DELETE CASCADE,
  event_type      text        NOT NULL,
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  performed_by    text,
  notes           text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_gov_events_audit_id  ON ecc_audit_governance_events(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_gov_events_timestamp ON ecc_audit_governance_events(event_timestamp DESC);

ALTER TABLE ecc_audit_governance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_gov_events" ON ecc_audit_governance_events;
CREATE POLICY "anon_select_gov_events" ON ecc_audit_governance_events
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_gov_events" ON ecc_audit_governance_events;
CREATE POLICY "anon_insert_gov_events" ON ecc_audit_governance_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_gov_events" ON ecc_audit_governance_events;
CREATE POLICY "anon_update_gov_events" ON ecc_audit_governance_events
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_gov_events" ON ecc_audit_governance_events;
CREATE POLICY "anon_delete_gov_events" ON ecc_audit_governance_events
  FOR DELETE TO anon, authenticated USING (true);
