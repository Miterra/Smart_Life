import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  History as HistoryIcon,
  CheckSquare,
  CheckCircle2,
  Trash2,
  CalendarPlus,
  MessagesSquare,
  Pencil,
  Users,
  Tag,
  CalendarRange,
  UserMinus,
  UserPlus,
  ShieldCheck,
  Shield,
  Activity,
  Eraser,
} from 'lucide-react'
import { listActivity, deleteActivity, clearActivity, subscribeRealtime } from '../lib/repository'
import { isAdminOrOwner, isOwner } from '../lib/roles'
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

/** action → icône + couleur */
const ACTION_META = {
  'task.create': { icon: CheckSquare, color: '#22d3ee' },
  'task.done': { icon: CheckCircle2, color: '#34d399' },
  'task.delete': { icon: Trash2, color: '#fb7185' },
  'appointment.create': { icon: CalendarPlus, color: '#22d3ee' },
  'appointment.delete': { icon: Trash2, color: '#fb7185' },
  'group.create': { icon: MessagesSquare, color: '#e879f9' },
  'group.rename': { icon: Pencil, color: '#c084fc' },
  'group.delete': { icon: Trash2, color: '#fb7185' },
  'group.members': { icon: Users, color: '#60a5fa' },
  'category.create': { icon: Tag, color: '#a3e635' },
  'category.delete': { icon: Trash2, color: '#fb7185' },
  'period.create': { icon: CalendarRange, color: '#fbbf24' },
  'period.delete': { icon: Trash2, color: '#fb7185' },
  'member.create': { icon: UserPlus, color: '#34d399' },
  'member.delete': { icon: UserMinus, color: '#fb7185' },
  'role.change': { icon: ShieldCheck, color: '#fbbf24' },
}

export default function History({ profile }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const owner = isOwner(profile.role)

  const refresh = async () => {
    setErr('')
    try {
      const data = await listActivity(150)
      setRows(data)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Suppression réservée au owner (RLS). Mise à jour optimiste + refresh de secours.
  const removeRow = async (id) => {
    if (!confirm('Supprimer cette entrée de l\'historique ?')) return
    setRows((r) => r.filter((x) => x.id !== id))
    try {
      await deleteActivity(id)
    } catch (e) {
      setErr(e.message)
      refresh()
    }
  }

  const clearAll = async () => {
    if (!confirm('Effacer TOUT l\'historique ? Cette action est irréversible.')) return
    setRows([])
    try {
      await clearActivity()
    } catch (e) {
      setErr(e.message)
      refresh()
    }
  }

  useEffect(() => {
    refresh()
    const sub = subscribeRealtime(['activity_log'], refresh)
    return () => sub.unsubscribe()
  }, [])

  if (!isAdminOrOwner(profile.role)) {
    return (
      <div className="card p-8 text-center">
        <Shield className="w-10 h-10 text-ink-400 mx-auto mb-3" />
        <p className="text-sm text-ink-300">Accès réservé aux administrateurs.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="heading text-2xl">Historique</h1>
          <p className="text-xs text-ink-400 mt-1">
            Toutes les actions de l'équipe, des plus récentes aux plus anciennes.
          </p>
        </div>
        {owner && rows.length > 0 && (
          <button
            onClick={clearAll}
            className="btn-ghost text-rose-300 flex-shrink-0 px-2.5 py-2"
            title="Tout effacer"
          >
            <Eraser className="w-4 h-4" />
          </button>
        )}
      </div>

      {err && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
          {err}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-ink-800/40 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center">
          <Activity className="w-10 h-10 text-ink-500 mx-auto mb-3" />
          <p className="text-sm text-ink-300">Aucune activité enregistrée pour l'instant.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => {
              const prev = rows[i - 1]
              const showDay = !prev || !sameDay(prev.created_at, r.created_at)
              return (
                <Row key={r.id} row={r} showDay={showDay} canDelete={owner} onDelete={removeRow} />
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function Row({ row, canDelete, onDelete, showDay }) {
  const meta = ACTION_META[row.action] || { icon: HistoryIcon, color: '#94a3b8' }
  const Icon = meta.icon
  const actor = row.actor_name || 'Quelqu’un'
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
    >
      {showDay && <DayDivider date={row.created_at} />}
      <div className="card p-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: meta.color + '22' }}
          >
            <Icon className="w-4 h-4" style={{ color: meta.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink-100 leading-snug">
              <span className="font-semibold text-white">{actor}</span> {row.summary}
            </p>
            <p className="text-[11px] text-ink-500 mt-0.5">
              {format(new Date(row.created_at), 'HH:mm')} ·{' '}
              {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: fr })}
            </p>
          </div>
          {canDelete && (
            <button
              onClick={() => onDelete(row.id)}
              className="text-ink-500 hover:text-rose-400 p-1 flex-shrink-0"
              title="Supprimer cette entrée"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.li>
  )
}

function DayDivider({ date }) {
  return (
    <div className="flex items-center gap-2 my-2 first:mt-0">
      <div className="flex-1 h-px bg-white/5" />
      <span className="text-[10px] uppercase tracking-widest text-ink-500">{dayLabel(date)}</span>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  )
}

function sameDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function dayLabel(d) {
  const date = new Date(d)
  if (isToday(date)) return "Aujourd'hui"
  if (isYesterday(date)) return 'Hier'
  return format(date, 'EEEE d MMMM', { locale: fr })
}
