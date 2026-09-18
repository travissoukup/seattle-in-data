// Real-world fee benchmarks, computed from the City's own permit fee records.
//
// Source: 1,765,291 cleaned invoice lines across 395,097 permits (Permit Fees,
// k8z7-3feg), joined to Building Permits (76t5-zqzr) for project class.
// Child records (-001, -002 ...) are rolled up into the parent permit, so a
// "permit" here is the full lifetime bill for that permit number.
//
// Why this matters: the City's own estimator quotes only the core package
// (value-based plan review + intake + issuance + technology fee + surcharge).
// Measured against what SDCI actually invoiced, that core is roughly 1.15x too
// low at the median and 1.5x too low at the 90th percentile.

export interface Band {
  label: string;
  n: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

/** All-in invoiced totals per permit, single-family scale, 2023–2025. */
export const SFD_ALLIN: Record<'new' | 'altAdd', Band> = {
  new: { label: 'New single-family / duplex construction', n: 2926, p25: 4766, median: 7995, p75: 11685, p90: 15091 },
  altAdd: { label: 'Single-family addition or alteration', n: 8219, p25: 1019, median: 2206, p75: 4316, p90: 6796 },
};

/** Ratio of what SDCI actually invoiced to the "core" package a calculator shows. */
export const ALLIN_MULTIPLE: Record<'new' | 'altAdd', { median: number; p75: number; p90: number; n: number }> = {
  new: { median: 1.15, p75: 1.33, p90: 1.54, n: 2868 },
  altAdd: { median: 1.13, p75: 1.46, p90: 1.99, n: 8133 },
};

/** Median all-in by declared project cost — fees are strongly sub-linear. */
export const BY_COST_NEW: Array<{ band: string; lo: number; hi: number; median: number; p90: number; pct: number; n: number }> = [
  { band: 'under $300k', lo: 0, hi: 300000, median: 4439, p90: 8077, pct: 2.37, n: 1092 },
  { band: '$300k–500k', lo: 300000, hi: 500000, median: 7772, p90: 12943, pct: 1.96, n: 772 },
  { band: '$500k–750k', lo: 500000, hi: 750000, median: 11577, p90: 17591, pct: 1.92, n: 821 },
  { band: '$750k–1M', lo: 750000, hi: 1000000, median: 14190, p90: 19921, pct: 1.72, n: 175 },
  { band: '$1M–1.5M', lo: 1000000, hi: 1500000, median: 20060, p90: 36500, pct: 1.64, n: 42 },
];

export const BY_COST_ALT: Array<{ band: string; lo: number; hi: number; median: number; p90: number; pct: number; n: number }> = [
  { band: 'under $25k', lo: 0, hi: 25000, median: 730, p90: 2273, pct: 9.20, n: 2538 },
  { band: '$25k–50k', lo: 25000, hi: 50000, median: 1418, p90: 3702, pct: 4.34, n: 1184 },
  { band: '$50k–100k', lo: 50000, hi: 100000, median: 2087, p90: 4638, pct: 3.18, n: 1523 },
  { band: '$100k–250k', lo: 100000, hi: 250000, median: 4210, p90: 7478, pct: 2.63, n: 2103 },
  { band: '$250k–500k', lo: 250000, hi: 500000, median: 6491, p90: 10702, pct: 2.06, n: 659 },
  { band: 'over $500k', lo: 500000, hi: Infinity, median: 10395, p90: 17590, pct: 1.73, n: 201 },
];

/**
 * Fees that show up often enough to plan for, with how often they actually hit
 * a new single-family permit. These are the lines the City's estimator omits.
 */
export const COMMON_EXTRAS: Array<{ line: string; pctNew: number; median: number; p90: number; pctAlt?: number }> = [
  { line: 'Drainage review — additional hours', pctNew: 47.7, median: 803, p90: 1670, pctAlt: 7.7 },
  { line: 'Building revision', pctNew: 16.5, median: 274, p90: 548, pctAlt: 11.5 },
  { line: 'ECA geotechnical review — additional hours', pctNew: 11.8, median: 1019, p90: 1873, pctAlt: 12.3 },
  { line: 'Energy review — additional hours', pctNew: 9.3, median: 438, p90: 840, pctAlt: 3.2 },
  { line: 'Ordinance / structural review — additional hours', pctNew: 8.9, median: 411, p90: 1096, pctAlt: 6.4 },
  { line: 'Development permit renewal', pctNew: 5.7, median: 411, p90: 411, pctAlt: 6.6 },
  { line: 'Missed-inspection ("no show") fee', pctNew: 4.8, median: 128, p90: 257, pctAlt: 3.0 },
  { line: 'Zoning review — additional hours', pctNew: 3.3, median: 257, p90: 984, pctAlt: 2.9 },
];

/** Share of permits that pick up at least one discretionary extra charge. */
export const EXTRAS_INCIDENCE = { new: 55.2, altAdd: 34.3 };

/** Separate permits a single-family job usually also pays for. */
export const COMPANION_PERMITS: Array<{ type: string; label: string; median: number; p75: number; n: number }> = [
  { type: 'EL', label: 'Electrical', median: 175, p75: 342, n: 79361 },
  { type: 'FR', label: 'Furnace / heating', median: 56, p75: 59, n: 23373 },
  { type: 'RF', label: 'Refrigeration / heat pump', median: 77, p75: 122, n: 22257 },
  { type: 'ME', label: 'Mechanical', median: 663, p75: 1325, n: 5262 },
  { type: 'DM', label: 'Demolition', median: 438, p75: 863, n: 2313 },
  { type: 'SB', label: 'Side sewer / subdivision', median: 277, p75: 562, n: 1592 },
  { type: 'CY', label: 'Elevator / lift', median: 532, p75: 1266, n: 3628 },
  { type: 'BP', label: 'Boiler / pressure vessel', median: 291, p75: 346, n: 1781 },
];

/** Construction permit totals by year — the trend behind rising fees. */
export const CN_BY_YEAR: Array<{ year: number; n: number; median: number; p90: number }> = [
  { year: 2020, n: 7291, median: 1610, p90: 10971 },
  { year: 2021, n: 6905, median: 2038, p90: 11268 },
  { year: 2022, n: 6329, median: 2920, p90: 12692 },
  { year: 2023, n: 5173, median: 2960, p90: 11770 },
  { year: 2024, n: 5548, median: 3275, p90: 12392 },
  { year: 2025, n: 5714, median: 3591, p90: 13003 },
];

/** Pick the matching real-world band for a project. */
export function benchmarkFor(kind: 'new' | 'altAdd', projectCost: number) {
  const table = kind === 'new' ? BY_COST_NEW : BY_COST_ALT;
  return table.find((b) => projectCost >= b.lo && projectCost < b.hi) || table[table.length - 1];
}
