import type {Product, Reading} from '../api/types';
import {formatDateTime, formatPrice} from '../lib/format';
import {formatDelta} from '../lib/productStatus';
import {describeReadingChange, isAtTarget} from '../lib/readings';
import {productHref} from './ProductCard';
import {ProductPhoto} from './ProductPhoto';

function statusPill(reading: Reading): [string, string] {
  if (reading.status === 'error') return ['err', 'Error'];
  if (reading.status === 'unavailable') return ['gray', 'Sin stock'];
  if (isAtTarget(reading)) return ['ok', 'A tu precio'];
  return ['', 'Con precio'];
}

/**
 * Lecturas como una lista de despliegues: estado, precio, cambio en color y fecha.
 * Con `showProduct` añade la columna del producto (feed de /lecturas).
 */
export function ReadingsTable({
  readings,
  products,
  showProduct,
  caption,
}: {
  readings: Reading[];
  products?: Product[];
  showProduct?: boolean;
  caption: string;
}) {
  const byId = new Map(products?.map((p) => [p.id, p]));
  return (
    <div className="table-wrap">
      <table className={`t rt${showProduct ? ' rt-p' : ''}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Estado</th>
            {showProduct && <th scope="col">Producto</th>}
            <th scope="col" className="r">
              Precio
            </th>
            <th scope="col">Cambio</th>
            <th scope="col" className="r">
              Fecha
            </th>
          </tr>
        </thead>
        <tbody>
          {readings.map((reading) => {
            const product = byId.get(reading.product_id);
            const change = describeReadingChange(reading, product?.stats?.lowest_price);
            const [tone, label] = statusPill(reading);
            const colored = change.delta !== null && change.delta !== 0 && change.kind !== 'first';
            return (
              <tr key={reading.id}>
                <td className="nowrap c-st">
                  <span className={`pill ${tone}`}>
                    <span className="txt">{label}</span>
                  </span>
                </td>
                {showProduct && (
                  <td className="name c-pd">
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, minWidth: 0}}>
                      <ProductPhoto src={product?.image_url} title={reading.product_title} width={28} height={28} className="thumb" />
                      <a href={productHref(reading.product_id)}>{reading.product_title || 'Producto sin nombre'}</a>
                    </div>
                  </td>
                )}
                <td className="r nowrap c-pr num" style={{fontWeight: 600}}>
                  {reading.price !== null ? formatPrice(reading.price) : <span className="muted">—</span>}
                </td>
                <td className={`c-ch ${reading.error_message ? 'err-msg' : 'muted'}`}>
                  {colored ? (
                    <span className={`delta ${change.delta! < 0 ? 'down' : 'up'}`}>{formatDelta(change.delta!)}</span>
                  ) : (
                    change.label
                  )}
                  {colored && change.kind === 'lowest' && <span className="pill ok plain" style={{marginLeft: 8}}>Mínimo histórico</span>}
                  {reading.error_message && (
                    <>
                      {': '}
                      <span title={reading.error_message}>{reading.error_message}</span>
                    </>
                  )}
                </td>
                <td className="r nowrap c-dt">
                  <time className="time" dateTime={reading.checked_at}>
                    {formatDateTime(reading.checked_at)}
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
