import {useEffect, useState, type SubmitEvent} from 'react';
import {getErrorMessage} from '../api/client';
import {createProduct, updateProduct} from '../api/products';
import type {Product} from '../api/types';
import {mutate} from '../lib/cache';
import {listStores} from '../api/stores';
import type {Store} from '../api/types';
import {useResource} from '../lib/cache';
import {KEYS, refreshAfterChange} from '../lib/data';
import {formatPrice} from '../lib/format';
import {parsePriceInput, priceToInput} from '../lib/priceInput';
import {detectStore, productName} from '../lib/productStatus';
import {toast} from '../lib/toast';
import {Field, Notice} from './forms';
import {Spinner} from './ui';
import {Dialog} from './dialog';

/** Las tiendas casi nunca cambian: se piden una vez por visita. */
const useStores = (enabled: boolean) => useResource<Store[]>(KEYS.stores, () => listStores(), {enabled, freshFor: 3_600_000});

export function AddProductDialog({open, onClose}: {open: boolean; onClose: () => void}) {
  const stores = useStores(open);
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl('');
      setPrice('');
      setError(null);
      setTouched(false);
    }
  }, [open]);

  const store = url.trim() && stores.data ? detectStore(url, stores.data) : null;
  const parsedPrice = parsePriceInput(price);
  const urlError =
    touched && url.trim() && stores.data && !store
      ? `Solo se admiten enlaces de ${stores.data.map((s) => s.name).join(' y ')}.`
      : null;
  const priceError = touched && price.trim() && parsedPrice === null ? 'Escribe un importe mayor que cero, por ejemplo 599,90.' : null;

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!url.trim() || parsedPrice === null || (stores.data && !store)) return;
    setBusy(true);
    setError(null);
    try {
      const {product, created} = await createProduct(url.trim(), parsedPrice);
      mutate<Product[]>(KEYS.products, (list) => (list ? [product, ...list.filter((p) => p.id !== product.id)] : [product]));
      refreshAfterChange(product.id);
      toast.success(
        created
          ? `Siguiendo «${productName(product)}».`
          : `Ya seguías «${productName(product)}»: objetivo actualizado a ${formatPrice(product.desired_price)}.`,
      );
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title="Sigue un producto nuevo"
      description="Pega un enlace de Amazon ES o PCComponentes y tu precio objetivo. Te avisamos por correo cuando baje de ahí."
    >
      <form className="form" onSubmit={submit} id="add-product-form">
        {error && <Notice tone="err">{error}</Notice>}
        <Field
          label="Enlace del producto"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://www.pccomponentes.com/…"
          required
          autoFocus
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          error={urlError}
          hint={store ? `Tienda: ${store.name}` : stores.data ? stores.data.map((s) => s.name).join(' · ') : undefined}
        />
        <Field
          label="Precio objetivo"
          inputMode="decimal"
          autoComplete="off"
          placeholder="599,90"
          required
          className="mono"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          trailing="€"
          error={priceError}
        />
        {busy && (
          <p className="muted" role="status" style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <Spinner /> Leyendo el precio en la tienda; puede tardar unos segundos.
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn sec" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={busy} aria-busy={busy}>
            {busy && <Spinner />}
            Añadir producto
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function EditTargetDialog({product, open, onClose}: {product: Product; open: boolean; onClose: () => void}) {
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPrice(priceToInput(product.desired_price));
      setError(null);
    }
  }, [open, product.desired_price]);

  const parsed = parsePriceInput(price);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (parsed === null) {
      setError('Escribe un importe mayor que cero, por ejemplo 599,90.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProduct(product.id, {desired_price: parsed});
      mutate<Product[]>(KEYS.products, (list) => list?.map((p) => (p.id === updated.id ? updated : p)));
      mutate<Product>(KEYS.product(updated.id), updated);
      refreshAfterChange(updated.id);
      toast.success(`Objetivo actualizado a ${formatPrice(updated.desired_price)}.`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title="Editar el precio objetivo"
      description="Cambiar el objetivo no envía ningún correo: si el precio ya está por debajo, lo verás en el panel."
    >
      <form className="form" onSubmit={submit}>
        {error && <Notice tone="err">{error}</Notice>}
        <Field
          label="Precio objetivo"
          inputMode="decimal"
          autoComplete="off"
          required
          autoFocus
          className="mono"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          trailing="€"
          hint={product.last_price !== null ? `Precio actual: ${formatPrice(product.last_price)}` : undefined}
        />
        <div className="form-actions">
          <button type="button" className="btn sec" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={busy} aria-busy={busy}>
            {busy && <Spinner />}
            Guardar
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function HelpDialog({open, onClose}: {open: boolean; onClose: () => void}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cómo funciona"
      wide
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Entendido
        </button>
      }
    >
      <ul className="help">
        <li>
          <b>Añade un producto</b> con su enlace de Amazon ES o PCComponentes y el precio al que lo comprarías.
        </li>
        <li>
          <b>El worker lo comprueba solo</b> cada pocas horas («Uso del worker» dice cuándo toca la próxima ronda). También
          puedes pulsar «Comprobar ahora» en un producto o «Comprobar todos».
        </li>
        <li>
          <b>Te avisamos por correo</b> cuando el precio cruza tu objetivo hacia abajo. Un error de lectura no repite el
          aviso; quedarse sin stock sí lo reinicia.
        </li>
        <li>
          <b>Los puntos de estado:</b> verde «A tu precio», ámbar «Por encima», gris «Agotado» o «Pendiente» y rojo
          «Error».
        </li>
        <li>
          <b>Atajos:</b> <span className="kbd">/</span> busca entre tus productos y <span className="kbd">F</span> lleva al
          buscador desde cualquier página.
        </li>
      </ul>
    </Dialog>
  );
}
