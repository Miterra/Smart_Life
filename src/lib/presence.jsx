/* ============================================================
 *  Présence en ligne
 *  - Chaque client "bat le cœur" (heartbeat) toutes les TICK_MS :
 *    met à jour profiles.last_seen et récupère le last_seen de tous.
 *  - En ligne = vu il y a moins de ONLINE_WINDOW_MS.
 *  - Le contexte expose isOnline(id) + lastSeenAt(id) + un "now" qui
 *    avance régulièrement pour rafraîchir les durées affichées.
 * ============================================================ */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { heartbeat, listPresence } from './repository'

const ONLINE_WINDOW_MS = 75_000 // en ligne si vu il y a < 75 s
const TICK_MS = 30_000 // heartbeat + refetch toutes les 30 s
const CLOCK_MS = 20_000 // avance "now" pour rafraîchir les "vu il y a…"

const PresenceCtx = createContext({
  now: Date.now(),
  isOnline: () => false,
  lastSeenAt: () => null,
})

export function PresenceProvider({ enabled = true, children }) {
  const [lastSeen, setLastSeen] = useState({}) // { [id]: ms }
  const [now, setNow] = useState(() => Date.now())
  const timer = useRef(null)

  const pulse = useCallback(async () => {
    try {
      await heartbeat()
    } catch {
      /* hors-ligne : on ignore */
    }
    try {
      const rows = await listPresence()
      const map = {}
      for (const r of rows || []) map[r.id] = r.last_seen ? new Date(r.last_seen).getTime() : 0
      setLastSeen(map)
    } catch {
      /* ignore */
    }
    setNow(Date.now())
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    pulse()
    timer.current = setInterval(pulse, TICK_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') pulse()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(timer.current)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, pulse])

  // Horloge locale : fait avancer les durées sans refetch.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => clearInterval(t)
  }, [])

  const isOnline = useCallback(
    (id) => {
      const ls = lastSeen[id]
      return !!ls && now - ls < ONLINE_WINDOW_MS
    },
    [lastSeen, now],
  )

  const lastSeenAt = useCallback(
    (id) => {
      const ls = lastSeen[id]
      return ls ? new Date(ls) : null
    },
    [lastSeen],
  )

  return (
    <PresenceCtx.Provider value={{ now, isOnline, lastSeenAt }}>{children}</PresenceCtx.Provider>
  )
}

export function usePresence() {
  return useContext(PresenceCtx)
}

/** Libellé "En ligne" ou "vu il y a X" (ou null si jamais vu). */
export function presenceLabel(isOnline, lastSeen) {
  if (isOnline) return 'En ligne'
  if (!lastSeen) return null
  return `vu ${formatDistanceToNow(lastSeen, { addSuffix: true, locale: fr })}`
}
