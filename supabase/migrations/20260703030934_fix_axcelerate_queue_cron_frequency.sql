-- Change axcelerate writeback queue sweep from hourly to every minute
SELECT cron.unschedule('sweep-axcelerate-queue');
SELECT cron.schedule(
  'sweep-axcelerate-queue',
  '* * * * *',
  $$ SELECT public.invoke_queue_processor('process-axcelerate-queue'); $$
);
