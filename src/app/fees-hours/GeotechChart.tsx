'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';

interface GeoYear {
  y: number;
  minDollars: number;
  addlDollars: number;
  hours: number;
  permits: number;
  rate: number;
  partial: boolean;
}

/** Geotech review fees by year: stacked dollars (minimum charges + metered
 * additional hours) on the left axis, implied review hours on the right.
 * Page-local; uses the site's measured-width pattern. */
export function GeotechChart({ rows }: { rows: GeoYear[] }) {
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

  const data = rows.map((r) => ({
    ...r,
    label: r.partial ? `${r.y}*` : String(r.y),
    minK: r.minDollars / 1000,
    addlK: r.addlDollars / 1000,
  }));

  return (
    <div ref={wrapRef}>
      {width > 0 ? (
        <ComposedChart width={width} height={330} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ed" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="d" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(0)}K`} width={52} />
          <YAxis yAxisId="h" orientation="right" tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}K hrs`} width={54} />
          <Tooltip
            formatter={(value, name) => {
              const n = String(name);
              if (n === 'Review hours') return [`${Number(value).toLocaleString('en-US')} hrs`, n];
              return [`$${Number(value).toFixed(0)}K`, n];
            }}
            labelFormatter={(l) => (String(l).endsWith('*') ? `${String(l).replace('*', '')} (through June 23)` : String(l))}
          />
          <Legend wrapperStyle={{ fontSize: 12.5 }} />
          <Bar yAxisId="d" dataKey="minK" name="Minimum charges" stackId="fees" fill="#56b4e9" radius={[0, 0, 0, 0]} />
          <Bar yAxisId="d" dataKey="addlK" name="Metered hours billed" stackId="fees" fill="#0072b2" radius={[3, 3, 0, 0]} />
          <Line yAxisId="h" dataKey="hours" name="Review hours" stroke="#d55e00" strokeWidth={2.5} dot={{ r: 3 }} />
        </ComposedChart>
      ) : (
        <div style={{ height: 330 }} />
      )}
    </div>
  );
}
