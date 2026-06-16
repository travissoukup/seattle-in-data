'use client';

import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { num } from '@/lib/format';
import type { TopBookMonthly } from '@/lib/data';

// A wide palette so 50 lines stay distinguishable-ish; colors repeat, but
// isolating a title is how you actually read it.
const PALETTE = [
  '#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00', '#5b3a87', '#117733',
  '#882255', '#44aa99', '#999933', '#aa4499', '#332288', '#ddcc77', '#cc6677', '#88ccee',
];
const AXIS_TICK = { fontSize: 12, fill: '#5b6573' } as const;

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

interface TipPayload {
  name: string;
  value: number | null;
  color: string;
}
function Tip({ active, label, payload }: { active?: boolean; label?: string; payload?: TipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const top = payload
    .filter((p) => p.value != null && p.value > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 6);
  if (top.length === 0) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, boxShadow: 'var(--shadow)', maxWidth: 300 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{fmtMonth(String(label))}</div>
      {top.map((p) => (
        <div key={p.name} style={{ color: p.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {p.name}: {Math.round(p.value ?? 0).toLocaleString('en-US')}
        </div>
      ))}
    </div>
  );
}

export function TopBooksTimeSeries({ books }: { books: TopBookMonthly[] }) {
  const [ref, w] = useWidth();
  const [isolated, setIsolated] = useState<string | null>(null);

  const colorOf = (i: number): string => PALETTE[i % PALETTE.length];
  const months = [...new Set(books.flatMap((b) => b.series.map((p) => p.ym)))].sort();
  const lookup = new Map(books.map((b) => [b.title, new Map(b.series.map((p) => [p.ym, num(p.checkouts)]))]));
  const data = months.map((ym) => {
    const o: Record<string, number | string | null> = { ym };
    for (const b of books) o[b.title] = lookup.get(b.title)?.get(ym) ?? null;
    return o;
  });

  const toggle = (title: string): void => setIsolated((cur) => (cur === title ? null : title));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap', fontSize: 13 }}>
        <span className="muted">
          {isolated ? `Showing: ${isolated}` : `${books.length} books. Click a title to isolate its line.`}
        </span>
        {isolated ? (
          <button type="button" className="link-btn" onClick={() => setIsolated(null)}>
            Show all {books.length}
          </button>
        ) : null}
      </div>
      <div ref={ref} style={{ width: '100%', height: 380 }}>
        {w > 0 ? (
          <LineChart width={w} height={380} data={data} margin={{ top: 8, right: 18, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="#eef1f4" vertical={false} />
              <XAxis dataKey="ym" tickFormatter={fmtMonth} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#cbd2da' }} minTickGap={40} />
              <YAxis tickFormatter={(v) => Math.round(Number(v)).toLocaleString('en-US')} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<Tip />} />
              {books.map((b, i) => {
                const hidden = isolated !== null && b.title !== isolated;
                return (
                  <Line
                    key={b.title}
                    type="monotone"
                    dataKey={b.title}
                    stroke={colorOf(i)}
                    strokeWidth={isolated === b.title ? 2.5 : 1.25}
                    strokeOpacity={isolated ? 1 : 0.6}
                    dot={false}
                    connectNulls={false}
                    hide={hidden}
                    isAnimationActive={false}
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggle(b.title)}
                  />
                );
              })}
          </LineChart>
        ) : null}
      </div>
      <div className="book-legend">
        {books.map((b, i) => (
          <button
            type="button"
            key={b.title}
            className={`book-chip${isolated && isolated !== b.title ? ' dim' : ''}`}
            onClick={() => toggle(b.title)}
            title={`${b.title}: ${b.total.toLocaleString('en-US')} checkouts since 2022`}
          >
            <span className="book-dot" style={{ background: colorOf(i) }} />
            {b.title.length > 38 ? `${b.title.slice(0, 36)}…` : b.title}
          </button>
        ))}
      </div>
    </div>
  );
}
