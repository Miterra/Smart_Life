/* ============================================================
 *  Abonnements (dépenses récurrentes) — CRUD complet.
 *
 *  Le panneau ne calcule aucun total financier : à chaque échéance, une
 *  vraie dépense est écrite dans le grand livre (public.finances) par le
 *  cron quotidien ou par syncSubscriptionCharges(). Les totaux, graphiques
 *  et le scoping admin de l'onglet Finance restent donc la seule source de
 *  vérité. Ici on n'affiche qu'une projection (coût mensuel/annuel).
 * ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Pause,
  Play,
  Repeat,
  CalendarClock,
  AlertCircle,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  syncSubscriptionCharges,
  subscribeRealtime,
} from '../lib/repository'
import {
  BILLING_INTERVAL,
  INTERVAL_LABELS,
  INTERVAL_OPTIONS,
  countDueOccurrences,
  isMissingSchema,
  nextFutureCharge,
  summarize,
  todayISO,
} from '../lib/subscriptions'
import { classNames, formatEur } from '../lib/utils'

/**
 * @param {Object}   props
 * @param {Object}   props.profile
 * @param {Array}    props.categories
 * @param {boolean}  props.canEdit         Owner uniquement (l'admin est en lecture seule).
 * @param {Function} [props.onLedgerChange] Appelé quand des dépenses ont été générées.
 */
