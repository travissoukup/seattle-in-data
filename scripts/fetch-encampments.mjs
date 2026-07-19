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

const byStatus = group(ID, 'servicerequeststatusname', { limit: 12 })
  .map((r) => ({ key: r.servicerequeststatusname, n: r.n }))
  .filter((r) => r.key);

const byArea = group(ID, 'community_reporting_area', { limit: 12 })
  .map((r) => ({ key: r.community_reporting_area, n: r.n }))
  .filter((r) => r.key);

const monthly = soql(ID, {
  $select: 'date_trunc_ym(createddate) as ym, count(*) as n',
  $group: 'ym',
  $order: 'ym',
  $where: "createddate > '2022-01-01' AND createddate < '2026-06-01'",
}).map((r) => ({ ym: (r.ym || '').slice(0, 7), n: num(r.n) }));

const total = count(ID);
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

const todayStr = new Date().toISOString().slice(0, 10);
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
const areaByZip = rollup(counts, 'reports in the last 12 months');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), total, last12, last30, byStatus, byArea, monthly, points, areaByZip }),
);
console.log(`encampments.json: total=${total} last12=${last12} last30=${last30} statuses=${byStatus.length} areas=${byArea.length} points=${points.length} months=${monthly.length}`);
console.log('top status:', byStatus.slice(0, 5).map((s) => `${s.key} (${s.n})`).join(', '));
console.log('top areas:', byArea.slice(0, 5).map((a) => `${a.key} (${a.n})`).join(', '));
