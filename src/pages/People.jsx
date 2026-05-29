import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Crown,
  Shield,
  UserCog,
  User as UserIcon,
  Mail,
  Trash2,
  Plus,
  X,
  AlertCircle,
  Tag,
  Pencil,
  Check,
} from 'lucide-react'
import {
  listProfiles,
  updateProfile,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  setCategoryMembers,
  subscribeRealtime,
} from '../lib/repository'
import { supabase } from '../lib/supabase'
import {
  ROLE_LABELS,
  ROLE_COLORS,
  ROLES,
  isAdminOrOwner,
  canChangeRole,
  canManageCategories,
} from '../lib/roles'
import { classNames, initialsFor, colorFor } from '../lib/utils'

const ROLE_ICONS = { owner: Crown, admin: Shield, manager: UserCog, user: UserIcon }
const CAT_COLORS = [
  '#22d3ee', '#e879f9', '#a3e635', '#fbbf24', '#fb7185',
  '#60a5fa', '#34d399', '#f472b6', '#c084fc', '#fb923c',
]

export default function People({ profile }) {
  const [tab, setTab] = useState('people')
  const [people, setPeople] = useState([])
  const [categories, setCategories] = useState([])
  const [showInvite, setShowInvite] = useState(false)
  const [editingCat, setEditingCat] = useState(null) // category object or 'new'
  const [membersCat, setMembersCat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const canCats = canManageCategories(profile.role)

  const refresh = async () => {
    try {
      const [list, cats] = await Promise.all([listProfiles(), listCategories()])
      setPeople(list)
      setCategories(cats)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const sub = subscribeRealtime(['profiles', 'categories', 'profile_categories'], refresh)
    return () => sub.unsubscribe()
  }, [])

  if (!isAdminOrOwner(profile.role)) {
    return <Forbidden />
  }

  const setRole = async (id, role) => {
    if (!canChangeRole(profile.role)) {
      alert('Seul le propriétaire peut changer un rôle.')
      return
    }
    try {
      await updateProfile(id, { role })
      refresh()
    } catch (e) {
      alert(e.message)
    }
  }

  const removeUser = async (id) => {
    if (!confirm('Retirer cet utilisateur ? Ses tâches deviendront non-assignées.')) return
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id)
      if (error) throw error
      refresh()
    } catch (e) {
      alert(e.message)
    }
  }

  const saveCategory = async ({ name, color }) => {
    if (editingCat && editingCat !== 'new') {
      await updateCategory(editingCat.id, { name, color })
    } else {
      await createCategory(name, color)
    }
    setEditingCat(null)
    refresh()
  }

  const removeCategory = async (id) => {
    if (!confirm('Supprimer cette catégorie ?')) return
    await deleteCategory(id)
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading text-2xl">{tab === 'people' ? 'Personnes' : 'Catégories'}</h1>
          <p className="text-xs text-ink-400 mt-1">
            {tab === 'people'
              ? `${people.length} ${people.length > 1 ? 'membres' : 'membre'}`
              : 'Regroupe des personnes pour filtrer les assignations.'}
          </p>
        </div>
        {tab === 'people' ? (
          <button onClick={() => setShowInvite(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Inviter
          </button>
        ) : (
          canCats && (
            <button onClick={() => setEditingCat('new')} className="btn-primary">
              <Plus className="w-4 h-4" />
              Catégorie
            </button>
          )
        )}
      </div>

      {canCats && (
        <div className="flex gap-1 p-1 rounded-xl bg-ink-900/60 border border-white/10">
          {[
            ['people', 'Personnes', Users],
            ['categories', 'Catégories', Tag],
          ].map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={classNames(
                'flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1.5',
                tab === key ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-ink-200',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {err}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-ink-800/40 animate-pulse" />
          ))}
        </div>
      ) : tab === 'people' ? (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {people.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                me={profile}
                onSetRole={setRole}
                onRemove={removeUser}
              />
            ))}
          </AnimatePresence>
        </ul>
      ) : categories.length === 0 ? (
        <div className="card p-8 text-center">
          <Tag className="w-10 h-10 text-ink-500 mx-auto mb-3" />
          <p className="text-sm text-ink-300 mb-3">Aucune catégorie pour l'instant.</p>
          <button onClick={() => setEditingCat('new')} className="btn-secondary">
            <Plus className="w-4 h-4" /> Créer la première
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {categories.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                profiles={people}
                onEdit={() => setEditingCat(c)}
                onMembers={() => setMembersCat(c)}
                onRemove={() => removeCategory(c.id)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <AnimatePresence>
        {showInvite && (
          <InviteForm
            profile={profile}
            onClose={() => {
              setShowInvite(false)
              refresh()
            }}
          />
        )}
        {editingCat && (
          <CategoryModal
            initial={editingCat === 'new' ? null : editingCat}
            onClose={() => setEditingCat(null)}
            onSave={saveCategory}
          />
        )}
        {membersCat && (
          <CategoryMembersModal
            category={membersCat}
            profiles={people}
            onClose={() => setMembersCat(null)}
            onSave={async (userIds) => {
              await setCategoryMembers(membersCat.id, userIds)
              setMembersCat(null)
              refresh()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function PersonRow({ person, me, onSetRole, onRemove }) {
  const Icon = ROLE_ICONS[person.role] || UserIcon
  const isSelf = person.id === me.id
  const canChange = canChangeRole(me.role) && !isSelf
  const canDelete = me.role === ROLES.OWNER && !isSelf
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card p-3"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-ink-950 flex-shrink-0"
          style={{ background: person.avatar_color || colorFor(person.id) }}
        >
          {initialsFor(person.full_name || person.email)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {person.full_name || person.email}
            {isSelf && <span className="text-ink-400 font-normal ml-1">(toi)</span>}
          </p>
          <p className="text-[11px] text-ink-400 truncate flex items-center gap-1">
            <Mail className="w-3 h-3" /> {person.email}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={classNames('chip border', ROLE_COLORS[person.role])}>
            <Icon className="w-3 h-3" />
            {ROLE_LABELS[person.role]}
          </span>
          <div className="flex items-center gap-1">
            {canChange && (
              <select
                value={person.role}
                onChange={(e) => onSetRole(person.id, e.target.value)}
                className="text-[10px] bg-ink-900/80 border border-white/10 rounded px-1.5 py-0.5 text-ink-200"
              >
                {person.role !== 'owner' && <option value="owner">→ Owner</option>}
                <option value="admin">→ Admin</option>
                <option value="manager">→ Manager</option>
                <option value="user">→ User</option>
              </select>
            )}
            {canDelete && (
              <button
                onClick={() => onRemove(person.id)}
                className="text-ink-400 hover:text-rose-400 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  )
}

function CategoryRow({ category, profiles, onEdit, onMembers, onRemove }) {
  const memberIds = (category.profile_categories || []).map((m) => m.user_id)
  const members = profiles.filter((p) => memberIds.includes(p.id))
  const color = category.color || '#22d3ee'
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card p-3.5"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: color + '22' }}
        >
          <Tag className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{category.name}</p>
          <p className="text-[11px] text-ink-400 flex items-center gap-1">
            <Users className="w-3 h-3" /> {members.length}{' '}
            {members.length > 1 ? 'personnes' : 'personne'}
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
        <div className="flex items-center gap-0.5">
          <button onClick={onMembers} className="btn-ghost p-2" title="Personnes">
            <Users className="w-4 h-4" />
          </button>
          <button onClick={onEdit} className="btn-ghost p-2" title="Modifier">
            <Pencil className="w-4 h-4" />
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

function CategoryModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || CAT_COLORS[0])
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ name: name.trim(), color })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <h3 className="heading text-lg">
          {initial ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        </h3>
        <input
          autoFocus
          type="text"
          placeholder="Nom (ex. Designers, Commerciaux…)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="input"
        />
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-400 mb-1.5">Couleur</p>
          <div className="flex flex-wrap gap-2 items-center">
            {CAT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={classNames(
                  'w-7 h-7 rounded-full transition',
                  color === c && 'ring-2 ring-white ring-offset-2 ring-offset-ink-950',
                )}
                style={{ background: c }}
              />
            ))}
            <label className="w-7 h-7 rounded-full overflow-hidden border border-white/20 cursor-pointer relative">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <span className="block w-full h-full" style={{ background: color }} />
            </label>
          </div>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? '…' : initial ? 'Enregistrer' : 'Créer'}
        </button>
      </form>
    </Modal>
  )
}

function CategoryMembersModal({ category, profiles, onClose, onSave }) {
  const initial = (category.profile_categories || []).map((m) => m.user_id)
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
      <h3 className="heading text-lg mb-3 pr-8">{category.name} · personnes</h3>
      <ul className="space-y-1.5 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {profiles.map((p) => {
          const on = selected.has(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
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

function InviteForm({ profile, onClose }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState(genPassword())
  const [role, setRole] = useState('user')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      // Appelle l'edge function admin-create-user :
      // - crée le compte avec email DÉJÀ confirmé (pas d'email envoyé)
      // - applique le rôle voulu directement
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      if (!token) throw new Error('Session expirée. Reconnecte-toi.')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email, password, full_name: fullName, role }),
        },
      )
      const payload = await res.json()
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${res.status}`)
      }
      setDone({ email, password })
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal onClose={onClose}>
        <h3 className="heading text-lg mb-3">Compte créé ✓</h3>
        <p className="text-sm text-ink-300 mb-3">
          Donne ces identifiants à l'utilisateur. Il pourra changer son mot de passe ensuite.
        </p>
        <div className="space-y-2 text-sm">
          <div className="p-3 rounded-xl bg-ink-900/80 border border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-1">Email</p>
            <p className="font-mono text-white">{done.email}</p>
          </div>
          <div className="p-3 rounded-xl bg-ink-900/80 border border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-1">
              Mot de passe
            </p>
            <p className="font-mono text-white">{done.password}</p>
          </div>
        </div>
        <button onClick={onClose} className="btn-primary w-full mt-4">
          Terminé
        </button>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <h3 className="heading text-lg mb-1">Nouveau membre</h3>
        <p className="text-xs text-ink-400 mb-2">
          Un compte sera créé. Tu pourras lui envoyer ses identifiants.
        </p>
        <input
          type="text"
          placeholder="Nom complet"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="input"
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="input"
        />
        <div className="relative">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="input pr-20 font-mono"
          />
          <button
            type="button"
            onClick={() => setPassword(genPassword())}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-widest text-neon-cyan font-bold px-2 py-1 hover:bg-white/5 rounded"
          >
            Auto
          </button>
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
          <option value="user">Utilisateur</option>
          <option value="manager">Manager</option>
          {profile.role === 'owner' && <option value="admin">Administrateur</option>}
        </select>

        {err && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {err}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? 'Création…' : 'Créer le compte'}
        </button>
      </form>
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
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 btn-ghost p-1.5"
        >
          <X className="w-4 h-4" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  )
}

function Forbidden() {
  return (
    <div className="card p-8 text-center">
      <Shield className="w-10 h-10 text-ink-400 mx-auto mb-3" />
      <p className="text-sm text-ink-300">Accès réservé aux administrateurs.</p>
    </div>
  )
}

function genPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}
