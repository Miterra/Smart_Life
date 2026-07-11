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
  Paperclip,
  FileText,
  Download,
  Smile,
  Camera,
  Copy,
} from 'lucide-react'
import {
  listGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupMembers,
  setGroupAvatar,
  listProfiles,
  listMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
  uploadChatFile,
  toggleReaction,
  listMutes,
  muteGroup,
  unmuteGroup,
  setViewingGroup,
  subscribeRealtime,
} from '../lib/repository'
import { canManageGroups } from '../lib/roles'
import { classNames, colorFor } from '../lib/utils'
import Avatar from '../components/Avatar'
import { usePresence, presenceLabel } from '../lib/presence'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'

/** Réactions rapides disponibles sur les messages. */
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

/** Photo d'un groupe (avatar_url) ou icône de repli. */
function GroupAvatar({ group, size = 40, className = '' }) {
  const style = { width: size, height: size }
  if (group?.avatar_url) {
    return (
      <img
        src={group.avatar_url}
        alt={group.name || ''}
        style={style}
        loading="lazy"
        className={classNames('rounded-xl object-cover flex-shrink-0', className)}
      />
    )
  }
  return (
    <div
      className={classNames(
        'rounded-xl bg-neon-magenta/15 flex items-center justify-center flex-shrink-0',
        className,
      )}
      style={style}
    >
      <MessagesSquare className="text-neon-magenta" style={{ width: size * 0.42, height: size * 0.42 }} />
    </div>
  )
}

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

  const create = async (name, userIds, file) => {
    const g = await createGroup(name)
    // Un admin qui crée un groupe en fait toujours partie : sinon, la
    // visibilité étant liée à l'appartenance, il ne verrait plus le groupe
    // qu'il vient de créer. Le owner, lui, supervise déjà tous les groupes.
    const memberIds = new Set(userIds || [])
    if (profile.role !== 'owner') memberIds.add(profile.id)
    if (memberIds.size) await setGroupMembers(g.id, [...memberIds])
    if (file) {
      try {
        await setGroupAvatar(g.id, file)
      } catch (e) {
        console.error(e)
      }
    }
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
          profile={profile}
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
            profile={profile}
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
            onSave={async (name, file) => {
              await renameGroup(renaming.id, name)
              if (file) {
                try {
                  await setGroupAvatar(renaming.id, file)
                } catch (e) {
                  console.error(e)
                }
              }
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
function ListView({ groups, profiles, loading, canManage, profile, mutedGroups, onOpen, onAdd }) {
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
            {canManage
              ? profile.role === 'owner'
                ? "Aucun groupe pour l'instant."
                : 'Aucun groupe visible. Crée-en un pour démarrer une conversation.'
              : "Tu n'es membre d'aucun groupe."}
          </p>
          {canManage && (
            <button onClick={onAdd} className="btn-secondary">
              <Plus className="w-4 h-4" /> Créer le premier
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
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
          <GroupAvatar group={group} size={40} />
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
  const [pending, setPending] = useState(null) // { file, name, type, previewUrl }
  const [menuMsg, setMenuMsg] = useState(null) // message sur lequel agir (appui long / clic droit)
  const [editing, setEditing] = useState(null) // { id, body } en cours d'édition
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const { isOnline } = usePresence()

  const memberIds = (group.group_members || []).map((m) => m.user_id)
  const memberCount = memberIds.length
  const onlineCount = memberIds.filter((id) => id !== profile.id && isOnline(id)).length

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
    const sub = subscribeRealtime(['messages', 'message_reactions'], load)
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id])

  // Signale qu'on regarde CE groupe : tant qu'il est ouvert et visible, on ne
  // reçoit pas de notification push pour ses messages (inutile, on les lit).
  // On efface l'état en arrière-plan/fermeture pour que les notifs reprennent.
  useEffect(() => {
    const apply = () => setViewingGroup(document.visibilityState === 'visible' ? group.id : null)
    apply()
    document.addEventListener('visibilitychange', apply)
    return () => {
      document.removeEventListener('visibilitychange', apply)
      setViewingGroup(null)
    }
  }, [group.id])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, loading])

  // Libère l'aperçu (objet-URL) quand la pièce jointe change / au démontage.
  useEffect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl)
    }
  }, [pending])

  const onPickFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const isImg = f.type.startsWith('image/')
    const isPdf = f.type === 'application/pdf'
    if (!isImg && !isPdf) {
      alert('Formats acceptés : images et PDF.')
      return
    }
    if (f.size > 25 * 1024 * 1024) {
      alert('Fichier trop volumineux (max 25 Mo).')
      return
    }
    setPending({
      file: f,
      name: f.name || 'fichier',
      type: isImg ? 'image' : 'pdf',
      previewUrl: isImg ? URL.createObjectURL(f) : null,
    })
  }

  // N'ouvre le menu que s'il y a au moins une action possible (copier le
  // texte, ou modifier/supprimer si c'est le sien — le owner peut supprimer).
  // Renvoie true si le menu s'ouvre, pour que la bulle ne bloque le
  // comportement natif (clic droit) que dans ce cas.
  const openMsgMenu = (m) => {
    const mine = m.user_id === profile.id
    const hasText = !!(m.body && m.body.trim())
    if (!hasText && !mine && profile.role !== 'owner') return false
    setMenuMsg(m)
    return true
  }

  const copyMessage = async (msg) => {
    setMenuMsg(null)
    const text = msg.body || ''
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback (anciens navigateurs) : textarea temporaire + execCommand.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta)
    }
  }

  const startEdit = (msg) => {
    setMenuMsg(null)
    if (pending) setPending(null)
    setEditing({ id: msg.id, body: msg.body || '' })
    setBody(msg.body || '')
  }

  const cancelEdit = () => {
    setEditing(null)
    setBody('')
  }

  const removeMessage = async (msg) => {
    setMenuMsg(null)
    if (!confirm('Supprimer ce message ?')) return
    setMessages((cur) => cur.filter((x) => x.id !== msg.id)) // optimiste
    try {
      await deleteMessage(msg.id)
    } catch (e2) {
      console.error(e2)
      alert('Impossible de supprimer le message.')
      load()
    }
  }

  const send = async (e) => {
    e.preventDefault()
    const text = body.trim()
    // Mode édition : on met à jour le corps du message existant.
    if (editing) {
      if (!text) return
      const id = editing.id
      const stamp = new Date().toISOString()
      setEditing(null)
      setBody('')
      setMessages((cur) => cur.map((x) => (x.id === id ? { ...x, body: text, edited_at: stamp } : x)))
      try {
        await updateMessage(id, text)
      } catch (e2) {
        console.error(e2)
        alert('Impossible de modifier le message.')
        load()
      }
      return
    }
    if (!text && !pending) return
    const keepBody = body
    const keepPending = pending
    setSending(true)
    setBody('')
    setPending(null)
    try {
      let attachment = null
      if (keepPending) attachment = await uploadChatFile(group.id, keepPending.file)
      await sendMessage(group.id, profile.id, text, attachment)
      await load()
    } catch (e2) {
      console.error(e2)
      setBody(keepBody)
      // L'object-URL de l'aperçu a été révoqué par le cleanup lors du
      // setPending(null) : on le régénère pour éviter une vignette cassée.
      setPending(
        keepPending && keepPending.previewUrl
          ? { ...keepPending, previewUrl: URL.createObjectURL(keepPending.file) }
          : keepPending,
      )
      alert("Impossible d'envoyer le message.")
    } finally {
      setSending(false)
    }
  }

  const react = async (messageId, emoji) => {
    // Optimiste : on bascule localement, le realtime réconcilie ensuite.
    setMessages((cur) =>
      cur.map((mm) => {
        if (mm.id !== messageId) return mm
        const arr = mm.message_reactions || []
        const has = arr.some((r) => r.user_id === profile.id && r.emoji === emoji)
        return {
          ...mm,
          message_reactions: has
            ? arr.filter((r) => !(r.user_id === profile.id && r.emoji === emoji))
            : [...arr, { user_id: profile.id, emoji }],
        }
      }),
    )
    try {
      await toggleReaction(messageId, emoji)
    } catch (err) {
      console.error(err)
      load()
    }
  }

  return (
    // PC : largeur de lecture confortable + fenêtre de chat plus haute.
    <div className="space-y-3 lg:max-w-3xl lg:mx-auto">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="btn-ghost p-2" title="Retour">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <GroupAvatar group={group} size={38} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{group.name}</p>
          <p className="text-[11px] text-ink-400 flex items-center gap-1">
            <Users className="w-3 h-3" /> {memberCount} {memberCount > 1 ? 'membres' : 'membre'}
            {onlineCount > 0 && <span className="text-emerald-400">· {onlineCount} en ligne</span>}
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
              <button onClick={onRename} className="btn-ghost p-2" title="Modifier">
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
        className="card p-3 h-[56vh] lg:h-[64vh] overflow-y-auto flex flex-col gap-1.5 scroll-smooth"
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
                <Bubble
                  m={m}
                  mine={mine}
                  author={author}
                  showAuthor={showAuthor}
                  myId={profile.id}
                  onReact={react}
                  onMenu={openMsgMenu}
                />
              </div>
            )
          })
        )}
      </div>

      {pending && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
          {pending.type === 'image' ? (
            <img src={pending.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-rose-500/15 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-rose-300" />
            </div>
          )}
          <span className="flex-1 min-w-0 text-xs text-ink-200 truncate">{pending.name}</span>
          <button type="button" onClick={() => setPending(null)} className="btn-ghost p-1" title="Retirer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30">
          <Pencil className="w-3.5 h-3.5 text-neon-cyan flex-shrink-0" />
          <span className="flex-1 min-w-0 text-xs text-ink-200">Modification du message</span>
          <button
            type="button"
            onClick={cancelEdit}
            className="btn-ghost p-1"
            title="Annuler la modification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={onPickFile}
        />
        {!editing && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-ghost p-2.5 flex-shrink-0"
            title="Joindre une image ou un PDF"
          >
            <Paperclip className="w-5 h-5" />
          </button>
        )}
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={editing ? 'Modifier le message…' : 'Écris un message…'}
          className="input flex-1"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={sending || (editing ? !body.trim() : !body.trim() && !pending)}
          className="btn-primary px-3.5 py-2.5 disabled:opacity-40 flex-shrink-0"
          title={editing ? 'Enregistrer' : 'Envoyer'}
        >
          {editing ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      <AnimatePresence>
        {menuMsg && (
          <MessageActionSheet
            mine={menuMsg.user_id === profile.id}
            canCopy={!!(menuMsg.body && menuMsg.body.trim())}
            canEdit={menuMsg.user_id === profile.id && !!(menuMsg.body && menuMsg.body.trim())}
            canDelete={menuMsg.user_id === profile.id || profile.role === 'owner'}
            onCopy={() => copyMessage(menuMsg)}
            onEdit={() => startEdit(menuMsg)}
            onDelete={() => removeMessage(menuMsg)}
            onClose={() => setMenuMsg(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Bubble({ m, mine, author, showAuthor, myId, onReact, onMenu }) {
  const name = author?.full_name || author?.email || 'Inconnu'
  const color = author?.avatar_color || colorFor(m.user_id)
  const pressTimer = useRef(null)

  // Appui long (mobile) / clic droit (PC) → menu d'actions (copier / modifier /
  // supprimer). On ne bloque le menu contextuel natif que si le nôtre s'ouvre
  // (sinon « Enregistrer l'image sous » resterait inaccessible).
  const openMenu = (e) => {
    if (!onMenu) return
    if (onMenu(m)) e.preventDefault()
  }
  const startPress = () => {
    if (!onMenu) return
    pressTimer.current = setTimeout(() => onMenu(m), 500)
  }
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  // Agrège les réactions par emoji : { emoji, count, mine }.
  const reactions = useMemo(() => {
    const map = new Map()
    for (const r of m.message_reactions || []) {
      const cur = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false }
      cur.count += 1
      if (r.user_id === myId) cur.mine = true
      map.set(r.emoji, cur)
    }
    return [...map.values()]
  }, [m.message_reactions, myId])

  const hasText = !!(m.body && m.body.trim())
  const hasAttachment = !!m.attachment_path

  return (
    <div className={classNames('group flex flex-col', mine ? 'items-end' : 'items-start')}>
      {showAuthor && (
        <span className="text-[11px] font-medium mb-0.5 ml-1" style={{ color }}>
          {name}
        </span>
      )}
      <div className={classNames('flex items-center gap-1', mine ? 'flex-row-reverse' : 'flex-row')}>
        <div
          onContextMenu={openMenu}
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          onTouchMove={cancelPress}
          onTouchCancel={cancelPress}
          className={classNames(
            'max-w-[80%] rounded-2xl text-sm leading-snug overflow-hidden',
            // select-none : évite la sélection pendant l'appui long (mobile) ;
            // sur PC le menu passe par clic droit, on garde la sélection de texte.
            onMenu && 'cursor-pointer select-none lg:select-auto',
            mine ? 'bg-neon-cyan/20 text-white rounded-br-md' : 'bg-white/5 text-ink-100 rounded-bl-md',
          )}
        >
          {hasAttachment && <Attachment m={m} />}
          {hasText && <div className="px-3 py-2 whitespace-pre-wrap break-words">{m.body}</div>}
        </div>
        <ReactionAdd onPick={(emoji) => onReact(m.id, emoji)} alignRight={mine} />
      </div>

      {reactions.length > 0 && (
        <div className={classNames('flex flex-wrap gap-1 mt-1', mine ? 'justify-end' : 'justify-start')}>
          {reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => onReact(m.id, r.emoji)}
              className={classNames(
                'flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-[11px] border transition',
                r.mine
                  ? 'bg-neon-cyan/20 border-neon-cyan/50 text-white'
                  : 'bg-white/5 border-white/10 text-ink-200 hover:bg-white/10',
              )}
            >
              <span className="leading-none">{r.emoji}</span>
              <span className="leading-none tabular-nums">{r.count}</span>
            </button>
          ))}
        </div>
      )}

      <span className="text-[9px] text-ink-500 mt-0.5 mx-1">
        {format(new Date(m.created_at), 'HH:mm')}
        {m.edited_at && ' · modifié'}
      </span>
    </div>
  )
}

/** Pièce jointe d'un message : image (ouvre l'URL signée) ou fichier/PDF téléchargeable. */
function Attachment({ m }) {
  const url = m.attachment_url || null
  if (m.attachment_type === 'image') {
    if (!url) {
      return (
        <div className="w-48 h-32 bg-white/5 flex items-center justify-center text-ink-500 text-xs">
          Image indisponible
        </div>
      )
    }
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={m.attachment_name || ''}
          className="max-w-[220px] max-h-[280px] w-auto h-auto object-cover"
          loading="lazy"
        />
      </a>
    )
  }
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition min-w-[180px]"
    >
      <div className="w-9 h-9 rounded-lg bg-rose-500/15 flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-rose-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{m.attachment_name || 'Fichier'}</p>
        {m.attachment_size != null && (
          <p className="text-[10px] text-ink-400">{formatBytes(m.attachment_size)}</p>
        )}
      </div>
      <Download className="w-4 h-4 text-ink-300 flex-shrink-0" />
    </a>
  )
}

