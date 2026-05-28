/* ============================================================
 *  Auth helpers (signIn / signUp / signOut) + hook React useAuth
 *  Le profil (role, full_name) est créé automatiquement par un
 *  trigger Postgres (cf. migration 20260528_initial_schema.sql).
 * ============================================================ */
import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async (userId) => {
    if (!supabase || !userId) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.warn('[auth] profile fetch error', error)
      return null
    }
    setProfile(data)
    return data
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        refreshProfile(data.session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
      if (sess?.user) {
        refreshProfile(sess.user.id)
      } else {
        setProfile(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [refreshProfile])

  return { session, user: session?.user || null, profile, loading, refreshProfile }
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase non configuré.')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(email, password, fullName) {
  if (!supabase) throw new Error('Supabase non configuré.')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}
