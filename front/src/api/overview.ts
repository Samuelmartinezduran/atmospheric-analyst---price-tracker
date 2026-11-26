import {api} from './client';
import type {Reading, Summary} from './types';

export function getSummary(signal?: AbortSignal) {
  return api<Summary>('/api/summary', {signal});
}

/** Lecturas más recientes primero. `limit` de 1 a 200; `productId` opcional (404 si no es tuyo). */
export function listReadings(options: {limit?: number; productId?: number} = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.productId !== undefined) params.set('product_id', String(options.productId));
  const query = params.toString();
  return api<Reading[]>(`/api/readings${query ? `?${query}` : ''}`, {signal});
}
