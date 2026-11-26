import {useEffect, useState, type SubmitEvent} from 'react';
import {login, resendVerification} from '../api/auth';
import {getErrorMessage, isApiError} from '../api/client';
import {DebugToken, Field, Notice} from '../components/forms';
import {Spinner} from '../components/ui';
import {navigate} from '../lib/nav';
import {probeSession, rememberUser, safeNext} from '../lib/session';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resend, setResend] = useState<{busy: boolean; message?: string; error?: string; token?: string | null}>({busy: false});
  const next = safeNext(new URLSearchParams(window.location.search).get('next'));

  // Con la sesión ya abierta, esta página no pinta nada: se vuelve a donde se quería ir.
  useEffect(() => {
    let cancelled = false;
    probeSession()
      .then((user) => {
        if (user && !cancelled) {
          rememberUser(user);
          void navigate(next, {replace: true});
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [next]);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setUnverified(false);
    setResend({busy: false});
    try {
      const {user} = await login(email.trim(), password);
      rememberUser(user);
      await navigate(next, {replace: true});
    } catch (err) {
      if (isApiError(err, 403)) setUnverified(true);
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  const resendEmail = async () => {
    setResend({busy: true});
    try {
      const response = await resendVerification(email.trim());
      setResend({busy: false, message: response.message, token: response.debug_token});
    } catch (err) {
      setResend({busy: false, error: getErrorMessage(err)});
    }
  };

  return (
    <div className="panel">
      <h1>Iniciar sesión</h1>
      <p className="lede">Entra para ver tus productos y sus precios.</p>
      <form className="form" onSubmit={submit} noValidate={false}>
        {error && (
          <Notice tone="err">
            <p>{unverified ? 'Tu email está sin verificar. ' + error : error}</p>
            {unverified && (
              <div>
                <button type="button" className="btn sec sm" onClick={resendEmail} disabled={resend.busy} aria-busy={resend.busy}>
                  {resend.busy && <Spinner />}
                  Reenviar email de verificación
                </button>
              </div>
            )}
          </Notice>
        )}
        {resend.message && <Notice tone="ok">{resend.message}</Notice>}
        {resend.error && <Notice tone="err">{resend.error}</Notice>}
        {resend.token && (
          <DebugToken token={resend.token} href={`/verificar?token=${encodeURIComponent(resend.token)}`} label="Verificar ahora" />
        )}
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          labelAside={<a href="/recuperar">¿La has olvidado?</a>}
        />
        <button type="submit" className="btn block" disabled={busy} aria-busy={busy}>
          {busy && <Spinner />}
          Entrar
        </button>
      </form>
    </div>
  );
}
