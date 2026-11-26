import {lazy, Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent} from 'react';
import {AlertCircle, ExternalLink, Loader2, PackageX, Pencil, RefreshCw, Trash2, X} from 'lucide-react';
import {getErrorMessage, isAbortError} from '../api/client';
import {deleteProduct, getHistory, updateProduct} from '../api/products';
import type {HistoryPoint, Product} from '../api/types';
import {formatDate, formatDateTime, formatPrice, formatRelative, parsePriceInput, plural, priceToInput} from '../lib/format';
import {getUiStatus, productName} from '../lib/productStatus';
import {cn} from '../lib/utils';
import {ConfirmDialog} from './Modal';
import {toChartPoints} from '../lib/chartPoints';
import {PriceVerdictCard} from './PriceVerdictCard';
import {ProductImage} from './ProductImage';
import {StatusBadge} from './StatusBadge';
import {useToast} from './Toasts';
import {Button, LABEL_CLASSES} from './ui';

// Recharts pesa: se descarga solo al abrir un producto.
const PriceChart = lazy(() => import('./PriceChart'));

interface ProductDetailProps {
  product: Product;
  storeLabel: string;
  checking: boolean;
  /** Cambia tras cada comprobación para volver a pedir el historial. */
  historyVersion: number;
  onClose: () => void;
  onCheck: () => void;
  onUpdated: (product: Product) => void;
  onDeleted: (product: Product) => void;
}

function Stat({label, value, sub}: {label: string; value: string; sub?: string}) {
  return (
    <div className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm">
      <dt className="mb-1 text-[10px] font-bold uppercase text-on-surface-variant">{label}</dt>
      <dd className="text-lg font-extrabold tabular-nums text-on-surface">{value}</dd>
      {sub && <dd className="mt-0.5 text-[11px] text-on-surface-variant">{sub}</dd>}
    </div>
  );
}

