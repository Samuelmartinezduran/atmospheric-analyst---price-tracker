import type {ReactNode} from 'react';
import type {User} from '../api/types';
import {useSession} from '../lib/session';
import {PageSkeleton, type SkeletonVariant} from './skeletons';
import {ErrorNotice, Topbar} from './ui';

interface Props {
  crumb: ReactNode;
  title: string;
  variant: SkeletonVariant;
  narrow?: boolean;
  children: (user: User) => ReactNode;
}

/**
 * Guarda de las páginas privadas: mientras se comprueba la sesión enseña el esqueleto (el mismo
 * que el HTML estático); sin sesión, `useSession` lleva a /entrar?next=…
 */
export function PrivatePage({crumb, title, variant, narrow, children}: Props) {
  const {user, error, retry} = useSession();
  if (user) return <>{children(user)}</>;
  if (error) {
    return (
      <>
        <Topbar crumb={crumb} title={title} />
        <div className={`content${narrow ? ' narrow' : ''}`}>
          <ErrorNotice error={error} onRetry={retry} fallback="No se ha podido comprobar la sesión." />
        </div>
      </>
    );
  }
  return <PageSkeleton crumb={crumb} title={title} variant={variant} narrow={narrow} />;
}
