// Tries to build src/lib/generated/parking.json: average paid on-street parking
// occupancy by paid-parking area for a few years (the post-2020 recovery arc).
// The annual files are ~286M rows each, so each aggregation is slow; curl with a
// long timeout + retries. Run: SOCRATA_APP_TOKEN=xxx node scripts/fetch-parking.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const TOKEN = process.env.SOCRATA_APP_TOKEN ?? '';
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'parking.json');
const num = (v) => Number(v) || 0;
const YEARS = [
  { year: 2019, id: 'qktt-2bsy' },
  { year: 2022, id: 'bwk6-iycu' },
  { year: 2023, id: '3uar-q5py' },
  { year: 2024, id: 'snbb-v8b9' },
];

function soql(id, params) {
  const args = ['-s', '--max-time', '560', '-H', `X-App-Token: ${TOKEN}`, '-G', `https://data.seattle.gov/resource/${id}.json`];
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const json = JSON.parse(out);
      if (Array.isArray(json)) return json;
      throw new Error(`unexpected: ${out.slice(0, 160)}`);
    } catch (e) {
      console.log(`   retry (${String(e.message).slice(0, 70)})`);
    }
  }
  throw new Error('failed after retries');
}

async function main() {
  const byAreaYear = [];
  for (const y of YEARS) {
    console.log(`year ${y.year}...`);
    const rows = soql(y.id, {
      $select: 'paidparkingarea, avg(paidoccupancy) AS occ, avg(parkingspacecount) AS spaces, count(*) AS n',
      $group: 'paidparkingarea',
      $order: 'n DESC',
      $limit: '200',
    });
    for (const r of rows) {
      const area = r.paidparkingarea;
      const spaces = num(r.spaces);
      if (!area || spaces <= 0) continue;
      byAreaYear.push({
        year: y.year,
        area,
        occ: Math.round(num(r.occ) * 100) / 100,
        spaces: Math.round(spaces * 10) / 10,
        rate: Math.round((num(r.occ) / spaces) * 1000) / 1000,
        n: num(r.n),
      });
    }
    console.log(`   ${rows.length} areas`);
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ generatedAt: new Date().toISOString(), byAreaYear }, null, 2));
  console.log(`Wrote parking.json (${byAreaYear.length} area-years)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
