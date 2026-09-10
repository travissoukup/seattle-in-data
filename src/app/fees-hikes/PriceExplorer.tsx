'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';

/** Exact-cents money, since fee schedule prices like $115.50 carry cents. */
function fmtPrice(v: number): string {
  const opts =
    v % 1 === 0
      ? undefined
      : ({ minimumFractionDigits: 2, maximumFractionDigits: 2 } as const);
  return `$${v.toLocaleString('en-US', opts)}`;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const AXIS_TICK = { fontSize: 12, fill: '#5b6573' } as const;

/** Step chart for the base-unit staircase, with exact-cents labels. */
export function StaircaseChart({ data, height = 300 }: { data: Array<{ y: number; unit: number }>; height?: number }) {
  const [ref, w] = useWidth();
  return (
    <div ref={ref} style={{ width: '100%', height }}>
      {w > 0 ? (
        <LineChart width={w} height={height} data={data} margin={{ top: 8, right: 18, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#eef1f4" vertical={false} />
          <XAxis dataKey="y" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#cbd2da' }} />
          <YAxis
            domain={[100, 150]}
            tickFormatter={(v) => fmtPrice(Number(v))}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={62}
          />
          <Tooltip formatter={(value) => fmtPrice(Number(value))} />
          <Line
            type="stepAfter"
            dataKey="unit"
            name="Base fee unit"
            stroke="#0072b2"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      ) : null}
    </div>
  );
}

export interface ExplorerLabel {
  label: string;
  type: string;
  suffix: string;
  revenue: number;
  /** Modal price per year, aligned with `years`; null when no stable price. */
  prices: Array<number | null>;
}

/**
 * The fee ladder: every tracked fee as a step-line indexed to its first priced
 * year (= 100), so the whole schedule's increases fan out at once. Pick a fee
 * to zoom in: it colors and bolds, the rest fade back, and the exact prices
 * appear below. A line that starts above 100 mid-chart is a fee that did not
 * exist earlier; a line that dips is a fee that was cut.
 */
export function FeeLadder({ labels, years }: { labels: ExplorerLabel[]; years: number[] }) {
  const [sel, setSel] = useState<number>(-1); // -1 = show all

  // Index each fee to its first non-null price = 100.
  const indexed = useMemo(
    () =>
      labels.map((l) => {
        const firstIdx = l.prices.findIndex((p) => p !== null && p > 0);
        const base = firstIdx >= 0 ? (l.prices[firstIdx] as number) : null;
        return l.prices.map((p) => (base && p !== null && p > 0 ? Math.round((p / base) * 1000) / 10 : null));
      }),
    [labels],
  );

  const rows = useMemo(
    () =>
      years.map((y, yi) => {
        const r: Record<string, number | string | null> = { y };
        labels.forEach((_, li) => (r[`f${li}`] = indexed[li][yi]));
        return r;
      }),
    [years, labels, indexed],
  );

  const [ref, w] = useWidth();
  const selLabel = sel >= 0 ? labels[sel] : null;
  const selPriced = selLabel
    ? years.map((y, i) => ({ y, p: selLabel.prices[i] })).filter((r): r is { y: number; p: number } => r.p !== null)
    : [];
  const netPct =
    selPriced.length > 1
      ? ((selPriced[selPriced.length - 1].p / selPriced[0].p - 1) * 100).toFixed(1)
      : null;

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
        Zoom to a fee{' '}
        <select
          value={sel}
          onChange={(e) => setSel(Number(e.target.value))}
          style={{ maxWidth: '100%', fontSize: 13, padding: '4px 6px', marginLeft: 4 }}
        >
          <option value={-1}>All fees</option>
          {labels.map((l, i) => (
            <option key={`${l.label}|${l.suffix}`} value={i}>
              {l.label} ({l.type})
            </option>
          ))}
        </select>
      </label>

      <div ref={ref} style={{ width: '100%', height: 380 }}>
        {w > 0 ? (
          <LineChart width={w} height={380} data={rows} margin={{ top: 8, right: 18, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#eef1f4" vertical={false} />
            <XAxis dataKey="y" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#cbd2da' }} />
            <YAxis
              tickFormatter={(v) => `${v}`}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={40}
              label={{ value: 'Price (first year = 100)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#8a94a3' } }}
            />
            <ReferenceLine y={100} stroke="#cbd2da" strokeDasharray="3 3" />
            {sel >= 0 ? (
              <Tooltip
                formatter={(value) => [`${Number(value)} (100 = ${selPriced[0] ? fmtPrice(selPriced[0].p) : 'start'})`, 'Index']}
              />
            ) : null}
            {labels.map((l, i) => (
              <Line
                key={`${l.label}|${l.suffix}`}
                type="stepAfter"
                dataKey={`f${i}`}
                stroke={sel === i ? '#d55e00' : '#0072b2'}
                strokeOpacity={sel < 0 ? 0.18 : sel === i ? 1 : 0.05}
                strokeWidth={sel === i ? 3 : 1}
                dot={sel === i ? { r: 3 } : false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        ) : null}
      </div>

      <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
        {sel < 0
          ? `Each faint line is one of the ${labels.length} tracked fees, indexed so its first year reads 100. Most step up together every January; a few dip. Pick a fee above to zoom in.`
          : `${selLabel!.label}: ${netPct !== null ? `${Number(netPct) > 0 ? '+' : ''}${netPct}% from ${selPriced[0].y} (${fmtPrice(selPriced[0].p)}) to ${selPriced[selPriced.length - 1].y} (${fmtPrice(selPriced[selPriced.length - 1].p)})` : 'no stable multi-year price to compare'}.`}
      </p>

      {sel >= 0 ? (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Year</th>
                <th>Listed price</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y, i) => {
                const p = selLabel!.prices[i];
                const prev = i > 0 ? selLabel!.prices[i - 1] : null;
                const chg = p !== null && prev !== null && prev !== 0 ? (p / prev - 1) * 100 : null;
                return (
                  <tr key={y}>
                    <td>{y}</td>
                    <td>{p === null ? 'varies' : fmtPrice(p)}</td>
                    <td>{chg === null ? '' : chg === 0 ? 'held' : `${chg > 0 ? '+' : ''}${chg.toFixed(1)}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/** Pick a fee label, see its listed price by year. */
export function PriceExplorer({ labels, years }: { labels: ExplorerLabel[]; years: number[] }) {
  const [idx, setIdx] = useState(0);
  const sel = labels[idx];

  const priced = years
    .map((y, i) => ({ y, p: sel.prices[i] }))
    .filter((r): r is { y: number; p: number } => r.p !== null);
  const first = priced[0];
  const last = priced[priced.length - 1];
  const netPct = first && last && first.y !== last.y ? ((last.p / first.p - 1) * 100).toFixed(1) : null;

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
        Fee{' '}
        <select
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          style={{ maxWidth: '100%', fontSize: 13, padding: '4px 6px', marginLeft: 4 }}
        >
          {labels.map((l, i) => (
            <option key={`${l.label}|${l.suffix}`} value={i}>
              {l.label} ({l.type})
            </option>
          ))}
        </select>
      </label>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Year</th>
              <th>Listed price</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y, i) => {
              const p = sel.prices[i];
              const prev = i > 0 ? sel.prices[i - 1] : null;
              const chg = p !== null && prev !== null && prev !== 0 ? ((p / prev - 1) * 100) : null;
              return (
                <tr key={y}>
                  <td>{y}</td>
                  <td>{p === null ? 'varies' : fmtPrice(p)}</td>
                  <td>
                    {chg === null
                      ? ''
                      : chg === 0
                        ? 'held'
                        : `${chg > 0 ? '+' : ''}${chg.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        {netPct !== null
          ? `Net change ${first.y} to ${last.y}: ${Number(netPct) > 0 ? '+' : ''}${netPct}%. `
          : ''}
        {'"varies" means no single amount covered at least half of that year\'s invoices for this fee.'}
      </p>
    </div>
  );
}
