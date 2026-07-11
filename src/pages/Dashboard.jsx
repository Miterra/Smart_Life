import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Clock,
  Flame,
  Sparkles,
  Bell,
  AlertTriangle,
  CalendarClock,
  MapPin,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { listInsights, listTasks, listAppointments, subscribeRealtime } from '../lib/repository'
import { fmtShort, classNames, PRIORITY, STATUS } from '../lib/utils'
import { isStandalone, isIos, getPermissionStatus } from '../lib/notifications'

export default function Dashboard({ profile }) {
  const [tasks, setTasks] = useState([])
  const [insights, setInsights] = useState([])
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const [t, i, a] = await Promise.all([listTasks(), listInsights(8), listAppointments()])
      if (!alive) return
      setTasks(t)
      setInsights(i)
      setAppointments(a)
      setLoading(false)
    }
    load().catch((e) => {
      console.error(e)
      if (alive) setLoading(false)
    })

    const sub = subscribeRealtime(['tasks', 'insights', 'appointments'], () =>
      load().catch(console.error),
    )
    return () => {
      alive = false
      sub.unsubscribe()
    }
  }, [])

  const todayTasks = useMemo(() => {
    const today = new Date().toDateString()
    return tasks.filter(
      (t) =>
        t.assigned_to === profile.id &&
        t.status !== 'done' &&
        t.due_at &&
        new Date(t.due_at).toDateString() === today,
    )
  }, [tasks, profile.id])

  const myTasks = useMemo(
    () => tasks.filter((t) => t.assigned_to === profile.id && t.status !== 'done'),
    [tasks, profile.id],
  )

  const upcomingRdv = useMemo(() => {
    const now = Date.now()
    return appointments
      .filter((a) => new Date(a.start_at).getTime() >= now - 3600000)
      .slice(0, 4)
  }, [appointments])

  const productivityScore = useMemo(() => computeScore(tasks), [tasks])

  return (
    <div className="space-y-4">
      <PushBanner />

      <Greeting profile={profile} />

      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <ProductivityCard score={productivityScore} />
        <StatsCard tasks={tasks} myTasks={myTasks} profile={profile} />
      </div>

      {/* PC : tâches du jour et prochains RDV côte à côte. */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
      <Section
        title="Mes tâches aujourd'hui"
        action={
          <Link to="/tasks" className="text-xs text-neon-cyan font-semibold">
            Voir tout →
          </Link>
        }
      >
        {loading ? (
          <SkeletonList />
        ) : todayTasks.length === 0 ? (
          <Empty label="Rien de prévu aujourd'hui. Profite-en. 🌿" />
        ) : (
          <div className="space-y-2">
            {todayTasks.slice(0, 5).map((t) => (
              <MiniTask key={t.id} task={t} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Prochains RDV"
        icon={CalendarClock}
        action={
          <Link to="/calendar" className="text-xs text-neon-cyan font-semibold">
            Agenda →
          </Link>
        }
      >
        {loading ? (
          <SkeletonList />
        ) : upcomingRdv.length === 0 ? (
          <Empty label="Aucun rendez-vous à venir." />
        ) : (
          <div className="space-y-2">
            {upcomingRdv.map((a) => (
              <MiniRdv key={a.id} rdv={a} />
            ))}
          </div>
        )}
      </Section>
      </div>

      <Section title="Insights" icon={Sparkles}>
        {loading ? (
          <SkeletonList />
        ) : insights.length === 0 ? (
          <Empty label="Pas encore d'insights. Crée une tâche pour démarrer." />
        ) : (
          <div className="space-y-2">
            {insights.slice(0, 4).map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function Greeting({ profile }) {
  const hour = new Date().getHours()
  const greeting = hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const name = profile?.full_name?.split(' ')[0] || ''
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="text-ink-300 text-xs uppercase tracking-widest mb-1">{greeting}</p>
      <h1 className="heading text-2xl">
        {name ? `${name}, prêt à avancer ?` : 'Prêt à avancer ?'}
      </h1>
    </motion.div>
  )
}

function PushBanner() {
  const [perm, setPerm] = useState('default')
  const [dismissed, setDismissed] = useState(() => {
    const at = localStorage.getItem('pushBannerDismissedAt')
    if (!at) return false
    return Date.now() - new Date(at).getTime() < 7 * 86400000
  })
  useEffect(() => {
    setPerm(getPermissionStatus())
  }, [])
  if (dismissed) return null
  if (perm === 'granted') return null

  const iosNeedsInstall = isIos() && !isStandalone()
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4 border-neon-cyan/20 bg-neon-cyan/5"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-neon-cyan/15 flex items-center justify-center flex-shrink-0">
          <Bell className="w-4 h-4 text-neon-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight mb-1">
            {iosNeedsInstall ? 'Installe Smart Life sur ton iPhone' : 'Active les notifications'}
          </p>
          <p className="text-xs text-ink-300 leading-snug">
            {iosNeedsInstall
              ? "Safari → Partager → Sur l'écran d'accueil. Tu pourras ensuite recevoir les rappels."
              : 'Pour recevoir les rappels de tâches et de RDV.'}
          </p>
          {!iosNeedsInstall && (
            <Link
              to="/settings"
              className="inline-block mt-2 text-xs font-semibold text-neon-cyan hover:underline"
            >
              Activer maintenant →
            </Link>
          )}
        </div>
        <button
          onClick={() => {
            localStorage.setItem('pushBannerDismissedAt', new Date().toISOString())
            setDismissed(true)
          }}
          aria-label="Fermer"
          className="text-ink-400 hover:text-white text-xs"
        >
          ✕
        </button>
      </div>
    </motion.div>
  )
}

function ProductivityCard({ score }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card p-4 relative overflow-hidden"
    >
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-neon-cyan/15 blur-3xl rounded-full" />
      <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-1.5">
        Productivité
      </p>
      <div className="flex items-end gap-1.5 mb-1.5">
        <span className="heading text-4xl font-bold bg-gradient-to-br from-neon-cyan to-cyan-300 bg-clip-text text-transparent">
          {score}
        </span>
        <span className="text-ink-400 text-xs mb-1.5">/ 100</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-neon-cyan to-neon-magenta"
        />
      </div>
    </motion.div>
  )
}

function StatsCard({ tasks, myTasks, profile }) {
  const done = tasks.filter((t) => t.assigned_to === profile.id && t.status === 'done').length
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.05 }}
      className="card p-4"
    >
      <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-2">Mes tâches</p>
      <div className="space-y-1">
        <Stat icon={Clock} label="En cours" value={myTasks.filter((t) => t.status === 'in_progress').length} />
        <Stat icon={Flame} label="À faire" value={myTasks.filter((t) => t.status === 'todo').length} />
        <Stat icon={CheckCircle2} label="Terminées" value={done} />
      </div>
    </motion.div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-ink-300">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      <span className="font-bold text-white">{value}</span>
    </div>
  )
}

function MiniTask({ task }) {
  const stat = STATUS[task.status] || STATUS.todo
  return (
    <Link
      to="/tasks"
      className="flex items-center gap-3 p-3 rounded-xl bg-ink-800/40 hover:bg-ink-800/70 transition"
    >
      <div className={classNames('w-1 self-stretch rounded-full', prioBar(task.priority))} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{task.title}</p>
        <p className="text-xs text-ink-400">{fmtShort(task.due_at)}</p>
      </div>
      <span className={classNames('chip border', stat.cls)}>{stat.label}</span>
    </Link>
  )
}

function MiniRdv({ rdv }) {
  return (
    <Link
      to="/calendar"
      className="flex items-center gap-3 p-3 rounded-xl bg-ink-800/40 hover:bg-ink-800/70 transition"
    >
      <div className="w-1 self-stretch rounded-full bg-neon-magenta" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{rdv.title}</p>
        <p className="text-xs text-ink-400 flex items-center gap-2">
          <span>{fmtShort(rdv.start_at)}</span>
          {rdv.location && (
            <span className="flex items-center gap-0.5 truncate">
              <MapPin className="w-3 h-3" /> {rdv.location}
            </span>
          )}
        </p>
      </div>
    </Link>
  )
}

function prioBar(p) {
  if (p === 'critical') return 'bg-neon-rose'
  if (p === 'important') return 'bg-neon-amber'
  return 'bg-neon-cyan'
}

function InsightCard({ insight }) {
  const tone =
    insight.tone === 'danger'
      ? 'border-rose-500/30 bg-rose-500/5'
      : insight.tone === 'warning'
      ? 'border-amber-500/30 bg-amber-500/5'
      : insight.tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : 'border-cyan-500/30 bg-cyan-500/5'
  const Icon = insight.tone === 'danger' || insight.tone === 'warning' ? AlertTriangle : Sparkles
  return (
    <div className={classNames('card p-3.5 border', tone)}>
      <div className="flex items-start gap-2.5">
        <Icon className="w-4 h-4 text-ink-200 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{insight.title}</p>
          {insight.body && (
            <p className="text-xs text-ink-300 mt-1 leading-relaxed">{insight.body}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, action, children }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-neon-cyan" />}
          <h2 className="heading text-sm font-bold uppercase tracking-wider">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ label }) {
  return (
    <div className="card p-5 text-center text-sm text-ink-400 leading-relaxed">{label}</div>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 rounded-xl bg-ink-800/40 animate-pulse" />
      ))}
    </div>
  )
}

/* ---------- helpers ---------- */
function computeScore(tasks) {
  if (tasks.length === 0) return 0
  const recent = tasks.filter((t) => {
    const d = new Date(t.updated_at || t.created_at)
    return Date.now() - d.getTime() < 7 * 86400000
  })
  if (recent.length === 0) return 50
  const done = recent.filter((t) => t.status === 'done').length
  const overdue = recent.filter(
    (t) => t.due_at && t.status !== 'done' && new Date(t.due_at) < new Date(),
  ).length
  const base = (done / recent.length) * 100
  return Math.max(0, Math.min(100, Math.round(base - overdue * 8)))
}
