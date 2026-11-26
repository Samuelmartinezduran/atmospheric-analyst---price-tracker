import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import * as authApi from '../api/auth';
import {getErrorMessage, isApiError, setSessionExpiredHandler, SESSION_EXPIRED_MESSAGE} from '../api/client';
import type {User} from '../api/types';
import {useToast} from '../components/Toasts';

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  /** Error al comprobar la sesión al arrancar que no sea un simple «no hay sesión». */
  bootError: string | null;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({children}: {children: ReactNode}) {
  const toast = useToast();
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<User | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const statusRef = useRef<AuthStatus>('checking');

  const update = useCallback((nextStatus: AuthStatus, nextUser: User | null) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    setUser(nextUser);
  }, []);

  // Comprobación inicial: sin sesión no se pide nada más ni se enseña ningún aviso.
  useEffect(() => {
    const controller = new AbortController();
    authApi
      .getMe(controller.signal)
      .then((me) => update('authenticated', me))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (!isApiError(error, 401)) setBootError(getErrorMessage(error));
        update('unauthenticated', null);
      });
    return () => controller.abort();
  }, [update]);

  // Si la renovación falla con la sesión abierta, volvemos al login avisando una vez.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (statusRef.current !== 'authenticated') return;
      update('unauthenticated', null);
      toast.info(SESSION_EXPIRED_MESSAGE);
    });
    return () => setSessionExpiredHandler(null);
  }, [toast, update]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const {user: loggedUser} = await authApi.login(email, password);
      setBootError(null);
      update('authenticated', loggedUser);
      return loggedUser;
    },
    [update],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Aunque el servidor no responda, cerramos la sesión en este navegador.
    }
    update('unauthenticated', null);
  }, [update]);

  const value = useMemo<AuthValue>(
    () => ({status, user, bootError, signIn, signOut}),
    [status, user, bootError, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
