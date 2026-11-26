import type {Reading} from '../api/types';
import {formatPrice} from './format';

export type ChangeKind = 'up' | 'down' | 'same' | 'first' | 'lowest' | 'unavailable' | 'error';

export interface ReadingChange {
  kind: ChangeKind;
  /** Texto en minúsculas para las listas: «subida de 392,17 €», «mínimo histórico»… */
  label: string;
  /** Diferencia con la lectura correcta anterior, en euros (positiva si sube). */
  delta: number | null;
  /** Clase del punto de estado. */
  dot: '' | 'ok' | 'warn' | 'err';
}

/** Medio céntimo: por debajo, dos importes son el mismo precio. */
const EPSILON = 0.005;

/**
 * Qué cambió en una lectura respecto a la anterior con precio del mismo producto.
 *
 * Orden: «sin stock» y «error» mandan; la primera lectura con precio no tiene con qué
 * compararse; si el precio coincide con `lowestPrice` (el mínimo histórico del producto,
 * `stats.lowest_price`) se dice así; si no, subida, bajada o sin cambios.
 */
export function describeReadingChange(
  reading: Pick<Reading, 'status' | 'price' | 'previous_price'>,
  lowestPrice?: number | null,
): ReadingChange {
  const {price, previous_price: previous} = reading;

  if (reading.status === 'unavailable') {
    return {kind: 'unavailable', label: 'sin stock', delta: null, dot: ''};
  }
  if (reading.status === 'error' || price === null) {
    return {kind: 'error', label: 'error de lectura', delta: null, dot: 'err'};
  }
  if (previous === null) {
    return {kind: 'first', label: 'primera lectura', delta: null, dot: ''};
  }
  const delta = Math.round((price - previous) * 100) / 100;
  if (lowestPrice !== null && lowestPrice !== undefined && Math.abs(price - lowestPrice) < EPSILON) {
    // Si ya estaba ahí, se dice que sigue (si no, cada ronda repetiría «mínimo histórico»).
    const label = delta <= -EPSILON ? 'mínimo histórico' : 'sigue en su mínimo histórico';
    return {kind: 'lowest', label, delta, dot: 'ok'};
  }
  if (delta >= EPSILON) {
    return {kind: 'up', label: `subida de ${formatPrice(delta)}`, delta, dot: 'warn'};
  }
  if (delta <= -EPSILON) {
    return {kind: 'down', label: `bajada de ${formatPrice(-delta)}`, delta, dot: 'ok'};
  }
  return {kind: 'same', label: 'sin cambios', delta: 0, dot: ''};
}

/** ¿El precio de la lectura está en tu objetivo o por debajo? */
export function isAtTarget(reading: Pick<Reading, 'price' | 'desired_price'>): boolean {
  return reading.price !== null && reading.price <= reading.desired_price;
}