/** Bouton « réagir » → petit sélecteur d'emojis fixe. */
function ReactionAdd({ onPick, alignRight }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1 text-ink-500 hover:text-ink-200 opacity-70 group-hover:opacity-100 transition"
        title="Réagir"
      >
        <Smile className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 4 }}
            transition={{ duration: 0.12 }}
            className={classNames(
              'absolute bottom-full mb-1 z-20 flex gap-0.5 p-1 rounded-full glass-strong border border-white/10 shadow-lg',
              alignRight ? 'right-0' : 'left-0',
            )}
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onPick(emoji)
                  setOpen(false)
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-base leading-none transition"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Taille de fichier lisible (o / Ko / Mo). */
function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} o`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} Ko`
  return `${(kb / 1024).toFixed(1)} Mo`
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
  const [photo, setPhoto] = useState(null) // { file, previewUrl }
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(
    () => () => {
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)
    },
    [photo],
  )

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
      await onCreate(name.trim(), [...selected], photo?.file || null)
    } catch (e2) {
      setErr(e2.message || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Nouveau groupe">
      <form onSubmit={submit} className="space-y-3">
        <GroupPhotoField photo={photo} onPick={setPhoto} />
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

function MembersModal({ group, profiles, profile, onClose, onSave }) {
  const initial = (group.group_members || []).map((m) => m.user_id)
  const [selected, setSelected] = useState(new Set(initial))
  const [saving, setSaving] = useState(false)

  // Un admin qui n'est ni owner ni créateur du groupe ne doit pas pouvoir se
  // retirer lui-même : la visibilité étant liée à l'appartenance, il perdrait
  // l'accès RLS au groupe qu'il gère.
  const lockedSelf = profile.role !== 'owner' && group.created_by !== profile.id

  const toggle = (id) => {
    if (lockedSelf && id === profile.id) return
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      const ids = new Set(selected)
      if (lockedSelf) ids.add(profile.id)
      await onSave([...ids])
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title={`Membres · ${group.name}`}>
      <ul className="space-y-1.5 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {profiles.map((p) => (
          <MemberToggle
            key={p.id}
            person={p}
            on={selected.has(p.id)}
            onToggle={() => toggle(p.id)}
            locked={lockedSelf && p.id === profile.id}
          />
        ))}
      </ul>
      <button onClick={save} className="btn-primary w-full mt-4" disabled={saving}>
        {saving ? '…' : `Enregistrer (${selected.size})`}
      </button>
    </Modal>
  )
}

