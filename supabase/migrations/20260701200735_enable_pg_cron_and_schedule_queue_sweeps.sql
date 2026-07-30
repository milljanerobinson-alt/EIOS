-- Enable pg_net for async HTTP calls from within Postgres
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable pg_cron for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant cron usage to postgres role (required by pg_cron)
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule: process email queue every hour at :05
SELECT cron.schedule(
  'sweep-email-queue',
  '5 * * * *',
  $$
  SELECT extensions.http_post(
    current_setting('app.supabase_url') || '/functions/v1/process-email-queue',
    '{}',
    'application/json',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
      extensions.http_header('Apikey', current_setting('app.service_role_key'))
    ]
  );
  $$
);

-- Schedule: process axcelerate write-back queue every hour at :10
SELECT cron.schedule(
  'sweep-axcelerate-queue',
  '10 * * * *',
  $$
  SELECT extensions.http_post(
    current_setting('app.supabase_url') || '/functions/v1/process-axcelerate-queue',
    '{}',
    'application/json',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
      extensions.http_header('Apikey', current_setting('app.service_role_key'))
    ]
  );
  $$
);
