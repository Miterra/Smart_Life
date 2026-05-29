import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Filter,
  X,
  Trash2,
  Clock,
  CheckCircle2,
  Circle,
  PlayCircle,
  Calendar as CalIcon,
  Tag,
  User as UserIcon,
  Users as UsersIcon,
  Edit3,
} from 'lucide-react'
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  listProfiles,
  listGroups,
  listCategories,
  subscribeRealtime,
} from '../lib/repository'
import { fmtShort, classNames, PRIORITY, STATUS, initialsFor, colorFor } from '../lib/utils'
import {
  canCreateTasks,
  canEditTaskFull,
  canChangeTaskStatus,
  canDeleteTask,
  canAssignAnyone,
  ROLES,
} from '../lib/roles'

const FILTERS = [
  { id: 'mine', label: 'Mes tâches' },
  { id: 'todo', label: 'À faire' },
  { id: 'in_progress', label: 'En cours' },
  { id: 'done', label: 'Terminées' },
  { id: 'all', label: 'Toutes' },
]

export default function Tasks({ profile }) {
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [groups, setGroups] = useState([])
  const [categories, setCategories] = useState([])
  const [filter, setFilter] = useState('mine')
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)

  const canCreate = canCreateTasks(profile.role)

  const refresh = async () => {
    try {
      const [t, p, g, c] = await Promise.all([
        listTasks(),
        listProfiles(),
        listGroups(),
        listCategories(),
      ])
      setTasks(t)
      setProfiles(p)
      setGroups(g)
      setCategories(c)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const sub = subscribeRealtime(['tasks', 'profiles', 'groups', 'categories', 'profile_categories'], refresh)
    return () => sub.unsubscribe()
  }, [])

  const filtered = useMemo(() => {
    let list = tasks
    if (filter === 'mine') list = list.filter((t) => t.assigned_to === profile.id)
    if (filter === 'todo') list = list.filter((t) => t.status === 'todo')
    if (filter === 'in_progress') list = list.filter((t) => t.status === 'in_progress')
    if (filter === 'done') list = list.filter((t) => t.status === 'done')
    return list
  }, [tasks, filter, profile.id])

  const handleSave = async (data) => {
    if (editing) {
      await updateTask(editing.id, data)
    } else {
      await createTask({ ...data, created_by: profile.id })
    }
    setEditing(null)
    setShowForm(false)
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading text-2xl">Tâches</h1>
          <p className="text-xs text-ink-400 mt-1">
            {tasks.length} {tasks.length > 1 ? 'tâches' : 'tâche'}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Nouvelle
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={classNames(
              'chip border whitespace-nowrap',
              filter === f.id
                ? 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/40'
                : 'bg-white/5 text-ink-300 border-white/10 hover:bg-white/10',
            )}
          >
            <Filter className="w-3 h-3" />
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-800/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-300 mb-3">Aucune tâche dans cette vue.</p>
          {canCreate && (
            <button
              onClick={() => {
                setEditing(null)
                setShowForm(true)
              }}
              className="btn-secondary"
            >
              <Plus className="w-4 h-4" /> Créer la première
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                profile={profile}
                profiles={profiles}
                onEdit={() => {
                  setEditing(t)
                  setShowForm(true)
                }}
                onChange={refresh}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <AnimatePresence>
        {showForm && (
          <TaskForm
            initial={editing}
            profile={profile}
            profiles={profiles}
            groups={groups}
            categories={categories}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function TaskRow({ task, profile, profiles, onEdit, onChange }) {
  const prio = PRIORITY[task.priority] || PRIORITY.important
  const stat = STATUS[task.status] || STATUS.todo
  const assignee = profiles.find((p) => p.id === task.assigned_to)
  const canEdit = canEditTaskFull(profile.role, task, profile.id)
  const canStatus = canChangeTaskStatus(profile.role, task, profile.id)
  const canDel = canDeleteTask(profile.role, task, profile.id)
  const overdue = task.due_at && task.status !== 'done' && new Date(task.due_at) < new Date()

  const nextStatus =
    task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo'

  const cycleStatus = async () => {
    await updateTask(task.id, { status: nextStatus })
    onChange()
  }

  const remove = async () => {
    if (!confirm('Supprimer cette tâche ?')) return
    await deleteTask(task.id)
    onChange()
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card p-3.5"
    >
      <div className="flex items-start gap-3">
        <button
          onClick={canStatus ? cycleStatus : undefined}
          disabled={!canStatus}
          className={classNames(
            'mt-0.5 transition flex-shrink-0',
            !canStatus && 'opacity-40 cursor-not-allowed',
          )}
          title={canStatus ? `→ ${STATUS[nextStatus].label}` : 'Lecture seule'}
        >
          {task.status === 'done' ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400" strokeWidth={2} />
          ) : task.status === 'in_progress' ? (
            <PlayCircle className="w-6 h-6 text-neon-amber" strokeWidth={2} />
          ) : (
            <Circle className="w-6 h-6 text-ink-400 hover:text-white" strokeWidth={2} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={classNames(
                'text-sm font-medium leading-snug',
                task.status === 'done' ? 'text-ink-400 line-through' : 'text-white',
              )}
            >
              {task.title}
            </p>
            <div className="flex items-center gap-1">
              {canEdit && (
                <button
                  onClick={onEdit}
                  className="text-ink-400 hover:text-white p-1"
                  title="Éditer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              {canDel && (
                <button
                  onClick={remove}
                  className="text-ink-400 hover:text-rose-400 p-1"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {task.description && (
            <p className="text-xs text-ink-300 mt-1 leading-relaxed">{task.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={classNames('chip border', prio.cls)}>
              <Tag className="w-3 h-3" />
              {prio.label}
            </span>
            <span className={classNames('chip border', stat.cls)}>{stat.label}</span>
            {task.due_at && (
              <span
                className={classNames(
                  'chip border',
                  overdue
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : 'bg-white/5 text-ink-300 border-white/10',
                )}
              >
                <Clock className="w-3 h-3" />
                {fmtShort(task.due_at)}
              </span>
            )}
            {assignee && (
              <span className="chip border bg-white/5 text-ink-300 border-white/10">
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
      </div>
    </motion.li>
  )
}

function TaskForm({ initial, profile, profiles, groups, categories = [], onCancel, onSave }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [dueAt, setDueAt] = useState(initial?.due_at ? toLocal(initial.due_at) : '')
  const [priority, setPriority] = useState(initial?.priority || 'important')
  const [status, setStatus] = useState(initial?.status || 'todo')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to || profile.id)
  const [groupId, setGroupId] = useState(initial?.group_id || '')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [saving, setSaving] = useState(false)

  // Manager : ne peut assigner qu'à lui-même ou aux users
  const basePeople = useMemo(() => {
    if (canAssignAnyone(profile.role)) return profiles
    if (profile.role === ROLES.MANAGER) {
      return profiles.filter((p) => p.id === profile.id || p.role === ROLES.USER)
    }
    return profiles.filter((p) => p.id === profile.id)
  }, [profiles, profile])

  // Filtre par catégorie de personnes
  const assignablePeople = useMemo(() => {
    if (!categoryFilter) return basePeople
    const cat = categories.find((c) => c.id === categoryFilter)
    const ids = new Set((cat?.profile_categories || []).map((m) => m.user_id))
    return basePeople.filter((p) => ids.has(p.id))
  }, [basePeople, categoryFilter, categories])

  // Si l'assigné courant n'est plus dans la liste filtrée, on réinitialise
  useEffect(() => {
    if (assignedTo && !assignablePeople.some((p) => p.id === assignedTo)) {
      setAssignedTo('')
    }
  }, [assignablePeople]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        title,
        description,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        status,
        assigned_to: assignedTo || null,
        group_id: groupId || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancel}
    >
      <motion.form
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="glass-strong rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[88vh] overflow-y-auto p-5 pb-safe border border-white/10"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="heading text-lg">{initial ? 'Éditer la tâche' : 'Nouvelle tâche'}</h3>
          <button type="button" onClick={onCancel} className="btn-ghost p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <input
            autoFocus
            type="text"
            placeholder="Titre de la tâche"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="input"
          />
          <textarea
            placeholder="Description (optionnel)"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
                Échéance
              </span>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
                Urgence
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input"
              >
                <option value="critical">Critique</option>
                <option value="important">Important</option>
                <option value="chill">Tranquille</option>
              </select>
            </label>
          </div>
          {categories.length > 0 && (
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
                Filtrer par catégorie
              </span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input"
              >
                <option value="">Toutes les personnes</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
                Assigner à
              </span>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="input"
              >
                <option value="">Personne</option>
                {assignablePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
                Statut
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="input"
              >
                <option value="todo">À faire</option>
                <option value="in_progress">En cours</option>
                <option value="done">Terminée</option>
              </select>
            </label>
          </div>
          {groups.length > 0 && (
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
                Visibilité (groupe)
              </span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="input"
              >
                <option value="">Privé (assigné + admins)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <button type="submit" className="btn-primary w-full mt-5" disabled={saving}>
          {saving ? 'Enregistrement…' : initial ? 'Sauvegarder' : 'Créer la tâche'}
        </button>
      </motion.form>
    </motion.div>
  )
}

function toLocal(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
