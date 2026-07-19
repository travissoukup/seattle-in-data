// Builds src/lib/generated/violations.json from SDCI Code Enforcement (ez4a-iug7).
// Run: node scripts/fetch-violations.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';
import { rollup, ZIP_META } from './lib/zipgeo.mjs';

const ID = 'ez4a-iug7';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'violations.json');

const byType = group(ID, 'recordtypemapped', { limit: 12 })
  .map((r) => ({ key: r.recordtypemapped, n: r.n }))
  .filter((r) => r.key);

const byDesc = group(ID, 'recordtypedesc', { limit: 12 })
  .map((r) => ({ key: r.recordtypedesc, n: r.n }))
  .filter((r) => r.key);

const yearly = soql(ID, {
  $select: 'date_extract_y(opendate) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: "opendate > '2000-01-01' AND opendate < '2026-01-01'",
}).map((r) => ({ y: String(num(r.y)), n: num(r.n) }));

const total = count(ID);
const lastYearSince = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const openedLastYear = count(ID, `opendate > '${lastYearSince}'`);
const openCount = count(ID, "statuscurrent NOT IN ('Completed', 'Closed', 'Withdrawn')");
const openShare = total ? openCount / total : 0;

const raw = rows(ID, {
  select: 'latitude,longitude,recordtypedesc,opendate',
  where: 'latitude IS NOT NULL',
  order: 'opendate DESC',
  limit: 6000,
});
const points = raw
  .map((r) => ({ lat: num(r.latitude), lng: num(r.longitude), t: r.recordtypedesc || 'Other', d: (r.opendate || '').slice(0, 10) }))
  .filter((p) => inSeattle(p.lat, p.lng));

const todayStr = new Date().toISOString().slice(0, 10);
const since365 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const grp = group(ID, 'originalzip', {
  where: `opendate > '${since365}' AND opendate <= '${todayStr}'`,
  limit: 80,
});
const counts = {};
for (const r of grp) {
  const z = r.originalzip;
  if (z && ZIP_META[z]) counts[z] = r.n;
}
const areaByZip = rollup(counts, 'cases opened in the last 12 months');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), total, openedLastYear, openCount, openShare, byType, byDesc, yearly, points, areaByZip }),
);
console.log(`violations.json: total=${total} openedLastYear=${openedLastYear} open=${openCount} share=${(openShare * 100).toFixed(1)}% types=${byType.length} descs=${byDesc.length} years=${yearly.length} points=${points.length}`);
console.log('top types:', byType.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
