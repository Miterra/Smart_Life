import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalIcon,
  Clock,
  Plus,
  MapPin,
  Plane,
  Trash2,
  Edit3,
  X,
  CalendarClock,
} from 'lucide-react'
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  listTasks,
  listAppointments,
  listPeriods,
  listProfiles,
  listGroups,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  createPeriod,
  updatePeriod,
  deletePeriod,
  subscribeRealtime,
} from '../lib/repository'
import { classNames, initialsFor, colorFor } from '../lib/utils'
import {
  canCreateAppointments,
  canCreatePeriods,
  canEditAppointment,
  canDeleteAppointment,
  canAssignAnyone,
  ROLES,
} from '../lib/roles'

const PERIOD_COLORS = [
  '#a78bfa', '#22d3ee', '#fbbf24', '#fb7185', '#34d399',
  '#60a5fa', '#f472b6', '#a3e635', '#fb923c', '#e879f9',
]

function dayStr(d) {
  return format(d, 'yyyy-MM-dd')
}
function dayInPeriod(d, p) {
  const s = dayStr(d)
  return s >= p.start_date && s <= p.end_date
}
function periodOverlapsMonth(p, month) {
  const ms = dayStr(startOfMonth(month))
  const me = dayStr(endOfMonth(month))
  return p.start_date <= me && p.end_date >= ms
}

