import { useState } from 'react'
import { initialsFor, colorFor, classNames } from '../lib/utils'
import { usePresence } from '../lib/presence'

/**
 * Avatar — affiche la photo de profil (avatar_url) si disponible,
 * sinon un cercle coloré avec les initiales.
 *
 * Props :
 *   profile      : { full_name, email, avatar_url, avatar_color, id }
 *   size         : diamètre en px (def. 40)
 *   className    : classes additionnelles
 *   ring         : ajoute un léger anneau
 *   showPresence : affiche une pastille en ligne / hors ligne
 */
export default function Avatar({ profile, size = 40, className = '', ring = false, showPresence = false }) {
  const [broken, setBroken] = useState(false)
  const { isOnline } = usePresence()
  const name = profile?.full_name || profile?.email || ''
  const url = profile?.avatar_url
  const bg = profile?.avatar_color || colorFor(profile?.id || name)
  const style = { width: size, height: size }
  const fontSize = Math.max(10, Math.round(size * 0.38))

  const base = classNames(
    'rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 select-none',
    ring && 'ring-2 ring-fg/15',
    className,
  )

  const inner =
    url && !broken ? (
      <img
        src={url}
        alt={name}
        style={style}
        onError={() => setBroken(true)}
        className={classNames(base, 'object-cover')}
        loading="lazy"
      />
    ) : (
      <div className={classNames(base, 'font-bold text-ink-950')} style={{ ...style, background: bg }}>
        <span style={{ fontSize }}>{initialsFor(name)}</span>
      </div>
    )

  if (!showPresence || !profile?.id) return inner

  const online = isOnline(profile.id)
  const dot = Math.max(8, Math.min(16, Math.round(size * 0.28)))
  return (
    <span className="relative inline-flex flex-shrink-0" style={style}>
      {inner}
      <span
        className={classNames(
          'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-ink-950',
          online ? 'bg-emerald-400' : 'bg-ink-500',
        )}
        style={{ width: dot, height: dot }}
        title={online ? 'En ligne' : 'Hors ligne'}
      />
    </span>
  )
}
