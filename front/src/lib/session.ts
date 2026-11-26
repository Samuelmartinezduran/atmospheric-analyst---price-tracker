/**
 * Sesión en el navegador.
 *
 * - Las páginas privadas llaman a `useSession()`: pinta al instante con el usuario en caché
 *   (stale-while-revalidate) y comprueba `/api/auth/me` por detrás. El cliente de la API
 *   renueva la sesión una sola vez en un 401; si tampoco así, se va a `/entrar?next=…`.
 * - Las páginas de cuenta usan `probeSession()`, que nunca redirige.
 */
import {useEffect} from 'react';
import * as authApi from '../api/auth';
import {isApiError, refreshSession, request, setSessionExpiredHandler} from '../api/client';
import type {User} from '../api/types';
import {clearCache, mutate, useResource} from './cache';
import {getLegacyRedirect} from './legacyRedirect';
import {navigate, replaceLocation} from './nav';

export const ME_KEY = 'me';

/** Cuántas páginas privadas montadas hay (0 en las de cuenta y en la 404). */
let privateMounts = 0;

/** Ruta a la que volver tras entrar: solo rutas de esta web, nunca otra de cuenta. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, '');
  if (['/entrar', '/registro', '/recuperar', '/restablecer', '/verificar'].includes(path)) return '/';
  return raw;
}

export function loginUrl(from: string): string {
  const next = safeNext(from);
  return next === '/' ? '/entrar' : `/entrar?next=${encodeURIComponent(next)}`;
}

export function redirectToLogin(): void {
  replaceLocation(loginUrl(window.location.pathname + window.location.search));
}

// Si la renovación falla en mitad de una página privada, se vuelve a entrar.
setSessionExpiredHandler(() => {
  if (privateMounts > 0) redirectToLogin();
});

export interface SessionState {
  user: User | undefined;
  /** Error que no es «no hay sesión» (servidor caído…). */
  error: unknown;
  retry: () => void;
}

export function useSession(): SessionState {
  const legacy = typeof window !== 'undefined' ? getLegacyRedirect(window.location.search) : null;
  const me = useResource<User>(ME_KEY, () => authApi.getMe(), {freshFor: 15_000, enabled: !legacy});

  useEffect(() => {
    if (legacy) replaceLocation(legacy);
  }, [legacy]);

  useEffect(() => {
    privateMounts += 1;
    return () => {
      privateMounts -= 1;
    };
  }, []);

  const unauthorized = isApiError(me.error, 401);
  useEffect(() => {
    if (unauthorized) redirectToLogin();
  }, [unauthorized]);

  return {
    user: unauthorized ? undefined : me.data,
    error: unauthorized ? undefined : me.error,
    retry: () => void me.reload(),
  };
}

/**
 * ¿Hay sesión? Para las páginas de cuenta: no llama al aviso de sesión caducada ni redirige.
 * Si la cookie de acceso caducó pero la de renovación sirve, renueva una vez.
 */
export async function probeSession(): Promise<User | null> {
  const attempt = async () => {
    try {
      return (await request<User>('/api/auth/me', {auth: false})).data;
    } catch (error) {
      if (isApiError(error, 401)) return null;
      throw error;
    }
  };
  const first = await attempt();
  if (first) return first;
  return (await refreshSession()) ? attempt() : null;
}

/** Guarda el usuario recién entrado para que la página privada pinte sin esperar. */
export function rememberUser(user: User): void {
  mutate<User>(ME_KEY, user);
}

export async function signOut(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    // Aunque el servidor no responda, se cierra la sesión en este navegador.
  }
  clearCache();
  await navigate('/entrar', {replace: true});
}
