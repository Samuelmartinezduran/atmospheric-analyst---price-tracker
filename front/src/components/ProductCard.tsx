import {Link} from 'react-router';
import {AlertCircle, PackageX, RefreshCw, TrendingDown, TrendingUp} from 'lucide-react';
import type {Product} from '../api/types';
import {formatPercent, formatPrice, formatRelative} from '../lib/format';
import {getUiStatus, priceChange, productName} from '../lib/productStatus';
import {cn} from '../lib/utils';
import {ProductImage} from './ProductImage';
import {StatusBadge} from './StatusBadge';

function TrendBadge({change}: {change: number}) {
  const down = change < 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
        down
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      )}
    >
      {down ? <TrendingDown size={10} aria-hidden="true" /> : <TrendingUp size={10} aria-hidden="true" />}
      <span className="sr-only">{down ? 'Ha bajado' : 'Ha subido'}</span>
      {formatPercent(Math.abs(change))}
    </span>
  );
}

interface ProductCardProps {
  product: Product;
  storeLabel: string;
  isSelected: boolean;
}

export function ProductCard({product, storeLabel, isSelected}: ProductCardProps) {
  const status = getUiStatus(product);
  const change = priceChange(product);
  const name = productName(product);

  return (
    <Link
      to={`/productos/${product.id}`}
      data-product-id={product.id}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'group block rounded-2xl border-b-4 bg-surface-container-lowest p-4 shadow-sm transition-all sm:p-5',
        isSelected ? 'border-primary shadow-md ring-2 ring-primary/15' : 'border-transparent hover:border-primary/50',
        status === 'error' && !isSelected && 'hover:border-error',
      )}
    >
      <div className="flex gap-4">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container-low p-2 sm:h-24 sm:w-24">
          {status === 'pending' ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-outline-variant text-outline-variant">
              <RefreshCw size={22} className="animate-spin-slow" aria-hidden="true" />
            </div>
          ) : (
            <ProductImage src={product.image_url} muted={status === 'error' || status === 'unavailable'} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <span className="truncate rounded bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-on-surface-variant">
              {storeLabel}
            </span>
            <StatusBadge status={status} />
          </div>

          <h3
            className="mb-2 line-clamp-2 font-manrope font-bold leading-tight text-on-surface transition-colors group-hover:text-primary"
            title={name}
          >
            {name}
          </h3>

          {status === 'error' ? (
            <p className="flex items-center gap-1.5 text-xs font-bold text-error">
              <AlertCircle size={14} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{product.last_error || 'No se ha podido leer el precio'}</span>
            </p>
          ) : status === 'pending' ? (
            <p className="text-xs italic text-on-surface-variant">Esperando la primera comprobación…</p>
          ) : status === 'unavailable' ? (
            <p className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
              <PackageX size={14} aria-hidden="true" />
              Sin stock ahora mismo
            </p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={cn('text-xl font-extrabold tabular-nums', status === 'below' && 'text-tertiary')}>
                {formatPrice(product.last_price, product.currency)}
              </span>
              {change !== null && <TrendBadge change={change} />}
              <span className="text-xs text-on-surface-variant">
                objetivo {formatPrice(product.desired_price, product.currency)}
              </span>
            </div>
          )}

          {product.last_checked_at && (
            <p className="mt-1 text-[11px] text-on-surface-variant">Comprobado {formatRelative(product.last_checked_at)}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
