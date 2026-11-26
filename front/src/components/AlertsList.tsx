import {Link} from 'react-router';
import {AlertTriangle, CheckCircle2, Clock, ExternalLink} from 'lucide-react';
import type {Alert, AlertStatus} from '../api/types';
import {formatDateTime, formatPrice, plural} from '../lib/format';
import {cn} from '../lib/utils';

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  pending: 'Pendiente de envío',
  sent: 'Enviada',
  failed: 'Fallida',
};

const STATUS_STYLE: Record<AlertStatus, {icon: typeof Clock; classes: string}> = {
  sent: {icon: CheckCircle2, classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'},
  pending: {icon: Clock, classes: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300'},
  failed: {icon: AlertTriangle, classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'},
};

function AlertStatusBadge({status}: {status: AlertStatus}) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.failed;
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        style.classes,
      )}
    >
      <Icon size={11} aria-hidden="true" />
      {ALERT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function deliveryText(alert: Alert): string {
  if (alert.status === 'sent') {
    return alert.sent_at ? `Email enviado el ${formatDateTime(alert.sent_at)}.` : 'Email enviado.';
  }
  if (alert.status === 'pending') {
    return alert.attempts > 0
      ? `Reintentando el envío (${plural(alert.attempts, 'intento', 'intentos')} hasta ahora).`
      : 'El email saldrá en breve.';
  }
  return `No se ha podido enviar el email tras ${plural(alert.attempts, 'intento', 'intentos')}.`;
}

export function AlertsList({alerts}: {alerts: Alert[]}) {
  return (
    <ul className="space-y-3">
      {alerts.map((alert) => {
        const title = alert.product_title || alert.product_url;
        const saving = alert.desired_price - alert.triggered_price;
        return (
          <li key={alert.id} className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <AlertStatusBadge status={alert.status} />
                  <time dateTime={alert.triggered_at} className="text-[11px] font-semibold text-on-surface-variant">
                    {formatDateTime(alert.triggered_at)}
                  </time>
                </div>
                <h2 className="mb-2 truncate text-sm font-bold text-on-surface" title={title}>
                  <Link to={`/productos/${alert.product_id}`} className="hover:text-primary hover:underline">
                    {title}
                  </Link>
                </h2>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-on-surface-variant">
                  <span>
                    Objetivo: <span className="font-bold text-primary">{formatPrice(alert.desired_price, alert.currency)}</span>
                  </span>
                  <span>
                    Precio: <span className="font-bold text-on-surface">{formatPrice(alert.triggered_price, alert.currency)}</span>
                  </span>
                  {saving > 0.004 && (
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {formatPrice(saving, alert.currency)} por debajo
                    </span>
                  )}
                </p>
                <p className="mt-2 text-xs text-on-surface-variant">{deliveryText(alert)}</p>
                {alert.error_message && alert.status !== 'sent' && (
                  <p className="mt-1 rounded-lg bg-error/8 px-3 py-2 font-mono text-[11px] break-words text-error">
                    {alert.error_message}
                  </p>
                )}
              </div>
              <a
                href={alert.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-xl bg-surface-container-high p-2 text-on-surface-variant transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <ExternalLink size={16} aria-hidden="true" />
                <span className="sr-only">Ver «{title}» en la tienda (se abre en una pestaña nueva)</span>
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
