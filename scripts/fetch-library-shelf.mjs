// Builds src/lib/generated/library-shelf.json from Library Collection Inventory (6vkj-f5xf).
// TRAP 1: this dataset is MONTHLY SNAPSHOTS. We first find the latest reportdate and
// filter every per-snapshot query to it, and we SUM itemcount (rows can hold >1 copy).
// TRAP 2: itemlocation codes are case-inconsistent ('glk' and 'GLK' are the same shelf)
// and include non-public codes (mob = mobile services, tcs = tech services, drp1 = drop
// box). We lowercase, then classify codes with the ILS Data Dictionary (pbt3-ytbc).
// TRAP 3: the whole-history trend query scans every snapshot and can take several
// minutes on Socrata's side, so it runs through a long-timeout curl, not soql().
// Run: node scripts/fetch-library-shelf.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { soql, num, sleep } from './lib/socrata.mjs';

const ID = '6vkj-f5xf';
const DICT_ID = 'pbt3-ytbc'; // ILS Data Dictionary lives on the primary portal
const DICT_BASE = 'https://cos-data.seattle.gov/resource';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'library-shelf.json');

// Like soql() but with a custom base URL and a much longer timeout, for the
// whole-history aggregation and the data-dictionary domain.
function curlJson(base, id, params, { tries = 4, maxTime = 900 } = {}) {
  const args = ['-s', '--compressed', '--max-time', String(maxTime), '-G', `${base}/${id}.json`];
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
  let last = '';
  for (let i = 0; i < tries; i++) {
    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
      const json = JSON.parse(out);
      if (Array.isArray(json)) return json;
      last = typeof out === 'string' ? out.slice(0, 200) : 'non-array';
    } catch (e) {
      last = String(e.message).slice(0, 200);
    }
    sleep((i + 1) * 5);
  }
  throw new Error(`curlJson failed for ${id}: ${last}`);
}

// 1) Find the latest monthly snapshot. Without this, counts are inflated many times over.
const snap = soql(ID, { $select: 'max(reportdate) as m' })[0]?.m;
if (!snap) throw new Error('could not find latest reportdate');
const W = `reportdate='${snap}'`;

// 2) Location names from the ILS Data Dictionary, so codes become readable and
// we can tell real branches from drop boxes and sorting rooms.
const dictRows = curlJson(DICT_BASE, DICT_ID, {
  $select: 'code, description',
  $where: "code_type='Location'",
  $limit: '500',
});
const locName = new Map(dictRows.map((r) => [String(r.code || '').toLowerCase(), r.description || '']));

// A code is a branch iff its dictionary name ends in "Branch" (lockers are named
// "X Branch: SPL Lockers" so they fall through). 'cen' is the Central Library.
function kindOf(code, name) {
  if (code === 'cen') return 'central';
  if (/branch$/i.test((name || '').trim())) return 'branch';
  return 'other';
}

// 3) Items by location for the snapshot, case-normalized.
const locRows = curlJson('https://data.seattle.gov/resource', ID, {
  $select: 'lower(itemlocation) as loc, sum(itemcount) as n',
  $where: W,
  $group: 'lower(itemlocation)',
  $order: 'n DESC',
  $limit: '200',
}, { maxTime: 240 }).map((r) => {
  const code = String(r.loc || '');
  const name = locName.get(code) || code;
  if (!locName.has(code)) console.warn(`WARNING: itemlocation '${code}' not in data dictionary; counting as non-public`);
  return { code, name, n: num(r.n), kind: kindOf(code, locName.get(code)) };
});

const locations = locRows.filter((r) => r.kind !== 'other'); // Central + branches, already sorted desc
const branchRows = locRows.filter((r) => r.kind === 'branch');
const branchCount = branchRows.length;
const branchItems = branchRows.reduce((a, r) => a + r.n, 0);
const centralItems = locRows.find((r) => r.kind === 'central')?.n || 0;
const otherItems = locRows.filter((r) => r.kind === 'other').reduce((a, r) => a + r.n, 0);
const largestBranch = branchRows[0] || { name: 'n/a', n: 0 };

// 4) Item types and plain-format rollup for the snapshot. The code suffix carries
// the format (bk=book, dvd, cd, per=periodical, mus=music cd, mfc=microform).
function formatOf(code) {
  const c = (code || '').toLowerCase();
  if (c.includes('dvd') || c.includes('vid') || c.includes('blu')) return 'DVDs and video';
  if (c.includes('mus') || c.includes('cd')) return 'CDs and audio';
  if (c.includes('per')) return 'Periodicals';
  if (c.includes('mfc') || c.includes('mic') || c.includes('map')) return 'Microform and maps';
  if (c.includes('bk') || c.includes('book')) return 'Books';
  return 'Other';
}

const rawTypes = soql(ID, {
  $select: 'itemtype, sum(itemcount) as n',
  $where: W,
  $group: 'itemtype',
  $order: 'n DESC',
  $limit: '200',
}).map((r) => ({ key: r.itemtype, n: num(r.n) }));

const fmtMap = new Map();
for (const r of rawTypes) {
  const f = formatOf(r.key);
  fmtMap.set(f, (fmtMap.get(f) || 0) + r.n);
}
const byFormat = [...fmtMap.entries()]
  .map(([key, n]) => ({ key, n }))
  .sort((a, b) => b.n - a.n);
