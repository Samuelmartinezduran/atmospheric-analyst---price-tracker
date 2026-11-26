import {useId} from 'react';
import {areaPath, linearScale, linePath, type PricePoint} from '../lib/chartCore';

const W = 300;
const H = 40;
const PAD = 3;

/** Puntos de `Product.spark` (`[fechaISO, precio]`) listos para dibujar. */
export function sparkPoints(spark: [string, number][] | undefined): PricePoint[] {
  return (spark ?? [])
    .map(([iso, price]) => ({time: new Date(iso).getTime(), price}))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.price));
}

/** Minigráfica de la tarjeta (solo con 3 puntos o más): línea del acento y área en degradado. */
export function Sparkline({points, target}: {points: PricePoint[]; target: number}) {
  const gradient = `sg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (points.length < 3) return null;
  const values = points.map((p) => p.price);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // El objetivo solo entra en la escala si está cerca: si no, aplastaría la línea.
  if (target >= lo - (hi - lo) && target <= hi + (hi - lo)) {
    lo = Math.min(lo, target);
    hi = Math.max(hi, target);
  }
  const span = hi - lo || hi * 0.1 || 1;
  lo -= span * 0.15;
  hi += span * 0.15;
  // Puntos equiespaciados (las últimas lecturas, como en una minigráfica de actividad): con la
  // escala de tiempo real, un hueco de meses aplastaría todo en un extremo.
  const series = points.map((p, i) => ({time: i, price: p.price}));
  const x = linearScale([0, points.length - 1], [PAD, W - PAD]);
  const y = linearScale([lo, hi], [H - PAD, PAD]);
  const ty = y(target);
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(series, x, y, H)} fill={`url(#${gradient})`} />
        {ty > 0 && ty < H && (
          <line className="target" x1="0" x2={W} y1={ty.toFixed(1)} y2={ty.toFixed(1)} vectorEffect="non-scaling-stroke" />
        )}
        <path className="line" d={linePath(series, x, y)} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
