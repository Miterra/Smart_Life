// ============================================================
//  Edge Function : send-reminders
//
//  Smart Life Dashboard — envoie les rappels Web Push (VAPID natif)
//  pour les tâches dont l'échéance approche.
//
//  Appelée toutes les minutes par pg_cron.
//  Pour chaque tâche non terminée :
//    - reminder_at par défaut = due_at - 24h (rappel J-1)
//    - on prend la fenêtre [now-2min, now+2min]
//    - on envoie un push à TOUS les devices de l'assigné
//      (+ admin/owner si push_enabled = true)
//    - on marque reminder_sent = true
//
//  Debug : ?debug=1 pour voir le détail des envois.
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

/* ---------- helpers base64url ---------- */
function b64uEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function b64uDecode(s: string): Uint8Array {
  const padding = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrs) { out.set(a, off); off += a.length }
  return out
}

/* ---------- VAPID ---------- */
async function importVapidPrivateKey(privateD: Uint8Array, publicRaw: Uint8Array): Promise<CryptoKey> {
  const x = publicRaw.slice(1, 33)
  const y = publicRaw.slice(33, 65)
  return await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: b64uEncode(privateD), x: b64uEncode(x), y: b64uEncode(y), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

async function createVapidJwt(privateKey: CryptoKey, audience: string, subject: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  }
  const headerB64 = b64uEncode(new TextEncoder().encode(JSON.stringify(header)))
  const claimsB64 = b64uEncode(new TextEncoder().encode(JSON.stringify(claims)))
  const signingInput = `${headerB64}.${claimsB64}`
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${b64uEncode(sig)}`
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    baseKey,
    length * 8,
  )
  return new Uint8Array(bits)
}

/* ---------- Chiffrement aes128gcm (RFC 8291) ---------- */
interface EncryptedPayload { ciphertext: Uint8Array; salt: Uint8Array; serverPublicRaw: Uint8Array }

async function encryptPayload(payload: Uint8Array, p256dh: Uint8Array, auth: Uint8Array): Promise<EncryptedPayload> {
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const serverPubJwk = await crypto.subtle.exportKey('jwk', serverKeyPair.publicKey)
  const sx = b64uDecode(serverPubJwk.x!)
  const sy = b64uDecode(serverPubJwk.y!)
  const serverPublicRaw = concat(new Uint8Array([0x04]), sx, sy)

  const cx = p256dh.slice(1, 33)
  const cy = p256dh.slice(33, 65)
  const clientPub = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64uEncode(cx), y: b64uEncode(cy) },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPub },
    serverKeyPair.privateKey,
    256,
  )
  const sharedSecret = new Uint8Array(sharedBits)

  const salt = crypto.getRandomValues(new Uint8Array(16))

  const keyInfo = concat(
    new TextEncoder().encode('WebPush: info\0'),
    p256dh,
    serverPublicRaw,
  )
  const prkKey = await hkdf(auth, sharedSecret, keyInfo, 32)
  const cek = await hkdf(salt, prkKey, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, prkKey, new TextEncoder().encode('Content-Encoding: nonce\0'), 12)

  const plaintext = concat(payload, new Uint8Array([0x02]))
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, plaintext)
  return { ciphertext: new Uint8Array(ctBuf), salt, serverPublicRaw }
}

function buildBody(enc: EncryptedPayload, recordSize = 4096): Uint8Array {
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, recordSize, false)
  const keyIdLen = new Uint8Array([enc.serverPublicRaw.length])
  return concat(enc.salt, rs, keyIdLen, enc.serverPublicRaw, enc.ciphertext)
}

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPrivate: CryptoKey,
  vapidPubRaw: Uint8Array,
  vapidSubject: string,
): Promise<{ ok: boolean; status: number; statusText: string; body?: string }> {
  const p256dh = b64uDecode(sub.p256dh)
  const auth = b64uDecode(sub.auth)
  const enc = await encryptPayload(new TextEncoder().encode(payload), p256dh, auth)
  const body = buildBody(enc)
  const url = new URL(sub.endpoint)
  const audience = `${url.protocol}//${url.host}`
  const jwt = await createVapidJwt(vapidPrivate, audience, vapidSubject)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '1800',
      Authorization: `vapid t=${jwt}, k=${b64uEncode(vapidPubRaw)}`,
    },
    body,
  })
  let respBody: string | undefined
  if (!res.ok) {
    try { respBody = await res.text() } catch { /* ignore */ }
  }
  return { ok: res.ok, status: res.status, statusText: res.statusText, body: respBody }
}

/* ============================================================
 *  Edge Function entrypoint
 * ============================================================ */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

let vapidPrivKey: CryptoKey | null = null
let vapidPubRaw: Uint8Array | null = null
let vapidSubject: string | null = null

