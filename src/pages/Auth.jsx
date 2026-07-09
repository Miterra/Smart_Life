import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Lock, User as UserIcon, LogIn, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react'
import { signIn, signUp } from '../lib/auth'

export default function AuthGate() {
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setStatus('submitting')
    setError('')
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        const data = await signUp(email, password, fullName)
        // Confirmation email activée : pas de session, l'app ne bascule pas.
        if (!data?.session) {
          setNeedsConfirm(true)
        }
      }
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.')
      setStatus('error')
      return
    }
    setStatus('success')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card w-full max-w-sm p-7"
      >
        <div className="flex flex-col items-center text-center mb-7">
          <div className="relative mb-3">
            <div className="absolute inset-0 bg-neon-cyan/30 blur-2xl rounded-full" />
            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center font-display font-bold text-ink-950 text-2xl">
              S
            </div>
          </div>
          <h1 className="heading text-2xl mb-1">Smart Life</h1>
          <p className="text-ink-300 text-sm">
            {mode === 'signin'
              ? 'Connecte-toi à ton tableau de bord.'
              : 'Crée ton compte. Le premier inscrit devient propriétaire.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <Field
              icon={UserIcon}
              type="text"
              placeholder="Nom complet"
              value={fullName}
              onChange={setFullName}
              autoComplete="name"
              required
            />
          )}
          <Field
            icon={Mail}
            type="email"
            placeholder="Email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            required
          />
          <Field
            icon={Lock}
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {needsConfirm && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Compte créé — vérifie tes emails pour confirmer ton adresse.</span>
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={status === 'submitting'}>
            {mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {status === 'submitting'
              ? '…'
              : mode === 'signin'
              ? 'Se connecter'
              : 'Créer mon compte'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError('')
            setNeedsConfirm(false)
          }}
          className="w-full mt-4 text-xs text-ink-300 hover:text-white transition"
        >
          {mode === 'signin'
            ? "Pas encore de compte ? S'inscrire"
            : 'Déjà un compte ? Se connecter'}
        </button>
      </motion.div>
    </div>
  )
}

function Field({ icon: Icon, type, placeholder, value, onChange, required, minLength, autoComplete, inputMode, autoCapitalize }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
      <input
        type={type}
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        className="input pl-10"
      />
    </div>
  )
}
