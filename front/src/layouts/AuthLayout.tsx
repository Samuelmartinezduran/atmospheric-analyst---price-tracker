import type {ReactNode} from 'react';
import {Brand} from '../components/Brand';

interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Marco común de entrar, registro, verificar, recuperar y restablecer. */
export function AuthLayout({title, description, children, footer}: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 py-10">
      <main className="w-full max-w-md">
        <div className="rounded-3xl border border-outline-variant/15 bg-surface-container-lowest p-6 shadow-sm sm:p-8">
          <Brand className="mb-8" />
          <h1 className="mb-2 font-manrope text-2xl font-extrabold text-on-surface">{title}</h1>
          {description && <div className="mb-6 text-sm font-medium text-on-surface-variant">{description}</div>}
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-sm font-medium text-on-surface-variant">{footer}</div>}
      </main>
    </div>
  );
}

export const linkClasses = 'font-bold text-primary underline-offset-4 hover:underline';
