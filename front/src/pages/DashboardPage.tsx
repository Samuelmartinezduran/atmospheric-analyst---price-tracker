import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Outlet, useLocation, useMatch, useNavigate, useOutletContext} from 'react-router';
import {AlertTriangle, BarChart3, Filter, PackageSearch, PlusCircle, RefreshCw, TrendingDown, X} from 'lucide-react';
import {getErrorMessage, isAbortError, isApiError} from '../api/client';
import {checkAllProducts, checkProduct, listProducts} from '../api/products';
import type {CheckSummary, Product} from '../api/types';
import {AddProductForm} from '../components/AddProductForm';
import {KPICard} from '../components/KPICard';
import {ProductCard} from '../components/ProductCard';
import {useToast} from '../components/Toasts';
import {Button, EmptyState, PageHeader, Spinner} from '../components/ui';
import {plural} from '../lib/format';
import {getUiStatus, productName, storeName} from '../lib/productStatus';
import {cn} from '../lib/utils';
import {useAppContext, type AddProductRequest, type AppContextValue} from '../layouts/AppLayout';

export interface DashboardContextValue {
  products: Product[];
  loading: boolean;
  app: AppContextValue;
  checkingIds: ReadonlySet<number>;
  historyVersion: number;
  checkOne: (product: Product) => void;
  replaceProduct: (product: Product) => void;
  removeProduct: (product: Product) => void;
  closeDetail: () => void;
}

export function useDashboardContext(): DashboardContextValue {
  return useOutletContext<DashboardContextValue>();
}

/** Resumen en castellano de una comprobación. */
export function describeSummary(summary: CheckSummary): string {
  const parts: string[] = [];
  if (summary.checked_ok > 0) parts.push(plural(summary.checked_ok, 'correcto', 'correctos'));
  if (summary.checked_failed > 0) parts.push(plural(summary.checked_failed, 'con error', 'con error'));
  if (summary.skipped > 0) parts.push(plural(summary.skipped, 'omitido porque ya se estaba comprobando', 'omitidos porque ya se estaban comprobando'));
  if (summary.alerts_created > 0) parts.push(plural(summary.alerts_created, 'alerta nueva', 'alertas nuevas'));
  return parts.length > 0 ? `${parts.join(', ')}.` : 'No había nada que comprobar.';
}

