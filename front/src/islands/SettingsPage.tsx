import {useState, type SubmitEvent} from 'react';
import {changePassword, revokeOtherSessions} from '../api/auth';
import {getErrorMessage} from '../api/client';
import type {User} from '../api/types';
import {Field, MIN_PASSWORD, Notice} from '../components/forms';
import {PrivatePage} from '../components/PrivatePage';
import {ErrorNotice, Spinner, Topbar} from '../components/ui';
import {ConfirmDialog} from '../components/dialog';
import {avatarGradient} from '../lib/avatar';
import {invalidate} from '../lib/cache';
import {listSessions} from '../api/auth';
import type {Session} from '../api/types';
import {useResource} from '../lib/cache';
import {KEYS} from '../lib/data';
import {formatDate, formatDateTime} from '../lib/format';
import {formatRelative} from '../lib/relativeTime';
import {getThemePreference, setThemePreference, type ThemePreference} from '../lib/theme';
import {toast} from '../lib/toast';
import {describeUserAgent} from '../lib/userAgent';

const useSessions = () => useResource<Session[]>(KEYS.sessions, () => listSessions());

const crumb = <span>Tu cuenta</span>;

const THEMES: {id: ThemePreference; label: string}[] = [
  {id: 'system', label: 'Sistema'},
  {id: 'light', label: 'Claro'},
  {id: 'dark', label: 'Oscuro'},
];

function ThemePanel() {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  return (
    <section className="panel" aria-labelledby="theme-h">
      <div className="panel-h">
        <h2 id="theme-h">Tema</h2>
      </div>
      <div className="panel-b">
        <p className="muted">«Sistema» sigue el modo claro u oscuro de tu dispositivo. Se guarda en este navegador.</p>
        <fieldset style={{border: 0, padding: 0, margin: 0}}>
          <legend className="sr-only">Tema de la interfaz</legend>
          <div className="seg">
            {THEMES.map((item) => (
              <label key={item.id}>
                <input
                  type="radio"
                  name="theme"
                  value={item.id}
                  checked={theme === item.id}
                  onChange={() => {
                    setTheme(item.id);
                    setThemePreference(item.id);
                  }}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

function PasswordPanel() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = repeat.length > 0 && repeat !== next;

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (next.length < MIN_PASSWORD || next !== repeat) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const response = await changePassword(current, next);
      setDone(response.message);
      setCurrent('');
      setNext('');
      setRepeat('');
      invalidate(KEYS.sessions);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="password-h">
      <div className="panel-h">
        <h2 id="password-h">Cambiar la contraseña</h2>
      </div>
      <form className="panel-b form" onSubmit={submit}>
        <p className="muted" style={{margin: 0}}>
          Al cambiarla se cierran las sesiones de los demás dispositivos; esta sigue abierta.
        </p>
        {error && <Notice tone="err">{error}</Notice>}
        {done && <Notice tone="ok">{done}</Notice>}
        <Field
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <div className="row-2">
          <Field
            label="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            hint={`Al menos ${MIN_PASSWORD} caracteres.`}
            error={tooShort ? `Le faltan ${MIN_PASSWORD - next.length} caracteres.` : null}
          />
          <Field
            label="Repite la nueva"
            type="password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            error={mismatch ? 'Las contraseñas no coinciden.' : null}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn" disabled={busy} aria-busy={busy}>
            {busy && <Spinner />}
            Cambiar contraseña
          </button>
        </div>
      </form>
    </section>
  );
}

function SessionsPanel() {
  const sessions = useSessions();
  const [confirm, setConfirm] = useState(false);
  const others = sessions.data?.filter((session) => !session.is_current).length ?? 0;

  return (
    <section className="panel" aria-labelledby="sessions-h">
      <div className="panel-h">
        <h2 id="sessions-h">Sesiones abiertas</h2>
        <button type="button" className="btn sec sm" onClick={() => setConfirm(true)} disabled={!others}>
          Cerrar las demás
        </button>
      </div>
      {sessions.data ? (
        <div className="table-wrap">
          <table className="t">
            <caption className="sr-only">Sesiones abiertas en tu cuenta</caption>
            <thead>
              <tr>
                <th scope="col">Dispositivo</th>
                <th scope="col">IP</th>
                <th scope="col">Abierta</th>
                <th scope="col">Caduca</th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.map((session) => (
                <tr key={session.id}>
                  <td className="nowrap">
                    <span className="status">
                      {describeUserAgent(session.user_agent)}
                      {session.is_current && <span className="badge">Esta sesión</span>}
                    </span>
                  </td>
                  <td className="mono muted nowrap">{session.ip_address ?? '—'}</td>
                  <td className="nowrap" title={formatDateTime(session.created_at)}>
                    {formatRelative(session.created_at)}
                  </td>
                  <td className="nowrap muted">{formatDate(session.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : sessions.error ? (
        <div className="panel-b">
          <ErrorNotice error={sessions.error} onRetry={sessions.reload} />
        </div>
      ) : (
        <div className="panel-b">
          <span className="sk line" />
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="¿Cerrar las demás sesiones?"
        description={`Se cerrará la sesión en ${others === 1 ? 'otro dispositivo' : `otros ${others} dispositivos`}. Esta sigue abierta.`}
        confirmLabel="Cerrar sesiones"
        onConfirm={async () => {
          const response = await revokeOtherSessions();
          toast.success(response.message);
          invalidate(KEYS.sessions);
        }}
      />
    </section>
  );
}

function Settings({user}: {user: User}) {
  return (
    <>
      <Topbar crumb={crumb} title="Ajustes" />
      <div className="content narrow">
        <div className="page-h">
          <div style={{display: 'flex', gap: 14, alignItems: 'center', minWidth: 0}}>
            <span className="avatar" aria-hidden="true" style={{width: 40, height: 40, background: avatarGradient(user.email)}} />
            <div style={{minWidth: 0}}>
              <h1>Ajustes</h1>
              <p style={{overflowWrap: 'anywhere'}}>
                {user.email} · cuenta creada el {formatDate(user.created_at)}
              </p>
            </div>
          </div>
        </div>
        <div className="settings">
          <ThemePanel />
          <PasswordPanel />
          <SessionsPanel />
        </div>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <PrivatePage crumb={crumb} title="Ajustes" variant="settings" narrow>
      {(user) => <Settings user={user} />}
    </PrivatePage>
  );
}
