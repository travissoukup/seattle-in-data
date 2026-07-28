'use client';

import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

/**
 * Page-local line chart for the fee-revenue trends. Same styling as the shared
 * TrendChart, plus per-series color and an optional dashed stroke so the
 * annualized 2026 pace segment reads as an estimate, not a measurement.
 */

const AXIS_TICK = { fontSize: 12, fill: '#5b6573' } as const;
const GRID = '#eef1f4';

const FORMATTERS = {
  money: (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${Math.round(v)}`;
  },
  index: (v: number) => v.toFixed(0),
} as const;

export interface PaceSeries {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
  /** Hide from the legend (pace segments share their parent's legend entry). */
  noLegend?: boolean;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function PaceTrend({
  data,
  xKey,
  series,
  height = 320,
  valueFormat = 'money',
}: {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  series: PaceSeries[];
  height?: number;
  valueFormat?: keyof typeof FORMATTERS;
}) {
  const f = FORMATTERS[valueFormat];
  const [ref, w] = useWidth();
  return (
    <div ref={ref} style={{ width: '100%', height }}>
      {w > 0 ? (
        <LineChart width={w} height={height} data={data} margin={{ top: 8, right: 18, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#cbd2da' }} />
          <YAxis tickFormatter={(v) => f(Number(v))} tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} />
          <Tooltip formatter={(value) => f(Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '6 5' : undefined}
              dot={{ r: 2.5 }}
              connectNulls={false}
              isAnimationActive={false}
              legendType={s.noLegend ? 'none' : 'line'}
            />
          ))}
        </LineChart>
      ) : null}
    </div>
  );
}