function MemberToggle({ person, on, onToggle, locked }) {
  const { isOnline, lastSeenAt } = usePresence()
  const online = isOnline(person.id)
  const label = presenceLabel(online, lastSeenAt(person.id))
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
        <Avatar profile={person} size={32} showPresence />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-white truncate">
            {person.full_name || person.email}
          </p>
          <p className="text-[11px] text-ink-400 truncate">
            {person.role}
            {locked && <span className="ml-1.5 text-neon-cyan">· toi, tu restes membre</span>}
            {label && (
              <span className={classNames('ml-1.5', online && 'text-emerald-400')}>· {label}</span>
            )}
          </p>
        </div>
        {on && <Check className="w-4 h-4 text-neon-cyan" />}
      </button>
    </li>
  )
}

function RenameModal({ group, onClose, onSave }) {
  const [name, setName] = useState(group.name)
  const [photo, setPhoto] = useState(null) // { file, previewUrl }
  const [saving, setSaving] = useState(false)

  useEffect(
    () => () => {
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)
    },
    [photo],
  )

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(name.trim(), photo?.file || null)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal onClose={onClose} title="Modifier le groupe">
      <form onSubmit={submit} className="space-y-3">
        <GroupPhotoField group={group} photo={photo} onPick={setPhoto} />
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

