// Builds src/lib/generated/requests.json from Customer Service Requests (5ngg-rpne),
// the Find It Fix It / 311 feed. Run: node scripts/fetch-requests.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';
import { rollup, ZIP_META } from './lib/zipgeo.mjs';

const ID = '5ngg-rpne';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'requests.json');

const topTypes = group(ID, 'webintakeservicerequests', { limit: 12 })
  .map((r) => ({ key: r.webintakeservicerequests, n: r.n }))
  .filter((r) => r.key);

const byDept = group(ID, 'departmentname', { limit: 10 })
  .map((r) => ({ key: (r.departmentname || '').replace(/^[A-Z]+-/, ''), n: r.n }))
  .filter((r) => r.key);

const monthly = soql(ID, {
  $select: 'date_trunc_ym(createddate) as ym, count(*) as n',
  $group: 'ym',
  $order: 'ym',
  $where: "createddate > '2021-01-01' AND createddate < '2026-06-01'",
}).map((r) => ({ ym: (r.ym || '').slice(0, 7), n: num(r.n) }));

const total = count(ID);
const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const last30 = count(ID, `createddate > '${since}'`);

const raw = rows(ID, {
  select: 'latitude,longitude,webintakeservicerequests,createddate',
  where: 'latitude IS NOT NULL',
  order: 'createddate DESC',
  limit: 6000,
});
const points = raw
  .map((r) => ({ lat: num(r.latitude), lng: num(r.longitude), t: r.webintakeservicerequests || 'Other', d: (r.createddate || '').slice(0, 10) }))
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
const areaByZip = rollup(counts, 'requests in the last 12 months');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), total, last30, topTypes, byDept, monthly, points, areaByZip }),
);
console.log(`requests.json: total=${total} last30=${last30} types=${topTypes.length} points=${points.length} months=${monthly.length}`);
console.log('top types:', topTypes.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
