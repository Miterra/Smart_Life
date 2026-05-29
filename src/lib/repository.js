/* ============================================================
 *  Repository — toutes les requêtes Supabase de l'app
 *  (RLS appliqué côté DB, on ne fait pas de check côté front)
 * ============================================================ */
import { supabase } from './supabase'

/* ============================================================
 *  Historique d'activité (admin) — acteur courant + logging
 * ============================================================ */
let _actor = null
export function setCurrentActor(profile) {
  _actor = profile ? { id: profile.id, name: profile.full_name || profile.email || '' } : null
}

/** Journalise une action. Fire-and-forget : n'interrompt jamais le flux. */
export async function logActivity(action, summary, opts = {}) {
  try {
    if (!_actor?.id) return
    await supabase.from('activity_log').insert({
      actor_id: _actor.id,
      actor_name: _actor.name,
      action,
      summary,
      entity_type: opts.entity_type ?? null,
      entity_id: opts.entity_id ?? null,
      meta: opts.meta ?? {},
    })
  } catch (e) {
    console.warn('[activity] log failed', e)
  }
}

export async function listActivity(limit = 100) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

/* ============================================================
 *  Mutes (par utilisateur : un groupe OU un membre)
 * ============================================================ */
export async function listMutes() {
  const { data, error } = await supabase.from('mutes').select('*')
  if (error) throw error
  return data
}

async function _myId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export async function muteGroup(groupId) {
  const uid = await _myId()
  const { error } = await supabase.from('mutes').insert({ user_id: uid, group_id: groupId })
  if (error && error.code !== '23505') throw error
}
export async function unmuteGroup(groupId) {
  const uid = await _myId()
  const { error } = await supabase.from('mutes').delete().eq('user_id', uid).eq('group_id', groupId)
  if (error) throw error
}
export async function muteUser(userId) {
  const uid = await _myId()
  const { error } = await supabase.from('mutes').insert({ user_id: uid, muted_user_id: userId })
  if (error && error.code !== '23505') throw error
}
export async function unmuteUser(userId) {
  const uid = await _myId()
  const { error } = await supabase.from('mutes').delete().eq('user_id', uid).eq('muted_user_id', userId)
  if (error) throw error
}

/* ============================================================
 *  Avatar (Supabase Storage, bucket public "avatars")
 * ============================================================ */
