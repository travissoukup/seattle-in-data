// Generates src/lib/generated/wages.json from City of Seattle Wage Data
// (2khk-5ukd). The dataset has hourly RATES only (no overtime or actual
// earnings), so this is "what the city pays", not a payroll/overtime analysis.
// Run: SOCRATA_APP_TOKEN=xxx node scripts/fetch-wages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const TOKEN = process.env.SOCRATA_APP_TOKEN ?? '';
const ID = '2khk-5ukd';
// Seattle's citywide minimum wage for the current year (SMC 14.19; a policy
// constant, not a field in the dataset). Update when the city announces the
// new-year rate.
const MIN_WAGE = 20.76;
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'wages.json');
const num = (v) => Number(v) || 0;

function page(offset) {
  const args = ['-s', '--max-time', '90', '-H', `X-App-Token: ${TOKEN}`, '-G', `https://data.seattle.gov/resource/${ID}.json`,
    '--data-urlencode', '$select=department,job_title,hourly_rate', '--data-urlencode', '$limit=50000', '--data-urlencode', `$offset=${offset}`];
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const json = JSON.parse(out);
  if (!Array.isArray(json)) throw new Error(out.slice(0, 200));
  return json;
}
const median = (arr) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (arr, p) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const mean = (arr) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);
const r2 = (x) => Math.round(x * 100) / 100;

async function main() {
  const all = [];
  for (let off = 0; ; off += 50000) {
    const rows = page(off);
    all.push(...rows);
    if (rows.length < 50000) break;
  }
  const rates = all.map((r) => num(r.hourly_rate)).filter((r) => r > 0);

  // By department: headcount, median + p90 hourly rate.
  const byDeptMap = new Map();
  for (const r of all) {
    const d = r.department || 'Unknown';
    if (!byDeptMap.has(d)) byDeptMap.set(d, []);
    byDeptMap.get(d).push(num(r.hourly_rate));
  }
  const byDept = [...byDeptMap.entries()]
    .map(([department, rs]) => ({ department, n: rs.length, median: r2(median(rs)), p90: r2(pct(rs, 0.9)) }))
    .filter((d) => d.n >= 25)
    .sort((a, b) => b.median - a.median);

  // The big departments, ranked by headcount, with average rate: the
  // size-vs-pay view (Parks is the biggest and the cheapest big one).
  const bigDepts = [...byDeptMap.entries()]
    .map(([department, rs]) => ({ department, n: rs.length, avg: r2(mean(rs)) }))
    .filter((d) => d.n >= 400)
    .sort((a, b) => b.n - a.n);

  // Best-paid job titles (by median rate, with a headcount floor).
  const byTitleMap = new Map();
  for (const r of all) {
    const t = r.job_title || 'Unknown';
    if (!byTitleMap.has(t)) byTitleMap.set(t, []);
    byTitleMap.get(t).push(num(r.hourly_rate));
  }
  const titleStats = [...byTitleMap.entries()]
    .map(([title, rs]) => ({ title, n: rs.length, median: r2(median(rs)), avg: r2(mean(rs)) }));
  const topTitles = titleStats
    .filter((t) => t.n >= 10)
    .sort((a, b) => b.median - a.median)
    .slice(0, 15);

  // Most common job titles by headcount (lifeguard is #1).
  const commonTitles = [...titleStats].sort((a, b) => b.n - a.n).slice(0, 10);

  // The bottom of the pay ladder: lowest average rate among titles with
  // at least 10 people.
  const bottomTitles = titleStats
    .filter((t) => t.n >= 10)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 10);

  // Every distinct title, for the full CSV export.
  const allTitles = [...titleStats].sort((a, b) => b.n - a.n);

  // Rate distribution (hourly buckets).
  const buckets = [['<25', 0, 25], ['25-40', 25, 40], ['40-55', 40, 55], ['55-70', 55, 70], ['70-90', 70, 90], ['90-120', 90, 120], ['120+', 120, 1e9]];
  const dist = buckets.map(([label, lo, hi]) => ({ label, n: rates.filter((r) => r >= lo && r < hi).length }));

  const summary = {
    n: all.length,
    median: r2(median(rates)),
    p90: r2(pct(rates, 0.9)),
    p99: r2(pct(rates, 0.99)),
    max: r2(Math.max(...rates)),
    min: r2(Math.min(...rates)),
    minWage: MIN_WAGE,
    belowMinWage: rates.filter((r) => r < MIN_WAGE).length,
  };

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({
    generatedAt: new Date().toISOString(), summary, byDept, bigDepts, topTitles, commonTitles, bottomTitles, allTitles, dist,
  }, null, 2));
  console.log(`Wrote wages.json: ${all.length} employees, ${byDept.length} depts, ${allTitles.length} titles, median $${summary.median}/hr`);
  console.log(`Most common: ${commonTitles.slice(0, 3).map((t) => `${t.title} (${t.n} @ $${t.avg})`).join(', ')}`);
  console.log(`Biggest depts: ${bigDepts.slice(0, 3).map((d) => `${d.department} (${d.n} @ $${d.avg})`).join(', ')}`);
  console.log(`Floor: min $${summary.min}/hr, ${summary.belowMinWage} below the $${MIN_WAGE} minimum wage`);
}
main().catch((e) => { console.error(e); process.exit(1); });
