import { useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { motion } from 'framer-motion'
import { TrendingUp, Plus, Instagram } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  listSocialHistory,
  insertSocialPoint,
  subscribeRealtime,
} from '../lib/repository'

const IG_HANDLE = import.meta.env.VITE_INSTAGRAM_HANDLE || 'achmedia_'
const TT_HANDLE = import.meta.env.VITE_TIKTOK_HANDLE || 'achmedia'

export default function Social() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    listSocialHistory(30)
      .then((r) => {
        setRows(r)
        setLoading(false)
      })
      .catch(console.error)
    const sub = subscribeRealtime(['social_history'], async () =>
      setRows(await listSocialHistory(30)),
    )
    return () => sub.unsubscribe()
  }, [])

  const data = useMemo(() => {
    const dates = [...new Set(rows.map((r) => r.captured_on))].sort()
    return dates.map((d) => {
      const ig = rows.find((r) => r.platform === 'instagram' && r.captured_on === d)
      const tt = rows.find((r) => r.platform === 'tiktok' && r.captured_on === d)
      return {
        date: format(new Date(d), 'd MMM', { locale: fr }),
        Instagram: ig?.followers || null,
        TikTok: tt?.followers || null,
      }
    })
  }, [rows])

  const last = useMemo(() => {
    const out = {}
    for (const r of rows) {
      const existing = out[r.platform]
      if (!existing || existing.captured_on < r.captured_on) out[r.platform] = r
    }
    return out
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading text-2xl">Réseaux sociaux</h1>
          <p className="text-xs text-ink-400 mt-1">Évolution sur 30 jours</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Saisir
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PlatformCard
          platform="instagram"
          handle={IG_HANDLE}
          point={last.instagram}
          rows={rows}
        />
        <PlatformCard
          platform="tiktok"
          handle={TT_HANDLE}
          point={last.tiktok}
          rows={rows}
        />
      </div>

      <div className="card p-3 pt-4">
        <h2 className="heading text-sm font-bold uppercase tracking-wider mb-3 px-1">
          Évolution
        </h2>
        {loading ? (
          <div className="h-64 bg-ink-800/30 rounded-xl animate-pulse" />
        ) : data.length === 0 ? (
          <p className="text-center text-sm text-ink-400 py-12">
            Aucune donnée. Clique sur « Saisir » pour ajouter ton premier point.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: '#8d97b3', fontSize: 10 }} />
              <YAxis tick={{ fill: '#8d97b3', fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: '#101626',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="Instagram"
                stroke="#e879f9"
                strokeWidth={2}
                dot={{ fill: '#e879f9', r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="TikTok"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ fill: '#22d3ee', r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {showAdd && <ManualEntry onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function PlatformCard({ platform, handle, point, rows }) {
  const list = rows
    .filter((r) => r.platform === platform)
    .sort((a, b) => a.captured_on.localeCompare(b.captured_on))
  const prev = list[list.length - 2]
  const delta = point && prev ? point.followers - prev.followers : 0
  const color = platform === 'instagram' ? '#e879f9' : '#22d3ee'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}22`, color }}
        >
          {platform === 'instagram' ? (
            <Instagram className="w-3.5 h-3.5" />
          ) : (
            <TrendingUp className="w-3.5 h-3.5" />
          )}
        </div>
        <p className="text-xs text-ink-300 capitalize">{platform}</p>
      </div>
      <p className="text-xs text-ink-400 mb-2">@{handle}</p>
      <p className="heading text-2xl font-bold text-white">
        {point ? point.followers.toLocaleString('fr-FR') : '—'}
      </p>
      <p className={`text-xs font-semibold mt-1 ${delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
        {delta > 0 ? '+' : ''}
        {delta} aujourd'hui
      </p>
    </motion.div>
  )
}

function ManualEntry({ onClose }) {
  const [platform, setPlatform] = useState('instagram')
  const [handle, setHandle] = useState(IG_HANDLE)
  const [followers, setFollowers] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await insertSocialPoint(platform, handle, parseInt(followers, 10))
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="glass-strong rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 pb-safe border border-white/10"
      >
        <h3 className="heading text-lg mb-4">Ajouter un point</h3>
        <div className="space-y-3">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input">
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Handle"
            className="input"
            required
          />
          <input
            type="number"
            value={followers}
            onChange={(e) => setFollowers(e.target.value)}
            placeholder="Nombre d'abonnés"
            className="input"
            required
          />
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Annuler
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  )
}
