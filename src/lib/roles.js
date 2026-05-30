/* ============================================================
 *  Helpers rôles
 *  - owner   : propriétaire de l'instance (un seul). Gère utilisateurs,
 *              groupes, rôles, catégories, périodes et finances. Voit
 *              et supprime tout.
 *  - admin   : voit et édite tout (sauf passer quelqu'un owner). Crée
 *              tâches, RDV et périodes, supprime les tâches/RDV de tous.
 *  - manager : crée UNIQUEMENT des tâches et des RDV. Voit ses tâches +
 *              celles des groupes dont il fait partie.
 *  - user    : ne crée rien. Voit les tâches/RDV qui lui sont assignés et
 *              peut changer leur statut. Peut discuter dans le chat des
 *              groupes dont il est membre.
 * ============================================================ */

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
}

/**
 * Compte autorisé, à titre exceptionnel, à renommer les membres dans l'onglet
 * Personnes. Ces alias sont PRIVÉS (visibles uniquement par ce compte) et ne
 * modifient jamais le vrai nom.
 */
export const ALIAS_EMAIL = 'anesa.elezovic@icloud.com'

/** Vrai pour le compte autorisé aux alias privés (insensible à la casse). */
export const isAliasAccount = (email) =>
  !!email && email.trim().toLowerCase() === ALIAS_EMAIL

export const ROLE_LABELS = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  manager: 'Manager',
  user: 'Utilisateur',
}

export const ROLE_COLORS = {
  owner: 'bg-neon-magenta/20 text-neon-magenta border-neon-magenta/30',
  admin: 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30',
  manager: 'bg-neon-amber/20 text-neon-amber border-neon-amber/30',
  user: 'bg-white/10 text-ink-300 border-white/15',
}

/* ---------- Capacités par rôle ---------- */
export const isOwner = (role) => role === ROLES.OWNER
export const isAdminOrOwner = (role) => role === ROLES.OWNER || role === ROLES.ADMIN

// Gestion des utilisateurs / rôles : owner + admin
export const canManageUsers = (role) => isAdminOrOwner(role)
export const canCreateUsers = (role) => isAdminOrOwner(role)
export const canChangeRole = (role) => role === ROLES.OWNER

// Tâches & RDV : owner + admin + manager
export const canCreateTasks = (role) => role !== ROLES.USER
export const canCreateAppointments = (role) => role !== ROLES.USER

// Périodes (voyage, vacances…) : owner + admin seulement
export const canCreatePeriods = (role) => isAdminOrOwner(role)

// Catégories : création / modification / suppression réservées au owner.
// (Les admins ne peuvent plus créer/éditer/supprimer ni gérer les membres.)
export const canManageCategories = (role) => isOwner(role)

// Groupes (création / membres / renommer / supprimer) : owner + admin
export const canManageGroups = (role) => isAdminOrOwner(role)

// Finances : owner toujours. Admin uniquement s'il appartient à ≥1 catégorie
// (il ne verra alors QUE les finances de ses catégories, en lecture seule).
export const canViewFinance = (role) => role === ROLES.OWNER
export const canAccessFinance = (role, myCategoryCount = 0) =>
  isOwner(role) || (role === ROLES.ADMIN && myCategoryCount > 0)

// Onglet Personnes : tout le monde sauf les utilisateurs simples.
// Les managers y ont accès en lecture seule (pas de gestion des rôles/catégories).
export const canViewPeople = (role) => role !== ROLES.USER

// Assigner à n'importe qui : owner + admin
export const canAssignAnyone = (role) => isAdminOrOwner(role)

/* ---------- Tâches ---------- */
/** Un user ne peut éditer une tâche que si elle lui est assignée, et seulement le statut. */
export const canEditTaskFull = (role, task, userId) => {
  if (isAdminOrOwner(role)) return true
  if (role === ROLES.MANAGER && task?.created_by === userId) return true
  return false
}

export const canChangeTaskStatus = (role, task, userId) => {
  if (canEditTaskFull(role, task, userId)) return true
  return task?.assigned_to === userId
}

export const canDeleteTask = (role, task, userId) => {
  if (isAdminOrOwner(role)) return true
  return role === ROLES.MANAGER && task?.created_by === userId
}

/* ---------- Rendez-vous ---------- */
export const canEditAppointment = (role, appt, userId) => {
  if (isAdminOrOwner(role)) return true
  return appt?.created_by === userId
}

export const canDeleteAppointment = (role, appt, userId) => canEditAppointment(role, appt, userId)
