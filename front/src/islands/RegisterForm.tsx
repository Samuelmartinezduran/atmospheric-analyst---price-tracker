import {useState, type SubmitEvent} from 'react';
import {register} from '../api/auth';
import {getErrorMessage} from '../api/client';
import {DebugToken, Field, MIN_PASSWORD, Notice} from '../components/forms';
import {Spinner} from '../components/ui';

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{message: string; token?: string | null} | null>(null);
  const [touched, setTouched] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = repeat.length > 0 && repeat !== password;

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setTouched(true);
    if (password.length < MIN_PASSWORD || password !== repeat) return;
    setBusy(true);
    setError(null);
    try {
      const response = await register(email.trim(), password);
      setDone({message: response.message, token: response.debug_token});
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="panel">
        <h1>Revisa tu correo</h1>
        <p className="lede">{done.message}</p>
        <div className="form">
          {done.token && (
            <DebugToken token={done.token} href={`/verificar?token=${encodeURIComponent(done.token)}`} label="Verificar ahora" />
          )}
          <a className="btn sec block" href="/entrar">
            Volver a entrar
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>Crear una cuenta</h1>
      <p className="lede">Te enviaremos un email para verificar la dirección.</p>
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
        <Field
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={`Al menos ${MIN_PASSWORD} caracteres.`}
          error={(touched || tooShort) && password.length < MIN_PASSWORD && password.length > 0 ? `Le faltan ${MIN_PASSWORD - password.length} caracteres.` : null}
        />
        <Field
          label="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          error={mismatch ? 'Las contraseñas no coinciden.' : null}
        />
        <button type="submit" className="btn block" disabled={busy} aria-busy={busy}>
          {busy && <Spinner />}
          Crear cuenta
        </button>
      </form>
    </div>
  );
}
