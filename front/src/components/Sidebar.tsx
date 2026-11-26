import type {ElementType} from 'react';
import {Link, useLocation} from 'react-router';
import {Bell, LayoutDashboard, LifeBuoy, LogOut, Plus, Settings, ShieldCheck} from 'lucide-react';
import {cn} from '../lib/utils';
import {Brand} from './Brand';

interface SidebarProps {
  userEmail: string | null;
  isAdmin?: boolean;
  alertsBadge: number;
  onAddProduct: () => void;
  onHelp: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
  className?: string;
}

interface NavItem {
  icon: ElementType;
  label: string;
  to: string;
  isActive: (pathname: string) => boolean;
  badge?: number;
}

export function Sidebar({userEmail, isAdmin = false, alertsBadge, onAddProduct, onHelp, onLogout, onNavigate, className}: SidebarProps) {
  const {pathname} = useLocation();
  const items: NavItem[] = [
    {
      icon: LayoutDashboard,
      label: 'Panel',
      to: '/',
      isActive: (path) => path === '/' || path.startsWith('/productos'),
    },
    {
      icon: Bell,
      label: 'Alertas',
      to: '/alertas',
      isActive: (path) => path.startsWith('/alertas'),
      badge: alertsBadge,
    },
    {icon: Settings, label: 'Ajustes', to: '/ajustes', isActive: (path) => path.startsWith('/ajustes')},
    ...(isAdmin
      ? [{icon: ShieldCheck, label: 'Administración', to: '/admin', isActive: (path: string) => path.startsWith('/admin')}]
      : []),
  ];

  const secondaryItem =
    'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface';

  return (
    <div className={cn('flex h-full flex-col bg-surface-container-low p-6 font-manrope', className)}>
      <Brand className="mb-10 px-2" />

      <nav aria-label="Principal" className="flex-1">
        <ul className="space-y-2">
          {items.map((item) => {
            const active = item.isActive(pathname);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                  )}
                >
                  <item.icon size={20} aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <>
                      <span
                        aria-hidden="true"
                        className="min-w-[20px] rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-bold leading-tight text-white"
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                      <span className="sr-only">({item.badge} nuevas)</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 space-y-4">
        <button
          type="button"
          onClick={onAddProduct}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white shadow-md transition-transform primary-gradient active:scale-95"
        >
          <Plus size={18} aria-hidden="true" />
          Añadir producto
        </button>

        <div className="space-y-1 border-t border-outline-variant/15 pt-4">
          {userEmail && (
            <p className="truncate px-4 py-2 text-xs font-semibold text-on-surface-variant" title={userEmail}>
              {userEmail}
            </p>
          )}
          <button type="button" onClick={onHelp} className={secondaryItem}>
            <LifeBuoy size={20} aria-hidden="true" />
            Ayuda
          </button>
          <button type="button" onClick={onLogout} className={secondaryItem}>
            <LogOut size={20} aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
