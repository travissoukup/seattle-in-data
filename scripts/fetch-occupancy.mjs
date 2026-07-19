// Builds src/lib/generated/occupancy.json from Certificates of Occupancy (axkr-2p68).
// DATE TRAP: certificate_of_occupancy_date is MM/DD/YYYY TEXT, so we fetch raw rows
// and parse the year in JS. occupancy_type_s is comma-separated multi-value.
// Run: node scripts/fetch-occupancy.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, count } from './lib/socrata.mjs';

const ID = 'axkr-2p68';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'occupancy.json');
const SELECT = 'certificate_of_occupancy_date,occupancy_type_s';

// Paginate past any single-request cap so we never silently sample as the
// dataset grows. Ordered by :id so pages don't overlap.
const PAGE = 5000;
const raw = [];
for (let offset = 0; ; offset += PAGE) {
  const page = soql(ID, { $select: SELECT, $order: ':id', $limit: String(PAGE), $offset: String(offset) });
  raw.push(...page);
  if (page.length < PAGE) break;
}

// Parse the year from the MM/DD/YYYY text date.
const yearOf = (s) => {
  if (!s) return null;
  const parts = String(s).split('/');
  if (parts.length !== 3) return null;
  const y = Number(parts[2]);
  return Number.isFinite(y) && y > 1990 && y < 2100 ? y : null;
};

// Count certificates per year, and apartment/condo (R-2) certificates per year.
const perYear = new Map();
const aptPerYear = new Map();
let withDate = 0;
for (const r of raw) {
  const y = yearOf(r.certificate_of_occupancy_date);
  if (y == null) continue;
  withDate++;
  perYear.set(y, (perYear.get(y) || 0) + 1);
  if (String(r.occupancy_type_s || '').includes('R-2 Apartment')) {
    aptPerYear.set(y, (aptPerYear.get(y) || 0) + 1);
  }
}

// The current calendar year is always censored: trim it from the trend and
// report it separately as a "so far" number.
const currentYear = new Date().getFullYear();
const allYears = [...perYear.keys()].sort((a, b) => a - b);
const fullYears = allYears.filter((y) => y < currentYear);
let partialN = 0;
for (const y of allYears) if (y >= currentYear) partialN += perYear.get(y);
const partial = { y: String(currentYear), n: partialN };

// Leading partial coverage: the record is thin before it settles. Trim leading
// years whose count is under half the busiest year's count.
const maxN = Math.max(...fullYears.map((y) => perYear.get(y)));
let coverageStart = fullYears[0];
for (const y of fullYears) {
  if (perYear.get(y) >= maxN / 2) {
    coverageStart = y;
    break;
  }
}
const trendYears = fullYears.filter((y) => y >= coverageStart);
let earlyTrimmedN = 0;
for (const y of fullYears) if (y < coverageStart) earlyTrimmedN += perYear.get(y);

const trend = trendYears.map((y) => ({ y: String(y), n: perYear.get(y) }));

// Busiest and latest complete years.
let busiest = { y: null, n: 0 };
for (const t of trend) if (t.n > busiest.n) busiest = { y: t.y, n: t.n };
const latestFull = trend.length ? trend[trend.length - 1] : { y: null, n: 0 };

// Apartment share per full covered year.
const aptTrend = trendYears.map((y) => {
  const total = perYear.get(y);
  const apt = aptPerYear.get(y) || 0;
  return { y: String(y), apt, total, share: Number(((100 * apt) / total).toFixed(1)) };
});
let aptPeak = aptTrend[0];
for (const t of aptTrend) if (t.share > aptPeak.share) aptPeak = t;
const aptFirst = aptTrend[0];
const aptLatest = aptTrend[aptTrend.length - 1];

// Pace comparison: the last four complete years vs the late-2010s baseline.
const recentStartY = currentYear - 4;
const recentEndY = currentYear - 1;
const baseStartY = 2015;
const baseEndY = 2019;
const avg = (from, to) => {
  const ys = trendYears.filter((y) => y >= from && y <= to);
  if (!ys.length) return 0;
  return Math.round(ys.reduce((s, y) => s + perYear.get(y), 0) / ys.length);
};
const recentAvg = avg(recentStartY, recentEndY);
const baseAvg = avg(baseStartY, baseEndY);
const dropPct = baseAvg ? Math.round(100 * (1 - recentAvg / baseAvg)) : 0;

// Bars by occupancy type. The column is comma-separated multi-value: split and count each.
const typeCounts = new Map();
for (const r of raw) {
  const v = r.occupancy_type_s;
  if (!v) continue;
  for (const part of String(v).split(',')) {
    const t = part.trim();
    if (t) typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
}
const topTypes = [...typeCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([key, n]) => ({ key, n }));

const total = count(ID);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    withDate,
    currentYear,
    partial,
    latestFull,
    busiest,
    coverageStart,
    earlyTrimmedN,
    trend,
    aptTrend,
    aptFirst,
    aptPeak,
    aptLatest,
    recentStartY,
    recentEndY,
    recentAvg,
    baseStartY,
    baseEndY,
    baseAvg,
    dropPct,
    topTypes,
  }),
);
console.log(`occupancy.json: rows=${raw.length} total=${total} withDate=${withDate} years=${trend.length} types=${topTypes.length}`);
console.log(`coverage from ${coverageStart} (trimmed ${earlyTrimmedN} earlier certs); partial ${partial.y} so far: ${partial.n}`);
console.log(`latest full ${latestFull.y} (${latestFull.n}), busiest ${busiest.y} (${busiest.n})`);
console.log(`pace: ${baseStartY}-${baseEndY} avg ${baseAvg}/yr vs ${recentStartY}-${recentEndY} avg ${recentAvg}/yr (down ${dropPct}%)`);
console.log(`apt share: ${aptFirst.y} ${aptFirst.share}%, peak ${aptPeak.y} ${aptPeak.share}% (${aptPeak.apt}/${aptPeak.total}), ${aptLatest.y} ${aptLatest.share}%`);
