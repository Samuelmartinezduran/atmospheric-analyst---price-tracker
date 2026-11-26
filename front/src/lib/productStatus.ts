import type {Product, Store} from '../api/types';

export type UiStatus = 'pending' | 'watching' | 'below' | 'unavailable' | 'error';

export function getUiStatus(product: Pick<Product, 'last_status' | 'is_below_target'>): UiStatus {
  switch (product.last_status) {
    case 'never_checked':
      return 'pending';
    case 'unavailable':
      return 'unavailable';
    case 'error':
      return 'error';
    default:
      return product.is_below_target ? 'below' : 'watching';
  }
}

export const STATUS_LABEL: Record<UiStatus, string> = {
  pending: 'Pendiente',
  watching: 'Vigilando',
  below: 'Bajo el objetivo',
  unavailable: 'Sin stock',
  error: 'Error',
};

export function productName(product: Pick<Product, 'title' | 'url'>): string {
  return product.title?.trim() || product.url;
}

const FALLBACK_STORE_NAMES: Record<string, string> = {
  amazon_es: 'Amazon ES',
  pccomponentes: 'PCComponentes',
};

export function storeName(code: string, stores?: Store[]): string {
  return stores?.find((store) => store.code === code)?.name ?? FALLBACK_STORE_NAMES[code] ?? code;
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

/** Variación del último precio respecto al anterior, en tanto por uno. */
export function priceChange(product: Pick<Product, 'last_price' | 'previous_price'>): number | null {
  const {last_price: current, previous_price: previous} = product;
  if (typeof current !== 'number' || typeof previous !== 'number' || previous <= 0) return null;
  const change = (current - previous) / previous;
  return Math.abs(change) < 0.0005 ? null : change;
}
