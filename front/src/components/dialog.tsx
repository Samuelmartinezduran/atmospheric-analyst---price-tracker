import {useEffect, useId, useRef, useState, type ReactNode} from 'react';
import {ErrorNotice, Spinner} from './ui';

// ── Diálogo modal ────────────────────────────────────────────────────────────

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** No se cierra con Escape ni con el fondo mientras hay algo en marcha. */
  busy?: boolean;
  wide?: boolean;
}

/**
 * `<dialog>` nativo con `showModal()`: el resto de la página queda inerte, Escape cierra y el
 * foco vuelve al elemento que lo abrió.
 */
export function Dialog({open, onClose, title, description, children, footer, busy, wide}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      if (!busyRef.current) onClose();
    };
    const onCloseEvent = () => {
      const target = returnFocus.current;
      returnFocus.current = null;
      if (target?.isConnected) target.focus();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onCloseEvent);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onCloseEvent);
    };
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    return () => {
      // Si el diálogo se desmonta abierto (se cierra quitándolo), el foco vuelve igualmente.
      if (dialog?.open) {
        dialog.close();
        const target = returnFocus.current;
        returnFocus.current = null;
        if (target?.isConnected) target.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="dlg"
      style={wide ? {width: 'min(560px, calc(100vw - 32px))'} : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onMouseDown={(event) => {
        // Clic en el fondo (fuera de la caja): cierra.
        if (event.target === ref.current && !busyRef.current) {
          const rect = ref.current.getBoundingClientRect();
          const inside =
            event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
          if (!inside) onClose();
        }
      }}
    >
      {open && (
        <>
          <div className="dlg-h">
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descId}>{description}</p>}
          </div>
          {children && <div className="dlg-b">{children}</div>}
          {footer && <div className="dlg-f">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}

/** Confirmación con su propio estado de «en marcha» y error. */
export function ConfirmDialog({open, onClose, title, description, confirmLabel, danger, onConfirm}: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn sec" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className={`btn ${danger ? 'danger' : ''}`} onClick={confirm} aria-busy={busy} disabled={busy}>
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {error ? <ErrorNotice error={error} /> : null}
    </Dialog>
  );
}

