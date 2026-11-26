/** Columna izquierda del panel: uso del worker, alertas y lecturas recientes. */
import type {Product, Reading, Summary} from '../api/types';
import {formatClock, formatDateTime, formatDuration, formatPrice} from '../lib/format';
import {formatDelta} from '../lib/productStatus';
import {describeReadingChange} from '../lib/readings';
import {productHref} from './ProductCard';
import {ProductPhoto} from './ProductPhoto';
import {ErrorNotice} from './ui';

function Ring({ratio}: {ratio: number}) {
  const r = 5.5;
  const c = 2 * Math.PI * r;
  const value = Math.min(1, Math.max(0, ratio));
  return (
    <svg className="ring" viewBox="0 0 14 14" aria-hidden="true">
      <circle className="track" cx="7" cy="7" r={r} />
      {value > 0 && (
        <circle
          className="val"
          cx="7"
          cy="7"
          r={r}
          strokeDasharray={`${(c * value).toFixed(2)} ${c.toFixed(2)}`}
          transform="rotate(-90 7 7)"
        />
      )}
    </svg>
  );
}

interface UsageRow {
  label: string;
  value: string;
  ratio: number;
  title?: string;
}

export function usageRows(summary: Summary, now = Date.now()): UsageRow[] {
  const total = summary.products.total;
  const expected = summary.expected_checks_24h;
  const withPrice = summary.products.below_target + summary.products.above_target;
  const intervalMs = summary.check_interval_minutes * 60_000;
  const next = summary.next_check_at ? new Date(summary.next_check_at).getTime() : null;
  const remaining = next === null ? null : Math.max(0, next - now);
  return [
    {
      label: 'Lecturas en 24 h',
      value: expected ? `${summary.checks_24h} / ${expected}` : String(summary.checks_24h),
      ratio: expected ? summary.checks_24h / expected : 0,
    },
    {label: 'Con precio', value: `${withPrice} / ${total}`, ratio: total ? withPrice / total : 0},
    {
      label: 'Errores en 24 h',
      value: String(summary.failed_checks_24h),
      ratio: summary.checks_24h ? summary.failed_checks_24h / summary.checks_24h : 0,
    },
    {
      label: 'Próxima ronda',
      value: remaining === null ? '—' : remaining < 60_000 ? 'ahora' : `en ${formatDuration(remaining)}`,
      ratio: remaining === null || !intervalMs ? 0 : 1 - Math.min(1, remaining / intervalMs),
      title: summary.next_check_at ? formatDateTime(summary.next_check_at) : undefined,
    },
  ];
}

function intervalLabel(minutes: number): string {
  if (minutes % 60 === 0) return `cada ${minutes / 60} h`;
  return `cada ${minutes} min`;
}

export function WorkerUsage({summary, error, onRetry}: {summary?: Summary; error: unknown; onRetry: () => void}) {
  return (
    <section className="panel" aria-labelledby="usage-h">
      <div className="panel-h">
        <h2 id="usage-h">Uso del worker</h2>
        {summary && <span className="badge">{intervalLabel(summary.check_interval_minutes)}</span>}
      </div>
      {summary ? (
        <ul className="use">
          {usageRows(summary).map((row) => (
            <li className="use-row" key={row.label} title={row.title}>
              <Ring ratio={row.ratio} />
              <span>
                {row.label}
                <span className="sr-only">:</span>
              </span>
              <span className="v">{row.value}</span>
              <span className="bar" aria-hidden="true">
                <i style={{width: `${Math.round(Math.min(1, row.ratio) * 100)}%`}} />
              </span>
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="panel-b">
          <ErrorNotice error={error} onRetry={onRetry} />
        </div>
      ) : (
        <div className="use">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="sk line" style={{height: 22}} />
          ))}
        </div>
      )}
    </section>
  );
}

export function AlertsPanel({summary}: {summary?: Summary}) {
  const counts = summary?.alerts;
  return (
    <section className="panel" aria-labelledby="alerts-h">
      <div className="panel-h">
        <h2 id="alerts-h">Alertas</h2>
        <a className="text-link" href="/alertas" style={{fontSize: 13}}>
          Ver todas
        </a>
      </div>
      {counts ? (
        <>
          <dl className="counters">
            <div>
              <dt>Pendientes</dt>
              <dd className={counts.pending ? 'warn' : ''}>{counts.pending}</dd>
            </div>
            <div>
              <dt>Enviadas</dt>
              <dd>{counts.sent}</dd>
            </div>
            <div>
              <dt>Fallidas</dt>
              <dd className={counts.failed ? 'bad' : ''}>{counts.failed}</dd>
            </div>
          </dl>
          <p className="mail-line">
            <span className={`dot ${summary.email_enabled ? 'ok' : ''}`} aria-hidden="true" />
            {summary.email_enabled ? 'Aviso por correo activado' : 'Correo desactivado: las alertas no salen por email'}
          </p>
        </>
      ) : (
        <div className="panel-b">
          <span className="sk line" />
        </div>
      )}
    </section>
  );
}

export function RecentReadings({
  readings,
  products,
  error,
  onRetry,
}: {
  readings?: Reading[];
  products?: Product[];
  error: unknown;
  onRetry: () => void;
}) {
  const byId = new Map(products?.map((p) => [p.id, p]));
  return (
    <section className="panel" aria-labelledby="recent-h">
      <div className="panel-h">
        <h2 id="recent-h">Lecturas recientes</h2>
        <a className="text-link" href="/lecturas" style={{fontSize: 13}}>
          Ver todas
        </a>
      </div>
      {readings ? (
        readings.length ? (
          <ul className="feed">
            {readings.map((reading) => {
              const product = byId.get(reading.product_id);
              const change = describeReadingChange(reading, product?.stats?.lowest_price);
              const tone =
                change.kind === 'down' || (change.kind === 'lowest' && (change.delta ?? 0) < 0)
                  ? 'down'
                  : change.kind === 'up'
                    ? 'up'
                    : '';
              return (
                <li key={reading.id}>
                  <ProductPhoto
                    src={product?.image_url}
                    title={reading.product_title}
                    width={28}
                    height={28}
                    className="thumb"
                  />
                  <span style={{minWidth: 0}}>
                    <a className="t" href={productHref(reading.product_id)}>
                      {reading.product_title || 'Producto sin nombre'}
                    </a>
                    <small>
                      {reading.price !== null && <b className="num">{formatPrice(reading.price)}</b>}
                      {reading.price !== null && ' · '}
                      {tone && change.delta !== null ? (
                        <span className={`delta ${tone}`} style={{fontSize: 12}}>
                          {formatDelta(change.delta)}
                          {change.kind === 'lowest' && ' · mínimo'}
                        </span>
                      ) : (
                        change.label
                      )}
                    </small>
                  </span>
                  <time dateTime={reading.checked_at} title={formatDateTime(reading.checked_at)}>
                    {formatClock(reading.checked_at)}
                  </time>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">Aún no hay lecturas. Llegarán con la primera ronda del worker.</p>
        )
      ) : error ? (
        <div className="panel-b">
          <ErrorNotice error={error} onRetry={onRetry} />
        </div>
      ) : (
        <div className="use">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="sk line" style={{height: 32}} />
          ))}
        </div>
      )}
    </section>
  );
}
