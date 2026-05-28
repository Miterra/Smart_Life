// Génère une paire de clés VAPID (P-256) pour Web Push.
// Usage : `npm run gen:vapid`
const crypto = require('crypto')

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
})

function urlBase64(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const pubJwk = publicKey.export({ format: 'jwk' })
const xBuf = Buffer.from(pubJwk.x, 'base64')
const yBuf = Buffer.from(pubJwk.y, 'base64')
const pubRaw = Buffer.concat([Buffer.from([0x04]), xBuf, yBuf])

const privJwk = privateKey.export({ format: 'jwk' })
const dBuf = Buffer.from(privJwk.d, 'base64')

console.log('')
console.log('=== VAPID keys ===')
console.log('VAPID_PUBLIC=' + urlBase64(pubRaw))
console.log('VAPID_PRIVATE=' + urlBase64(dBuf))
console.log('')
console.log('Étapes :')
console.log('1. Ajoute VAPID_PUBLIC à .env.local en VITE_VAPID_PUBLIC_KEY')
console.log("2. Stocke les 3 valeurs dans Supabase via la migration `private.app_secrets` :")
console.log("   insert into private.app_secrets values ('vapid_public', '...'), ('vapid_private', '...'), ('vapid_subject', 'mailto:tu@example.com');")
console.log('')
