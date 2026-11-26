import {describe, expect, it} from 'vitest';
import type {Reading} from '../api/types';
import {describeReadingChange, isAtTarget} from './readings';

function reading(partial: Partial<Reading>): Reading {
  return {
    id: 1,
    product_id: 1,
    product_title: 'Corsair Vengeance 32GB',
    store: 'pccomponentes',
    price: 822.12,
    previous_price: 429.95,
    desired_price: 350,
    status: 'ok',
    error_message: null,
    checked_at: '2026-11-26T19:21:18Z',
    ...partial,
  };
}

describe('describeReadingChange', () => {
  it('subida con el importe en euros', () => {
    const change = describeReadingChange(reading({}), 349.99);
    expect(change.kind).toBe('up');
    expect(change.delta).toBe(392.17);
    expect(change.label).toMatch(/^subida de 392,17\s€$/);
    expect(change.dot).toBe('warn');
  });

  it('bajada', () => {
    const change = describeReadingChange(reading({price: 600, previous_price: 649}), 500);
    expect(change.kind).toBe('down');
    expect(change.delta).toBe(-49);
    expect(change.label).toMatch(/^bajada de 49,00\s€$/);
  });

  it('formato de España: sin punto en cuatro cifras, con punto desde cinco', () => {
    const small = describeReadingChange(reading({price: 3979.99, previous_price: 9744.15}), 3859);
    expect(small.label).toMatch(/^bajada de 5764,16\s€$/);
    const big = describeReadingChange(reading({price: 3979.99, previous_price: 15744.15}), 3859);
    expect(big.label).toMatch(/^bajada de 11\.764,16\s€$/);
  });

  it('mínimo histórico si coincide con stats.lowest_price', () => {
    const change = describeReadingChange(reading({price: 518.89, previous_price: 629}), 518.89);
    expect(change.kind).toBe('lowest');
    expect(change.label).toBe('mínimo histórico');
    expect(change.delta).toBe(-110.11);
  });

  it('si ya estaba en el mínimo, dice que sigue en él', () => {
    const change = describeReadingChange(reading({price: 518.89, previous_price: 518.89}), 518.89);
    expect(change.kind).toBe('lowest');
    expect(change.label).toBe('sigue en su mínimo histórico');
  });

  it('sin stock manda aunque haya precio anterior', () => {
    expect(describeReadingChange(reading({status: 'unavailable', price: null, previous_price: 649}), 649)).toMatchObject({
      kind: 'unavailable',
      label: 'sin stock',
    });
  });

  it('una lectura fallida es un error de lectura', () => {
    expect(describeReadingChange(reading({status: 'error', price: null, error_message: 'Bloqueado'}))).toMatchObject({
      kind: 'error',
      dot: 'err',
    });
  });

  it('la primera lectura no tiene con qué compararse (ni siquiera con el mínimo)', () => {
    expect(describeReadingChange(reading({previous_price: null}), 822.12).kind).toBe('first');
  });

  it('sin cambios por debajo de medio céntimo', () => {
    expect(describeReadingChange(reading({price: 649, previous_price: 649.004}), 500).kind).toBe('same');
  });

  it('sin mínimo conocido compara solo con la anterior', () => {
    expect(describeReadingChange(reading({price: 500, previous_price: 600}), null).kind).toBe('down');
  });
});

describe('isAtTarget', () => {
  it('igual o por debajo del objetivo', () => {
    expect(isAtTarget({price: 350, desired_price: 350})).toBe(true);
    expect(isAtTarget({price: 349, desired_price: 350})).toBe(true);
    expect(isAtTarget({price: 351, desired_price: 350})).toBe(false);
    expect(isAtTarget({price: null, desired_price: 350})).toBe(false);
  });
});
