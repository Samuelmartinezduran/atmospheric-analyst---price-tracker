import {useState, type SubmitEvent} from 'react';
import {forgotPassword} from '../api/auth';
import {getErrorMessage} from '../api/client';
import {DebugToken, Field, Notice} from '../components/forms';
import {Spinner} from '../components/ui';

export default function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{message: string; token?: string | null} | null>(null);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await forgotPassword(email.trim());
      setDone({message: response.message, token: response.debug_token});
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h1>Recuperar la contraseña</h1>
      <p className="lede">Te enviaremos un enlace para elegir una nueva.</p>
      {done ? (
        <div className="form">
          <Notice tone="ok">{done.message}</Notice>
          {done.token && (
            <DebugToken token={done.token} href={`/restablecer?token=${encodeURIComponent(done.token)}`} label="Elegir contraseña" />
          )}
          <a className="btn sec block" href="/entrar">
            Volver a entrar
          </a>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          {error && <Notice tone="err">{error}</Notice>}
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" className="btn block" disabled={busy} aria-busy={busy}>
            {busy && <Spinner />}
            Enviar enlace
          </button>
        </form>
      )}
    </div>
  );
}
