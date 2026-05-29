/**
 * gen-icons.cjs — génère les icônes PWA en PNG opaque plein-cadre.
 *
 * Aucune dépendance externe : encodeur PNG maison (zlib natif) + rendu
 * pixel par pixel du croissant avec supersampling (anti-aliasing).
 *
 * Pourquoi : un apple-touch-icon en SVG (ou un PNG avec des bords
 * transparents) affiche une bordure / tuile blanche sur l'écran d'accueil.
 * On produit donc des PNG 100 % opaques, bord à bord.
 *
 * Usage : node scripts/gen-icons.cjs
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const OUT_DIR = path.join(__dirname, '..', 'public')

/* ----------------------------- Encodeur PNG ----------------------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------- Helpers couleur --------------------------- */
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
function grad3(t, s0, s1, s2, p) {
  if (t <= 0) return s0
  if (t >= 1) return s2
  return t < p ? mix(s0, s1, t / p) : mix(s1, s2, (t - p) / (1 - p))
}

const BG = [11, 15, 26] // #0b0f1a
const GLOW = [192, 38, 211] // #c026d3
const CRESCENT = [
  [124, 58, 237], // #7c3aed
  [192, 38, 211], // #c026d3
  [232, 121, 249], // #e879f9
]
const DOT = [
  [255, 255, 255],
  [245, 208, 254], // #f5d0fe
  [232, 121, 249],
]

/* ------------------------------ Rendu ---------------------------------- */
// scale : fraction du dessin (1 = plein, <1 = marge pour les icônes maskable)
function renderIcon(size, scale = 1) {
  const SS = 4 // supersampling 4x4
  const buf = Buffer.alloc(size * size * 4)

  const R = 0.3 * scale
  const HW = 0.072 * scale
  const DOTR = 0.072 * scale
  const GLOWR = 0.06 * scale
  const capRad = (55 * Math.PI) / 180
  const capX = 0.5 + R * Math.cos(capRad)
  const capTopY = 0.5 - R * Math.sin(capRad)
  const capBotY = 0.5 + R * Math.sin(capRad)

  const sample = (nx, ny) => {
    const dx = nx - 0.5
    const dy = ny - 0.5
    const d = Math.hypot(dx, dy)
    const angDeg = (Math.atan2(-dy, dx) * 180) / Math.PI
    const inGap = Math.abs(angDeg) < 55
    const inBand = d >= R - HW && d <= R + HW
    const inArc = inBand && !inGap

    const dTop = Math.hypot(nx - capX, ny - capTopY)
    const dBot = Math.hypot(nx - capX, ny - capBotY)
    const inCap = dTop <= HW || dBot <= HW
    const crescent = inArc || inCap

    // dot central
    if (d <= DOTR) return grad3(d / DOTR, DOT[0], DOT[1], DOT[2], 0.45)

    if (crescent) {
      const t = (nx + ny) / 2
      return grad3(t, CRESCENT[0], CRESCENT[1], CRESCENT[2], 0.55)
    }

    // glow doux autour du croissant
    const sdBand = inGap ? Infinity : Math.abs(d - R) - HW
    const sdCap = Math.min(dTop, dBot) - HW
    const sd = Math.min(sdBand, sdCap)
    if (sd > 0 && sd < GLOWR) {
      const a = Math.pow(1 - sd / GLOWR, 2) * 0.6
      return mix(BG, GLOW, a)
    }
    return BG
  }

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (px + (sx + 0.5) / SS) / size
          const ny = (py + (sy + 0.5) / SS) / size
          const c = sample(nx, ny)
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const n = SS * SS
      const o = (py * size + px) * 4
      buf[o] = Math.round(r / n)
      buf[o + 1] = Math.round(g / n)
      buf[o + 2] = Math.round(b / n)
      buf[o + 3] = 255 // opaque, plein cadre
    }
  }
  return buf
}

/* ------------------------------ Sortie --------------------------------- */
const targets = [
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
  { file: 'pwa-192x192.png', size: 192, scale: 1 },
  { file: 'pwa-512x512.png', size: 512, scale: 1 },
  { file: 'maskable-512x512.png', size: 512, scale: 0.82 },
]

for (const t of targets) {
  const rgba = renderIcon(t.size, t.scale)
  const png = encodePNG(t.size, t.size, rgba)
  fs.writeFileSync(path.join(OUT_DIR, t.file), png)
  console.log(`✓ ${t.file} (${t.size}x${t.size}, ${(png.length / 1024).toFixed(1)} KB)`)
}
console.log('Icônes générées dans public/.')
