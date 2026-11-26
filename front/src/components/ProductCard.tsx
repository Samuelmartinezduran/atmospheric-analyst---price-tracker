import {useEffect, useId, useRef, useState} from 'react';
import type {Product} from '../api/types';
import {formatDateTime, formatPrice} from '../lib/format';
import {
  STATUS_LABEL,
  STATUS_TONE,
  formatDelta,
  getUiStatus,
  isAtLowest,
  priceDelta,
  productName,
  safeExternalUrl,
  storeName,
} from '../lib/productStatus';
import {formatRelative} from '../lib/relativeTime';
import {IconExternal, IconMore, IconRefresh} from './icons';
import {ProductPhoto} from './ProductPhoto';
import {RangeMeter} from './RangeMeter';
import {Sparkline, sparkPoints} from './Sparkline';
import {Spinner} from './ui';

export const productHref = (id: number) => `/producto?id=${id}`;

export function StatusPill({product, checking}: {product: Product; checking?: boolean}) {
  if (checking) {
    return (
      <span className="pill accent plain">
        <Spinner />
        Comprobando…
      </span>
    );
  }
  const status = getUiStatus(product);
  return <span className={`pill ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Delta({value}: {value: number | null}) {
  if (value === null) return null;
  return (
    <span className={`delta ${value < 0 ? 'down' : 'up'}`}>
      {formatDelta(value)}
      <span className="sr-only">{value < 0 ? ' de bajada' : ' de subida'} desde la lectura anterior</span>
    </span>
  );
}

function CardMenu({product, onCheck, checking}: {product: Product; onCheck: () => void; checking: boolean}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const external = safeExternalUrl(product.url);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  return (
    <div
      className="more"
      ref={wrap}
      onKeyDown={(event) => {
        if (!open) return;
        const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        } else if (event.key === 'Tab') {
          setOpen(false);
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Acciones de ${productName(product)}`}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMore />
      </button>
      {open && (
        <div className="popover" role="menu" id={menuId}>
          {external && (
            <a role="menuitem" href={external} target="_blank" rel="noopener noreferrer" onClick={() => close(false)}>
              <IconExternal />
              Abrir en la tienda
            </a>
          )}
          <button
            role="menuitem"
            type="button"
            disabled={checking}
            onClick={() => {
              close();
              onCheck();
            }}
          >
            <IconRefresh />
            Comprobar ahora
          </button>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  product: Product;
  checking: boolean;
  onCheck: () => void;
}

export function ProductCard({product, checking, onCheck}: CardProps) {
  const name = productName(product);
  const hasPrice = product.last_status === 'ok' && product.last_price !== null;
  const points = sparkPoints(product.spark);
  return (
    <article className="card" aria-busy={checking}>
      <div className="pv">
        <ProductPhoto src={product.image_url} title={product.title} width={320} height={200} />
        <StatusPill product={product} checking={checking} />
        <span className="store-tag">{storeName(product.store)}</span>
      </div>
      <div className="card-b">
        <a className="t" href={productHref(product.id)} title={name}>
          {name}
        </a>
        <div>
          <div className="pricerow">
            {hasPrice ? (
              <strong>{formatPrice(product.last_price)}</strong>
            ) : (
              <strong className="none">{product.last_status === 'unavailable' ? 'Sin stock' : 'Sin precio'}</strong>
            )}
            <Delta value={priceDelta(product)} />
          </div>
          <p className="target-line">
            Objetivo <b>{formatPrice(product.desired_price)}</b>
            {!hasPrice && product.previous_price !== null && <> · último precio {formatPrice(product.previous_price)}</>}
          </p>
        </div>
        <RangeMeter product={product} />
        <Sparkline points={points} target={product.desired_price} />
      </div>
      <div className="card-f">
        <time dateTime={product.last_checked_at ?? undefined} title={formatDateTime(product.last_checked_at)}>
          {product.last_checked_at ? formatRelative(product.last_checked_at) : 'Aún sin leer'}
        </time>
        {isAtLowest(product) && (product.stats?.checks_count ?? 0) > 1 && (
          <span className="pill ok plain">Mínimo histórico</span>
        )}
        <CardMenu product={product} onCheck={onCheck} checking={checking} />
      </div>
    </article>
  );
}
