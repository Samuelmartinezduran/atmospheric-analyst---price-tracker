import type {ReactNode} from 'react';
import {Navigate, Outlet, useLocation} from 'react-router';
import {Loader2} from 'lucide-react';
import {useAuth} from './AuthContext';

export interface FromState {
  from?: string;
}

function SessionSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-6">
      <div role="status" className="flex items-center gap-3 text-sm font-semibold text-on-surface-variant">
        <Loader2 size={20} className="animate-spin text-primary" aria-hidden="true" />
        Comprobando la sesión…
      </div>
    </div>
  );
}

/** Rutas privadas: sin sesión no se monta nada (ni se pide nada a la API) y se va a /entrar. */
export function RequireAuth({children}: {children?: ReactNode}) {
  const {status} = useAuth();
  const location = useLocation();
  if (status === 'checking') return <SessionSplash />;
  if (status !== 'authenticated') {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/entrar" replace state={{from: from === '/' ? undefined : from} satisfies FromState} />;
  }
  return children ?? <Outlet />;
}

/** Entrar, registro y recuperar: con la sesión abierta no tienen sentido. */
export function PublicOnly({children}: {children?: ReactNode}) {
  const {status} = useAuth();
  const location = useLocation();
  if (status === 'checking') return <SessionSplash />;
  if (status === 'authenticated') {
    // Tras entrar, volvemos a la página que se quería abrir (si era de esta app).
    const from = (location.state as FromState | null)?.from;
    const target = from && from.startsWith('/') && !from.startsWith('//') ? from : '/';
    return <Navigate to={target} replace />;
  }
  return children ?? <Outlet />;
}
