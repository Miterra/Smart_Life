-- =====================================================================
--  Stockage sécurisé des clés VAPID + RPC d'exposition au service_role
--  (le schéma `private` n'est pas exposé par PostgREST)
-- =====================================================================
create schema if not exists private;

create table if not exists private.app_secrets (
  key   text primary key,
  value text not null
);

alter table private.app_secrets enable row level security;

create or replace function public.get_vapid_config()
returns table (key text, value text)
language sql
security definer
set search_path = ''
as $$
  select key, value
  from private.app_secrets
  where key in ('vapid_public', 'vapid_private', 'vapid_subject');
$$;

revoke all on function public.get_vapid_config() from public;
revoke all on function public.get_vapid_config() from anon;
revoke all on function public.get_vapid_config() from authenticated;
grant execute on function public.get_vapid_config() to service_role;

-- Les valeurs VAPID doivent être insérées manuellement (jamais commit) :
-- insert into private.app_secrets (key, value) values
--   ('vapid_public',  '<clé publique base64url>'),
--   ('vapid_private', '<clé privée base64url>'),
--   ('vapid_subject', 'mailto:tu@example.com');
