// ============================================================
//  Edge Function : notify-assignment
//
//  Push immédiat quand une tâche ou un RDV est assigné à quelqu'un.
//  Déclenchée par les triggers DB notify_task_assignment /
//  notify_appointment_assignment (pg_net) avec { type, id }.
//
//  On notifie UNIQUEMENT l'assigné, et seulement si :
//    - assigned_to est défini,
//    - ce n'est pas une auto-assignation (assigned_to <> created_by),
//    - l'assigné a push_enabled = true,
//    - la ligne a été créée/modifiée il y a moins de 5 min (anti-rejeu).
//
//  verify_jwt:false — appelée par un trigger DB (comme notify-message).
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
  const claims = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject }
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
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, baseKey, length * 8)
  return new Uint8Array(bits)
}

/* ---------- Chiffrement aes128gcm (RFC 8291) ---------- */
interface EncryptedPayload { ciphertext: Uint8Array; salt: Uint8Array; serverPublicRaw: Uint8Array }

async function encryptPayload(payload: Uint8Array, p256dh: Uint8Array, auth: Uint8Array): Promise<EncryptedPayload> {
  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
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

  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPub }, serverKeyPair.privateKey, 256)
  const sharedSecret = new Uint8Array(sharedBits)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const keyInfo = concat(new TextEncoder().encode('WebPush: info\0'), p256dh, serverPublicRaw)
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
): Promise<{ ok: boolean; status: number }> {
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
  return { ok: res.ok, status: res.status }
}

/* ============================================================
 *  Entrypoint
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

function frDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
}

Deno.serve(async (req: Request) => {
  try {
    const { type, id } = await req.json().catch(() => ({}))
    if (!id || (type !== 'task' && type !== 'appointment')) {
      return json({ ok: false, error: 'type (task|appointment) + id required' }, 400)
    }

    // 1) Charger la ligne concernée
    const table = type === 'task' ? 'tasks' : 'appointments'
    const cols = type === 'task'
      ? 'id, title, description, due_at, assigned_to, created_by, priority, created_at, updated_at'
      : 'id, title, description, location, start_at, assigned_to, created_by, created_at, updated_at'
    const { data: row } = await supabase.from(table).select(cols).eq('id', id).single()
    if (!row) return json({ ok: true, skipped: 'not found' })

    // Anti-rejeu : on ignore si la dernière création/modif date de + de 5 min
    const ts = Math.max(
      row.created_at ? new Date(row.created_at).getTime() : 0,
      row.updated_at ? new Date(row.updated_at).getTime() : 0,
    )
    if (ts && Date.now() - ts > 5 * 60_000) return json({ ok: true, skipped: 'stale' })

    if (!row.assigned_to) return json({ ok: true, skipped: 'no assignee' })
    if (row.assigned_to === row.created_by) return json({ ok: true, skipped: 'self-assignment' })

    // 2) L'assigné a-t-il accepté les push ?
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, push_enabled')
      .eq('id', row.assigned_to)
      .single()
    if (!prof || prof.push_enabled === false) return json({ ok: true, recipients: 0 })

    // 3) Ses devices
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', row.assigned_to)
    if (!subs || subs.length === 0) return json({ ok: true, recipients: 0 })

    await loadVapid()

    // 4) Construire la notification
    let payload: string
    if (type === 'task') {
      const prio = row.priority === 'critical' ? 'CRITIQUE' : row.priority === 'important' ? 'Important' : null
      let body = `« ${row.title} »`
      if (row.due_at) body += ` · échéance ${frDate(row.due_at)}`
      payload = JSON.stringify({
        notification: {
          title: prio ? `✅ Nouvelle tâche — ${prio}` : '✅ Une tâche t\'est assignée',
          body,
          icon: '/icon.svg',
          tag: `assign-task-${row.id}`,
        },
        data: { url: '/tasks', id: row.id },
      })
    } else {
      let body = `« ${row.title} »`
      if (row.start_at) body += ` · ${frDate(row.start_at)}`
      if (row.location) body += ` · ${row.location}`
      payload = JSON.stringify({
        notification: {
          title: '📅 Un rendez-vous t\'est assigné',
          body,
          icon: '/icon.svg',
          tag: `assign-appt-${row.id}`,
        },
        data: { url: '/calendar', id: row.id },
      })
    }

    // 5) Envoi
    let sent = 0
    let failed = 0
    const toDelete: string[] = []
    for (const s of subs) {
      try {
        const r = await sendWebPush(s, payload, vapidPrivKey!, vapidPubRaw!, vapidSubject!)
        if (r.ok) sent++
        else {
          failed++
          if (r.status === 404 || r.status === 410) toDelete.push(s.id)
        }
      } catch {
        failed++
      }
    }
    if (toDelete.length > 0) await supabase.from('push_subscriptions').delete().in('id', toDelete)

    return json({ ok: true, type, recipients: subs.length, sent, failed })
  } catch (err) {
    console.error('[notify-assignment] FATAL', err)
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
