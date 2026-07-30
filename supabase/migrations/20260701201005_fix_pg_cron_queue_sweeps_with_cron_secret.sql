-- Drop the previously scheduled jobs that used incorrect http API
SELECT cron.unschedule('sweep-email-queue');
SELECT cron.unschedule('sweep-axcelerate-queue');

-- Store a random cron secret in settings (used by pg_cron to authenticate edge function calls)
INSERT INTO settings (key, value)
VALUES ('cron_secret', to_jsonb(encode(extensions.gen_random_bytes(32), 'hex')))
ON CONFLICT (key) DO NOTHING;

-- Helper function: call an edge function using cron secret auth
CREATE OR REPLACE FUNCTION public.invoke_queue_processor(fn_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret text;
  v_url    text;
BEGIN
  SELECT value #>> '{}' INTO v_secret FROM settings WHERE key = 'cron_secret';
  v_url := 'https://clrsckerimjturebulbk.supabase.co/functions/v1/' || fn_slug;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret,
      'X-Cron-Secret', v_secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Schedule hourly email queue sweep (at :05)
SELECT cron.schedule(
  'sweep-email-queue',
  '5 * * * *',
  $$ SELECT public.invoke_queue_processor('process-email-queue'); $$
);

-- Schedule hourly axcelerate queue sweep (at :10)
SELECT cron.schedule(
  'sweep-axcelerate-queue',
  '10 * * * *',
  $$ SELECT public.invoke_queue_processor('process-axcelerate-queue'); $$
);