const topTypes = rawTypes.slice(0, 12);

// 5) What sits inside Central: reference books, bound periodicals, microform.
const centralTypes = soql(ID, {
  $select: 'itemtype, sum(itemcount) as n',
  $where: `${W} AND lower(itemlocation)='cen'`,
  $group: 'itemtype',
  $order: 'n DESC',
  $limit: '200',
}).map((r) => ({ key: (r.itemtype || '').toLowerCase(), n: num(r.n) }));
const centralTypeN = (code) => centralTypes.find((r) => r.key === code)?.n || 0;
const centralRefBooks = centralTypeN('arbk');
const centralPeriodicals = centralTypeN('arper');
const centralMicroform = centralTypeN('armfc');

// 6) Totals for the snapshot. NOTE: distinct title is a raw-string count; variant
// punctuation splits one work, shared titles merge different works. Caveated on page.
const totals = soql(ID, {
  $select: 'sum(itemcount) as items, count(distinct title) as titles',
  $where: W,
})[0];
const totalItems = num(totals?.items);
const distinctTitles = num(totals?.titles);
const centralPct = totalItems ? (centralItems / totalItems) * 100 : 0;

// 7) Floating vs fixed-shelf items in the snapshot.
const floatRows = soql(ID, {
  $select: 'floatingitem, sum(itemcount) as n',
  $where: W,
  $group: 'floatingitem',
}).map((r) => ({ key: r.floatingitem, n: num(r.n) }));
const floating = floatRows.find((r) => /float/i.test(r.key || ''))?.n || 0;

// 8) The whole history: every monthly snapshot since the dataset began, split
// Central vs everywhere else. Snapshots are point-in-time counts, so there are
// no partial periods to trim; a few months are simply missing upstream.
console.log('fetching whole-history trend (this query can take a few minutes)...');
const trendRaw = curlJson('https://data.seattle.gov/resource', ID, {
  $select: "reportdate, (lower(itemlocation)='cen') as iscen, sum(itemcount) as n",
  $group: 'reportdate, iscen',
  $order: 'reportdate',
  $limit: '1000',
});
const byMonth = new Map();
for (const r of trendRaw) {
  const m = String(r.reportdate || '').slice(0, 7);
  if (!m) continue;
  const row = byMonth.get(m) || { m, central: 0, rest: 0 };
  if (String(r.iscen) === 'true') row.central += num(r.n);
  else row.rest += num(r.n);
  byMonth.set(m, row);
}
const trend = [...byMonth.values()]
  .sort((a, b) => a.m.localeCompare(b.m))
  .map((r) => ({ ...r, total: r.central + r.rest }));
if (trend.length < 24) throw new Error(`trend looks broken: only ${trend.length} months`);

const trendFirst = trend[0];
const trendLatest = trend[trend.length - 1];
const trendPeak = trend.reduce((a, b) => (b.total > a.total ? b : a));
const round1 = (x) => Math.round(x * 10) / 10;
const dropFromPeakPct = round1(((trendPeak.total - trendLatest.total) / trendPeak.total) * 100);
const centralDropPct = round1(((trendFirst.central - trendLatest.central) / trendFirst.central) * 100);
const restDropPct = round1(((trendFirst.rest - trendLatest.rest) / trendFirst.rest) * 100);
const firstYear = Number(trendFirst.m.slice(0, 4));
const peakYear = Number(trendPeak.m.slice(0, 4));
if (trendLatest.total !== totalItems) {
  console.warn(`WARNING: trend latest (${trendLatest.total}) != snapshot total (${totalItems})`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    snapshot: (snap || '').slice(0, 10),
    totalItems,
    distinctTitles,
    floating,
    byFormat,
    topTypes,
    // locations
    branchCount,
    branchItems,
    centralItems,
    centralPct: round1(centralPct),
    otherItems,
    largestBranch: { name: largestBranch.name, n: largestBranch.n },
    centralRefBooks,
    centralPeriodicals,
    centralMicroform,
    locations: locations.map((r) => ({ code: r.code, name: r.name, n: r.n })),
    // history
    trend,
    trendMonths: trend.length,
    firstYear,
    peakYear,
    peakItems: trendPeak.total,
    dropFromPeakPct,
    centralDropPct,
    restDropPct,
  }),
);
console.log(
  `library-shelf.json: snapshot=${(snap || '').slice(0, 10)} items=${totalItems} titles=${distinctTitles} ` +
    `central=${centralItems} (${round1(centralPct)}%) branches=${branchCount} branchItems=${branchItems} ` +
    `other=${otherItems} floating=${floating}`,
);
console.log(
  `trend: ${trend.length} months ${trendFirst.m}..${trendLatest.m}, peak ${trendPeak.m}=${trendPeak.total}, ` +
    `drop from peak ${dropFromPeakPct}%, central ${centralDropPct}% vs rest ${restDropPct}%`,
);
console.log('formats:', byFormat.map((r) => `${r.key} (${r.n})`).join(', '));
console.log('top locations:', locations.slice(0, 5).map((r) => `${r.name} (${r.n})`).join(', '));
