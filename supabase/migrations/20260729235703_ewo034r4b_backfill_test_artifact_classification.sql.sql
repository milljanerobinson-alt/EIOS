/*
# Backfill test-artifact classification for disposable test EWOs

## Purpose
EWO-034R.4B Workstream 3 requires that all canonically-identified test records
appear exclusively in the dedicated Test tab. Two records — EWO-032R8-TEST-IDEMPOTENT
and EWO-032R8-TEST-LIFECYCLE — are clearly test-only (their ewo_ref and title both
contain "TEST") but were never marked `is_test_artifact = true`. This migration
backfills the canonical flag so the dashboard segregation logic can identify them.

## Changes
- UPDATE engineering_work_orders SET is_test_artifact = true, test_artifact_marked_at,
  test_artifact_marked_by, test_artifact_reason for two records whose ewo_ref
  starts with 'EWO-032R8-TEST-'.

## Security
- No schema changes; no RLS policy changes.
- The update is scoped to a specific ewo_ref prefix — no risk to production EWOs.
- Idempotent: re-running will not flip already-true flags or affect other rows.

## Notes
1. The `is_test_artifact` column already exists (added by an earlier migration).
2. No new columns, tables, or policies are created.
3. This is purely a data backfill for records confidently identifiable as tests.
*/

UPDATE engineering_work_orders
SET
  is_test_artifact = true,
  test_artifact_marked_at = COALESCE(test_artifact_marked_at, now()),
  test_artifact_marked_by = COALESCE(test_artifact_marked_by, 'EWO-034R.4B Backfill'),
  test_artifact_reason = COALESCE(test_artifact_reason, 'Backfilled: ewo_ref and title identify this as a disposable test record')
WHERE ewo_ref LIKE 'EWO-032R8-TEST-%'
  AND (is_test_artifact IS FALSE OR is_test_artifact IS NULL);
