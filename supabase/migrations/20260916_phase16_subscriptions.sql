-- ============================================================
--  Phase 16 — Dépenses récurrentes (abonnements)
--
--  Modèle : un abonnement décrit une dépense qui revient à intervalle
--  régulier (MENSUEL / ANNUEL). Il ne stocke PAS les montants passés :
--  à chaque échéance, une vraie ligne est générée dans le grand livre
--  (public.finances), de sorte que tous les calculs existants (totaux,
--  graphiques, comparaison par catégorie, scoping admin) fonctionnent
--  sans modification.
--
--  Idempotence : finances.subscription_id + index unique
--  (subscription_id, occurred_on). Générer deux fois la même échéance
--  est donc impossible — ce qui rend sûr le double déclenchement
--  (cron quotidien + synchronisation à l'ouverture de l'onglet Finance).
--
--  Dates : on ne fait jamais « date + 1 mois » en cascade, ce qui
--  ferait dériver un abonnement du 31 vers le 28 pour toujours. On
--  repart du jour d'ancrage (jour de started_on) en le bornant au
--  dernier jour du mois cible : 31 jan → 28 fév → 31 mars.
-- ============================================================

-- ---------- Dépendances héritées de la phase 6 ----------
-- La phase 6 (scoping des finances par catégorie) a été appliquée en direct
-- sur la base live sans jamais être versionnée. On la rattrape ici en
-- « if not exists » pour que cette migration reste rejouable sur une base
-- neuve (db reset, branche preview) : sans ça, la policy admin et l'INSERT
-- plus bas échouent avec « is_my_category does not exist » / « column
-- category_id does not exist ». Sur la base live, ces deux ordres sont
-- des no-op.
alter table public.finances
  add column if not exists category_id uuid references public.categories(id) on delete set null;

create or replace function public.is_my_category(cat uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profile_categories pc
    where pc.category_id = cat and pc.user_id = auth.uid()
  );
$$;

-- ---------- Type périodicité ----------
do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'subscription_interval') then
    create type public.subscription_interval as enum ('MONTHLY', 'YEARLY');
  end if;
end $$;

-- ---------- Table ----------
create table if not exists public.subscriptions (
  id               uuid primary key default gen_random_uuid(),
  label            text not null,
  amount           numeric(12,2) not null check (amount > 0),
  billing_interval public.subscription_interval not null,
  -- Catégorie : même couple (id, nom dénormalisé) que public.finances,
  -- pour que le scoping admin et l'affichage soient identiques.
  category_id      uuid references public.categories(id) on delete set null,
  category         text,
  started_on       date not null,                 -- 1re échéance = jour d'ancrage
  next_charge_on   date not null,                 -- curseur : prochaine échéance à générer
  active           boolean not null default true, -- en pause = plus aucune génération
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint subscriptions_next_after_start check (next_charge_on >= started_on)
);

create index if not exists subscriptions_due_idx
  on public.subscriptions (next_charge_on) where active;

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------- Lien vers le grand livre + garde d'idempotence ----------
alter table public.finances
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;

-- on delete set null : supprimer un abonnement n'efface pas l'historique
-- comptable déjà enregistré, il le détache simplement.
create unique index if not exists finances_subscription_occurrence_idx
  on public.finances (subscription_id, occurred_on)
  where subscription_id is not null;

-- ---------- RLS : calquée sur public.finances ----------
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions owner all" on public.subscriptions;
create policy "subscriptions owner all" on public.subscriptions
  for all using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- L'admin voit (lecture seule) les abonnements de SES catégories,
-- exactement comme pour les opérations ponctuelles.
drop policy if exists "subscriptions admin scoped select" on public.subscriptions;
create policy "subscriptions admin scoped select" on public.subscriptions
  for select using (
    public.my_role() = 'admin'
    and category_id is not null
    and public.is_my_category(category_id)
  );

