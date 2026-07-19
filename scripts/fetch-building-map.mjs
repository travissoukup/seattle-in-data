// Builds src/lib/generated/building-map.json from Building Permits (76t5-zqzr).
// Run: node scripts/fetch-building-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';
import { rollup, ZIP_META } from './lib/zipgeo.mjs';

const ID = '76t5-zqzr';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'building-map.json');

// Chart window: 2010 through the last complete calendar year. Records go back to
// 1986, so 2010 is a full leading year; the partial current year is trimmed.
const FIRST_CHART_YEAR = 2010;
const now = new Date();
const currentYear = now.getFullYear();
const lastFullYear = currentYear - 1;
const fullYearsWhere = `issueddate >= '${FIRST_CHART_YEAR}-01-01' AND issueddate < '${currentYear}-01-01'`;

// Yearly totals: permit count, new housing units, declared value.
const yearTotals = soql(ID, {
  $select: 'date_extract_y(issueddate) as y, count(*) as n, sum(housingunits) as units, sum(estprojectcost) as val',
  $group: 'y',
  $order: 'y',
  $where: fullYearsWhere,
}).map((r) => ({ y: num(r.y), n: num(r.n), units: Math.round(num(r.units)), val: Math.round(num(r.val)) }));

// Yearly residential vs non-residential split, pivoted into the same rows.
const classRows = soql(ID, {
  $select: 'date_extract_y(issueddate) as y, permitclassmapped as c, count(*) as n',
  $group: 'y,c',
  $order: 'y',
  $where: fullYearsWhere,
  $limit: '500',
});
const byY = new Map(yearTotals.map((r) => [r.y, { ...r, res: 0, nonres: 0 }]));
for (const r of classRows) {
  const row = byY.get(num(r.y));
  if (!row) continue;
  if (r.c === 'Residential') row.res += num(r.n);
  else if (r.c === 'Non-Residential') row.nonres += num(r.n);
}
const yearly = [...byY.values()].sort((a, b) => a.y - b.y);

// Derived headline stats, all computed so the copy never goes stale.
const last = yearly[yearly.length - 1];
const unitsPeak = yearly.reduce((a, b) => (b.units > a.units ? b : a));
const unitsDropPct = Math.round((1 - last.units / unitsPeak.units) * 100);
// First year of the current stretch where units run at roughly half the peak
// (under 60 percent of it), counted back from the latest full year.
let streakStartY = last.y;
for (let i = yearly.length - 1; i >= 0 && yearly[i].units / unitsPeak.units < 0.6; i--) streakStartY = yearly[i].y;
const valuePeak = yearly.reduce((a, b) => (b.val > a.val ? b : a));
const countPeak = yearly.reduce((a, b) => (b.n > a.n ? b : a));
// The divergence stat: how far the record-value year's permit COUNT sat below the count peak.
const countBelowPeakPct = Math.round((1 - valuePeak.n / countPeak.n) * 100);

// Bars: permits by type.
const byType = group(ID, 'permittypemapped', { limit: 12 })
  .map((r) => ({ key: r.permittypemapped, n: r.n }))
  .filter((r) => r.key);

// Totals. The dataset holds every application on record; a large share never
// reached issuance (withdrawn, canceled, still in review), so count both.
const total = count(ID);
const issued = count(ID, 'issueddate IS NOT NULL');
const neverIssuedPct = Math.round(((total - issued) / total) * 100);
const lastYearIssued = count(ID, `issueddate >= '${lastFullYear}-01-01' AND issueddate < '${currentYear}-01-01'`);
const valueRow = soql(ID, { $select: 'sum(estprojectcost) as s' })[0];
const totalValue = num(valueRow?.s);

// Map points: recent issued permits with coordinates.
const raw = rows(ID, {
  select: 'latitude,longitude,permitclassmapped,issueddate,originaladdress1,estprojectcost',
  where: 'issueddate IS NOT NULL AND latitude IS NOT NULL',
  order: 'issueddate DESC',
  limit: 6000,
});
const points = raw
  .map((r) => ({
    lat: num(r.latitude),
    lng: num(r.longitude),
    t: r.permitclassmapped || 'N/A',
    d: (r.issueddate || '').slice(0, 10),
    a: r.originaladdress1 || '',
  }))
  .filter((p) => inSeattle(p.lat, p.lng));

// Per-ZIP comparison: permits issued in the last 12 months.
const todayStr = now.toISOString().slice(0, 10);
const since365 = new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const zipGrp = group(ID, 'originalzip', {
  where: `issueddate > '${since365}' AND issueddate <= '${todayStr}'`,
  limit: 80,
});
const zipCounts = {};
for (const r of zipGrp) {
  const z = r.originalzip;
  if (z && ZIP_META[z]) zipCounts[z] = r.n;
}
const areaByZip = rollup(zipCounts, 'the last 12 months');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    issued,
    neverIssuedPct,
    currentYear,
    lastFullYear,
    firstChartYear: FIRST_CHART_YEAR,
    lastYearIssued,
    totalValue,
    yearly,
    units: { peakY: unitsPeak.y, peakN: unitsPeak.units, lastY: last.y, lastN: last.units, dropPct: unitsDropPct, streakStartY },
    valuePeak: { y: valuePeak.y, val: valuePeak.val, n: valuePeak.n },
    countPeak: { y: countPeak.y, n: countPeak.n },
    countBelowPeakPct,
    lastYearRes: last.res,
    lastYearNonres: last.nonres,
    byType,
    points,
    areaByZip,
  }),
);
console.log(
  `building-map.json: total=${total} issued=${issued} neverIssuedPct=${neverIssuedPct}% lastYearIssued(${lastFullYear})=${lastYearIssued} totalValue=${totalValue}`,
);
console.log(
  `units: peak ${unitsPeak.units} (${unitsPeak.y}) -> last ${last.units} (${last.y}), drop ${unitsDropPct}% | value peak ${valuePeak.val} (${valuePeak.y}) | count peak ${countPeak.n} (${countPeak.y}), last ${last.n} (${countBelowPeakPct}% below)`,
);
console.log(`years=${yearly.length} types=${byType.length} points=${points.length}`);
console.log(`areaByZip: cityRate=${areaByZip.cityRate} topZip=${areaByZip.zips[0]?.zip} (${areaByZip.zips[0]?.per1000}/1k, n=${areaByZip.zips[0]?.count})`);
console.log('top types:', byType.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