export default function SubscriptionsPanel({ profile, categories, canEdit, onLedgerChange }) {
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null) // Subscription | 'new' | null

  const load = useCallback(async () => {
    try {
      setSubs(await listSubscriptions())
      setSchemaMissing(false)
      setErr('')
    } catch (e) {
      // Migration phase 16 pas encore appliquée : on le dit clairement au
      // lieu de casser l'onglet Finance.
      if (isMissingSchema(e)) setSchemaMissing(true)
      else setErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const sub = subscribeRealtime(['subscriptions'], load)
    return () => sub.unsubscribe()
  }, [load])

  const totals = useMemo(() => summarize(subs), [subs])

  /** Génère les échéances dues puis rafraîchit le grand livre si besoin. */
  const syncLedger = useCallback(async () => {
    try {
      const created = await syncSubscriptionCharges()
      if (created > 0) onLedgerChange?.()
    } catch (e) {
      // Une vraie erreur de génération doit être visible : sans ça le grand
      // livre reste vide sans que rien ne l'explique.
      if (isMissingSchema(e)) setSchemaMissing(true)
      else setErr(e.message)
    }
  }, [onLedgerChange])

  const saved = async () => {
    setEditing(null)
    // Sync d'abord : le serveur avance next_charge_on, le load qui suit
    // affiche donc la bonne « prochaine échéance » dès le premier rendu.
    await syncLedger()
    await load()
  }

  const toggleActive = async (sub) => {
    try {
      // Reprendre ne facture pas la période de pause : on repositionne le
      // curseur sur la prochaine échéance à venir.
      const patch = sub.active
        ? { active: false }
        : { active: true, next_charge_on: nextFutureCharge(sub) }
      setSubs((cur) => cur.map((s) => (s.id === sub.id ? { ...s, ...patch } : s))) // optimiste
      await updateSubscription(sub.id, patch)
      await syncLedger()
    } catch (e) {
      alert(e.message)
      load()
    }
  }

  const remove = async (sub) => {
    if (!confirm(`Supprimer l'abonnement « ${sub.label} » ?\n\nLes dépenses déjà enregistrées sont conservées.`)) return
    setSubs((cur) => cur.filter((s) => s.id !== sub.id)) // optimiste
    try {
      await deleteSubscription(sub.id)
    } catch (e) {
      alert(e.message)
      load()
    }
  }

  if (schemaMissing) {
    return (
      <div className="card p-6 text-center">
        <AlertCircle className="w-9 h-9 text-neon-amber mx-auto mb-3" />
        <p className="text-sm text-ink-200 font-medium mb-1">Abonnements pas encore activés</p>
        <p className="text-xs text-ink-400 leading-relaxed">
          La migration <span className="text-ink-200">phase 16</span> doit être appliquée à la base
          de données pour activer cette section.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Projection de coût */}
      <div className="grid grid-cols-3 gap-2.5 lg:gap-4">
        <MiniStat label="Actifs" value={String(totals.activeCount)} />
        <MiniStat label="Par mois" value={formatEur(totals.monthly, { cents: true })} tone="rose" />
        <MiniStat label="Par an" value={formatEur(totals.yearly)} tone="rose" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-ink-400 flex items-center gap-1.5">
          <Repeat className="w-3.5 h-3.5" /> Abonnements
        </p>
        {canEdit && (
          <button onClick={() => setEditing('new')} className="btn-primary py-2 px-3 text-xs">
            <Plus className="w-4 h-4" /> Nouvel abonnement
          </button>
        )}
      </div>

      {err && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {err}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-800/40 animate-pulse" />
          ))}
        </div>
      ) : subs.length === 0 ? (
        <div className="card p-8 text-center">
          <Repeat className="w-10 h-10 text-ink-500 mx-auto mb-3" />
          <p className="text-sm text-ink-300 mb-3">
            {canEdit
              ? 'Aucun abonnement. Ajoute tes dépenses récurrentes : elles seront enregistrées automatiquement à chaque échéance.'
              : 'Aucun abonnement dans tes catégories.'}
          </p>
          {canEdit && (
            <button onClick={() => setEditing('new')} className="btn-secondary">
              <Plus className="w-4 h-4" /> Créer le premier
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
          {subs.map((s) => (
            <SubscriptionRow
              key={s.id}
              sub={s}
              canEdit={canEdit}
              onEdit={() => setEditing(s)}
              onToggle={() => toggleActive(s)}
              onDelete={() => remove(s)}
            />
          ))}
        </ul>
      )}

      <AnimatePresence>
        {editing && (
          <SubscriptionForm
            initial={editing === 'new' ? null : editing}
            profile={profile}
            categories={categories}
            onClose={() => setEditing(null)}
            onSaved={saved}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function MiniStat({ label, value, tone }) {
  return (
    <div className="card p-3">
      <span className="text-[10px] uppercase tracking-widest text-ink-400 block mb-1">{label}</span>
      <p
        className={classNames(
          'font-display font-bold text-base leading-tight',
          tone === 'rose' ? 'text-rose-300' : 'text-neon-cyan',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function SubscriptionRow({ sub, canEdit, onEdit, onToggle, onDelete }) {
  const paused = !sub.active
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={classNames('card p-3.5', paused && 'opacity-60')}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center flex-shrink-0">
          <Repeat className="w-4 h-4 text-rose-300" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-fg break-words">{sub.label}</p>
            <span className="text-sm font-semibold text-rose-300 flex-shrink-0">
              −{formatEur(sub.amount, { cents: true })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="chip border bg-fg/5 border-fg/10 text-ink-300">
              {INTERVAL_LABELS[sub.billing_interval]}
            </span>
            {sub.category && (
              <span className="chip border bg-fg/5 border-fg/10 text-ink-300">{sub.category}</span>
            )}
            {paused ? (
              <span className="chip border bg-neon-amber/15 text-neon-amber border-neon-amber/30">
                En pause
              </span>
            ) : (
              <span className="chip border bg-fg/5 border-fg/10 text-ink-300 flex items-center gap-1">
                <CalendarClock className="w-3 h-3" />
                {format(parseISO(sub.next_charge_on), 'd MMM yyyy', { locale: fr })}
              </span>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <button
              onClick={onToggle}
              className="btn-ghost p-2"
              title={paused ? "Reprendre l'abonnement" : 'Mettre en pause'}
              aria-label={paused ? "Reprendre l'abonnement" : 'Mettre en pause'}
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button onClick={onEdit} className="btn-ghost p-2" title="Modifier" aria-label="Modifier l'abonnement">
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="text-ink-400 hover:text-rose-400 p-2"
              title="Supprimer"
              aria-label="Supprimer l'abonnement"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </motion.li>
  )
}

function SubscriptionForm({ initial, profile, categories, onClose, onSaved }) {
  const isEdit = !!initial
  const [label, setLabel] = useState(initial?.label || '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [billingInterval, setBillingInterval] = useState(
    initial?.billing_interval || BILLING_INTERVAL.MONTHLY,
  )
  const [categoryId, setCategoryId] = useState(initial?.category_id || '')
  // Création : 1re échéance. Édition : prochaine échéance (modifiable).
  const [chargeDate, setChargeDate] = useState(initial?.next_charge_on || todayISO())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Prévient avant de créer un abonnement rétroactif : on annonce combien de
  // dépenses vont apparaître immédiatement dans le grand livre.
  const backfill = useMemo(
    () => (isEdit ? 0 : countDueOccurrences(chargeDate, billingInterval)),
    [isEdit, chargeDate, billingInterval],
  )
  const dateChanged = isEdit && chargeDate !== initial.next_charge_on
  const datePassee = chargeDate < todayISO()

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
      const common = {
        label: label.trim(),
        amount: amt,
        billing_interval: billingInterval,
        category_id: categoryId || null,
        category: cat ? cat.name : null,
      }
      if (isEdit) {
        const patch = { ...common }
        if (dateChanged) {
          patch.next_charge_on = chargeDate
          // Le jour choisi devient le nouveau jour d'ancrage, sinon les
          // échéances suivantes retomberaient sur l'ancien jour du mois.
          // On ne touche à started_on QUE si la date a bougé : un abonnement
          // du 31 momentanément calé au 28 février doit garder son ancrage.
          patch.started_on = chargeDate
        }
        await updateSubscription(initial.id, patch)
      } else {
        await createSubscription({
          ...common,
          started_on: chargeDate,
          next_charge_on: chargeDate,
          active: true,
          created_by: profile.id,
        })
      }
      await onSaved()
    } catch (e2) {
      setErr(e2.message)
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="modal-overlay"
    >
      <motion.form
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        transition={{ type: 'spring', damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="modal-sheet"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="heading text-lg">{isEdit ? "Modifier l'abonnement" : 'Nouvel abonnement'}</h3>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Périodicité */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setBillingInterval(opt.value)}
              aria-pressed={billingInterval === opt.value}
              className={classNames(
                'btn border',
                billingInterval === opt.value
                  ? 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/40'
                  : 'bg-fg/5 text-ink-300 border-fg/10',
              )}
            >
              <Repeat className="w-4 h-4" /> {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input
            autoFocus
            type="text"
            placeholder="Libellé (ex. Netflix, Assurance…)"
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
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="input"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-ink-400 mb-1 block">
                {isEdit ? 'Prochaine échéance' : '1re échéance'}
              </span>
              <input
                type="date"
                value={chargeDate}
                onChange={(e) => setChargeDate(e.target.value)}
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

          {backfill > 0 && (
            <p className="text-[11px] text-neon-amber leading-relaxed">
              Échéance passée : {backfill} dépense{backfill > 1 ? 's' : ''} ser
              {backfill > 1 ? 'ont' : 'a'} enregistrée{backfill > 1 ? 's' : ''} immédiatement dans le
              grand livre.
            </p>
          )}
          {!isEdit && backfill === 0 && (
            <p className="text-[11px] text-ink-500 leading-relaxed">
              La dépense sera enregistrée automatiquement à chaque échéance.
            </p>
          )}
          {dateChanged && (
            <p className="text-[11px] text-neon-amber leading-relaxed">
              {datePassee
                ? 'Date passée : les échéances dues seront enregistrées maintenant (celles déjà comptabilisées ne seront pas dupliquées).'
                : 'Les échéances suivantes suivront cette nouvelle date.'}
            </p>
          )}
        </div>

        {err && <p className="text-xs text-rose-300 mt-3">{err}</p>}

        <button type="submit" className="btn-primary w-full mt-5" disabled={saving}>
          {saving ? 'Enregistrement…' : isEdit ? 'Sauvegarder' : "Créer l'abonnement"}
        </button>
      </motion.form>
    </motion.div>
  )
}
