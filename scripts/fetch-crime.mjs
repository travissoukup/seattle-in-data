// Builds src/lib/generated/crime.json from SPD Crime Data (tazs-3rd5),
// the police report feed (NIBRS). Run: node scripts/fetch-crime.mjs
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

// Last 12 months window.
const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);

// Top offense groups over the last 12 months. Drop placeholder/junk labels.
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

// Reports per year. Trim 2026 (partial) and anything before 2010.
const yearly = soql(ID, {
  $select: 'date_extract_y(report_date_time) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: "report_date_time >= '2012-01-01' AND report_date_time < '2026-01-01'",
}).map((r) => ({ y: String(num(r.y)), n: num(r.n) }));

const total = count(ID);
const last12 = count(ID, `report_date_time > '${since}'`);
// Exclude placeholder labels (-, UNKNOWN, OOJ) so this counts real neighborhoods.
const neighborhoods = num(
  soql(ID, { $select: 'count(distinct neighborhood) as n', $where: "neighborhood NOT IN ('-','UNKNOWN','OOJ') AND neighborhood IS NOT NULL" })[0]?.n,
);

// Map sample: recent reports with coordinates, colored by crime-against category.
const raw = rows(ID, {
  select: 'latitude,longitude,nibrs_crime_against_category,offense_sub_category,report_date_time',
  where: 'latitude IS NOT NULL',
  order: 'report_date_time DESC',
  limit: 6000,
});
const points = raw
  .map((r) => ({
    lat: num(r.latitude),
    lng: num(r.longitude),
    t: CAT_LABEL[r.nibrs_crime_against_category] || 'Other',
    o: tidy((r.offense_sub_category || '').toLowerCase()),
    d: (r.report_date_time || '').slice(0, 10),
  }))
  .filter((p) => inSeattle(p.lat, p.lng));

const topCategory = byCategory.slice().sort((a, b) => b.n - a.n)[0]?.key || 'Property';

// Per-ZIP rollup: bin a recent sample of reports by point-in-polygon.
const sample = rows(ID, {
  select: 'latitude,longitude,report_date_time',
  where: 'latitude IS NOT NULL',
  order: 'report_date_time DESC',
  limit: 50000,
});
const zipCounts = {};
let minD = '9999-99', maxD = '0';
for (const r of sample) {
  const z = zipForPoint(num(r.latitude), num(r.longitude));
  if (z) zipCounts[z] = (zipCounts[z] || 0) + 1;
  const d = (r.report_date_time || '').slice(0, 10);
  if (d) {
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  }
}
const areaByZip = rollup(zipCounts, `the most recent ${sample.length.toLocaleString('en-US')} reports, from ${minD} to ${maxD}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    last12,
    neighborhoods,
    topCategory,
    topOffenses,
    byCategory,
    yearly,
    points,
    areaByZip,
  }),
);
console.log(
  `crime.json: total=${total} last12=${last12} neighborhoods=${neighborhoods} topCategory=${topCategory} offenses=${topOffenses.length} years=${yearly.length} points=${points.length}`,
);
console.log('top offenses:', topOffenses.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
console.log('by category:', byCategory.map((c) => `${c.key} (${c.n})`).join(', '));
console.log(`areaByZip: cityRate=${areaByZip.cityRate} total=${areaByZip.total} zips=${areaByZip.zips.length}`);
console.log('top zips:', areaByZip.zips.slice(0, 5).map((z) => `${z.zip} ${z.label} count=${z.count} per1000=${z.per1000}`).join(' | '));
