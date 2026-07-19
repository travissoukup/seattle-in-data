/**
 * Formatting + coercion helpers shared across the dashboard.
 *
 * DuckDB values arrive as numbers, strings (for very large integers), or null,
 * so every accessor coerces through num() before formatting.
 */

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/** Whole number with thousands separators; em dash for null. */
export function fmtInt(v: unknown): string {
  const x = num(v);
  return x === null ? 'n/a' : Math.round(x).toLocaleString('en-US');
}

/** Calendar year as a plain integer (no thousands separator). */
export function fmtYear(v: unknown): string {
  const x = num(v);
  return x === null ? 'n/a' : String(Math.trunc(x));
}

/** One decimal place. */
export function fmt1(v: unknown): string {
  const x = num(v);
  return x === null ? 'n/a' : x.toFixed(1);
}

/** Percentage with one decimal place. */
export function fmtPct(v: unknown): string {
  const x = num(v);
  return x === null ? 'n/a' : `${x.toFixed(1)}%`;
}

/** Whole-dollar money like $12,345. */
export function fmtMoney(v: unknown): string {
  const x = num(v);
  return x === null ? 'n/a' : `$${Math.round(x).toLocaleString('en-US')}`;
}

/** Compact money like $1.2M / $3.4B for axis ticks and large totals. */
export function fmtMoneyCompact(v: unknown): string {
  const x = num(v);
  if (x === null) return 'n/a';
  const abs = Math.abs(x);
  if (abs >= 1e9) return `$${(x / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(x / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(x / 1e3).toFixed(0)}K`;
  return `$${Math.round(x)}`;
}

/** Calendar days with a unit suffix. */
export function fmtDays(v: unknown): string {
  const x = num(v);
  return x === null ? 'n/a' : `${Math.round(x).toLocaleString('en-US')} days`;
}

/**
 * Build a CSV string (RFC 4180-ish) from header labels and rows of values.
 * Values are coerced to strings and quoted when they contain a comma, quote,
 * or newline.
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (cell: string | number | null | undefined): string => {
    const s = cell === null || cell === undefined ? '' : String(cell);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))];
  return lines.join('\n');
}