export async function uploadAvatar(file, userId) {
  const rawExt = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const ext = rawExt || 'jpg'
  const path = `${userId}/avatar_${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  })
  if (upErr) throw upErr
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}

/* ---------- Profiles ---------- */
export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function updateProfile(id, patch) {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/* ---------- Catégories de personnes ---------- */
export async function listCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*, profile_categories(user_id)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createCategory(name, color) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, color })
    .select()
    .single()
  if (error) throw error
  logActivity('category.create', `a créé la catégorie « ${data.name} »`, {
    entity_type: 'category',
    entity_id: data.id,
  })
  return data
}

export async function updateCategory(id, patch) {
  const { data, error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCategory(id) {
  const { data: c } = await supabase.from('categories').select('name').eq('id', id).single()
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
  logActivity('category.delete', `a supprimé la catégorie${c?.name ? ` « ${c.name} »` : ''}`, {
    entity_type: 'category',
    entity_id: id,
  })
}

export async function setCategoryMembers(categoryId, userIds) {
  const { error: delErr } = await supabase
    .from('profile_categories')
    .delete()
    .eq('category_id', categoryId)
  if (delErr) throw delErr
  if (userIds.length === 0) return
  const rows = userIds.map((uid) => ({ category_id: categoryId, user_id: uid }))
  const { error } = await supabase.from('profile_categories').insert(rows)
  if (error) throw error
}

/** IDs des catégories auxquelles appartient l'utilisateur courant. */
export async function listMyCategoryIds() {
  const uid = await _myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from('profile_categories')
    .select('category_id')
    .eq('user_id', uid)
  if (error) throw error
  return (data || []).map((r) => r.category_id)
}

/** Catégories (objet complet) auxquelles appartient l'utilisateur courant. */
export async function getMyCategories() {
  const uid = await _myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from('profile_categories')
    .select('categories(*)')
    .eq('user_id', uid)
  if (error) throw error
  return (data || []).map((r) => r.categories).filter(Boolean)
}

/* ============================================================
 *  Alias privés (renommage de membres, visible uniquement par soi)
 *  RLS : owner_id = auth.uid() — personne d'autre ne peut lire/écrire.
 * ============================================================ */
export async function listMyAliases() {
  const uid = await _myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from('member_aliases')
    .select('target_id, alias')
    .eq('owner_id', uid)
  if (error) throw error
  return data || []
}

export async function setAlias(targetId, alias) {
  const uid = await _myId()
  const { data, error } = await supabase
    .from('member_aliases')
    .upsert(
      { owner_id: uid, target_id: targetId, alias, updated_at: new Date().toISOString() },
      { onConflict: 'owner_id,target_id' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function clearAlias(targetId) {
  const uid = await _myId()
  const { error } = await supabase
    .from('member_aliases')
    .delete()
    .eq('owner_id', uid)
    .eq('target_id', targetId)
  if (error) throw error
}

/* ---------- Groups (visibilité + chat) ---------- */
export async function listGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members(user_id)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createGroup(name) {
  const { data: sess } = await supabase.auth.getUser()
  const uid = sess?.user?.id ?? null
  const { data, error } = await supabase
    .from('groups')
    .insert({ name, created_by: uid })
    .select()
    .single()
  if (error) throw error
  logActivity('group.create', `a créé le groupe « ${data.name} »`, { entity_type: 'group', entity_id: data.id })
  return data
}

export async function renameGroup(id, name) {
  const { data, error } = await supabase
    .from('groups')
    .update({ name })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  logActivity('group.rename', `a renommé un groupe en « ${data.name} »`, { entity_type: 'group', entity_id: id })
  return data
}

export async function deleteGroup(id) {
  const { data: g } = await supabase.from('groups').select('name').eq('id', id).single()
  const { error } = await supabase.from('groups').delete().eq('id', id)
  if (error) throw error
  logActivity('group.delete', `a supprimé le groupe${g?.name ? ` « ${g.name} »` : ''}`, {
    entity_type: 'group',
    entity_id: id,
  })
}

export async function setGroupMembers(groupId, userIds) {
  const { error: delErr } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
  if (delErr) throw delErr
  if (userIds.length > 0) {
    const rows = userIds.map((uid) => ({ group_id: groupId, user_id: uid }))
    const { error } = await supabase.from('group_members').insert(rows)
    if (error) throw error
  }
  const { data: g } = await supabase.from('groups').select('name').eq('id', groupId).single()
  logActivity(
    'group.members',
    `a mis à jour les membres du groupe${g?.name ? ` « ${g.name} »` : ''} (${userIds.length})`,
    { entity_type: 'group', entity_id: groupId },
  )
}

/* ---------- Messages (chat de groupe) ---------- */
export async function listMessages(groupId, limit = 200) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data
}

export async function sendMessage(groupId, userId, body) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ group_id: groupId, user_id: userId, body })
    .select()
    .single()
  if (error) throw error
  return data
}

/* ---------- Tasks ---------- */
export async function listTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('due_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

export async function createTask(payload) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  logActivity('task.create', `a créé la tâche « ${data.title} »`, { entity_type: 'task', entity_id: data.id })
  return data
}

export async function updateTask(id, patch) {
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  if (patch.status === 'done') {
    logActivity('task.done', `a terminé la tâche « ${data.title} »`, { entity_type: 'task', entity_id: id })
  }
  return data
}

export async function deleteTask(id) {
  const { data: t } = await supabase.from('tasks').select('title').eq('id', id).single()
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
  logActivity('task.delete', `a supprimé la tâche${t?.title ? ` « ${t.title} »` : ''}`, {
    entity_type: 'task',
    entity_id: id,
  })
}

/* ---------- Rendez-vous (RDV) ---------- */
export async function listAppointments() {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .order('start_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createAppointment(payload) {
  const { data, error } = await supabase
    .from('appointments')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  logActivity('appointment.create', `a créé le rendez-vous « ${data.title} »`, {
    entity_type: 'appointment',
    entity_id: data.id,
  })
  return data
}

export async function updateAppointment(id, patch) {
  const { data, error } = await supabase
    .from('appointments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAppointment(id) {
  const { data: a } = await supabase.from('appointments').select('title').eq('id', id).single()
  const { error } = await supabase.from('appointments').delete().eq('id', id)
  if (error) throw error
  logActivity('appointment.delete', `a supprimé le rendez-vous${a?.title ? ` « ${a.title} »` : ''}`, {
    entity_type: 'appointment',
    entity_id: id,
  })
}

/* ---------- Périodes ---------- */
export async function listPeriods() {
  const { data, error } = await supabase
    .from('periods')
    .select('*')
    .order('start_date', { ascending: true })
  if (error) throw error
  return data
}

export async function createPeriod(payload) {
  const { data, error } = await supabase
    .from('periods')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  logActivity('period.create', `a créé la période « ${data.title || ''} »`, {
    entity_type: 'period',
    entity_id: data.id,
  })
  return data
}

export async function updatePeriod(id, patch) {
  const { data, error } = await supabase
    .from('periods')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePeriod(id) {
  const { error } = await supabase.from('periods').delete().eq('id', id)
  if (error) throw error
  logActivity('period.delete', 'a supprimé une période', { entity_type: 'period', entity_id: id })
}

/* ---------- Finances ----------
 * Écriture : owner uniquement (RLS).
 * Lecture  : owner = tout ; admin = uniquement les lignes de SES catégories
 *            (RLS « finances admin scoped select » via category_id).
 * Le payload peut inclure category_id (uuid) et category (nom, pour l'affichage). */
export async function listFinances() {
  const { data, error } = await supabase
    .from('finances')
    .select('*')
    .order('occurred_on', { ascending: true })
  if (error) throw error
  return data
}

export async function createFinance(payload) {
  const { data, error } = await supabase
    .from('finances')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteFinance(id) {
  const { error } = await supabase.from('finances').delete().eq('id', id)
  if (error) throw error
}

/* ---------- Insights ---------- */
export async function listInsights(limit = 20) {
  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function createInsight(payload) {
  const { data, error } = await supabase
    .from('insights')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

/* ---------- Realtime subscriptions ---------- */
export function subscribeRealtime(tables, onChange) {
  const channel = supabase.channel(`smart-life-${Math.random().toString(36).slice(2, 8)}`)
  tables.forEach((t) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange)
  })
  channel.subscribe()
  return { unsubscribe: () => supabase.removeChannel(channel) }
}
