// Builds src/lib/generated/capital.json from two datasets:
//   bsgq-948x  Open Budget Capital Projects: project name, work-type phase, and
//              (for some) a map point. No dollars, so it answers "where".
//   m6va-m4qe  Capital Budget: dollars by department, project, and fiscal year,
//              so it answers "how much and on what". The two do not share a
//              clean key, so we show them side by side, not joined.
// Run: node scripts/fetch-capital.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';

const ID = 'bsgq-948x';
const BUDGET_ID = 'm6va-m4qe';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'capital.json');

// Reproducible query URL for a chart's source link.
const queryUrl = (id, params) =>
  `https://data.seattle.gov/resource/${id}.json?` + new URLSearchParams(params).toString();

// Work type (current_phase_type) is the one clean category every mapped row has.
const byType = group(ID, 'current_phase_type', { limit: 12 })
  .map((r) => ({ key: (r.current_phase_type || '').trim(), n: r.n }))
  .filter((r) => r.key);
const typedCount = byType.reduce((s, r) => s + r.n, 0);

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

// Capital budget dollars, every fiscal year in the dataset. These are whole
// adopted budget years, so no partial-period trimming applies.
const trend = soql(BUDGET_ID, {
  $select: 'fiscal_year, sum(amount) as amt, count(*) as lines',
  $group: 'fiscal_year',
  $order: 'fiscal_year',
})
  .map((r) => ({ year: num(r.fiscal_year), amt: num(r.amt), lines: num(r.lines) }))
  .filter((r) => r.year > 0);
const maxFY = trend[trend.length - 1].year;
const prevFY = trend[trend.length - 2];
const budTotal = trend[trend.length - 1].amt;
const jumpPct = ((budTotal - prevFY.amt) / prevFY.amt) * 100;
// The dataset's granularity changed at some point: thousands of line items a
// year early on, a few hundred consolidated lines later. Detect the break as
// the first year whose row count is less than half the prior year's.
let granularityBreak = null;
for (let i = 1; i < trend.length; i++) {
  if (trend[i].lines < trend[i - 1].lines / 2) {
    granularityBreak = trend[i].year;
    break;
  }
}

// Latest fiscal year, by department. Keep names readable: strip the "Seattle "
// prefix only when what remains still names the department (Seattle Center
// would become just "Center", so it keeps its full name).
const deptLabel = (name) => {
  if (name === 'Seattle Center') return name;
  return name
    .replace(/^Seattle /, '')
    .replace('Department of Finance and Administrative Services', 'Finance and Admin. Services');
};
const budByDeptRaw = soql(BUDGET_ID, {
  $select: 'deptname, sum(amount) as amt',
  $where: `fiscal_year = ${maxFY}`,
  $group: 'deptname',
  $order: 'amt DESC',
  $limit: '14',
})
  .map((r) => ({ full: r.deptname || '', key: deptLabel(r.deptname || ''), n: num(r.amt) }))
  .filter((r) => r.key && r.n > 0);
const budByDept = budByDeptRaw.map(({ key, n }) => ({ key, n }));

// The two utilities' share of the latest year.
const utilSum = budByDeptRaw
  .filter((r) => r.full === 'Seattle Public Utilities' || r.full === 'Seattle City Light')
  .reduce((s, r) => s + r.n, 0);
const budget = {
  year: maxFY,
  total: budTotal,
  byDept: budByDept,
  utilSum,
  utilSharePct: (utilSum / budTotal) * 100,
  jumpPct,
  prevYear: prevFY.year,
  prevTotal: prevFY.amt,
};

// Top project lines for the latest year. Titles carry a budget code prefix
// like "MC-SU-C3614 - "; strip it for display.
const topProjects = soql(BUDGET_ID, {
  $select: 'projecttitle, deptname, sum(amount) as amt',
  $where: `fiscal_year = ${maxFY} AND amount IS NOT NULL`,
  $group: 'projecttitle, deptname',
  $order: 'amt DESC',
  $limit: '10',
}).map((r) => ({
  title: (r.projecttitle || '').replace(/^MC-[A-Z0-9]+-[A-Z0-9]+ - /, ''),
  dept: deptLabel(r.deptname || ''),
  amt: num(r.amt),
}));

const queries = {
  byType: queryUrl(ID, {
    $select: 'current_phase_type, count(*) as n',
    $group: 'current_phase_type',
    $order: 'n DESC',
  }),
  map: queryUrl(ID, {
    $select: 'project_name, current_phase_type, latitude, longitude',
    $where: 'latitude IS NOT NULL',
    $limit: '6000',
  }),
  byDept: queryUrl(BUDGET_ID, {
    $select: 'deptname, sum(amount) as amt',
    $where: `fiscal_year = ${maxFY}`,
    $group: 'deptname',
    $order: 'amt DESC',
  }),
  trend: queryUrl(BUDGET_ID, {
    $select: 'fiscal_year, sum(amount) as amt, count(*) as lines',
    $group: 'fiscal_year',
    $order: 'fiscal_year',
  }),
  topProjects: queryUrl(BUDGET_ID, {
    $select: 'projecttitle, deptname, sum(amount) as amt',
    $where: `fiscal_year = ${maxFY} AND amount IS NOT NULL`,
    $group: 'projecttitle, deptname',
    $order: 'amt DESC',
    $limit: '10',
  }),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    mapped,
    byType,
    typedCount,
    points,
    budget,
    trend,
    granularityBreak,
    topProjects,
    queries,
  }),
);
console.log(`capital.json: total=${total} mapped=${mapped} types=${byType.length} typed=${typedCount} points=${points.length}`);
console.log(`budget: FY${maxFY} total=$${budTotal.toLocaleString('en-US')} depts=${budByDept.length}`);
console.log(`trend: ${trend.map((t) => `${t.year}:$${(t.amt / 1e9).toFixed(2)}B(${t.lines})`).join(' ')}`);
console.log(`jump ${prevFY.year}->${maxFY}: ${jumpPct.toFixed(1)}%  utilities share: ${budget.utilSharePct.toFixed(1)}%  granularity break: ${granularityBreak}`);
console.log('top projects:', topProjects.slice(0, 3).map((p) => `${p.title} $${(p.amt / 1e6).toFixed(1)}M`).join(' | '));
