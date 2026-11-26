import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Outlet, useNavigate, useOutletContext} from 'react-router';
import {Menu, X} from 'lucide-react';
import {listAlerts} from '../api/alerts';
import {isAbortError} from '../api/client';
import {listStores} from '../api/stores';
import type {Store} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {Brand} from '../components/Brand';
import {HelpModal} from '../components/HelpModal';
import {Sidebar} from '../components/Sidebar';
import {useToast} from '../components/Toasts';
import {countNewAlerts} from '../lib/alertsSeen';

export interface AddProductRequest {
  /** Cambia en cada petición para que el panel enfoque el formulario aunque ya estemos en él. */
  focusAdd?: number;
}

export interface AppContextValue {
  stores: Store[];
  storesLoaded: boolean;
  newAlerts: number;
  setNewAlerts: (count: number) => void;
  refreshAlertsBadge: () => void;
}

export function useAppContext(): AppContextValue {
  return useOutletContext<AppContextValue>();
}

export function AppLayout() {
  const {user, signOut} = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [newAlerts, setNewAlerts] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    listStores(controller.signal)
      .then(setStores)
      .catch(() => {
        // Sin la lista de tiendas el formulario sigue funcionando; el backend valida la URL.
      })
      .finally(() => {
        if (!controller.signal.aborted) setStoresLoaded(true);
      });
    return () => controller.abort();
  }, []);

  const refreshAlertsBadge = useCallback(() => {
    listAlerts()
      .then((alerts) => setNewAlerts(countNewAlerts(alerts)))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setNewAlerts(0);
      });
  }, []);

  // Al entrar; después lo actualizan las páginas (tras comprobar precios o ver las alertas).
  useEffect(() => {
    refreshAlertsBadge();
  }, [refreshAlertsBadge]);

  // Menú lateral en móvil: Escape lo cierra y el foco vuelve al botón.
  useEffect(() => {
    if (!menuOpen) return;
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const button = menuButtonRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      button?.focus();
    };
  }, [menuOpen]);

  const handleAddProduct = useCallback(() => {
    setMenuOpen(false);
    navigate('/', {state: {focusAdd: Date.now()} satisfies AddProductRequest});
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    setMenuOpen(false);
    await signOut();
    toast.info('Has cerrado la sesión.');
  }, [signOut, toast]);

  const context = useMemo<AppContextValue>(
    () => ({stores, storesLoaded, newAlerts, setNewAlerts, refreshAlertsBadge}),
    [stores, storesLoaded, newAlerts, refreshAlertsBadge],
  );

  const sidebarProps = {
    userEmail: user?.email ?? null,
    alertsBadge: newAlerts,
    onAddProduct: handleAddProduct,
    onHelp: () => {
      setMenuOpen(false);
      setHelpOpen(true);
    },
    onLogout: () => void handleLogout(),
  };

  return (
    <div className="min-h-dvh bg-surface">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-xl focus:bg-surface-container-lowest focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary focus:shadow-lg"
      >
        Saltar al contenido
      </a>

      {/* Escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-outline-variant/10 lg:block">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* Móvil y tableta */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-outline-variant/10 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        <Brand compact />
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-controls="menu-movil"
          className="rounded-xl p-2 text-on-surface transition-colors hover:bg-surface-container-high"
        >
          <Menu size={22} aria-hidden="true" />
          <span className="sr-only">Abrir menú</span>
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" onClick={() => setMenuOpen(false)} />
          <div
            id="menu-movil"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl animate-slide-in"
          >
            <Sidebar {...sidebarProps} onNavigate={() => setMenuOpen(false)} className="pr-12" />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute top-6 right-3 rounded-xl p-2 text-on-surface-variant hover:bg-surface-container-high"
            >
              <X size={18} aria-hidden="true" />
              <span className="sr-only">Cerrar menú</span>
            </button>
          </div>
        </div>
      )}

      <main id="contenido" tabIndex={-1} className="px-4 py-6 outline-none sm:px-6 lg:ml-64 lg:p-8">
        <Outlet context={context} />
      </main>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} storeNames={stores.map((s) => s.name)} />
    </div>
  );
}
