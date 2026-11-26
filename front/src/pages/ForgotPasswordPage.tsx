import {useState, type FormEvent} from 'react';
import {Link, useLocation} from 'react-router';
import {Send} from 'lucide-react';
import {forgotPassword} from '../api/auth';
import {getErrorMessage} from '../api/client';
import {Button, DevTokenNotice, Message, TextField} from '../components/ui';
import {AuthLayout, linkClasses} from '../layouts/AuthLayout';

export function ForgotPasswordPage() {
  const location = useLocation();
  const initialEmail = (location.state as {email?: string} | null)?.email ?? '';
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{message: string; debugToken?: string | null} | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setError('Escribe el email de tu cuenta.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await forgotPassword(email.trim());
      setSent({message: response.message, debugToken: response.debug_token});
    } catch (err) {
      setError(getErrorMessage(err, 'No se ha podido enviar el email.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Recuperar la contraseña"
      description="Te enviaremos un enlace para elegir una contraseña nueva."
      footer={
        <Link to="/entrar" className={linkClasses}>
          Volver a iniciar sesión
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Message kind="success">{sent.message}</Message>
          <p className="text-sm text-on-surface-variant">
            Si no lo ves en unos minutos, mira en la carpeta de correo no deseado. El enlace caduca pasado un tiempo.
          </p>
          {sent.debugToken && (
            <DevTokenNotice token={sent.debugToken}>
              <Link to={`/restablecer?token=${encodeURIComponent(sent.debugToken)}`} className={linkClasses}>
                Elegir la contraseña nueva
              </Link>
            </DevTokenNotice>
          )}
          <Button variant="secondary" className="w-full" onClick={() => setSent(null)}>
            Enviar a otro email
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
          {error && <Message kind="error">{error}</Message>}
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
          <Button type="submit" size="lg" icon={Send} loading={loading} className="w-full">
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