export function ProductDetail({
  product,
  storeLabel,
  checking,
  historyVersion,
  onClose,
  onCheck,
  onUpdated,
  onDeleted,
}: ProductDetailProps) {
  const toast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [targetError, setTargetError] = useState<string | null>(null);
  const [savingTarget, setSavingTarget] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const status = getUiStatus(product);
  const name = productName(product);
  const stats = product.stats;

  // Al abrir otro producto, el foco va al título para que se lea el detalle.
  useEffect(() => {
    headingRef.current?.focus();
    setEditing(false);
    setTargetError(null);
  }, [product.id]);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryError(null);
    getHistory(product.id, controller.signal)
      .then(setHistory)
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setHistory([]);
        setHistoryError(getErrorMessage(error, 'No se ha podido cargar el historial.'));
      });
    return () => controller.abort();
  }, [product.id, historyVersion]);

  // Al cambiar de producto no enseñamos el historial del anterior.
  useEffect(() => setHistory(null), [product.id]);

  const points = history ? toChartPoints(history) : [];
  const failedChecks = history ? history.length - points.length : 0;

  const startEditing = () => {
    setTargetInput(priceToInput(product.desired_price));
    setTargetError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setTargetError(null);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  const saveTarget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = parsePriceInput(targetInput);
    if (value === null) {
      setTargetError('Escribe un precio mayor que cero, por ejemplo 599,90.');
      return;
    }
    if (value === product.desired_price) {
      cancelEditing();
      return;
    }
    setSavingTarget(true);
    try {
      const updated = await updateProduct(product.id, {desired_price: value});
      onUpdated(updated);
      setEditing(false);
      toast.success(`Objetivo cambiado a ${formatPrice(updated.desired_price, updated.currency)}.`);
      if (updated.is_below_target) {
        toast.info('El precio actual ya está por debajo del nuevo objetivo. No se manda email por ello.');
      }
      requestAnimationFrame(() => editButtonRef.current?.focus());
    } catch (error) {
      setTargetError(getErrorMessage(error, 'No se ha podido cambiar el objetivo.'));
    } finally {
      setSavingTarget(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProduct(product.id);
      setConfirmDelete(false);
      onDeleted(product);
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se ha podido borrar el producto.'));
      setDeleting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !editing) {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <aside
      aria-labelledby="detalle-titulo"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-surface-container-low px-5 pb-5 font-manrope sm:px-8 sm:pb-8 xl:inset-y-0 xl:right-0 xl:left-auto xl:w-[400px] xl:border-l xl:border-outline-variant/10"
    >
      <div className="sticky top-0 z-10 -mx-5 mb-4 flex items-center justify-between bg-surface-container-low/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8 sm:pt-6">
        <p className="text-sm font-extrabold uppercase tracking-tight text-on-surface-variant">Detalle del producto</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 transition-colors hover:bg-surface-container-high"
          aria-label="Cerrar el detalle"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="mb-8 text-center">
        <div className="mx-auto mb-6 flex aspect-square w-full max-w-[280px] items-center justify-center rounded-3xl bg-surface-container-lowest p-6 shadow-sm xl:max-w-none">
          <ProductImage src={product.image_url} alt={name} muted={status === 'error' || status === 'unavailable'} />
        </div>
        <div className="mb-3 flex items-center justify-center gap-2">
          <span className="rounded bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase text-on-surface-variant">
            {storeLabel}
          </span>
          <StatusBadge status={status} />
        </div>
        <h2
          id="detalle-titulo"
          ref={headingRef}
          tabIndex={-1}
          className="mb-2 text-xl leading-tight font-extrabold text-on-surface outline-none sm:text-2xl"
        >
          {name}
        </h2>
        <p className="text-sm font-medium text-on-surface-variant">Lo sigues desde el {formatDate(product.created_at)}</p>
      </div>

      {(status === 'error' || status === 'unavailable') && (
        <div
          className={cn(
            'mb-6 flex gap-3 rounded-2xl px-4 py-3 text-sm font-semibold',
            status === 'error' ? 'bg-error/10 text-error' : 'bg-surface-container-high text-on-surface',
          )}
        >
          {status === 'error' ? (
            <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          ) : (
            <PackageX size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          )}
          <p>
            {status === 'error'
              ? product.last_error || 'La última comprobación no ha podido leer el precio.'
              : 'La tienda lo marca sin stock. Te avisaremos si vuelve por debajo del objetivo.'}
          </p>
        </div>
      )}

      <dl className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm">
          <dt className="mb-1 text-[10px] font-bold uppercase text-on-surface-variant">Precio actual</dt>
          <dd className="text-2xl font-extrabold tabular-nums text-on-surface">{formatPrice(product.last_price, product.currency)}</dd>
        </div>
        <div className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm">
          <dt className="mb-1 text-[10px] font-bold uppercase text-on-surface-variant">Objetivo</dt>
          <dd className="text-2xl font-extrabold tabular-nums text-primary">{formatPrice(product.desired_price, product.currency)}</dd>
        </div>
      </dl>

      {editing && (
        <form onSubmit={(e) => void saveTarget(e)} className="mb-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm" noValidate>
          <label htmlFor="objetivo-nuevo" className={LABEL_CLASSES}>
            Nuevo precio objetivo (€)
          </label>
          <input
            id="objetivo-nuevo"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={targetInput}
            onChange={(e) => {
              setTargetInput(e.target.value);
              setTargetError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                cancelEditing();
              }
            }}
            aria-invalid={targetError ? true : undefined}
            aria-describedby={targetError ? 'objetivo-error' : undefined}
            className="h-12 w-full rounded-xl border border-primary/40 bg-surface-container-low px-4 text-lg font-extrabold tabular-nums text-primary"
          />
          {targetError && (
            <p id="objetivo-error" className="mt-1.5 text-xs font-semibold text-error">
              {targetError}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={cancelEditing} disabled={savingTarget}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" loading={savingTarget}>
              Guardar
            </Button>
          </div>
        </form>
      )}

      <div className="mb-4">
        <PriceVerdictCard product={product} />
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-3">
        <Stat
          label="Mínimo histórico"
          value={formatPrice(stats?.lowest_price, product.currency)}
          sub={stats?.lowest_price_at ? `el ${formatDate(stats.lowest_price_at)}` : undefined}
        />
        <Stat label="Máximo" value={formatPrice(stats?.highest_price, product.currency)} />
        <Stat label="Media 30 días" value={formatPrice(stats?.avg_price_30d, product.currency)} />
        <Stat
          label="Comprobaciones"
          value={stats?.checks_count != null ? String(stats.checks_count) : '—'}
          sub={product.last_checked_at ? `Última ${formatRelative(product.last_checked_at)}` : 'Aún ninguna'}
        />
      </dl>

      <section aria-labelledby="historial-titulo" className="mb-8 rounded-3xl bg-surface-container-lowest p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="historial-titulo" className="text-xs font-bold uppercase tracking-wider text-on-surface">
            Historial de precios
          </h3>
          {history === null && <Loader2 size={14} className="animate-spin text-on-surface-variant" aria-label="Cargando" />}
        </div>
        {historyError ? (
          <p className="py-8 text-center text-sm text-error">{historyError}</p>
        ) : points.length > 0 ? (
          <Suspense fallback={<div className="h-52" aria-hidden="true" />}>
            <PriceChart points={points} targetPrice={product.desired_price} currency={product.currency} />
          </Suspense>
        ) : (
          history !== null && (
            <p className="flex h-40 items-center justify-center text-center text-sm text-on-surface-variant">
              Todavía no hay precios registrados.
            </p>
          )
        )}
        {failedChecks > 0 && (
          <p className="mt-3 text-[11px] text-on-surface-variant">
            {plural(failedChecks, 'comprobación fallida no aparece', 'comprobaciones fallidas no aparecen')} en la gráfica.
          </p>
        )}
        {product.last_checked_at && (
          <p className="mt-1 text-[11px] text-on-surface-variant">Última comprobación: {formatDateTime(product.last_checked_at)}</p>
        )}
      </section>

      <div className="space-y-3 pb-4">
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-surface-container-highest py-4 font-bold text-on-surface transition-colors hover:bg-surface-container-high"
        >
          <ExternalLink size={18} aria-hidden="true" />
          Ver en la tienda
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
        <button
          type="button"
          onClick={onCheck}
          disabled={checking}
          aria-busy={checking || undefined}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary/10 py-4 font-bold text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
        >
          {checking ? (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={18} aria-hidden="true" />
          )}
          {checking ? 'Comprobando…' : 'Comprobar ahora'}
        </button>
        <div className="flex gap-3">
          <button
            ref={editButtonRef}
            type="button"
            onClick={startEditing}
            disabled={editing}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest py-4 font-bold text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-60"
          >
            <Pencil size={18} className="text-on-surface-variant" aria-hidden="true" />
            Editar objetivo
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-error/25 bg-surface-container-lowest py-4 font-bold text-error transition-colors hover:bg-error/5"
          >
            <Trash2 size={18} aria-hidden="true" />
            Dejar de seguir
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="¿Dejar de seguir este producto?"
        description={
          <>
            Dejarás de recibir alertas de <strong className="text-on-surface">«{name}»</strong>. No se puede deshacer.
          </>
        }
        confirmLabel="Dejar de seguir"
        destructive
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </aside>
  );
}
