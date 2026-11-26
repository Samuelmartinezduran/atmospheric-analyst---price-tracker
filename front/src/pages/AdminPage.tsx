import {useCallback, useEffect, useState} from 'react';
import {RefreshCw, ShieldCheck, Trash2} from 'lucide-react';
import {deleteUser, getAdminOverview, type AdminOverview, type AdminUserRow} from '../api/admin';
import {getErrorMessage, isAbortError, isApiError} from '../api/client';
import {useAuth} from '../auth/AuthContext';
import {ConfirmDialog} from '../components/Modal';
import {useToast} from '../components/Toasts';
import {Button, Message, PageHeader, Spinner} from '../components/ui';
import {formatDate, formatRelative, plural} from '../lib/format';

function Stat({label, value, hint}: {label: string; value: number | string; hint?: string}) {
  return (
    <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-2 font-manrope text-3xl font-extrabold text-on-surface">{value}</p>
      {hint && <p className="mt-1 text-xs font-semibold text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function Badge({children, tone}: {children: string; tone: 'primary' | 'muted' | 'warning'}) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    muted: 'bg-surface-container-high text-on-surface-variant',
    warning: 'bg-tertiary/10 text-tertiary',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tones[tone]}`}>{children}</span>;
}

export function AdminPage() {
  const {user} = useAuth();
  const toast = useToast();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      setData(await getAdminOverview(signal));
      setError(null);
    } catch (err) {
      if (isAbortError(err) || isApiError(err, 401)) return;
      setError(getErrorMessage(err, 'No se ha podido cargar el panel de administración.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteUser(pendingDelete.id);
      toast.success(`Cuenta ${pendingDelete.email} borrada.`);
      setPendingDelete(null);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'No se ha podido borrar la cuenta.'));
    } finally {
      setDeleting(false);
    }
  }

  const totals = data?.totals;

  return (
    <>
      <PageHeader
        title="Administración"
        description="Estado de la app y cuentas registradas. Solo lo ven los administradores."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => void load()}>
            Actualizar
          </Button>
        }
      />

      {error && (
        <Message kind="error" className="mb-6">
          {error}
        </Message>
      )}

      {!data && loading && <Spinner label="Cargando el panel…" />}

      {data && totals && (
        <div className="space-y-8">
          <section aria-label="Resumen" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Cuentas" value={totals.users} hint={`${totals.verified_users} verificadas`} />
            <Stat label="Productos" value={totals.products} hint={`${totals.active_products} activos`} />
            <Stat
              label="Lecturas en 24 h"
              value={totals.checks_24h}
              hint={totals.failed_checks_24h ? `${totals.failed_checks_24h} con error` : 'Sin errores'}
            />
            <Stat
              label="Alertas"
              value={totals.alerts_sent}
              hint={`enviadas · ${totals.alerts_pending} pendientes · ${totals.alerts_failed} fallidas`}
            />
          </section>

          <section aria-label="Estado del worker" className="rounded-2xl bg-surface-container-lowest p-5 text-sm shadow-sm">
            <p className="font-semibold text-on-surface">
              Última comprobación: {data.last_check_at ? formatRelative(data.last_check_at) : 'nunca'} · cada
              producto se comprueba cada {Math.round(data.check_interval_minutes / 60)} h · correo{' '}
              {data.email_enabled ? 'activado' : 'desactivado (las alertas no se envían)'}
            </p>
          </section>

          <section aria-labelledby="admin-cuentas" className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm">
            <div className="flex items-center gap-3 border-b border-outline-variant/10 px-5 py-4">
              <ShieldCheck size={16} className="text-primary" aria-hidden="true" />
              <h2 id="admin-cuentas" className="font-manrope text-sm font-bold text-on-surface">
                Cuentas ({data.users.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th scope="col" className="px-5 py-3">Email</th>
                    <th scope="col" className="px-3 py-3">Productos</th>
                    <th scope="col" className="px-3 py-3">Alta</th>
                    <th scope="col" className="px-3 py-3">Último acceso</th>
                    <th scope="col" className="px-5 py-3 text-right">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {data.users.map((row) => (
                    <tr key={row.id}>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-on-surface">{row.email}</span>
                          {row.is_admin && <Badge tone="primary">Admin</Badge>}
                          {!row.is_email_verified && <Badge tone="warning">Sin verificar</Badge>}
                          {!row.is_active && <Badge tone="muted">Desactivada</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-on-surface-variant">{row.products}</td>
                      <td className="px-3 py-3 text-on-surface-variant">{formatDate(row.created_at)}</td>
                      <td className="px-3 py-3 text-on-surface-variant">
                        {row.last_login_at ? formatRelative(row.last_login_at) : 'Nunca'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {row.id !== user?.id && (
                          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setPendingDelete(row)}>
                            Borrar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="¿Borrar esta cuenta?"
        description={
          pendingDelete && (
            <>
              Se borrarán <strong>{pendingDelete.email}</strong> y sus{' '}
              {plural(pendingDelete.products, 'producto', 'productos')}, con su historial y sus alertas. No se puede
              deshacer.
            </>
          )
        }
        confirmLabel="Borrar cuenta"
        destructive
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
