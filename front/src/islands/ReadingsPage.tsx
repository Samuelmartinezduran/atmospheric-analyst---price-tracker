import {PrivatePage} from '../components/PrivatePage';
import {ReadingsTable} from '../components/ReadingsTable';
import {SkeletonBody} from '../components/skeletons';
import {ErrorNotice, Topbar} from '../components/ui';
import {useProducts, useReadings} from '../lib/data';

const LIMIT = 100;

function Readings() {
  const readings = useReadings(LIMIT);
  const products = useProducts();
  return (
    <>
      <Topbar crumb={<span>Todas las lecturas</span>} title="Lecturas" />
      <div className="content">
        <div className="page-h">
          <div>
            <h1>Lecturas</h1>
            <p>Las últimas {LIMIT} comprobaciones de tus productos, de la más reciente a la más antigua.</p>
          </div>
        </div>
        {readings.data ? (
          readings.data.length ? (
            <ReadingsTable readings={readings.data} products={products.data} showProduct caption="Lecturas recientes de todos tus productos" />
          ) : (
            <p className="empty panel">Aún no hay lecturas. Llegarán con la primera ronda del worker.</p>
          )
        ) : readings.error ? (
          <ErrorNotice error={readings.error} onRetry={readings.reload} />
        ) : (
          <SkeletonBody variant="table" />
        )}
      </div>
    </>
  );
}

export default function ReadingsPage() {
  return (
    <PrivatePage crumb={<span>Todas las lecturas</span>} title="Lecturas" variant="table">
      {() => <Readings />}
    </PrivatePage>
  );
}
