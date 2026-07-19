// Builds src/lib/generated/calls.json from 911 Call Data (33kz-ixgy),
// the Seattle CAD 911 feed (10.9M rows, aggregated server side).
// Run: node scripts/fetch-calls.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';
import { rollup, zipForPoint } from './lib/zipgeo.mjs';

const ID = '33kz-ixgy';
const TIME = 'cad_event_original_time_queued';
const TYPE = 'initial_call_type';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'calls.json');

const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

// Top call types over the last 12 months only.
const topTypes = group(ID, TYPE, { where: `${TIME} > '${yearAgo}'`, limit: 12 })
  .map((r) => ({ key: r[TYPE], n: r.n }))
  .filter((r) => r.key);

// Calls per month for the last ~3 years.
const monthly = soql(ID, {
  $select: `date_trunc_ym(${TIME}) as ym, count(*) as n`,
  $group: 'ym',
  $order: 'ym',
  $where: `${TIME} > '2023-06-01' AND ${TIME} < '2026-06-01'`,
}).map((r) => ({ ym: (r.ym || '').slice(0, 7), n: num(r.n) }));

const last12 = count(ID, `${TIME} > '${yearAgo}'`);
const last30 = count(ID, `${TIME} > '${monthAgo}'`);

const raw = rows(ID, {
  select: `dispatch_latitude,dispatch_longitude,${TYPE},${TIME}`,
  where: 'dispatch_latitude IS NOT NULL',
  order: `${TIME} DESC`,
  limit: 6000,
});
const points = raw
  .map((r) => ({
    lat: num(r.dispatch_latitude),
    lng: num(r.dispatch_longitude),
    t: r[TYPE] || 'Other',
    d: (r[TIME] || '').slice(0, 10),
  }))
  .filter((p) => inSeattle(p.lat, p.lng));

// Per-ZIP rollup: bin a recent sample of points into Seattle ZIPs.
const sample = rows(ID, {
  select: `dispatch_latitude,dispatch_longitude,${TIME}`,
  where: 'dispatch_latitude IS NOT NULL',
  order: `${TIME} DESC`,
  limit: 50000,
});
const zipCounts = {};
let minD = '9999-99', maxD = '0';
for (const r of sample) {
  const z = zipForPoint(num(r.dispatch_latitude), num(r.dispatch_longitude));
  if (z) zipCounts[z] = (zipCounts[z] || 0) + 1;
  const d = (r[TIME] || '').slice(0, 10);
  if (d) { if (d < minD) minD = d; if (d > maxD) maxD = d; }
}
const areaByZip = rollup(zipCounts, `the most recent ${sample.length.toLocaleString('en-US')} calls, from ${minD} to ${maxD}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), last12, last30, topTypes, monthly, points, areaByZip }),
);
console.log(`calls.json: last12=${last12} last30=${last30} types=${topTypes.length} points=${points.length} months=${monthly.length}`);
console.log('top types:', topTypes.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
console.log(`areaByZip: total=${areaByZip.total} cityRate=${areaByZip.cityRate} window="${areaByZip.windowLabel}"`);
console.log('top zips:', areaByZip.zips.slice(0, 5).map((z) => `${z.zip} ${z.label} count=${z.count} per1000=${z.per1000}`).join(' | '));