async function loadVapid(): Promise<void> {
  if (vapidPrivKey && vapidPubRaw && vapidSubject) return
  const { data, error } = await supabase.rpc('get_vapid_config')
  if (error) throw new Error(`vapid rpc failed: ${error.message}`)
  const map = Object.fromEntries(((data || []) as { key: string; value: string }[]).map((r) => [r.key, r.value]))
  if (!map.vapid_public || !map.vapid_private || !map.vapid_subject) {
    throw new Error('missing vapid secrets (private.app_secrets)')
  }
  vapidPrivKey = await importVapidPrivateKey(b64uDecode(map.vapid_private), b64uDecode(map.vapid_public))
  vapidPubRaw = b64uDecode(map.vapid_public)
  vapidSubject = map.vapid_subject
}

async function pushToSubs(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: string,
): Promise<{ sent: number; failed: number; details: unknown[] }> {
  let sent = 0
  let failed = 0
  const details: unknown[] = []
  const toDelete: string[] = []
  for (const s of subs) {
    try {
      const r = await sendWebPush(s, payload, vapidPrivKey!, vapidPubRaw!, vapidSubject!)
      if (r.ok) {
        sent++
        details.push({ id: s.id, ok: true, status: r.status })
      } else {
        failed++
        details.push({ id: s.id, ok: false, status: r.status, body: r.body })
        if (r.status === 404 || r.status === 410) toDelete.push(s.id)
      }
    } catch (e) {
      failed++
      details.push({ id: s.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  if (toDelete.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', toDelete)
  }
  return { sent, failed, details }
}

async function fetchSubsForUsers(userIds: string[]) {
  if (userIds.length === 0) return []
  // Filtre les users avec push_enabled = true
  const { data: profs } = await supabase
    .from('profiles')
    .select('id')
    .in('id', userIds)
    .eq('push_enabled', true)
  const allowedIds = (profs || []).map((p) => p.id)
  if (allowedIds.length === 0) return []
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', allowedIds)
  return subs || []
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const debugMode = url.searchParams.get('debug') === '1'
  try {
    await loadVapid()

    const now = new Date()
    const winStart = new Date(now.getTime() - 2 * 60_000).toISOString()
    const winEnd = new Date(now.getTime() + 2 * 60_000).toISOString()
    // Fenêtre J-1 (24h avant l'échéance, ±2 min)
    const j1Start = new Date(now.getTime() + 24 * 3600_000 - 2 * 60_000).toISOString()
    const j1End = new Date(now.getTime() + 24 * 3600_000 + 2 * 60_000).toISOString()

    const out: Record<string, unknown> = {
      ok: true,
      now: now.toISOString(),
      tasks: { matched: 0, sent: 0, failed: 0 } as Record<string, unknown>,
      insights: { matched: 0, sent: 0, failed: 0 } as Record<string, unknown>,
    }

    /* ----- Tâches : rappel J-1 ----- */
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, description, due_at, assigned_to, created_by, priority')
      .neq('status', 'done')
      .eq('reminder_sent', false)
      .not('due_at', 'is', null)
      .gte('due_at', j1Start)
      .lte('due_at', j1End)

    ;(out.tasks as Record<string, number>).matched = (tasks || []).length

    for (const t of tasks || []) {
      const targets = new Set<string>()
      if (t.assigned_to) targets.add(t.assigned_to)
      if (t.created_by) targets.add(t.created_by)
      const subs = await fetchSubsForUsers([...targets])
      if (subs.length === 0) continue

      const due = new Date(t.due_at)
      const dueLabel = due.toLocaleString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Paris',
      })
      const prio = t.priority === 'critical' ? 'CRITIQUE' : t.priority === 'important' ? 'Important' : 'Tranquille'
      const payload = JSON.stringify({
        notification: {
          title: `📌 ${prio} — ${t.title}`,
          body: t.description ? `${dueLabel} · ${t.description}` : `Échéance ${dueLabel}`,
          icon: '/icon.svg',
          tag: `task-${t.id}`,
        },
        data: { url: '/tasks', id: t.id },
      })
      const res = await pushToSubs(subs, payload)
      ;(out.tasks as Record<string, number>).sent += res.sent
      ;(out.tasks as Record<string, number>).failed += res.failed
      if (debugMode) (out.tasks as Record<string, unknown>).details = res.details
      await supabase.from('tasks').update({ reminder_sent: true }).eq('id', t.id)
    }

    /* ----- Insights récents (warning/danger) ----- */
    const { data: insights } = await supabase
      .from('insights')
      .select('id, kind, tone, title, body, meta, created_at')
      .in('tone', ['warning', 'danger'])
      .gte('created_at', winStart)
      .lte('created_at', winEnd)

    ;(out.insights as Record<string, number>).matched = (insights || []).length

    for (const i of insights || []) {
      // Push aux owners + admins seulement
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['owner', 'admin'])
      const subs = await fetchSubsForUsers((admins || []).map((a) => a.id))
      if (subs.length === 0) continue
      const payload = JSON.stringify({
        notification: {
          title: `${i.tone === 'danger' ? '🚨' : '⚠️'} ${i.title}`,
          body: i.body || '',
          icon: '/icon.svg',
          tag: `insight-${i.id}`,
        },
        data: { url: '/', id: i.id },
      })
      const res = await pushToSubs(subs, payload)
      ;(out.insights as Record<string, number>).sent += res.sent
      ;(out.insights as Record<string, number>).failed += res.failed
    }

    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[send-reminders] FATAL', err)
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
