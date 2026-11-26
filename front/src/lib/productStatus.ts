import type {Product, Store} from '../api/types';

export type UiStatus = 'pending' | 'above' | 'below' | 'unavailable' | 'error';

export function getUiStatus(product: Pick<Product, 'last_status' | 'is_below_target'>): UiStatus {
  switch (product.last_status) {
    case 'never_checked':
      return 'pending';
    case 'unavailable':
      return 'unavailable';
    case 'error':
      return 'error';
    default:
      return product.is_below_target ? 'below' : 'above';
  }
}

export const STATUS_LABEL: Record<UiStatus, string> = {
  pending: 'Pendiente',
  above: 'Por encima',
  below: 'A tu precio',
  unavailable: 'Agotado',
  error: 'Error',
};

/** Clase del punto de estado: verde, ámbar, rojo o gris. */
export const STATUS_DOT: Record<UiStatus, '' | 'ok' | 'warn' | 'err'> = {
  pending: '',
  above: 'warn',
  below: 'ok',
  unavailable: '',
  error: 'err',
};

export function productName(product: Pick<Product, 'title' | 'url'>): string {
  return product.title?.trim() || product.url;
}

const FALLBACK_STORE_NAMES: Record<string, string> = {
  amazon_es: 'Amazon ES',
  pccomponentes: 'PCComponentes',
};

const STORE_INITIALS: Record<string, string> = {
  amazon_es: 'a',
  pccomponentes: 'pc',
};

export function storeName(code: string, stores?: Store[]): string {
  return stores?.find((store) => store.code === code)?.name ?? FALLBACK_STORE_NAMES[code] ?? code;
}

/** Letras del icono redondo de la tienda («a», «pc»). */
export function storeInitials(code: string): string {
  return STORE_INITIALS[code] ?? (code.slice(0, 2) || '?');
}

/** «amazon.es», «pccomponentes.com»: el host de la URL sin «www.». */
export function productDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Tienda a la que pertenece una URL, según los dominios de `GET /api/stores`. */
export function detectStore(rawUrl: string, stores: Store[]): Store | null {
  let host: string;
  try {
    host = new URL(rawUrl.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  return (
    stores.find((store) =>
      store.domains.some((domain) => {
        const d = domain.toLowerCase();
        return host === d || host.endsWith(`.${d}`);
      }),
    ) ?? null
  );
}

/** Solo enlaces http(s) se abren en una pestaña nueva (nada de `javascript:`). */
export function safeExternalUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
