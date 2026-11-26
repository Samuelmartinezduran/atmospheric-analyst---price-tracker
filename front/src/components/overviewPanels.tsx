/** Columna izquierda del panel: uso del worker, alertas y lecturas recientes. */
import type {Alert, Product, Reading, Summary} from '../api/types';
import {formatClock, formatDateTime, formatDuration, formatPrice} from '../lib/format';
import {describeReadingChange, isAtTarget} from '../lib/readings';
import {IconTarget} from './icons';
import {productHref} from './ProductCard';
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
  const perDay = summary.check_interval_minutes > 0 ? (24 * 60) / summary.check_interval_minutes : 0;
  const expected = Math.max(Math.round(total * perDay), 0);
  const withPrice = summary.products.below_target + summary.products.above_target;
  const intervalMs = summary.check_interval_minutes * 60_000;
  const next = summary.next_check_at ? new Date(summary.next_check_at).getTime() : null;
  const remaining = next === null ? null : Math.max(0, next - now);
  return [
    {
      label: 'Lecturas en 24 h',
      value: expected ? `${summary.checks_24h} / ${expected}` : String(summary.checks_24h),
      ratio: expected ? summary.checks_24h / expected : 0,
      title: expected ? `Esperadas: ${total} productos × ${perDay.toLocaleString('es-ES')} rondas al día` : undefined,
    },
    {label: 'Con precio', value: `${withPrice} / ${total}`, ratio: total ? withPrice / total : 0},
    {
      label: 'Errores en 24 h',
      value: String(summary.failed_checks_24h),
      ratio: summary.checks_24h ? summary.failed_checks_24h / summary.checks_24h : 0,
    },
    {
      label: 'Hasta la próxima ronda',
      value: remaining === null ? '—' : remaining < 60_000 ? 'ahora' : formatDuration(remaining),
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
    <section aria-labelledby="usage-h">
      <h2 className="h" id="usage-h">
        Uso del worker
      </h2>
      <div className="panel">
        <div className="panel-h">
          <span>Últimas 24 horas</span>
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
      </div>
    </section>
  );
}

export function AlertsPanel({alerts, summary}: {alerts?: Alert[]; summary?: Summary}) {
  const pending = alerts?.filter((alert) => alert.status === 'pending').length ?? 0;
  const failed = alerts?.filter((alert) => alert.status === 'failed').length ?? 0;
  const email = summary?.email_enabled;
  return (
    <section aria-labelledby="alerts-h">
      <h2 className="h" id="alerts-h">
        Alertas
      </h2>
      <div className="panel alerts-box">
        <IconTarget />
        {alerts === undefined || summary === undefined ? (
          <span className="sk line" style={{width: '70%'}} />
        ) : (
          <>
            <b>{email ? 'Te avisamos por correo' : 'El correo está desactivado'}</b>
            <span>
              {email
                ? 'cuando un producto baje de tu objetivo. '
                : 'Las alertas se guardan aquí, pero no salen emails. '}
              {pending === 0
                ? 'No hay avisos pendientes.'
                : pending === 1
                  ? 'Hay 1 aviso pendiente de enviar.'
                  : `Hay ${pending} avisos pendientes de enviar.`}
              {failed > 0 && ` ${failed === 1 ? '1 falló' : `${failed} fallaron`}.`}
            </span>
            {(pending > 0 || failed > 0) && (
              <a href="/alertas" className="text-link">
                Ver las alertas
              </a>
            )}
          </>
        )}
      </div>
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
  const lowest = new Map(products?.map((p) => [p.id, p.stats?.lowest_price ?? null]));
  return (
    <section aria-labelledby="recent-h">
      <div className="split">
        <h2 className="h" id="recent-h">
          Lecturas recientes
        </h2>
        <a href="/lecturas">Ver todas</a>
      </div>
      <div className="panel">
        {readings ? (
          readings.length ? (
            <ul className="feed">
              {readings.map((reading) => {
                const change = describeReadingChange(reading, lowest.get(reading.product_id));
                return (
                  <li key={reading.id}>
                    <span style={{minWidth: 0}}>
                      <a className="t" href={productHref(reading.product_id)}>
                        {reading.product_title || 'Producto sin nombre'}
                      </a>
                      <small>{change.label}</small>
                      <span className="chips">
                        {reading.price !== null ? (
                          <>
                            <span className="chip">{formatPrice(reading.price)}</span>
                            <span className="chip">{isAtTarget(reading) ? 'a tu precio' : 'por encima'}</span>
                          </>
                        ) : reading.previous_price !== null ? (
                          <span className="chip">último {formatPrice(reading.previous_price)}</span>
                        ) : null}
                      </span>
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
              <span key={i} className="sk line" style={{height: 40}} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
