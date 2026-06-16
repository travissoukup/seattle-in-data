'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

/** Okabe-Ito colorblind-safe palette, matching the static report charts. */
export const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];

export type ValueFormat = 'int' | 'pct' | 'money' | 'days' | 'plain' | 'compact';

const FORMATTERS: Record<ValueFormat, (v: number) => string> = {
  int: (v) => Math.round(v).toLocaleString('en-US'),
  pct: (v) => `${v.toFixed(1)}%`,
  days: (v) => Math.round(v).toLocaleString('en-US'),
  plain: (v) => String(v),
  compact: (v) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return String(Math.round(v));
  },
  money: (v) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${Math.round(v)}`;
  },
};

export interface SeriesSpec {
  key: string;
  name: string;
}

export interface ChartData {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  series: SeriesSpec[];
  height?: number;
  valueFormat?: ValueFormat;
}

const AXIS_TICK = { fontSize: 12, fill: '#5b6573' } as const;
const GRID = '#eef1f4';

/**
 * Recharts' ResponsiveContainer measures the DOM, which is unavailable during
 * server prerender. Render an empty sized box until mounted so SSG produces no
 * zero-size warning and there is no layout shift (the box reserves height).
 */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function TrendChart({ data, xKey, series, height = 300, valueFormat = 'int' }: ChartData) {
  const f = FORMATTERS[valueFormat];
  const mounted = useMounted();
  return (
    <div style={{ width: '100%', height }}>
      {mounted ? (
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#cbd2da' }} />
            <YAxis
              tickFormatter={(v) => f(Number(v))}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip formatter={(value) => f(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={{ r: 2.5 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

export interface RankedDatum {
  label: string;
  value: number | null;
}

/** Horizontal bar chart for ranked categories with long labels. */
export function RankedBars({
  rows,
  valueName,
  valueFormat = 'days',
  height = 360,
}: {
  rows: RankedDatum[];
  valueName: string;
  valueFormat?: ValueFormat;
  height?: number;
}) {
  const f = FORMATTERS[valueFormat];
  const mounted = useMounted();
  return (
    <div style={{ width: '100%', height }}>
      {mounted ? (
        <ResponsiveContainer>
          <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tickFormatter={(v) => f(Number(v))} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#cbd2da' }} />
            <YAxis type="category" dataKey="label" width={156} tick={{ fontSize: 11, fill: '#333333' }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value) => f(Number(value))} />
            <Bar dataKey="value" name={valueName} fill={PALETTE[0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

export function BarsChart({
  data,
  xKey,
  series,
  height = 300,
  valueFormat = 'int',
  stacked = false,
}: ChartData & { stacked?: boolean }) {
  const f = FORMATTERS[valueFormat];
  const mounted = useMounted();
  return (
    <div style={{ width: '100%', height }}>
      {mounted ? (
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 18, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: '#cbd2da' }}
              interval={0}
            />
            <YAxis
              tickFormatter={(v) => f(Number(v))}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip formatter={(value) => f(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={PALETTE[i % PALETTE.length]}
                stackId={stacked ? 'stack' : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
