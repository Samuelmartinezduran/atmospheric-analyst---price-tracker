import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useLocation, useNavigate, useSearchParams} from 'react-router';
import {MailCheck, ShieldCheck} from 'lucide-react';
import {resendVerification, verifyEmail} from '../api/auth';
import {getErrorMessage} from '../api/client';
import {useAuth} from '../auth/AuthContext';
import {Button, DevTokenNotice, Message, Spinner, TextField} from '../components/ui';
import {AuthLayout, linkClasses} from '../layouts/AuthLayout';
import type {LoginState} from './LoginPage';

/** Lo que deja el registro al venir aquí. */
export interface VerifyState {
  email?: string;
  message?: string;
  debugToken?: string | null;
}

type Phase = 'idle' | 'verifying' | 'success' | 'error';

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get('token')?.trim() ?? '';
  const location = useLocation();
  const navigate = useNavigate();
  const {status} = useAuth();
  const state = (location.state as VerifyState | null) ?? {};

  const [phase, setPhase] = useState<Phase>(urlToken ? 'verifying' : 'idle');
  const [result, setResult] = useState<string | null>(null);
  const [token, setToken] = useState(state.debugToken ?? '');
  const [email, setEmail] = useState(state.email ?? '');
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<{message: string; debugToken?: string | null; failed?: boolean} | null>(
    null,
  );
  const attempted = useRef<string | null>(null);

  const runVerification = async (value: string) => {
    setPhase('verifying');
    setResult(null);
    try {
      const response = await verifyEmail(value);
      setPhase('success');
      setResult(response.message);
      // Quitamos el token de la URL: ya está usado y recargar daría error.
      if (urlToken) navigate('/verificar', {replace: true});
    } catch (err) {
      setPhase('error');
      setResult(getErrorMessage(err, 'No se ha podido verificar el email.'));
    }
  };

  // Si llega desde el enlace del email, se verifica sola al cargar (una vez por token).
  useEffect(() => {
    if (!urlToken || attempted.current === urlToken) return;
    attempted.current = urlToken;
    void runVerification(urlToken);
    // runVerification solo depende del token, que ya está en las dependencias.
  }, [urlToken]);

  const handleManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim()) {
      setPhase('error');
      setResult('Pega el código de verificación que te ha llegado por email.');
      return;
    }
    void runVerification(token.trim());
  };

  const handleResend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setResendResult({message: 'Escribe el email con el que te registraste.', failed: true});
      return;
    }
    setResending(true);
    try {
      const response = await resendVerification(email.trim());
      setResendResult({message: response.message, debugToken: response.debug_token});
      if (response.debug_token) setToken(response.debug_token);
    } catch (err) {
      setResendResult({message: getErrorMessage(err, 'No se ha podido reenviar el email.'), failed: true});
    } finally {
      setResending(false);
    }
  };

  if (phase === 'success') {
    return (
      <AuthLayout title="Email verificado">
        <Message kind="success" className="mb-6">
          {result ?? 'Tu email está verificado.'}
        </Message>
        {status === 'authenticated' ? (
          <Link to="/" className="flex h-12 items-center justify-center rounded-xl font-bold text-white primary-gradient">
            Ir al panel
          </Link>
        ) : (
          <Link
            to="/entrar"
            state={{email: email || undefined, notice: 'Email verificado. Ya puedes iniciar sesión.'} satisfies LoginState}
            className="flex h-12 items-center justify-center rounded-xl font-bold text-white primary-gradient"
          >
            Iniciar sesión
          </Link>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Verifica tu email"
      description="Abre el enlace que te hemos enviado o pega aquí el código que trae el email."
      footer={
        <Link to="/entrar" className={linkClasses}>
          Volver a iniciar sesión
        </Link>
      }
    >
      <div className="mb-5 space-y-3 empty:hidden">
        {state.message && phase === 'idle' && <Message kind="info">{state.message}</Message>}
        {phase === 'verifying' && <Spinner label="Verificando tu email…" className="py-2" />}
        {phase === 'error' && result && <Message kind="error">{result}</Message>}
        {state.debugToken && phase === 'idle' && (
          <DevTokenNotice token={state.debugToken}>
            <p className="text-xs text-on-surface-variant">Ya está puesto en el campo de abajo.</p>
          </DevTokenNotice>
        )}
      </div>

      <form className="space-y-4" onSubmit={handleManual} noValidate>
        <TextField
          label="Código de verificación"
          name="token"
          autoComplete="one-time-code"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Pega aquí el código"
        />
        <Button type="submit" size="lg" icon={ShieldCheck} loading={phase === 'verifying'} className="w-full">
          Verificar email
        </Button>
      </form>

      <form className="mt-8 space-y-4 border-t border-outline-variant/15 pt-6" onSubmit={(e) => void handleResend(e)} noValidate>
        <p className="text-sm font-semibold text-on-surface">¿No te ha llegado o ha caducado?</p>
        <TextField
          label="Email de la cuenta"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
        />
        {resendResult && <Message kind={resendResult.failed ? 'error' : 'info'}>{resendResult.message}</Message>}
        {resendResult?.debugToken && <DevTokenNotice token={resendResult.debugToken} />}
        <Button type="submit" variant="secondary" icon={MailCheck} loading={resending} className="w-full">
          Reenviar el email
        </Button>
      </form>
    </AuthLayout>
  );
}
