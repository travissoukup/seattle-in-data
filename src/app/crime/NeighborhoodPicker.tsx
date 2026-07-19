'use client';

import { useMemo, useState } from 'react';
import { TrendChart } from '@/components/charts';
import { CsvButton } from '@/components/CsvButton';
import { toCsv } from '@/lib/format';

interface HoodMonthly {
  startYear: number;
  months: string[];
  hoods: Array<{ name: string; total: number; n: number[] }>;
}

/** Pick a neighborhood, see its police reports per month. */
export function NeighborhoodPicker({ data }: { data: HoodMonthly }) {
  const [hood, setHood] = useState(data.hoods[0]?.name ?? '');
  const sel = data.hoods.find((h) => h.name === hood) ?? data.hoods[0];

  const chart = useMemo(
    () => data.months.map((m, i) => ({ m, n: sel?.n[i] ?? 0 })),
    [data.months, sel],
  );
  const csv = useMemo(
    () => toCsv(['month', 'police_reports'], chart.map((r) => [r.m, r.n])),
    [chart],
  );
  const slug = (sel?.name ?? 'neighborhood').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div>
      <div className="lf-row" style={{ marginBottom: 8, alignItems: 'flex-end' }}>
        <div className="lf-field grow">
          <label>Neighborhood</label>
          <select value={sel?.name ?? ''} onChange={(e) => setHood(e.target.value)}>
            {data.hoods.map((h) => (
              <option key={h.name} value={h.name}>
                {h.name} ({h.total.toLocaleString('en-US')} since {data.startYear})
              </option>
            ))}
          </select>
        </div>
        <CsvButton filename={`crime-monthly-${slug}.csv`} csv={csv} />
      </div>
      <TrendChart
        data={chart}
        xKey="m"
        series={[{ key: 'n', name: `Reports in ${sel?.name ?? ''}` }]}
        valueFormat="int"
        height={300}
      />
    </div>
  );
}
