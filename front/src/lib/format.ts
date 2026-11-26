// Formatos de España para importes y fechas.

const LOCALE = 'es-ES';
const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatPrice(value: number | null | undefined, currency = 'EUR'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {style: 'currency', currency});
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}

const percentFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

/** `0.052` → «5,2 %». */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}

export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {day: 'numeric', month: 'short', year: 'numeric'});
const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {day: 'numeric', month: 'short'});
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** «26 nov 2026». */
export function formatDate(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? dateFormatter.format(date) : '—';
}

/** «26 nov» (ejes de la gráfica). */
export function formatShortDate(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : shortDateFormatter.format(date);
}

/** «26 nov 2026, 11:00». */
export function formatDateTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

/** Plural sencillo: `plural(2, 'producto', 'productos')` → «2 productos». */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const clockFormatter = new Intl.DateTimeFormat(LOCALE, {hour: '2-digit', minute: '2-digit'});

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Hora compacta para listas: «20:21» hoy, «ayer 20:21», «26 nov» este año o «26 nov 2025». */
export function formatClock(iso: string | null | undefined, now: Date = new Date()): string {
  const date = toDate(iso);
  if (!date) return '—';
  if (sameDay(date, now)) return clockFormatter.format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'ayer ' + clockFormatter.format(date);
  if (date.getFullYear() === now.getFullYear()) return shortDateFormatter.format(date);
  return dateFormatter.format(date);
}

/** Duración legible: «4 h 30 min», «12 min», «menos de 1 min». */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60000) return 'menos de 1 min';
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours ? days + ' d ' + hours + ' h' : days + ' d';
  if (hours > 0) return minutes ? hours + ' h ' + minutes + ' min' : hours + ' h';
  return minutes + ' min';
}

const plainFormatter = new Intl.NumberFormat(LOCALE, {minimumFractionDigits: 2, maximumFractionDigits: 2});

/** Importe sin símbolo para textos en monoespaciada: «3.500,00». */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return plainFormatter.format(value);
}
