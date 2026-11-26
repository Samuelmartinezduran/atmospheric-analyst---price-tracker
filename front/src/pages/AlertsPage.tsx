import {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertTriangle, Bell, RefreshCw} from 'lucide-react';
import {listAlerts} from '../api/alerts';
import {getErrorMessage, isAbortError, isApiError} from '../api/client';
import type {Alert, AlertStatus} from '../api/types';
import {ALERT_STATUS_LABEL, AlertsList} from '../components/AlertsList';
import {Button, EmptyState, PageHeader, Spinner} from '../components/ui';
import {markAlertsSeen} from '../lib/alertsSeen';
import {cn} from '../lib/utils';
import {useAppContext} from '../layouts/AppLayout';

type Filter = 'all' | AlertStatus;

const FILTERS: {value: Filter; label: string}[] = [
  {value: 'all', label: 'Todas'},
  {value: 'pending', label: 'Pendientes'},
  {value: 'sent', label: 'Enviadas'},
  {value: 'failed', label: 'Fallidas'},
];

export function AlertsPage() {
  const {setNewAlerts} = useAppContext();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const data = await listAlerts(signal);
        setAlerts(data);
        setError(null);
        markAlertsSeen();
        setNewAlerts(0);
      } catch (err) {
        if (isAbortError(err) || isApiError(err, 401)) return;
        setError(getErrorMessage(err, 'No se han podido cargar las alertas.'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [setNewAlerts],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {all: alerts.length, pending: 0, sent: 0, failed: 0};
    for (const alert of alerts) if (alert.status in result) result[alert.status] += 1;
    return result;
  }, [alerts]);

  const visible = filter === 'all' ? alerts : alerts.filter((alert) => alert.status === filter);

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Cada vez que un producto baja de tu objetivo se crea una alerta y te llega un email."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => void load()}>
            Actualizar
          </Button>
        }
      />

      {alerts.length > 0 && (
        <div role="group" aria-label="Filtrar por estado" className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map(({value, label}) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                filter === value
                  ? 'bg-primary text-white'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface',
              )}
            >
              {label} <span className="tabular-nums opacity-80">{counts[value]}</span>
            </button>
          ))}
        </div>
      )}

      {loading && alerts.length === 0 ? (
        <div className="rounded-2xl bg-surface-container-lowest p-8">
          <Spinner label="Cargando alertas…" />
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="No se han podido cargar las alertas"
          action={
            <Button variant="tonal" icon={RefreshCw} onClick={() => void load()}>
              Reintentar
            </Button>
          }
        >
          {error}
        </EmptyState>
      ) : alerts.length === 0 ? (
        <EmptyState icon={Bell} title="Todavía no hay alertas">
          Aparecerán aquí cuando uno de tus productos baje del precio objetivo.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon={Bell} title={`No hay alertas en «${ALERT_STATUS_LABEL[filter as AlertStatus]}»`}>
          Prueba con otro filtro.
        </EmptyState>
      ) : (
        <AlertsList alerts={visible} />
      )}
    </>
  );
}
