'use client';

import { useState } from 'react';
import { TrendChart } from '@/components/charts';

interface Props {
  months: string[];
  series: Array<{ key: string; values: Array<number | null> }>;
}

// Pick one 911 call type and see its monthly trend. Types the department
// created or retired mid-history start or stop where their data does.
export function TypeTrendPicker({ months, series }: Props) {
  const [key, setKey] = useState(series[0]?.key ?? '');
  const sel = series.find((s) => s.key === key) ?? series[0];
  const rows = months.map((m, i) => ({ ym: m, n: sel?.values[i] ?? null }));

  return (
    <div>
      <div className="lf-row" style={{ marginBottom: 8 }}>
        <div className="lf-field grow">
          <label>Call type</label>
          <select value={sel?.key ?? ''} onChange={(e) => setKey(e.target.value)}>
            {series.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TrendChart data={rows} xKey="ym" series={[{ key: 'n', name: sel?.key ?? 'Calls' }]} valueFormat="compact" height={300} />
    </div>
  );
}
