// Builds src/lib/generated/parking.json: average paid on-street parking
// occupancy by paid-parking area and year (the post-2020 recovery arc), plus an
// hour-of-day cut for two contrast areas. The annual files are ~300M rows each,
// so every aggregation is slow; the shared soql helper retries.
// Run: SOCRATA_APP_TOKEN=xxx node scripts/fetch-parking.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, num } from './lib/socrata.mjs';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'parking.json');

// Seattle publishes one dataset per calendar year. 2020 and 2021 exist
// (wtpb-jp8d, jb6y-98nr) but are the pandemic trough and are omitted by design:
// the page compares pre-pandemic 2019 against the recovery years.
const YEAR_IDS = {
  2019: 'qktt-2bsy',
  2022: 'bwk6-iycu',
  2023: '3uar-q5py',
  2024: 'snbb-v8b9',
  2025: '7c2e-uany',
  2026: 'q2e4-e7e5',
};

// Keep only complete years: the current year's dataset is a partial period.
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Object.entries(YEAR_IDS)
  .map(([y, id]) => ({ year: Number(y), id }))
  .filter((y) => y.year < CURRENT_YEAR);
const LATEST = Math.max(...YEARS.map((y) => y.year));

// Hour-of-day contrast: one neighborhood decliner against the recovered core,
// first year vs latest full year.
const HOURLY_AREAS = ['Ballard', 'Commercial Core'];
const HOURLY_YEARS = [Math.min(...YEARS.map((y) => y.year)), LATEST];

const rate = (occ, spaces) => Math.round((num(occ) / num(spaces)) * 1000) / 1000;

async function main() {
  const byAreaYear = [];
  for (const y of YEARS) {
    console.log(`year ${y.year} (${y.id})...`);
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
        rate: rate(r.occ, r.spaces),
        n: num(r.n),
      });
    }
    console.log(`   ${rows.length} areas`);
  }

  const byAreaHour = [];
  for (const area of HOURLY_AREAS) {
    for (const year of HOURLY_YEARS) {
      const id = YEAR_IDS[year];
      console.log(`hourly ${area} ${year} (${id})...`);
      const rows = soql(id, {
        $select: 'date_extract_hh(occupancydatetime) AS hh, avg(paidoccupancy) AS occ, avg(parkingspacecount) AS spaces, count(*) AS n',
        $where: `paidparkingarea='${area}'`,
        $group: 'hh',
        $order: 'hh',
        $limit: '30',
      });
      // Drop stray hours with a handful of readings (e.g. a lone 6:59am row);
      // real paid hours carry millions of readings each.
      const maxN = Math.max(...rows.map((r) => num(r.n)));
      for (const r of rows) {
        if (num(r.spaces) <= 0 || num(r.n) < maxN * 0.01) continue;
        byAreaHour.push({ area, year, hour: num(r.hh), rate: rate(r.occ, r.spaces), n: num(r.n) });
      }
      console.log(`   ${rows.length} hours`);
    }
  }

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(
    FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), latestYear: LATEST, yearIds: YEAR_IDS, byAreaYear, byAreaHour }, null, 2),
  );
  console.log(`Wrote parking.json (${byAreaYear.length} area-years, ${byAreaHour.length} area-hours, latest ${LATEST})`);

  // Sanity echoes for the console log.
  const a = (yr, area) => byAreaYear.find((r) => r.year === yr && r.area === area);
  console.log('Commercial Core 2019 -> latest rate:', a(2019, 'Commercial Core')?.rate, '->', a(LATEST, 'Commercial Core')?.rate);
  console.log('Ballard 2019 -> latest rate:', a(2019, 'Ballard')?.rate, '->', a(LATEST, 'Ballard')?.rate);
  console.log('Uptown n 2019 -> latest:', a(2019, 'Uptown')?.n, '->', a(LATEST, 'Uptown')?.n);
}

main().catch((e) => { console.error(e); process.exit(1); });
