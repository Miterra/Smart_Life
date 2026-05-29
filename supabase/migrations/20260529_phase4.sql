-- ============================================================
--  Migration Phase 4 — Smart Life Dashboard
--
--  1. FIX critique : récursion infinie RLS sur group_members
--     (la policy SELECT de group_members se référençait elle-même)
--     -> casse la création de groupes ET le chargement des profils
--        dans Tâches (donc l'impossibilité de s'auto-assigner).
--  2. Catégories de personnes (+ filtre d'assignation).
--  3. Rendez-vous (RDV) visibles dans l'agenda + rappel J-1.
--  4. Périodes (voyage, vacances…) avec couleur, dans l'agenda.
--  5. Finances (statistiques argent) — visibles UNIQUEMENT par l'owner.
--  6. Messagerie de groupe (chat) — membres d'un groupe peuvent discuter.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Helper anti-récursion + correction des policies
-- ------------------------------------------------------------
create or replace function public.is_group_member(gid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = gid and gm.user_id = auth.uid()
  );
$$;

-- group_members : la policy SELECT ne doit plus interroger group_members
drop policy if exists "group_members select" on public.group_members;
create policy "group_members select" on public.group_members
  for select using (
    public.is_admin_or_owner()
    or user_id = auth.uid()
    or public.is_group_member(group_id)
  );

-- groups : remplace l'EXISTS récursif par la fonction SECURITY DEFINER
drop policy if exists "groups select" on public.groups;
create policy "groups select" on public.groups
  for select using (
    public.is_admin_or_owner()
    or public.is_group_member(id)
  );

-- ------------------------------------------------------------
-- 2. Catégories de personnes
-- ------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#22d3ee',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.profile_categories (
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (category_id, user_id)
);

alter table public.categories enable row level security;
alter table public.profile_categories enable row level security;

drop policy if exists "categories select" on public.categories;
create policy "categories select" on public.categories
  for select using (auth.uid() is not null);

drop policy if exists "categories write admin" on public.categories;
create policy "categories write admin" on public.categories
  for all using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());

drop policy if exists "profile_categories select" on public.profile_categories;
create policy "profile_categories select" on public.profile_categories
  for select using (auth.uid() is not null);

drop policy if exists "profile_categories write admin" on public.profile_categories;
create policy "profile_categories write admin" on public.profile_categories
  for all using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());

-- ------------------------------------------------------------
-- 3. Rendez-vous (RDV)
-- ------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  location text default '',
  start_at timestamptz not null,
  end_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  reminder_sent boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists appointments_start_idx on public.appointments(start_at);

alter table public.appointments enable row level security;

drop policy if exists "appointments select" on public.appointments;
create policy "appointments select" on public.appointments
  for select using (
    public.is_admin_or_owner()
    or assigned_to = auth.uid()
    or created_by = auth.uid()
    or (group_id is not null and public.is_group_member(group_id))
  );

drop policy if exists "appointments insert" on public.appointments;
create policy "appointments insert" on public.appointments
  for insert with check (public.can_create_task() and created_by = auth.uid());

drop policy if exists "appointments update" on public.appointments;
create policy "appointments update" on public.appointments
  for update using (public.is_admin_or_owner() or created_by = auth.uid())
  with check (public.is_admin_or_owner() or created_by = auth.uid());

drop policy if exists "appointments delete" on public.appointments;
create policy "appointments delete" on public.appointments
  for delete using (public.is_admin_or_owner() or created_by = auth.uid());

-- ------------------------------------------------------------
-- 4. Périodes (voyage, vacances…)
-- ------------------------------------------------------------
create table if not exists public.periods (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date not null,
  end_date date not null,
  color text not null default '#a78bfa',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists periods_range_idx on public.periods(start_date, end_date);

alter table public.periods enable row level security;

drop policy if exists "periods select" on public.periods;
create policy "periods select" on public.periods
  for select using (auth.uid() is not null);

drop policy if exists "periods write admin" on public.periods;
create policy "periods write admin" on public.periods
  for all using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());

-- ------------------------------------------------------------
-- 5. Finances (owner uniquement)
-- ------------------------------------------------------------
create table if not exists public.finances (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  amount numeric(12,2) not null,
  direction text not null default 'in' check (direction in ('in','out')),
  category text default '',
  occurred_on date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists finances_date_idx on public.finances(occurred_on);

alter table public.finances enable row level security;

drop policy if exists "finances owner all" on public.finances;
create policy "finances owner all" on public.finances
  for all using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- ------------------------------------------------------------
-- 6. Messagerie de groupe (chat)
-- ------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
create index if not exists messages_group_idx on public.messages(group_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "messages select" on public.messages;
create policy "messages select" on public.messages
  for select using (
    public.is_admin_or_owner() or public.is_group_member(group_id)
  );

drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages
  for insert with check (
    user_id = auth.uid()
    and (public.is_admin_or_owner() or public.is_group_member(group_id))
  );

drop policy if exists "messages delete" on public.messages;
create policy "messages delete" on public.messages
  for delete using (user_id = auth.uid() or public.is_admin_or_owner());

-- ------------------------------------------------------------
-- 7. Realtime publication (ajout idempotent)
-- ------------------------------------------------------------
do $$
declare
  t text;
  tbls text[] := array['appointments','periods','messages','group_members','categories','profile_categories','finances'];
begin
  foreach t in array tbls loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
