-- BL-02 + BL-03: Queue retry backoff columns + stuck-item cron recovery

-- BL-03: Add next_attempt_at columns to both queue tables.
-- NULL means "ready immediately" (all existing rows keep working with no change).
ALTER TABLE axcelerate_writeback_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

ALTER TABLE email_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- BL-02: Add stuck-item reset statements to the existing cron sweep.
-- Items that have been in a transient "in-flight" status for more than 3 minutes
-- are assumed to have belonged to a crashed worker and are reset to pending.
--
-- This extends the existing invoke_queue_processor cron approach by creating
-- a dedicated Postgres function that runs the resets directly in SQL
-- (no HTTP call needed — pure DB operation, more reliable than an edge function).

CREATE OR REPLACE FUNCTION public.reset_stale_queue_items()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE axcelerate_writeback_queue
  SET
    status        = 'pending',
    last_error    = 'Reset from stale processing state',
    next_attempt_at = NULL
  WHERE status = 'processing'
    AND last_attempted_at < now() - interval '3 minutes';

  UPDATE email_queue
  SET
    status        = 'pending',
    last_error    = 'Reset from stale sending state',
    next_attempt_at = NULL
  WHERE status = 'sending'
    AND last_attempted_at < now() - interval '3 minutes';
$$;

-- Schedule the stuck-item reset to run every minute alongside the queue sweeps.
-- Unschedule first to avoid duplicate if migration is re-applied.
SELECT cron.unschedule('reset-stale-queue-items') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reset-stale-queue-items'
);

SELECT cron.schedule(
  'reset-stale-queue-items',
  '* * * * *',
  $$ SELECT public.reset_stale_queue_items(); $$
);
