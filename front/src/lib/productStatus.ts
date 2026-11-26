import type {Product, Store} from '../api/types';
import {formatPrice} from './format';

export type UiStatus = 'pending' | 'above' | 'rising' | 'below' | 'unavailable' | 'error';

/** Diferencia del último precio con el anterior, en euros; `null` sin cambio o sin datos. */
export function priceDelta(product: Pick<Product, 'last_status' | 'last_price' | 'previous_price'>): number | null {
  const {last_price: current, previous_price: previous} = product;
  if (product.last_status !== 'ok' || typeof current !== 'number' || typeof previous !== 'number') return null;
  const delta = Math.round((current - previous) * 100) / 100;
  return Math.abs(delta) < 0.005 ? null : delta;
}

export function getUiStatus(
  product: Pick<Product, 'last_status' | 'is_below_target' | 'last_price' | 'previous_price'>,
): UiStatus {
  switch (product.last_status) {
    case 'never_checked':
      return 'pending';
    case 'unavailable':
      return 'unavailable';
    case 'error':
      return 'error';
    default: {
      if (product.is_below_target) return 'below';
      const delta = priceDelta(product);
      return delta !== null && delta > 0 ? 'rising' : 'above';
    }
  }
}

export const STATUS_LABEL: Record<UiStatus, string> = {
  pending: 'Pendiente',
  above: 'Por encima',
  rising: 'Subiendo',
  below: 'A tu precio',
  unavailable: 'Agotado',
  error: 'Error',
};

export type Tone = 'ok' | 'err' | 'rise' | 'neutral' | 'gray' | 'accent';

/** Tono de la pastilla de estado. */
export const STATUS_TONE: Record<UiStatus, Tone> = {
  pending: 'gray',
  above: 'neutral',
  rising: 'rise',
  below: 'ok',
  unavailable: 'gray',
  error: 'err',
};

/** «↓ 110,11 €» o «↑ 392,17 €». */
export function formatDelta(delta: number): string {
  return `${delta < 0 ? '↓' : '↑'} ${formatPrice(Math.abs(delta))}`;
}

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
export function safeExternalUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export type Category = 'gpu' | 'phone' | 'ram' | 'generic';

/** Categoría aproximada por el título, para el dibujo de respaldo cuando no hay foto. */
export function productCategory(title: string | null | undefined): Category {
  const t = title ?? '';
  if (/\b(rtx|gtx|geforce|radeon|rx\s?\d{4}|tarjeta gr[aá]fica|gpu)\b/i.test(t)) return 'gpu';
  if (/\b(iphone|galaxy|pixel|xiaomi|redmi|m[oó]vil|smartphone|tel[eé]fono)\b/i.test(t)) return 'phone';
  if (/\b(ddr[345]|ram|memoria|so-?dimm|dimm)\b/i.test(t)) return 'ram';
  return 'generic';
}

/** ¿El precio actual es el mínimo histórico? */
export function isAtLowest(product: Pick<Product, 'last_status' | 'last_price' | 'stats'>): boolean {
  const lowest = product.stats?.lowest_price;
  return (
    product.last_status === 'ok' &&
    typeof product.last_price === 'number' &&
    typeof lowest === 'number' &&
    Math.abs(product.last_price - lowest) < 0.005
  );
}
