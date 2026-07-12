import { Link, NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
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
import { isAdminOrOwner, canViewPeople, isAliasAccount, ROLE_LABELS } from '../lib/roles'
import { classNames } from '../lib/utils'
import Avatar from './Avatar'

const TABS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tâches', icon: CheckSquare },
  { to: '/calendar', label: 'Agenda', icon: CalendarIcon },
  { to: '/groups', label: 'Groupes', icon: MessagesSquare },
]

export default function Layout({ profile, financeEnabled = false, children }) {
  const location = useLocation()
  const isAdmin = isAdminOrOwner(profile?.role)
  const showPeople = canViewPeople(profile?.role) || isAliasAccount(profile?.email)
  const tabs = financeEnabled
    ? [...TABS, { to: '/finance', label: 'Finance', icon: Wallet }]
    : TABS

  // Liens secondaires : icônes du header sur mobile, bas de la sidebar sur PC.
  const secondary = [
    ...(isAdmin ? [{ to: '/history', label: 'Historique', icon: HistoryIcon }] : []),
    ...(showPeople ? [{ to: '/people', label: 'Personnes', icon: Users }] : []),
    { to: '/settings', label: 'Paramètres', icon: SettingsIcon },
  ]

  return (
    <div className="min-h-screen flex flex-col pb-24 lg:pb-0 lg:pl-64">
      {/* Sidebar (PC / grand écran) */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 z-40 glass-strong border-r border-fg/5 p-4">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-1.5 mb-6">
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

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {tabs.map((t) => (
            <SideLink key={t.to} {...t} end={t.to === '/'} />
          ))}
          <div className="h-px bg-fg/5 my-3" />
          {secondary.map((t) => (
            <SideLink key={t.to} {...t} />
          ))}
        </nav>

        <div className="mt-4 pt-4 border-t border-fg/5 flex items-center gap-2.5">
          <Avatar profile={profile} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-fg truncate">
              {profile?.full_name || profile?.email}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-ink-400">
              {ROLE_LABELS[profile?.role || 'user']}
            </p>
          </div>
          <motion.button
            onClick={signOut}
            whileTap={{ scale: 0.85 }}
            className="btn-ghost p-2"
            title="Déconnexion"
          >
            <LogOut className="w-4 h-4" />
          </motion.button>
        </div>
      </aside>

      {/* Top bar (mobile / tablette) */}
      <header className="sticky top-0 z-30 pt-safe lg:hidden">
        <div className="glass-strong border-b border-fg/5">
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
                <HeaderLink to="/history" title="Historique">
                  <HistoryIcon className="w-4 h-4" />
                </HeaderLink>
              )}
              {showPeople && (
                <HeaderLink to="/people" title="Personnes">
                  <Users className="w-4 h-4" />
                </HeaderLink>
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
        <div className="max-w-3xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-4 lg:py-8 w-full">
          {/* Page transition: keyed motion.div replays the enter fade on each
              route change. No AnimatePresence/`mode="wait"` here — its exit-wait
              deadlocks when the outgoing page (e.g. the chat view) updates state
              mid-exit, leaving the next tab on a black screen. */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </div>
      </main>

      {/* Bottom tab bar (mobile / tablette) */}
      <nav className="fixed bottom-0 inset-x-0 z-30 pb-safe lg:hidden">
        <div className="glass-strong border-t border-fg/5">
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

/** Lien de la sidebar PC. */
function SideLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        classNames(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
          isActive
            ? 'bg-neon-cyan/10 text-neon-cyan'
            : 'text-ink-300 hover:text-fg hover:bg-fg/5',
        )
      }
    >
      <Icon className="w-5 h-5" strokeWidth={2.2} />
      {label}
    </NavLink>
  )
}

function HeaderLink({ to, title, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        classNames('btn-ghost px-2.5 py-2', isActive && 'text-neon-cyan bg-fg/5')
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
