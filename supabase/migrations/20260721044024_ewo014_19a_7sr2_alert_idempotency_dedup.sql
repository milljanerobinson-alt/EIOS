/*
# Engineering Integrity Alert Idempotency & Deduplication Schema

## Purpose
Adds columns to engineering_integrity_alerts to support:
1. Alert idempotency — updating existing alerts instead of creating duplicates
2. Governed deduplication — marking superseded duplicate alerts
3. Automatic resolution — tracking when alerts were first/last detected

## Modified Tables

### engineering_integrity_alerts (modified)
Added columns:
- occurrence_count (integer, default 1) — how many times this issue has been detected
- first_detected (timestamptz, default now()) — when the issue was first detected
- last_detected (timestamptz) — when the issue was most recently detected
- superseded_by_alert_id (uuid) — references the canonical alert that supersedes this one

## Security
No security changes — existing RLS policies remain in effect.

## Indexes
- idx_alerts_superseded_by on superseded_by_alert_id (for finding superseded alerts)
- idx_alerts_status_type_normref on (status, alert_type, normalised_reference) (for idempotency lookups)

## Important Notes
1. occurrence_count defaults to 1 for all existing alerts
2. first_detected defaults to created_at for existing alerts via the existing created_at value
3. superseded_by_alert_id is nullable — only set when an alert is superseded during deduplication
4. The composite index enables fast idempotency lookups during reconciliation
*/

-- ─── 1. Add idempotency and deduplication columns ────────────────────────────
ALTER TABLE engineering_integrity_alerts
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_detected timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_detected timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_alert_id uuid;

-- ─── 2. Backfill first_detected from created_at for existing alerts ──────────
UPDATE engineering_integrity_alerts
SET first_detected = created_at
WHERE first_detected IS NULL OR first_detected = now();

-- ─── 3. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_alerts_superseded_by ON engineering_integrity_alerts(superseded_by_alert_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status_type_normref ON engineering_integrity_alerts(status, alert_type, normalised_reference);
