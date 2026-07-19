// Builds src/lib/generated/building-map.json from Building Permits (76t5-zqzr).
// Run: node scripts/fetch-building-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';

const ID = '76t5-zqzr';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'building-map.json');

// Bars: permits by type.
const byType = group(ID, 'permittypemapped', { limit: 12 })
  .map((r) => ({ key: r.permittypemapped, n: r.n }))
  .filter((r) => r.key);

// Yearly trend of issued permits.
const yearly = soql(ID, {
  $select: 'date_extract_y(issueddate) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: "issueddate > '2010-01-01' AND issueddate < '2026-01-01'",
}).map((r) => ({ ym: String(num(r.y)), n: num(r.n) }));

// Totals.
const total = count(ID);
const lastFullYear = count(ID, "issueddate >= '2025-01-01' AND issueddate < '2026-01-01'");
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

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), total, lastFullYear, totalValue, byType, yearly, points }),
);
console.log(
  `building-map.json: total=${total} lastFullYear=${lastFullYear} totalValue=${totalValue} types=${byType.length} years=${yearly.length} points=${points.length}`,
);
console.log('top types:', byType.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
