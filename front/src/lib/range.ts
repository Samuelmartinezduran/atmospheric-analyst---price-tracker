/**
 * Medidor de rango: dónde cae el precio actual entre el mínimo y el máximo históricos, y dónde
 * queda el objetivo. Funciona con un solo punto (mínimo = máximo = actual) y amplía la pista si
 * el objetivo cae fuera del rango histórico.
 */

export interface RangeInput {
  min: number | null | undefined;
  max: number | null | undefined;
  target: number;
  current: number | null | undefined;
  avg?: number | null;
}

export interface RangeModel {
  /** Extremos de la pista (ya ampliada para incluir el objetivo y el actual). */
  lo: number;
  hi: number;
  /** Mínimo y máximo históricos que se rotulan (si no hay historial, el precio actual). */
  histMin: number | null;
  histMax: number | null;
  /** Posiciones en % (0–100) sobre la pista. */
  histFrom: number;
  histTo: number;
  targetPos: number;
  currentPos: number | null;
  avgPos: number | null;
  /** El objetivo queda fuera del rango histórico. */
  targetOutside: 'below' | 'above' | null;
  /** Mínimo y máximo coinciden: solo hay un precio conocido. */
  single: boolean;
  /** El precio actual está en el objetivo o por debajo. */
  atTarget: boolean;
}

/** Margen de cada extremo, en %, para que las marcas no queden pegadas al borde. */
const EDGE = 4;

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function computeRange({min, max, target, current, avg}: RangeInput): RangeModel {
  const known = [min, max, current].filter(isNum);
  const histMin = known.length ? Math.min(...known) : null;
  const histMax = known.length ? Math.max(...known) : null;

  let lo = Math.min(target, ...(histMin === null ? [] : [histMin]));
  let hi = Math.max(target, ...(histMax === null ? [] : [histMax]));
  if (hi - lo < 1e-9) {
    // Todo en el mismo punto: abre un 5 % a cada lado (o 1 € si el importe es 0).
    const pad = Math.abs(hi) * 0.05 || 1;
    lo -= pad;
    hi += pad;
  }
  const pos = (value: number) => EDGE + ((value - lo) / (hi - lo)) * (100 - EDGE * 2);

  const targetOutside =
    histMin === null ? null : target < histMin - 0.005 ? 'below' : target > histMax! + 0.005 ? 'above' : null;

  return {
    lo,
    hi,
    histMin,
    histMax,
    histFrom: histMin === null ? pos(target) : pos(histMin),
    histTo: histMax === null ? pos(target) : pos(histMax),
    targetPos: pos(target),
    currentPos: isNum(current) ? pos(current) : null,
    avgPos: isNum(avg) ? pos(avg) : null,
    targetOutside,
    single: histMin !== null && histMax !== null && Math.abs(histMax - histMin) < 0.005,
    atTarget: isNum(current) && current <= target,
  };
}