-- ---------- Calcul d'échéance (sans dérive de fin de mois) ----------
create or replace function public.add_billing_period(
  p_from       date,
  p_anchor_day int,
  p_interval   public.subscription_interval
)
returns date
language sql
immutable
set search_path = ''
as $$
  with target as (
    select (
      date_trunc('month', p_from::timestamp)
      + case when p_interval = 'YEARLY' then interval '1 year' else interval '1 month' end
    )::date as first_day
  )
  select (
    first_day
    + (least(
         p_anchor_day,
         extract(day from (first_day + interval '1 month' - interval '1 day'))::int
       ) - 1) * interval '1 day'
  )::date
  from target;
$$;

-- ---------- Génération des échéances dues ----------
-- Rattrape toutes les échéances en retard (abonnement créé dans le passé,
-- app non ouverte pendant des semaines, cron en pause...) et renvoie le
-- nombre de lignes réellement créées.
create or replace function public.generate_due_subscription_charges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created int := 0;
  v_next    date;
  v_anchor  int;
  v_guard   int;
  s         record;
begin
  for s in
    select * from public.subscriptions
    where active and next_charge_on <= current_date
    for update
  loop
    v_next   := s.next_charge_on;
    v_anchor := extract(day from s.started_on)::int;
    v_guard  := 0;

    -- add_billing_period avance toujours d'au moins un mois : pas de boucle
    -- infinie possible. Le garde-fou borne un rattrapage aberrant (20 ans).
    while v_next <= current_date and v_guard < 240 loop
      insert into public.finances
        (label, amount, direction, category, category_id, occurred_on, created_by, subscription_id)
      values
        (s.label, s.amount, 'out', s.category, s.category_id, v_next, s.created_by, s.id)
      on conflict (subscription_id, occurred_on) where subscription_id is not null do nothing;

      if found then
        v_created := v_created + 1;
      end if;

      v_next  := public.add_billing_period(v_next, v_anchor, s.billing_interval);
      v_guard := v_guard + 1;
    end loop;

    update public.subscriptions
      set next_charge_on = v_next
      where id = s.id;
  end loop;

  return v_created;
end;
$$;

-- Appelable uniquement par le job cron (et par le wrapper ci-dessous),
-- jamais directement depuis le client.
revoke all on function public.generate_due_subscription_charges() from public, anon, authenticated;

-- ---------- Point d'entrée client (filet de sécurité) ----------
-- Appelé à l'ouverture de l'onglet Finance : si le cron n'a pas tourné
-- (projet en pause, extension indisponible...), le grand livre se met
-- quand même à jour. Réservé au owner, seul à écrire dans les finances.
create or replace function public.sync_subscription_charges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_role() is distinct from 'owner' then
    return 0;
  end if;
  return public.generate_due_subscription_charges();
end;
$$;

-- Exposée aux seuls utilisateurs connectés. PostgreSQL accorde EXECUTE à
-- PUBLIC sur toute nouvelle fonction et `anon` en hérite : révoquer sur
-- `anon` seul ne suffirait pas, il faut retirer le droit implicite de PUBLIC
-- puis le redonner explicitement. Un visiteur non connecté n'a pas à
-- déclencher une fonction qui écrit dans le grand livre.
revoke execute on function public.sync_subscription_charges() from public, anon;
grant execute on function public.sync_subscription_charges() to authenticated, service_role;

-- ---------- Realtime ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscriptions'
  ) then
    alter publication supabase_realtime add table public.subscriptions;
  end if;
end $$;

-- ---------- Planification quotidienne (pg_cron) ----------
-- Pure SQL : aucune edge function nécessaire. Si pg_cron est indisponible,
-- la migration n'échoue pas — la synchronisation à l'ouverture de l'onglet
-- Finance prend le relais.
do $$
begin
  perform cron.unschedule('smartlife-subscriptions-daily');
exception when others then
  null; -- le job n'existait pas
end $$;

do $$
begin
  perform cron.schedule(
    'smartlife-subscriptions-daily',
    '10 3 * * *',
    $cron$ select public.generate_due_subscription_charges(); $cron$
  );
exception when others then
  raise notice 'pg_cron indisponible : les échéances seront générées à l''ouverture de l''onglet Finance.';
end $$;
