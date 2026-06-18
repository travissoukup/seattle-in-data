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
  const args = ['-s', '--max-time', '180', '-H', `X-App-Token: ${TOKEN}`, '-G', `https://${DOMAIN}/resource/${ID}.json`];
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
        'permitnum, max(permittypedesc) AS t, max(calendardaysplanreviewcity) AS city, max(calendardaysinapplicantscontrol) AS app, max(totalcalendardays) AS total',
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

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ generatedAt: new Date().toISOString(), overall, types }, null, 2));
  console.log(`Wrote sdot.json: ${overall.totalIssued} issued permits, ${types.length} permit types (>=300).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
