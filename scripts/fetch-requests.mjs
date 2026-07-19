// Builds src/lib/generated/requests.json from Customer Service Requests (5ngg-rpne),
// the Find It Fix It / 311 feed. Run: node scripts/fetch-requests.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';
import { rollup, ZIP_META } from './lib/zipgeo.mjs';

const ID = '5ngg-rpne';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'requests.json');

// ---- computed period cutoffs ----
const now = new Date();
const CUR_YEAR = now.getUTCFullYear();
const LAST_FULL_YEAR = CUR_YEAR - 1; // most recent complete calendar year
const BASE_YEAR = LAST_FULL_YEAR - 4; // rolling 4-year comparison base
// 2019 is the last calendar year before the COVID reporting dip; a fixed
// historical anchor, used as the start of the monthly trend so the chart shows
// the dip and the recovery instead of growth off a depressed base.
const PRE_PANDEMIC_YEAR = 2019;
const firstOfCurrentMonth = `${now.toISOString().slice(0, 7)}-01`;

// ---- category merges ----
// The city renamed 'Abandoned Vehicle' to 'Abandoned Vehicle/72hr Parking
// Ordinance' in 2021 (the old label ends exactly where the new one begins), and
// split 'Street Sign and Traffic Signal Maintenance' into two categories in
// 2023. Merge them so one complaint stream counts as one category.
const ALIAS = {
  'Abandoned Vehicle': 'Abandoned Vehicle / 72hr Parking',
  'Abandoned Vehicle/72hr Parking Ordinance': 'Abandoned Vehicle / 72hr Parking',
  'Street Sign Maintenance': 'Street Sign and Traffic Signal Maintenance',
  'Traffic Signal Maintenance': 'Street Sign and Traffic Signal Maintenance',
};
const canon = (t) => ALIAS[t] || t;

function mergeCounts(rowsIn, keyField) {
  const m = new Map();
  for (const r of rowsIn) {
    const k = canon(r[keyField]);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + num(r.n));
  }
  return [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}

// ---- top types (merged) and departments ----
const topTypes = mergeCounts(group(ID, 'webintakeservicerequests', { limit: 60 }), 'webintakeservicerequests').slice(0, 12);

const byDept = group(ID, 'departmentname', { limit: 10 })
  .map((r) => ({ key: (r.departmentname || '').replace(/^[A-Z]+-/, ''), n: r.n }))
  .filter((r) => r.key);

// ---- monthly trend: complete months only, from the pre-pandemic year ----
const monthly = soql(ID, {
  $select: 'date_trunc_ym(createddate) as ym, count(*) as n',
  $group: 'ym',
  $order: 'ym',
  $where: `createddate >= '${PRE_PANDEMIC_YEAR}-01-01' AND createddate < '${firstOfCurrentMonth}'`,
}).map((r) => ({ ym: (r.ym || '').slice(0, 7), n: num(r.n) }));

const total = count(ID);
const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const last30 = count(ID, `createddate > '${since}'`);

// ---- yearly totals and method-of-intake, complete years only ----
const methodRaw = soql(ID, {
  $select: 'date_extract_y(createddate) as y, methodreceivedname as m, count(*) as n',
  $group: 'y, m',
  $order: 'y',
  $where: `createddate < '${CUR_YEAR}-01-01'`,
  $limit: '2000',
});
const WEB = new Set(['Citizen Web', 'Citizen Web Intake App', 'Web Form']);
const PHONE = new Set(['Phone', 'Voice Mail', 'AV Hotline', 'Non-Emergency 911 Phone']);
const methodByYear = new Map();
for (const r of methodRaw) {
  const y = num(r.y);
  if (!y || y > LAST_FULL_YEAR) continue;
  const row = methodByYear.get(y) || { y, fifi: 0, web: 0, phone: 0, other: 0, total: 0 };
  const n = num(r.n);
  const m = r.m || '';
  if (m === 'Find It Fix It Apps') row.fifi += n;
  else if (WEB.has(m)) row.web += n;
  else if (PHONE.has(m)) row.phone += n;
  else row.other += n;
  row.total += n;
  methodByYear.set(y, row);
}
const methodYearly = [...methodByYear.values()].sort((a, b) => a.y - b.y);
const yearly = methodYearly.map((r) => ({ y: r.y, n: r.total }));
const firstYear = yearly[0]?.y ?? null;

const yearTotal = (y) => yearly.find((r) => r.y === y)?.n ?? 0;
const baseTotal = yearTotal(BASE_YEAR);
const lastTotal = yearTotal(LAST_FULL_YEAR);
const growthX = baseTotal ? Math.round((lastTotal / baseTotal) * 10) / 10 : null;
const prePandemicTotal = yearTotal(PRE_PANDEMIC_YEAR);
const vsPrePandemicPct = prePandemicTotal ? Math.round(((lastTotal - prePandemicTotal) / prePandemicTotal) * 100) : null;

const lastMethod = methodYearly.find((r) => r.y === LAST_FULL_YEAR) || { fifi: 0, phone: 0 };
const baseMethod = methodYearly.find((r) => r.y === BASE_YEAR) || { fifi: 0 };
const fifiLast = lastMethod.fifi;
const fifiBase = baseMethod.fifi;
const phoneLast = lastMethod.phone;
const fifiShare = lastTotal ? Math.round((fifiLast / lastTotal) * 100) : null;
const phoneShare = lastTotal ? Math.round((phoneLast / lastTotal) * 100) : null;

