// Builds src/lib/generated/oversight.json from Office of Police Accountability
// Complaints (hyay-5x7b). Each row is one allegation, so a single complaint can
// span several rows. Run: node scripts/fetch-oversight.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, num } from './lib/socrata.mjs';

const ID = 'hyay-5x7b';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'oversight.json');

// Findings (the oversight office's own conclusion). Drop the "-" placeholder.
const byFinding = group(ID, 'finding', { limit: 20 })
  .map((r) => ({ key: r.finding, n: r.n }))
  .filter((r) => r.key && r.key !== '-')
  .slice(0, 8);

// Top allegation types. Drop the "-" placeholder.
const byAllegation = group(ID, 'allegation', { limit: 14 })
  .map((r) => ({ key: r.allegation, n: r.n }))
  .filter((r) => r.key && r.key !== '-')
  .slice(0, 10);

// Complaints per year, by received date. 2026 is partial, so cap there.
const yearly = soql(ID, {
  $select: 'date_extract_y(received_date) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: "received_date > '2014-12-31' AND received_date < '2026-01-01'",
}).map((r) => ({ y: String(r.y), n: num(r.n) }));

const total = count(ID);
const withFinding = count(ID, "finding != '-'");
const sustained = count(ID, "starts_with(finding, 'Sustained')");
const sustainedPct = withFinding ? (sustained / withFinding) * 100 : 0;

const latestFullYear = yearly.length ? yearly[yearly.length - 1] : { y: '', n: 0 };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    withFinding,
    sustained,
    sustainedPct,
    latestFullYear,
    byFinding,
    byAllegation,
    yearly,
  }),
);
console.log(
  `oversight.json: total=${total} withFinding=${withFinding} sustained=${sustained} (${sustainedPct.toFixed(1)}%) latest=${latestFullYear.y}/${latestFullYear.n} findings=${byFinding.length} allegations=${byAllegation.length} years=${yearly.length}`,
);
console.log('top allegations:', byAllegation.slice(0, 5).map((a) => `${a.key} (${a.n})`).join(', '));
