/* ============================================================
 *  Domaine « abonnements » (revenus et dépenses récurrents)
 *
 *  Module pur : aucune dépendance réseau, aucun état. Les requêtes
 *  vivent dans repository.js, l'affichage dans SubscriptionsPanel.jsx.
 *
 *  Le calcul d'échéance reproduit à l'identique la fonction SQL
 *  public.add_billing_period : on repart toujours du jour d'ancrage
 *  (jour de started_on) borné au dernier jour du mois cible, pour
 *  qu'un abonnement du 31 ne dérive pas au 28 pour toujours.
 * ============================================================ */

/** @typedef {'MONTHLY'|'YEARLY'} BillingInterval */

/**
 * @typedef {Object} Subscription
 * @property {string}          id
 * @property {string}          label            Libellé affiché et repris sur la dépense générée.
 * @property {number}          amount           Montant en euros, strictement positif.
 * @property {'in'|'out'}      direction        Revenu client ou dépense.
 * @property {BillingInterval} billing_interval Périodicité.
 * @property {string|null}     category_id      Catégorie (uuid) — pilote le scoping admin.
 * @property {string|null}     category         Nom de catégorie dénormalisé (affichage).
 * @property {string}          started_on       1re échéance (yyyy-MM-dd) : jour d'ancrage.
 * @property {string}          next_charge_on   Prochaine échéance à générer (yyyy-MM-dd).
 * @property {boolean}         active           Faux = en pause, plus aucune génération.
 * @property {string|null}     created_by
 */

/** Périodicités supportées (miroir du type SQL public.subscription_interval). */
export const BILLING_INTERVAL = Object.freeze({
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
})

/** @type {Record<BillingInterval, string>} */
export const INTERVAL_LABELS = Object.freeze({
  MONTHLY: 'Mensuel',
  YEARLY: 'Annuel',
})

/** Options prêtes à l'emploi pour un sélecteur / un toggle. */
export const INTERVAL_OPTIONS = Object.freeze([
  { value: BILLING_INTERVAL.MONTHLY, label: INTERVAL_LABELS.MONTHLY },
  { value: BILLING_INTERVAL.YEARLY, label: INTERVAL_LABELS.YEARLY },
])

/* ---------- Dates (yyyy-MM-dd, sans fuseau) ---------- */

/**
 * Découpe une date ISO courte. On travaille en UTC pour qu'un décalage
 * de fuseau ne fasse jamais glisser une échéance d'un jour.
 * @param {string} iso yyyy-MM-dd
 * @returns {{ y: number, m: number, d: number }} m est 1-12.
 */
