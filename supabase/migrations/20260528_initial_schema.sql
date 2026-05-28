-- =====================================================================
--  Smart Life Dashboard — Schéma initial
--
--  Rôles :
--    - owner   : un seul, accès total + gère qui voit quoi
--    - admin   : voit tout, édite tout
--    - manager : crée des tâches + crée des comptes user, assigne
--    - user    : voit ses tâches assignées, change le statut
-- =====================================================================

create extension if not exists pgcrypto;

-- ============================================================
--  profiles : prolonge auth.users avec un rôle + nom complet
-- ============================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  full_name    text default '',
  role         text not null default 'user' check (role in ('owner','admin','manager','user')),
  avatar_color text default '#22d3ee',
  push_enabled boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

-- ============================================================
--  groups : "groupes de visibilité" créés par le owner/admin
--  Les members d'un groupe peuvent voir entre eux les tâches
--  partagées dans ce groupe.
-- ============================================================
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz default now()
);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  added_at  timestamptz default now(),
  primary key (group_id, user_id)
);

create index if not exists idx_group_members_user on public.group_members(user_id);

-- ============================================================
--  tasks : créées par owner/admin/manager
--  - assigned_to : utilisateur responsable (peut être null)
--  - group_id   : groupe de visibilité (null = privé créateur)
--  - status     : todo | in_progress | done
--  - priority   : critical | important | chill
-- ============================================================
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text default '',
  due_at        timestamptz,
  priority      text default 'important' check (priority in ('critical','important','chill')),
  status        text default 'todo' check (status in ('todo','in_progress','done')),
  assigned_to   uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  group_id      uuid references public.groups(id) on delete set null,
  reminder_sent boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_tasks_due_at  on public.tasks(due_at) where status <> 'done';
create index if not exists idx_tasks_assigned on public.tasks(assigned_to);
create index if not exists idx_tasks_group on public.tasks(group_id);

-- ============================================================
--  social_history : historique des followers IG/TikTok
-- ============================================================
create table if not exists public.social_history (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null check (platform in ('instagram','tiktok')),
  handle        text not null,
  followers     int  not null,
  captured_on   date not null default current_date,
  created_at    timestamptz default now(),
  unique (platform, handle, captured_on)
);

create index if not exists idx_social_captured on public.social_history(captured_on desc);

-- ============================================================
--  insights : analyses IA générées automatiquement
-- ============================================================
create table if not exists public.insights (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,    -- social_growth, productivity, deadline, custom
  tone        text default 'info' check (tone in ('info','success','warning','danger')),
  title       text not null,
  body        text default '',
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);

create index if not exists idx_insights_created on public.insights(created_at desc);

-- ============================================================
--  visuals : visuels générés via IA (template + image URL)
-- ============================================================
create table if not exists public.visuals (
  id          uuid primary key default gen_random_uuid(),
  template    text not null,
  prompt      text default '',
  image_url   text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz default now()
);

create index if not exists idx_visuals_created on public.visuals(created_at desc);

-- ============================================================
--  push_subscriptions : un user peut avoir plusieurs devices
-- ============================================================
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text default '',
  device_label  text default '',
  created_at    timestamptz default now(),
  last_used_at  timestamptz default now()
);

create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

-- ============================================================
--  Trigger updated_at générique
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ============================================================
--  Trigger : créer un profil à chaque inscription
--  Le premier utilisateur devient owner automatiquement.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_role  text;
begin
  select count(*) into v_count from public.profiles;
  if v_count = 0 then v_role := 'owner'; else v_role := 'user'; end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
--  Helpers (utilisés par les policies RLS)
-- ============================================================
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_or_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner','admin')
  );
$$;

create or replace function public.can_create_task()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner','admin','manager')
  );
$$;

create or replace function public.shares_group(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm1
    join public.group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = auth.uid() and gm2.user_id = target_user
  );
$$;

-- ============================================================
--  RLS — profiles
-- ============================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles
  for select to authenticated using (
    -- chacun voit son profil + tous voient le owner/admin
    id = auth.uid()
    or public.is_admin_or_owner()
    or role in ('owner','admin')
    -- les managers voient les membres de leurs groupes
    or public.shares_group(id)
  );

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "profiles update admin" on public.profiles;
create policy "profiles update admin" on public.profiles
  for update to authenticated using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

drop policy if exists "profiles delete owner" on public.profiles;
create policy "profiles delete owner" on public.profiles
  for delete to authenticated using (public.current_role() = 'owner' and id <> auth.uid());

-- ============================================================
--  RLS — groups
-- ============================================================
alter table public.groups enable row level security;

drop policy if exists "groups select" on public.groups;
create policy "groups select" on public.groups
  for select to authenticated using (
    public.is_admin_or_owner()
    or exists (select 1 from public.group_members gm where gm.group_id = id and gm.user_id = auth.uid())
  );

