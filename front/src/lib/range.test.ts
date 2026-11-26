import {describe, expect, it} from 'vitest';
import {computeRange} from './range';

describe('computeRange (medidor de rango)', () => {
  it('coloca mínimo, máximo, objetivo y actual en la pista', () => {
    const m = computeRange({min: 500, max: 700, target: 600, current: 550});
    expect(m.lo).toBe(500);
    expect(m.hi).toBe(700);
    expect(m.histFrom).toBeCloseTo(4);
    expect(m.histTo).toBeCloseTo(96);
    expect(m.targetPos).toBeCloseTo(50);
    expect(m.currentPos).toBeCloseTo(27);
    expect(m.targetOutside).toBeNull();
    expect(m.atTarget).toBe(true);
    expect(m.single).toBe(false);
  });

  it('con el objetivo por debajo del rango, la pista se amplía para incluirlo', () => {
    const m = computeRange({min: 500, max: 700, target: 1, current: 650});
    expect(m.lo).toBe(1);
    expect(m.targetOutside).toBe('below');
    expect(m.targetPos).toBeCloseTo(4);
    expect(m.histFrom).toBeGreaterThan(m.targetPos);
    expect(m.atTarget).toBe(false);
  });

  it('con el objetivo por encima del rango, también', () => {
    const m = computeRange({min: 500, max: 520, target: 700, current: 518});
    expect(m.hi).toBe(700);
    expect(m.targetOutside).toBe('above');
    expect(m.targetPos).toBeCloseTo(96);
    expect(m.histTo).toBeLessThan(m.targetPos);
    expect(m.atTarget).toBe(true);
  });

  it('funciona con un solo punto (mínimo = máximo = actual)', () => {
    const m = computeRange({min: 518.89, max: 518.89, target: 700, current: 518.89});
    expect(m.single).toBe(true);
    expect(m.histFrom).toBeCloseTo(m.histTo);
    expect(m.currentPos).toBeCloseTo(m.histFrom);
    expect(m.targetPos).toBeGreaterThan(m.currentPos!);
    for (const v of [m.histFrom, m.targetPos, m.currentPos!]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('con un solo punto igual al objetivo abre un margen y no divide entre cero', () => {
    const m = computeRange({min: 100, max: 100, target: 100, current: 100});
    expect(m.hi).toBeGreaterThan(m.lo);
    expect(m.currentPos).toBeCloseTo(50);
    expect(m.targetPos).toBeCloseTo(50);
  });

  it('sin precios todavía solo sitúa el objetivo', () => {
    const m = computeRange({min: null, max: null, target: 300, current: null});
    expect(m.histMin).toBeNull();
    expect(m.currentPos).toBeNull();
    expect(m.targetPos).toBeCloseTo(50);
    expect(m.targetOutside).toBeNull();
  });

  it('sin estadísticas usa el precio actual como rango', () => {
    const m = computeRange({min: null, max: null, target: 50, current: 80});
    expect(m.histMin).toBe(80);
    expect(m.single).toBe(true);
    expect(m.targetOutside).toBe('below');
  });

  it('incluye la media si se le pasa', () => {
    const m = computeRange({min: 100, max: 200, avg: 150, target: 120, current: 180});
    expect(m.avgPos).toBeCloseTo(50);
  });
});
