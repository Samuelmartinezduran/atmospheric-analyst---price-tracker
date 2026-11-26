import {useState, type FormEvent} from 'react';
import {Link, useNavigate} from 'react-router';
import {UserPlus} from 'lucide-react';
import {register} from '../api/auth';
import {getErrorMessage} from '../api/client';
import {Button, Message, PasswordField, TextField} from '../components/ui';
import {AuthLayout, linkClasses} from '../layouts/AuthLayout';
import type {VerifyState} from './VerifyPage';

export const MIN_PASSWORD_LENGTH = 12;

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password || !confirm) {
      setError('Rellena todos los campos para crear la cuenta.');
      return;
    }
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
      const response = await register(email.trim(), password);
      navigate('/verificar', {
        state: {
          email: email.trim(),
          message: response.message,
          debugToken: response.debug_token ?? null,
        } satisfies VerifyState,
      });
    } catch (err) {
      setError(getErrorMessage(err, 'No se ha podido crear la cuenta.'));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Crear cuenta"
      description="Te enviaremos un email para confirmar la dirección antes de entrar."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className={linkClasses}>
            Iniciar sesión
          </Link>
        </>
      }
    >
      {error && (
        <Message kind="error" className="mb-5">
          {error}
        </Message>
      )}
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
          name="new-password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres. Una frase larga es más fácil de recordar.`}
          error={passwordTooShort ? `Faltan ${MIN_PASSWORD_LENGTH - password.length} caracteres.` : null}
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
        <Button type="submit" size="lg" icon={UserPlus} loading={loading} className="w-full">
          {loading ? 'Creando la cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthLayout>
  );
}
