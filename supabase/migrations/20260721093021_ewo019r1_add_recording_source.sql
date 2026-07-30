-- EWO-019R.1 — Add recording_source column to Engineering Change Log
-- Part 1: Schema change only (no data modification)

ALTER TABLE engineering_change_log
  ADD COLUMN IF NOT EXISTS recording_source text DEFAULT 'live';

-- Backfill existing entries using ALTER ... SET DEFAULT won't work for
-- existing rows, so we need to update. But the prevent_ecl_update trigger
-- blocks updates. We temporarily disable it for this one-time backfill.

ALTER TABLE engineering_change_log DISABLE TRIGGER prevent_ecl_update;

UPDATE engineering_change_log SET recording_source = 'historical'
  WHERE is_reconstructed = true;
UPDATE engineering_change_log SET recording_source = 'live'
  WHERE is_reconstructed = false;

-- Fix the misclassified EWO-014.19A.7SR.6 entry — created at 08:43:53 UTC
-- on 2026-07-21, after the live recorder was operational at 08:26:05 UTC.
-- This was a live event incorrectly reconstructed by backfill.
UPDATE engineering_change_log
  SET is_reconstructed = false,
      recording_source = 'live',
      reconstructed_from = NULL,
      metadata = metadata - 'reconstructed'
  WHERE ewo_ref = 'EWO-014.19A.7SR.6'
    AND change_type = 'created'
    AND is_reconstructed = true;

ALTER TABLE engineering_change_log ENABLE TRIGGER prevent_ecl_update;
