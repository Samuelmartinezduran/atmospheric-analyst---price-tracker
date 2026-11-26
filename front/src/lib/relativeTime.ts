// Tiempo relativo («hace 5 minutos»). Aparte de format.ts porque el panel no lo usa.
import {formatDate, toDate} from './format';

const LOCALE = 'es-ES';
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
  return formatDate(iso);
}
