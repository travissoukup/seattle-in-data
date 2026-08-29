'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';

interface QuarterRow {
  q: string;
  billed: number;
  issued: number;
}

/** Dual-axis quarterly view: fee dollars billed (bars, left axis) against
 * permits issued citywide (line, right axis). Page-local because the shared
 * TrendChart renders one axis; this is the site's only two-unit chart. */
export function QuarterlyChart({ rows }: { rows: QuarterRow[] }) {
  // The site's explicit-width pattern (same as PaceTrend): measure immediately,
  // then keep watching. ResponsiveContainer misbehaves in dev.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = rows.map((r) => ({ ...r, billedM: r.billed / 1e6 }));

  return (
    <div ref={wrapRef}>
      {width > 0 ? (
        <ComposedChart width={width} height={340} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ed" />
          <XAxis dataKey="q" tick={{ fontSize: 11 }} interval={3} />
          <YAxis yAxisId="fees" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(0)}M`} width={48} />
          <YAxis yAxisId="permits" orientation="right" tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} width={40} />
          <Tooltip
            formatter={(value, name) =>
              name === 'Fees billed'
                ? [`$${Number(value).toFixed(1)}M`, String(name)]
                : [Number(value).toLocaleString('en-US'), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12.5 }} />
          <Bar yAxisId="fees" dataKey="billedM" name="Fees billed" fill="#0072b2" radius={[3, 3, 0, 0]} />
          <Line yAxisId="permits" dataKey="issued" name="Permits issued" stroke="#d55e00" strokeWidth={2.5} dot={false} />
        </ComposedChart>
      ) : (
        <div style={{ height: 340 }} />
      )}
    </div>
  );
}
