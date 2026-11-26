// Preferencia de tema. /theme.js la aplica antes de pintar; aquí se cambia desde Ajustes.

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
    const old = localStorage.getItem('darkMode');
    if (old === 'true') return 'dark';
    if (old === 'false') return 'light';
  } catch {
    // Sin almacenamiento: se sigue al sistema.
  }
  return 'system';
}

export function applyTheme(theme: ThemePreference, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function setThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.removeItem('darkMode');
  } catch {
    // Sin almacenamiento, el cambio dura hasta recargar.
  }
  applyTheme(theme);
}
