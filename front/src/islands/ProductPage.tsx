import {useState} from 'react';
import {getErrorMessage, isApiError} from '../api/client';
import {checkProduct, deleteProduct} from '../api/products';
import type {Product, Summary} from '../api/types';
import {ConfirmDialog} from '../components/dialog';
import {IconExternal, IconPencil, IconRefresh, IconTrash} from '../components/icons';
import {PriceChart} from '../components/PriceChart';
import {Delta, StatusPill} from '../components/ProductCard';
import {EditTargetDialog} from '../components/productDialogs';
import {ProductPhoto} from '../components/ProductPhoto';
import {PrivatePage} from '../components/PrivatePage';
import {ReadingsTable} from '../components/ReadingsTable';
import {SkeletonBody} from '../components/skeletons';
import {ErrorNotice, Spinner, Topbar} from '../components/ui';
import {mutate} from '../lib/cache';
import {KEYS, refreshAfterChange, useHistory, useProduct, useReadings, useSummary} from '../lib/data';
import {formatDate, formatDateTime, formatPercent, formatPrice, plural} from '../lib/format';
import {navigate} from '../lib/nav';
import {getPriceVerdict} from '../lib/priceVerdict';
import {priceDelta, productName, safeExternalUrl, storeName} from '../lib/productStatus';
import {computeRange} from '../lib/range';
import {formatRelative} from '../lib/relativeTime';
import {toast} from '../lib/toast';

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

const same = (a: number | null | undefined, b: number | null | undefined) =>
  typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005;

interface LegendItem {
  key: string;
  label: string;
  value: number;
  marker: 'now' | 'now-ok' | 'target' | 'min' | 'avg' | 'max';
  sub?: string;
  badge?: string;
}

/**
 * Medidor grande: mínimo, media de 30 días, máximo, objetivo y actual. Las cifras que coinciden
 * con el precio actual no se repiten: se dicen una vez, con su insignia.
 */
function RangePanel({product}: {product: Product}) {
  const stats = product.stats;
  const current = product.last_status === 'ok' ? product.last_price : null;
  const min = stats?.lowest_price ?? null;
  const max = stats?.highest_price ?? null;
  const avg = stats?.avg_price_30d ?? null;
  const model = computeRange({min, max, target: product.desired_price, current, avg});
  const verdict = getPriceVerdict(product);

  const items: LegendItem[] = [];
  if (current !== null) {
    const badge = same(current, min) ? 'Es su mínimo histórico' : same(current, max) ? 'Es su máximo histórico' : undefined;
    items.push({key: 'now', label: 'Ahora', value: current, marker: model.atTarget ? 'now-ok' : 'now', badge});
  }
  items.push({key: 'target', label: 'Objetivo', value: product.desired_price, marker: 'target'});
  if (min !== null && !same(min, current)) {
    items.push({key: 'min', label: 'Mínimo', value: min, marker: 'min', sub: stats?.lowest_price_at ? formatDate(stats.lowest_price_at) : undefined});
  }
  if (avg !== null && !same(avg, current) && !same(avg, min)) {
    items.push({key: 'avg', label: 'Media 30 días', value: avg, marker: 'avg'});
  }
  if (max !== null && !same(max, current) && !same(max, min)) {
    items.push({key: 'max', label: 'Máximo', value: max, marker: 'max'});
  }

  let verdictSub = '';
  if (verdict.vsAverage !== null && verdict.kind !== 'unknown' && Math.abs(verdict.vsAverage) >= 0.0005) {
    const pct = formatPercent(Math.abs(verdict.vsAverage));
    verdictSub = verdict.vsAverage < 0 ? `${pct} por debajo de la media` : `${pct} por encima de la media`;
  } else if (verdict.kind === 'unknown' && stats?.checks_count) {
    verdictSub = plural(stats.checks_count, 'lectura con precio', 'lecturas con precio');
  }

  return (
    <section className="panel range-panel" aria-labelledby="range-h">
      <div className="panel-h">
        <h2 id="range-h">Dónde está el precio</h2>
        {/* «Está en su mínimo histórico» ya lo dice la insignia de «Ahora»: no se repite. */}
        {!(verdict.kind === 'lowest' && items[0]?.badge) && (
          <span className={`pill plain ${verdict.kind === 'good' ? 'ok' : verdict.kind === 'high' ? 'err' : ''}`}>
            {verdict.title}
          </span>
        )}
      </div>
      <div className="panel-b">
        <div className="meter lg" role="img" aria-label={items.map((i) => `${i.label} ${formatPrice(i.value)}`).join(', ')}>
          <div className="meter-track">
            {model.histMin !== null && (
              <span className="meter-hist" style={{left: `${model.histFrom}%`, width: `${Math.max(model.histTo - model.histFrom, 0)}%`}} />
            )}
            {model.avgPos !== null && items.some((i) => i.key === 'avg') && (
              <span className="meter-avg" style={{left: `${model.avgPos}%`}} />
            )}
            <span className="meter-target" style={{left: `${model.targetPos}%`}} />
            {model.currentPos !== null && (
              <span className={`meter-now${model.atTarget ? ' ok' : ''}`} style={{left: `${model.currentPos}%`}} />
            )}
          </div>
        </div>
        <dl className="legend-grid">
          {items.map((item) => (
            <div key={item.key}>
              <dt>
                <i className={`mk ${item.marker}`} aria-hidden="true" />
                {item.label}
              </dt>
              <dd>{formatPrice(item.value)}</dd>
              {item.sub && <dd className="sub">{item.sub}</dd>}
              {item.badge && (
                <dd>
                  <span className="pill ok plain">{item.badge}</span>
                </dd>
              )}
            </div>
          ))}
        </dl>
        {verdictSub && <p className="muted range-note">{verdictSub}</p>}
      </div>
    </section>
  );
}

