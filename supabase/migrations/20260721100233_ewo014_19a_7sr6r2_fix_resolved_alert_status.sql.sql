/*
# EWO-014.19A.7SR.6R.2 — Fix Existing Resolved Alerts

1. Purpose
   - Updates existing engineering_integrity_alerts rows where
     resolution_status is 'resolved' or 'archived' but status is still 'open'.
   - Sets status to 'resolved' so they are excluded from active alert lists.
   - This is a one-time data fix for alerts resolved before the lifecycle-aware
     filter was implemented.

2. Tables modified
   - engineering_integrity_alerts: UPDATE status='resolved' WHERE
     resolution_status IN ('resolved','archived') AND status='open'.

3. Security
   - No RLS changes. No new tables.

4. Idempotency
   - The WHERE clause ensures only mismatched rows are updated.
   - Re-running is safe (no rows match on second run).
*/

UPDATE engineering_integrity_alerts
SET status = 'resolved', updated_at = now()
WHERE resolution_status IN ('resolved', 'archived')
  AND status = 'open';