export default function Calendar({ profile }) {
  const [month, setMonth] = useState(new Date())
  const [tasks, setTasks] = useState([])
  const [appointments, setAppointments] = useState([])
  const [periods, setPeriods] = useState([])
  const [profiles, setProfiles] = useState([])
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(new Date())
  const [menuOpen, setMenuOpen] = useState(false)
  const [rdvForm, setRdvForm] = useState(null) // {initial} | null
  const [periodForm, setPeriodForm] = useState(null)
  const [loadErr, setLoadErr] = useState('')

  const refresh = async () => {
    setLoadErr('')
    try {
      const [t, a, pr, pf, g] = await Promise.all([
        listTasks(),
        listAppointments(),
        listPeriods(),
        listProfiles(),
        listGroups(),
      ])
      setTasks(t)
      setAppointments(a)
      setPeriods(pr)
      setProfiles(pf)
      setGroups(g)
      setLoadErr('')
    } catch (e) {
      console.error(e)
      setLoadErr('Impossible de charger l’agenda.')
    }
  }

  useEffect(() => {
    refresh()
    const sub = subscribeRealtime(['tasks', 'appointments', 'periods'], refresh)
    return () => sub.unsubscribe()
  }, [])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const tasksByDay = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      if (!t.due_at) continue
      const key = new Date(t.due_at).toDateString()
      ;(map[key] = map[key] || []).push(t)
    }
    return map
  }, [tasks])

  const rdvByDay = useMemo(() => {
    const map = {}
    for (const a of appointments) {
      const key = new Date(a.start_at).toDateString()
      ;(map[key] = map[key] || []).push(a)
    }
    return map
  }, [appointments])

  const canRdv = canCreateAppointments(profile.role)
  const canPeriod = canCreatePeriods(profile.role)

  const selKey = selected.toDateString()
  const selTasks = tasksByDay[selKey] || []
  const selRdv = (rdvByDay[selKey] || []).sort((a, b) => a.start_at.localeCompare(b.start_at))
  const selPeriods = periods.filter((p) => dayInPeriod(selected, p))

  const openNewRdv = () => {
    setMenuOpen(false)
    const start = new Date(selected)
    start.setHours(9, 0, 0, 0)
    setRdvForm({ initial: null, defaultStart: start })
  }
  const openNewPeriod = () => {
    setMenuOpen(false)
    setPeriodForm({ initial: null, defaultStart: selected })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading text-2xl">Agenda</h1>
          <p className="text-xs text-ink-400 mt-1 capitalize">
            {format(month, 'MMMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Mois précédent"
            className="btn-ghost p-2"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setMonth(new Date())
              setSelected(new Date())
            }}
            className="text-xs uppercase tracking-widest text-ink-300 px-2"
          >
            Auj.
          </button>
          <button
            aria-label="Mois suivant"
            className="btn-ghost p-2"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {(canRdv || canPeriod) && (
            <div className="relative">
              <button
                aria-label="Ajouter un rendez-vous"
                onClick={() => setMenuOpen((o) => !o)}
                className="btn-primary ml-1 px-3"
              >
                <Plus className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      className="absolute right-0 mt-2 z-50 glass-strong rounded-xl border border-fg/10 p-1.5 w-44 shadow-card"
                    >
                      {canRdv && (
                        <button
                          onClick={openNewRdv}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-fg hover:bg-fg/5"
                        >
                          <CalendarClock className="w-4 h-4 text-neon-cyan" /> Nouveau RDV
                        </button>
                      )}
                      {canPeriod && (
                        <button
                          onClick={openNewPeriod}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-fg hover:bg-fg/5"
                        >
                          <Plane className="w-4 h-4 text-neon-magenta" /> Nouvelle période
                        </button>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Légende périodes du mois */}
      {periods.filter((p) => periodOverlapsMonth(p, month)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {periods
            .filter((p) => periodOverlapsMonth(p, month))
            .map((p) => (
              <button
                key={p.id}
                onClick={() => canPeriod && setPeriodForm({ initial: p })}
                className="chip border bg-fg/5 border-fg/10 text-ink-200"
                style={{ color: p.color, borderColor: `${p.color}55` }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                {p.title}
              </button>
            ))}
        </div>
      )}

      {loadErr && (
        <div className="card p-3 flex items-center justify-between gap-3 border-l-2 border-neon-rose">
          <p className="text-xs text-rose-300">{loadErr}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={refresh}
              className="text-[10px] uppercase tracking-widest text-neon-cyan font-bold px-2"
            >
              Réessayer
            </button>
            <button
              onClick={() => setLoadErr('')}
              aria-label="Masquer l’erreur"
              className="text-ink-400 hover:text-fg p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* PC : grille du mois à gauche, détail du jour à droite (sticky). */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5 lg:items-start">
      <div className="card p-3 lg:p-4">
        <div className="grid grid-cols-7 gap-0.5 mb-1.5 text-[10px] uppercase tracking-widest text-ink-400 text-center">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((d) => {
            const inMonth = isSameMonth(d, month)
            const isSel = isSameDay(d, selected)
            const today = isToday(d)
            const dayTasks = tasksByDay[d.toDateString()] || []
            const dayRdv = rdvByDay[d.toDateString()] || []
            const dayPeriods = periods.filter((p) => dayInPeriod(d, p))
            const taskColors = [...new Set(dayTasks.map((t) => t.priority))]
            return (
              <motion.button
                key={d.toISOString()}
                whileTap={{ scale: 0.92 }}
                onClick={() => setSelected(d)}
                className={classNames(
                  'aspect-square rounded-lg flex flex-col items-center justify-start pt-1 relative overflow-hidden transition',
                  inMonth ? 'text-fg' : 'text-ink-500',
                  isSel && 'bg-neon-cyan/20 ring-1 ring-neon-cyan/50',
                  !isSel && today && 'bg-fg/10',
                  !isSel && !today && 'hover:bg-fg/5',
                )}
              >
                <span className={classNames('text-xs font-semibold', today && 'text-neon-cyan')}>
                  {format(d, 'd')}
                </span>
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center px-0.5">
                  {taskColors.slice(0, 3).map((p, i) => (
                    <span key={`t${i}`} className={classNames('w-1 h-1 rounded-full', priorityDot(p))} />
                  ))}
                  {dayRdv.length > 0 && (
                    <span className="w-1 h-1 rounded-full bg-neon-magenta" />
                  )}
                </div>
                {dayPeriods.length > 0 && (
                  <div className="absolute bottom-0.5 inset-x-0.5 flex flex-col gap-px">
                    {dayPeriods.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        className="h-[3px] rounded-full"
                        style={{ background: p.color }}
                      />
                    ))}
                  </div>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Détail du jour */}
      <div className="space-y-3 lg:sticky lg:top-8">
        <div className="flex items-center gap-2 px-1">
          <CalIcon className="w-4 h-4 text-neon-cyan" />
          <h2 className="heading text-sm font-bold uppercase tracking-wider capitalize">
            {format(selected, 'EEEE d MMMM', { locale: fr })}
          </h2>
        </div>

        {selPeriods.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selPeriods.map((p) => (
              <span
                key={p.id}
                className="chip border"
                style={{ color: p.color, borderColor: `${p.color}55`, background: `${p.color}1a` }}
              >
                <Plane className="w-3 h-3" /> {p.title}
              </span>
            ))}
          </div>
        )}

        {selRdv.length === 0 && selTasks.length === 0 && selPeriods.length === 0 ? (
          <div className="card p-5 text-center text-sm text-ink-400">Rien de prévu ce jour.</div>
        ) : (
          <ul className="space-y-2">
            {selRdv.map((a) => (
              <RdvRow
                key={a.id}
                rdv={a}
                profile={profile}
                profiles={profiles}
                onEdit={() => setRdvForm({ initial: a })}
                onChange={refresh}
              />
            ))}
            {selTasks.map((t) => (
              <DayTask key={t.id} task={t} profiles={profiles} />
            ))}
          </ul>
        )}
      </div>
      </div>

      <AnimatePresence>
        {rdvForm && (
          <RdvForm
            initial={rdvForm.initial}
            defaultStart={rdvForm.defaultStart}
            profile={profile}
            profiles={profiles}
            groups={groups}
            onClose={() => setRdvForm(null)}
            onSaved={() => {
              setRdvForm(null)
              refresh()
            }}
          />
        )}
        {periodForm && (
          <PeriodForm
            initial={periodForm.initial}
            defaultStart={periodForm.defaultStart || selected}
            month={month}
            periods={periods}
            profile={profile}
            onClose={() => setPeriodForm(null)}
            onSaved={() => {
              setPeriodForm(null)
              refresh()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function RdvRow({ rdv, profile, profiles, onEdit, onChange }) {
  const assignee = profiles.find((p) => p.id === rdv.assigned_to)
  const canEdit = canEditAppointment(profile.role, rdv, profile.id)
  const canDel = canDeleteAppointment(profile.role, rdv, profile.id)
  const remove = async () => {
    if (!confirm('Supprimer ce rendez-vous ?')) return
    await deleteAppointment(rdv.id)
    onChange()
  }
  return (
    <li className="card p-3 flex items-start gap-3 border-l-2 border-neon-magenta">
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-fg">{rdv.title}</p>
          <div className="flex items-center gap-1">
            {canEdit && (
              <button
                aria-label="Modifier le rendez-vous"
                onClick={onEdit}
                className="text-ink-400 hover:text-fg p-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
            {canDel && (
              <button
                aria-label="Supprimer le rendez-vous"
                onClick={remove}
                className="text-ink-400 hover:text-rose-400 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        {rdv.description && <p className="text-xs text-ink-300 mt-1">{rdv.description}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-ink-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(new Date(rdv.start_at), 'HH:mm')}
            {rdv.end_at ? ` – ${format(new Date(rdv.end_at), 'HH:mm')}` : ''}
          </span>
          {rdv.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {rdv.location}
            </span>
          )}
          {assignee && (
            <span className="flex items-center gap-1">
              <span
                className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] font-bold text-ink-950"
                style={{ background: assignee.avatar_color || colorFor(assignee.id) }}
              >
                {initialsFor(assignee.full_name || assignee.email)}
              </span>
              {(assignee.full_name || assignee.email || '').split(' ')[0]}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

function DayTask({ task, profiles }) {
  const assignee = (profiles || []).find((p) => p.id === task.assigned_to)
  return (
    <li className="card p-3 flex items-start gap-3">
      <div className={classNames('w-1 self-stretch rounded-full', priorityDot(task.priority))} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg">{task.title}</p>
        {task.description && <p className="text-xs text-ink-300 mt-1">{task.description}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-ink-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {task.due_at ? format(new Date(task.due_at), 'HH:mm') : ''}
          </span>
          <span className="chip border bg-fg/5 border-fg/10">Tâche</span>
          {assignee && (
            <span className="flex items-center gap-1">
              <span
                className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] font-bold text-ink-950"
                style={{ background: assignee.avatar_color || colorFor(assignee.id) }}
              >
                {initialsFor(assignee.full_name || assignee.email)}
              </span>
              {(assignee.full_name || assignee.email || '').split(' ')[0]}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

function RdvForm({ initial, defaultStart, profile, profiles, groups, onClose, onSaved }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [location, setLocation] = useState(initial?.location || '')
  const [startAt, setStartAt] = useState(
    initial?.start_at ? toLocal(initial.start_at) : defaultStart ? toLocal(defaultStart.toISOString()) : '',
  )
  const [endAt, setEndAt] = useState(initial?.end_at ? toLocal(initial.end_at) : '')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to || profile.id)
  const [groupId, setGroupId] = useState(initial?.group_id || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const assignablePeople = useMemo(() => {
    if (canAssignAnyone(profile.role)) return profiles
    if (profile.role === ROLES.MANAGER) {
      return profiles.filter((p) => p.id === profile.id || p.role === ROLES.USER)
    }
    return profiles.filter((p) => p.id === profile.id)
  }, [profiles, profile])

  const submit = async (e) => {
    e.preventDefault()
    if (endAt && new Date(endAt) < new Date(startAt)) {
      setErr("L'heure de fin doit être après l'heure de début.")
      return
    }
    setSaving(true)
    setErr('')
    try {
      const payload = {
        title,
        description,
        location,
        start_at: new Date(startAt).toISOString(),
        end_at: endAt ? new Date(endAt).toISOString() : null,
        assigned_to: assignedTo || null,
        group_id: groupId || null,
      }
      if (initial) {
        await updateAppointment(initial.id, payload)
      } else {
        await createAppointment({ ...payload, created_by: profile.id, reminder_sent: false })
      }
      onSaved()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title={initial ? 'Éditer le RDV' : 'Nouveau RDV'}>
      <form onSubmit={submit} className="space-y-3">
        <input
          autoFocus
          type="text"
          placeholder="Titre du rendez-vous"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="input"
        />
        <textarea
          placeholder="Description (optionnel)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input resize-none"
        />
        <input
          type="text"
          placeholder="Lieu (optionnel)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="input"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">Début</span>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
              className="input"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">Fin</span>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="input"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">Avec</span>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="input">
            <option value="">Personne</option>
            {assignablePeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
        </label>
        {groups.length > 0 && (
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
              Visibilité (groupe)
            </span>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="input">
              <option value="">Privé (participant + admins)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {err && <p className="text-xs text-rose-300">{err}</p>}
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? 'Enregistrement…' : initial ? 'Sauvegarder' : 'Créer le RDV'}
        </button>
      </form>
    </Modal>
  )
}

function PeriodForm({ initial, defaultStart, month, periods, profile, onClose, onSaved }) {
  const autoColor = useMemo(() => {
    const used = new Set(
      periods.filter((p) => periodOverlapsMonth(p, month) && p.id !== initial?.id).map((p) => p.color),
    )
    return PERIOD_COLORS.find((c) => !used.has(c)) || PERIOD_COLORS[periods.length % PERIOD_COLORS.length]
  }, [periods, month, initial])

  const [title, setTitle] = useState(initial?.title || '')
  const [start, setStart] = useState(initial?.start_date || (defaultStart ? dayStr(defaultStart) : ''))
  const [end, setEnd] = useState(initial?.end_date || (defaultStart ? dayStr(defaultStart) : ''))
  const [color, setColor] = useState(initial?.color || autoColor)
  const [touchedColor, setTouchedColor] = useState(!!initial)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const effectiveColor = touchedColor ? color : autoColor

  const submit = async (e) => {
    e.preventDefault()
    if (end < start) {
      setErr('La date de fin doit être après la date de début.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const payload = {
        title,
        start_date: start,
        end_date: end,
        color: effectiveColor,
      }
      if (initial) {
        await updatePeriod(initial.id, payload)
      } else {
        await createPeriod({ ...payload, created_by: profile.id })
      }
      onSaved()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('Supprimer cette période ?')) return
    setSaving(true)
    try {
      await deletePeriod(initial.id)
      onSaved()
    } catch (e2) {
      setErr(e2.message)
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title={initial ? 'Éditer la période' : 'Nouvelle période'}>
      <form onSubmit={submit} className="space-y-3">
        <input
          autoFocus
          type="text"
          placeholder="Ex. Voyage à Paris, Vacances…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="input"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">Du</span>
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value)
                if (!end || end < e.target.value) setEnd(e.target.value)
              }}
              required
              className="input"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">Au</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
              className="input"
            />
          </label>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1.5 block">
            Couleur {!touchedColor && <span className="text-neon-cyan">(auto)</span>}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c)
                  setTouchedColor(true)
                }}
                className={classNames(
                  'w-7 h-7 rounded-full transition',
                  effectiveColor === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-ink-900' : 'opacity-80 hover:opacity-100',
                )}
                style={{ background: c }}
              />
            ))}
            <label className="w-7 h-7 rounded-full overflow-hidden border border-fg/20 relative cursor-pointer">
              <input
                type="color"
                value={effectiveColor}
                onChange={(e) => {
                  setColor(e.target.value)
                  setTouchedColor(true)
                }}
                className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
              />
            </label>
            {touchedColor && !initial && (
              <button
                type="button"
                onClick={() => setTouchedColor(false)}
                className="text-[10px] uppercase tracking-widest text-neon-cyan font-bold px-2"
              >
                Auto
              </button>
            )}
          </div>
        </div>
        {err && <p className="text-xs text-rose-300">{err}</p>}
        <div className="flex gap-2">
          {initial && (
            <button type="button" onClick={remove} className="btn-danger" disabled={saving}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Enregistrement…' : initial ? 'Sauvegarder' : 'Créer la période'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({ children, onClose, title }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[88vh] overflow-y-auto p-5 pb-safe border border-fg/10 relative"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="heading text-lg">{title}</h3>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function priorityDot(p) {
  if (p === 'critical') return 'bg-neon-rose'
  if (p === 'important') return 'bg-neon-amber'
  return 'bg-neon-cyan'
}

function toLocal(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
