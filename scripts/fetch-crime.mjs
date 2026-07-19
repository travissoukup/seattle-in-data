// Builds src/lib/generated/crime.json from SPD Crime Data (tazs-3rd5),
// the police report feed (NIBRS). Run: node scripts/fetch-crime.mjs
//
// Grain matters here: each row is one OFFENSE inside a police report, keyed by
// offense_id within report_number. One report can hold several offense rows, so
// report-level stats use count(distinct report_number) and offense-level stats
// say offenses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';
import { rollup, zipForPoint } from './lib/zipgeo.mjs';

const ID = 'tazs-3rd5';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'crime.json');

// Pretty labels for the three meaningful "crime against" buckets.
const CAT_LABEL = { PERSON: 'Person', PROPERTY: 'Property', SOCIETY: 'Society' };
const tidy = (s) => (s || '').replace(/\b\w/g, (c) => c.toUpperCase());

// Windows. The yearly series starts in 2012 (a chosen, stable series start; the
// feed has rows back to 2008 plus stray legacy dates). The end cutoff is
// computed so trailing partial years never show.
const SERIES_START_YEAR = 2012;
const currentYear = new Date().getFullYear();
const yearWhere = `report_date_time >= '${SERIES_START_YEAR}-01-01' AND report_date_time < '${currentYear}-01-01'`;

// Last 12 months window.
const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const NOT_JUNK_HOOD = "neighborhood NOT IN ('-','UNKNOWN','OOJ') AND neighborhood IS NOT NULL";

// Top offense groups over the last 12 months (offense rows). Drop placeholder labels.
const JUNK = new Set(['999', 'ALL OTHER', '-', '']);
const topOffenses = group(ID, 'offense_sub_category', {
  where: `report_date_time > '${since}'`,
  limit: 16,
})
  .map((r) => ({ key: r.offense_sub_category, n: r.n }))
  .filter((r) => r.key && !JUNK.has(r.key))
  .slice(0, 10)
  .map((r) => ({ key: tidy(r.key.toLowerCase()), n: r.n }));

// Crime-against category, last 12 months (Person / Property / Society only).
const byCategory = group(ID, 'nibrs_crime_against_category', {
  where: `report_date_time > '${since}'`,
  limit: 10,
})
  .map((r) => ({ key: r.nibrs_crime_against_category, n: r.n }))
  .filter((r) => CAT_LABEL[r.key])
  .map((r) => ({ key: CAT_LABEL[r.key], n: r.n }));

// Reports AND offense rows per year, one query.
const yearly = soql(ID, {
  $select: 'date_extract_y(report_date_time) as y, count(distinct report_number) as reports, count(*) as offenses',
  $group: 'y',
  $order: 'y',
  $where: yearWhere,
}).map((r) => ({ y: String(num(r.y)), reports: num(r.reports), offenses: num(r.offenses) }));

// The lead: which full year had the fewest police reports?
const lowest = yearly.reduce((a, b) => (b.reports < a.reports ? b : a));
const latest = yearly[yearly.length - 1];
const prev = yearly[yearly.length - 2];
const lowIsLatest = lowest.y === latest.y;
const dropPct = Math.round(((prev.reports - latest.reports) / prev.reports) * 1000) / 10;

// Motor vehicle theft by year (distinct reports; for MVT this is ~1 offense per report).
const mvtSeries = soql(ID, {
  $select: 'date_extract_y(report_date_time) as y, count(distinct report_number) as n',
  $group: 'y',
  $order: 'y',
  $where: `offense_sub_category = 'MOTOR VEHICLE THEFT' AND ${yearWhere}`,
}).map((r) => ({ y: String(num(r.y)), n: num(r.n) }));
const mvtPeak = mvtSeries.reduce((a, b) => (b.n > a.n ? b : a));
const mvtLatest = mvtSeries[mvtSeries.length - 1];
const mvt = {
  series: mvtSeries,
  peak: mvtPeak,
  latest: mvtLatest,
  dropPct: Math.round(((mvtPeak.n - mvtLatest.n) / mvtPeak.n) * 100),
  y2019: mvtSeries.find((r) => r.y === '2019')?.n ?? null,
};

