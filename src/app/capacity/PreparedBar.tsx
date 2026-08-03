'use client';

import { useState } from 'react';

/** Editable prepared-by/for line that flows into the printed PDF, plus the export button. */
export function PreparedBar() {
  const [by, setBy] = useState('Travis Soukup, Trillium Ventures');
  const [forWhom, setForWhom] = useState('');

  return (
    <>
      <div className="card no-print">
        <div className="prepared-row">
          <div className="lf-field">
            <label>Prepared by</label>
            <input value={by} onChange={(e) => setBy(e.target.value)} />
          </div>
          <div className="lf-field">
            <label>Prepared for (optional)</label>
            <input value={forWhom} onChange={(e) => setForWhom(e.target.value)} placeholder="Client or meeting name" />
          </div>
          <button className="csv-btn" style={{ padding: '9px 16px', fontSize: 13 }} onClick={() => window.print()}>
            Export PDF
          </button>
        </div>
        <p className="note" style={{ margin: '8px 0 0' }}>
          Export uses your browser&apos;s print dialog: choose &quot;Save as PDF.&quot; The printed report drops the
          site chrome and sliders and keeps every number and citation at their current values.
        </p>
      </div>
      <p className="print-only muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
        Prepared by {by}
        {forWhom ? ` for ${forWhom}` : ''} &middot; {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </>
  );
}
