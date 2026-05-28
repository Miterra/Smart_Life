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

/* ---------- Groups (visibility) ---------- */
export async function listGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*, group_members(user_id)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createGroup(name) {
  const { data, error } = await supabase
    .from('groups')
    .insert({ name })
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

/* ---------- Social history ---------- */
export async function listSocialHistory(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('social_history')
    .select('*')
    .gte('captured_on', since)
    .order('captured_on', { ascending: true })
  if (error) throw error
  return data
}

export async function insertSocialPoint(platform, handle, followers) {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('social_history')
    .upsert(
      { platform, handle, followers, captured_on: today },
      { onConflict: 'platform,handle,captured_on' },
    )
    .select()
    .single()
  if (error) throw error
  return data
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

/* ---------- Visuals ---------- */
export async function listVisuals(limit = 24) {
  const { data, error } = await supabase
    .from('visuals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function createVisual(payload) {
  const { data, error } = await supabase
    .from('visuals')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

/* ---------- Realtime subscriptions ---------- */
export function subscribeRealtime(tables, onChange) {
  const channel = supabase.channel('smart-life-realtime')
  tables.forEach((t) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange)
  })
  channel.subscribe()
  return { unsubscribe: () => supabase.removeChannel(channel) }
}
