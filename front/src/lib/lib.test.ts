import {describe, expect, it} from 'vitest';
import type {Product} from '../api/types';
import {toChartPoints} from './chartPoints';
import {formatPrice, parsePriceInput} from './format';
import {getLegacyRedirect} from './legacyRedirect';
import {getPriceVerdict} from './priceVerdict';
import {detectStore} from './productStatus';

describe('getLegacyRedirect', () => {
  it('lleva /?verify_token=X a /verificar?token=X', () => {
    expect(getLegacyRedirect('?verify_token=abc')).toBe('/verificar?token=abc');
  });

  it('lleva /?reset_token=X a /restablecer?token=X', () => {
    expect(getLegacyRedirect('?reset_token=x%2By')).toBe('/restablecer?token=x%2By');
  });

  it('no hace nada con otras URLs', () => {
    expect(getLegacyRedirect('')).toBeNull();
    expect(getLegacyRedirect('?token=abc')).toBeNull();
    expect(getLegacyRedirect('?verify_token=')).toBeNull();
  });
});

describe('parsePriceInput', () => {
  it.each([
    ['600', 600],
    ['599,90', 599.9],
    ['599.90', 599.9],
    ['1.099,95', 1099.95],
    ['1.099', 1099],
    [' 12,5 € ', 12.5],
  ])('«%s» → %d', (input, expected) => {
    expect(parsePriceInput(input)).toBe(expected);
  });

  it.each(['', '0', '-3', 'abc', '12,345', '1,2,3'])('rechaza «%s»', (input) => {
    expect(parsePriceInput(input)).toBeNull();
  });
});

describe('formatPrice', () => {
  it('formatea en euros con el formato de España', () => {
    expect(formatPrice(649)).toMatch(/^649,00\s€$/);
    expect(formatPrice(null)).toBe('—');
  });
});

const base: Pick<Product, 'last_price' | 'stats'> = {
  last_price: 650,
  stats: {lowest_price: 629, lowest_price_at: '2026-04-01T17:10:04Z', highest_price: 699, avg_price_30d: 655, checks_count: 41},
};

describe('getPriceVerdict', () => {
  it('en el mínimo histórico (con un 1 % de margen)', () => {
    expect(getPriceVerdict({...base, last_price: 633}).kind).toBe('lowest');
  });

  it('bueno si está claramente por debajo de la media', () => {
    const stats = {...base.stats!, lowest_price: 500, avg_price_30d: 700};
    expect(getPriceVerdict({last_price: 650, stats}).kind).toBe('good');
  });

  it('normal cerca de la media', () => {
    expect(getPriceVerdict(base).kind).toBe('normal');
  });

  it('caro por encima de la media', () => {
    expect(getPriceVerdict({...base, last_price: 690}).kind).toBe('high');
  });

  it('sin datos suficientes', () => {
    expect(getPriceVerdict({...base, stats: {...base.stats!, checks_count: 1}}).kind).toBe('unknown');
    expect(getPriceVerdict({last_price: 10, stats: null}).kind).toBe('unknown');
    expect(getPriceVerdict({...base, last_price: null}).kind).toBe('unknown');
  });
});

describe('toChartPoints', () => {
  it('descarta las comprobaciones sin precio', () => {
    const points = toChartPoints([
      {id: 1, product_id: 1, price: 10, currency: 'EUR', status: 'ok', error_message: null, checked_at: '2026-11-01T10:00:00Z'},
      {id: 2, product_id: 1, price: null, currency: 'EUR', status: 'error', error_message: 'x', checked_at: '2026-11-02T10:00:00Z'},
      {id: 3, product_id: 1, price: 9, currency: 'EUR', status: 'ok', error_message: null, checked_at: '2026-11-03T10:00:00Z'},
    ]);
    expect(points.map((p) => p.price)).toEqual([10, 9]);
  });
});

describe('detectStore', () => {
  const stores = [
    {code: 'amazon_es', name: 'Amazon ES', domains: ['amazon.es'], example_url: ''},
    {code: 'pccomponentes', name: 'PCComponentes', domains: ['www.pccomponentes.com', 'pccomponentes.com'], example_url: ''},
  ];

  it('reconoce la tienda por el host, no por el texto de la URL', () => {
    expect(detectStore('https://www.amazon.es/dp/B0TEST', stores)?.code).toBe('amazon_es');
    expect(detectStore('https://www.pccomponentes.com/algo', stores)?.code).toBe('pccomponentes');
    expect(detectStore('http://169.254.169.254/?x=amazon.es', stores)).toBeNull();
    expect(detectStore('https://amazon.es.evil.com/', stores)).toBeNull();
    expect(detectStore('no es una url', stores)).toBeNull();
  });
});