// ---- type-by-year matrix (merged), complete years, for the drilldown ----
const typeRaw = soql(ID, {
  $select: 'date_extract_y(createddate) as y, webintakeservicerequests as t, count(*) as n',
  $group: 'y, t',
  $order: 'y',
  $where: `createddate < '${CUR_YEAR}-01-01'`,
  $limit: '20000',
});
const typeMap = new Map(); // key -> Map(year -> n)
for (const r of typeRaw) {
  const y = num(r.y);
  const k = canon(r.t);
  if (!k || !y || y > LAST_FULL_YEAR) continue;
  const m = typeMap.get(k) || new Map();
  m.set(y, (m.get(y) || 0) + num(r.n));
  typeMap.set(k, m);
}
const typeYears = yearly.map((r) => r.y);
const typeSeries = topTypes
  .map((t) => {
    const m = typeMap.get(t.key) || new Map();
    const present = typeYears.filter((y) => (m.get(y) || 0) > 0);
    const lo = present[0], hi = present[present.length - 1];
    // null outside the category's lifetime so a category created mid-history
    // does not plot as a run of fake zeros.
    const values = typeYears.map((y) => (y < lo || y > hi ? null : m.get(y) || 0));
    return { key: t.key, values };
  })
  .filter((s) => s.values.some((v) => v != null));

// ---- the encampment share of growth ----
const encVals = typeSeries.find((s) => s.key === 'Unauthorized Encampment')?.values ?? [];
const encStartIdx = encVals.findIndex((v) => v != null);
const encStartYear = encStartIdx >= 0 ? typeYears[encStartIdx] : null;
const encStartN = encStartIdx >= 0 ? encVals[encStartIdx] : null;
const encLastN = encVals[typeYears.indexOf(LAST_FULL_YEAR)] ?? null;
const encGrowthDen = lastTotal - yearTotal(encStartYear);
const encShareOfGrowth = encStartYear && encGrowthDen > 0 ? Math.round(((encLastN - encStartN) / encGrowthDen) * 100) : null;
const encShareLast = lastTotal && encLastN != null ? Math.round((encLastN / lastTotal) * 100) : null;
const dumpVals = typeSeries.find((s) => s.key === 'Illegal Dumping / Needles')?.values ?? [];
const dumpStart = encStartYear ? dumpVals[typeYears.indexOf(encStartYear)] ?? null : null;
const dumpLast = dumpVals[typeYears.indexOf(LAST_FULL_YEAR)] ?? null;
const enc = { startYear: encStartYear, startN: encStartN, lastN: encLastN, shareOfGrowth: encShareOfGrowth, shareLast: encShareLast, dumpStart, dumpLast };

// ---- recent points for the map ----
const raw = rows(ID, {
  select: 'latitude,longitude,webintakeservicerequests,createddate',
  where: 'latitude IS NOT NULL',
  order: 'createddate DESC',
  limit: 6000,
});
const points = raw
  .map((r) => ({ lat: num(r.latitude), lng: num(r.longitude), t: canon(r.webintakeservicerequests) || 'Other', d: (r.createddate || '').slice(0, 10) }))
  .filter((p) => inSeattle(p.lat, p.lng));

// ---- per-ZIP comparison over a true 12-month window (zipcode group-by) ----
const todayStr = now.toISOString().slice(0, 10);
const since365 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const grp = group(ID, 'zipcode', {
  where: "createddate > '" + since365 + "' AND createddate <= '" + todayStr + "'",
  limit: 80,
});
const counts = {};
for (const r of grp) {
  const z = r.zipcode;
  if (z && ZIP_META[z]) counts[z] = r.n;
}
const areaByZip = rollup(counts, 'the last 12 months');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total, last30, topTypes, byDept,
    monthly, prePandemicYear: PRE_PANDEMIC_YEAR,
    yearly, firstYear, baseYear: BASE_YEAR, lastFullYear: LAST_FULL_YEAR,
    baseTotal, lastTotal, growthX, prePandemicTotal, vsPrePandemicPct,
    methodYearly, fifiLast, fifiBase, phoneLast, fifiShare, phoneShare,
    typeYears, typeSeries, enc,
    points, areaByZip,
  }),
);
console.log(`requests.json: total=${total} last30=${last30} types=${topTypes.length} points=${points.length} months=${monthly.length}`);
console.log('top types (merged):', topTypes.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
console.log(`years ${firstYear}..${LAST_FULL_YEAR}; ${BASE_YEAR}=${baseTotal} ${LAST_FULL_YEAR}=${lastTotal} growthX=${growthX} vsPrePandemic=+${vsPrePandemicPct}%`);
console.log(`method ${LAST_FULL_YEAR}: fifi=${fifiLast} (${fifiShare}%) phone=${phoneLast} (${phoneShare}%)`);
console.log(`encampment: ${enc.startYear}=${enc.startN} ${LAST_FULL_YEAR}=${enc.lastN} shareOfGrowth=${enc.shareOfGrowth}% shareOfLastYear=${enc.shareLast}% dumping ${enc.dumpStart}->${enc.dumpLast}`);
console.log(`areaByZip: cityRate=${areaByZip.cityRate}/1k over ${areaByZip.windowLabel}; top ZIP ${areaByZip.zips[0]?.zip} ${areaByZip.zips[0]?.label} rate=${areaByZip.zips[0]?.per1000} count=${areaByZip.zips[0]?.count}`);
