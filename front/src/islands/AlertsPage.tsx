import {useEffect, useState} from 'react';
import type {AlertStatus} from '../api/types';
import {PrivatePage} from '../components/PrivatePage';
import {productHref} from '../components/ProductCard';
import {SkeletonBody} from '../components/skeletons';
import {Dot, ErrorNotice, Topbar} from '../components/ui';
import {markAlertsSeen, notifyAlertsSeen} from '../lib/alertsSeen';
import {useAlerts, useSummary} from '../lib/data';
import {formatDateTime, formatPrice} from '../lib/format';

type Filter = 'all' | AlertStatus;

const FILTERS: {id: Filter; label: string}[] = [
  {id: 'all', label: 'Todas'},
  {id: 'pending', label: 'Pendientes'},
  {id: 'sent', label: 'Enviadas'},
  {id: 'failed', label: 'Fallidas'},
];

const STATUS: Record<AlertStatus, {label: string; dot: '' | 'ok' | 'warn' | 'err'}> = {
  pending: {label: 'Pendiente', dot: 'warn'},
  sent: {label: 'Enviada', dot: 'ok'},
  failed: {label: 'Fallida', dot: 'err'},
};

function Alerts() {
  const alerts = useAlerts();
  const summary = useSummary();
  const [filter, setFilter] = useState<Filter>('all');

  // Al ver la página, las alertas dejan de contar como nuevas en la insignia.
  useEffect(() => {
    if (!alerts.data) return;
    markAlertsSeen();
    notifyAlertsSeen();
  }, [alerts.data]);

  const list = alerts.data ?? [];
  const visible = filter === 'all' ? list : list.filter((alert) => alert.status === filter);
  const count = (id: Filter) => (id === 'all' ? list.length : list.filter((alert) => alert.status === id).length);

  return (
    <>
      <Topbar crumb={<span>Avisos por correo</span>} title="Alertas" />
      <div className="content">
        <div className="page-h">
          <div>
            <h1>Alertas</h1>
            <p>
              Cada vez que un precio cruza tu objetivo hacia abajo se crea un aviso.{' '}
              {summary.data && !summary.data.email_enabled && 'El correo está desactivado: los avisos no salen por email.'}
            </p>
          </div>
          <div className="seg" role="group" aria-label="Filtrar por estado">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}
                {alerts.data && <span className="n">{count(item.id)}</span>}
              </button>
            ))}
          </div>
        </div>
        {alerts.data ? (
          visible.length ? (
            <div className="table-wrap">
              <table className="t">
                <caption className="sr-only">Alertas {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}</caption>
                <thead>
                  <tr>
                    <th scope="col">Estado</th>
                    <th scope="col">Producto</th>
                    <th scope="col" className="r">
                      Precio
                    </th>
                    <th scope="col" className="r">
                      Objetivo
                    </th>
                    <th scope="col" className="r">
                      Intentos
                    </th>
                    <th scope="col">Error</th>
                    <th scope="col" className="r">
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((alert) => (
                    <tr key={alert.id}>
                      <td className="nowrap">
                        <span className="status">
                          <Dot tone={STATUS[alert.status]?.dot ?? ''} />
                          {STATUS[alert.status]?.label ?? alert.status}
                        </span>
                      </td>
                      <td className="name">
                        <a href={productHref(alert.product_id)}>{alert.product_title || alert.product_url}</a>
                      </td>
                      <td className="r nowrap" style={{fontWeight: 600}}>
                        {formatPrice(alert.triggered_price, alert.currency)}
                      </td>
                      <td className="r nowrap mono muted">{formatPrice(alert.desired_price, alert.currency)}</td>
                      <td className="r mono">{alert.attempts}</td>
                      <td className="err-msg">{alert.error_message ?? '—'}</td>
                      <td className="r nowrap">
                        <time className="time" dateTime={alert.triggered_at}>
                          {formatDateTime(alert.triggered_at)}
                        </time>
                        {alert.sent_at && (
                          <span className="sub" style={{fontSize: 12}}>
                            enviada {formatDateTime(alert.sent_at)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty panel">
              {list.length ? 'No hay alertas con este estado.' : 'Aún no hay alertas. Aparecerán cuando un precio baje de tu objetivo.'}
            </p>
          )
        ) : alerts.error ? (
          <ErrorNotice error={alerts.error} onRetry={alerts.reload} />
        ) : (
          <SkeletonBody variant="table" />
        )}
      </div>
    </>
  );
}

export default function AlertsPage() {
  return (
    <PrivatePage crumb={<span>Avisos por correo</span>} title="Alertas" variant="table">
      {() => <Alerts />}
    </PrivatePage>
  );
}
