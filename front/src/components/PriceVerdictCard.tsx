import {BadgeCheck, CircleHelp, Minus, Sparkles, TrendingUp} from 'lucide-react';
import type {Product} from '../api/types';
import {formatPercent, formatPrice} from '../lib/format';
import {getPriceVerdict, type VerdictKind} from '../lib/priceVerdict';
import {cn} from '../lib/utils';

const KIND_STYLES: Record<VerdictKind, {icon: typeof Sparkles; classes: string}> = {
  lowest: {icon: Sparkles, classes: 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300'},
  good: {icon: BadgeCheck, classes: 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300'},
  normal: {icon: Minus, classes: 'bg-surface-container-high text-on-surface'},
  high: {icon: TrendingUp, classes: 'bg-error/10 text-error'},
  unknown: {icon: CircleHelp, classes: 'bg-surface-container-high text-on-surface-variant'},
};

/** Indicador de «¿es buen precio?» frente al mínimo histórico y la media de 30 días. */
export function PriceVerdictCard({product}: {product: Product}) {
  const verdict = getPriceVerdict(product);
  const {icon: Icon, classes} = KIND_STYLES[verdict.kind];

  const details: string[] = [];
  if (verdict.kind !== 'unknown') {
    if (verdict.vsLowest !== null) {
      details.push(
        verdict.vsLowest <= 0
          ? 'Igual o por debajo del mínimo registrado.'
          : `${formatPrice(verdict.vsLowest, product.currency)} por encima del mínimo.`,
      );
    }
    if (verdict.vsAverage !== null) {
      const pct = formatPercent(Math.abs(verdict.vsAverage));
      details.push(
        Math.abs(verdict.vsAverage) < 0.005
          ? 'En la media de los últimos 30 días.'
          : `${pct} ${verdict.vsAverage < 0 ? 'por debajo' : 'por encima'} de la media de 30 días.`,
      );
    }
  } else if (product.last_price !== null) {
    details.push('Hacen falta unas cuantas comprobaciones para compararlo con su historial.');
  }

  return (
    <div className={cn('flex gap-3 rounded-2xl px-4 py-3', classes)}>
      <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-extrabold">
          <span className="sr-only">¿Es buen precio? </span>
          {verdict.title}
        </p>
        {details.length > 0 && <p className="mt-0.5 text-xs font-medium opacity-90">{details.join(' ')}</p>}
      </div>
    </div>
  );
}
