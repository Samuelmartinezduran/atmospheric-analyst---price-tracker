import type {Product} from '../api/types';
import {useHistory} from '../lib/data';
import {formatAmount, formatClock, formatDateTime, formatPrice} from '../lib/format';
import {STATUS_DOT, STATUS_LABEL, getUiStatus, productDomain, productName, storeInitials} from '../lib/productStatus';
import {productHref} from './ProductCard';
import {Sparkline} from './Sparkline';
import {Dot, Spinner} from './ui';

/** Vista de lista: una tabla con las mismas columnas que la tarjeta. */
export function ProductTable({products, isChecking}: {products: Product[]; isChecking: (id: number) => boolean}) {
  return (
    <div className="table-wrap">
      <table className="t">
        <caption className="sr-only">Productos que sigues</caption>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col" className="r">
              Precio
            </th>
            <th scope="col" className="r">
              Objetivo
            </th>
            <th scope="col" className="hide-sm" style={{width: 140}}>
              Tendencia
            </th>
            <th scope="col">Estado</th>
            <th scope="col" className="r">
              Última lectura
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <ProductRow key={product.id} product={product} checking={isChecking(product.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductRow({product, checking}: {product: Product; checking: boolean}) {
  const history = useHistory(product.id).data;
  const status = getUiStatus(product);
  const name = productName(product);
  return (
    <tr>
      <td className="name">
        <div style={{display: 'flex', gap: 10, alignItems: 'center', minWidth: 0}}>
          <span className="ico" aria-hidden="true" style={{width: 28, height: 28, fontSize: 11}}>
            {storeInitials(product.store)}
          </span>
          <div style={{minWidth: 0}}>
            <a href={productHref(product.id)} title={name}>
              {name}
            </a>
            <span className="sub">{productDomain(product.url)}</span>
          </div>
        </div>
      </td>
      <td className="r nowrap" style={{fontWeight: 600}}>
        {product.last_status === 'ok' ? formatPrice(product.last_price) : '—'}
      </td>
      <td className="r nowrap mono muted">{formatAmount(product.desired_price)}</td>
      <td className="hide-sm" style={{width: 140}}>
        <Sparkline history={history} target={product.desired_price} />
      </td>
      <td className="nowrap">
        <span className="status">
          {checking ? <Spinner /> : <Dot tone={STATUS_DOT[status]} />}
          {checking ? 'Comprobando…' : STATUS_LABEL[status]}
        </span>
      </td>
      <td className="r">
        <time className="time" dateTime={product.last_checked_at ?? undefined} title={formatDateTime(product.last_checked_at)}>
          {product.last_checked_at ? formatClock(product.last_checked_at) : 'sin leer'}
        </time>
      </td>
    </tr>
  );
}
