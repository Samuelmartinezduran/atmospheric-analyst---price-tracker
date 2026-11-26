import {api, request} from './client';
import type {CheckSummary, HistoryPoint, Product} from './types';

const BASE = '/api/products';

export function listProducts(signal?: AbortSignal) {
  return api<Product[]>(BASE, {signal});
}

/**
 * Añade un producto. El backend responde 201 si es nuevo y 200 si ya lo seguías
 * (en ese caso solo actualiza el precio objetivo).
 */
export async function createProduct(url: string, desiredPrice: number) {
  const {data, status} = await request<Product>(BASE, {
    method: 'POST',
    body: {url, desired_price: desiredPrice},
  });
  return {product: data, created: status === 201};
}

export function updateProduct(id: number, changes: {desired_price?: number}) {
  return api<Product>(`${BASE}/${id}`, {method: 'PATCH', body: changes});
}

export function deleteProduct(id: number) {
  return api<void>(`${BASE}/${id}`, {method: 'DELETE'});
}

export function getHistory(id: number, signal?: AbortSignal) {
  return api<HistoryPoint[]>(`${BASE}/${id}/history`, {signal});
}

/** 409 si ese producto ya se está comprobando. */
export function checkProduct(id: number) {
  return api<CheckSummary>(`${BASE}/${id}/check`, {method: 'POST'});
}

export function checkAllProducts() {
  return api<CheckSummary>('/api/jobs/check-now', {method: 'POST'});
}
