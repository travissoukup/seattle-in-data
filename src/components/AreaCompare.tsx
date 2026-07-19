'use client';

import { useMemo, useState } from 'react';

interface ZipRow {
  zip: string;
  label: string;
  pop: number;
  count: number;
  per1000: number | null;
}
interface AreaData {
  windowLabel: string;
  total: number;
  cityRate: number | null;
  zips: ZipRow[];
}

// "How does my area compare." A find-your-ZIP search over a per-ZIP table, with a
// per-person rate so a busy map does not just track where people live.
export function AreaCompare({ data, unit }: { data: AreaData; unit: string }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'rate' | 'count'>('rate');

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const filtered = data.zips.filter((z) => !ql || z.zip.includes(ql) || z.label.toLowerCase().includes(ql));
    return [...filtered].sort((a, b) =>
      sort === 'count' ? b.count - a.count : (b.per1000 ?? -1) - (a.per1000 ?? -1),
    );
  }, [data.zips, q, sort]);

  const maxRate = Math.max(...data.zips.map((z) => z.per1000 ?? 0), 1);

  return (
    <div className="area-compare card">
      <div className="lf-row" style={{ marginBottom: 8 }}>
        <div className="lf-field grow">
          <label>Find your area</label>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ZIP code or neighborhood" />
        </div>
        <div className="lf-field">
          <label>Sort by</label>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'rate' | 'count')}>
            <option value="rate">Per 1,000 residents</option>
            <option value="count">Total count</option>
          </select>
        </div>
      </div>

      {data.cityRate != null ? (
        <p className="note" style={{ margin: '0 0 10px' }}>
          Citywide that is about <strong>{data.cityRate}</strong> {unit} per 1,000 residents over {data.windowLabel}.
          Areas shaded darker are above that line.
        </p>
      ) : null}

      <div className="scroll" style={{ maxHeight: 420 }}>
        <table>
          <thead>
            <tr>
              <th>Area</th>
              <th className="num">Count</th>
              <th className="num">Per 1,000 people</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => {
              const above = data.cityRate != null && z.per1000 != null && z.per1000 >= data.cityRate;
              return (
                <tr key={z.zip}>
                  <td>
                    <strong>{z.zip}</strong> <span className="muted">{z.label}</span>
                  </td>
                  <td className="num">{z.count.toLocaleString('en-US')}</td>
                  <td className="num">
                    {z.per1000 == null ? (
                      <span className="muted">n/a</span>
                    ) : (
                      <span className="area-rate-wrap">
                        <span
                          className="area-rate-bar"
                          style={{ width: `${Math.round((z.per1000 / maxRate) * 60)}px`, background: above ? '#0072b2' : '#bcd3e6' }}
                        />
                        {z.per1000}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="foot">
        Rate is per 1,000 residents, using Census ACS 5-year population (2020 to 2024). Based on {data.windowLabel}.
        Downtown ZIP codes have too few residents for a meaningful rate and show n/a. These are counts of what gets
        reported, which is not the same as what happens: areas differ in how much people report, and places where many
        people work or pass through will rank high against a resident-only denominator.{' '}
        <a href="/notes">More in the data notes.</a>
      </p>
    </div>
  );
}
