-- Runs the offline check once a minute using Supabase Cron (the pg_cron extension).
-- If this migration fails, enable Cron by hand (dashboard -> Integrations -> Cron),
-- then run `npx supabase db push --remote` again.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('electrack-offline-check', '* * * * *', $$select public.mark_offline_plugs()$$);
