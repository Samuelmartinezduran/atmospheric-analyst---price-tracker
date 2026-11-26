import {cn} from '../lib/utils';
import {STATUS_LABEL, type UiStatus} from '../lib/productStatus';

const STATUS_CLASSES: Record<UiStatus, string> = {
  watching: 'bg-primary text-white',
  below: 'bg-tertiary-container text-on-tertiary-container',
  error: 'bg-error text-on-error',
  unavailable: 'bg-surface-container-highest text-on-surface',
  pending: 'bg-surface-container-highest text-on-surface-variant',
};

export function StatusBadge({status, className}: {status: UiStatus; className?: string}) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap', STATUS_CLASSES[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}
