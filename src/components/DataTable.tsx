import type { ReactNode } from 'react';

interface Props {
  headers: string[];
  rows: ReactNode[][];
  /** Column indexes that should wrap (e.g. descriptions) instead of nowrap. */
  wrapCols?: number[];
  caption?: string;
}

/** Plain, accessible data table. First column left-aligned via CSS. */
export function DataTable({ headers, rows, wrapCols = [], caption }: Props) {
  const wrap = new Set(wrapCols);
  return (
    <div className="table-wrap">
      <table className="data">
        {caption ? <caption className="muted">{caption}</caption> : null}
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={wrap.has(i) ? 'wrap' : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={wrap.has(j) ? 'wrap' : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
