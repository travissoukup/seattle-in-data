// Builds src/lib/generated/capital.json from two datasets:
//   bsgq-948x  Open Budget Capital Projects: project name, work-type phase, and
//              (for some) a map point. No dollars, so it answers "where".
//   m6va-m4qe  Capital Budget: dollars by department and fiscal year, so it
//              answers "how much and on what". The two do not share a clean key,
//              so we show them side by side, not joined. Run: node scripts/fetch-capital.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';

const ID = 'bsgq-948x';
const BUDGET_ID = 'm6va-m4qe';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'capital.json');

// Work type (current_phase_type) is the one clean category every mapped row has.
const byType = group(ID, 'current_phase_type', { limit: 12 })
  .map((r) => ({ key: (r.current_phase_type || '').trim(), n: r.n }))
  .filter((r) => r.key);

const total = count(ID);
const mapped = count(ID, 'latitude IS NOT NULL');

const raw = rows(ID, {
  select: 'latitude,longitude,current_phase_type,project_name',
  where: 'latitude IS NOT NULL',
  order: 'project_id',
  limit: 6000,
});
const points = raw
  .map((r) => ({
    lat: num(r.latitude),
    lng: num(r.longitude),
    t: (r.current_phase_type || 'Other').trim() || 'Other',
    d: r.project_name || '',
  }))
  .filter((p) => inSeattle(p.lat, p.lng));

// Capital budget dollars: latest fiscal year, by department.
const maxFY = num(soql(BUDGET_ID, { $select: 'max(fiscal_year) as y' })[0]?.y);
const budByDept = soql(BUDGET_ID, {
  $select: 'deptname, sum(amount) as amt',
  $where: `fiscal_year = ${maxFY}`,
  $group: 'deptname',
  $order: 'amt DESC',
  $limit: '14',
})
  .map((r) => ({ key: (r.deptname || '').replace(/^Seattle /, ''), n: num(r.amt) }))
  .filter((r) => r.key && r.n > 0);
const budTotal = num(soql(BUDGET_ID, { $select: 'sum(amount) as amt', $where: `fiscal_year = ${maxFY}` })[0]?.amt);
const budget = { year: maxFY, total: budTotal, byDept: budByDept };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), total, mapped, byType, points, budget }),
);
console.log(`capital.json: total=${total} mapped=${mapped} types=${byType.length} points=${points.length}`);
console.log(`budget: FY${maxFY} total=$${budTotal.toLocaleString('en-US')} depts=${budByDept.length}`);
console.log('top depts:', budByDept.slice(0, 4).map((d) => `${d.key} $${(d.n / 1e6).toFixed(0)}M`).join(', '));
