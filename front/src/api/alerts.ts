import {api} from './client';
import type {Alert} from './types';

export function listAlerts(signal?: AbortSignal) {
  return api<Alert[]>('/api/alerts', {signal});
}
