-- ============================================================
--  Phase 9 — Confidentialité des groupes de chat
--
--  Problème détecté : un ADMIN qui n'est PAS membre d'un groupe
--  pouvait quand même le VOIR, y ENTRER, LIRE et ÉCRIRE, parce que
--  toutes les policies de chat contenaient le bypass
--  `is_admin_or_owner()`.
--
--  Objectif : la visibilité d'un chat de groupe est désormais
--  strictement liée à l'appartenance. Seul le OWNER conserve une
--  supervision globale (il gère l'équipe et doit pouvoir modérer /
--  ajouter des membres à n'importe quel groupe). Les admins sont
--  traités comme des membres normaux pour le CHAT, mais gardent la
--  GESTION des groupes (création / membres / renommage / suppression).
--
--  Subtilité PostgreSQL (importante) : les policies permissives sont
--  combinées en OU par commande, et une policy `FOR ALL` applique son
--  clause USING au SELECT. Les policies "groups write admin" et
--  "group_members write admin" (FOR ALL, is_admin_or_owner())
--  accordaient donc AUSSI la lecture à tous les admins. On les scinde
--  en INSERT / UPDATE / DELETE pour supprimer cette fuite de lecture.
--
--  Note : la fonction Edge notify-message ne notifie déjà que les
--  vrais membres (table group_members), donc les non-membres ne
--  reçoivent aucune notification — rien à changer côté push.
-- ============================================================

-- ------------------------------------------------------------
--  groups
--  SELECT : owner (supervision) OU créateur (pour gérer + pour que
--           INSERT ... RETURNING fonctionne dès la création) OU membre.
--  WRITE  : owner + admin, scindé pour ne pas rouvrir le SELECT.
-- ------------------------------------------------------------
drop policy if exists "groups select" on public.groups;
create policy "groups select" on public.groups
  for select to authenticated using (
    public.my_role() = 'owner'
    or created_by = auth.uid()
    or public.is_group_member(id)
  );

drop policy if exists "groups write admin" on public.groups;
create policy "groups insert admin" on public.groups
  for insert to authenticated with check (public.is_admin_or_owner());
create policy "groups update admin" on public.groups
  for update to authenticated using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());
create policy "groups delete admin" on public.groups
  for delete to authenticated using (public.is_admin_or_owner());

-- ------------------------------------------------------------
--  group_members
--  SELECT : owner OU sa propre ligne OU membre du même groupe.
--  WRITE  : owner + admin, scindé (même raison que ci-dessus).
-- ------------------------------------------------------------
drop policy if exists "group_members select" on public.group_members;
create policy "group_members select" on public.group_members
  for select to authenticated using (
    public.my_role() = 'owner'
    or user_id = auth.uid()
    or public.is_group_member(group_id)
  );

drop policy if exists "group_members write admin" on public.group_members;
create policy "group_members insert admin" on public.group_members
  for insert to authenticated with check (public.is_admin_or_owner());
create policy "group_members update admin" on public.group_members
  for update to authenticated using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());
create policy "group_members delete admin" on public.group_members
  for delete to authenticated using (public.is_admin_or_owner());

-- ------------------------------------------------------------
--  messages : lecture / écriture réservées au owner ou aux membres.
-- ------------------------------------------------------------
drop policy if exists "messages select" on public.messages;
create policy "messages select" on public.messages
  for select using (
    public.my_role() = 'owner' or public.is_group_member(group_id)
  );

drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages
  for insert with check (
    user_id = auth.uid()
    and (public.my_role() = 'owner' or public.is_group_member(group_id))
  );

drop policy if exists "messages delete" on public.messages;
create policy "messages delete" on public.messages
  for delete using (user_id = auth.uid() or public.my_role() = 'owner');

-- ------------------------------------------------------------
--  message_reactions : gouverné par can_access_message().
--  On retire le bypass admin de la fonction (owner ou membre).
-- ------------------------------------------------------------
create or replace function public.can_access_message(mid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select exists (
    select 1 from public.messages m
    where m.id = mid
      and (public.my_role() = 'owner' or public.is_group_member(m.group_id))
  );
$$;

-- ------------------------------------------------------------
--  Pièces jointes du chat (bucket privé "chat-files")
--  Le fichier est rangé sous {group_id}/... : l'accès suit la même
--  règle que les messages (owner global OU membre du groupe).
--  On retire là aussi le bypass `is_admin_or_owner()`.
-- ------------------------------------------------------------
drop policy if exists "chat-files read" on storage.objects;
create policy "chat-files read" on storage.objects
  for select using (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (my_role() = 'owner' or is_group_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists "chat-files insert" on storage.objects;
create policy "chat-files insert" on storage.objects
  for insert with check (
    bucket_id = 'chat-files'
    and owner = auth.uid()
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (my_role() = 'owner' or is_group_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists "chat-files delete" on storage.objects;
create policy "chat-files delete" on storage.objects
  for delete using (
    bucket_id = 'chat-files'
    and (owner = auth.uid() or my_role() = 'owner')
  );
