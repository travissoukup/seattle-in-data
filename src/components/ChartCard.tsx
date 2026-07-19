import type { ReactNode } from 'react';
import { CsvButton } from './CsvButton';

interface Source {
  /** Socrata dataset id, e.g. 'tazs-3rd5'. */
  id: string;
  /** Data portal host; defaults to data.seattle.gov. */
  domain?: string;
  /** Full URL of the exact aggregation query behind this chart, if one exists. */
  query?: string;
}

interface Props {
  title: string;
  desc?: ReactNode;
  /** Underlying aggregate as CSV, offered as a download next to the title. */
  csv?: { filename: string; data: string };
  /** Methodology / source line shown under the content. */
  footnote?: ReactNode;
  /** Linked source dataset; renders dataset + exact-query links after the footnote. */
  source?: Source;
  children: ReactNode;
}

/** A titled card wrapping a chart or table, with a CSV download and footnote. */
export function ChartCard({ title, desc, csv, footnote, source, children }: Props) {
  const domain = source?.domain ?? 'data.seattle.gov';
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
      {footnote || source ? (
        <div className="footnote">
          <strong>Methodology.</strong> {footnote}
          {source ? (
            <>
              {' '}
              <a href={`https://${domain}/d/${source.id}`} target="_blank" rel="noopener noreferrer">
                Dataset {source.id}
              </a>
              {source.query ? (
                <>
                  {' '}
                  &middot;{' '}
                  <a href={source.query} target="_blank" rel="noopener noreferrer">
                    run the exact query
                  </a>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
