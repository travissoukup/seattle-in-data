'use client';

import { useState } from 'react';
import { TrendChart } from '@/components/charts';

interface Props {
  years: number[];
  series: Array<{ key: string; values: Array<number | null> }>;
}

// Pick one report category and see its yearly trend. Categories that the city
// created or retired mid-history simply start or stop where their data does.
export function TypeTrendPicker({ years, series }: Props) {
  const [key, setKey] = useState(series[0]?.key ?? '');
  const sel = series.find((s) => s.key === key) ?? series[0];
  const rows = years.map((y, i) => ({ y: String(y), n: sel?.values[i] ?? null }));

  return (
    <div>
      <div className="lf-row" style={{ marginBottom: 8 }}>
        <div className="lf-field grow">
          <label>Report category</label>
          <select value={sel?.key ?? ''} onChange={(e) => setKey(e.target.value)}>
            {series.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TrendChart data={rows} xKey="y" series={[{ key: 'n', name: sel?.key ?? 'Reports' }]} valueFormat="compact" height={300} />
    </div>
  );
}
