-- Phase 13 — Compteur de messages non lus + espace fichiers (dossiers) par groupe
--
-- 1) Non-lus : table group_reads (last_read_at par user/group) + RPC
--    mark_group_read(gid) (appelé à l'ouverture et à chaque nouveau message vu)
--    + RPC unread_counts() qui renvoie, par groupe dont l'utilisateur est
--    membre, le nombre de messages d'autrui postérieurs à sa dernière lecture.
-- 2) Espace fichiers : tables group_folders (arborescence via parent_id) et
--    group_files. Les octets vont dans le bucket privé "chat-files" sous
--    {group_id}/lib/... (déjà couvert par la policy storage scopée à
--    l'appartenance). RLS : owner ou membre du groupe (comme le chat).

-- ===== Non-lus =====
create table if not exists public.group_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, group_id)
);
alter table public.group_reads enable row level security;
drop policy if exists "group_reads self" on public.group_reads;
create policy "group_reads self" on public.group_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.mark_group_read(gid uuid)
returns void language sql security definer set search_path='' as $$
  insert into public.group_reads(user_id, group_id, last_read_at)
  values (auth.uid(), gid, now())
  on conflict (user_id, group_id) do update set last_read_at = now();
$$;

create or replace function public.unread_counts()
returns table(group_id uuid, count bigint)
language sql stable security definer set search_path='' as $$
  select m.group_id, count(*)::bigint
  from public.messages m
  join public.group_members gm on gm.group_id = m.group_id and gm.user_id = auth.uid()
  left join public.group_reads gr on gr.group_id = m.group_id and gr.user_id = auth.uid()
  where m.user_id <> auth.uid()
    and m.created_at > coalesce(gr.last_read_at, timestamptz 'epoch')
  group by m.group_id;
$$;

-- ===== Espace fichiers (dossiers + fichiers) =====
create table if not exists public.group_folders (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  parent_id uuid references public.group_folders(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists group_folders_group_idx on public.group_folders(group_id, parent_id);

create table if not exists public.group_files (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  folder_id uuid references public.group_folders(id) on delete cascade,
  name text not null,
  path text not null,
  type text,
  size bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists group_files_group_idx on public.group_files(group_id, folder_id);

alter table public.group_folders enable row level security;
alter table public.group_files enable row level security;

drop policy if exists "group_folders member" on public.group_folders;
create policy "group_folders member" on public.group_folders
  for all using (public.my_role()='owner' or public.is_group_member(group_id))
  with check (public.my_role()='owner' or public.is_group_member(group_id));

drop policy if exists "group_files member" on public.group_files;
create policy "group_files member" on public.group_files
  for all using (public.my_role()='owner' or public.is_group_member(group_id))
  with check (public.my_role()='owner' or public.is_group_member(group_id));

do $$
declare t text; tbls text[] := array['group_reads','group_folders','group_files'];
begin
  foreach t in array tbls loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
