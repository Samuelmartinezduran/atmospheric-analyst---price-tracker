import {api} from './client';
import type {Store} from './types';

export function listStores(signal?: AbortSignal) {
  return api<Store[]>('/api/stores', {signal});
}
