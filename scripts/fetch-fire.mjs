// Builds src/lib/generated/fire.json from Real-Time Fire 911 Calls (kzjm-xkqj).
// Most of these are medical aid calls, not fires. Run: node scripts/fetch-fire.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';
import { rollup, zipForPoint } from './lib/zipgeo.mjs';

const ID = 'kzjm-xkqj';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'fire.json');

const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const since30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

const topTypes = group(ID, 'type', { where: `datetime > '${yearAgo}'`, limit: 12 })
  .map((r) => ({ key: r.type, n: r.n }))
  .filter((r) => r.key);

const monthly = soql(ID, {
  $select: 'date_trunc_ym(datetime) as ym, count(*) as n',
  $group: 'ym',
  $order: 'ym',
  $where: "datetime > '2023-01-01' AND datetime < '2026-06-01'",
}).map((r) => ({ ym: (r.ym || '').slice(0, 7), n: num(r.n) }));

const last12 = count(ID, `datetime > '${yearAgo}'`);
const last30 = count(ID, `datetime > '${since30}'`);

const raw = rows(ID, {
  select: 'latitude,longitude,type,datetime',
  where: 'latitude IS NOT NULL',
  order: 'datetime DESC',
  limit: 6000,
});
const points = raw
  .map((r) => ({ lat: num(r.latitude), lng: num(r.longitude), t: r.type || 'Other', d: (r.datetime || '').slice(0, 10) }))
  .filter((p) => inSeattle(p.lat, p.lng));

const sample = rows(ID, {
  select: 'latitude,longitude,datetime',
  where: 'latitude IS NOT NULL',
  order: 'datetime DESC',
  limit: 50000,
});
const areaCounts = {};
let minD = '9999-99', maxD = '0';
for (const r of sample) {
  const z = zipForPoint(num(r.latitude), num(r.longitude));
  if (z) areaCounts[z] = (areaCounts[z] || 0) + 1;
  const d = (r.datetime || '').slice(0, 10);
  if (d) { if (d < minD) minD = d; if (d > maxD) maxD = d; }
}
const areaByZip = rollup(areaCounts, `the most recent ${sample.length.toLocaleString('en-US')} calls, from ${minD} to ${maxD}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), last12, last30, topTypes, monthly, points, areaByZip }),
);
console.log(`fire.json: last12=${last12} last30=${last30} types=${topTypes.length} points=${points.length} months=${monthly.length}`);
console.log('top types:', topTypes.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
