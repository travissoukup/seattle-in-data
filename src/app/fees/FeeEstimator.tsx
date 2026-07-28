'use client';

import { useState } from 'react';
import { fmtInt, fmtMoney } from '@/lib/format';

interface Band {
  band: string;
  n: number;
  p25: number;
  median: number;
  p75: number;
}

interface TypeRow {
  suffix: string;
  name: string;
  n: number;
  p25: number;
  median: number;
  p75: number;
}

interface Props {
  types: TypeRow[];
  cnBands: Band[];
}

/**
 * Pick a permit type (and, for construction permits, a project-value band) and
 * see the median and typical range of total fees actually paid, straight from
 * the invoice extract. All numbers are precomputed server-side.
 */
export function FeeEstimator({ types, cnBands }: Props) {
  const [suffix, setSuffix] = useState('CN');
  const [band, setBand] = useState('any');

  const type = types.find((t) => t.suffix === suffix) ?? types[0];
  const bandRow = suffix === 'CN' && band !== 'any' ? cnBands.find((b) => b.band === band) : null;
  const row = bandRow ?? type;

  return (
    <div>
      <div className="filter-row" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <label htmlFor="fee-type">Permit type</label>
        <select
          id="fee-type"
          value={suffix}
          onChange={(e) => {
            setSuffix(e.target.value);
            setBand('any');
          }}
        >
          {types.map((t) => (
            <option key={t.suffix} value={t.suffix}>
              {t.name} ({t.suffix})
            </option>
          ))}
        </select>
        {suffix === 'CN' ? (
          <>
            <label htmlFor="fee-band">Project value</label>
            <select id="fee-band" value={band} onChange={(e) => setBand(e.target.value)}>
              <option value="any">any value</option>
              {cnBands.map((b) => (
                <option key={b.band} value={b.band}>
                  {b.band}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>

      <div className="stat-grid" style={{ marginTop: 4 }}>
        <div className="stat-card">
          <div className="label">Median total fees</div>
          <div className="value">{fmtMoney(row.median)}</div>
          <div className="sub">half of these permits paid less, half paid more</div>
        </div>
        <div className="stat-card">
          <div className="label">Typical range</div>
          <div className="value">
            {fmtMoney(row.p25)} to {fmtMoney(row.p75)}
          </div>
          <div className="sub">the middle half of permits landed in this range</div>
        </div>
        <div className="stat-card">
          <div className="label">Permits behind this estimate</div>
          <div className="value">{fmtInt(row.n)}</div>
          <div className="sub">
            {bandRow ? `construction permits valued ${bandRow.band}` : `${type.name.toLowerCase()} permits, 2020 to mid 2026`}
          </div>
        </div>
      </div>
    </div>
  );
}
