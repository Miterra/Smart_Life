import { useState } from 'react'
import { initialsFor, colorFor, classNames } from '../lib/utils'

/**
 * Avatar — affiche la photo de profil (avatar_url) si disponible,
 * sinon un cercle coloré avec les initiales.
 *
 * Props :
 *   profile   : { full_name, email, avatar_url, avatar_color, id }
 *   size      : diamètre en px (def. 40)
 *   className : classes additionnelles
 *   ring      : ajoute un léger anneau
 */
export default function Avatar({ profile, size = 40, className = '', ring = false }) {
  const [broken, setBroken] = useState(false)
  const name = profile?.full_name || profile?.email || ''
  const url = profile?.avatar_url
  const bg = profile?.avatar_color || colorFor(profile?.id || name)
  const style = { width: size, height: size }
  const fontSize = Math.max(10, Math.round(size * 0.38))

  const base = classNames(
    'rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 select-none',
    ring && 'ring-2 ring-white/15',
    className,
  )

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name}
        style={style}
        onError={() => setBroken(true)}
        className={classNames(base, 'object-cover')}
        loading="lazy"
      />
    )
  }

  return (
    <div className={classNames(base, 'font-bold text-ink-950')} style={{ ...style, background: bg }}>
      <span style={{ fontSize }}>{initialsFor(name)}</span>
    </div>
  )
}
