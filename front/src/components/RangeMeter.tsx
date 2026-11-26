import type {Product} from '../api/types';
import {formatPrice} from '../lib/format';
import {computeRange} from '../lib/range';

/**
 * Medidor compacto de la tarjeta: pista entre el mínimo y el máximo históricos, marca del
 * objetivo y punto del precio actual (verde si está a tu precio). Funciona con un solo punto.
 */
export function RangeMeter({product}: {product: Product}) {
  const current = product.last_status === 'ok' ? product.last_price : null;
  const model = computeRange({
    min: product.stats?.lowest_price,
    max: product.stats?.highest_price,
    target: product.desired_price,
    current,
  });
  const description =
    model.histMin === null
      ? `Sin precios todavía. Objetivo ${formatPrice(product.desired_price)}.`
      : `Mínimo ${formatPrice(model.histMin)}, máximo ${formatPrice(model.histMax)}, objetivo ${formatPrice(product.desired_price)}${current !== null ? `, ahora ${formatPrice(current)}` : ''}.`;
  return (
    <div className="meter" role="img" aria-label={`Rango de precios. ${description}`}>
      <div className="meter-track">
        {model.histMin !== null && (
          <span className="meter-hist" style={{left: `${model.histFrom}%`, width: `${Math.max(model.histTo - model.histFrom, 0)}%`}} />
        )}
        <span className="meter-target" style={{left: `${model.targetPos}%`}} title={`Objetivo ${formatPrice(product.desired_price)}`} />
        {model.currentPos !== null && (
          <span className={`meter-now${model.atTarget ? ' ok' : ''}`} style={{left: `${model.currentPos}%`}} />
        )}
      </div>
      <div className="meter-labels" aria-hidden="true">
        {model.histMin === null ? (
          <span>Aún sin precios</span>
        ) : model.single ? (
          <span>
            Único precio <b>{formatPrice(model.histMin)}</b>
          </span>
        ) : (
          <>
            <span>
              mín. <b>{formatPrice(model.histMin)}</b>
            </span>
            <span>
              máx. <b>{formatPrice(model.histMax)}</b>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
