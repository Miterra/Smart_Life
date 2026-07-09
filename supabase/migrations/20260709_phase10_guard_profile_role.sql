-- ============================================================
--  Phase 10 — Verrou d'escalade de privilège sur le rôle
--
--  Faille : la policy RLS "profiles update admin" (initial_schema)
--  a un WITH CHECK qui ne vérifie QUE is_admin_or_owner() — aucune
--  contrainte sur la colonne `role`. Un admin pouvait donc, via un
--  simple UPDATE PostgREST direct (hors UI) :
--    - rétrograder le owner (role='user') — non couvert par le trigger
--      existant prevent_owner_promotion (qui ne bloque que la promotion
--      VERS owner tant qu'un owner existe),
--    - puis se promouvoir owner (plus aucun owner présent),
--    - ou modifier le rôle de n'importe qui, alors que seul le owner
--      doit pouvoir changer les rôles (cf. roles.js canChangeRole).
--
--  Correctif : un trigger BEFORE UPDATE qui gèle `role` et `id` pour
--  tout appelant qui n'est ni le OWNER, ni le service_role (les edge
--  functions admin légitimes, ex. admin-create-user). Nommé "guard_"
--  pour s'exécuter AVANT "prevent_owner_promotion" (ordre alphabétique).
--  Les éditions légitimes (full_name, push_enabled, avatar_url) restent
--  autorisées ; le owner change les rôles normalement.
-- ============================================================

create or replace function public.guard_profiles_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_jwt_role text := null;
begin
  if v_claims is not null and v_claims <> '' then
    begin
      v_jwt_role := (v_claims::jsonb ->> 'role');
    exception when others then
      v_jwt_role := null;
    end;
  end if;
  -- Seuls le OWNER et le service_role peuvent modifier le rôle (ou l'id).
  if v_jwt_role is distinct from 'service_role' and public.my_role() is distinct from 'owner' then
    new.role := old.role;
    new.id := old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profiles_role_trg on public.profiles;
create trigger guard_profiles_role_trg
  before update on public.profiles
  for each row execute function public.guard_profiles_role();
