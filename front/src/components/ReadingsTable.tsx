import type {Product, Reading} from '../api/types';
import {formatDateTime, formatPrice} from '../lib/format';
import {describeReadingChange} from '../lib/readings';
import {productHref} from './ProductCard';
import {Dot} from './ui';

const STATUS_TEXT: Record<string, string> = {ok: 'Con precio', unavailable: 'Sin stock', error: 'Error'};

/**
 * Lecturas como una lista de despliegues: punto de estado, precio, cambio y fecha.
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
  const lowest = new Map(products?.map((p) => [p.id, p.stats?.lowest_price ?? null]));
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
            const change = describeReadingChange(reading, lowest.get(reading.product_id));
            const statusDot = reading.status === 'error' ? 'err' : reading.status === 'unavailable' ? '' : change.dot;
            return (
              <tr key={reading.id}>
                <td className="nowrap c-st">
                  <span className="status">
                    <Dot tone={statusDot} />
                    <span className="txt">{STATUS_TEXT[reading.status] ?? reading.status}</span>
                  </span>
                </td>
                {showProduct && (
                  <td className="name c-pd">
                    <a href={productHref(reading.product_id)}>{reading.product_title || 'Producto sin nombre'}</a>
                  </td>
                )}
                <td className="r nowrap c-pr" style={{fontWeight: 600}}>
                  {reading.price !== null ? formatPrice(reading.price) : <span className="muted">—</span>}
                </td>
                <td className={`c-ch ${reading.error_message ? 'err-msg' : 'muted'}`}>
                  {change.label}
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
