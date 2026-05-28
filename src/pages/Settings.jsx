import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bell,
  BellOff,
  Smartphone,
  Check,
  AlertCircle,
  Sparkles,
  LogOut,
  User as UserIcon,
} from 'lucide-react'
import {
  enableNotifications,
  unsubscribePush,
  getPermissionStatus,
  notificationsSupported,
  isIos,
  isStandalone,
  showLocalNotification,
} from '../lib/notifications'
import { updateProfile } from '../lib/repository'
import { signOut } from '../lib/auth'
import { ROLE_LABELS } from '../lib/roles'
import { classNames, initialsFor } from '../lib/utils'

export default function Settings({ profile }) {
  const [perm, setPerm] = useState('default')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [pushPref, setPushPref] = useState(profile.push_enabled !== false)
  const [savingProf, setSavingProf] = useState(false)

  useEffect(() => {
    setPerm(getPermissionStatus())
  }, [])

  const activate = async () => {
    setBusy(true)
    setMsg(null)
    const res = await enableNotifications(profile.id)
    setBusy(false)
    setPerm(getPermissionStatus())
    if (res.ok) {
      setMsg({ type: 'success', text: 'Notifications activées sur ce device.' })
    } else {
      setMsg({ type: 'error', text: res.error || 'Échec activation.' })
    }
  }

  const deactivate = async () => {
    setBusy(true)
    try {
      await unsubscribePush()
      setMsg({ type: 'success', text: 'Désabonné de ce device.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
      setPerm(getPermissionStatus())
    }
  }

  const testNotif = async () => {
    await showLocalNotification({
      title: '🎉 Test Smart Life',
      body: 'Si tu vois ça, les notifs marchent.',
      tag: 'test',
      url: '/',
    })
  }

  const saveProfile = async () => {
    setSavingProf(true)
    try {
      await updateProfile(profile.id, { full_name: fullName, push_enabled: pushPref })
      setMsg({ type: 'success', text: 'Profil mis à jour.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSavingProf(false)
    }
  }

  const supported = notificationsSupported()
  const ios = isIos()
  const standalone = isStandalone()
  const iosNeedsInstall = ios && !standalone

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading text-2xl">Paramètres</h1>
        <p className="text-xs text-ink-400 mt-1">Notifications, profil, déconnexion.</p>
      </div>

      {msg && (
        <div
          className={classNames(
            'flex items-start gap-2 p-3 rounded-xl border text-xs',
            msg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-200',
          )}
        >
          {msg.type === 'success' ? (
            <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          )}
          {msg.text}
        </div>
      )}

      <Section title="Profil" icon={UserIcon}>
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-ink-950"
              style={{ background: profile.avatar_color || '#22d3ee' }}
            >
              {initialsFor(profile.full_name || profile.email)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-ink-400">
                {ROLE_LABELS[profile.role]}
              </p>
              <p className="text-sm text-white truncate">{profile.email}</p>
            </div>
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
              Nom complet
            </span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
            />
          </label>
          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-ink-900/60 border border-white/5">
            <div>
              <p className="text-sm text-white font-medium">Recevoir les notifications</p>
              <p className="text-[11px] text-ink-400">
                Désactive pour ne plus recevoir de push sur tes devices.
              </p>
            </div>
            <input
              type="checkbox"
              checked={pushPref}
              onChange={(e) => setPushPref(e.target.checked)}
              className="w-5 h-5 accent-neon-cyan"
            />
          </label>
          <button onClick={saveProfile} className="btn-primary w-full" disabled={savingProf}>
            {savingProf ? '…' : 'Enregistrer'}
          </button>
        </div>
      </Section>

      <Section title="Notifications" icon={Bell}>
        <div className="card p-4 space-y-3">
          {!supported && (
            <p className="text-xs text-ink-300">
              Ton navigateur ne supporte pas les notifications Web Push.
            </p>
          )}
          {iosNeedsInstall && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <Smartphone className="w-4 h-4 text-neon-amber flex-shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-semibold text-white mb-1">Installation requise (iOS)</p>
                <p className="text-ink-300">
                  Ouvre Smart Life dans Safari → bouton Partager → « Sur l'écran d'accueil ».
                  Relance l'app depuis l'icône, puis active ici.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Statut de ce device</p>
              <p className="text-[11px] text-ink-400">
                {perm === 'granted'
                  ? 'Autorisé — tu reçois les push.'
                  : perm === 'denied'
                  ? 'Bloqué — réactive dans les paramètres système.'
                  : 'Non activé.'}
              </p>
            </div>
            <span
              className={classNames(
                'chip border',
                perm === 'granted'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-white/5 text-ink-300 border-white/10',
              )}
            >
              {perm}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {perm !== 'granted' && (
              <button
                onClick={activate}
                disabled={busy || !supported || iosNeedsInstall}
                className="btn-primary w-full"
              >
                <Bell className="w-4 h-4" /> {busy ? 'Activation…' : 'Activer sur ce device'}
              </button>
            )}
            {perm === 'granted' && (
              <>
                <button onClick={testNotif} className="btn-secondary w-full">
                  <Sparkles className="w-4 h-4" /> Tester une notification locale
                </button>
                <button
                  onClick={deactivate}
                  disabled={busy}
                  className="btn-ghost w-full text-rose-300"
                >
                  <BellOff className="w-4 h-4" /> Désactiver sur ce device
                </button>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title="Session">
        <button onClick={signOut} className="btn-secondary w-full">
          <LogOut className="w-4 h-4" /> Se déconnecter
        </button>
      </Section>

      <p className="text-center text-[10px] text-ink-500 mt-6">
        Smart Life Dashboard · v1.0.0
      </p>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2.5 px-1">
        {Icon && <Icon className="w-4 h-4 text-neon-cyan" />}
        <h2 className="heading text-sm font-bold uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </section>
  )
}
