// Page-local helpers for /parking. Reads the generated JSON directly so the
// page can use fields (hourly cut, reading counts, latest year) that the
// shared lib does not expose.
import raw from '@/lib/generated/parking.json';

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
export interface ParkingHourRow {
  area: string;
  year: number;
  /** Hour of day, 24h clock (paid hours run 8 to 19). */
  hour: number;
  rate: number;
  n: number;
}
export interface ParkingJson {
  generatedAt: string;
  latestYear: number;
  yearIds: Record<string, string>;
  byAreaYear: ParkingRow[];
  byAreaHour: ParkingHourRow[];
}

export const pk = raw as unknown as ParkingJson;
export const baseYear = Math.min(...pk.byAreaYear.map((r) => r.year));
export const latestYear = pk.latestYear;
export const latestId = pk.yearIds[String(latestYear)];
export const baseId = pk.yearIds[String(baseYear)];

/** An area's meter footprint counts as changed when its reading count moved 15%+. */
const FOOTPRINT_RATIO = 1.15;

export interface AreaChange {
  area: string;
  rateBase: number;
  rateLatest: number;
  pctChange: number;
  nBase: number;
  nLatest: number;
  /** latest readings / base readings: how much the metered footprint grew. */
  nRatio: number;
  footprintChanged: boolean;
}

/** Occupancy-rate change from the base year to the latest full year, worst first. */
export function areaChange(): AreaChange[] {
  const by = new Map<string, Map<number, ParkingRow>>();
  for (const r of pk.byAreaYear) {
    if (!by.has(r.area)) by.set(r.area, new Map());
    by.get(r.area)!.set(r.year, r);
  }
  const out: AreaChange[] = [];
  for (const [area, years] of by) {
    const a = years.get(baseYear);
    const b = years.get(latestYear);
    if (!a || !b || a.rate <= 0 || a.n <= 0) continue;
    const nRatio = b.n / a.n;
    out.push({
      area,
      rateBase: a.rate,
      rateLatest: b.rate,
      pctChange: ((b.rate - a.rate) / a.rate) * 100,
      nBase: a.n,
      nLatest: b.n,
      nRatio,
      footprintChanged: nRatio >= FOOTPRINT_RATIO || nRatio <= 1 / FOOTPRINT_RATIO,
    });
  }
  return out.sort((x, y) => x.pctChange - y.pctChange);
}

/** Reading-weighted mean occupancy rate for one year, over the given areas. */
export function weightedRate(year: number, areas: Set<string>): number {
  const rows = pk.byAreaYear.filter((r) => r.year === year && areas.has(r.area));
  const n = rows.reduce((s, r) => s + r.n, 0);
  return n > 0 ? rows.reduce((s, r) => s + r.rate * r.n, 0) / n : 0;
}

/** Total meter readings across all areas for one year. */
export function totalReadings(year: number): number {
  return pk.byAreaYear.filter((r) => r.year === year).reduce((s, r) => s + r.n, 0);
}

/** All full years present, ascending. */
export function dataYears(): number[] {
  return [...new Set(pk.byAreaYear.map((r) => r.year))].sort((a, b) => a - b);
}

/** Occupancy rate (0 to 100) by year for a single area. */
export function areaPath(area: string): Array<{ year: string; rate: number }> {
  return pk.byAreaYear
    .filter((r) => r.area === area)
    .sort((a, b) => a.year - b.year)
    .map((r) => ({ year: String(r.year), rate: Math.round(r.rate * 1000) / 10 }));
}

export function hourLabel(h: number): string {
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** Hour rows with real volume behind them; drops stray hours with a handful of readings. */
export function hourRows(): ParkingHourRow[] {
  const maxN = Math.max(...pk.byAreaHour.map((r) => r.n));
  return pk.byAreaHour.filter((r) => r.n >= maxN * 0.01);
}

/** Hour rows pivoted for the trend chart: one row per hour, one key per area+year. */
export function hourlyPivot(): { rows: Array<Record<string, number | string | null>>; keys: string[] } {
  const src = hourRows();
  const hours = [...new Set(src.map((r) => r.hour))].sort((a, b) => a - b);
  const keys = [...new Set(src.map((r) => `${r.area} ${r.year}`))];
  const rows = hours.map((h) => {
    const o: Record<string, number | string | null> = { hour: hourLabel(h) };
    for (const k of keys) o[k] = null;
    for (const r of src.filter((x) => x.hour === h)) {
      o[`${r.area} ${r.year}`] = Math.round(r.rate * 1000) / 10;
    }
    return o;
  });
  return { rows, keys };
}

/** Min and max hourly percent decline for one area, base vs latest year, from a given hour on. */
export function hourlyDeclineRange(area: string, fromHour = 0): { min: number; max: number } | null {
  const src = hourRows().filter((r) => r.hour >= fromHour);
  const base = new Map(src.filter((r) => r.area === area && r.year === baseYear).map((r) => [r.hour, r.rate]));
  const drops: number[] = [];
  for (const r of src.filter((x) => x.area === area && x.year === latestYear)) {
    const b = base.get(r.hour);
    if (b && b > 0) drops.push((1 - r.rate / b) * 100);
  }
  if (drops.length === 0) return null;
  return { min: Math.min(...drops), max: Math.max(...drops) };
}

/** Occupancy rate for one area, year, hour (0 to 1), or null. */
export function hourRate(area: string, year: number, hour: number): number | null {
  return hourRows().find((r) => r.area === area && r.year === year && r.hour === hour)?.rate ?? null;
}

/** Percent change in one area's occupancy at a single hour, base vs latest year. */
export function hourChangePct(area: string, hour: number): number | null {
  const a = hourRate(area, baseYear, hour);
  const b = hourRate(area, latestYear, hour);
  return a && b ? ((b - a) / a) * 100 : null;
}

/** Full https resource URL reproducing a chart's aggregate on the portal. */
export function soqlUrl(id: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `https://data.seattle.gov/resource/${id}.json?${qs}`;
}

export const AREA_SELECT = 'paidparkingarea, avg(paidoccupancy) AS occ, avg(parkingspacecount) AS spaces, count(*) AS n';
