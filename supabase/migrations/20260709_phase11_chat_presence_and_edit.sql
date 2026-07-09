-- ============================================================
--  Phase 11 — Notif « pas quand je regarde » + édition/suppression
--
--  1) Ne pas envoyer de push de MESSAGE au membre qui a déjà la
--     conversation ouverte à l'écran. On mémorise le groupe ouvert
--     (profiles.viewing_group_id) via un RPC appelé par le client à
--     l'ouverture/fermeture du chat et sur visibilitychange ; l'edge
--     function notify-message saute ce membre (fraîcheur via last_seen).
--     Les notifs de tâche/RDV (autres edge functions) NE sont PAS
--     concernées : elles arrivent même app ouverte.
--
--  2) Édition / suppression de ses propres messages. La suppression était
--     déjà permise ("messages delete" = auteur ou owner). On ajoute une
--     policy UPDATE réservée à l'auteur + un trigger qui gèle toutes les
--     colonnes sauf `body` et horodate `edited_at`.
-- ============================================================

-- ---------- Présence : groupe actuellement regardé ----------
alter table public.profiles add column if not exists viewing_group_id uuid;

create or replace function public.set_viewing_group(gid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set viewing_group_id = gid, last_seen = now() where id = auth.uid();
$$;

-- ---------- Édition de message ----------
alter table public.messages add column if not exists edited_at timestamptz;

drop policy if exists "messages update" on public.messages;
create policy "messages update" on public.messages
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.guard_message_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Seul le corps (body) peut changer ; on gèle le reste et on horodate l'édition.
  new.group_id := old.group_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.attachment_path := old.attachment_path;
  new.attachment_type := old.attachment_type;
  new.attachment_name := old.attachment_name;
  new.attachment_size := old.attachment_size;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists guard_message_edit_trg on public.messages;
create trigger guard_message_edit_trg
  before update on public.messages
  for each row execute function public.guard_message_edit();
