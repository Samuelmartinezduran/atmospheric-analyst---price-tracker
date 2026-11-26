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

function toDate(iso: string | null | undefined): Date | null {
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

const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, {numeric: 'auto'});
const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

/** «hace 5 minutos», «ayer». */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  const date = toDate(iso);
  if (!date) return '—';
  let delta = (date.getTime() - now.getTime()) / 1000;
  if (Math.abs(delta) < 45) return 'hace un momento';
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(delta) < size) return relativeFormatter.format(Math.round(delta), unit);
    delta /= size;
  }
  return dateFormatter.format(date);
}

/** Plural sencillo: `plural(2, 'producto', 'productos')` → «2 productos». */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Convierte lo que escribe el usuario («12,50», «1.099,95», «600») en número. */
export function parsePriceInput(raw: string): number | null {
  let text = raw.trim().replace(/[\s€]/g, '');
  if (!text) return null;
  if (text.includes(',')) {
    // Formato español: el punto separa miles y la coma, decimales.
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // «1.099» sin coma: punto de miles, igual que en el texto de las tiendas (D6).
    text = text.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** Precio con dos decimales y coma, para rellenar un campo de texto. */
export function priceToInput(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
