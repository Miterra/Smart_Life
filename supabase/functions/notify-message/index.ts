// ============================================================
//  Edge Function : notify-message
//
//  Push "façon WhatsApp" : à chaque nouveau message inséré dans
//  public.messages, un trigger (notify_new_message) appelle cette
//  fonction via pg_net avec { message_id }.
//
//  On notifie tous les membres du groupe SAUF :
//    - l'expéditeur
//    - ceux dont push_enabled = false
//    - ceux qui ont mute le groupe OU l'expéditeur (table public.mutes)
//
//  Garde-fou : on ignore les messages de plus de 2 min (anti-rejeu),
//  et le tag de notif = group-<id> pour regrouper les messages.
//
//  verify_jwt:false — appelée par le trigger DB (comme send-reminders).
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

Deno.serve(async (req: Request) => {
  try {
    const { message_id } = await req.json().catch(() => ({}))
    if (!message_id) return json({ ok: false, error: 'message_id required' }, 400)

    // 1) Message
    const { data: msg } = await supabase
      .from('messages')
      .select('id, group_id, user_id, body, attachment_type, created_at')
      .eq('id', message_id)
      .single()
    if (!msg) return json({ ok: true, skipped: 'message not found' })

    // Anti-rejeu : on ignore au-delà de 2 min
    if (Date.now() - new Date(msg.created_at).getTime() > 120_000) {
      return json({ ok: true, skipped: 'stale' })
    }

    // 2) Groupe + expéditeur
    const [{ data: group }, { data: sender }] = await Promise.all([
      supabase.from('groups').select('id, name').eq('id', msg.group_id).single(),
      supabase.from('profiles').select('id, full_name, email').eq('id', msg.user_id).single(),
    ])

    // 3) Membres du groupe sauf l'expéditeur
    const { data: members } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', msg.group_id)
      .neq('user_id', msg.user_id)
    let targetIds = (members || []).map((m) => m.user_id as string)
    if (targetIds.length === 0) return json({ ok: true, recipients: 0 })

    // 4) Exclure ceux qui ont mute ce groupe OU l'expéditeur
    const { data: mutes } = await supabase
      .from('mutes')
      .select('user_id, group_id, muted_user_id')
      .in('user_id', targetIds)
    const mutedSet = new Set<string>()
    for (const mu of mutes || []) {
      if (mu.group_id === msg.group_id || mu.muted_user_id === msg.user_id) mutedSet.add(mu.user_id)
    }
    targetIds = targetIds.filter((id) => !mutedSet.has(id))
    if (targetIds.length === 0) return json({ ok: true, recipients: 0, allMuted: true })

    // 5) push_enabled = true
    const { data: profs } = await supabase
      .from('profiles')
      .select('id')
      .in('id', targetIds)
      .eq('push_enabled', true)
    const allowed = (profs || []).map((p) => p.id as string)
    if (allowed.length === 0) return json({ ok: true, recipients: 0 })

    // 6) Subscriptions
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', allowed)
    if (!subs || subs.length === 0) return json({ ok: true, recipients: 0 })

    await loadVapid()

    const senderName = sender?.full_name || sender?.email?.split('@')[0] || 'Quelqu\'un'
    const groupName = group?.name || 'Groupe'
    // Corps : texte du message, ou libellé de la pièce jointe si message sans texte.
    const trimmed = (msg.body || '').trim()
    let text: string
    if (trimmed) text = trimmed.slice(0, 140)
    else if (msg.attachment_type === 'image') text = '📷 Photo'
    else if (msg.attachment_type === 'pdf') text = '📄 PDF'
    else if (msg.attachment_type) text = '📎 Fichier'
    else text = ''
    const payload = JSON.stringify({
      notification: {
        title: groupName,
        body: `${senderName}: ${text}`,
        icon: '/pwa-192x192.png',
        tag: `group-${msg.group_id}`,
      },
      data: { url: '/groups', groupId: msg.group_id },
    })

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

    return json({ ok: true, recipients: subs.length, sent, failed })
  } catch (err) {
    console.error('[notify-message] FATAL', err)
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
