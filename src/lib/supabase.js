/* ============================================================
 *  Supabase client unique pour l'app
 *  - Auth (email + password)
 *  - Postgres (profiles, tasks, groups, social_history, insights, visuals)
 *  - Realtime (sync multi-device)
 *  - Edge Functions (send-reminders pour les rappels de tâches)
 * ============================================================ */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(
  url && anonKey && !anonKey.startsWith('eyJxxx'),
)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

if (!isSupabaseConfigured) {
  console.info(
    '[Smart Life] Supabase non configuré — copie .env.example vers .env.local et renseigne les clés.',
  )
}
