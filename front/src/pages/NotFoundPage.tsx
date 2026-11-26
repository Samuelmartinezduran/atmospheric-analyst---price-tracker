import {Link} from 'react-router';
import {useAuth} from '../auth/AuthContext';
import {AuthLayout, linkClasses} from '../layouts/AuthLayout';

export function NotFoundPage() {
  const {status} = useAuth();
  return (
    <AuthLayout title="Esta página no existe" description="Puede que el enlace esté mal copiado o que la página haya cambiado de sitio.">
      <Link to={status === 'authenticated' ? '/' : '/entrar'} className={linkClasses}>
        {status === 'authenticated' ? 'Volver al panel' : 'Ir a iniciar sesión'}
      </Link>
    </AuthLayout>
  );
}
