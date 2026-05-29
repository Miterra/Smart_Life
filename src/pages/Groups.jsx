import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessagesSquare,
  Plus,
  Trash2,
  Users,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Send,
  Pencil,
  AlertCircle,
  Bell,
  BellOff,
} from 'lucide-react'
import {
  listGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupMembers,
  listProfiles,
  listMessages,
  sendMessage,
  listMutes,
  muteGroup,
  unmuteGroup,
  subscribeRealtime,
} from '../lib/repository'
import { canManageGroups } from '../lib/roles'
import { classNames, colorFor } from '../lib/utils'
import Avatar from '../components/Avatar'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function Groups({ profile }) {
  const [groups, setGroups] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [managing, setManaging] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [mutedGroups, setMutedGroups] = useState(new Set())

  const canManage = canManageGroups(profile.role)

  const refresh = async () => {
    try {
      const [g, p, mutes] = await Promise.all([listGroups(), listProfiles(), listMutes()])
      setGroups(g)
      setProfiles(p)
      setMutedGroups(new Set((mutes || []).filter((m) => m.group_id).map((m) => m.group_id)))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const sub = subscribeRealtime(['groups', 'group_members', 'mutes'], refresh)
    return () => sub.unsubscribe()
  }, [])

  const toggleMute = async (id) => {
    try {
      if (mutedGroups.has(id)) await unmuteGroup(id)
      else await muteGroup(id)
      refresh()
    } catch (e) {
      alert(e.message)
    }
  }

  const profileMap = useMemo(() => {
    const m = {}
    profiles.forEach((p) => {
      m[p.id] = p
    })
    return m
  }, [profiles])

  const selected = groups.find((g) => g.id === selectedId) || null

  const create = async (name, userIds) => {
    const g = await createGroup(name)
    if (userIds && userIds.length) await setGroupMembers(g.id, userIds)
    setShowAdd(false)
    refresh()
  }

  const remove = async (id) => {
    if (!confirm('Supprimer ce groupe ? La conversation et les messages seront perdus.')) return
    await deleteGroup(id)
    if (selectedId === id) setSelectedId(null)
    refresh()
  }

  return (
    <div className="space-y-4">
      {selected ? (
        <ChatView
          group={selected}
          profile={profile}
          profileMap={profileMap}
          canManage={canManage}
          muted={mutedGroups.has(selected.id)}
          onToggleMute={() => toggleMute(selected.id)}
          onBack={() => setSelectedId(null)}
          onMembers={() => setManaging(selected)}
          onRename={() => setRenaming(selected)}
          onDelete={() => remove(selected.id)}
        />
      ) : (
        <ListView
          groups={groups}
          profiles={profiles}
          loading={loading}
          canManage={canManage}
          mutedGroups={mutedGroups}
          onOpen={(g) => setSelectedId(g.id)}
          onAdd={() => setShowAdd(true)}
        />
      )}

      <AnimatePresence>
        {showAdd && (
          <AddGroupModal
            profiles={profiles}
            onClose={() => setShowAdd(false)}
            onCreate={create}
          />
        )}
        {managing && (
          <MembersModal
            group={managing}
            profiles={profiles}
            onClose={() => setManaging(null)}
            onSave={async (userIds) => {
              await setGroupMembers(managing.id, userIds)
              setManaging(null)
              refresh()
            }}
          />
        )}
        {renaming && (
          <RenameModal
            group={renaming}
            onClose={() => setRenaming(null)}
            onSave={async (name) => {
              await renameGroup(renaming.id, name)
              setRenaming(null)
              refresh()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ============================ Liste des groupes ============================ */
function ListView({ groups, profiles, loading, canManage, mutedGroups, onOpen, onAdd }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading text-2xl">Groupes</h1>
          <p className="text-xs text-ink-400 mt-1 leading-snug">
            Discute avec les membres de tes groupes.
          </p>
        </div>
        {canManage && (
          <button onClick={onAdd} className="btn-primary">
            <Plus className="w-4 h-4" />
            Créer
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-800/40 animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-8 text-center">
          <MessagesSquare className="w-10 h-10 text-ink-500 mx-auto mb-3" />
          <p className="text-sm text-ink-300 mb-3">
            {canManage ? "Aucun groupe pour l'instant." : "Tu n'es membre d'aucun groupe."}
          </p>
          {canManage && (
            <button onClick={onAdd} className="btn-secondary">
              <Plus className="w-4 h-4" /> Créer le premier
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              profiles={profiles}
              muted={mutedGroups?.has(g.id)}
              onOpen={() => onOpen(g)}
            />
          ))}
        </ul>
      )}
    </>
  )
}

function GroupRow({ group, profiles, muted, onOpen }) {
  const memberIds = (group.group_members || []).map((m) => m.user_id)
  const members = profiles.filter((p) => memberIds.includes(p.id))
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <button
        onClick={onOpen}
        className="card p-3.5 w-full text-left hover:bg-white/[0.04] transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neon-magenta/15 flex items-center justify-center flex-shrink-0">
            <MessagesSquare className="w-4 h-4 text-neon-magenta" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
              {group.name}
              {muted && <BellOff className="w-3 h-3 text-amber-400 flex-shrink-0" />}
            </p>
            <p className="text-[11px] text-ink-400 flex items-center gap-1">
              <Users className="w-3 h-3" /> {members.length}{' '}
              {members.length > 1 ? 'membres' : 'membre'}
            </p>
            <div className="flex -space-x-1.5 mt-1.5">
              {members.slice(0, 6).map((m) => (
                <Avatar
                  key={m.id}
                  profile={m}
                  size={20}
                  className="border border-ink-900 text-[8px]"
                />
              ))}
              {members.length > 6 && (
                <div className="w-5 h-5 rounded-full bg-white/10 border border-ink-900 text-[8px] font-bold flex items-center justify-center text-white">
                  +{members.length - 6}
                </div>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-400 flex-shrink-0" />
        </div>
      </button>
    </motion.li>
  )
}

/* ============================ Vue chat ============================ */
function ChatView({ group, profile, profileMap, canManage, muted, onToggleMute, onBack, onMembers, onRename, onDelete }) {
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  const memberCount = (group.group_members || []).length

  const load = async () => {
    try {
      const msgs = await listMessages(group.id)
      setMessages(msgs)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    load()
    const sub = subscribeRealtime(['messages'], load)
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, loading])

  const send = async (e) => {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setSending(true)
    setBody('')
    try {
      await sendMessage(group.id, profile.id, text)
      await load()
    } catch (e2) {
      console.error(e2)
      setBody(text)
      alert("Impossible d'envoyer le message.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="btn-ghost p-2" title="Retour">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-xl bg-neon-magenta/15 flex items-center justify-center flex-shrink-0">
          <MessagesSquare className="w-4 h-4 text-neon-magenta" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{group.name}</p>
          <p className="text-[11px] text-ink-400 flex items-center gap-1">
            <Users className="w-3 h-3" /> {memberCount} {memberCount > 1 ? 'membres' : 'membre'}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <motion.button
            onClick={onToggleMute}
            whileTap={{ scale: 0.85 }}
            className={classNames('btn-ghost p-2', muted && 'text-amber-400')}
            title={muted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
          >
            {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </motion.button>
          {canManage && (
            <>
              <button onClick={onMembers} className="btn-ghost p-2" title="Membres">
                <Users className="w-4 h-4" />
              </button>
              <button onClick={onRename} className="btn-ghost p-2" title="Renommer">
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="text-ink-400 hover:text-rose-400 p-2"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="card p-3 h-[56vh] overflow-y-auto flex flex-col gap-1.5 scroll-smooth"
      >
        {loading ? (
          <div className="m-auto text-ink-400 text-sm">Chargement…</div>
        ) : messages.length === 0 ? (
          <div className="m-auto text-center px-6">
            <MessagesSquare className="w-10 h-10 text-ink-500 mx-auto mb-2" />
            <p className="text-sm text-ink-300">Aucun message. Lance la conversation !</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.user_id === profile.id
            const author = profileMap[m.user_id]
            const prev = messages[i - 1]
            const showAuthor = !mine && (!prev || prev.user_id !== m.user_id)
            const showDay = !prev || !sameDay(prev.created_at, m.created_at)
            return (
              <div key={m.id}>
                {showDay && <DayDivider date={m.created_at} />}
                <Bubble m={m} mine={mine} author={author} showAuthor={showAuthor} />
              </div>
            )
          })
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Écris un message…"
          className="input flex-1"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="btn-primary px-3.5 py-2.5 disabled:opacity-40"
          title="Envoyer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}

function Bubble({ m, mine, author, showAuthor }) {
  const name = author?.full_name || author?.email || 'Inconnu'
  const color = author?.avatar_color || colorFor(m.user_id)
  return (
    <div className={classNames('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {showAuthor && (
        <span className="text-[11px] font-medium mb-0.5 ml-1" style={{ color }}>
          {name}
        </span>
      )}
      <div
        className={classNames(
          'max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap break-words',
          mine
            ? 'bg-neon-cyan/20 text-white rounded-br-md'
            : 'bg-white/5 text-ink-100 rounded-bl-md',
        )}
      >
        {m.body}
      </div>
      <span className="text-[9px] text-ink-500 mt-0.5 mx-1">
        {format(new Date(m.created_at), 'HH:mm')}
      </span>
    </div>
  )
}

function DayDivider({ date }) {
  return (
    <div className="flex items-center gap-2 my-1.5">
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

/* ============================ Modales ============================ */
function AddGroupModal({ profiles, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (id) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      await onCreate(name.trim(), [...selected])
    } catch (e2) {
      setErr(e2.message || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Nouveau groupe">
      <form onSubmit={submit} className="space-y-3">
        <input
          autoFocus
          type="text"
          placeholder="Nom du groupe (ex. Marketing, Famille…)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="input"
        />
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-400 mb-1.5">Membres</p>
          <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto -mx-1 px-1">
            {profiles.map((p) => (
              <MemberToggle key={p.id} person={p} on={selected.has(p.id)} onToggle={() => toggle(p.id)} />
            ))}
          </ul>
        </div>
        {err && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {err}
          </div>
        )}
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving
            ? '…'
            : `Créer${selected.size ? ` · ${selected.size} membre${selected.size > 1 ? 's' : ''}` : ''}`}
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
    <Modal onClose={onClose} title={`Membres · ${group.name}`}>
      <ul className="space-y-1.5 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {profiles.map((p) => (
          <MemberToggle key={p.id} person={p} on={selected.has(p.id)} onToggle={() => toggle(p.id)} />
        ))}
      </ul>
      <button onClick={save} className="btn-primary w-full mt-4" disabled={saving}>
        {saving ? '…' : `Enregistrer (${selected.size})`}
      </button>
    </Modal>
  )
}

function MemberToggle({ person, on, onToggle }) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className={classNames(
          'w-full flex items-center gap-3 p-2.5 rounded-xl transition',
          on ? 'bg-neon-cyan/15 ring-1 ring-neon-cyan/40' : 'hover:bg-white/5',
        )}
      >
        <Avatar profile={person} size={32} />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-white truncate">
            {person.full_name || person.email}
          </p>
          <p className="text-[11px] text-ink-400">{person.role}</p>
        </div>
        {on && <Check className="w-4 h-4 text-neon-cyan" />}
      </button>
    </li>
  )
}

function RenameModal({ group, onClose, onSave }) {
  const [name, setName] = useState(group.name)
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(name.trim())
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal onClose={onClose} title="Renommer le groupe">
      <form onSubmit={submit} className="space-y-3">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="input"
        />
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? '…' : 'Enregistrer'}
        </button>
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
        className="glass-strong rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 pb-safe border border-white/10 relative"
      >
        <button onClick={onClose} className="absolute top-3 right-3 btn-ghost p-1.5">
          <X className="w-4 h-4" />
        </button>
        {title && <h3 className="heading text-lg mb-3 pr-8">{title}</h3>}
        {children}
      </motion.div>
    </motion.div>
  )
}
