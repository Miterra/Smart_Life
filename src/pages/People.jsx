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
} from 'lucide-react'
import { listProfiles, updateProfile, subscribeRealtime } from '../lib/repository'
import { supabase } from '../lib/supabase'
import { signUp } from '../lib/auth'
import { ROLE_LABELS, ROLE_COLORS, ROLES, isAdminOrOwner, canChangeRole } from '../lib/roles'
import { classNames, initialsFor, colorFor } from '../lib/utils'

const ROLE_ICONS = { owner: Crown, admin: Shield, manager: UserCog, user: UserIcon }

export default function People({ profile }) {
  const [people, setPeople] = useState([])
  const [showInvite, setShowInvite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const refresh = async () => {
    try {
      const list = await listProfiles()
      setPeople(list)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const sub = subscribeRealtime(['profiles'], refresh)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading text-2xl">Personnes</h1>
          <p className="text-xs text-ink-400 mt-1">
            {people.length} {people.length > 1 ? 'membres' : 'membre'}
          </p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Inviter
        </button>
      </div>

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
      ) : (
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
      // Crée le compte (un trigger Postgres créera le profil avec role=user).
      // Le owner peut ensuite mettre à jour le rôle.
      await signUp(email, password, fullName)
      // Petit délai pour laisser le trigger Postgres tourner
      await new Promise((r) => setTimeout(r, 600))
      if (role !== 'user') {
        const { data: target } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle()
        if (target?.id) {
          await updateProfile(target.id, { role })
        }
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
        className="glass-strong rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 pb-safe border border-white/10"
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
