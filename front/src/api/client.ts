/**
 * Cliente HTTP de la API (docs/API.md).
 *
 * - Mismo origen: rutas relativas `/api/...` y cookies `httpOnly` (credentials: 'include').
 * - CSRF: en POST/PATCH/PUT/DELETE envía `X-CSRF-Token` con el valor de la cookie `csrf_token`.
 * - Si una petición devuelve 401, se renueva la sesión con `POST /api/auth/refresh`
 *   (una sola renovación aunque haya varias peticiones a la vez) y se repite una vez.
 * - Los errores salen como `ApiError` con un mensaje en español listo para mostrar.
 */

export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';
const REFRESH_PATH = '/api/auth/refresh';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const VALIDATION_MESSAGE =
  'Hay datos con un formato no válido. Revísalos e inténtalo de nuevo.';
export const NETWORK_MESSAGE =
  'No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';
export const SESSION_EXPIRED_MESSAGE = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

export class ApiError extends Error {
  /** Código HTTP; 0 si no hubo respuesta (red caída, servidor apagado). */
  readonly status: number;
  /** Campo `detail` tal y como llegó (texto, lista de errores de validación o nada). */
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }

  get isValidation(): boolean {
    return this.status === 422;
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Mensaje legible para cualquier error, pensado para toasts y formularios. */
export function getErrorMessage(error: unknown, fallback = 'Ha ocurrido un error inesperado.'): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  for (const part of document.cookie.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return rest.join('=');
      }
    }
  }
  return null;
}

function messageFor(status: number, body: unknown): string {
  const detail = body && typeof body === 'object' && 'detail' in body ? (body as {detail: unknown}).detail : undefined;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (status === 422 || Array.isArray(detail)) return VALIDATION_MESSAGE;
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return 'No tienes permiso para hacer esto.';
  if (status === 404) return 'No se ha encontrado lo que buscabas.';
  if (status === 409) return 'La operación choca con otra que está en curso. Inténtalo en unos segundos.';
  if (status === 429) return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  if (status >= 500) return 'El servidor ha tenido un problema. Inténtalo de nuevo dentro de un rato.';
  return `La petición ha fallado (código ${status}).`;
}

// --- Sesión caducada -------------------------------------------------------

type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

/** El contexto de sesión se registra aquí para enterarse cuando la renovación falla. */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler;
}

// --- Renovación única ------------------------------------------------------

let refreshInFlight: Promise<boolean> | null = null;

function buildHeaders(method: string, hasBody: boolean, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Accept', 'application/json');
  if (hasBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (UNSAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE_NAME);
    if (csrf) headers.set(CSRF_HEADER_NAME, csrf);
  }
  return headers;
}

/**
 * Renueva la sesión. Si ya hay una renovación en marcha, devuelve la misma promesa:
 * diez peticiones que reciben 401 a la vez provocan una sola llamada a /refresh.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(REFRESH_PATH, {
          method: 'POST',
          credentials: 'include',
          headers: buildHeaders('POST', false),
        });
        return response.ok;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

// --- Peticiones ------------------------------------------------------------

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Se serializa como JSON. */
  body?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
  /**
   * `false` para las rutas públicas de autenticación (login, registro, etc.): un 401
   * ahí significa «credenciales inválidas», no «sesión caducada», y no se renueva nada.
   */
  auth?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const method = options.method ?? 'GET';
  const hasBody = options.body !== undefined;
  try {
    return await fetch(path, {
      method,
      credentials: 'include',
      headers: buildHeaders(method, hasBody, options.headers),
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, NETWORK_MESSAGE);
  }
}

/** Petición completa: devuelve los datos y el código HTTP (útil para distinguir 200 de 201). */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const useAuth = options.auth !== false;
  let response = await send(path, options);

  if (response.status === 401 && useAuth) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await send(path, options);
    }
    if (!refreshed || response.status === 401) {
      sessionExpiredHandler?.();
      throw new ApiError(401, SESSION_EXPIRED_MESSAGE, undefined);
    }
  }

  const body = await parseBody(response);
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? (body as {detail: unknown}).detail : body;
    throw new ApiError(response.status, messageFor(response.status, body), detail);
  }
  return {data: body as T, status: response.status};
}

/** Atajo que devuelve solo los datos. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await request<T>(path, options)).data;
}
