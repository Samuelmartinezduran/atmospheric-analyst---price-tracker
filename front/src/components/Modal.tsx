import {useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {cn} from '../lib/utils';
import {Button} from './ui';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Elemento que recibe el foco al abrir; si no, el primero enfocable. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  size?: 'sm' | 'md' | 'lg';
  /** Mientras hay una operación en curso no se deja cerrar. */
  busy?: boolean;
}

/**
 * Ventana modal accesible: se cierra con Escape o pulsando fuera, mantiene el foco
 * dentro mientras está abierta y lo devuelve al elemento que la abrió al cerrarse.
 */
export function Modal({open, onClose, title, description, children, footer, initialFocusRef, size = 'md', busy}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
    // Solo al abrir y al cerrar: initialFocusRef es estable.
  }, [open]);

  if (!open) return null;

  const requestClose = () => {
    if (!busyRef.current) onCloseRef.current();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-outline-variant/15 bg-surface-container-lowest shadow-2xl animate-slide-in sm:rounded-3xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
          <div className="min-w-0">
            <h2 id={titleId} className="font-manrope text-lg font-extrabold text-on-surface">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-sm text-on-surface-variant">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Cerrar"
            className="-mt-1 -mr-2 rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children && <div className="overflow-y-auto px-6 py-4">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-outline-variant/10 bg-surface-container-low/60 px-6 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmación propia en lugar de `window.confirm`. El foco empieza en «Cancelar». */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      initialFocusRef={cancelRef}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
