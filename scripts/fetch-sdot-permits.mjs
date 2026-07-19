// Generates src/lib/generated/sdot.json from Seattle Permit Review Time Data
// (crg2-ssqd, SDOT street-use permits). The grain is one row per review TASK,
// and the day fields are constant across a permit's tasks, so we dedup to one
// row per permit with max() and aggregate per permit type in JS.
// Run: SOCRATA_APP_TOKEN=xxx node scripts/fetch-sdot-permits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const TOKEN = process.env.SOCRATA_APP_TOKEN ?? '';
const ID = 'crg2-ssqd';
const DOMAIN = 'cos-data.seattle.gov';
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'sdot.json');
const num = (v) => Number(v) || 0;

function soql(params) {
  const args = ['-s', '--compressed', '--max-time', '180', '-H', `X-App-Token: ${TOKEN}`, '-G', `https://${DOMAIN}/resource/${ID}.json`];
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      const json = JSON.parse(out);
      if (!Array.isArray(json)) throw new Error(out.slice(0, 200));
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const median = (arr) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (v) => Math.round(v * 10) / 10;

async function main() {
  // Pull one row per issued permit (day fields are constant per permit).
  const perPermit = [];
  for (let offset = 0; ; offset += 50000) {
    const page = soql({
      $select:
        'permitnum, max(permittypedesc) AS t, max(calendardaysplanreviewcity) AS city, max(calendardaysinapplicantscontrol) AS app, max(totalcalendardays) AS total, max(applieddate) AS applied',
      $where: 'issueddate IS NOT NULL',
      $group: 'permitnum',
      $order: 'permitnum',
      $limit: '50000',
      $offset: String(offset),
    });
    perPermit.push(...page);
    console.log(`  fetched ${perPermit.length} permits...`);
    if (page.length < 50000) break;
  }

  // Aggregate per permit type.
  const byType = new Map();
  for (const p of perPermit) {
    const t = p.t || 'Unknown';
    if (!byType.has(t)) byType.set(t, { type: t, city: [], app: [], total: [] });
    const e = byType.get(t);
    e.city.push(num(p.city));
    e.app.push(num(p.app));
    e.total.push(num(p.total));
  }

  const types = [...byType.values()]
    .map((e) => {
      const n = e.city.length;
      const meanCity = e.city.reduce((s, x) => s + x, 0) / n;
      const meanApp = e.app.reduce((s, x) => s + x, 0) / n;
      const meanTotal = e.total.reduce((s, x) => s + x, 0) / n;
      const denom = meanCity + meanApp;
      return {
        type: e.type,
        permits: n,
        meanCity: r1(meanCity),
        meanApp: r1(meanApp),
        meanTotal: r1(meanTotal),
        medCity: r1(median(e.city)),
        medApp: r1(median(e.app)),
        medTotal: r1(median(e.total)),
        applicantShare: denom > 0 ? Math.round((meanApp / denom) * 100) : null,
      };
    })
    .filter((t) => t.permits >= 300)
    .sort((a, b) => b.permits - a.permits);

  // Overall, across every issued permit (not just the high-volume types).
  const allCity = perPermit.map((p) => num(p.city));
  const allApp = perPermit.map((p) => num(p.app));
  const overall = {
    totalIssued: perPermit.length,
    meanCity: r1(allCity.reduce((s, x) => s + x, 0) / perPermit.length),
    meanApp: r1(allApp.reduce((s, x) => s + x, 0) / perPermit.length),
    medTotal: r1(median(perPermit.map((p) => num(p.total)))),
  };

  // Denominator disclosure: permits in the dataset that were never issued
  // (pending, withdrawn, abandoned) and are excluded from every figure above.
  const neverIssued = num(
    soql({ $select: 'count(distinct permitnum) AS n', $where: 'issueddate IS NULL' })[0]?.n,
  );
  overall.neverIssued = neverIssued;
  overall.neverIssuedPct = Math.round((neverIssued / (neverIssued + perPermit.length)) * 100);

  // Trend: Minor Utility Permit (the most common type) median city-review days
  // by the year the permit was APPLIED for. Trim partial calendar years at both
  // ends: drop the year data collection began if it starts mid-year, and drop
  // the still-open current year. Survivorship makes recent years conservative
  // (slow permits are still pending and not in the issued set), so a rise here
  // is a floor, not an estimate.
  const MU = 'Minor Utility Permit';
  const currentYear = new Date().getFullYear();
  const muByYear = new Map();
  let minApplied = null;
  for (const p of perPermit) {
    if (p.t !== MU) continue;
    const applied = p.applied || '';
    const y = Number(applied.slice(0, 4));
    if (!y) continue;
    if (minApplied === null || applied < minApplied) minApplied = applied;
    if (!muByYear.has(y)) muByYear.set(y, []);
    muByYear.get(y).push(num(p.city));
  }
  const firstYear = Number(minApplied.slice(0, 4));
  const firstYearFull = minApplied.slice(5, 7) === '01';
  const muTrend = [...muByYear.entries()]
    .filter(([y]) => y < currentYear && (firstYearFull || y > firstYear))
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({
      year,
      permits: v.length,
      medCity: r1(median(v)),
      meanCity: r1(v.reduce((s, x) => s + x, 0) / v.length),
    }));

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ generatedAt: new Date().toISOString(), overall, types, muTrend }, null, 2));
  console.log(`Wrote sdot.json: ${overall.totalIssued} issued permits, ${types.length} permit types (>=300).`);
  console.log(`Never issued: ${neverIssued} distinct permits (${overall.neverIssuedPct}% of all).`);
  console.log('Minor Utility Permit median city days by applied year:');
  for (const r of muTrend) console.log(`  ${r.year}: n=${r.permits} median=${r.medCity} mean=${r.meanCity}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