function splitISO(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

/** @returns {string} yyyy-MM-dd */
function toISO(y, m, d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Date du jour au format yyyy-MM-dd (heure locale, comme les <input type="date">). */
export function todayISO() {
  const now = new Date()
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** Nombre de jours du mois (m est 1-12). */
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Échéance suivante, ancrée sur `anchorDay` et bornée à la fin du mois cible.
 * Avance toujours d'au moins un mois (jamais de boucle infinie).
 * @param {string}          fromISO   Échéance courante (yyyy-MM-dd).
 * @param {number}          anchorDay Jour d'ancrage 1-31 (jour de started_on).
 * @param {BillingInterval} interval
 * @returns {string} yyyy-MM-dd
 */
export function addBillingPeriod(fromISO, anchorDay, interval) {
  const { y, m } = splitISO(fromISO)
  const monthsToAdd = interval === BILLING_INTERVAL.YEARLY ? 12 : 1
  // Normalise le mois cible (gère le passage d'année).
  const zeroBased = m - 1 + monthsToAdd
  const targetYear = y + Math.floor(zeroBased / 12)
  const targetMonth = (zeroBased % 12) + 1
  const day = Math.min(anchorDay, daysInMonth(targetYear, targetMonth))
  return toISO(targetYear, targetMonth, day)
}

/**
 * Nombre d'échéances qui seront générées immédiatement pour un abonnement
 * démarrant à `startedOn` — sert à prévenir l'utilisateur avant de créer un
 * abonnement rétroactif (« 14 échéances vont être créées »).
 * @param {string}          startedOn yyyy-MM-dd
 * @param {BillingInterval} interval
 * @param {string}          [today]   yyyy-MM-dd, injectable pour les tests.
 * @returns {number}
 */
export function countDueOccurrences(startedOn, interval, today = todayISO()) {
  if (!startedOn || startedOn > today) return 0
  const anchor = splitISO(startedOn).d
  let cursor = startedOn
  let count = 0
  // Garde-fou identique au SQL (20 ans de mensualités).
  while (cursor <= today && count < 240) {
    count += 1
    cursor = addBillingPeriod(cursor, anchor, interval)
  }
  return count
}

/**
 * Prochaine échéance à venir (>= aujourd'hui) pour un abonnement dont le
 * curseur est resté dans le passé. Utilisé à la reprise d'un abonnement mis
 * en pause : reprendre ne doit pas facturer rétroactivement la pause.
 * @param {Pick<Subscription,'started_on'|'next_charge_on'|'billing_interval'>} sub
 * @param {string} [today] yyyy-MM-dd
 * @returns {string} yyyy-MM-dd
 */
export function nextFutureCharge(sub, today = todayISO()) {
  const anchor = splitISO(sub.started_on).d
  let cursor = sub.next_charge_on
  let guard = 0
  while (cursor < today && guard < 240) {
    cursor = addBillingPeriod(cursor, anchor, sub.billing_interval)
    guard += 1
  }
  return cursor
}

/* ---------- Agrégats ---------- */

/**
 * Coût ramené au mois, pour comparer mensuel et annuel sur la même base.
 * @param {Pick<Subscription,'amount'|'billing_interval'>} sub
 * @returns {number}
 */
export function monthlyEquivalent(sub) {
  const amount = Number(sub?.amount || 0)
  return sub?.billing_interval === BILLING_INTERVAL.YEARLY ? amount / 12 : amount
}

/** Arrondi au centime : additionner des flottants donne 19.990000000000002. */
function roundCents(value) {
  return Math.round(value * 100) / 100
}

/**
 * Totaux d'un portefeuille d'abonnements (les abonnements en pause sont exclus).
 * Valeurs exactes au centime — c'est une projection d'affichage, les montants
 * réellement comptabilisés viennent du grand livre (numeric(12,2)).
 * @param {Subscription[]} subs
 * @returns {{ activeCount: number, incomeMonthly: number, incomeYearly: number, expenseMonthly: number, expenseYearly: number, netMonthly: number, netYearly: number }}
 */
export function summarize(subs) {
  const active = (subs || []).filter((s) => s.active)
  // On arrondit chaque total à partir du cumul BRUT : arrondir le mensuel puis
  // le multiplier par 12 propagerait l'erreur d'arrondi (219,84 vs 219,88).
  const income = active.filter((sub) => sub.direction === 'in')
    .reduce((sum, sub) => sum + monthlyEquivalent(sub), 0)
  const expenses = active.filter((sub) => sub.direction !== 'in')
    .reduce((sum, sub) => sum + monthlyEquivalent(sub), 0)
  return {
    activeCount: active.length,
    incomeMonthly: roundCents(income),
    incomeYearly: roundCents(income * 12),
    expenseMonthly: roundCents(expenses),
    expenseYearly: roundCents(expenses * 12),
    netMonthly: roundCents(income - expenses),
    netYearly: roundCents((income - expenses) * 12),
  }
}

/* ---------- Robustesse ---------- */

/**
 * Vrai si l'erreur Supabase signale une table/fonction absente : la migration
 * phase 16 n'a pas encore été appliquée. Permet d'afficher un message clair
 * au lieu de casser l'onglet Finance.
 * @param {unknown} error
 */
export function isMissingSchema(error) {
  const code = /** @type {{code?: string}} */ (error)?.code || ''
  const message = /** @type {{message?: string}} */ (error)?.message || ''
  // Volontairement étroit : un /does not exist/ générique attraperait aussi
  // « column ... does not exist » (42703) et masquerait un vrai bug en
  // affichant « migration non appliquée ».
  return (
    code === '42P01' || // undefined_table
    code === '42883' || // undefined_function
    code === 'PGRST202' || // fonction absente du cache PostgREST
    code === 'PGRST205' || // table absente du cache PostgREST
    /schema cache/i.test(message)
  )
}
