// Builds src/lib/generated/violations.json from SDCI Code Enforcement (ez4a-iug7).
// Run: node scripts/fetch-violations.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';
import { rollup, ZIP_META } from './lib/zipgeo.mjs';

const ID = 'ez4a-iug7';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'violations.json');

const now = new Date();
const currentYear = now.getFullYear();
const todayStr = now.toISOString().slice(0, 10);

// Blank types become their own bar, and the raw "Emergency , X" variants fold into X
// so the ranking is not fragmented. The emergency trend below counts them on their own.
const EM_PREFIX = 'Emergency , ';
const normType = (k) => {
  if (!k) return 'Not classified';
  return k.startsWith(EM_PREFIX) ? k.slice(EM_PREFIX.length) : k;
};

// Full-year window: the dataset starts mid-year, so the first calendar year is a
// censored partial and gets trimmed, as does the (also partial) current year.
// A few rows carry future open dates; the trailing trim drops those too.
const dataStart = String(soql(ID, { $select: 'min(opendate) as mn' })[0]?.mn ?? '').slice(0, 10);
const startYear = Number(dataStart.slice(0, 4));
const firstFullYear = dataStart.slice(5) === '01-01' ? startYear : startYear + 1;
const lastFullYear = currentYear - 1;
const fullYearsWhere = `opendate >= '${firstFullYear}-01-01' AND opendate < '${currentYear}-01-01'`;

const total = count(ID);

// Ranked types, merged, with the tail rolled up so every case is on the chart.
const descRaw = group(ID, 'recordtypedesc', { limit: 500 });
const mergedCounts = new Map();
for (const r of descRaw) {
  const k = normType(r.recordtypedesc);
  mergedCounts.set(k, (mergedCounts.get(k) || 0) + r.n);
}
const mergedSorted = [...mergedCounts.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
const topDesc = mergedSorted.slice(0, 9);
const byDesc = [...topDesc, { key: 'Everything else', n: total - topDesc.reduce((s, d) => s + d.n, 0) }];

// Yearly totals, full years only.
const yearly = soql(ID, {
  $select: 'date_extract_y(opendate) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: fullYearsWhere,
}).map((r) => ({ y: String(num(r.y)), n: num(r.n) }));

// Yearly counts for the top merged types (the landlord/tenant story lives here).
const typeKeys = byDesc.slice(0, 5).map((d) => d.key);
const tyRaw = soql(ID, {
  $select: 'date_extract_y(opendate) as y, recordtypedesc, count(*) as n',
  $group: 'y,recordtypedesc',
  $where: fullYearsWhere,
  $limit: '5000',
});
const tyMap = new Map();
for (const r of tyRaw) {
  const y = String(num(r.y));
  const k = normType(r.recordtypedesc);
  if (!typeKeys.includes(k)) continue;
  if (!tyMap.has(y)) tyMap.set(y, {});
  const row = tyMap.get(y);
  row[k] = (row[k] || 0) + num(r.n);
}
const typeYearly = [...tyMap.entries()]
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([y, counts]) => {
    const row = { y };
    for (const k of typeKeys) row[k] = counts[k] || 0;
    return row;
  });

// Landlord/tenant channel: the category is near zero until it switches on.
const llKey = 'LandLord/Tenant';
const llFirstBigYear = typeYearly.find((r) => num(r[llKey]) >= 100)?.y ?? null;
const llLastN = num(typeYearly[typeYearly.length - 1]?.[llKey]);

// Emergency cases per year (any type starting with "Emergency"), full years only.
const emWhere = "recordtypedesc LIKE 'Emergency%'";
const emYearly = soql(ID, {
  $select: 'date_extract_y(opendate) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: `${emWhere} AND ${fullYearsWhere}`,
}).map((r) => ({ y: String(num(r.y)), n: num(r.n) }));
const emBaseYear = lastFullYear - 3;
const emBaseN = num(emYearly.find((r) => r.y === String(emBaseYear))?.n);
const emLastN = num(emYearly.find((r) => r.y === String(lastFullYear))?.n);
const plateau = emYearly.filter((r) => Number(r.y) <= emBaseYear).map((r) => r.n);
const em = {
  yearly: emYearly,
  baseYear: emBaseYear,
  baseN: emBaseN,
  lastYear: lastFullYear,
  lastN: emLastN,
  factor: emBaseN > 0 ? Math.round(emLastN / emBaseN) : null,
  plateauMin: plateau.length ? Math.min(...plateau) : null,
  plateauMax: plateau.length ? Math.max(...plateau) : null,
  ytd: count(ID, `${emWhere} AND opendate >= '${currentYear}-01-01' AND opendate <= '${todayStr}'`),
};

