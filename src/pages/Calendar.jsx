import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalIcon,
  Clock,
} from 'lucide-react'
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { listTasks, subscribeRealtime } from '../lib/repository'
import { classNames, PRIORITY } from '../lib/utils'

export default function Calendar({ profile }) {
  const [month, setMonth] = useState(new Date())
  const [tasks, setTasks] = useState([])
  const [selected, setSelected] = useState(new Date())

  useEffect(() => {
    listTasks().then(setTasks).catch(console.error)
    const sub = subscribeRealtime(['tasks'], async () => setTasks(await listTasks()))
    return () => sub.unsubscribe()
  }, [])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const tasksByDay = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      if (!t.due_at) continue
      const key = new Date(t.due_at).toDateString()
      if (!map[key]) map[key] = []
      map[key].push(t)
    }
    return map
  }, [tasks])

  const selectedTasks = tasksByDay[selected.toDateString()] || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading text-2xl">Agenda</h1>
          <p className="text-xs text-ink-400 mt-1 capitalize">
            {format(month, 'MMMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-ghost p-2" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setMonth(new Date())
              setSelected(new Date())
            }}
            className="text-xs uppercase tracking-widest text-ink-300 px-2"
          >
            Aujourd'hui
          </button>
          <button className="btn-ghost p-2" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="card p-3">
        <div className="grid grid-cols-7 gap-0.5 mb-1.5 text-[10px] uppercase tracking-widest text-ink-400 text-center">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((d) => {
            const inMonth = isSameMonth(d, month)
            const isSel = isSameDay(d, selected)
            const today = isToday(d)
            const dayTasks = tasksByDay[d.toDateString()] || []
            const colors = [...new Set(dayTasks.map((t) => t.priority))]
            return (
              <motion.button
                key={d.toISOString()}
                whileTap={{ scale: 0.92 }}
                onClick={() => setSelected(d)}
                className={classNames(
                  'aspect-square rounded-lg flex flex-col items-center justify-center relative transition',
                  inMonth ? 'text-white' : 'text-ink-500',
                  isSel && 'bg-neon-cyan/20 ring-1 ring-neon-cyan/50',
                  !isSel && today && 'bg-white/10',
                  !isSel && !today && 'hover:bg-white/5',
                )}
              >
                <span className={classNames('text-xs font-semibold', today && 'text-neon-cyan')}>
                  {format(d, 'd')}
                </span>
                {dayTasks.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {colors.slice(0, 3).map((p, i) => (
                      <span
                        key={i}
                        className={classNames('w-1 h-1 rounded-full', priorityDot(p))}
                      />
                    ))}
                  </div>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2.5 px-1">
          <CalIcon className="w-4 h-4 text-neon-cyan" />
          <h2 className="heading text-sm font-bold uppercase tracking-wider">
            {format(selected, "EEEE d MMMM", { locale: fr })}
          </h2>
        </div>
        {selectedTasks.length === 0 ? (
          <div className="card p-5 text-center text-sm text-ink-400">
            Aucune échéance ce jour.
          </div>
        ) : (
          <ul className="space-y-2">
            {selectedTasks.map((t) => (
              <DayTask key={t.id} task={t} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function DayTask({ task }) {
  const prio = PRIORITY[task.priority] || PRIORITY.important
  return (
    <li className="card p-3 flex items-start gap-3">
      <div className={classNames('w-1 self-stretch rounded-full', priorityDot(task.priority))} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{task.title}</p>
        {task.description && <p className="text-xs text-ink-300 mt-1">{task.description}</p>}
        <div className="flex items-center gap-2 mt-1.5 text-xs text-ink-400">
          <Clock className="w-3 h-3" />
          {format(new Date(task.due_at), 'HH:mm')}
        </div>
      </div>
      <span className={classNames('chip border', prio.cls)}>{prio.label}</span>
    </li>
  )
}

function priorityDot(p) {
  if (p === 'critical') return 'bg-neon-rose'
  if (p === 'important') return 'bg-neon-amber'
  return 'bg-neon-cyan'
}
