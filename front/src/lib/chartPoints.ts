import type {HistoryPoint} from '../api/types';

export interface ChartPoint {
  time: number;
  price: number;
}

/** Solo los puntos con precio: las comprobaciones fallidas (price null) no se dibujan. */
export function toChartPoints(history: HistoryPoint[]): ChartPoint[] {
  return history
    .filter((point): point is HistoryPoint & {price: number} => typeof point.price === 'number')
    .map((point) => ({time: new Date(point.checked_at).getTime(), price: point.price}))
    .filter((point) => Number.isFinite(point.time));
}
