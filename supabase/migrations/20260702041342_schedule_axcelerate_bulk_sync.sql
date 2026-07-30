-- Schedule axcelerate bulk sync every hour at :15
-- Looks back 2 hours for recently modified contacts with quiz custom fields set to Yes
SELECT cron.schedule(
  'sweep-axcelerate-bulk-sync',
  '15 * * * *',
  $$ SELECT public.invoke_queue_processor('axcelerate-bulk-sync'); $$
);
