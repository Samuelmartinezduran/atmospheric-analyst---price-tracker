import {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {getErrorMessage, isApiError} from '../api/client';
import {checkAllProducts, checkProduct} from '../api/products';
import type {CheckSummary, Product} from '../api/types';
import {IconGrid, IconHelp, IconPlus, IconRefresh, IconRows, IconSearch} from '../components/icons';
import {AlertsPanel, RecentReadings, WorkerUsage} from '../components/overviewPanels';
import {TodayStrip} from '../components/TodayStrip';
import {PrivatePage} from '../components/PrivatePage';
import {ProductCard} from '../components/ProductCard';
import {ErrorNotice, Spinner, Topbar} from '../components/ui';
import {refreshAfterChange, useProducts, useReadings, useSummary} from '../lib/data';
import {plural} from '../lib/format';
import {productDomain, productName} from '../lib/productStatus';
import {toast} from '../lib/toast';

// Los diálogos se descargan al abrirlos: no cuentan en el peso inicial del panel.
const AddProductDialog = lazy(() => import('../components/productDialogs').then((m) => ({default: m.AddProductDialog})));
// La vista de lista también se descarga solo si se elige.
const ProductTable = lazy(() => import('../components/ProductTable').then((m) => ({default: m.ProductTable})));
const HelpDialog = lazy(() => import('../components/productDialogs').then((m) => ({default: m.HelpDialog})));

type View = 'grid' | 'list';
const VIEW_KEY = 'productsView';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function matchesQuery(product: Product, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  return normalize(`${productName(product)} ${productDomain(product.url)}`).includes(q);
}

export function describeCheck(summary: CheckSummary): string {
  const parts = [`${summary.checked_ok} con precio`];
  if (summary.checked_failed) parts.push(`${summary.checked_failed} con error`);
  if (summary.skipped) parts.push(`${summary.skipped} ya en marcha`);
  const alerts = summary.alerts_created ? ` ${plural(summary.alerts_created, 'alerta nueva', 'alertas nuevas')}.` : '';
  return `${plural(summary.total_products, 'producto comprobado', 'productos comprobados')}: ${parts.join(', ')}.${alerts}`;
}

/** Sin productos: qué hace la app y cómo empezar. */
function EmptyState({onAdd}: {onAdd: () => void}) {
  return (
    <section className="empty-state" aria-labelledby="empty-h">
      <svg className="art" viewBox="0 0 140 88" fill="none" aria-hidden="true">
        <rect x="8" y="10" width="124" height="68" rx="8" stroke="var(--line2)" strokeWidth="1.5" fill="var(--bg2)" />
        <path d="M22 60 44 46l16 8 22-22 18 10 18-14" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 40h96" stroke="var(--line3)" strokeWidth="1.5" strokeDasharray="4 4" />
        <circle cx="82" cy="32" r="4.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
      </svg>
      <h2 id="empty-h">Sigue tu primer producto</h2>
      <p>
        Pega el enlace de un producto de Amazon ES o PCComponentes y el precio al que lo comprarías. Lo comprobamos cada pocas
        horas y te avisamos por correo cuando baje.
      </p>
      <div className="stores" aria-label="Tiendas admitidas">
        <span className="pill plain">Amazon ES</span>
        <span className="pill plain">PCComponentes</span>
      </div>
      <button type="button" className="btn" onClick={onAdd}>
        <IconPlus />
        Añadir producto
      </button>
    </section>
  );
}

function Dashboard() {
  const products = useProducts();
  const summary = useSummary();
  const readings = useReadings(6);
  const initialQuery = useRef(new URLSearchParams(window.location.search).get('q'));
  const [query, setQuery] = useState(initialQuery.current ?? '');
  const [view, setView] = useState<View>(readView);
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Atajo «/» y llegada desde «Buscar» de la barra lateral (/?q=).
  useEffect(() => {
    if (initialQuery.current !== null) searchRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // La búsqueda queda en la URL (sin crear entradas en el historial).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [query]);

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Sin almacenamiento, la vista dura hasta recargar.
    }
  };

  const checkOne = async (product: Product) => {
    setCheckingId(product.id);
    try {
      const result = await checkProduct(product.id);
      toast.success(`«${productName(product)}» comprobado. ${result.alerts_created ? 'Hay una alerta nueva.' : ''}`.trim());
    } catch (err) {
      if (isApiError(err, 409)) toast.info('Ese producto ya se está comprobando. Espera unos segundos.');
      else toast.error(getErrorMessage(err));
    } finally {
      setCheckingId(null);
      refreshAfterChange(product.id);
    }
  };

  const checkAll = async () => {
    setCheckingAll(true);
    try {
      toast.success(describeCheck(await checkAllProducts()));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCheckingAll(false);
      refreshAfterChange();
      products.data?.forEach((p) => refreshAfterChange(p.id));
    }
  };

  const visible = useMemo(() => (products.data ?? []).filter((p) => matchesQuery(p, query)), [products.data, query]);
  const total = products.data?.length ?? 0;

  return (
    <>
      <Topbar
        crumb={<span>Todos los productos</span>}
        title="Resumen"
        actions={
          <>
            <button type="button" className="link-btn" onClick={() => setHelpOpen(true)}>
              <IconHelp />
              <span className="lbl">Ayuda</span>
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={checkAll}
              disabled={checkingAll || total === 0}
              aria-busy={checkingAll}
            >
              {checkingAll ? <Spinner /> : <IconRefresh />}
              <span className="lbl">{checkingAll ? 'Comprobando…' : 'Comprobar todos'}</span>
            </button>
          </>
        }
      />
      <div className="content">
        <h1 className="sr-only">Productos</h1>
        <div className="dash">
          <aside className="stack" aria-label="Resumen del worker">
            <WorkerUsage summary={summary.data} error={summary.error} onRetry={summary.reload} />
            <AlertsPanel summary={summary.data} />
            <RecentReadings readings={readings.data} products={products.data} error={readings.error} onRetry={readings.reload} />
          </aside>
          <div style={{minWidth: 0}}>
            <div className="toolbar">
              <label className="search">
                <IconSearch />
                <span className="sr-only">Buscar productos</span>
                <input
                  ref={searchRef}
                  id="product-search"
                  type="search"
                  placeholder="Buscar productos…"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && query) {
                      event.preventDefault();
                      setQuery('');
                    }
                  }}
                  aria-keyshortcuts="/"
                />
                <span className="kbd" aria-hidden="true">
                  /
                </span>
              </label>
              <div className="toggle" role="group" aria-label="Vista">
                <button type="button" aria-pressed={view === 'grid'} onClick={() => changeView('grid')} title="Rejilla">
                  <IconGrid />
                  <span className="sr-only">Rejilla</span>
                </button>
                <button type="button" aria-pressed={view === 'list'} onClick={() => changeView('list')} title="Lista">
                  <IconRows />
                  <span className="sr-only">Lista</span>
                </button>
              </div>
              <button type="button" className="btn" onClick={() => setAddOpen(true)}>
                Añadir…
              </button>
            </div>
            {products.data && !query && <TodayStrip products={products.data} />}
            {products.data && total > 0 && (
              <div className="split">
                <h2 className="h">Productos</h2>
                <span className="muted" style={{fontSize: 13}} aria-live="polite">
                  {query ? `${visible.length} de ${total}` : plural(total, 'producto', 'productos')}
                </span>
              </div>
            )}
            {products.error && !products.data ? (
              <ErrorNotice error={products.error} onRetry={products.reload} />
            ) : !products.data ? (
              <div className="cards">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="sk card" />
                ))}
              </div>
            ) : total === 0 ? (
              <EmptyState onAdd={() => setAddOpen(true)} />
            ) : view === 'grid' ? (
              <div className="cards">
                {visible.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    checking={checkingAll || checkingId === product.id}
                    onCheck={() => void checkOne(product)}
                  />
                ))}
              </div>
            ) : (
              visible.length > 0 && (
                <Suspense fallback={<span className="sk panel" />}>
                  <ProductTable products={visible} isChecking={(id) => checkingAll || checkingId === id} />
                </Suspense>
              )
            )}
            {products.data && query && visible.length === 0 && (
              <p className="empty panel">Ningún producto coincide con «{query}».</p>
            )}
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        {addOpen && <AddProductDialog open onClose={() => setAddOpen(false)} />}
        {helpOpen && <HelpDialog open onClose={() => setHelpOpen(false)} />}
      </Suspense>
    </>
  );
}

export default function ProductsPage() {
  return (
    <PrivatePage crumb={<span>Todos los productos</span>} title="Resumen" variant="dash">
      {() => <Dashboard />}
    </PrivatePage>
  );
}