drop policy if exists "groups write admin" on public.groups;
create policy "groups write admin" on public.groups
  for all to authenticated using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

alter table public.group_members enable row level security;

drop policy if exists "group_members select" on public.group_members;
create policy "group_members select" on public.group_members
  for select to authenticated using (
    public.is_admin_or_owner()
    or user_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_members write admin" on public.group_members;
create policy "group_members write admin" on public.group_members
  for all to authenticated using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- ============================================================
--  RLS — tasks
-- ============================================================
alter table public.tasks enable row level security;

drop policy if exists "tasks select" on public.tasks;
create policy "tasks select" on public.tasks
  for select to authenticated using (
    public.is_admin_or_owner()
    or assigned_to = auth.uid()
    or created_by  = auth.uid()
    or (group_id is not null and exists (
      select 1 from public.group_members gm
      where gm.group_id = tasks.group_id and gm.user_id = auth.uid()
    ))
  );

drop policy if exists "tasks insert" on public.tasks;
create policy "tasks insert" on public.tasks
  for insert to authenticated with check (
    public.can_create_task() and created_by = auth.uid()
  );

-- Update : owner/admin OK toujours ; manager OK sur ses propres tâches ;
-- user uniquement sur les tâches qui lui sont assignées ET uniquement
-- le champ status (autres colonnes inchangées vérifié par trigger).
drop policy if exists "tasks update admin or creator" on public.tasks;
create policy "tasks update admin or creator" on public.tasks
  for update to authenticated using (
    public.is_admin_or_owner()
    or created_by = auth.uid()
  ) with check (
    public.is_admin_or_owner()
    or created_by = auth.uid()
  );

drop policy if exists "tasks update assignee status" on public.tasks;
create policy "tasks update assignee status" on public.tasks
  for update to authenticated using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

drop policy if exists "tasks delete" on public.tasks;
create policy "tasks delete" on public.tasks
  for delete to authenticated using (
    public.is_admin_or_owner()
    or created_by = auth.uid()
  );

-- Trigger : un user (role=user) qui modifie une tâche ne peut changer que `status`
create or replace function public.tasks_user_only_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'user' and old.assigned_to = auth.uid() then
    new.title       := old.title;
    new.description := old.description;
    new.due_at      := old.due_at;
    new.priority    := old.priority;
    new.assigned_to := old.assigned_to;
    new.created_by  := old.created_by;
    new.group_id    := old.group_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_user_only_status on public.tasks;
create trigger trg_tasks_user_only_status
  before update on public.tasks
  for each row execute function public.tasks_user_only_status();

-- ============================================================
--  RLS — social_history (lecture pour tous les authentifiés,
--  écriture réservée admin/owner ou edge function)
-- ============================================================
alter table public.social_history enable row level security;

drop policy if exists "social select all" on public.social_history;
create policy "social select all" on public.social_history
  for select to authenticated using (true);

drop policy if exists "social write admin" on public.social_history;
create policy "social write admin" on public.social_history
  for all to authenticated using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- ============================================================
--  RLS — insights (tous lecture, admin écrit)
-- ============================================================
alter table public.insights enable row level security;

drop policy if exists "insights select all" on public.insights;
create policy "insights select all" on public.insights
  for select to authenticated using (true);

drop policy if exists "insights write admin" on public.insights;
create policy "insights write admin" on public.insights
  for all to authenticated using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- ============================================================
--  RLS — visuals (tous voient + créent leurs propres visuels)
-- ============================================================
alter table public.visuals enable row level security;

drop policy if exists "visuals select all" on public.visuals;
create policy "visuals select all" on public.visuals
  for select to authenticated using (true);

drop policy if exists "visuals insert authenticated" on public.visuals;
create policy "visuals insert authenticated" on public.visuals
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "visuals delete creator or admin" on public.visuals;
create policy "visuals delete creator or admin" on public.visuals
  for delete to authenticated using (
    created_by = auth.uid() or public.is_admin_or_owner()
  );

-- ============================================================
--  RLS — push_subscriptions (chacun gère ses devices)
-- ============================================================
alter table public.push_subscriptions enable row level security;

drop policy if exists "push select self" on public.push_subscriptions;
create policy "push select self" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid() or public.is_admin_or_owner());

drop policy if exists "push insert self" on public.push_subscriptions;
create policy "push insert self" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push delete self" on public.push_subscriptions;
create policy "push delete self" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid() or public.is_admin_or_owner());

-- ============================================================
--  Realtime
-- ============================================================
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.insights;
alter publication supabase_realtime add table public.social_history;
alter publication supabase_realtime add table public.visuals;
alter publication supabase_realtime add table public.profiles;
