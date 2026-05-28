/* ============================================================
 *  Web Push (VAPID natif, sans Firebase)
 *
 *  Flux :
 *    1. requestPermission()      → demande à l'utilisateur
 *    2. subscribePush()          → Service Worker s'abonne (VAPID)
 *    3. registerSubscription()   → POST dans push_subscriptions
 *    4. send-reminders (Edge)    → push à l'heure dite
 *    5. SW (public/sw.js)        → affiche la notif (même app fermée)
 *
 *  iOS 16.4+ : fonctionne UNIQUEMENT si l'app est installée depuis
 *  Safari (Partager → Sur l'écran d'accueil).
 * ============================================================ */
import { supabase, isSupabaseConfigured, VAPID_PUBLIC_KEY } from './supabase'

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function isIos() {
  if (typeof window === 'undefined') return false
  return /iPhone|iPad|iPod/.test(window.navigator.userAgent)
}

export function notificationsSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export function getPermissionStatus() {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestPermission() {
  if (!notificationsSupported()) {
    throw new Error('Notifications non supportées sur ce navigateur.')
  }
  if (isIos() && !isStandalone()) {
    throw new Error(
      "Sur iPhone, installe d'abord l'app : Safari → Partager → Sur l'écran d'accueil.",
    )
  }
  return await Notification.requestPermission()
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)))
}

export async function subscribePush() {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Clé VAPID publique manquante (VITE_VAPID_PUBLIC_KEY).')
  }
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  return sub
}

export async function registerSubscription(sub, userId) {
  if (!isSupabaseConfigured || !supabase) return null
  const json = sub.toJSON()
  const row = {
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent,
    device_label: detectDevice(),
  }
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' })
    .select()
    .single()
  if (error) {
    console.error('[push] register error', error)
    return null
  }
  return data
}

function detectDevice() {
  if (isIos()) return 'iPhone'
  const ua = navigator.userAgent
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'PC Windows'
  return 'Navigateur'
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  if (isSupabaseConfigured && supabase) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
}

export async function showLocalNotification({ title, body, tag, url }) {
  if (!notificationsSupported()) return
  if (Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker.ready
  reg.active?.postMessage({
    type: 'SHOW_NOTIFICATION',
    payload: { title, body, tag, url },
  })
}

/** Active complètement les notifs : permission + abonnement + enregistrement. */
export async function enableNotifications(userId) {
  try {
    const permission = await requestPermission()
    if (permission !== 'granted') {
      return { ok: false, permission, error: 'Permission refusée.' }
    }
    const sub = await subscribePush()
    const stored = await registerSubscription(sub, userId)
    return { ok: true, permission, subscription: stored }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}
