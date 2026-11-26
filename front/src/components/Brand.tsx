import {LineChart} from 'lucide-react';
import {cn} from '../lib/utils';

export function Brand({compact, className}: {compact?: boolean; className?: string}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl primary-gradient text-white shadow-lg',
          compact ? 'h-9 w-9' : 'h-10 w-10',
        )}
      >
        <LineChart size={compact ? 20 : 24} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="font-manrope text-lg leading-tight font-extrabold tracking-tight text-primary">Atmospheric Analyst</p>
        {!compact && (
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Seguimiento de precios</p>
        )}
      </div>
    </div>
  );
}
