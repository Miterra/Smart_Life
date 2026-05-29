import { Link, NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  CheckSquare,
  Calendar as CalendarIcon,
  MessagesSquare,
  Wallet,
  Settings as SettingsIcon,
  LogOut,
  Users,
  History as HistoryIcon,
} from 'lucide-react'
import { signOut } from '../lib/auth'
import { isAdminOrOwner, canViewFinance, ROLE_LABELS } from '../lib/roles'
import { classNames } from '../lib/utils'
import Avatar from './Avatar'

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
                <>
                  <HeaderLink to="/history" title="Historique">
                    <HistoryIcon className="w-4 h-4" />
                  </HeaderLink>
                  <HeaderLink to="/people" title="Personnes">
                    <Users className="w-4 h-4" />
                  </HeaderLink>
                </>
              )}
              <HeaderLink to="/settings" title="Paramètres">
                <SettingsIcon className="w-4 h-4" />
              </HeaderLink>
              <UserChip profile={profile} />
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
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
                    classNames('nav-tab relative', isActive && 'nav-tab-active')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="navActiveBar"
                          className="absolute -top-px inset-x-4 h-0.5 rounded-full bg-neon-cyan shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}
                      <motion.span
                        className="flex flex-col items-center gap-0.5"
                        whileTap={{ scale: 0.82 }}
                        animate={{ scale: isActive ? 1.05 : 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                      >
                        <Icon className="w-5 h-5" strokeWidth={2.2} />
                        <span>{t.label}</span>
                      </motion.span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </div>
      </nav>
    </div>
  )
}

function HeaderLink({ to, title, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        classNames('btn-ghost px-2.5 py-2', isActive && 'text-neon-cyan bg-white/5')
      }
      title={title}
    >
      <motion.span className="flex" whileTap={{ scale: 0.85 }}>
        {children}
      </motion.span>
    </NavLink>
  )
}

function UserChip({ profile }) {
  const role = profile?.role || 'user'
  return (
    <div className="flex items-center gap-2">
      <Avatar profile={profile} size={32} />
      <motion.button
        onClick={signOut}
        whileTap={{ scale: 0.85 }}
        className="btn-ghost px-2 py-1.5"
        title={`Déconnexion (${ROLE_LABELS[role]})`}
      >
        <LogOut className="w-4 h-4" />
      </motion.button>
    </div>
  )
}
