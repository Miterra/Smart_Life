import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckSquare,
  Calendar as CalendarIcon,
  MessagesSquare,
  Wallet,
  Settings as SettingsIcon,
  LogOut,
  Users,
} from 'lucide-react'
import { signOut } from '../lib/auth'
import { initialsFor } from '../lib/utils'
import { isAdminOrOwner, canViewFinance, ROLE_LABELS } from '../lib/roles'
import { classNames } from '../lib/utils'

const TABS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tâches', icon: CheckSquare },
  { to: '/calendar', label: 'Agenda', icon: CalendarIcon },
  { to: '/groups', label: 'Groupes', icon: MessagesSquare },
]

export default function Layout({ profile, children }) {
  const location = useLocation()
  const isAdmin = isAdminOrOwner(profile?.role)
  const tabs = canViewFinance(profile?.role)
    ? [...TABS, { to: '/finance', label: 'Finance', icon: Wallet }]
    : TABS

  return (
    <div className="min-h-screen flex flex-col pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-30 pt-safe">
        <div className="glass-strong border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="relative">
                <div className="absolute inset-0 bg-neon-magenta/40 blur-md rounded-xl" />
                <img src="/icon.svg" alt="Smart Life" className="relative w-9 h-9 rounded-xl" />
              </div>
              <div>
                <div className="heading text-sm font-bold leading-tight">Smart Life</div>
                <div className="text-[10px] uppercase tracking-widest text-ink-400 leading-tight">
                  Dashboard
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <NavLink
                  to="/people"
                  className={({ isActive }) =>
                    classNames(
                      'btn-ghost px-2.5 py-2',
                      isActive && 'text-neon-cyan bg-white/5',
                    )
                  }
                  title="Personnes"
                >
                  <Users className="w-4 h-4" />
                </NavLink>
              )}
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  classNames('btn-ghost px-2.5 py-2', isActive && 'text-neon-cyan bg-white/5')
                }
                title="Paramètres"
              >
                <SettingsIcon className="w-4 h-4" />
              </NavLink>
              <UserChip profile={profile} />
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div key={location.pathname} className="max-w-3xl mx-auto px-4 py-4 animate-[fadeIn_.25s_ease-out]">
          {children}
        </div>
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-30 pb-safe">
        <div className="glass-strong border-t border-white/5">
          <div className="max-w-3xl mx-auto px-2 flex">
            {tabs.map((t) => {
              const Icon = t.icon
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.to === '/'}
                  className={({ isActive }) =>
                    classNames('nav-tab', isActive && 'nav-tab-active')
                  }
                >
                  <Icon className="w-5 h-5" strokeWidth={2.2} />
                  <span>{t.label}</span>
                </NavLink>
              )
            })}
          </div>
        </div>
      </nav>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  )
}

function UserChip({ profile }) {
  const role = profile?.role || 'user'
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-ink-950"
        style={{ background: profile?.avatar_color || '#22d3ee' }}
      >
        {initialsFor(profile?.full_name || profile?.email || '')}
      </div>
      <button
        onClick={signOut}
        className="btn-ghost px-2 py-1.5"
        title={`Déconnexion (${ROLE_LABELS[role]})`}
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  )
}
