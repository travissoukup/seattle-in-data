// Builds src/lib/generated/budget.json from the City of Seattle Operating Budget (8u2j-imqx),
// the adopted (approved) budget. Run: node scripts/fetch-budget.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, num } from './lib/socrata.mjs';

const ID = '8u2j-imqx';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'budget.json');

// Round population used only for the per-resident framing (Seattle is a bit
// under 800k by the 2020 census and a bit over it in recent state estimates).
const POP = 800000;

// Total budget by year. Adopted budgets cover whole fiscal years, so there are
// no partial periods to trim; the first and latest years come from the data.
const byYear = soql(ID, {
  $select: 'fiscal_year as y, sum(approved_amount) as total',
  $group: 'fiscal_year',
  $order: 'fiscal_year',
}).map((r) => ({ y: String(num(r.y)), total: num(r.total) }));

const firstYear = num(byYear[0]?.y);
const year = num(byYear[byYear.length - 1]?.y);

// Top departments by total approved amount in the latest year.
const deptRaw = soql(ID, {
  $select: 'department, sum(approved_amount) as total',
  $group: 'department',
  $order: 'total DESC',
  $where: `fiscal_year = ${year}`,
  $limit: '60',
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
const perResident = Math.round(total / POP / 100) * 100;

// Fund types for the latest year. The General Fund is the discretionary part;
// most of the rest is ratepayer money and legally dedicated funds.
const fundRaw = soql(ID, {
  $select: 'fund_type, sum(approved_amount) as total',
  $group: 'fund_type',
  $order: 'total DESC',
  $where: `fiscal_year = ${year}`,
  $limit: '100',
});
const byFund = fundRaw
  .map((r) => ({ key: (r.fund_type || '').trim(), total: num(r.total) }))
  .filter((r) => r.key && r.total > 0);
const topFunds = byFund.slice(0, 10);
const generalFund = byFund.find((f) => f.key === 'General Fund')?.total ?? 0;
const gfShare = (generalFund / total) * 100;

// The Human Resources bar is mostly the citywide employee benefits funds, not
// HR staff. Split its programs so the chart can say so.
const HR_DEPT = 'Seattle Department of Human Resources';
const hrRaw = soql(ID, {
  $select: 'program, sum(approved_amount) as total',
  $group: 'program',
  $order: 'total DESC',
  $where: `fiscal_year = ${year} AND department = '${HR_DEPT}'`,
});
const hrPrograms = hrRaw.map((r) => ({ key: (r.program || '').trim(), total: num(r.total) }));
const hrTotal = hrPrograms.reduce((s, p) => s + p.total, 0);
const hrHealthCare = hrPrograms.find((p) => p.key === 'Health Care Services')?.total ?? 0;
const hrIndustrial = hrPrograms.find((p) => p.key === 'Industrial Insurance Services')?.total ?? 0;
const hrOther = hrTotal - hrHealthCare - hrIndustrial;
if (!(hrHealthCare > 0 && hrIndustrial > 0)) throw new Error('HR program split came back empty; check program names');

// Department totals for every year, to find winners and losers since firstYear.
const deptYearRaw = soql(ID, {
  $select: 'department, fiscal_year as y, sum(approved_amount) as total',
  $group: 'department, fiscal_year',
  $order: 'department, fiscal_year',
  $limit: '5000',
});
const deptYears = new Map();
for (const r of deptYearRaw) {
  const dept = (r.department || '').trim();
  if (!dept) continue;
  if (!deptYears.has(dept)) deptYears.set(dept, new Map());
  deptYears.get(dept).set(num(r.y), num(r.total));
}

// Percent change from the first year to the latest, for departments that were
// at least $20M in the first year (smaller ones make silly percentages).
const MIN_FIRST = 20e6;
const deptChange = [...deptYears.entries()]
  .map(([dept, ys]) => ({ dept, first: ys.get(firstYear) ?? 0, latest: ys.get(year) ?? 0 }))
  .filter((d) => d.first >= MIN_FIRST && d.latest > 0)
  .map((d) => ({ ...d, pct: (d.latest / d.first - 1) * 100 }))
  .sort((a, b) => b.pct - a.pct);
const deptChangeTop = deptChange.slice(0, 12);

// The three arcs worth a line each: police cut then record, human services
// climbing, housing multiplying.
const ARC = [
  { field: 'spd', dept: 'Seattle Police Department' },
  { field: 'hsd', dept: 'Human Services Department' },
  { field: 'housing', dept: 'Office of Housing' },
];
const arcByYear = byYear.map((r) => {
  const row = { y: r.y };
  for (const a of ARC) row[a.field] = deptYears.get(a.dept)?.get(num(r.y)) ?? 0;
  return row;
});

const spdSeries = arcByYear.map((r) => ({ y: num(r.y), v: r.spd }));
const spdLatest = spdSeries[spdSeries.length - 1].v;
// Trough after the first year, then the peak that preceded it.
const afterFirst = spdSeries.slice(1);
const spdTroughRow = afterFirst.reduce((m, r) => (r.v < m.v ? r : m));
const spdPeakRow = spdSeries.filter((r) => r.y <= spdTroughRow.y).reduce((m, r) => (r.v > m.v ? r : m));
const spdIsRecord = spdSeries.every((r) => r.v <= spdLatest);
const spd = {
  peakYear: spdPeakRow.y,
  peak: spdPeakRow.v,
  troughYear: spdTroughRow.y,
  trough: spdTroughRow.v,
  latest: spdLatest,
  isRecord: spdIsRecord,
  reboundPct: (spdLatest / spdTroughRow.v - 1) * 100,
  sinceFirstPct: (spdLatest / spdSeries[0].v - 1) * 100,
};

const housingFirst = arcByYear[0].housing;
const housingLatest = arcByYear[arcByYear.length - 1].housing;
const hsdFirst = arcByYear[0].hsd;
const hsdLatest = arcByYear[arcByYear.length - 1].hsd;
const housing = { first: housingFirst, latest: housingLatest, times: housingLatest / housingFirst };
const hsd = { first: hsdFirst, latest: hsdLatest, pct: (hsdLatest / hsdFirst - 1) * 100 };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    year,
    firstYear,
    total,
    deptCount,
    perResident,
    topDepts,
    byDept,
    byYear,
    topFunds,
    generalFund,
    gfShare,
    hrDept: HR_DEPT,
    hrTotal,
    hrHealthCare,
    hrIndustrial,
    hrOther,
    deptChangeTop,
    deptChangeMinFirst: MIN_FIRST,
    arcByYear,
    spd,
    housing,
    hsd,
  }),
);
console.log(`budget.json: years ${firstYear}-${year} total=${(total / 1e9).toFixed(2)}B depts=${deptCount} perResident=${perResident}`);
console.log(`general fund: ${(generalFund / 1e9).toFixed(2)}B (${gfShare.toFixed(1)}%) of total; topFunds=${topFunds.length}`);
console.log(`HR: total=${(hrTotal / 1e6).toFixed(1)}M healthCare=${(hrHealthCare / 1e6).toFixed(1)}M industrial=${(hrIndustrial / 1e6).toFixed(1)}M other=${(hrOther / 1e6).toFixed(1)}M`);
console.log(`SPD: peak ${spd.peakYear} ${(spd.peak / 1e6).toFixed(1)}M -> trough ${spd.troughYear} ${(spd.trough / 1e6).toFixed(1)}M -> ${year} ${(spd.latest / 1e6).toFixed(1)}M record=${spd.isRecord} rebound=${spd.reboundPct.toFixed(1)}% sinceFirst=${spd.sinceFirstPct.toFixed(1)}%`);
console.log(`Housing: ${(housing.first / 1e6).toFixed(1)}M -> ${(housing.latest / 1e6).toFixed(1)}M (${housing.times.toFixed(1)}x); HSD: ${(hsd.first / 1e6).toFixed(1)}M -> ${(hsd.latest / 1e6).toFixed(1)}M (+${hsd.pct.toFixed(0)}%)`);
console.log('dept change top:', deptChangeTop.slice(0, 6).map((d) => `${d.dept} +${d.pct.toFixed(0)}%`).join(', '));
console.log('dept change bottom:', deptChange.slice(-3).map((d) => `${d.dept} ${d.pct.toFixed(0)}%`).join(', '));
