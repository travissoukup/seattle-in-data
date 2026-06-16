/**
 * Typed access to the build-time generated data for the investigations.
 * library.json comes from scripts/fetch-library.mjs (SPL Checkouts by Title);
 * permits.json is the SDCI fast-lane analysis.
 */
import libraryRaw from '@/lib/generated/library.json';
import permitsRaw from '@/lib/generated/permits.json';
import { num } from '@/lib/format';

export interface YearUsageRow {
  year: number;
  usage: string;
  checkouts: number;
}
export interface MaterialRow {
  type: string;
  label: string;
  checkouts: number;
}
export interface BookRow {
  title: string;
  checkouts: number;
}
export interface SeismoSeriesPoint {
  ym: string;
  checkouts: number;
}
export interface SeismoTitle {
  label: string;
  note: string;
  series: SeismoSeriesPoint[];
}
export interface BookMonthlyPoint {
  ym: string;
  checkouts: number;
}
export interface TopBookMonthly {
  title: string;
  total: number;
  series: BookMonthlyPoint[];
}
export interface LibraryData {
  generatedAt: string;
  byYearUsage: YearUsageRow[];
  materialTypes: MaterialRow[];
  topBooks: BookRow[];
  seismograph: SeismoTitle[];
  topBooksMonthly: TopBookMonthly[];
}

export const library = libraryRaw as unknown as LibraryData;

export interface FilerRawRow {
  bucket: string;
  n: number;
  med_issue_days: number;
  med_city_days: number;
  med_cycles: number;
}
export interface FilerControlledRow {
  bucket: string;
  n: number;
  med_city_days: number;
  med_cycles: number;
}
export interface PermitsData {
  note: string;
  rawByFiler: FilerRawRow[];
  controlledByFiler: FilerControlledRow[];
}

export const permits = permitsRaw as unknown as PermitsData;

/** Physical vs digital checkouts pivoted by year (the digital surge). */
export function digitalSurge(): Array<{ year: string; physical: number; digital: number }> {
  const byYear = new Map<number, { physical: number; digital: number }>();
  for (const r of library.byYearUsage) {
    const e = byYear.get(r.year) ?? { physical: 0, digital: 0 };
    if (r.usage === 'Digital') e.digital += r.checkouts;
    else e.physical += r.checkouts;
    byYear.set(r.year, e);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, e]) => ({ year: String(year), physical: e.physical, digital: e.digital }));
}

/** Merge audiobook/print format variants of the same title and re-rank. */
export function topBooksMerged(limit = 12): BookRow[] {
  const clean = (t: string): string =>
    t
      .replace(/\s*\((un)?abridged\)\s*$/i, '')
      .replace(/\s*:\s*A Novel\s*$/i, '')
      .replace(/\s*\/.*$/, '')
      .trim();
  const merged = new Map<string, number>();
  for (const b of library.topBooks) {
    const k = clean(b.title);
    merged.set(k, (merged.get(k) ?? 0) + (num(b.checkouts) ?? 0));
  }
  return [...merged.entries()]
    .map(([title, checkouts]) => ({ title, checkouts }))
    .sort((a, b) => b.checkouts - a.checkouts)
    .slice(0, limit);
}
