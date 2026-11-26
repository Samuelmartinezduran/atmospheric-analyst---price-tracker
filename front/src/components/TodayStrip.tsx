import type {Product} from '../api/types';
import {formatPercent, formatPrice} from '../lib/format';
import {safeExternalUrl} from '../lib/productStatus';
import {computeToday, shortName} from '../lib/today';
import {IconTarget} from './icons';
import {productHref} from './ProductCard';
import {ProductPhoto} from './ProductPhoto';

/** Franja «Hoy» encima de la rejilla: el mejor a tu precio o el que más cerca está. */
export function TodayStrip({products}: {products: Product[]}) {
  const model = computeToday(products);
  if (model.kind === 'none') return null;

  if (model.kind === 'deal') {
    const {product, savings, others} = model;
    const external = safeExternalUrl(product.url);
    return (
      <section className="today deal" aria-label="Hoy">
        <ProductPhoto src={product.image_url} title={product.title} width={56} height={56} className="thumb lg" eager />
        <div className="txt">
          <span className="eyebrow">Hoy · a tu precio</span>
          <p>
            El <b>{shortName(product.title)}</b> está a tu precio: <b>{formatPrice(product.last_price)}</b>
            {savings > 0 ? (
              <>
                , <b>{formatPrice(savings)}</b> por debajo de tu objetivo
              </>
            ) : (
              ', justo en tu objetivo'
            )}
            {others > 0 && ` · y ${others} más`}.
          </p>
        </div>
        <div className="acts">
          {external && (
            <a className="btn sm" href={external} target="_blank" rel="noopener noreferrer">
              Ir a la tienda<span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          )}
          <a className="btn sec sm" href={productHref(product.id)}>
            Ver historial
          </a>
        </div>
      </section>
    );
  }

  const {product, gap, ratio} = model;
  return (
    <section className="today" aria-label="Hoy">
      <span className="glyph" aria-hidden="true">
        <IconTarget />
      </span>
      <div className="txt">
        <span className="eyebrow">Hoy</span>
        <p>
          Ninguno a tu precio todavía. El más cerca:{' '}
          <a className="text-link" href={productHref(product.id)}>
            {shortName(product.title)}
          </a>
          , a <b>{formatPrice(gap)}</b> ({formatPercent(ratio)}) de tu objetivo.
        </p>
      </div>
    </section>
  );
}