export function DashboardPage() {
  const app = useAppContext();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const detailMatch = useMatch('/productos/:productId');
  const selectedId = detailMatch ? Number(detailMatch.params.productId) : null;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingIds, setCheckingIds] = useState<ReadonlySet<number>>(new Set());
  const [historyVersion, setHistoryVersion] = useState(0);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await listProducts(signal);
      setProducts(next);
      setLoadError(null);
    } catch (error) {
      if (isAbortError(error) || isApiError(error, 401)) return;
      setLoadError(getErrorMessage(error, 'No se han podido cargar los productos.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  // «Añadir producto» de la barra lateral: enfocamos el campo de la URL.
  const focusRequest = (location.state as AddProductRequest | null)?.focusAdd;
  useEffect(() => {
    if (!focusRequest) return;
    urlInputRef.current?.focus();
    urlInputRef.current?.scrollIntoView({block: 'center', behavior: 'smooth'});
  }, [focusRequest]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => productName(p).toLowerCase().includes(q) || storeName(p.store, app.stores).toLowerCase().includes(q),
    );
  }, [products, search, app.stores]);

  const belowTarget = products.filter((p) => getUiStatus(p) === 'below').length;
  const incidents = products.filter((p) => ['error', 'unavailable'].includes(getUiStatus(p))).length;
  const errors = products.filter((p) => getUiStatus(p) === 'error').length;

  const replaceProduct = useCallback((product: Product) => {
    setProducts((current) => {
      const exists = current.some((p) => p.id === product.id);
      return exists ? current.map((p) => (p.id === product.id ? product : p)) : [product, ...current];
    });
  }, []);

  const closeDetail = useCallback(() => {
    const id = selectedId;
    navigate('/');
    // Devolvemos el foco a la tarjeta del producto que estaba abierto.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-product-id="${id}"]`)?.focus();
    });
  }, [navigate, selectedId]);

  const removeProduct = useCallback(
    (product: Product) => {
      setProducts((current) => current.filter((p) => p.id !== product.id));
      toast.success(`Has dejado de seguir «${productName(product)}».`);
      navigate('/');
    },
    [navigate, toast],
  );

  const afterCheck = useCallback(
    async (summary: CheckSummary) => {
      await reload();
      setHistoryVersion((v) => v + 1);
      if (summary.alerts_created > 0) app.refreshAlertsBadge();
    },
    [reload, app],
  );

  const checkOne = useCallback(
    async (product: Product) => {
      setCheckingIds((current) => new Set(current).add(product.id));
      try {
        const summary = await checkProduct(product.id);
        await afterCheck(summary);
        if (summary.skipped > 0) toast.info('Se ha omitido: ya se estaba comprobando. Mira de nuevo en unos segundos.');
        else if (summary.alerts_created > 0) toast.success('Ha bajado del objetivo: se ha creado una alerta.');
        else if (summary.checked_failed > 0) toast.error('No se ha podido leer el precio. Tienes el motivo en el detalle.');
        else toast.success('Precio comprobado.');
      } catch (error) {
        if (isApiError(error, 409)) toast.info('Este producto ya se está comprobando. Espera unos segundos.');
        else toast.error(getErrorMessage(error, 'No se ha podido comprobar el precio.'));
      } finally {
        setCheckingIds((current) => {
          const next = new Set(current);
          next.delete(product.id);
          return next;
        });
      }
    },
    [afterCheck, toast],
  );

  const checkAll = async () => {
    setCheckingAll(true);
    try {
      const summary = await checkAllProducts();
      await afterCheck(summary);
      const message = `Comprobación terminada: ${describeSummary(summary)}`;
      if (summary.checked_failed > 0 && summary.checked_ok === 0) toast.error(message);
      else toast.success(message);
    } catch (error) {
      if (isApiError(error, 409)) toast.info('Ya hay una comprobación en marcha. Espera a que termine.');
      else toast.error(getErrorMessage(error, 'No se ha podido lanzar la comprobación.'));
    } finally {
      setCheckingAll(false);
    }
  };

  const handleSaved = (product: Product, created: boolean) => {
    replaceProduct(product);
    setHistoryVersion((v) => v + 1);
    toast.success(
      created
        ? `Añadido «${productName(product)}».`
        : `Ya lo seguías: objetivo actualizado para «${productName(product)}».`,
    );
    navigate(`/productos/${product.id}`);
  };

  const context: DashboardContextValue = {
    products,
    loading,
    app,
    checkingIds,
    historyVersion,
    checkOne: (product) => void checkOne(product),
    replaceProduct,
    removeProduct,
    closeDetail,
  };

  const detailOpen = selectedId !== null;

  return (
    <div className={cn('transition-[margin] duration-300', detailOpen && 'xl:mr-[400px]')}>
      <PageHeader
        title="Panel de precios"
        description="Vigila tus productos y te avisa cuando bajan del precio que buscas."
        actions={
          <Button
            icon={RefreshCw}
            loading={checkingAll}
            disabled={products.length === 0}
            onClick={() => void checkAll()}
          >
            {checkingAll ? 'Comprobando…' : 'Comprobar todos'}
          </Button>
        }
      />

      <section aria-label="Resumen" className="@container mb-10 lg:mb-12">
        <div className="grid grid-cols-3 gap-3 @xl:gap-6">
        <KPICard
          label="Productos"
          value={products.length}
          subtext={products.length === 0 ? 'Aún no sigues ninguno' : `${plural(products.length, 'producto seguido', 'productos seguidos')}`}
          subtextColor="text-primary"
          icon={BarChart3}
        />
        <KPICard
          label="Bajo el objetivo"
          value={belowTarget}
          subtext={belowTarget > 0 ? 'Buen momento para comprar' : 'Ninguno por ahora'}
          icon={TrendingDown}
        />
        <KPICard
          label="Incidencias"
          value={incidents}
          subtext={
            incidents === 0
              ? 'Todo en orden'
              : errors > 0
                ? `${plural(errors, 'con error', 'con error')} de lectura`
                : 'Sin stock ahora mismo'
          }
          subtextColor={incidents > 0 ? 'text-tertiary' : undefined}
          icon={AlertTriangle}
          variant="tertiary"
        />
        </div>
      </section>

      <AddProductForm stores={app.stores} storesLoaded={app.storesLoaded} urlInputRef={urlInputRef} onSaved={handleSaved} />

      <section aria-labelledby="lista-titulo" className="@container">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="lista-titulo" className="font-manrope text-xl font-extrabold tracking-tight">
            Productos seguidos
          </h2>
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-semibold text-on-surface-variant tabular-nums">
            {search ? `${filtered.length} de ${products.length}` : products.length}
          </span>
        </div>

        {products.length > 0 && (
          <div className="relative mb-5">
            <label htmlFor="buscar" className="sr-only">
              Buscar por nombre o tienda
            </label>
            <Filter
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-on-surface-variant"
              aria-hidden="true"
            />
            <input
              id="buscar"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o tienda…"
              className="w-full rounded-xl border-none bg-surface-container-high py-2.5 pr-10 pl-9 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/60"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-on-surface-variant hover:text-on-surface"
                aria-label="Borrar la búsqueda"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-surface-container-lowest p-8">
            <Spinner label="Cargando productos…" />
          </div>
        ) : loadError ? (
          <EmptyState
            icon={AlertTriangle}
            title="No se han podido cargar los productos"
            action={
              <Button variant="tonal" icon={RefreshCw} onClick={() => void reload()}>
                Reintentar
              </Button>
            }
          >
            {loadError}
          </EmptyState>
        ) : products.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="Todavía no sigues ningún producto"
            action={
              <Button variant="tonal" icon={PlusCircle} onClick={() => urlInputRef.current?.focus()}>
                Añadir el primero
              </Button>
            }
          >
            Pega arriba la URL de un producto y el precio al que te lo comprarías.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Filter}
            title={`Nada coincide con «${search}»`}
            action={
              <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
                Borrar la búsqueda
              </Button>
            }
          >
            Prueba con otro nombre o con el de la tienda.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @2xl:gap-6">
            {filtered.map((product) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  storeLabel={storeName(product.store, app.stores)}
                  isSelected={product.id === selectedId}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Outlet context={context} />
    </div>
  );
}
