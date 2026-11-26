/**
 * Gráfica grande del detalle, en SVG propio: escala de tiempo real, objetivo discontinuo,
 * zonas «sin lecturas» en los huecos de más de 14 días, tooltip con ratón y teclado
 * (patrón «slider»: flechas, Inicio, Fin, RePág y AvPág) y un resumen accesible.
 */
import {useEffect, useId, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import type {HistoryPoint} from '../api/types';
import {
  areaPath,
  findGaps,
  linearScale,
  linePath,
  nearestIndex,
  priceAxis,
  readingTimes,
  splitAtGaps,
  timeTicks,
  toPricePoints,
} from '../lib/chart';
import {formatDate, formatDateTime, formatPrice, formatShortDate} from '../lib/format';

const M = {top: 18, right: 16, bottom: 30, left: 70};
const DAY = 86_400_000;

const axisFormatter = new Intl.NumberFormat('es-ES', {maximumFractionDigits: 0});
const axisFormatterDec = new Intl.NumberFormat('es-ES', {maximumFractionDigits: 2});

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function PriceChart({history, target}: {history: HistoryPoint[]; target: number}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const summaryId = useId();
  const gradientId = `pc${summaryId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const height = width && width < 560 ? 240 : 320;

  const model = useMemo(() => {
    const points = toPricePoints(history);
    const times = readingTimes(history);
    const gaps = findGaps(times);
    let t0 = times[0] ?? Date.now();
    let t1 = times[times.length - 1] ?? Date.now();
    if (t1 - t0 < DAY) {
      t0 -= DAY / 2;
      t1 += DAY / 2;
    }
    const axis = priceAxis(points.map((p) => p.price).concat(target));
    return {points, gaps, t0, t1, axis, segments: splitAtGaps(points, gaps)};
  }, [history, target]);

  const {points, gaps, t0, t1, axis, segments} = model;
  const plotW = Math.max(width - M.left - M.right, 10);
  const plotH = height - M.top - M.bottom;
  const x = linearScale([t0, t1], [M.left, M.left + plotW]);
  const y = linearScale(axis.domain, [M.top + plotH, M.top]);
  // Con lecturas de un solo día, una marca en ese día (no en la medianoche siguiente).
  const xTicks =
    points.length && points[points.length - 1].time - points[0].time < DAY
      ? [points[0].time]
      : timeTicks(t0, t1, Math.max(3, Math.floor(plotW / 80)));
  const step = axis.ticks.length > 1 ? axis.ticks[1] - axis.ticks[0] : 1;
  const yLabel = (value: number) => `${(step < 1 ? axisFormatterDec : axisFormatter).format(value)} €`;
  const ty = y(target);
  const targetVisible = ty >= M.top - 1 && ty <= M.top + plotH + 1;
  // La etiqueta del objetivo va encima de la línea, salvo si no cabe (objetivo en el borde superior).
  const labelY = ty - 19 < 2 ? ty + 3 : ty - 19;

  const summary = useMemo(() => {
    if (!points.length) return 'Todavía no hay lecturas con precio para dibujar.';
    const prices = points.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const minPoint = points.find((p) => p.price === min)!;
    const last = points[points.length - 1];
    const gapText = gaps.length
      ? ` Hay ${gaps.length === 1 ? 'un tramo' : `${gaps.length} tramos`} sin lecturas: ${gaps
          .map((g) => `del ${formatDate(new Date(g.start).toISOString())} al ${formatDate(new Date(g.end).toISOString())}`)
          .join('; ')}.`
      : '';
    return (
      `${points.length} lecturas con precio entre el ${formatDate(new Date(points[0].time).toISOString())} y el ` +
      `${formatDate(new Date(last.time).toISOString())}. Mínimo ${formatPrice(min)} el ` +
      `${formatDate(new Date(minPoint.time).toISOString())}; máximo ${formatPrice(max)}; último ${formatPrice(last.price)}. ` +
      `Objetivo ${formatPrice(target)}.${gapText}`
    );
  }, [points, gaps, target]);

  const current = active !== null ? points[active] : undefined;
  const valueText = current ? `${formatDateTime(current.time)}: ${formatPrice(current.price)}` : 'Sin lectura seleccionada';

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!points.length) return;
    const last = points.length - 1;
    const from = active ?? last;
    const moves: Record<string, number> = {
      ArrowLeft: from - 1,
      ArrowDown: from - 1,
      ArrowRight: from + 1,
      ArrowUp: from + 1,
      PageDown: from - 10,
      PageUp: from + 10,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(Math.min(last, Math.max(0, moves[event.key])));
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  };

  const pointer = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const px = clientX - rect.left;
    setActive(nearestIndex(points, x.invert(px)));
  };

  const cx = current ? x(current.time) : 0;
  const tipLeft = current ? (cx > width - 190 ? cx - 172 : cx + 12) : 0;

  return (
    <figure className="chart" style={{margin: 0}} aria-describedby={summaryId}>
      <p className="sr-only" id={summaryId}>
        {summary}
      </p>
      <div ref={wrapRef} style={{position: 'relative', height}}>
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity="0.26" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g className="gap">
              {gaps.map((gap) => {
                const gx0 = x(gap.start);
                const gx1 = x(gap.end);
                return (
                  <g key={gap.start}>
                    <rect x={gx0} y={M.top} width={Math.max(gx1 - gx0, 1)} height={plotH} />
                    <line x1={gx0} x2={gx0} y1={M.top} y2={M.top + plotH} />
                    <line x1={gx1} x2={gx1} y1={M.top} y2={M.top + plotH} />
                    {gx1 - gx0 > 84 && (
                      <text x={(gx0 + gx1) / 2} y={M.top + plotH - 10} textAnchor="middle">
                        sin lecturas
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
            <g className="grid axis">
              {axis.ticks.map((tick) => (
                <g key={tick}>
                  <line x1={M.left} x2={M.left + plotW} y1={y(tick)} y2={y(tick)} />
                  <text x={M.left - 10} y={y(tick)} dy="0.32em" textAnchor="end">
                    {yLabel(tick)}
                  </text>
                </g>
              ))}
            </g>
            <g className="axis">
              {xTicks.map((tick) => (
                <text key={tick} x={x(tick)} y={height - 8} textAnchor="middle">
                  {formatShortDate(tick)}
                </text>
              ))}
            </g>
            {segments.map((segment) =>
              segment.length > 1 ? (
                <path
                  key={`a${segment[0].time}`}
                  className="area"
                  fill={`url(#${gradientId})`}
                  d={areaPath(segment, x, y, M.top + plotH)}
                />
              ) : null,
            )}
            {segments.slice(1).map((segment, i) => {
              const before = segments[i][segments[i].length - 1];
              const after = segment[0];
              return (
                <path key={`b${after.time}`} className="bridge" d={linePath([before, after], x, y)} />
              );
            })}
            {segments.map((segment) => (
              <path key={`l${segment[0].time}`} className="line" d={linePath(segment, x, y)} />
            ))}
            {points.length <= 40 &&
              points.map((point) => <circle key={point.time} className="pt" cx={x(point.time)} cy={y(point.price)} r={2.5} />)}
            {targetVisible && (
              <g className="target">
                <line x1={M.left} x2={M.left + plotW} y1={ty} y2={ty} />
                <rect x={M.left + plotW - 132} y={labelY} width={130} height={16} rx={3} />
                <text x={M.left + plotW - 4} y={labelY + 12} textAnchor="end">
                  objetivo {formatPrice(target)}
                </text>
              </g>
            )}
            {current && (
              <g className="cursor">
                <line x1={cx} x2={cx} y1={M.top} y2={M.top + plotH} />
                <line x1={M.left} x2={M.left + plotW} y1={y(current.price)} y2={y(current.price)} />
                <circle cx={cx} cy={y(current.price)} r={4.5} />
              </g>
            )}
          </svg>
        )}
        {points.length > 0 && (
          <div
            className="chart-hit"
            role="slider"
            tabIndex={0}
            aria-label="Explorar las lecturas de la gráfica"
            aria-valuemin={1}
            aria-valuemax={points.length}
            aria-valuenow={active !== null ? active + 1 : points.length}
            aria-valuetext={valueText}
            onMouseMove={(event) => pointer(event.clientX, event.currentTarget)}
            onMouseLeave={() => setActive(null)}
            onTouchStart={(event) => pointer(event.touches[0].clientX, event.currentTarget)}
            onTouchMove={(event) => pointer(event.touches[0].clientX, event.currentTarget)}
            onFocus={() => setActive((value) => value ?? points.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={onKeyDown}
          />
        )}
        {current && (
          <div className="tip" style={{left: Math.max(0, tipLeft)}} aria-hidden="true">
            <span>{formatDateTime(current.time)}</span>
            <b>{formatPrice(current.price)}</b>
            <span>
              {current.price <= target ? 'a tu precio' : `${formatPrice(current.price - target)} sobre el objetivo`}
            </span>
          </div>
        )}
        {!points.length && (
          <div className="empty" style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center'}}>
            Todavía no hay lecturas con precio.
          </div>
        )}
      </div>
      <figcaption className="legend" style={{padding: '4px 14px 8px'}}>
        <span>
          <i aria-hidden="true" /> Precio
        </span>
        <span>
          <i className="dash" aria-hidden="true" /> Objetivo
        </span>
        {gaps.length > 0 && (
          <span>
            <i className="gap" aria-hidden="true" /> Sin lecturas (más de 14 días)
          </span>
        )}
      </figcaption>
    </figure>
  );
}
