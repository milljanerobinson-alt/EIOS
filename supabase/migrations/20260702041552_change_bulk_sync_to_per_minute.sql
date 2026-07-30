-- Replace hourly bulk sync with every-minute sweep
SELECT cron.unschedule('sweep-axcelerate-bulk-sync');

SELECT cron.schedule(
  'sweep-axcelerate-bulk-sync',
  '* * * * *',
  $$ SELECT public.invoke_queue_processor('axcelerate-bulk-sync'); $$
);
