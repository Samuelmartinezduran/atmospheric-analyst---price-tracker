import type {Alert} from '../api/types';

// La insignia de «Alertas» cuenta las alertas nuevas desde la última visita a esa
// página. Es una comodidad de este navegador: si falla el almacenamiento, no pasa nada.

const STORAGE_KEY = 'alertsSeenAt';

export function getAlertsSeenAt(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function markAlertsSeen(now = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // Sin almacenamiento, la insignia se reinicia al recargar.
  }
}

export function countNewAlerts(alerts: Alert[], seenAt = getAlertsSeenAt()): number {
  return alerts.filter((alert) => new Date(alert.triggered_at).getTime() > seenAt).length;
}

/** Evento que avisa a la barra lateral de que se han visto las alertas (misma pestaña). */
export const ALERTS_SEEN_EVENT = 'alerts-seen';

export function notifyAlertsSeen(): void {
  window.dispatchEvent(new Event(ALERTS_SEEN_EVENT));
}