// Reports that involve gunfire, by year. shooting_type_group is '-' on rows with
// no shooting; anything else is shots fired, a non-fatal injury, or a fatal one.
const shotSeries = soql(ID, {
  $select: 'date_extract_y(report_date_time) as y, count(distinct report_number) as n',
  $group: 'y',
  $order: 'y',
  $where: `shooting_type_group != '-' AND ${yearWhere}`,
}).map((r) => ({ y: String(num(r.y)), n: num(r.n) }));
const shotPeak = shotSeries.reduce((a, b) => (b.n > a.n ? b : a));
const shotLatest = shotSeries[shotSeries.length - 1];
// Last year before the latest one with a count at or below the latest count.
const shotLowSince = [...shotSeries].reverse().find((r) => r.y < shotLatest.y && r.n <= shotLatest.n);
const shootings = {
  series: shotSeries,
  peak: shotPeak,
  latest: shotLatest,
  y2019: shotSeries.find((r) => r.y === '2019')?.n ?? null,
  lowSinceYear: shotLowSince ? shotLowSince.y : null,
};

const total = count(ID);
const last12Agg = soql(ID, {
  $select: 'count(distinct report_number) as reports, count(*) as offenses',
  $where: `report_date_time > '${since}'`,
})[0];
const last12 = {
  reports: num(last12Agg.reports),
  offenses: num(last12Agg.offenses),
  perReport: Math.round((num(last12Agg.offenses) / num(last12Agg.reports)) * 100) / 100,
};
// Distinct real neighborhoods, same window as the sentence that cites them.
const neighborhoods = num(
  soql(ID, {
    $select: 'count(distinct neighborhood) as n',
    $where: `report_date_time > '${since}' AND ${NOT_JUNK_HOOD}`,
  })[0]?.n,
);

// Map sample: recent offense rows with coordinates, deduped to one dot per
// report (a report's offenses share a location).
const raw = rows(ID, {
  select: 'report_number,latitude,longitude,nibrs_crime_against_category,offense_sub_category,report_date_time',
  where: 'latitude IS NOT NULL',
  order: 'report_date_time DESC',
  limit: 7000,
});
const seenReports = new Set();
const points = [];
for (const r of raw) {
  if (seenReports.has(r.report_number)) continue;
  seenReports.add(r.report_number);
  const p = {
    lat: num(r.latitude),
    lng: num(r.longitude),
    t: CAT_LABEL[r.nibrs_crime_against_category] || 'Other',
    o: tidy((r.offense_sub_category || '').toLowerCase()),
    d: (r.report_date_time || '').slice(0, 10),
  };
  if (inSeattle(p.lat, p.lng)) points.push(p);
}

const topCategory = byCategory.slice().sort((a, b) => b.n - a.n)[0]?.key || 'Property';

// Neighborhood monthly trends. The neighborhood field is junk before 2017, so
// compute the first year where real names cover >=90% of rows and start there.
const hoodCoverage = soql(ID, {
  $select: 'date_extract_y(report_date_time) as y, count(*) as total',
  $group: 'y',
  $order: 'y',
  $where: yearWhere,
});
const hoodReal = soql(ID, {
  $select: 'date_extract_y(report_date_time) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: `${yearWhere} AND ${NOT_JUNK_HOOD}`,
});
const realByYear = Object.fromEntries(hoodReal.map((r) => [String(num(r.y)), num(r.n)]));
const hoodStartYear = num(
  hoodCoverage.find((r) => (realByYear[String(num(r.y))] || 0) / num(r.total) >= 0.9)?.y,
);
if (!hoodStartYear) throw new Error('no year with >=90% neighborhood coverage');

