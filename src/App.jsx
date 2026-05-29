import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import Layout from './components/Layout'
import AuthGate from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import Calendar from './pages/Calendar'
import Finance from './pages/Finance'
import People from './pages/People'
import Groups from './pages/Groups'
import Settings from './pages/Settings'
import History from './pages/History'
import Splash from './components/Splash'
import { canViewFinance, isAdminOrOwner } from './lib/roles'
import { setCurrentActor } from './lib/repository'

export default function App() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    setCurrentActor(profile)
  }, [profile])

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
        <Route path="/groups" element={<Groups profile={profile} />} />
        <Route
          path="/finance"
          element={canViewFinance(profile.role) ? <Finance profile={profile} /> : <Navigate to="/" replace />}
        />
        <Route path="/people" element={<People profile={profile} />} />
        <Route
          path="/history"
          element={isAdminOrOwner(profile.role) ? <History profile={profile} /> : <Navigate to="/" replace />}
        />
        <Route path="/settings" element={<Settings profile={profile} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
