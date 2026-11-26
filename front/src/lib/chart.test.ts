import {describe, expect, it} from 'vitest';
import type {HistoryPoint} from '../api/types';
import {
  GAP_MS,
  areaPath,
  findGaps,
  linearScale,
  linePath,
  nearestIndex,
  niceStep,
  priceAxis,
  readingTimes,
  splitAtGaps,
  timeTicks,
  toPricePoints,
} from './chart';

const DAY = 86_400_000;
const t = (iso: string) => new Date(iso).getTime();

function point(id: number, checkedAt: string, price: number | null, status = price === null ? 'error' : 'ok'): HistoryPoint {
  return {id, product_id: 1, price, currency: 'EUR', status, error_message: null, checked_at: checkedAt};
}

describe('linearScale', () => {
  it('lleva el dominio al rango y vuelve con invert', () => {
    const x = linearScale([0, 100], [10, 210]);
    expect(x(0)).toBe(10);
    expect(x(50)).toBe(110);
    expect(x(100)).toBe(210);
    expect(x.invert(110)).toBe(50);
  });

  it('admite rangos invertidos (eje Y: más precio, más arriba)', () => {
    const y = linearScale([600, 700], [300, 0]);
    expect(y(600)).toBe(300);
    expect(y(700)).toBe(0);
    expect(y(650)).toBe(150);
  });

  it('con un solo valor lo coloca en el centro', () => {
    const x = linearScale([5, 5], [0, 100]);
    expect(x(5)).toBe(50);
  });

  it('la escala de tiempo es real: un hueco de meses ocupa su anchura proporcional', () => {
    const start = t('2026-03-15T00:00:00Z');
    const end = t('2026-11-26T00:00:00Z');
    const x = linearScale([start, end], [0, 1000]);
    const aprilFirst = x(t('2026-04-01T00:00:00Z'));
    // Del 15 de marzo al 1 de abril son 17 de 256 días: menos de una décima parte del ancho.
    expect(aprilFirst).toBeCloseTo((17 / 256) * 1000, 5);
  });
});

describe('niceStep y priceAxis', () => {
  it('elige pasos redondos', () => {
    expect(niceStep(100, 4)).toBe(25);
    expect(niceStep(1000, 5)).toBe(200);
    expect(niceStep(3, 4)).toBe(1);
    expect(niceStep(0.4, 4)).toBeCloseTo(0.1);
  });

  it('el eje incluye todos los precios y el objetivo, con límites redondos', () => {
    const axis = priceAxis([649, 659, 629, 600]);
    expect(axis.domain[0]).toBeLessThanOrEqual(600);
    expect(axis.domain[1]).toBeGreaterThanOrEqual(659);
    expect(axis.ticks[0]).toBe(axis.domain[0]);
    expect(axis.ticks[axis.ticks.length - 1]).toBe(axis.domain[1]);
    const steps = axis.ticks.slice(1).map((tick, i) => tick - axis.ticks[i]);
    expect(new Set(steps).size).toBe(1);
  });

  it('si todos los valores son iguales abre un margen', () => {
    const axis = priceAxis([649, 649]);
    expect(axis.domain[0]).toBeLessThan(649);
    expect(axis.domain[1]).toBeGreaterThan(649);
  });

  it('sin valores no rompe', () => {
    expect(priceAxis([]).domain).toEqual([0, 1]);
  });
});

describe('timeTicks', () => {
  it('en un rango de meses marca el día 1 de cada mes (o cada pocos meses)', () => {
    const ticks = timeTicks(t('2026-03-15T00:00:00Z'), t('2026-11-26T00:00:00Z'), 10);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.length).toBeLessThanOrEqual(10);
    for (const tick of ticks) expect(new Date(tick).getDate()).toBe(1);
  });

  it('en una semana marca días', () => {
    const ticks = timeTicks(t('2026-11-20T10:00:00Z'), t('2026-11-26T10:00:00Z'), 7);
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks[1] - ticks[0]).toBeGreaterThanOrEqual(DAY - 3_600_000);
  });

  it('nunca pasa del máximo', () => {
    const ticks = timeTicks(t('2020-01-01T00:00:00Z'), t('2026-11-26T00:00:00Z'), 4);
    expect(ticks.length).toBeLessThanOrEqual(4);
  });
});

describe('huecos sin lecturas', () => {
  const history = [
    point(1, '2026-03-22T10:00:00Z', 409.95),
    point(2, '2026-03-23T10:00:00Z', 429.95),
    point(3, '2026-04-01T10:00:00Z', null),
    point(4, '2026-11-26T10:00:00Z', 822.12),
    point(5, '2026-11-26T16:00:00Z', 820),
  ];

  it('detecta solo los tramos de más de 14 días entre lecturas', () => {
    const gaps = findGaps(readingTimes(history));
    expect(gaps).toEqual([{start: t('2026-04-01T10:00:00Z'), end: t('2026-11-26T10:00:00Z')}]);
  });

  it('una lectura fallida cuenta como lectura (el worker estaba vivo)', () => {
    // Del 23 de marzo al 26 de noviembre, sin la del 1 de abril, el hueco empezaría antes.
    const gaps = findGaps(readingTimes(history));
    expect(gaps[0].start).toBe(t('2026-04-01T10:00:00Z'));
  });

  it('14 días justos no son hueco', () => {
    const start = t('2026-11-01T00:00:00Z');
    expect(findGaps([start, start + GAP_MS])).toEqual([]);
    expect(findGaps([start, start + GAP_MS + 1])).toHaveLength(1);
  });

  it('no depende del orden de entrada', () => {
    const times = readingTimes(history).reverse();
    expect(findGaps(times)).toHaveLength(1);
  });

  it('parte la línea en el hueco y no la une por encima', () => {
    const points = toPricePoints(history);
    const segments = splitAtGaps(points, findGaps(readingTimes(history)));
    expect(segments.map((s) => s.map((p) => p.price))).toEqual([
      [409.95, 429.95],
      [822.12, 820],
    ]);
  });

  it('sin huecos, un solo tramo', () => {
    const points = toPricePoints(history.slice(0, 2));
    expect(splitAtGaps(points, [])).toHaveLength(1);
  });
});

describe('trazados', () => {
  const points = [
    {time: 0, price: 10},
    {time: 10, price: 20},
  ];
  const x = linearScale([0, 10], [0, 100]);
  const y = linearScale([0, 20], [100, 0]);

  it('linePath', () => {
    expect(linePath(points, x, y)).toBe('M0.0 50.0 L100.0 0.0');
  });

  it('areaPath cierra hasta la base', () => {
    expect(areaPath(points, x, y, 100)).toBe('M0.0 50.0 L100.0 0.0 L100.0 100.0 L0.0 100.0 Z');
    expect(areaPath([], x, y, 100)).toBe('');
  });

  it('nearestIndex encuentra el punto más cercano en el tiempo', () => {
    const series = [0, 10, 20, 100].map((time) => ({time, price: 1}));
    expect(nearestIndex(series, -5)).toBe(0);
    expect(nearestIndex(series, 4)).toBe(0);
    expect(nearestIndex(series, 6)).toBe(1);
    expect(nearestIndex(series, 59)).toBe(2);
    expect(nearestIndex(series, 61)).toBe(3);
    expect(nearestIndex(series, 1000)).toBe(3);
    expect(nearestIndex([], 5)).toBe(-1);
  });
});