/** Sélecteur de photo de groupe (création / édition). */
function GroupPhotoField({ group, photo, onPick }) {
  const fileRef = useRef(null)
  const onChange = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) {
      alert('Choisis une image.')
      return
    }
    if (f.size > 25 * 1024 * 1024) {
      alert('Image trop volumineuse (max 25 Mo).')
      return
    }
    onPick({ file: f, previewUrl: URL.createObjectURL(f) })
  }
  const preview = photo?.previewUrl || group?.avatar_url || null
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="relative flex-shrink-0"
        title="Choisir une photo"
      >
        {preview ? (
          <img src={preview} alt="" className="w-16 h-16 rounded-2xl object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-neon-magenta/15 flex items-center justify-center">
            <MessagesSquare className="w-7 h-7 text-neon-magenta" />
          </div>
        )}
        <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-neon-cyan flex items-center justify-center border-2 border-ink-950">
          <Camera className="w-3.5 h-3.5 text-ink-950" />
        </span>
      </button>
      <div className="text-xs text-ink-400 leading-relaxed">
        <p className="text-ink-200 font-medium">Photo du groupe</p>
        <p>Optionnelle · image (max 25 Mo)</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  )
}

/** Feuille d'actions sur un message (appui long / clic droit). */
function MessageActionSheet({ mine, canCopy, canEdit, canDelete, onCopy, onEdit, onDelete, onClose }) {
  return (
    <Modal onClose={onClose} title={mine ? 'Ton message' : 'Message'}>
      <div className="space-y-2">
        {canCopy && (
          <button onClick={onCopy} className="btn-secondary w-full">
            <Copy className="w-4 h-4" /> Copier
          </button>
        )}
        {canEdit && (
          <button onClick={onEdit} className="btn-secondary w-full">
            <Pencil className="w-4 h-4" /> Modifier
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete} className="btn-secondary w-full text-rose-300">
            <Trash2 className="w-4 h-4" /> Supprimer
          </button>
        )}
      </div>
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
