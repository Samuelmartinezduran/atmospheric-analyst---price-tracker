import {useCallback, useEffect, useState, type ElementType, type FormEvent, type ReactNode} from 'react';
import {Laptop, Lock, LogOut, Moon, ShieldCheck, Sun, User} from 'lucide-react';
import {changePassword, listSessions, revokeOtherSessions} from '../api/auth';
import {getErrorMessage, isAbortError, isApiError} from '../api/client';
import type {Session} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {ConfirmDialog} from '../components/Modal';
import {useToast} from '../components/Toasts';
import {Button, Message, PageHeader, PasswordField, Spinner} from '../components/ui';
import {formatDate, formatDateTime, formatRelative, plural} from '../lib/format';
import {useTheme} from '../lib/theme';
import {describeUserAgent} from '../lib/userAgent';
import {cn} from '../lib/utils';
import {MIN_PASSWORD_LENGTH} from './RegisterPage';

function SectionCard({title, icon: Icon, children, id}: {title: string; icon: ElementType; children: ReactNode; id: string}) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm">
      <div className="flex items-center gap-3 border-b border-outline-variant/10 px-5 py-4 sm:px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon size={16} className="text-primary" aria-hidden="true" />
        </div>
        <h2 id={id} className="font-manrope text-sm font-bold text-on-surface">
          {title}
        </h2>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function AppearanceSection() {
  const {darkMode, setDarkMode} = useTheme();
  return (
    <SectionCard title="Apariencia" icon={darkMode ? Moon : Sun} id="ajustes-apariencia">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p id="modo-oscuro" className="text-sm font-bold text-on-surface">
            Modo oscuro
          </p>
          <p className="mt-0.5 text-xs text-on-surface-variant">Se recuerda en este navegador.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={darkMode}
          aria-labelledby="modo-oscuro"
          onClick={() => setDarkMode(!darkMode)}
          className={cn(
            'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
            darkMode ? 'bg-primary' : 'bg-outline-variant',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow transition-transform duration-200',
              darkMode ? 'translate-x-5' : 'translate-x-0',
            )}
          >
            {darkMode ? (
              <Moon size={12} className="text-[#1f6feb]" aria-hidden="true" />
            ) : (
              <Sun size={12} className="text-[#596064]" aria-hidden="true" />
            )}
          </span>
        </button>
      </div>
    </SectionCard>
  );
}

function PasswordSection({email}: {email: string}) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!current || !next || !confirm) {
      setError('Rellena los tres campos.');
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña nueva debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (next !== confirm) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    if (next === current) {
      setError('La contraseña nueva tiene que ser distinta de la actual.');
      return;
    }
    setSaving(true);
    try {
      const response = await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success(response.message || 'Contraseña cambiada.');
    } catch (err) {
      if (!isApiError(err, 401)) setError(getErrorMessage(err, 'No se ha podido cambiar la contraseña.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Cambiar la contraseña" icon={Lock} id="ajustes-contrasena">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        {/* Para que el gestor de contraseñas sepa de qué cuenta es. */}
        <input type="email" name="username" autoComplete="username" hidden readOnly value={email} />
        <PasswordField
          label="Contraseña actual"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <PasswordField
          label="Contraseña nueva"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres.`}
          error={tooShort ? `Faltan ${MIN_PASSWORD_LENGTH - next.length} caracteres.` : null}
        />
        <PasswordField
          label="Repite la contraseña nueva"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'No coincide con la contraseña nueva.' : null}
        />
        {error && <Message kind="error">{error}</Message>}
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Guardar la contraseña
        </Button>
      </form>
    </SectionCard>
  );
}

function isActive(session: Session, now = Date.now()): boolean {
  return !session.revoked_at && new Date(session.expires_at).getTime() > now;
}

function SessionsSection() {
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await listSessions(signal);
      setSessions(data);
      setError(null);
    } catch (err) {
      if (isAbortError(err) || isApiError(err, 401)) return;
      setSessions([]);
      setError(getErrorMessage(err, 'No se han podido cargar las sesiones.'));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const active = (sessions ?? []).filter((s) => isActive(s)).sort((a, b) => Number(b.is_current) - Number(a.is_current));
  const others = active.filter((s) => !s.is_current).length;

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      const response = await revokeOtherSessions();
      toast.success(
        response.revoked_count > 0
          ? `${plural(response.revoked_count, 'sesión cerrada', 'sesiones cerradas')}.`
          : 'No había otras sesiones abiertas.',
      );
      setConfirmOpen(false);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'No se han podido cerrar las sesiones.'));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <SectionCard title="Sesiones abiertas" icon={ShieldCheck} id="ajustes-sesiones">
      {sessions === null ? (
        <Spinner label="Cargando sesiones…" />
      ) : (
        <div className="space-y-4">
          {error && <Message kind="error">{error}</Message>}
          {active.length > 0 && (
            <ul className="divide-y divide-outline-variant/15">
              {active.map((session) => (
                <li key={session.id} className="flex items-start gap-3 py-3 first:pt-0">
                  <Laptop size={18} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-on-surface">
                      {describeUserAgent(session.user_agent)}
                      {session.is_current && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                          Esta sesión
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      {session.ip_address ? `IP ${session.ip_address} · ` : ''}
                      Iniciada <span title={formatDateTime(session.created_at)}>{formatRelative(session.created_at)}</span>
                      {' · '}caduca el {formatDate(session.expires_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-on-surface-variant">
            {others > 0
              ? `Tienes ${plural(others, 'sesión abierta', 'sesiones abiertas')} en otros dispositivos o navegadores.`
              : 'No hay sesiones abiertas en otros dispositivos.'}
          </p>
          <Button variant="secondary" icon={LogOut} disabled={others === 0} onClick={() => setConfirmOpen(true)} className="text-error">
            Cerrar las demás sesiones
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="¿Cerrar las demás sesiones?"
        description="Se cerrará la sesión en todos los demás dispositivos y navegadores. Esta seguirá abierta."
        confirmLabel="Cerrar sesiones"
        destructive
        busy={revoking}
        onConfirm={() => void handleRevoke()}
        onCancel={() => setConfirmOpen(false)}
      />
    </SectionCard>
  );
}

export function SettingsPage() {
  const {user} = useAuth();
  return (
    <>
      <PageHeader title="Ajustes" description="Tu cuenta, la seguridad y la apariencia." />
      <div className="max-w-2xl space-y-6">
        <SectionCard title="Cuenta" icon={User} id="ajustes-cuenta">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="mb-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Email</dt>
              <dd className="text-sm font-semibold break-all text-on-surface">{user?.email}</dd>
            </div>
            <div>
              <dt className="mb-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Cuenta creada</dt>
              <dd className="text-sm font-semibold text-on-surface">{formatDate(user?.created_at)}</dd>
            </div>
          </dl>
        </SectionCard>
        <AppearanceSection />
        <PasswordSection email={user?.email ?? ''} />
        <SessionsSection />
      </div>
    </>
  );
}
