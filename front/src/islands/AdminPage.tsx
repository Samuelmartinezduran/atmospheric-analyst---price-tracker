import {useEffect, useState} from 'react';
import {deleteUser, type AdminUserRow} from '../api/admin';
import type {User} from '../api/types';
import {PrivatePage} from '../components/PrivatePage';
import {SkeletonBody} from '../components/skeletons';
import {Dot, ErrorNotice, Topbar} from '../components/ui';
import {ConfirmDialog} from '../components/dialog';
import {invalidate} from '../lib/cache';
import {getAdminOverview, type AdminOverview} from '../api/admin';
import {useResource} from '../lib/cache';
import {KEYS} from '../lib/data';
import {formatDate, formatDateTime} from '../lib/format';
import {formatRelative} from '../lib/relativeTime';
import {navigate} from '../lib/nav';
import {toast} from '../lib/toast';

const useAdminOverview = () => useResource<AdminOverview>(KEYS.admin, () => getAdminOverview());

const crumb = <span>Todas las cuentas</span>;

function Admin({user}: {user: User}) {
  const overview = useAdminOverview();
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const data = overview.data;

  return (
    <>
      <Topbar crumb={crumb} title="Administración" />
      <div className="content">
        <div className="page-h">
          <div>
            <h1>Administración</h1>
            <p>
              {data
                ? `Worker ${data.check_interval_minutes % 60 === 0 ? `cada ${data.check_interval_minutes / 60} h` : `cada ${data.check_interval_minutes} min`} · última lectura ${data.last_check_at ? formatRelative(data.last_check_at) : 'nunca'} · correo ${data.email_enabled ? 'activado' : 'desactivado'}`
                : 'Cuentas, productos y alertas de toda la instalación.'}
            </p>
          </div>
        </div>
        {data ? (
          <>
            <dl className="stats">
              <div className="panel stat">
                <dt>Cuentas</dt>
                <dd>{data.totals.users}</dd>
                <small>{data.totals.verified_users} verificadas</small>
              </div>
              <div className="panel stat">
                <dt>Productos</dt>
                <dd>{data.totals.products}</dd>
                <small>{data.totals.active_products} activos</small>
              </div>
              <div className="panel stat">
                <dt>Lecturas en 24 h</dt>
                <dd>{data.totals.checks_24h}</dd>
                <small>{data.totals.failed_checks_24h} con error</small>
              </div>
              <div className="panel stat">
                <dt>Alertas</dt>
                <dd>{data.totals.alerts_sent + data.totals.alerts_pending + data.totals.alerts_failed}</dd>
                <small>
                  {data.totals.alerts_sent} enviadas · {data.totals.alerts_pending} pendientes · {data.totals.alerts_failed} fallidas
                </small>
              </div>
            </dl>
            <h2 className="h">Cuentas</h2>
            <div className="table-wrap">
              <table className="t">
                <caption className="sr-only">Cuentas registradas</caption>
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="r">
                      Productos
                    </th>
                    <th scope="col">Último acceso</th>
                    <th scope="col">Alta</th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((row) => {
                    const self = row.id === user.id;
                    return (
                      <tr key={row.id}>
                        <td className="name">
                          <span className="t1" title={row.email}>
                            {row.email}
                          </span>
                        </td>
                        <td className="nowrap">
                          <span className="status">
                            <Dot tone={!row.is_active ? 'err' : row.is_email_verified ? 'ok' : 'warn'} />
                            {!row.is_active ? 'Desactivada' : row.is_email_verified ? 'Verificada' : 'Sin verificar'}
                            {row.is_admin && <span className="badge">Admin</span>}
                            {self && <span className="badge">Tú</span>}
                          </span>
                        </td>
                        <td className="r mono">{row.products}</td>
                        <td className="nowrap" title={formatDateTime(row.last_login_at)}>
                          {row.last_login_at ? formatRelative(row.last_login_at) : 'nunca'}
                        </td>
                        <td className="nowrap muted">{formatDate(row.created_at)}</td>
                        <td className="r">
                          <button
                            type="button"
                            className="btn sec sm"
                            disabled={self}
                            title={self ? 'No puedes borrar tu propia cuenta' : undefined}
                            onClick={() => setTarget(row)}
                          >
                            Borrar<span className="sr-only"> la cuenta {row.email}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : overview.error ? (
          <ErrorNotice error={overview.error} onRetry={overview.reload} />
        ) : (
          <SkeletonBody variant="table" />
        )}
      </div>
      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title="¿Borrar esta cuenta?"
        description={
          target ? (
            <>
              Se borrarán <b>{target.email}</b> y, con ella, sus {target.products} productos, su historial, sus alertas y sus
              sesiones. No se puede deshacer.
            </>
          ) : null
        }
        confirmLabel="Borrar cuenta"
        danger
        onConfirm={async () => {
          if (!target) return;
          await deleteUser(target.id);
          toast.success(`Cuenta ${target.email} borrada.`);
          invalidate(KEYS.admin);
        }}
      />
    </>
  );
}

function AdminGate({user}: {user: User}) {
  const allowed = Boolean(user.is_admin);
  useEffect(() => {
    if (!allowed) void navigate('/', {replace: true});
  }, [allowed]);
  if (!allowed) return <Topbar crumb={crumb} title="Administración" />;
  return <Admin user={user} />;
}

export default function AdminPage() {
  return (
    <PrivatePage crumb={crumb} title="Administración" variant="table">
      {(user) => <AdminGate user={user} />}
    </PrivatePage>
  );
}
