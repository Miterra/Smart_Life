import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Wallet,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  Tags,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  listFinances,
  createFinance,
  deleteFinance,
  listCategories,
  subscribeRealtime,
} from '../lib/repository'
import { canAccessFinance, isOwner } from '../lib/roles'
import { classNames } from '../lib/utils'

function eur(n) {
  return Number(n || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
}

export default function Finance({ profile, myCategoryCount = 0 }) {
  const owner = isOwner(profile.role)
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const catMap = useMemo(() => {
    const m = {}
    for (const c of categories) m[c.id] = c
    return m
  }, [categories])

  const refresh = async () => {
    try {
      const [data, cats] = await Promise.all([
        listFinances(),
        listCategories().catch(() => []),
      ])
      setRows(data.map((r) => ({ ...r, amount: Number(r.amount) })))
      setCategories(cats || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const sub = subscribeRealtime(['finances', 'categories', 'profile_categories'], refresh)
    return () => sub.unsubscribe()
  }, [])

  const totals = useMemo(() => {
    let inSum = 0
    let outSum = 0
    for (const r of rows) {
      if (r.direction === 'in') inSum += r.amount
      else outSum += r.amount
    }
    return { inSum, outSum, net: inSum - outSum }
  }, [rows])

  // Comparaison par catégorie : combien rapporte chaque catégorie.
  const byCategory = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const key = r.category_id || '__none__'
      if (!map[key]) map[key] = { id: r.category_id || null, in: 0, out: 0 }
      if (r.direction === 'in') map[key].in += r.amount
      else map[key].out += r.amount
    }
    return Object.values(map)
      .map((c) => ({
        ...c,
        net: c.in - c.out,
        name: c.id ? catMap[c.id]?.name || 'Catégorie' : 'Sans catégorie',
        color: c.id ? catMap[c.id]?.color : null,
      }))
      .sort((a, b) => b.in - a.in || b.net - a.net)
  }, [rows, catMap])

  const monthly = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const key = r.occurred_on.slice(0, 7) // yyyy-MM
      if (!map[key]) map[key] = { key, in: 0, out: 0 }
      if (r.direction === 'in') map[key].in += r.amount
      else map[key].out += r.amount
    }
    return Object.values(map)
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-12)
      .map((m) => ({
        ...m,
        label: format(parseISO(`${m.key}-01`), 'MMM yy', { locale: fr }),
        net: m.in - m.out,
      }))
  }, [rows])

  const cumulative = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    let bal = 0
    const byDay = {}
    for (const r of sorted) {
      bal += r.direction === 'in' ? r.amount : -r.amount
      byDay[r.occurred_on] = bal
    }
    return Object.entries(byDay).map(([date, balance]) => ({
      date,
      label: format(parseISO(date), 'd MMM', { locale: fr }),
      balance,
    }))
  }, [rows])

  if (!canAccessFinance(profile.role, myCategoryCount)) {
    return (
      <div className="card p-8 text-center">
        <Lock className="w-10 h-10 text-ink-400 mx-auto mb-3" />
        <p className="text-sm text-ink-300">
          {profile.role === 'admin'
            ? "Aucune catégorie ne t'est assignée pour le moment."
            : 'Réservé au propriétaire.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading text-2xl">Finances</h1>
          <p className="text-xs text-ink-400 mt-1">
            {owner ? 'Visible uniquement par toi.' : 'Finances de tes catégories · lecture seule.'}
          </p>
        </div>
        {owner && (
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2.5 lg:gap-4">
        <StatCard label="Entrées" value={totals.inSum} icon={TrendingUp} tone="emerald" />
        <StatCard label="Sorties" value={totals.outSum} icon={TrendingDown} tone="rose" />
        <StatCard label="Solde" value={totals.net} icon={Wallet} tone="cyan" signed />
      </div>

      {loading ? (
        <div className="h-64 rounded-2xl bg-ink-800/40 animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center">
          <Wallet className="w-10 h-10 text-ink-500 mx-auto mb-3" />
          <p className="text-sm text-ink-300 mb-3">
            {owner ? 'Aucune opération enregistrée.' : 'Aucune opération dans tes catégories.'}
          </p>
          {owner && (
            <button onClick={() => setShowForm(true)} className="btn-secondary">
              <Plus className="w-4 h-4" /> Ajouter la première
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Comparaison par catégorie */}
          {byCategory.length > 0 && (
            <div className="card p-4">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-3 flex items-center gap-1.5">
                <Tags className="w-3.5 h-3.5" /> Par catégorie
              </p>
              <ul className="space-y-2.5">
                {byCategory.map((c) => (
                  <li key={c.id || '__none__'} className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: c.color || '#64748b' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-fg truncate">{c.name}</p>
                      <p className="text-[11px] text-ink-400">
                        <span className="text-emerald-300">+{eur(c.in)}</span>
                        {' · '}
                        <span className="text-rose-300">−{eur(c.out)}</span>
                      </p>
                    </div>
                    <span
                      className={classNames(
                        'font-semibold text-sm flex-shrink-0',
                        c.net >= 0 ? 'text-neon-cyan' : 'text-rose-300',
                      )}
                    >
                      {c.net >= 0 ? '+' : ''}
                      {eur(c.net)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* PC : les deux graphiques côte à côte. */}
          <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
          {/* Bar chart : entrées vs sorties par mois */}
          <div className="card p-4">
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-3">
              Entrées / Sorties par mois
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#8a90a6', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8a90a6', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(13,16,26,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#e6e9f3' }}
                  formatter={(v, n) => [eur(v), n === 'in' ? 'Entrées' : 'Sorties']}
                />
                <Bar dataKey="in" fill="#34d399" radius={[4, 4, 0, 0]} />
                <Bar dataKey="out" fill="#fb7185" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Area chart : solde cumulé */}
          <div className="card p-4">
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-3">Solde cumulé</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={cumulative} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#8a90a6', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8a90a6', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(13,16,26,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#e6e9f3' }}
                  formatter={(v) => [eur(v), 'Solde']}
                />
                <Area type="monotone" dataKey="balance" stroke="#22d3ee" strokeWidth={2} fill="url(#balGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </div>

          {/* Liste des opérations */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-2 px-1">
              Dernières opérations
            </p>
            <ul className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
              {[...rows].reverse().slice(0, 30).map((r) => (
                <FinanceRow
                  key={r.id}
                  row={r}
                  canDelete={owner}
                  catName={r.category_id ? catMap[r.category_id]?.name : r.category}
                  onChange={refresh}
                />
              ))}
            </ul>
          </div>
        </>
      )}

      <AnimatePresence>
        {showForm && owner && (
          <FinanceForm
            profile={profile}
            categories={categories}
            onClose={() => setShowForm(false)}
            onSaved={() => {
              setShowForm(false)
              refresh()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, tone, signed }) {
  const tones = {
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    cyan: 'text-neon-cyan',
  }
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={classNames('w-3.5 h-3.5', tones[tone])} />
        <span className="text-[10px] uppercase tracking-widest text-ink-400">{label}</span>
      </div>
      <p className={classNames('font-display font-bold text-base leading-tight', tones[tone])}>
        {signed && value >= 0 ? '+' : ''}
        {eur(value)}
      </p>
    </div>
  )
}

function FinanceRow({ row, canDelete, catName, onChange }) {
  const isIn = row.direction === 'in'
  const remove = async () => {
    if (!confirm('Supprimer cette opération ?')) return
    await deleteFinance(row.id)
    onChange()
  }
  return (
    <li className="card p-3 flex items-center gap-3">
      <div
        className={classNames(
          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
          isIn ? 'bg-emerald-500/15' : 'bg-rose-500/15',
        )}
      >
        {isIn ? (
          <ArrowDownLeft className="w-4 h-4 text-emerald-300" />
        ) : (
          <ArrowUpRight className="w-4 h-4 text-rose-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg truncate">{row.label}</p>
        <p className="text-[11px] text-ink-400">
          {format(parseISO(row.occurred_on), 'd MMM yyyy', { locale: fr })}
          {catName ? ` · ${catName}` : ''}
        </p>
      </div>
      <span className={classNames('font-semibold text-sm', isIn ? 'text-emerald-300' : 'text-rose-300')}>
        {isIn ? '+' : '−'}
        {eur(row.amount)}
      </span>
      {canDelete && (
        <button onClick={remove} aria-label="Supprimer l'opération" className="text-ink-400 hover:text-rose-400 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  )
}

function FinanceForm({ profile, categories, onClose, onSaved }) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState('in')
  const [categoryId, setCategoryId] = useState('')
  const [occurredOn, setOccurredOn] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const amt = parseFloat(String(amount).replace(',', '.'))
    if (!(amt > 0)) {
      setErr('Montant invalide.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const cat = categories.find((c) => c.id === categoryId)
      await createFinance({
        label,
        amount: amt,
        direction,
        category_id: categoryId || null,
        category: cat ? cat.name : null,
        occurred_on: occurredOn,
        created_by: profile.id,
      })
      onSaved()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <motion.form
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="glass-strong rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 pb-safe border border-fg/10"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="heading text-lg">Nouvelle opération</h3>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={() => setDirection('in')}
            className={classNames(
              'btn border',
              direction === 'in'
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                : 'bg-fg/5 text-ink-300 border-fg/10',
            )}
          >
            <ArrowDownLeft className="w-4 h-4" /> Entrée
          </button>
          <button
            type="button"
            onClick={() => setDirection('out')}
            className={classNames(
              'btn border',
              direction === 'out'
                ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                : 'bg-fg/5 text-ink-300 border-fg/10',
            )}
          >
            <ArrowUpRight className="w-4 h-4" /> Sortie
          </button>
        </div>

        <div className="space-y-3">
          <input
            autoFocus
            type="text"
            placeholder="Libellé (ex. Facture client, Loyer…)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            className="input"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
                Montant (€)
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="input"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">Date</span>
              <input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                required
                className="input"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
              Catégorie
            </span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input"
            >
              <option value="">— Sans catégorie —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {categories.length === 0 ? (
            <p className="text-[10px] text-amber-300/80">
              Aucune catégorie. Crée-en dans Personnes → Catégories pour comparer tes revenus et
              partager la vue avec l'admin concerné.
            </p>
          ) : (
            <p className="text-[10px] text-ink-500">
              La catégorie permet de comparer tes revenus. L'admin d'une catégorie ne voit que les
              opérations de celle-ci ; « Sans catégorie » reste visible par toi seul.
            </p>
          )}
        </div>

        {err && <p className="text-xs text-rose-300 mt-3">{err}</p>}

        <button type="submit" className="btn-primary w-full mt-5" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </motion.form>
    </motion.div>
  )
}
