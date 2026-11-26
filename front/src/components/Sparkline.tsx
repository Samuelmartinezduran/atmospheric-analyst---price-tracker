import type {HistoryPoint} from '../api/types';
import {areaPath, linearScale, linePath, toPricePoints} from '../lib/chartCore';

const W = 300;
const H = 40;
const PAD = 3;

/** Minigráfica de la tarjeta: precio (línea), relleno suave y objetivo (discontinua). */
export function Sparkline({history, target}: {history: HistoryPoint[] | undefined; target: number}) {
  if (!history) return <div className="spark"><span className="sk" style={{height: 40}} /></div>;
  const points = toPricePoints(history);
  if (points.length === 0) {
    return (
      <div className="spark">
        <div className="none">Aún sin precios</div>
      </div>
    );
  }
  // Con un solo punto, una línea plana a lo ancho.
  const series = points.length === 1 ? [points[0], {time: points[0].time + 1, price: points[0].price}] : points;
  const values = series.map((p) => p.price).concat(target);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo || hi * 0.1 || 1;
  lo -= span * 0.12;
  hi += span * 0.12;
  const x = linearScale([series[0].time, series[series.length - 1].time], [PAD, W - PAD]);
  const y = linearScale([lo, hi], [H - PAD, PAD]);
  const ty = y(target).toFixed(1);
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="area" d={areaPath(series, x, y, H)} />
        <line className="target" x1="0" x2={W} y1={ty} y2={ty} vectorEffect="non-scaling-stroke" />
        <path className="line" d={linePath(series, x, y)} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
