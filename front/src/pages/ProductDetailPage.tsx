import {useEffect, useRef} from 'react';
import {Link, useParams} from 'react-router';
import {PackageSearch, X} from 'lucide-react';
import {ProductDetail} from '../components/ProductDetail';
import {Spinner} from '../components/ui';
import {storeName} from '../lib/productStatus';
import {useDashboardContext} from './DashboardPage';

/** Por debajo de xl el detalle tapa toda la pantalla: bloqueamos el scroll de lo de detrás. */
function useLockScrollBelowXl() {
  useEffect(() => {
    if (window.matchMedia?.('(min-width: 80rem)').matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}

/** `/productos/:productId`: el panel de detalle encima del panel principal. */
export function ProductDetailPage() {
  useLockScrollBelowXl();
  const {productId} = useParams();
  const ctx = useDashboardContext();
  const id = Number(productId);
  const product = Number.isInteger(id) ? ctx.products.find((p) => p.id === id) : undefined;

  if (product) {
    return (
      <ProductDetail
        product={product}
        storeLabel={storeName(product.store, ctx.app.stores)}
        checking={ctx.checkingIds.has(product.id)}
        historyVersion={ctx.historyVersion}
        onClose={ctx.closeDetail}
        onCheck={() => ctx.checkOne(product)}
        onUpdated={ctx.replaceProduct}
        onDeleted={ctx.removeProduct}
      />
    );
  }

  return <MissingProduct loading={ctx.loading} onClose={ctx.closeDetail} />;
}

function MissingProduct({loading, onClose}: {loading: boolean; onClose: () => void}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  return (
    <aside
      aria-label="Detalle del producto"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-surface-container-low p-5 sm:p-8 xl:inset-y-0 xl:right-0 xl:left-auto xl:w-[400px] xl:border-l xl:border-outline-variant/10"
    >
      <div className="mb-8 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 transition-colors hover:bg-surface-container-high"
          aria-label="Cerrar el detalle"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {loading ? (
        <Spinner label="Cargando el producto…" />
      ) : (
        <div className="text-center">
          <PackageSearch size={40} className="mx-auto mb-4 text-on-surface-variant" aria-hidden="true" />
          <h2 ref={headingRef} tabIndex={-1} className="mb-2 font-manrope text-xl font-extrabold outline-none">
            No encontramos este producto
          </h2>
          <p className="mb-6 text-sm text-on-surface-variant">Puede que lo hayas dejado de seguir o que el enlace no sea correcto.</p>
          <Link to="/" className="font-bold text-primary underline-offset-4 hover:underline">
            Volver al panel
          </Link>
        </div>
      )}
    </aside>
  );
}
