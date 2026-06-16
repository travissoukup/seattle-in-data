import type { ReactNode } from 'react';
import { CsvButton } from './CsvButton';

interface Props {
  title: string;
  desc?: ReactNode;
  /** Underlying aggregate as CSV, offered as a download next to the title. */
  csv?: { filename: string; data: string };
  /** Methodology / source line shown under the content. */
  footnote?: ReactNode;
  children: ReactNode;
}

/** A titled card wrapping a chart or table, with a CSV download and footnote. */
export function ChartCard({ title, desc, csv, footnote, children }: Props) {
  return (
    <section className="card">
      <div className="chart-head">
        <div>
          <h2 className="section-title">{title}</h2>
          {desc ? <p className="desc">{desc}</p> : null}
        </div>
        {csv ? <CsvButton filename={csv.filename} csv={csv.data} /> : null}
      </div>
      {children}
      {footnote ? (
        <div className="footnote">
          <strong>Methodology.</strong> {footnote}
        </div>
      ) : null}
    </section>
  );
}
