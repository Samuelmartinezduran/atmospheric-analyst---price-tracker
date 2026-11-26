import type {LucideIcon} from 'lucide-react';
import {cn} from '../lib/utils';

interface KPICardProps {
  label: string;
  value: string | number;
  subtext?: string;
  subtextColor?: string;
  icon: LucideIcon;
  variant?: 'primary' | 'tertiary';
}

/** Tarjeta de cifra. En contenedores estrechos (móvil) se compacta: sin icono ni subtítulo. */
export function KPICard({label, value, subtext, subtextColor, icon: Icon, variant = 'primary'}: KPICardProps) {
  return (
    <div className="rounded-xl border-b-4 border-transparent bg-surface-container-lowest p-3 shadow-sm transition-colors duration-300 hover:border-primary @xl:p-6">
      <div className="mb-2 flex items-start justify-between gap-2 @xl:mb-4 @xl:items-center">
        <span className="text-[10px] leading-tight font-bold uppercase tracking-wider text-on-surface-variant @xl:text-xs">
          {label}
        </span>
        <div
          className={cn(
            'hidden h-10 w-10 shrink-0 items-center justify-center rounded-full @xl:flex',
            variant === 'primary' ? 'bg-primary/10 text-primary' : 'bg-tertiary-container/20 text-tertiary-container',
          )}
        >
          <Icon size={20} aria-hidden="true" />
        </div>
      </div>
      <div className="font-manrope text-2xl font-extrabold text-on-surface tabular-nums @xl:text-4xl">{value}</div>
      {subtext && (
        <div className={cn('mt-2 hidden text-xs font-bold @xl:block', subtextColor || 'text-on-surface-variant')}>{subtext}</div>
      )}
    </div>
  );
}
