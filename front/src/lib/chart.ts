/**
 * Matemáticas de las gráficas SVG (minigráficas de las tarjetas y gráfica del detalle).
 * Todo es puro y sin DOM para poder probarlo: escalas, marcas de los ejes, huecos sin lecturas
 * y trazados.
 */
import type {HistoryPoint} from '../api/types';
import type {PricePoint} from './chartCore';

export {areaPath, linearScale, linePath, toPricePoints, type PricePoint, type Scale} from './chartCore';

export interface Gap {
  start: number;
  end: number;
}

const DAY = 86_400_000;

/** A partir de 14 días sin ninguna lectura se sombrea la zona como «sin lecturas». */
export const GAP_MS = 14 * DAY;

/** Instantes de todas las lecturas (también las fallidas), ordenados. */
export function readingTimes(history: HistoryPoint[]): number[] {
  return history
    .map((point) => new Date(point.checked_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

/**
 * Tramos de más de `minGap` sin ninguna lectura entre dos lecturas consecutivas.
 * Una lectura fallida cuenta como lectura: el worker estaba vivo, aunque no hubiera precio.
 */
export function findGaps(times: number[], minGap = GAP_MS): Gap[] {
  const sorted = [...times].sort((a, b) => a - b);
  const gaps: Gap[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] > minGap) gaps.push({start: sorted[i - 1], end: sorted[i]});
  }
  return gaps;
}

/** Corta la línea de precios en los huecos: cada tramo se dibuja aparte. */
export function splitAtGaps(points: PricePoint[], gaps: Gap[]): PricePoint[][] {
  const segments: PricePoint[][] = [];
  let current: PricePoint[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous && gaps.some((gap) => previous.time <= gap.start && point.time >= gap.end)) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Paso «bonito» (1, 2, 2,5 o 5 por una potencia de diez) para unas `count` divisiones. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || count <= 0) return 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export interface PriceAxis {
  domain: [number, number];
  ticks: number[];
}

/**
 * Eje de precios que incluye todos los valores (y el objetivo), con límites redondos.
 * Si todos son iguales, abre un margen del 10 % para que la línea no quede pegada.
 */
export function priceAxis(values: number[], count = 4): PriceAxis {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return {domain: [0, 1], ticks: [0, 1]};
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (hi === lo) {
    const pad = Math.abs(hi) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return {domain: [start, end], ticks};
}

const TIME_STEPS: {months?: number; days?: number}[] = [
  {days: 1},
  {days: 2},
  {days: 7},
  {days: 14},
  {months: 1},
  {months: 2},
  {months: 3},
  {months: 6},
  {months: 12},
];

/**
 * Marcas del eje de tiempo: días, semanas o meses enteros (en hora local), las justas para
 * que quepan `maxTicks`. Las de meses caen el día 1.
 */
export function timeTicks(t0: number, t1: number, maxTicks = 6): number[] {
  if (!(t1 > t0)) return Number.isFinite(t0) ? [t0] : [];
  for (const step of TIME_STEPS) {
    const ticks: number[] = [];
    const cursor = new Date(t0);
    cursor.setHours(0, 0, 0, 0);
    if (step.months) {
      cursor.setDate(1);
      cursor.setMonth(Math.floor(cursor.getMonth() / step.months) * step.months);
    }
    while (cursor.getTime() <= t1 && ticks.length <= maxTicks) {
      if (cursor.getTime() >= t0) ticks.push(cursor.getTime());
      if (step.months) cursor.setMonth(cursor.getMonth() + step.months);
      else cursor.setDate(cursor.getDate() + (step.days ?? 1));
    }
    if (ticks.length <= maxTicks) return ticks;
  }
  return [t0, t1];
}

/** Índice del punto más cercano en el tiempo (búsqueda binaria; `points` ordenados). */
export function nearestIndex(points: PricePoint[], time: number): number {
  if (!points.length) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].time - time) <= Math.abs(points[lo].time - time)) return lo - 1;
  return lo;
}
