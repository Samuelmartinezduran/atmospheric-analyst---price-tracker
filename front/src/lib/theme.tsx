import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';

const STORAGE_KEY = 'darkMode';

function readStoredPreference(): boolean | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Almacenamiento bloqueado (modo privado, etc.): seguimos con la preferencia del sistema.
  }
  return null;
}

export function getInitialDarkMode(): boolean {
  const stored = readStoredPreference();
  if (stored !== null) return stored;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/** Aplica la clase `dark` antes de pintar para evitar un destello del tema claro. */
export function applyThemeClass(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

interface ThemeValue {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({children}: {children: ReactNode}) {
  const [darkMode, setDarkModeState] = useState(getInitialDarkMode);

  useEffect(() => {
    applyThemeClass(darkMode);
  }, [darkMode]);

  const setDarkMode = useCallback((dark: boolean) => {
    setDarkModeState(dark);
    try {
      localStorage.setItem(STORAGE_KEY, String(dark));
    } catch {
      // Sin almacenamiento, el cambio dura hasta recargar.
    }
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({darkMode, setDarkMode, toggleDarkMode: () => setDarkMode(!darkMode)}),
    [darkMode, setDarkMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return value;
}