// Weeds seasonality: all-time counts by month of year.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weedsRaw = soql(ID, {
  $select: 'date_extract_m(opendate) as m, count(*) as n',
  $group: 'm',
  $order: 'm',
  $where: "recordtypedesc = 'Weeds'",
}).map((r) => ({ m: num(r.m), n: num(r.n) }));
const weedsMonthly = weedsRaw.map((r) => ({ m: MONTHS[r.m - 1].slice(0, 3), n: r.n }));
const wPeak = weedsRaw.reduce((a, b) => (b.n > a.n ? b : a));
const wLow = weedsRaw.reduce((a, b) => (b.n < a.n ? b : a));
const weeds = {
  monthly: weedsMonthly,
  peakMonth: MONTHS[wPeak.m - 1],
  peakN: wPeak.n,
  lowMonth: MONTHS[wLow.m - 1],
  lowN: wLow.n,
  ratio: wLow.n > 0 ? Math.round((wPeak.n / wLow.n) * 10) / 10 : null,
};

// Open shares. The one that matters is the recent cohort: of cases opened in the
// last 12 months, how many are still open. The all-time share is kept for context.
const since365 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const openedLastYear = count(ID, `opendate > '${since365}'`);
const openStatus = "statuscurrent NOT IN ('Completed', 'Closed', 'Withdrawn')";
const openRecentCount = count(ID, `opendate > '${since365}' AND ${openStatus}`);
const recentOpenShare = openedLastYear ? openRecentCount / openedLastYear : 0;
// The cohort one year older, to show open shares fall as cases work through.
const since730 = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
const priorCohortWhere = `opendate > '${since730}' AND opendate <= '${since365}'`;
const priorCohortTotal = count(ID, priorCohortWhere);
const priorCohortOpen = count(ID, `${priorCohortWhere} AND ${openStatus}`);
const priorOpenShare = priorCohortTotal ? priorCohortOpen / priorCohortTotal : 0;
const openCount = count(ID, openStatus);
const openShare = total ? openCount / total : 0;

const raw = rows(ID, {
  select: 'latitude,longitude,recordtypedesc,opendate',
  where: 'latitude IS NOT NULL',
  order: 'opendate DESC',
  limit: 6000,
});
const points = raw
  .map((r) => ({ lat: num(r.latitude), lng: num(r.longitude), t: normType(r.recordtypedesc), d: (r.opendate || '').slice(0, 10) }))
  .filter((p) => inSeattle(p.lat, p.lng));

const grp = group(ID, 'originalzip', {
  where: `opendate > '${since365}' AND opendate <= '${todayStr}'`,
  limit: 80,
});
const counts = {};
for (const r of grp) {
  const z = r.originalzip;
  if (z && ZIP_META[z]) counts[z] = r.n;
}
const areaByZip = rollup(counts, 'the last 12 months');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    dataStart,
    firstFullYear,
    lastFullYear,
    currentYear,
    openedLastYear,
    openRecentCount,
    recentOpenShare,
    priorOpenShare,
    openCount,
    openShare,
    byDesc,
    typeKeys,
    typeYearly,
    llFirstBigYear,
    llLastN,
    em,
    weeds,
    yearly,
    points,
    areaByZip,
  }),
);
console.log(
  `violations.json: total=${total} window=${firstFullYear}..${lastFullYear} openedLast12mo=${openedLastYear} openRecent=${openRecentCount} recentShare=${(recentOpenShare * 100).toFixed(1)}% priorCohortShare=${(priorOpenShare * 100).toFixed(1)}% allTimeShare=${(openShare * 100).toFixed(1)}% descs=${byDesc.length} years=${yearly.length} points=${points.length}`,
);
console.log('top types:', byDesc.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
console.log(`emergency: base ${em.baseYear}=${em.baseN} last ${em.lastYear}=${em.lastN} factor=${em.factor}x ytd=${em.ytd} plateau=${em.plateauMin}..${em.plateauMax}`);
console.log(`landlord/tenant: first year >=100 is ${llFirstBigYear}, ${lastFullYear}=${llLastN}`);
console.log(`weeds: peak ${weeds.peakMonth}=${weeds.peakN} low ${weeds.lowMonth}=${weeds.lowN} ratio=${weeds.ratio}x`);
console.log(`areaByZip: cityRate=${areaByZip.cityRate} topZip=${areaByZip.zips[0]?.zip} (${areaByZip.zips[0]?.per1000}/1k, n=${areaByZip.zips[0]?.count})`);
