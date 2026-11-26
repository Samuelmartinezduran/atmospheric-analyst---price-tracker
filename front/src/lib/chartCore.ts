/**
 * Lo mínimo para dibujar una línea de precios (minigráficas de las tarjetas). El resto de la
 * matemática de la gráfica grande está en `chart.ts`, que solo carga la página de detalle.
 */
import type {HistoryPoint} from '../api/types';

export interface PricePoint {
  time: number;
  price: number;
}

/** Solo las lecturas con precio, en orden cronológico (las fallidas y sin stock no se dibujan). */
export function toPricePoints(history: HistoryPoint[]): PricePoint[] {
  return history
    .filter((point): point is HistoryPoint & {price: number} => typeof point.price === 'number')
    .map((point) => ({time: new Date(point.checked_at).getTime(), price: point.price}))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
}

export interface Scale {
  (value: number): number;
  invert(pixel: number): number;
  domain: [number, number];
  range: [number, number];
}

/** Escala lineal. Con un dominio degenerado (un solo valor) lo coloca en el centro del rango. */
export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = ((value: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))) as Scale;
  scale.invert = (pixel: number) => (r1 === r0 ? d0 : d0 + ((pixel - r0) / (r1 - r0)) * span);
  scale.domain = [d0, d1];
  scale.range = [r0, r1];
  return scale;
}

/** «M x y L x y …» con un decimal. */
export function linePath(points: PricePoint[], x: (t: number) => number, y: (p: number) => number): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)} ${y(p.price).toFixed(1)}`).join(' ');
}

/** La línea cerrada hasta `baseline` para el relleno. */
export function areaPath(
  points: PricePoint[],
  x: (t: number) => number,
  y: (p: number) => number,
  baseline: number,
): string {
  if (!points.length) return '';
  const first = x(points[0].time).toFixed(1);
  const last = x(points[points.length - 1].time).toFixed(1);
  return `${linePath(points, x, y)} L${last} ${baseline.toFixed(1)} L${first} ${baseline.toFixed(1)} Z`;
}
