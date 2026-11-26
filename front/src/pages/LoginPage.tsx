import {useState, type FormEvent} from 'react';
import {Link, useLocation} from 'react-router';
import {LogIn, MailCheck} from 'lucide-react';
import {resendVerification} from '../api/auth';
import {getErrorMessage, isApiError} from '../api/client';
import {useAuth} from '../auth/AuthContext';
import type {FromState} from '../auth/guards';
import {Button, DevTokenNotice, Message, PasswordField, TextField} from '../components/ui';
import {AuthLayout, linkClasses} from '../layouts/AuthLayout';

export interface LoginState extends FromState {
  email?: string;
  notice?: string;
}

export function LoginPage() {
  const {signIn, bootError} = useAuth();
  const location = useLocation();
  const state = (location.state as LoginState | null) ?? {};

  const [email, setEmail] = useState(state.email ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<{message: string; debugToken?: string | null} | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Escribe tu email y tu contraseña.');
      return;
    }
    setLoading(true);
    setError(null);
    setUnverified(false);
    setResendResult(null);
    try {
      // Al cambiar la sesión, PublicOnly nos lleva a la página que se quería abrir.
      await signIn(email.trim(), password);
    } catch (err) {
      setPassword('');
      setError(getErrorMessage(err, 'No se ha podido iniciar sesión.'));
      setUnverified(isApiError(err, 403));
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const response = await resendVerification(email.trim());
      setResendResult({message: response.message, debugToken: response.debug_token});
    } catch (err) {
      setResendResult({message: getErrorMessage(err, 'No se ha podido reenviar el email.')});
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Iniciar sesión"
      description="Entra para ver tus productos y alertas."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link to="/registro" className={linkClasses}>
            Crear cuenta
          </Link>
        </>
      }
    >
      <div className="mb-5 space-y-3 empty:hidden">
        {state.notice && !error && <Message kind="success">{state.notice}</Message>}
        {bootError && !error && !state.notice && <Message kind="info">{bootError}</Message>}
        {error && (
          <Message kind="error">
            <p>{error}</p>
            {unverified && (
              <Button variant="secondary" size="sm" icon={MailCheck} loading={resending} onClick={() => void handleResend()}>
                Reenviar email de verificación
              </Button>
            )}
          </Message>
        )}
        {resendResult && (
          <Message kind="info">
            <p>{resendResult.message}</p>
          </Message>
        )}
        {resendResult?.debugToken && (
          <DevTokenNotice token={resendResult.debugToken}>
            <Link to={`/verificar?token=${encodeURIComponent(resendResult.debugToken)}`} className={linkClasses}>
              Verificar ahora
            </Link>
          </DevTokenNotice>
        )}
      </div>

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
        />
        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex justify-end">
          <Link to="/recuperar" state={{email: email.trim() || undefined}} className={`text-sm ${linkClasses}`}>
            ¿Has olvidado la contraseña?
          </Link>
        </div>
        <Button type="submit" size="lg" icon={LogIn} loading={loading} className="w-full">
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  );
}
