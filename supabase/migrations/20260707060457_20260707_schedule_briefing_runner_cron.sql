/*
# Schedule Briefing Runner via pg_cron

## Purpose
Sets up an hourly pg_cron job that calls the scheduled-briefing-runner edge function.
The runner itself reads the schedule config and only generates a briefing when:
- The schedule is enabled
- Today is an allowed day (weekdays only, or custom day list)
- The current time is within ±30 minutes of the configured time_of_day
- A briefing hasn't already been generated for today

## Changes
- Adds invoke_scheduled_briefings() helper function (uses same cron secret pattern as other queue jobs)
- Schedules 'run-scheduled-briefings' cron job to run at the top of every hour

## Notes
1. The cron job runs hourly; the edge function handles the ±30 minute window check.
2. For a default 8:00 AM Sydney schedule, the job will trigger at 08:00 UTC+11 (which maps to
   approximately 21:00 UTC the prior day), so the hourly cadence catches it correctly.
3. The function name follows the same pattern as invoke_queue_processor used elsewhere.
*/

-- Helper function: invoke the scheduled briefing runner
CREATE OR REPLACE FUNCTION public.invoke_scheduled_briefings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret text;
  v_url    text;
BEGIN
  SELECT value #>> '{}' INTO v_secret FROM settings WHERE key = 'cron_secret';
  v_url := (SELECT value #>> '{}' FROM settings WHERE key = 'supabase_url')
    || '/functions/v1/scheduled-briefing-runner';

  -- Fall back to hardcoded project URL if not in settings
  IF v_url IS NULL OR v_url LIKE '/functions/%' THEN
    v_url := 'https://clrsckerimjturebulbk.supabase.co/functions/v1/scheduled-briefing-runner';
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'X-Cron-Secret',  v_secret,
      'Authorization',  'Bearer ' || v_secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Unschedule any existing job with this name before re-creating
SELECT cron.unschedule('run-scheduled-briefings') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'run-scheduled-briefings'
);

-- Schedule: run every hour at :00 (edge function handles time-window check)
SELECT cron.schedule(
  'run-scheduled-briefings',
  '0 * * * *',
  $$ SELECT public.invoke_scheduled_briefings(); $$
);
