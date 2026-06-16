// Adds `topBooksMonthly` to src/lib/generated/library.json: the 50 most-checked-
// out books of the last four years (print, e-book, and audiobook merged), each
// with its monthly checkout series. Run:
//   SOCRATA_APP_TOKEN=xxx node scripts/fetch-top-books-monthly.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const TOKEN = process.env.SOCRATA_APP_TOKEN ?? '';
const BASE = 'https://data.seattle.gov/resource/tmmm-ytt6.json';
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'library.json');
const num = (v) => Number(v) || 0;
const JUNK = /HotSpot|Headphones|Laptop|FlexTech|Uncataloged|Unknown Title|Chromebook|--/i;
const BOOKISH = "(materialtype='BOOK' OR upper(materialtype)='EBOOK' OR upper(materialtype)='AUDIOBOOK')";

// Use curl: undici's fetch trips its headers-timeout on these heavy aggregations.
async function soql(params) {
  const args = ['-s', '--max-time', '280', '-H', `X-App-Token: ${TOKEN}`, '-G', BASE];
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const json = JSON.parse(out);
      if (Array.isArray(json)) return json;
      throw new Error(`unexpected response: ${out.slice(0, 200)}`);
    } catch (e) {
      if (attempt === 2) throw e;
      console.log(`   retry (${e.message.slice(0, 80)})`);
    }
  }
}

// Collapse format variants of one book into one title.
const clean = (t) =>
  String(t || '')
    .replace(/\s*\((un)?abridged\)\s*$/i, '')
    .replace(/\s*:\s*A Novel\s*$/i, '')
    .replace(/\s*\/.*$/, '')
    .trim();

async function main() {
  console.log('1/3 top raw titles (2022+)...');
  const rawTop = await soql({
    $select: 'title,sum(checkouts) as c',
    $where: `checkoutyear>=2022 AND ${BOOKISH}`,
    $group: 'title', $order: 'c DESC', $limit: '150',
  });

  const mergedTotal = new Map();
  const rawByMerged = new Map();
  for (const r of rawTop) {
    const raw = r.title;
    if (!raw || JUNK.test(raw)) continue;
    const m = clean(raw);
    if (!m) continue;
    mergedTotal.set(m, (mergedTotal.get(m) || 0) + num(r.c));
    if (!rawByMerged.has(m)) rawByMerged.set(m, []);
    rawByMerged.get(m).push(raw);
  }
  const top = [...mergedTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([title, total]) => ({ title, total }));
  const rawTitles = top.flatMap((b) => rawByMerged.get(b.title));
  console.log(`   ${top.length} books from ${rawTitles.length} raw titles`);

  console.log('2/3 monthly series (chunked IN queries)...');
  const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const monthlyByRaw = new Map();
  const CHUNK = 25;
  for (let i = 0; i < rawTitles.length; i += CHUNK) {
    const grp = rawTitles.slice(i, i + CHUNK);
    const rows = await soql({
      $select: 'title,checkoutyear,checkoutmonth,sum(checkouts) as c',
      $where: `checkoutyear>=2022 AND title in(${grp.map(esc).join(',')})`,
      $group: 'title,checkoutyear,checkoutmonth', $order: 'checkoutyear,checkoutmonth', $limit: '50000',
    });
    for (const r of rows) {
      const ym = `${r.checkoutyear}-${String(num(r.checkoutmonth)).padStart(2, '0')}`;
      if (!monthlyByRaw.has(r.title)) monthlyByRaw.set(r.title, new Map());
      monthlyByRaw.get(r.title).set(ym, num(r.c));
    }
    console.log(`   chunk ${i / CHUNK + 1}: ${rows.length} rows`);
  }

  console.log('3/3 merge variants per book...');
  const topBooksMonthly = top.map((b) => {
    const merged = new Map();
    for (const raw of rawByMerged.get(b.title)) {
      const mm = monthlyByRaw.get(raw);
      if (!mm) continue;
      for (const [ym, c] of mm) merged.set(ym, (merged.get(ym) || 0) + c);
    }
    const series = [...merged.entries()]
      .filter(([ym]) => ym >= '2022-01')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, checkouts]) => ({ ym, checkouts }));
    return { title: b.title, total: b.total, series };
  });

  const lib = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  lib.topBooksMonthly = topBooksMonthly;
  lib.generatedAt = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(lib, null, 2));
  console.log(`Added topBooksMonthly: ${topBooksMonthly.length} books`);
}

main().catch((e) => { console.error(e); process.exit(1); });