// Trailing partial month is trimmed: window ends at the first day of this month.
const now = new Date();
const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
const hoodRows = soql(ID, {
  $select: 'neighborhood, date_trunc_ym(report_date_time) as m, count(distinct report_number) as n',
  $group: 'neighborhood,m',
  $order: 'neighborhood,m',
  $where: `report_date_time >= '${hoodStartYear}-01-01' AND report_date_time < '${monthEnd}' AND ${NOT_JUNK_HOOD}`,
  $limit: '50000',
});
// Month axis, filled so every neighborhood has the same x values.
const months = [];
for (let y = hoodStartYear, m = 1; `${y}-${String(m).padStart(2, '0')}-01` < monthEnd; m === 12 ? (y++, (m = 1)) : m++) {
  months.push(`${y}-${String(m).padStart(2, '0')}`);
}
const monthIndex = Object.fromEntries(months.map((m, i) => [m, i]));
const hoodMap = new Map();
for (const r of hoodRows) {
  const name = tidy((r.neighborhood || '').toLowerCase());
  const i = monthIndex[(r.m || '').slice(0, 7)];
  if (i == null) continue;
  if (!hoodMap.has(name)) hoodMap.set(name, months.map(() => 0));
  hoodMap.get(name)[i] += num(r.n);
}
const hoods = [...hoodMap.entries()]
  .map(([name, n]) => ({ name, total: n.reduce((a, b) => a + b, 0), n }))
  .sort((a, b) => b.total - a.total);
const hoodMonthly = { startYear: hoodStartYear, months, hoods };

// Top neighborhoods by police reports over the last 12 months.
const topHoods = soql(ID, {
  $select: 'neighborhood, count(distinct report_number) as n',
  $group: 'neighborhood',
  $order: 'n DESC',
  $limit: '10',
  $where: `report_date_time > '${since}' AND ${NOT_JUNK_HOOD}`,
}).map((r) => ({ key: tidy((r.neighborhood || '').toLowerCase()), n: num(r.n) }));

// Per-ZIP rollup over a true 12-month window: page ALL located offense rows from
// the window (~80k), dedupe to reports, and bin by point-in-polygon.
const zipCounts = {};
const zipSeen = new Set();
let fetched = 0;
for (let offset = 0; ; offset += 50000) {
  const page = soql(ID, {
    $select: 'report_number,latitude,longitude',
    $where: `report_date_time > '${since}' AND latitude IS NOT NULL`,
    $order: 'offense_id',
    $limit: '50000',
    $offset: String(offset),
  });
  fetched += page.length;
  for (const r of page) {
    if (zipSeen.has(r.report_number)) continue;
    zipSeen.add(r.report_number);
    const z = zipForPoint(num(r.latitude), num(r.longitude));
    if (z) zipCounts[z] = (zipCounts[z] || 0) + 1;
  }
  if (page.length < 50000) break;
}
const areaByZip = rollup(zipCounts, 'the last 12 months');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    since,
    seriesStartYear: SERIES_START_YEAR,
    total,
    last12,
    neighborhoods,
    topCategory,
    topOffenses,
    byCategory,
    yearly,
    lowest,
    latestYear: latest,
    prevYear: prev,
    lowIsLatest,
    dropPct,
    mvt,
    shootings,
    topHoods,
    hoodMonthly,
    points,
    areaByZip,
  }),
);
console.log(
  `crime.json: total=${total} last12.reports=${last12.reports} last12.offenses=${last12.offenses} perReport=${last12.perReport} neighborhoods=${neighborhoods}`,
);
console.log(
  `lowest year: ${lowest.y} (${lowest.reports} reports) lowIsLatest=${lowIsLatest} dropPct(${prev.y}->${latest.y})=${dropPct}`,
);
console.log(`mvt: peak ${mvt.peak.y}=${mvt.peak.n} latest ${mvt.latest.y}=${mvt.latest.n} drop=${mvt.dropPct}% 2019=${mvt.y2019}`);
console.log(
  `shootings: peak ${shootings.peak.y}=${shootings.peak.n} latest ${shootings.latest.y}=${shootings.latest.n} 2019=${shootings.y2019} lowSince=${shootings.lowSinceYear}`,
);
console.log(`hoodMonthly: start=${hoodStartYear} months=${months.length} hoods=${hoods.length} top=${hoods[0]?.name} (${hoods[0]?.total})`);
console.log('top hoods 12mo:', topHoods.slice(0, 3).map((h) => `${h.key} (${h.n})`).join(', '));
console.log(`points=${points.length} (deduped from ${raw.length})`);
console.log(`areaByZip: fetchedRows=${fetched} reports=${zipSeen.size} cityRate=${areaByZip.cityRate} total=${areaByZip.total} zips=${areaByZip.zips.length}`);
console.log('top zips:', areaByZip.zips.slice(0, 5).map((z) => `${z.zip} ${z.label} count=${z.count} per1000=${z.per1000}`).join(' | '));
