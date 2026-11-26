import {useMemo, useState, type FormEvent, type RefObject} from 'react';
import {PlusCircle} from 'lucide-react';
import type {Product, Store} from '../api/types';
import {createProduct} from '../api/products';
import {getErrorMessage} from '../api/client';
import {parsePriceInput} from '../lib/format';
import {detectStore} from '../lib/productStatus';
import {Button, TextField} from './ui';

interface AddProductFormProps {
  stores: Store[];
  storesLoaded: boolean;
  urlInputRef: RefObject<HTMLInputElement | null>;
  onSaved: (product: Product, created: boolean) => void;
}

export function AddProductForm({stores, storesLoaded, urlInputRef, onSaved}: AddProductFormProps) {
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const detected = useMemo(() => (url.trim() ? detectStore(url, stores) : null), [url, stores]);
  const storeNames = stores.map((store) => store.name).join(' y ');
  const example = stores[0]?.example_url ?? 'https://www.amazon.es/dp/…';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const trimmedUrl = url.trim();
    const parsedPrice = parsePriceInput(price);

    let nextUrlError: string | null = null;
    if (!trimmedUrl) nextUrlError = 'Pega la URL del producto.';
    else if (!/^https?:\/\//i.test(trimmedUrl)) nextUrlError = 'La URL debe empezar por https://';
    else if (stores.length > 0 && !detected) nextUrlError = `Esa tienda no es compatible. Prueba con ${storeNames}.`;
    const nextPriceError = parsedPrice === null ? 'Escribe un precio mayor que cero, por ejemplo 599,90.' : null;
    setUrlError(nextUrlError);
    setPriceError(nextPriceError);
    if (nextUrlError || nextPriceError || parsedPrice === null) return;

    setSaving(true);
    try {
      const {product, created} = await createProduct(trimmedUrl, parsedPrice);
      setUrl('');
      setPrice('');
      onSaved(product, created);
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se ha podido añadir el producto.'));
    } finally {
      setSaving(false);
    }
  };

  const storeHint = !storesLoaded
    ? 'Cargando tiendas compatibles…'
    : detected
      ? `Tienda: ${detected.name}`
      : stores.length > 0
        ? `Tiendas compatibles: ${storeNames}.`
        : 'Amazon ES y PCComponentes.';

  return (
    <section
      aria-labelledby="nuevo-producto"
      className="@container mb-10 rounded-2xl border border-outline-variant/10 bg-surface-container-low p-5 sm:p-8 lg:mb-12"
    >
      <h2 id="nuevo-producto" className="mb-6 flex items-center gap-2 font-manrope text-lg font-bold">
        <PlusCircle size={20} className="text-primary" aria-hidden="true" />
        Seguir un producto nuevo
      </h2>
      <form className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <TextField
          ref={urlInputRef}
          className="flex-1"
          label="URL del producto"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlError(null);
          }}
          placeholder={example}
          hint={storeHint}
          error={urlError}
        />
        <TextField
          className="w-full @2xl:w-48"
          label="Precio objetivo (€)"
          inputMode="decimal"
          autoComplete="off"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            setPriceError(null);
          }}
          placeholder="599,90"
          hint="Te avisamos al bajar de aquí."
          error={priceError}
        />
        <div className="@2xl:pt-[26px]">
          <Button type="submit" size="lg" loading={saving} className="w-full @2xl:w-auto">
            {saving ? 'Comprobando el precio…' : 'Añadir producto'}
          </Button>
        </div>
      </form>
      {formError && (
        <p role="alert" className="mt-4 text-sm font-semibold text-error">
          {formError}
        </p>
      )}
    </section>
  );
}
