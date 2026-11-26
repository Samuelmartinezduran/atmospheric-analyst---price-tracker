/**
 * Caché en memoria con «stale-while-revalidate».
 *
 * Con `<ClientRouter />` la página no se recarga al navegar, así que este módulo (y sus datos)
 * sobrevive entre páginas: al volver al panel se pinta al instante con lo último que se tenía
 * y se pide la versión nueva por detrás. Varias islas que piden la misma clave a la vez
 * comparten una sola petición.
 */
import {useCallback, useEffect, useSyncExternalStore} from 'react';

export interface ResourceState<T> {
  data: T | undefined;
  error: unknown;
  /** Hay una petición en marcha (con o sin datos previos). */
  loading: boolean;
  /** Momento de la última respuesta correcta (ms). */
  updatedAt: number;
}

const EMPTY: ResourceState<never> = Object.freeze({data: undefined, error: undefined, loading: false, updatedAt: 0});

const states = new Map<string, ResourceState<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();
/** Última función usada para cada clave: permite revalidar lo que está en pantalla al invalidar. */
const fetchers = new Map<string, () => Promise<unknown>>();

function emit(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function setState(key: string, patch: Partial<ResourceState<unknown>>) {
  const previous = states.get(key) ?? EMPTY;
  states.set(key, {...previous, ...patch});
  emit(key);
}

export function getResource<T>(key: string): ResourceState<T> {
  return (states.get(key) as ResourceState<T> | undefined) ?? EMPTY;
}

export function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}

/** Pide la clave (o se une a la petición que ya esté en marcha) y guarda el resultado. */
export function revalidate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  fetchers.set(key, fetcher);
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  setState(key, {loading: true});
  const promise = fetcher()
    .then((data) => {
      setState(key, {data, error: undefined, loading: false, updatedAt: Date.now()});
      return data;
    })
    .catch((error: unknown) => {
      setState(key, {error, loading: false});
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/** Sustituye los datos de una clave (por ejemplo, con la respuesta de un PATCH). */
export function mutate<T>(key: string, update: T | ((current: T | undefined) => T | undefined)): void {
  const current = getResource<T>(key).data;
  const next = typeof update === 'function' ? (update as (c: T | undefined) => T | undefined)(current) : update;
  setState(key, {data: next, error: undefined, updatedAt: Date.now()});
}

/**
 * Marca como caducadas las claves que empiezan por algún prefijo. Las que están en pantalla
 * se vuelven a pedir ya; las demás, cuando se monten.
 */
export function invalidate(...prefixes: string[]): void {
  for (const key of [...states.keys()]) {
    if (!prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}:`))) continue;
    const state = states.get(key);
    if (state) states.set(key, {...state, updatedAt: 0});
    const fetcher = fetchers.get(key);
    if (fetcher && listeners.get(key)?.size) revalidate(key, fetcher).catch(() => undefined);
  }
}

/** Datos provisionales (por ejemplo, el producto sacado de la lista): se pintan, pero se revalidan al montar. */
export function seed<T>(key: string, data: T): void {
  const previous = states.get(key) ?? EMPTY;
  states.set(key, {...previous, data, updatedAt: 0});
}

/** Borra todo (al cerrar sesión). */
export function clearCache(): void {
  states.clear();
  inflight.clear();
  for (const key of listeners.keys()) emit(key);
}

export interface UseResourceOptions {
  /** Ms durante los que unos datos se consideran frescos y no se vuelven a pedir al montar. */
  freshFor?: number;
  /** `false` para no pedir nada (por ejemplo, hasta tener sesión). */
  enabled?: boolean;
}

export interface UseResource<T> extends ResourceState<T> {
  reload: () => Promise<T | undefined>;
}

/**
 * Lee una clave de la caché y la revalida al montar. Devuelve lo que haya al instante (aunque
 * sea viejo) y se actualiza cuando llega la respuesta.
 */
export function useResource<T>(key: string | null, fetcher: () => Promise<T>, options: UseResourceOptions = {}): UseResource<T> {
  const {freshFor = 0, enabled = true} = options;
  const active = enabled && key !== null;

  const state = useSyncExternalStore(
    useCallback((listener: () => void) => (key ? subscribe(key, listener) : () => {}), [key]),
    () => (key ? getResource<T>(key) : (EMPTY as ResourceState<T>)),
    () => EMPTY as ResourceState<T>,
  );

  useEffect(() => {
    if (!active || !key) return;
    const current = getResource<T>(key);
    if (current.updatedAt && Date.now() - current.updatedAt < freshFor) return;
    revalidate(key, fetcher).catch(() => {
      // El error queda en el estado; cada vista decide cómo enseñarlo.
    });
    // `fetcher` cambia en cada render; la clave identifica la petición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, freshFor]);

  const reload = useCallback(async () => {
    if (!key) return undefined;
    try {
      return await revalidate(key, fetcher);
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {...state, reload};
}
