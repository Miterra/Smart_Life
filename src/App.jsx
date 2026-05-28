import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import Layout from './components/Layout'
import AuthGate from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import Calendar from './pages/Calendar'
import Social from './pages/Social'
import Visuals from './pages/Visuals'
import People from './pages/People'
import Groups from './pages/Groups'
import Settings from './pages/Settings'
import Splash from './components/Splash'

export default function App() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div className="card max-w-md p-8">
          <h1 className="heading text-2xl mb-3">Configuration requise</h1>
          <p className="text-ink-300 text-sm leading-relaxed">
            Copie <code className="text-neon-cyan">.env.example</code> vers{' '}
            <code className="text-neon-cyan">.env.local</code> et renseigne ton URL et anon key
            Supabase. Puis relance <code className="text-neon-cyan">npm run dev</code>.
          </p>
        </div>
      </div>
    )
  }

  if (loading) return <Splash />

  if (!session) return <AuthGate />

  if (!profile) return <Splash label="Création du profil…" />

  return (
    <Layout profile={profile}>
      <Routes>
        <Route path="/" element={<Dashboard profile={profile} />} />
        <Route path="/tasks" element={<Tasks profile={profile} />} />
        <Route path="/calendar" element={<Calendar profile={profile} />} />
        <Route path="/social" element={<Social />} />
        <Route path="/visuals" element={<Visuals profile={profile} />} />
        <Route path="/people" element={<People profile={profile} />} />
        <Route path="/groups" element={<Groups profile={profile} />} />
        <Route path="/settings" element={<Settings profile={profile} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
