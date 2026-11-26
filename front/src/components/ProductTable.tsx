import type {Product} from '../api/types';
import {formatDateTime, formatPrice} from '../lib/format';
import {priceDelta, productName, storeName} from '../lib/productStatus';
import {formatRelative} from '../lib/relativeTime';
import {Delta, StatusPill, productHref} from './ProductCard';
import {ProductPhoto} from './ProductPhoto';
import {Sparkline, sparkPoints} from './Sparkline';

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
            <th scope="col" className="hide-sm" style={{width: 130}}>
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
  const name = productName(product);
  const points = sparkPoints(product.spark);
  return (
    <tr>
      <td className="name">
        <div style={{display: 'flex', gap: 10, alignItems: 'center', minWidth: 0}}>
          <ProductPhoto src={product.image_url} title={product.title} width={40} height={40} className="thumb" />
          <div style={{minWidth: 0}}>
            <a href={productHref(product.id)} title={name}>
              {name}
            </a>
            <span className="sub">{storeName(product.store)}</span>
          </div>
        </div>
      </td>
      <td className="r nowrap">
        <span style={{fontWeight: 600}}>{product.last_status === 'ok' ? formatPrice(product.last_price) : '—'}</span>
        <br />
        <Delta value={priceDelta(product)} />
      </td>
      <td className="r nowrap muted num">{formatPrice(product.desired_price)}</td>
      <td className="hide-sm" style={{width: 130}}>
        {points.length >= 3 ? <Sparkline points={points} target={product.desired_price} /> : <span className="muted">—</span>}
      </td>
      <td className="nowrap">
        <StatusPill product={product} checking={checking} />
      </td>
      <td className="r nowrap">
        <time className="time" dateTime={product.last_checked_at ?? undefined} title={formatDateTime(product.last_checked_at)}>
          {product.last_checked_at ? formatRelative(product.last_checked_at) : 'sin leer'}
        </time>
      </td>
    </tr>
  );
}
