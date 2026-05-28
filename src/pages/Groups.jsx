import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Layers,
  Plus,
  Trash2,
  Users,
  Check,
  X,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import {
  listGroups,
  createGroup,
  deleteGroup,
  setGroupMembers,
  listProfiles,
  subscribeRealtime,
} from '../lib/repository'
import { canManageGroups } from '../lib/roles'
import { classNames, initialsFor, colorFor } from '../lib/utils'

export default function Groups({ profile }) {
  const [groups, setGroups] = useState([])
  const [profiles, setProfiles] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)

  if (!canManageGroups(profile.role)) {
    return (
      <div className="card p-8 text-center">
        <Layers className="w-10 h-10 text-ink-400 mx-auto mb-3" />
        <p className="text-sm text-ink-300">Accès réservé aux administrateurs.</p>
      </div>
    )
  }

  const refresh = async () => {
    try {
      const [g, p] = await Promise.all([listGroups(), listProfiles()])
      setGroups(g)
      setProfiles(p)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const sub = subscribeRealtime(['groups', 'group_members'], refresh)
    return () => sub.unsubscribe()
  }, [])

  const create = async (name) => {
    await createGroup(name)
    setShowAdd(false)
    refresh()
  }

  const remove = async (id) => {
    if (!confirm('Supprimer ce groupe ? Les tâches associées deviendront privées.')) return
    await deleteGroup(id)
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading text-2xl">Groupes</h1>
          <p className="text-xs text-ink-400 mt-1 leading-snug">
            Définis qui voit quoi. Une tâche dans un groupe est visible par tous ses membres.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Créer
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-800/40 animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-8 text-center">
          <Layers className="w-10 h-10 text-ink-500 mx-auto mb-3" />
          <p className="text-sm text-ink-300 mb-3">Aucun groupe pour l'instant.</p>
          <button onClick={() => setShowAdd(true)} className="btn-secondary">
            <Plus className="w-4 h-4" /> Créer le premier
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              profiles={profiles}
              onEdit={() => setEditing(g)}
              onRemove={() => remove(g.id)}
            />
          ))}
        </ul>
      )}

      <AnimatePresence>
        {showAdd && <AddGroupModal onClose={() => setShowAdd(false)} onCreate={create} />}
        {editing && (
          <MembersModal
            group={editing}
            profiles={profiles}
            onClose={() => setEditing(null)}
            onSave={async (userIds) => {
              await setGroupMembers(editing.id, userIds)
              setEditing(null)
              refresh()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function GroupRow({ group, profiles, onEdit, onRemove }) {
  const memberIds = (group.group_members || []).map((m) => m.user_id)
  const members = profiles.filter((p) => memberIds.includes(p.id))
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-3.5"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-neon-cyan/15 flex items-center justify-center">
          <Layers className="w-4 h-4 text-neon-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{group.name}</p>
          <p className="text-[11px] text-ink-400 flex items-center gap-1">
            <Users className="w-3 h-3" /> {members.length}{' '}
            {members.length > 1 ? 'membres' : 'membre'}
          </p>
          <div className="flex -space-x-1.5 mt-1.5">
            {members.slice(0, 6).map((m) => (
              <div
                key={m.id}
                title={m.full_name || m.email}
                className="w-5 h-5 rounded-full border border-ink-900 text-[8px] font-bold flex items-center justify-center text-ink-950"
                style={{ background: m.avatar_color || colorFor(m.id) }}
              >
                {initialsFor(m.full_name || m.email)}
              </div>
            ))}
            {members.length > 6 && (
              <div className="w-5 h-5 rounded-full bg-white/10 border border-ink-900 text-[8px] font-bold flex items-center justify-center text-white">
                +{members.length - 6}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="btn-ghost p-2" title="Membres">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            className="text-ink-400 hover:text-rose-400 p-2"
            title="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.li>
  )
}

function AddGroupModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onCreate(name)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <h3 className="heading text-lg">Nouveau groupe</h3>
        <input
          autoFocus
          type="text"
          placeholder="Nom du groupe (ex. Marketing, Chantier 1…)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="input"
        />
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? '…' : 'Créer'}
        </button>
      </form>
    </Modal>
  )
}

function MembersModal({ group, profiles, onClose, onSave }) {
  const initial = (group.group_members || []).map((m) => m.user_id)
  const [selected, setSelected] = useState(new Set(initial))
  const [saving, setSaving] = useState(false)

  const toggle = (id) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      await onSave([...selected])
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="heading text-lg mb-3">Membres · {group.name}</h3>
      <ul className="space-y-1.5 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {profiles.map((p) => {
          const on = selected.has(p.id)
          return (
            <li key={p.id}>
              <button
                onClick={() => toggle(p.id)}
                className={classNames(
                  'w-full flex items-center gap-3 p-2.5 rounded-xl transition',
                  on ? 'bg-neon-cyan/15 ring-1 ring-neon-cyan/40' : 'hover:bg-white/5',
                )}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-ink-950 flex-shrink-0"
                  style={{ background: p.avatar_color || colorFor(p.id) }}
                >
                  {initialsFor(p.full_name || p.email)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-white truncate">
                    {p.full_name || p.email}
                  </p>
                  <p className="text-[11px] text-ink-400">{p.role}</p>
                </div>
                {on && <Check className="w-4 h-4 text-neon-cyan" />}
              </button>
            </li>
          )
        })}
      </ul>
      <button onClick={save} className="btn-primary w-full mt-4" disabled={saving}>
        {saving ? '…' : `Enregistrer (${selected.size})`}
      </button>
    </Modal>
  )
}

function Modal({ children, onClose }) {
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
        className="glass-strong rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 pb-safe border border-white/10 relative"
      >
        <button onClick={onClose} className="absolute top-3 right-3 btn-ghost p-1.5">
          <X className="w-4 h-4" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  )
}
