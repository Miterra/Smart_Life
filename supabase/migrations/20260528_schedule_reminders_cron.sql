-- =====================================================================
--  Planifie l'appel à l'Edge Function send-reminders toutes les minutes
--  via pg_cron + pg_net.
--
--  Avant d'exécuter : remplace <PROJECT-REF> par ton ref Supabase
--  (visible dans l'URL https://app.supabase.com/project/<PROJECT-REF>).
-- =====================================================================
select cron.schedule(
  'smartlife-send-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);
