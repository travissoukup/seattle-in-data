// Builds src/lib/generated/encampments.json from Unauthorized Encampment Reports (k7ra-jqqe),
// a 311-style feed of requests asking the city to look at a possible encampment.
// Run: node scripts/fetch-encampments.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';
import { rollup, ZIP_META } from './lib/zipgeo.mjs';

const ID = 'k7ra-jqqe';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'encampments.json');

const titleCase = (s) =>
  String(s)
    .toLowerCase()
    .replace(/(^|[\s/.\-("])([a-z])/g, (m, p, c) => p + c.toUpperCase());

const total = count(ID);

// Date bounds drive every cutoff below; nothing is hardcoded to a calendar date.
const bounds = soql(ID, { $select: 'min(createddate) as first, max(createddate) as last' })[0];
const firstDate = new Date(bounds.first);
const lastDate = new Date(bounds.last);
const now = new Date();
const currentYear = now.getFullYear();
const asOfLabel = lastDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
const firstMonthLabel = firstDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// Yearly counts, all reports and the Find It Fix It slice, for the surge chart.
const yAll = soql(ID, {
  $select: 'date_extract_y(createddate) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
}).map((r) => ({ y: num(r.y), n: num(r.n) }));
const yFifi = soql(ID, {
  $select: 'date_extract_y(createddate) as y, count(*) as n',
  $where: "methodreceivedname = 'Find It Fix It Apps'",
  $group: 'y',
  $order: 'y',
}).map((r) => ({ y: num(r.y), n: num(r.n) }));
const fifiByYear = Object.fromEntries(yFifi.map((r) => [r.y, r.n]));
const yearly = yAll.map((r) => ({
  year: r.y === currentYear ? `${r.y} so far` : String(r.y),
  n: r.n,
  app: fifiByYear[r.y] || 0,
}));

const baseYear = yAll[0].y;
const baseN = yAll[0].n;
const complete = yAll.filter((r) => r.y < currentYear);
const peak = complete.reduce((a, b) => (b.n >= a.n ? b : a), complete[0]);
const peakYear = peak.y;
const peakN = peak.n;
const surgeMultiple = Math.round(peakN / baseN);
const ytdN = yAll.find((r) => r.y === currentYear)?.n ?? 0;

// How reports arrive. Top channels named, the long tail rolled up.
const mGrp = group(ID, 'methodreceivedname', { limit: 30 })
  .map((r) => ({ key: r.methodreceivedname, n: r.n }))
  .filter((r) => r.key);
const fifiN = mGrp.find((r) => r.key === 'Find It Fix It Apps')?.n ?? 0;
const phoneN = mGrp.find((r) => r.key === 'Phone')?.n ?? 0;
const fifiPct = Math.round((fifiN / total) * 100);
const appPhoneRatio = phoneN ? Math.round(fifiN / phoneN) : 0;
const namedMethods = mGrp.slice(0, 7);
const tailN = mGrp.slice(7).reduce((s, r) => s + r.n, 0);
const byMethod = [...namedMethods, ...(tailN ? [{ key: 'Everything else', n: tailN }] : [])];

// Statuses, with the two duplicate labels merged into one.
const sGrp = group(ID, 'servicerequeststatusname', { limit: 12 })
  .map((r) => ({ key: r.key ?? r.servicerequeststatusname, n: r.n }))
  .filter((r) => r.key);
const statusMerged = {};
for (const r of sGrp) {
  const key = r.key === 'Closed as Duplicate' ? 'Duplicate (Closed)' : r.key;
  statusMerged[key] = (statusMerged[key] || 0) + r.n;
}
const byStatus = Object.entries(statusMerged)
  .map(([key, n]) => ({ key, n }))
  .sort((a, b) => b.n - a.n);
const dupN = statusMerged['Duplicate (Closed)'] || 0;
const dupPct = Math.round((dupN / total) * 1000) / 10;

// Neighborhoods. The null bucket is large (reports before mid-2022 carry no
// area tag), so count it explicitly instead of dropping it in silence.
const aGrp = group(ID, 'community_reporting_area', { limit: 40 });
const noArea = num(aGrp.find((r) => !r.community_reporting_area)?.n);
const noAreaPct = Math.round((noArea / total) * 100);
const namedAreas = aGrp.filter((r) => r.community_reporting_area);
const byArea = namedAreas.slice(0, 12).map((r) => ({ key: titleCase(r.community_reporting_area), n: r.n }));

// First year in which most reports carried an area tag: the practical start of tagging.
const taggedByYear = soql(ID, {
  $select: 'date_extract_y(createddate) as y, count(*) as n',
  $where: 'community_reporting_area IS NOT NULL',
  $group: 'y',
  $order: 'y',
}).map((r) => ({ y: num(r.y), n: num(r.n) }));
const taggedMap = Object.fromEntries(taggedByYear.map((r) => [r.y, r.n]));
const areaTagYear = yAll.find((r) => (taggedMap[r.y] || 0) / r.n >= 0.5)?.y ?? yAll[0].y;

// Per-area yearly drilldown for the 15 busiest areas, from the tagging start.
const topAreaKeys = namedAreas.slice(0, 15).map((r) => r.community_reporting_area);
const ayRaw = soql(ID, {
  $select: 'community_reporting_area as area, date_extract_y(createddate) as y, count(*) as n',
  $where: `community_reporting_area IS NOT NULL AND createddate >= '${areaTagYear}-01-01'`,
  $group: 'area, y',
  $order: 'area, y',
  $limit: '5000',
}).map((r) => ({ area: r.area, y: num(r.y), n: num(r.n) }));
const areaYearly = topAreaKeys.map((key) => {
  const rowsFor = ayRaw.filter((r) => r.area === key);
  return {
    area: titleCase(key),
    years: rowsFor.map((r) => ({ year: r.y === currentYear ? `${r.y} so far` : String(r.y), n: r.n })),
  };
});

// Areas whose partial current year already beats their full previous year.
const prevYear = currentYear - 1;
const passed = [];
for (const key of topAreaKeys) {
  const ytd = ayRaw.find((r) => r.area === key && r.y === currentYear)?.n ?? 0;
  const prev = ayRaw.find((r) => r.area === key && r.y === prevYear)?.n ?? 0;
  if (prev > 0 && ytd >= prev) passed.push({ area: titleCase(key), ytd, prev });
}
passed.sort((a, b) => b.ytd - a.ytd);
const examplePassed = passed[0] ?? null;

// Monthly trend across the whole dataset, partial months trimmed at both ends.
const monthStart = new Date(firstDate.getFullYear(), firstDate.getDate() > 1 ? firstDate.getMonth() + 1 : firstDate.getMonth(), 1);
const endCandidates = [new Date(now.getFullYear(), now.getMonth(), 1), new Date(lastDate.getFullYear(), lastDate.getMonth(), 1)];
const monthEnd = new Date(Math.min(...endCandidates.map((d) => d.getTime())));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const monthly = soql(ID, {
  $select: 'date_trunc_ym(createddate) as ym, count(*) as n',
  $group: 'ym',
  $order: 'ym',
  $where: `createddate >= '${iso(monthStart)}' AND createddate < '${iso(monthEnd)}'`,
}).map((r) => ({ ym: (r.ym || '').slice(0, 7), n: num(r.n) }));

const since12 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const last12 = count(ID, `createddate > '${since12}'`);
const since30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const last30 = count(ID, `createddate > '${since30}'`);

const raw = rows(ID, {
  select: 'latitude,longitude,servicerequeststatusname,createddate',
  where: 'latitude IS NOT NULL',
  order: 'createddate DESC',
  limit: 6000,
});
const points = raw
  .map((r) => ({
    lat: num(r.latitude),
    lng: num(r.longitude),
    s: r.servicerequeststatusname || 'Unknown',
    d: (r.createddate || '').slice(0, 10),
  }))
  .filter((p) => inSeattle(p.lat, p.lng));

// Per-ZIP comparison over a true 12-month window (the dataset has a zip field,
// so a group-by covers every report in the window, not a sample).
const todayStr = new Date().toISOString().slice(0, 10);
const grp = group(ID, 'zipcode', {
  where: "createddate > '" + since12 + "' AND createddate <= '" + todayStr + "'",
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
    total,
    last12,
    last30,
    asOfLabel,
    firstMonthLabel,
    currentYear,
    prevYear,
    yearly,
    baseYear,
    baseN,
    peakYear,
    peakN,
    surgeMultiple,
    ytdN,
    fifiN,
    fifiPct,
    phoneN,
    appPhoneRatio,
    byMethod,
    byStatus,
    dupN,
    dupPct,
    noArea,
    noAreaPct,
    areaTagYear,
    byArea,
    areaYearly,
    topAreaCount: topAreaKeys.length,
    passedCount: passed.length,
    examplePassed,
    monthly,
    points,
    areaByZip,
  }),
);
console.log(`encampments.json: total=${total} last12=${last12} last30=${last30} statuses=${byStatus.length} areas=${byArea.length} points=${points.length} months=${monthly.length}`);
console.log(`surge: ${baseYear}=${baseN} peak ${peakYear}=${peakN} (${surgeMultiple}x) ytd ${currentYear}=${ytdN}`);
console.log(`method: Find It Fix It=${fifiN} (${fifiPct}%) phone=${phoneN} ratio=${appPhoneRatio}:1`);
console.log(`area tags: ${noArea} untagged (${noAreaPct}%), tagging majority since ${areaTagYear}`);
console.log(`duplicates: ${dupN} (${dupPct}%)`);
console.log(`drilldown: ${areaYearly.length} areas; passed prev year: ${passed.map((p) => `${p.area} ${p.ytd} vs ${p.prev}`).join('; ') || 'none'}`);
console.log(`zip window: cityRate=${areaByZip.cityRate} top=${areaByZip.zips[0]?.zip} ${areaByZip.zips[0]?.label} (${areaByZip.zips[0]?.per1000}/1k, n=${areaByZip.zips[0]?.count})`);
