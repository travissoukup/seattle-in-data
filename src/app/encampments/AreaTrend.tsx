'use client';

import { useState } from 'react';
import { TrendChart } from '@/components/charts';

interface AreaSeries {
  area: string;
  years: { year: string; n: number }[];
}

/** Pick a neighborhood, see its reports per year. */
export function AreaTrend({ areas }: { areas: AreaSeries[] }) {
  const [sel, setSel] = useState(areas[0]?.area ?? '');
  const cur = areas.find((a) => a.area === sel) ?? areas[0];
  if (!cur) return null;
  return (
    <div>
      <div className="lf-row" style={{ marginBottom: 8 }}>
        <div className="lf-field">
          <label>Neighborhood</label>
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            {areas.map((a) => (
              <option key={a.area} value={a.area}>
                {a.area}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TrendChart
        data={cur.years}
        xKey="year"
        series={[{ key: 'n', name: 'Reports' }]}
        valueFormat="compact"
        height={280}
      />
    </div>
  );
}
