// Builds src/lib/generated/force.json from Use of Force (ppi5-g2bj),
// SPD's log of incidents where officers used force. Run: node scripts/fetch-force.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, num } from './lib/socrata.mjs';

const ID = 'ppi5-g2bj';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'force.json');

// Force level / type mix.
const byType = group(ID, 'incident_type', { limit: 12 })
  .map((r) => ({ key: r.incident_type, n: r.n }))
  .filter((r) => r.key);

// By precinct. Drop the placeholder codes (-, X, OOJ, 0) so the bars are real places.
const SKIP = new Set(['-', 'X', 'OOJ', '0', '']);
const byPrecinct = group(ID, 'precinct', { limit: 20 })
  .map((r) => ({ key: r.precinct, n: r.n }))
  .filter((r) => r.key && !SKIP.has(r.key));

// Reports per year.
const yearly = soql(ID, {
  $select: 'date_extract_y(occured_date_time) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: "occured_date_time > '2014-01-01'",
}).map((r) => ({ y: String(num(r.y)), n: num(r.n) }));

const total = count(ID);

// Latest full year is the year before the current one (current year is partial).
const now = new Date();
const latestFullYear = now.getUTCFullYear() - 1;
const latestYearRow = yearly.find((r) => r.y === String(latestFullYear));
const latestYearCount = latestYearRow ? latestYearRow.n : 0;

const mostCommon = byType[0]?.key || '';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    latestFullYear,
    latestYearCount,
    mostCommon,
    byType,
    byPrecinct,
    yearly,
  }),
);
console.log(`force.json: total=${total} latestFullYear=${latestFullYear} latestYearCount=${latestYearCount}`);
console.log('mostCommon:', mostCommon);
console.log('types:', byType.map((t) => `${t.key} (${t.n})`).join(', '));
console.log('precincts:', byPrecinct.map((p) => `${p.key} (${p.n})`).join(', '));
console.log('years:', yearly.map((y) => `${y.y}:${y.n}`).join(', '));
