-- Phase 13b — La suppression d'un fichier/dossier de l'espace de groupe est
-- réservée à son créateur (ou au owner). Sinon un membre pouvait supprimer la
-- LIGNE d'un fichier d'autrui alors que la policy storage ("chat-files delete"
-- = owner du blob ou rôle owner) ne lui permet pas de supprimer l'OCTET →
-- blob orphelin dans le bucket. On scinde la policy FOR ALL en
-- select / insert / delete (pas d'update nécessaire).
drop policy if exists "group_folders member" on public.group_folders;
create policy "group_folders select" on public.group_folders
  for select using (public.my_role()='owner' or public.is_group_member(group_id));
create policy "group_folders insert" on public.group_folders
  for insert with check (
    (public.my_role()='owner' or public.is_group_member(group_id))
    and created_by = auth.uid()
  );
create policy "group_folders delete" on public.group_folders
  for delete using (created_by = auth.uid() or public.my_role()='owner');

drop policy if exists "group_files member" on public.group_files;
create policy "group_files select" on public.group_files
  for select using (public.my_role()='owner' or public.is_group_member(group_id));
create policy "group_files insert" on public.group_files
  for insert with check (
    (public.my_role()='owner' or public.is_group_member(group_id))
    and created_by = auth.uid()
  );
create policy "group_files delete" on public.group_files
  for delete using (created_by = auth.uid() or public.my_role()='owner');
