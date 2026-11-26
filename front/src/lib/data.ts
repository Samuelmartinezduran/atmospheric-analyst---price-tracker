/** Claves de la caché y ganchos de datos compartidos entre páginas. */
import {listAlerts} from '../api/alerts';
import {getSummary, listReadings} from '../api/overview';
import {getHistory, listProducts} from '../api/products';
import type {Alert, HistoryPoint, Product, Reading, Summary} from '../api/types';
import {invalidate, useResource} from './cache';

export const KEYS = {
  products: 'products',
  summary: 'summary',
  alerts: 'alerts',
  stores: 'stores',
  sessions: 'sessions',
  admin: 'admin',
  history: (id: number) => `history:${id}`,
  readings: (limit: number, productId?: number) => `readings:${productId ?? 'all'}:${limit}`,
};

export const useProducts = (enabled = true) =>
  useResource<Product[]>(KEYS.products, () => listProducts(), {enabled, freshFor: 5_000});

export const useSummary = (enabled = true) =>
  useResource<Summary>(KEYS.summary, () => getSummary(), {enabled, freshFor: 5_000});

export const useAlerts = (enabled = true) =>
  useResource<Alert[]>(KEYS.alerts, () => listAlerts(), {enabled, freshFor: 15_000});

export const useHistory = (id: number | null, enabled = true) =>
  useResource<HistoryPoint[]>(id === null ? null : KEYS.history(id), () => getHistory(id!), {
    enabled,
    freshFor: 30_000,
  });

export const useReadings = (limit: number, productId?: number, enabled = true) =>
  useResource<Reading[]>(KEYS.readings(limit, productId), () => listReadings({limit, productId}), {
    enabled,
    freshFor: 5_000,
  });

/**
 * Tras comprobar, añadir, editar o borrar: lo que depende de los precios queda caducado; lo
 * que está en pantalla (también la insignia de alertas de la barra lateral) se pide ya.
 */
export function refreshAfterChange(productId?: number): void {
  invalidate('readings', 'alerts', 'summary', 'products', 'admin');
  if (productId !== undefined) invalidate(KEYS.history(productId));
}
