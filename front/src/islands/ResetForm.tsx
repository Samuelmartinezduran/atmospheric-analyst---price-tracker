import {useState, type SubmitEvent} from 'react';
import {resetPassword} from '../api/auth';
import {getErrorMessage} from '../api/client';
import {Field, MIN_PASSWORD, Notice} from '../components/forms';
import {Spinner} from '../components/ui';

export default function ResetForm() {
  const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const mismatch = repeat.length > 0 && repeat !== password;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD || password !== repeat) return;
    setBusy(true);
    setError(null);
    try {
      const response = await resetPassword(token, password);
      setDone(response.message);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="panel">
        <h1>Elige una contraseña nueva</h1>
        <div className="form" style={{marginTop: 16}}>
          <Notice tone="err">Al enlace le falta el código. Pide otro desde «Recuperar la contraseña».</Notice>
          <a className="btn sec block" href="/recuperar">
            Pedir otro enlace
          </a>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="panel">
        <h1>Contraseña cambiada</h1>
        <p className="lede">{done}</p>
        <a className="btn block" href="/entrar">
          Entrar
        </a>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>Elige una contraseña nueva</h1>
      <p className="lede">Se cerrarán las sesiones abiertas en otros dispositivos.</p>
      <form className="form" onSubmit={submit}>
        {error && (
          <Notice tone="err">
            <p>{error}</p>
            <p>
              <a className="text-link" href="/recuperar">
                Pedir otro enlace
              </a>
            </p>
          </Notice>
        )}
        <Field
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={`Al menos ${MIN_PASSWORD} caracteres.`}
          error={tooShort ? `Le faltan ${MIN_PASSWORD - password.length} caracteres.` : null}
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
          Guardar contraseña
        </button>
      </form>
    </div>
  );
}
