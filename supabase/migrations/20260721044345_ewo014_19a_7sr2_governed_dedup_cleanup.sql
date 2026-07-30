/*
# Governed Historical Alert Deduplication & Stale Alert Resolution

## Purpose
One-time governed cleanup of existing Engineering Integrity alerts:
1. Normalises trailing-dot references (e.g. EWO-014.19A.7. → EWO-014.19A.7)
2. Auto-resolves stale missing_ewo alerts where the EWO now exists
3. Deduplicates remaining duplicate open alerts (retains oldest, supersedes rest)

## Data Safety
- No alerts are deleted — duplicates are marked 'superseded' with superseded_by_alert_id
- All resolution actions are auditable via resolution_notes and resolved_by fields
- First detected timestamps are preserved on canonical alerts

## Important Notes
1. This is a one-time governed cleanup — future reconciliation is idempotent
2. The canonical (oldest) alert in each duplicate group is retained
3. Superseded alerts remain permanently auditable
*/

-- ─── 1. Normalise trailing-dot references in existing alerts ────────────────
-- Strip trailing dots from normalised_reference and raw_reference
UPDATE engineering_integrity_alerts
SET normalised_reference = btrim(normalised_reference, '.')
WHERE normalised_reference IS NOT NULL AND normalised_reference != btrim(normalised_reference, '.');

UPDATE engineering_integrity_alerts
SET raw_reference = btrim(raw_reference, '.')
WHERE raw_reference IS NOT NULL AND raw_reference != btrim(raw_reference, '.');

-- ─── 2. Auto-resolve stale missing_ewo alerts where the EWO now exists ──────
UPDATE engineering_integrity_alerts a
SET status = 'resolved',
    resolved_at = now(),
    resolved_by = 'governed_deduplication',
    resolution_notes = 'Canonical Engineering Work Order now exists in the ledger. Alert automatically resolved during governed deduplication.',
    re_evaluation_status = 'auto_resolved',
    last_detected = now(),
    updated_at = now()
WHERE a.alert_type = 'missing_ewo'
  AND a.status = 'open'
  AND EXISTS (
    SELECT 1 FROM engineering_work_orders e
    WHERE e.ewo_ref = a.normalised_reference
  );

-- ─── 3. Deduplicate remaining open alerts ──────────────────────────────────
-- For each (alert_type, normalised_reference) group with >1 open alert,
-- retain the oldest and mark the rest as superseded.
-- We do this with a CTE that identifies duplicates.

DO $$
DECLARE
  dup_record RECORD;
  canonical_id uuid;
BEGIN
  FOR dup_record IN
    SELECT
      alert_type,
      normalised_reference,
      (
        SELECT id FROM engineering_integrity_alerts
        WHERE alert_type = d.alert_type
          AND normalised_reference = d.normalised_reference
          AND status = 'open'
          AND superseded_by_alert_id IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      ) as canonical_id,
      (
        SELECT count(*) FROM engineering_integrity_alerts
        WHERE alert_type = d.alert_type
          AND normalised_reference = d.normalised_reference
          AND status = 'open'
          AND superseded_by_alert_id IS NULL
      ) as dup_count
    FROM (
      SELECT DISTINCT alert_type, normalised_reference
      FROM engineering_integrity_alerts
      WHERE status = 'open' AND superseded_by_alert_id IS NULL
    ) d
  LOOP
    IF dup_record.dup_count > 1 AND dup_record.canonical_id IS NOT NULL THEN
      -- Merge metadata into canonical: highest confidence, earliest first_detected, sum occurrences
      UPDATE engineering_integrity_alerts
      SET confidence = (
        SELECT max(confidence) FROM engineering_integrity_alerts
        WHERE alert_type = dup_record.alert_type AND normalised_reference = dup_record.normalised_reference
          AND status = 'open' AND superseded_by_alert_id IS NULL
      ),
      first_detected = (
        SELECT min(coalesce(first_detected, created_at)) FROM engineering_integrity_alerts
        WHERE alert_type = dup_record.alert_type AND normalised_reference = dup_record.normalised_reference
          AND status = 'open' AND superseded_by_alert_id IS NULL
      ),
      occurrence_count = (
        SELECT coalesce(sum(occurrence_count), 1) FROM engineering_integrity_alerts
        WHERE alert_type = dup_record.alert_type AND normalised_reference = dup_record.normalised_reference
          AND status = 'open' AND superseded_by_alert_id IS NULL
      ),
      last_detected = now(),
      updated_at = now()
      WHERE id = dup_record.canonical_id;

      -- Mark duplicates as superseded
      UPDATE engineering_integrity_alerts
      SET superseded_by_alert_id = dup_record.canonical_id,
          status = 'superseded',
          resolved_at = now(),
          resolved_by = 'governed_deduplication',
          resolution_notes = 'Superseded by canonical alert ' || dup_record.canonical_id::text || ' during governed deduplication.',
          updated_at = now()
      WHERE alert_type = dup_record.alert_type
        AND normalised_reference = dup_record.normalised_reference
        AND status = 'open'
        AND superseded_by_alert_id IS NULL
        AND id != dup_record.canonical_id;
    END IF;
  END LOOP;
END $$;
