import {useState} from 'react';
import {getErrorMessage, isApiError} from '../api/client';
import {checkProduct, deleteProduct} from '../api/products';
import type {Product} from '../api/types';
import {IconExternal, IconPencil, IconRefresh, IconTrash} from '../components/icons';
import {PriceChart} from '../components/PriceChart';
import {EditTargetDialog} from '../components/productDialogs';
import {PrivatePage} from '../components/PrivatePage';
import {ReadingsTable} from '../components/ReadingsTable';
import {SkeletonBody} from '../components/skeletons';
import {Dot, ErrorNotice, Spinner, Topbar} from '../components/ui';
import {ConfirmDialog} from '../components/dialog';
import {mutate} from '../lib/cache';
import {KEYS, refreshAfterChange, useHistory, useProducts, useReadings} from '../lib/data';
import {formatDate, formatDateTime, formatPercent, formatPrice, plural} from '../lib/format';
import {formatRelative} from '../lib/relativeTime';
import {navigate} from '../lib/nav';
import {getPriceVerdict, type VerdictKind} from '../lib/priceVerdict';
import {
  STATUS_DOT,
  STATUS_LABEL,
  getUiStatus,
  productDomain,
  productName,
  safeExternalUrl,
  storeInitials,
  storeName,
} from '../lib/productStatus';
import {toast} from '../lib/toast';

const VERDICT_DOT: Record<VerdictKind, '' | 'ok' | 'warn'> = {
  lowest: 'ok',
  good: 'ok',
  normal: '',
  high: 'warn',
  unknown: '',
};

