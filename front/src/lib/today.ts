/** Franja «Hoy»: el mejor producto a tu precio o, si no hay, el que más cerca está. */
import type {Product} from '../api/types';

export type TodayModel =
  | {kind: 'deal'; product: Product; savings: number; others: number}
  | {kind: 'closest'; product: Product; gap: number; ratio: number}
  | {kind: 'none'};

const withPrice = (p: Product): p is Product & {last_price: number} =>
  p.last_status === 'ok' && typeof p.last_price === 'number';

export function computeToday(products: Product[]): TodayModel {
  const priced = products.filter(withPrice);
  const deals = priced.filter((p) => p.last_price <= p.desired_price);
  if (deals.length) {
    const best = deals.reduce((a, b) => (b.desired_price - b.last_price > a.desired_price - a.last_price ? b : a));
    return {
      kind: 'deal',
      product: best,
      savings: Math.round((best.desired_price - best.last_price) * 100) / 100,
      others: deals.length - 1,
    };
  }
  if (priced.length) {
    const closest = priced.reduce((a, b) =>
      (b.last_price - b.desired_price) / b.desired_price < (a.last_price - a.desired_price) / a.desired_price ? b : a,
    );
    const gap = Math.round((closest.last_price - closest.desired_price) * 100) / 100;
    return {kind: 'closest', product: closest, gap, ratio: gap / closest.desired_price};
  }
  return {kind: 'none'};
}

/**
 * Nombre corto para frases: hasta el primer separador («-», «|», «,», «(») y como mucho
 * cuatro palabras. «Apple iPhone 15 128GB Negro Libre» → «Apple iPhone 15 128GB».
 */
export function shortName(title: string | null | undefined, words = 4): string {
  const base = (title ?? '').split(/\s[-–|]\s|,|\(/)[0].trim();
  const parts = base.split(/\s+/).filter(Boolean);
  return parts.slice(0, words).join(' ') || 'Producto';
}
