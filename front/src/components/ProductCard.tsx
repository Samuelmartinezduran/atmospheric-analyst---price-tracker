import {useEffect, useId, useRef, useState} from 'react';
import type {Product} from '../api/types';
import {useHistory} from '../lib/data';
import {formatAmount, formatClock, formatDateTime, formatPrice} from '../lib/format';
import {
  STATUS_DOT,
  STATUS_LABEL,
  getUiStatus,
  productDomain,
  productName,
  safeExternalUrl,
  storeInitials,
} from '../lib/productStatus';
import {IconExternal, IconMore, IconRefresh} from './icons';
import {Sparkline} from './Sparkline';
import {Dot, Spinner} from './ui';

export const productHref = (id: number) => `/producto?id=${id}`;

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
  const history = useHistory(product.id).data;
  const status = getUiStatus(product);
  const name = productName(product);
  const hasPrice = product.last_status === 'ok' && product.last_price !== null;
  return (
    <article className="card" aria-busy={checking}>
      <div className="card-h">
        <span className="ico" aria-hidden="true">
          {storeInitials(product.store)}
        </span>
        <div style={{minWidth: 0}}>
          <a className="t" href={productHref(product.id)} title={name}>
            {name}
          </a>
          <small>{productDomain(product.url)}</small>
        </div>
        <CardMenu product={product} onCheck={onCheck} checking={checking} />
      </div>
      <div className="price">
        <strong>{hasPrice ? formatPrice(product.last_price) : '—'}</strong>
        <span>objetivo {formatAmount(product.desired_price)}</span>
      </div>
      <Sparkline history={history} target={product.desired_price} />
      <div className="card-f">
        {checking ? <Spinner /> : <Dot tone={STATUS_DOT[status]} />}
        <span>{checking ? 'Comprobando…' : STATUS_LABEL[status]}</span>
        <time className="time" dateTime={product.last_checked_at ?? undefined} title={formatDateTime(product.last_checked_at)}>
          {product.last_checked_at ? formatClock(product.last_checked_at) : 'sin leer'}
        </time>
      </div>
    </article>
  );
}

