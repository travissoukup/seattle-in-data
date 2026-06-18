/**
 * Typed access to the build-time generated data for the investigations.
 * library.json comes from scripts/fetch-library.mjs (SPL Checkouts by Title);
 * permits.json is the SDCI fast-lane analysis.
 */
import libraryRaw from '@/lib/generated/library.json';
import permitsRaw from '@/lib/generated/permits.json';
import petsRaw from '@/lib/generated/pets.json';
import wagesRaw from '@/lib/generated/wages.json';
import parkingRaw from '@/lib/generated/parking.json';
import sdotRaw from '@/lib/generated/sdot.json';
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

export interface KeyCount {
  key: string;
  n: number;
}
export interface ZipBreedRow {
  zip: string;
  dogs: number;
  french: number;
  pit: number;
  frenchPer100: number;
  pitPer100: number;
}
export interface PetsData {
  generatedAt: string;
  species: KeyCount[];
  topDogBreeds: KeyCount[];
  topCatBreeds: KeyCount[];
  topNames: KeyCount[];
  topDogNames: KeyCount[];
  topCatNames: KeyCount[];
  zipBreed: ZipBreedRow[];
  totals: { dogTotal: number; frenchTotal: number; pitTotal: number };
}
export const pets = petsRaw as unknown as PetsData;

export interface DeptWage {
  department: string;
  n: number;
  median: number;
  p90: number;
}
export interface TitleWage {
  title: string;
  n: number;
  median: number;
}
export interface WagesData {
  generatedAt: string;
  summary: { n: number; median: number; p90: number; p99: number; max: number };
  byDept: DeptWage[];
  topTitles: TitleWage[];
  dist: Array<{ label: string; n: number }>;
}
export const wages = wagesRaw as unknown as WagesData;

export interface ParkingRow {
  year: number;
  area: string;
  /** Mean paid vehicles present per transaction reading. */
  occ: number;
  /** Mean total spaces at the blockface. */
  spaces: number;
  /** occ / spaces: the share of paid spaces occupied (0 to 1). */
  rate: number;
  /** Transaction-reading count behind the averages. */
  n: number;
}
export interface ParkingData {
  generatedAt: string;
  byAreaYear: ParkingRow[];
}
export const parking = parkingRaw as unknown as ParkingData;

export interface ParkingChange {
  area: string;
  rate2019: number;
  rate2024: number;
  pctChange: number;
}
/** Occupancy-rate change from 2019 to 2024 by paid-parking area, worst first. */
export function parkingChange(): ParkingChange[] {
  const by = new Map<string, Map<number, ParkingRow>>();
  for (const r of parking.byAreaYear) {
    if (!by.has(r.area)) by.set(r.area, new Map());
    by.get(r.area)!.set(r.year, r);
  }
  const out: ParkingChange[] = [];
  for (const [area, years] of by) {
    const a = years.get(2019);
    const b = years.get(2024);
    if (!a || !b || a.rate <= 0) continue;
    out.push({ area, rate2019: a.rate, rate2024: b.rate, pctChange: ((b.rate - a.rate) / a.rate) * 100 });
  }
  return out.sort((x, y) => x.pctChange - y.pctChange);
}
/** Occupancy rate by year for a single area (for the recovery-path lines). */
export function parkingPath(area: string): Array<{ year: string; rate: number }> {
  return parking.byAreaYear
    .filter((r) => r.area === area)
    .sort((a, b) => a.year - b.year)
    .map((r) => ({ year: String(r.year), rate: Math.round(r.rate * 1000) / 10 }));
}

export interface SdotPermitType {
  type: string;
  permits: number;
  meanCity: number;
  meanApp: number;
  meanTotal: number;
  medCity: number;
  medApp: number;
  medTotal: number;
  /** Percent of the average wait that sits in the applicant's control. */
  applicantShare: number | null;
}
export interface SdotData {
  generatedAt: string;
  overall: { totalIssued: number; meanCity: number; meanApp: number; medTotal: number };
  types: SdotPermitType[];
}
export const sdot = sdotRaw as unknown as SdotData;

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
