// Generates src/lib/generated/library.json from the Seattle Public Library
// "Checkouts by Title" dataset (tmmm-ytt6, ~51M rows) via server-side SoQL
// aggregation, so nothing large is downloaded. Run:
//   SOCRATA_APP_TOKEN=xxx node scripts/fetch-library.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.SOCRATA_APP_TOKEN ?? '';
const BASE = 'https://data.seattle.gov/resource/tmmm-ytt6.json';
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated');

async function soql(params) {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: TOKEN ? { 'X-App-Token': TOKEN } : {} });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const num = (v) => Number(v) || 0;

// Material-type normalization (case variants collapse; friendly labels).
const MAT_LABEL = {
  BOOK: 'Print book', EBOOK: 'E-book', AUDIOBOOK: 'Audiobook (digital)',
  SOUNDDISC: 'CD / audio disc', VIDEODISC: 'DVD / Blu-ray', VIDEOCASS: 'VHS',
  SONG: 'Song (streaming)', MUSIC: 'Music', MAGAZINE: 'Magazine', MIXED: 'Mixed / kit',
  REGPRINT: 'Print (other)', VIDEO: 'Video (streaming)', ER: 'Electronic resource',
};
const JUNK = /HotSpot|Headphones|Laptop|FlexTech|Uncataloged|Unknown Title|Chromebook|--DWN|--BAL|--GWD/i;

// Titles to trace as the "cultural seismograph" (no apostrophes, to keep SoQL simple).
const SEISMO = [
  { match: 'Lessons in Chemistry', label: 'Lessons in Chemistry', note: 'A book-club juggernaut that surged again when the Apple TV+ series landed in late 2023.' },
  { match: 'Gender Queer', label: 'Gender Queer', note: 'The most-challenged book in America in 2021-2022; bans tend to drive demand, not suppress it.' },
  { match: 'Braiding Sweetgrass', label: 'Braiding Sweetgrass', note: 'No movie, no marketing push: a slow, word-of-mouth phenomenon that kept climbing for years.' },
  { match: 'Fourth Wing', label: 'Fourth Wing', note: 'The 2023 romantasy explosion, almost entirely driven by social media.' },
];

async function main() {
  console.log('1/4 by-year usage...');
  const yu = await soql({ $select: 'checkoutyear,usageclass,sum(checkouts) as c', $group: 'checkoutyear,usageclass', $order: 'checkoutyear', $limit: '500' });
  const byYearUsage = yu
    .map((r) => ({ year: num(r.checkoutyear), usage: r.usageclass, checkouts: num(r.c) }))
    .filter((r) => r.year >= 2005);

  console.log('2/4 material types...');
  const mt = await soql({ $select: 'materialtype,sum(checkouts) as c', $group: 'materialtype', $order: 'c DESC', $limit: '40' });
  const mm = new Map();
  for (const r of mt) {
    const k = String(r.materialtype || '').toUpperCase();
    if (!k) continue;
    mm.set(k, (mm.get(k) || 0) + num(r.c));
  }
  const materialTypes = [...mm.entries()]
    .map(([type, checkouts]) => ({ type, label: MAT_LABEL[type] || type, checkouts }))
    .sort((a, b) => b.checkouts - a.checkouts)
    .slice(0, 10);

  console.log('3/4 top books (2023+)...');
  const tb = await soql({
    $select: 'title,sum(checkouts) as c',
    $where: "checkoutyear>=2023 AND (materialtype='BOOK' OR upper(materialtype)='EBOOK' OR upper(materialtype)='AUDIOBOOK')",
    $group: 'title', $order: 'c DESC', $limit: '60',
  });
  const topBooks = tb
    .map((r) => ({ title: String(r.title || '').replace(/\s*\/\s*$/, ''), checkouts: num(r.c) }))
    .filter((b) => b.title && !JUNK.test(b.title))
    .slice(0, 15);

  console.log('4/4 seismograph titles...');
  const seismograph = [];
  for (const t of SEISMO) {
    const rows = await soql({
      $select: 'checkoutyear,checkoutmonth,sum(checkouts) as c',
      $where: `title like '${t.match}%' AND checkoutyear>=2019`,
      $group: 'checkoutyear,checkoutmonth', $order: 'checkoutyear,checkoutmonth', $limit: '200',
    });
    const series = rows.map((r) => ({
      ym: `${r.checkoutyear}-${String(num(r.checkoutmonth)).padStart(2, '0')}`,
      checkouts: num(r.c),
    }));
    seismograph.push({ label: t.label, note: t.note, series });
    console.log(`   ${t.label}: ${series.length} months`);
  }

  fs.mkdirSync(DIR, { recursive: true });
  const out = { generatedAt: new Date().toISOString(), byYearUsage, materialTypes, topBooks, seismograph };
  fs.writeFileSync(path.join(DIR, 'library.json'), JSON.stringify(out, null, 2));
  console.log(`Wrote library.json (${byYearUsage.length} year-usage rows, ${materialTypes.length} material types, ${topBooks.length} books, ${seismograph.length} seismo titles)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
