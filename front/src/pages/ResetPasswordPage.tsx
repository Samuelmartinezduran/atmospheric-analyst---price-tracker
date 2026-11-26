import {useState, type FormEvent} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router';
import {KeyRound} from 'lucide-react';
import {resetPassword} from '../api/auth';
import {getErrorMessage, isApiError} from '../api/client';
import {useAuth} from '../auth/AuthContext';
import {Button, Message, PasswordField} from '../components/ui';
import {AuthLayout, linkClasses} from '../layouts/AuthLayout';
import type {LoginState} from './LoginPage';
import {MIN_PASSWORD_LENGTH} from './RegisterPage';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const navigate = useNavigate();
  const {status, signOut} = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenRejected, setTokenRejected] = useState(false);

  const footer = (
    <Link to="/entrar" className={linkClasses}>
      Volver a iniciar sesión
    </Link>
  );

  if (!token) {
    return (
      <AuthLayout title="Enlace incompleto" footer={footer}>
        <Message kind="error" className="mb-6">
          Este enlace no trae el código para cambiar la contraseña. Ábrelo tal cual desde el email o pide uno nuevo.
        </Message>
        <Link to="/recuperar" className="flex h-12 items-center justify-center rounded-xl font-bold text-white primary-gradient">
          Pedir un enlace nuevo
        </Link>
      </AuthLayout>
    );
  }

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      // Si había una sesión abierta en este navegador, la cerramos: lo normal es volver a entrar.
      if (status === 'authenticated') await signOut();
      navigate('/entrar', {
        replace: true,
        state: {notice: 'Contraseña cambiada. Ya puedes iniciar sesión con la nueva.'} satisfies LoginState,
      });
    } catch (err) {
      setError(getErrorMessage(err, 'No se ha podido cambiar la contraseña.'));
      setTokenRejected(isApiError(err, 400));
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Elige una contraseña nueva" description="Después podrás entrar con ella." footer={footer}>
      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
        {error && (
          <Message kind="error">
            <p>{error}</p>
            {tokenRejected && (
              <p>
                <Link to="/recuperar" className={linkClasses}>
                  Pedir un enlace nuevo
                </Link>
              </p>
            )}
          </Message>
        )}
        <PasswordField
          label="Contraseña nueva"
          name="new-password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres.`}
          error={tooShort ? `Faltan ${MIN_PASSWORD_LENGTH - password.length} caracteres.` : null}
        />
        <PasswordField
          label="Repite la contraseña"
          name="confirm-password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'No coincide con la contraseña.' : null}
        />
        <Button type="submit" size="lg" icon={KeyRound} loading={loading} className="w-full">
          Guardar la contraseña
        </Button>
      </form>
    </AuthLayout>
  );
}
