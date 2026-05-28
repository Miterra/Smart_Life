/* ============================================================
 *  Helpers rôles
 *  - owner   : propriétaire de l'instance (un seul). Gère utilisateurs,
 *              groupes, rôles, et qui voit quoi.
 *  - admin   : voit et édite tout (sauf rôle owner).
 *  - manager : crée des tâches, peut créer des comptes "user" et les
 *              assigner. Voit ses propres tâches + celles des users de
 *              ses groupes.
 *  - user    : voit uniquement les tâches qui lui sont assignées et
 *              peut changer leur statut (todo -> in_progress -> done).
 * ============================================================ */

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
}

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

export const canManageUsers = (role) => role === ROLES.OWNER || role === ROLES.ADMIN
export const canCreateUsers = (role) => role === ROLES.OWNER || role === ROLES.ADMIN || role === ROLES.MANAGER
export const canCreateTasks = (role) => role !== ROLES.USER
export const canAssignAnyone = (role) => role === ROLES.OWNER || role === ROLES.ADMIN
export const canManageGroups = (role) => role === ROLES.OWNER || role === ROLES.ADMIN
export const canChangeRole = (role) => role === ROLES.OWNER
export const isOwner = (role) => role === ROLES.OWNER
export const isAdminOrOwner = (role) => role === ROLES.OWNER || role === ROLES.ADMIN

/** Un user ne peut éditer une tâche que si elle lui est assignée, et seulement le statut. */
export const canEditTaskFull = (role, task, userId) => {
  if (role === ROLES.OWNER || role === ROLES.ADMIN) return true
  if (role === ROLES.MANAGER && task?.created_by === userId) return true
  return false
}

export const canChangeTaskStatus = (role, task, userId) => {
  if (canEditTaskFull(role, task, userId)) return true
  return task?.assigned_to === userId
}

export const canDeleteTask = (role, task, userId) => {
  if (role === ROLES.OWNER || role === ROLES.ADMIN) return true
  return role === ROLES.MANAGER && task?.created_by === userId
}