/** Hora de la próxima lectura de este producto (su última lectura + el intervalo del worker). */
function nextReading(product: Product, summary?: Summary): string {
  if (!product.last_checked_at || !summary) return 'en la próxima ronda';
  const next = new Date(new Date(product.last_checked_at).getTime() + summary.check_interval_minutes * 60_000);
  if (next.getTime() <= Date.now()) return 'en la próxima ronda';
  const hhmm = next.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
  const today = new Date();
  return next.toDateString() === today.toDateString() ? `a las ${hhmm}` : `mañana a las ${hhmm}`;
}

function Detail({id}: {id: number}) {
  const product = useProduct(id);
  const history = useHistory(id);
  const readings = useReadings(200, id);
  const summary = useSummary();
  const [checking, setChecking] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const data = product.data;

  if (deleted) return <Topbar crumb={crumbFor()} title="Detalle" />;
  if (!data) {
    if (isApiError(product.error, 404)) return <NotFound />;
    return (
      <>
        <Topbar crumb={crumbFor()} title="Detalle" />
        <div className="content">
          {product.error ? (
            <ErrorNotice error={product.error} onRetry={product.reload} />
          ) : (
            <div role="status">
              <span className="sr-only">Cargando…</span>
              <SkeletonBody variant="detail" />
            </div>
          )}
        </div>
      </>
    );
  }

  const name = productName(data);
  const external = safeExternalUrl(data.url);
  const hasPrice = data.last_status === 'ok' && data.last_price !== null;
  const pricedPoints = history.data?.filter((p) => typeof p.price === 'number').length ?? 0;

  const check = async () => {
    setChecking(true);
    try {
      const result = await checkProduct(data.id);
      toast.success(result.alerts_created ? 'Comprobado. Hay una alerta nueva.' : 'Comprobado.');
    } catch (err) {
      if (isApiError(err, 409)) toast.info('Ya se está comprobando. Espera unos segundos.');
      else toast.error(getErrorMessage(err));
    } finally {
      setChecking(false);
      refreshAfterChange(data.id);
    }
  };

  const remove = async () => {
    await deleteProduct(data.id);
    setDeleted(true);
    mutate<Product[]>(KEYS.products, (list) => list?.filter((p) => p.id !== data.id));
    refreshAfterChange();
    toast.success(`Has dejado de seguir «${name}».`);
    await navigate('/', {replace: true});
  };

  return (
    <>
      <Topbar crumb={crumbFor(name)} title="Detalle" />
      <div className="content">
        <header className="dhead">
          <div className="dphoto">
            <ProductPhoto src={data.image_url} title={data.title} width={560} height={560} eager />
          </div>
          <div className="dinfo">
            <div className="dmeta">
              <span className="store">{storeName(data.store)}</span>
              <StatusPill product={data} checking={checking} />
              <span className="muted" title={formatDateTime(data.last_checked_at)}>
                {data.last_checked_at ? `Leído ${formatRelative(data.last_checked_at)}` : 'Aún sin leer'}
              </span>
            </div>
            <h1>{name}</h1>
            <div className="dprice">
              {hasPrice ? <strong>{formatPrice(data.last_price)}</strong> : <strong className="none">Sin precio</strong>}
              <Delta value={priceDelta(data)} />
            </div>
            <div className="dtarget">
              <span>
                Objetivo <b>{formatPrice(data.desired_price)}</b>
                {hasPrice && (
                  <span className={data.is_below_target ? 'delta down' : 'muted'}>
                    {' · '}
                    {data.is_below_target
                      ? `${formatPrice(data.desired_price - (data.last_price ?? 0))} por debajo`
                      : `${formatPrice((data.last_price ?? 0) - data.desired_price)} por encima`}
                  </span>
                )}
              </span>
              <button type="button" className="btn sec sm" onClick={() => setEditOpen(true)}>
                <IconPencil />
                Editar
                <span className="sr-only"> el objetivo</span>
              </button>
            </div>
            {data.last_status === 'error' && data.last_error && (
              <div className="notice err">
                <span className="dot err" aria-hidden="true" />
                <div className="grow">
                  <p>La última lectura falló: {data.last_error}</p>
                </div>
              </div>
            )}
            <div className="dactions">
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
              <button type="button" className="btn sec" onClick={() => setDeleteOpen(true)}>
                <IconTrash />
                Borrar
              </button>
            </div>
          </div>
        </header>

        <RangePanel product={data} />

        <section className="panel" aria-labelledby="chart-h" style={{margin: '18px 0'}}>
          <div className="panel-h">
            <h2 id="chart-h">Historial de precios</h2>
            {history.data && <span>{plural(history.data.length, 'lectura', 'lecturas')}</span>}
          </div>
          {history.data ? (
            pricedPoints >= 3 ? (
              <PriceChart history={history.data} target={data.desired_price} />
            ) : (
              <div className="chart-soon">
                <svg viewBox="0 0 240 70" aria-hidden="true">
                  <path d="M6 54 C 50 50, 70 30, 110 36 S 180 20, 234 14" fill="none" stroke="var(--line2)" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" />
                  <circle cx="6" cy="54" r="4.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
                  {pricedPoints === 2 && <circle cx="110" cy="36" r="4.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />}
                </svg>
                <p>
                  <b>El historial se irá llenando</b>
                  <span>
                    {pricedPoints === 0 ? 'Aún no hay lecturas con precio' : plural(pricedPoints, 'lectura con precio', 'lecturas con precio')}
                    : la próxima lectura es {nextReading(data, summary.data)}.
                  </span>
                </p>
              </div>
            )
          ) : history.error ? (
            <div className="panel-b">
              <ErrorNotice error={history.error} onRetry={history.reload} />
            </div>
          ) : (
            <div className="panel-b">
              <span className="sk block" style={{height: 120}} />
            </div>
          )}
        </section>

        <section aria-labelledby="readings-h">
          <h2 className="h" id="readings-h">
            Lecturas
          </h2>
          {readings.data ? (
            readings.data.length ? (
              <ReadingsTable readings={readings.data} products={[data]} caption={`Lecturas de ${name}`} />
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
      <EditTargetDialog product={data} open={editOpen} onClose={() => setEditOpen(false)} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="¿Dejar de seguir este producto?"
        description={<>Se borrarán «{name}», su historial de precios y sus alertas. No se puede deshacer.</>}
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
