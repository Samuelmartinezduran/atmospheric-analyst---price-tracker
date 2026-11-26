import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {AlertCircle, CheckCircle2, Info, X} from 'lucide-react';
import {cn} from '../lib/utils';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS: Record<ToastKind, number> = {success: 4000, info: 5000, error: 7000};
const MAX_VISIBLE = 4;

function ToastItem({toast, onDismiss}: {toast: Toast; onDismiss: (id: number) => void}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), DURATION_MS[toast.kind]);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  const Icon = toast.kind === 'error' ? AlertCircle : toast.kind === 'success' ? CheckCircle2 : Info;

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg animate-slide-in sm:w-[380px]',
        toast.kind === 'error'
          ? 'border-error/20 bg-error text-on-error'
          : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface',
      )}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={cn('mt-0.5 shrink-0', toast.kind === 'error' ? 'text-on-error' : 'text-primary')}
      />
      <p className="flex-1 leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-m-1 shrink-0 rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Cerrar aviso"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++counter.current;
    setToasts((current) => {
      // No repetimos el mismo aviso si ya está en pantalla.
      if (current.some((toast) => toast.kind === kind && toast.message === message)) return current;
      return [...current, {id, kind, message}].slice(-MAX_VISIBLE);
    });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast debe usarse dentro de ToastProvider');
  return value;
}
