-- EWO-014.19A.7SR.6 — Resolution lifecycle and evolved alert titles
--
-- Adds resolution_status and evolved_title to integrity alerts to support
-- the governed resolution lifecycle and alert title evolution.

ALTER TABLE engineering_integrity_alerts
  ADD COLUMN IF NOT EXISTS resolution_status text DEFAULT 'detected';
ALTER TABLE engineering_integrity_alerts
  ADD COLUMN IF NOT EXISTS evolved_title text;

-- Backfill existing open alerts to 'detected', resolved alerts to 'resolved'
UPDATE engineering_integrity_alerts SET resolution_status = 'resolved'
  WHERE resolved_at IS NOT NULL AND resolution_status = 'detected';
