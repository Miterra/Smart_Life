/* ============================================================
 *  Repository — toutes les requêtes Supabase de l'app
 *  (RLS appliqué côté DB, on ne fait pas de check côté front)
 * ============================================================ */
import { supabase } from './supabase'

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
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
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
  return data
}

export async function deleteGroup(id) {
  const { error } = await supabase.from('groups').delete().eq('id', id)
  if (error) throw error
}

export async function setGroupMembers(groupId, userIds) {
  const { error: delErr } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
  if (delErr) throw delErr
  if (userIds.length === 0) return
  const rows = userIds.map((uid) => ({ group_id: groupId, user_id: uid }))
  const { error } = await supabase.from('group_members').insert(rows)
  if (error) throw error
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
  return data
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
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
  const { error } = await supabase.from('appointments').delete().eq('id', id)
  if (error) throw error
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
}

/* ---------- Finances (owner uniquement) ---------- */
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
