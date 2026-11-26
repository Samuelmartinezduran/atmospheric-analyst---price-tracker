import {useEffect, useState} from 'react';
import {verifyEmail} from '../api/auth';
import {getErrorMessage} from '../api/client';
import {Notice} from '../components/forms';
import {Spinner} from '../components/ui';

// Un token solo se envía una vez aunque la isla se monte dos veces.
const started = new Map<string, Promise<string>>();

function verifyOnce(token: string): Promise<string> {
  let promise = started.get(token);
  if (!promise) {
    promise = verifyEmail(token).then((response) => response.message);
    started.set(token, promise);
  }
  return promise;
}

type State = {kind: 'missing'} | {kind: 'working'} | {kind: 'ok'; message: string} | {kind: 'error'; message: string};

export default function VerifyCard() {
  const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
  const [state, setState] = useState<State>(token ? {kind: 'working'} : {kind: 'missing'});

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyOnce(token)
      .then((message) => !cancelled && setState({kind: 'ok', message}))
      .catch((error: unknown) => !cancelled && setState({kind: 'error', message: getErrorMessage(error)}));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === 'working') {
    return (
      <div className="panel" role="status">
        <h1>Verificando tu email…</h1>
        <p className="lede" style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 0}}>
          <Spinner /> Un momento.
        </p>
      </div>
    );
  }

  if (state.kind === 'ok') {
    return (
      <div className="panel">
        <h1>Email verificado</h1>
        <p className="lede">{state.message} Ya puedes entrar.</p>
        <a className="btn block" href="/entrar">
          Entrar
        </a>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>No se ha podido verificar</h1>
      <div className="form" style={{marginTop: 16}}>
        <Notice tone="err">
          {state.kind === 'missing' ? 'Al enlace le falta el código de verificación. Ábrelo de nuevo desde el email.' : state.message}
        </Notice>
        <p className="muted">
          Si el enlace ha caducado, entra con tu email y contraseña y pide otro con «Reenviar email de verificación».
        </p>
        <a className="btn sec block" href="/entrar">
          Ir a entrar
        </a>
      </div>
    </div>
  );
}
