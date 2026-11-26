/**
 * Barra lateral (escritorio) y menú desplegable (móvil).
 *
 * `SidebarFrame` es solo presentación: Astro lo pinta en el HTML estático como esqueleto
 * mientras carga la isla. `Sidebar` es la isla: persiste entre páginas (`transition:persist`),
 * así que el menú, la insignia y los avisos no parpadean al navegar.
 */
import {useEffect, useState, useSyncExternalStore, type ReactNode} from 'react';
import type {User} from '../api/types';
import {ALERTS_SEEN_EVENT, countNewAlerts, getAlertsSeenAt} from '../lib/alertsSeen';
import {avatarGradient} from '../lib/avatar';
import {useAlerts} from '../lib/data';
import {navigate} from '../lib/nav';
import {signOut, useSession} from '../lib/session';
import {IconBell, IconClose, IconCog, IconGrid, IconLogout, IconMenu, IconPulse, IconSearch, IconShield} from './icons';
import {Toaster} from './ui';

export type Section = 'productos' | 'lecturas' | 'alertas' | 'admin' | 'ajustes' | '';

const ITEMS: {id: Section; href: string; label: string; icon: ReactNode; adminOnly?: boolean}[] = [
  {id: 'productos', href: '/', label: 'Productos', icon: <IconGrid />},
  {id: 'lecturas', href: '/lecturas', label: 'Lecturas', icon: <IconPulse />},
  {id: 'alertas', href: '/alertas', label: 'Alertas', icon: <IconBell />},
  {id: 'admin', href: '/admin', label: 'Administración', icon: <IconShield />, adminOnly: true},
  {id: 'ajustes', href: '/ajustes', label: 'Ajustes', icon: <IconCog />},
];

export function sectionFor(pathname: string): Section {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/producto') return 'productos';
  if (path === '/lecturas') return 'lecturas';
  if (path === '/alertas') return 'alertas';
  if (path === '/admin') return 'admin';
  if (path === '/ajustes') return 'ajustes';
  return '';
}

interface FrameProps {
  current: Section;
  user?: User;
  newAlerts?: number;
  onFind?: () => void;
  onSignOut?: () => void;
  menuOpen?: boolean;
  onToggleMenu?: () => void;
}

function Brand() {
  return (
    <a className="sb-team" href="/">
      <span className="mark" aria-hidden="true" />
      <span className="name">Atmospheric Analyst</span>
    </a>
  );
}

/** Fila de cuenta: avatar con degradado del email, el email y «Admin» si lo es. */
function AccountRow({user}: {user?: User}) {
  return (
    <div className="sb-acct">
      {user ? (
        <>
          <span className="avatar sm" aria-hidden="true" style={{background: avatarGradient(user.email)}} />
          <span className="email" title={user.email}>
            {user.email}
          </span>
          {user.is_admin && <span className="badge">Admin</span>}
        </>
      ) : (
        <>
          <span className="avatar sm sk" aria-hidden="true" />
          <span className="sk line" style={{flex: 1}} aria-hidden="true" />
        </>
      )}
    </div>
  );
}

function Menu({current, user, newAlerts = 0, onFind, idPrefix}: FrameProps & {idPrefix: string}) {
  return (
    <>
      <button type="button" className="sb-find" onClick={onFind} aria-keyshortcuts="F">
        <IconSearch />
        Buscar
        <span className="kbd" aria-hidden="true">
          F
        </span>
      </button>
      <nav aria-label="Secciones" id={`${idPrefix}-nav`}>
        <ul className="menu">
          {ITEMS.filter((item) => !item.adminOnly || user?.is_admin).flatMap((item) => {
            const link = (
              <li key={item.id}>
                <a href={item.href} aria-current={current === item.id ? 'page' : undefined}>
                  {item.icon}
                  {item.label}
                  {item.id === 'alertas' && newAlerts > 0 && (
                    <span className="count">
                      {newAlerts > 99 ? '99+' : newAlerts}
                      <span className="sr-only"> nuevas</span>
                    </span>
                  )}
                </a>
              </li>
            );
            return item.id === 'ajustes' ? [<li key="grp" className="grp" aria-hidden="true" />, link] : [link];
          })}
        </ul>
      </nav>
    </>
  );
}

function SignOut({user, onSignOut}: {user?: User; onSignOut?: () => void}) {
  return (
    <div className="sb-me">
      <span className="email" title={user?.email}>
        {user ? user.email : <span className="sk line" aria-hidden="true" />}
      </span>
      <button type="button" className="link-btn" onClick={onSignOut} disabled={!user}>
        <IconLogout />
        Cerrar sesión
      </button>
    </div>
  );
}

export function SidebarFrame(props: FrameProps) {
  const {user, menuOpen, onToggleMenu} = props;
  return (
    <>
      <aside className="sb" aria-label="Navegación">
        <div>
          <Brand />
          <AccountRow user={user} />
        </div>
        <Menu {...props} idPrefix="sb" />
        <SignOut user={user} onSignOut={props.onSignOut} />
      </aside>
      <div className="mbar">
        <div className="mbar-row">
          <a className="mbar-brand" href="/">
            <span className="mark" aria-hidden="true" />
            <span className="name">Atmospheric Analyst</span>
          </a>
          <button
            type="button"
            className="icon-btn"
            aria-expanded={menuOpen ? 'true' : 'false'}
            aria-controls="mbar-menu"
            aria-label={menuOpen ? 'Cerrar el menú' : 'Abrir el menú'}
            onClick={onToggleMenu}
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
        <div id="mbar-menu" className="mbar-menu" hidden={!menuOpen}>
          <AccountRow user={user} />
          <Menu {...props} idPrefix="mb" />
          <SignOut user={user} onSignOut={props.onSignOut} />
        </div>
      </div>
    </>
  );
}

// La insignia cuenta las alertas posteriores a la última visita a /alertas (lib/alertsSeen).
const SEEN_EVENT = ALERTS_SEEN_EVENT;
const subscribeSeen = (listener: () => void) => {
  window.addEventListener(SEEN_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(SEEN_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
};

/** Enfoca el buscador de productos si está en la página; si no, va a `/?q=`. */
export function focusProductSearch(): void {
  const input = document.getElementById('product-search') as HTMLInputElement | null;
  if (input) {
    input.focus();
    input.select();
  } else {
    void navigate('/?q=');
  }
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export default function Sidebar() {
  const {user} = useSession();
  const alerts = useAlerts(Boolean(user));
  const seenAt = useSyncExternalStore(subscribeSeen, getAlertsSeenAt, () => 0);
  const [current, setCurrent] = useState<Section>(() => sectionFor(window.location.pathname));
  const [menuOpen, setMenuOpen] = useState(false);

  // La isla persiste entre páginas: la sección activa se lee de la URL tras cada navegación.
  useEffect(() => {
    const update = () => {
      setCurrent(sectionFor(window.location.pathname));
      setMenuOpen(false);
    };
    document.addEventListener('astro:page-load', update);
    return () => document.removeEventListener('astro:page-load', update);
  }, []);

  // Atajo F: buscar productos.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        focusProductSearch();
      } else if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const newAlerts = alerts.data ? countNewAlerts(alerts.data, seenAt) : 0;

  return (
    <>
      <SidebarFrame
        current={current}
        user={user}
        newAlerts={current === 'alertas' ? 0 : newAlerts}
        onFind={() => {
          setMenuOpen(false);
          focusProductSearch();
        }}
        onSignOut={() => void signOut()}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
      />
      <Toaster />
    </>
  );
}
