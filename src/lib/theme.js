/* ============================================================
 *  Thème jour / nuit
 *  - Défaut : nuit (dark). Choix persisté dans localStorage.
 *  - Appliqué via l'attribut data-theme sur <html> ('light' ou absent).
 *  - applyTheme() est appelé au tout début (main.jsx) pour éviter le flash.
 * ============================================================ */
const KEY = 'theme'

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme) {
  const el = document.documentElement
  if (theme === 'light') el.setAttribute('data-theme', 'light')
  else el.removeAttribute('data-theme')
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* stockage indisponible : on applique quand même pour la session */
  }
  applyTheme(theme)
}