export function readProductId(search: string): number | null {
  const raw = new URLSearchParams(search).get('id');
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const crumbFor = (name?: string) => (
  <>
    <a href="/">Productos</a>
    <span className="sl" aria-hidden="true">
      /
    </span>
    <span className="cur">{name ?? 'Detalle'}</span>
  </>
);

function Figures({product}: {product: Product}) {
  const verdict = getPriceVerdict(product);
  const stats = product.stats;
  const status = getUiStatus(product);
  const hasPrice = product.last_status === 'ok' && product.last_price !== null;
  let verdictSub = '';
  if (verdict.vsAverage !== null && verdict.kind !== 'unknown') {
    const pct = formatPercent(Math.abs(verdict.vsAverage));
    verdictSub = verdict.vsAverage < 0 ? `${pct} por debajo de la media` : `${pct} por encima de la media`;
  } else if (verdict.kind === 'unknown' && stats?.checks_count !== null && stats?.checks_count !== undefined) {
    verdictSub = plural(stats.checks_count, 'lectura con precio', 'lecturas con precio');
  }
  return (
    <dl className="panel figures">
      <div>
        <dt>Ahora</dt>
        <dd>{hasPrice ? formatPrice(product.last_price) : '—'}</dd>
        <span className="sub">
          {hasPrice
            ? product.is_below_target
              ? 'a tu precio'
              : `${formatPrice((product.last_price ?? 0) - product.desired_price)} sobre el objetivo`
            : STATUS_LABEL[status].toLowerCase()}
        </span>
      </div>
      <div>
        <dt>Objetivo</dt>
        <dd className="mono">{formatPrice(product.desired_price)}</dd>
        <span className="sub">aviso por correo al bajar de aquí</span>
      </div>
      <div>
        <dt>Mínimo histórico</dt>
        <dd>{formatPrice(stats?.lowest_price)}</dd>
        <span className="sub">{stats?.lowest_price_at ? formatDate(stats.lowest_price_at) : 'sin datos'}</span>
      </div>
      <div>
        <dt>Media 30 días</dt>
        <dd>{formatPrice(stats?.avg_price_30d)}</dd>
        <span className="sub">
          {stats?.highest_price !== null && stats?.highest_price !== undefined ? `máximo ${formatPrice(stats.highest_price)}` : 'sin datos'}
        </span>
      </div>
      <div>
        <dt>Veredicto</dt>
        <dd className="verdict">
          <Dot tone={VERDICT_DOT[verdict.kind]} />
          {verdict.title}
        </dd>
        {verdictSub && <span className="sub">{verdictSub}</span>}
      </div>
    </dl>
  );
}

function Detail({id}: {id: number}) {
  const products = useProducts();
  const history = useHistory(id);
  const readings = useReadings(200, id);
  const [checking, setChecking] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const product = products.data?.find((p) => p.id === id);

  if (!product) {
    if (deleted) return <Topbar crumb={crumbFor()} title="Detalle" />;
    if (products.error && !products.data) {
      return (
        <>
          <Topbar crumb={crumbFor()} title="Detalle" />
          <div className="content">
            <ErrorNotice error={products.error} onRetry={products.reload} />
          </div>
        </>
      );
    }
    if (!products.data || products.loading) {
      return (
        <>
          <Topbar crumb={crumbFor()} title="Detalle" />
          <div className="content" role="status">
            <span className="sr-only">Cargando…</span>
            <SkeletonBody variant="detail" />
          </div>
        </>
      );
    }
    return <NotFound />;
  }

  const name = productName(product);
  const status = getUiStatus(product);
  const external = safeExternalUrl(product.url);

  const check = async () => {
    setChecking(true);
    try {
      const result = await checkProduct(product.id);
      toast.success(result.alerts_created ? 'Comprobado. Hay una alerta nueva.' : 'Comprobado.');
    } catch (err) {
      if (isApiError(err, 409)) toast.info('Ya se está comprobando. Espera unos segundos.');
      else toast.error(getErrorMessage(err));
    } finally {
      setChecking(false);
      refreshAfterChange(product.id);
    }
  };

  const remove = async () => {
    await deleteProduct(product.id);
    setDeleted(true);
    mutate<Product[]>(KEYS.products, (list) => list?.filter((p) => p.id !== product.id));
    refreshAfterChange();
    toast.success(`Has dejado de seguir «${name}».`);
    await navigate('/', {replace: true});
  };

  return (
    <>
      <Topbar crumb={crumbFor(name)} title="Detalle" />
      <div className="content">
        <header className="ph">
          <span className="ico lg" aria-hidden="true">
            {storeInitials(product.store)}
          </span>
          <div style={{minWidth: 0}}>
            <h1>{name}</h1>
            <div className="meta">
              <span>
                {storeName(product.store)} · {productDomain(product.url)}
              </span>
              <span className="status">
                {checking ? <Spinner /> : <Dot tone={STATUS_DOT[status]} />}
                {checking ? 'Comprobando…' : STATUS_LABEL[status]}
              </span>
              <span title={formatDateTime(product.last_checked_at)}>
                {product.last_checked_at ? `Leído ${formatRelative(product.last_checked_at)}` : 'Aún sin leer'}
              </span>
            </div>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={check} disabled={checking} aria-busy={checking}>
              {checking ? <Spinner /> : <IconRefresh />}
              Comprobar ahora
            </button>
            {external && (
              <a className="btn sec" href={external} target="_blank" rel="noopener noreferrer">
                <IconExternal />
                Abrir en la tienda
                <span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
            )}
            <button type="button" className="btn sec" onClick={() => setEditOpen(true)}>
              <IconPencil />
              Editar objetivo
            </button>
            <button type="button" className="btn sec" onClick={() => setDeleteOpen(true)}>
              <IconTrash />
              Borrar
            </button>
          </div>
        </header>

        {product.last_status === 'error' && product.last_error && (
          <div className="notice err" style={{marginBottom: 18}}>
            <Dot tone="err" />
            <div className="grow">
              <p>La última lectura falló: {product.last_error}</p>
            </div>
          </div>
        )}

        <Figures product={product} />

        <section className="panel" aria-labelledby="chart-h" style={{marginBottom: 18}}>
          <div className="panel-h">
            <h2 id="chart-h">Historial de precios</h2>
            {history.data && <span>{plural(history.data.length, 'lectura', 'lecturas')}</span>}
          </div>
          {history.data ? (
            <PriceChart history={history.data} target={product.desired_price} />
          ) : history.error ? (
            <div className="panel-b">
              <ErrorNotice error={history.error} onRetry={history.reload} />
            </div>
          ) : (
            <div className="panel-b">
              <span className="sk block" style={{height: 300}} />
            </div>
          )}
        </section>

        <section aria-labelledby="readings-h">
          <h2 className="h" id="readings-h">
            Lecturas
          </h2>
          {readings.data ? (
            readings.data.length ? (
              <ReadingsTable readings={readings.data} products={[product]} caption={`Lecturas de ${name}`} />
            ) : (
              <p className="empty panel">Aún no hay lecturas de este producto.</p>
            )
          ) : readings.error ? (
            <ErrorNotice error={readings.error} onRetry={readings.reload} />
          ) : (
            <span className="sk panel" />
          )}
        </section>
      </div>
      <EditTargetDialog product={product} open={editOpen} onClose={() => setEditOpen(false)} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="¿Dejar de seguir este producto?"
        description={
          <>
            Se borrarán «{name}», su historial de precios y sus alertas. No se puede deshacer.
          </>
        }
        confirmLabel="Borrar producto"
        danger
        onConfirm={remove}
      />
    </>
  );
}

function NotFound() {
  return (
    <>
      <Topbar crumb={crumbFor()} title="Detalle" />
      <div className="content">
        <div className="centered">
          <div className="panel">
            <h1 style={{fontSize: 18, fontWeight: 600}}>No encontramos este producto</h1>
            <p className="muted">Puede que lo hayas borrado o que el enlace esté mal.</p>
            <a className="btn sec" href="/">
              Volver a productos
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ProductPage() {
  const [id] = useState(() => readProductId(window.location.search));
  return (
    <PrivatePage crumb={crumbFor()} title="Detalle" variant="detail">
      {() => (id === null ? <NotFound /> : <Detail id={id} />)}
    </PrivatePage>
  );
}
