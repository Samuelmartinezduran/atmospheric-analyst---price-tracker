import {Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {ChartPoint} from '../lib/chartPoints';
import {formatDateTime, formatPrice, formatShortDate} from '../lib/format';

interface PriceChartProps {
  points: ChartPoint[];
  targetPrice: number;
  currency: string;
}

export default function PriceChart({points, targetPrice, currency}: PriceChartProps) {
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices, targetPrice);
  const max = Math.max(...prices, targetPrice);
  const pad = Math.max((max - min) * 0.15, max * 0.01, 1);
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure className="m-0">
      <div className="h-52 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{top: 8, right: 8, bottom: 0, left: 8}}>
            <defs>
              <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-surface-container-high)" />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value: number) => formatShortDate(value)}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
              tick={{fontSize: 10, fontWeight: 700, fill: 'var(--color-on-surface-variant)'}}
            />
            <YAxis hide domain={[min - pad, max + pad]} />
            <Tooltip
              cursor={{stroke: 'var(--color-outline-variant)'}}
              labelFormatter={(value) => formatDateTime(Number(value))}
              formatter={(value) => [formatPrice(Number(value), currency), 'Precio']}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid var(--color-outline-variant)',
                background: 'var(--color-surface-container-lowest)',
                color: 'var(--color-on-surface)',
                fontSize: 12,
                fontWeight: 700,
              }}
            />
            <ReferenceLine
              y={targetPrice}
              stroke="var(--color-tertiary)"
              strokeDasharray="4 4"
              label={{
                position: 'insideTopRight',
                value: `Objetivo ${formatPrice(targetPrice, currency)}`,
                fill: 'var(--color-tertiary)',
                fontSize: 10,
                fontWeight: 800,
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#price-fill)"
              dot={points.length <= 30 ? {r: 3, fill: 'var(--color-primary)', strokeWidth: 0} : false}
              activeDot={{r: 5, strokeWidth: 0}}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {`Evolución del precio desde ${formatDateTime(first.time)} (${formatPrice(first.price, currency)}) hasta ${formatDateTime(
          last.time,
        )} (${formatPrice(last.price, currency)}). Objetivo: ${formatPrice(targetPrice, currency)}.`}
      </figcaption>
    </figure>
  );
}
