'use client';

import { useEffect, useMemo, useState } from 'react';

const SOCRATA = 'https://data.seattle.gov/resource';

interface FeeLine {
  permit: string;
  desc: string;
  due: number;
  paid: number;
  date: string | null;
}

const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * What SDCI actually invoiced on permits at this address.
 * The City's fee estimator can't show this; it is the best available
 * reality-check on any estimate.
 */
export function FeesPaidHere({ permitNumbers }: { permitNumbers: string[] }) {
  const [lines, setLines] = useState<FeeLine[] | null>(null);
  const [err, setErr] = useState(false);
  const key = permitNumbers.slice(0, 40).join(',');

  useEffect(() => {
    if (!permitNumbers.length) { setLines([]); return; }
    let cancelled = false;
    setLines(null); setErr(false);
    // Fee records key on the base permit number (e.g. 6702164-CN).
    const bases = Array.from(new Set(permitNumbers.map((p) => p.trim()).filter(Boolean))).slice(0, 40);
    const quoted = bases.map((b) => `'${b.replace(/'/g, "''")}'`).join(',');
    const where = `permitnum in (${quoted})`;
    fetch(`${SOCRATA}/k8z7-3feg.json?$where=${encodeURIComponent(where)}&$select=permitnum,feedescription,feeamount,feeamountpaid,invoicedate&$limit=1000`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rows: Record<string, string>[]) => {
        if (cancelled) return;
        setLines(rows.map((r) => ({
          permit: r.permitnum || '',
          desc: r.feedescription || '',
          due: Number(r.feeamount || 0),
          paid: Number(r.feeamountpaid || 0),
          date: r.invoicedate || null,
        })));
      })
      .catch(() => !cancelled && setErr(true));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const byPermit = useMemo(() => {
    if (!lines) return [];
    const m = new Map<string, FeeLine[]>();
    for (const l of lines) {
      if (!m.has(l.permit)) m.set(l.permit, []);
      m.get(l.permit)!.push(l);
    }
    return [...m.entries()]
      .map(([permit, ls]) => ({
        permit,
        lines: ls.slice().sort((a, b) => b.paid - a.paid),
        total: ls.reduce((s, l) => s + l.paid, 0),
        date: ls.map((l) => l.date).filter(Boolean).sort()[0] || null,
      }))
      .sort((a, b) => b.total - a.total);
  }, [lines]);

  const grand = byPermit.reduce((s, p) => s + p.total, 0);

  if (!permitNumbers.length) return null;

  return (
    <div className="dd-pane">
      <h4 className="dd-head">What SDCI actually charged here</h4>
      <p className="dd-sub">
        Real invoice lines from the City&rsquo;s permit fee records for permits at this address. Fee records begin
        around 2020, so older permits may show nothing.
      </p>

      {lines === null && !err ? <p className="muted">Looking up the fee records…</p> : null}
      {err ? <p className="muted">Couldn&rsquo;t reach the fee records just now.</p> : null}
      {lines && lines.length === 0 ? (
        <p className="muted">
          No fee records on file for these permits. That usually means the work predates the City&rsquo;s published
          fee data rather than that nothing was charged.
        </p>
      ) : null}

      {byPermit.length > 0 ? (
        <>
          <div className="fee-totals" style={{ marginBottom: 14 }}>
            <div className="fee-grand">
              <span>Total invoiced across {byPermit.length} permit{byPermit.length === 1 ? '' : 's'}</span>
              <strong>{money(grand)}</strong>
            </div>
          </div>
          {byPermit.map((p) => (
            <details key={p.permit} className="fee-permit" open={byPermit.length === 1}>
              <summary>
                <span className="fee-permit-n">{p.permit}</span>
                <span className="fee-permit-d">{p.date ? p.date.slice(0, 10) : ''}</span>
                <span className="fee-permit-t mono">{money(p.total)}</span>
              </summary>
              <table className="data fee-table">
                <thead><tr><th>Fee line</th><th style={{ textAlign: 'right' }}>Paid</th></tr></thead>
                <tbody>
                  {p.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.desc}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{money(l.paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
          <p className="fee-note" style={{ marginTop: 10 }}>
            Lines other than plan review and the permit fee — geotechnical review, special inspection, curb cuts,
            recording — are charges the City&rsquo;s own estimator does not model.
          </p>
        </>
      ) : null}
    </div>
  );
}
