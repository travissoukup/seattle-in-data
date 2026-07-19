// Builds src/lib/generated/occupancy.json from Certificates of Occupancy (axkr-2p68).
// DATE TRAP: certificate_of_occupancy_date is MM/DD/YYYY TEXT, so we fetch raw rows
// and parse the year in JS. occupancy_type_s is comma-separated multi-value.
// Run: node scripts/fetch-occupancy.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rows, count } from './lib/socrata.mjs';

const ID = 'axkr-2p68';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'occupancy.json');

const raw = rows(ID, {
  select: 'certificate_of_occupancy_date,occupancy_type_s',
  limit: 6000,
});

// Parse the year from the MM/DD/YYYY text date.
const yearOf = (s) => {
  if (!s) return null;
  const parts = String(s).split('/');
  if (parts.length !== 3) return null;
  const y = Number(parts[2]);
  return Number.isFinite(y) && y > 1990 && y < 2100 ? y : null;
};

// Count certificates per year for the trend.
const perYear = new Map();
let withDate = 0;
for (const r of raw) {
  const y = yearOf(r.certificate_of_occupancy_date);
  if (y == null) continue;
  withDate++;
  perYear.set(y, (perYear.get(y) || 0) + 1);
}
const trend = [...perYear.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([y, n]) => ({ y: String(y), n }));

// Busiest year and latest year.
let busiest = { y: null, n: 0 };
for (const t of trend) if (t.n > busiest.n) busiest = { y: t.y, n: t.n };
const latest = trend.length ? trend[trend.length - 1] : { y: null, n: 0 };

// Bars by occupancy type. The column is comma-separated multi-value: split and count each.
const typeCounts = new Map();
for (const r of raw) {
  const v = r.occupancy_type_s;
  if (!v) continue;
  for (const part of String(v).split(',')) {
    const t = part.trim();
    if (t) typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
}
const topTypes = [...typeCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([key, n]) => ({ key, n }));

const total = count(ID);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), total, withDate, latest, busiest, trend, topTypes }),
);
console.log(`occupancy.json: total=${total} withDate=${withDate} years=${trend.length} types=${topTypes.length}`);
console.log(`latest year ${latest.y} (${latest.n}), busiest ${busiest.y} (${busiest.n})`);
console.log('top types:', topTypes.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
