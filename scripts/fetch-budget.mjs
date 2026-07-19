// Builds src/lib/generated/budget.json from the City of Seattle Operating Budget (8u2j-imqx),
// the adopted (approved) budget. Run: node scripts/fetch-budget.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, num } from './lib/socrata.mjs';

const ID = '8u2j-imqx';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'budget.json');

// Find the latest fiscal year on record.
const years = soql(ID, {
  $select: 'fiscal_year, count(*) as n',
  $group: 'fiscal_year',
  $order: 'fiscal_year DESC',
  $limit: '1',
});
const year = num(years[0]?.fiscal_year);

// Top departments by total approved amount in the latest year.
const deptRaw = soql(ID, {
  $select: 'department, sum(approved_amount) as total',
  $group: 'department',
  $order: 'total DESC',
  $where: `fiscal_year = ${year}`,
  $limit: '40',
});
const byDept = deptRaw
  .map((r) => ({ key: (r.department || '').trim(), total: num(r.total) }))
  .filter((r) => r.key && r.total > 0);

const topDepts = byDept.slice(0, 12);

// Totals for the latest year.
const totalRow = soql(ID, {
  $select: 'sum(approved_amount) as total, count(distinct department) as depts',
  $where: `fiscal_year = ${year}`,
});
const total = num(totalRow[0]?.total);
const deptCount = num(totalRow[0]?.depts);

// Total budget by year for a time series.
const byYear = soql(ID, {
  $select: 'fiscal_year as y, sum(approved_amount) as total',
  $group: 'fiscal_year',
  $order: 'fiscal_year',
}).map((r) => ({ y: String(num(r.y)), total: num(r.total) }));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), year, total, deptCount, topDepts, byDept, byYear }),
);
console.log(`budget.json: year=${year} total=${total} depts=${deptCount} topDepts=${topDepts.length} years=${byYear.length}`);
console.log('biggest:', topDepts[0]?.key, topDepts[0]?.total);
console.log('top 5:', topDepts.slice(0, 5).map((d) => `${d.key} ($${(d.total / 1e6).toFixed(0)}M)`).join(', '));
