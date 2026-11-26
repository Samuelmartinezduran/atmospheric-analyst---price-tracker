import {useSyncExternalStore, type ReactNode} from 'react';
import {getErrorMessage} from '../api/client';
import {dismissToast, getToasts, subscribeToasts} from '../lib/toast';
import {IconClose} from './icons';

export function Dot({tone = ''}: {tone?: '' | 'ok' | 'warn' | 'err'}) {
  return <span className={`dot ${tone}`} aria-hidden="true" />;
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

/** Barra superior: ruta a la izquierda, título en el centro y acciones a la derecha. */
export function Topbar({crumb, title, actions}: {crumb: ReactNode; title: string; actions?: ReactNode}) {
  return (
    <header className="top">
      <nav className="crumb" aria-label="Ruta">
        {crumb}
      </nav>
      <span className="mid" aria-hidden="true">
        {title}
      </span>
      <div className="acts">{actions}</div>
    </header>
  );
}

export function ErrorNotice({error, onRetry, fallback}: {error: unknown; onRetry?: () => void; fallback?: string}) {
  return (
    <div className="notice err" role="alert">
      <Dot tone="err" />
      <div className="grow">
        <p>{getErrorMessage(error, fallback)}</p>
        {onRetry && (
          <div>
            <button type="button" className="btn sec sm" onClick={onRetry}>
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Avisos flotantes ─────────────────────────────────────────────────────────

const NO_TOASTS: ReturnType<typeof getToasts> = [];

export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, () => NO_TOASTS);
  return (
    <div className="toasts" role="region" aria-label="Avisos">
      <div aria-live="polite" style={{display: 'contents'}}>
        {items.map((item) => (
          <div key={item.id} className="toast" role={item.kind === 'err' ? 'alert' : 'status'}>
            <Dot tone={item.kind === 'ok' ? 'ok' : item.kind === 'err' ? 'err' : ''} />
            <p>{item.message}</p>
            <button type="button" className="icon-btn" onClick={() => dismissToast(item.id)} aria-label="Cerrar aviso">
              <IconClose />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
