import {describe, expect, it} from 'vitest';
import type {Product} from '../api/types';
import {computeToday, shortName} from './today';

let nextId = 1;
function product(partial: Partial<Product>): Product {
  return {
    id: nextId++,
    url: 'https://www.pccomponentes.com/x',
    store: 'pccomponentes',
    title: 'Producto',
    image_url: null,
    desired_price: 100,
    last_price: 120,
    previous_price: null,
    currency: 'EUR',
    last_status: 'ok',
    last_error: null,
    last_checked_at: '2026-11-26T10:00:00Z',
    is_below_target: false,
    stats: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-26T10:00:00Z',
    ...partial,
  };
}

describe('computeToday (franja «Hoy»)', () => {
  it('elige el de mayor ahorro entre los que están a tu precio y cuenta los demás', () => {
    const iphone = product({title: 'Apple iPhone 15', desired_price: 700, last_price: 518.89, is_below_target: true});
    const ram = product({title: 'RAM', desired_price: 120, last_price: 110, is_below_target: true});
    const caro = product({title: 'GPU', desired_price: 500, last_price: 900});
    const model = computeToday([ram, caro, iphone]);
    expect(model).toMatchObject({kind: 'deal', product: iphone, savings: 181.11, others: 1});
  });

  it('justo en el objetivo también cuenta (ahorro 0)', () => {
    expect(computeToday([product({desired_price: 100, last_price: 100})])).toMatchObject({kind: 'deal', savings: 0, others: 0});
  });

  it('si no hay ninguno, el más cerca en proporción a su objetivo', () => {
    const a = product({title: 'A', desired_price: 100, last_price: 150}); // 50 %
    const b = product({title: 'B', desired_price: 1000, last_price: 1100}); // 10 %
    const model = computeToday([a, b]);
    expect(model.kind).toBe('closest');
    if (model.kind === 'closest') {
      expect(model.product).toBe(b);
      expect(model.gap).toBe(100);
      expect(model.ratio).toBeCloseTo(0.1);
    }
  });

  it('ignora agotados, errores y pendientes', () => {
    const agotado = product({last_status: 'unavailable', last_price: 10});
    const pendiente = product({last_status: 'never_checked', last_price: null});
    expect(computeToday([agotado, pendiente])).toEqual({kind: 'none'});
    expect(computeToday([])).toEqual({kind: 'none'});
  });
});

describe('shortName', () => {
  it('corta en el primer separador y a cuatro palabras', () => {
    expect(shortName('Apple iPhone 15 128GB Negro Libre Reacondicionado')).toBe('Apple iPhone 15 128GB');
    expect(shortName('ASUS ROG Astral GeForce RTX 5090 OC Edition - Tarjeta gráfica gaming')).toBe('ASUS ROG Astral GeForce');
    expect(shortName('Forgeon Cyclone PRO, DDR5')).toBe('Forgeon Cyclone PRO');
    expect(shortName(null)).toBe('Producto');
  });
});
