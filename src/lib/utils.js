import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'

export function fmtDate(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return format(date, "EEE d MMM 'à' HH'h'mm", { locale: fr })
}

export function fmtShort(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isToday(date)) return `Aujourd'hui · ${format(date, 'HH:mm')}`
  if (isTomorrow(date)) return `Demain · ${format(date, 'HH:mm')}`
  if (isYesterday(date)) return `Hier · ${format(date, 'HH:mm')}`
  return format(date, "d MMM · HH:mm", { locale: fr })
}

export function fmtRel(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return formatDistanceToNow(date, { addSuffix: true, locale: fr })
}

export function classNames(...arr) {
  return arr.filter(Boolean).join(' ')
}

export const PRIORITY = {
  critical: { label: 'Critique', cls: 'bg-rose-500/15 text-neon-rose border-rose-500/30' },
  important: { label: 'Important', cls: 'bg-amber-500/15 text-neon-amber border-amber-500/30' },
  chill: { label: 'Tranquille', cls: 'bg-cyan-500/15 text-neon-cyan border-cyan-500/30' },
}

export const STATUS = {
  todo: { label: 'À faire', cls: 'bg-fg/10 text-ink-300 border-fg/15' },
  in_progress: { label: 'En cours', cls: 'bg-amber-500/15 text-neon-amber border-amber-500/30' },
  done: { label: 'Terminé', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
}

export function initialsFor(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

const COLORS = ['#22d3ee', '#e879f9', '#a3e635', '#fbbf24', '#fb7185', '#60a5fa', '#34d399']
export function colorFor(seed = '') {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}
