import type {Product} from '../api/types';

export type VerdictKind = 'lowest' | 'good' | 'normal' | 'high' | 'unknown';

export interface PriceVerdict {
  kind: VerdictKind;
  title: string;
  /** Diferencia con el mínimo histórico, en euros (positiva si está por encima). */
  vsLowest: number | null;
  /** Diferencia con la media de 30 días, en tanto por uno (negativa si está por debajo). */
  vsAverage: number | null;
}

/** Con menos comprobaciones que esto, la media y el mínimo dicen poco. */
export const MIN_CHECKS_FOR_VERDICT = 3;
/** Margen para considerar que un precio «es» el mínimo histórico (1 %). */
const LOWEST_TOLERANCE = 0.01;
/** Banda alrededor de la media en la que hablamos de precio normal (±3 %). */
const AVERAGE_BAND = 0.03;

/**
 * ¿Es buen precio? Compara el precio actual con el mínimo histórico y con la media
 * de los últimos 30 días. No predice nada: solo sitúa el precio en su propio historial.
 */
export function getPriceVerdict(product: Pick<Product, 'last_price' | 'stats'>): PriceVerdict {
  const current = product.last_price;
  const lowest = product.stats?.lowest_price ?? null;
  const average = product.stats?.avg_price_30d ?? null;
  const checks = product.stats?.checks_count ?? 0;

  const vsLowest = current !== null && lowest !== null ? Math.round((current - lowest) * 100) / 100 : null;
  const vsAverage = current !== null && average !== null && average > 0 ? (current - average) / average : null;
  const verdict = (kind: VerdictKind, title: string): PriceVerdict => ({kind, title, vsLowest, vsAverage});

  if (current === null) return verdict('unknown', 'Sin precio actual');
  if (checks < MIN_CHECKS_FOR_VERDICT || (lowest === null && average === null)) {
    return verdict('unknown', 'Aún hay pocos datos para valorarlo');
  }
  if (lowest !== null && current <= lowest * (1 + LOWEST_TOLERANCE)) {
    return verdict('lowest', 'Está en su mínimo histórico');
  }
  if (vsAverage !== null && vsAverage <= -AVERAGE_BAND) {
    return verdict('good', 'Buen precio: por debajo de la media');
  }
  if (vsAverage !== null && vsAverage >= AVERAGE_BAND) {
    return verdict('high', 'Caro: por encima de la media');
  }
  return verdict('normal', 'Precio normal para este producto');
}
