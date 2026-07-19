'use client';

import { useState } from 'react';
import { TrendChart } from '@/components/charts';

interface Props {
  months: string[];
  series: Array<{ key: string; values: number[] }>;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Pick one community call type and see its monthly volume since 2019.
export function CallTypePicker({ months, series }: Props) {
  const [key, setKey] = useState(series[0]?.key ?? '');
  const sel = series.find((s) => s.key === key) ?? series[0];
  const rows = months.map((ym, i) => ({ ym, n: sel?.values[i] ?? null }));

  return (
    <div>
      <div className="lf-row" style={{ marginBottom: 8 }}>
        <div className="lf-field grow">
          <label>Call type</label>
          <select value={sel?.key ?? ''} onChange={(e) => setKey(e.target.value)}>
            {series.map((s) => (
              <option key={s.key} value={s.key}>
                {titleCase(s.key)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TrendChart
        data={rows}
        xKey="ym"
        series={[{ key: 'n', name: titleCase(sel?.key ?? 'Calls') }]}
        valueFormat="compact"
        height={300}
      />
    </div>
  );
}
