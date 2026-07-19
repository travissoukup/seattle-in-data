// Builds src/lib/generated/library-shelf.json from Library Collection Inventory (6vkj-f5xf).
// TRAP: this dataset is MONTHLY SNAPSHOTS. We first find the latest reportdate and
// filter every query to that snapshot, and we SUM itemcount (rows can hold >1 copy).
// Run: node scripts/fetch-library-shelf.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, num } from './lib/socrata.mjs';

const ID = '6vkj-f5xf';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'library-shelf.json');

// 1) Find the latest monthly snapshot. Without this, counts are inflated many times over.
const snap = soql(ID, { $select: 'max(reportdate) as m' })[0]?.m;
if (!snap) throw new Error('could not find latest reportdate');
const W = `reportdate='${snap}'`;

// Readable format buckets from SPL's coded itemtype values. The code suffix carries
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

// Roll the coded types into a handful of plain-English formats.
const fmtMap = new Map();
for (const r of rawTypes) {
  const f = formatOf(r.key);
  fmtMap.set(f, (fmtMap.get(f) || 0) + r.n);
}
const byFormat = [...fmtMap.entries()]
  .map(([key, n]) => ({ key, n }))
  .sort((a, b) => b.n - a.n);

// Top individual item-type codes, kept as-is for the curious (codes are SPL's own).
const topTypes = rawTypes.slice(0, 12);

// Branches: distinct itemlocation codes in the snapshot.
const branches = num(
  soql(ID, { $select: 'count(distinct itemlocation) as n', $where: W })[0]?.n,
);

// Totals for the snapshot.
const totals = soql(ID, {
  $select: 'sum(itemcount) as items, count(distinct title) as titles',
  $where: W,
})[0];
const totalItems = num(totals?.items);
const distinctTitles = num(totals?.titles);

// Floating vs fixed-shelf items in the snapshot.
const floatRows = soql(ID, {
  $select: 'floatingitem, sum(itemcount) as n',
  $where: W,
  $group: 'floatingitem',
}).map((r) => ({ key: r.floatingitem, n: num(r.n) }));
const floating = floatRows.find((r) => /float/i.test(r.key || ''))?.n || 0;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    snapshot: (snap || '').slice(0, 10),
    totalItems,
    distinctTitles,
    branches,
    floating,
    byFormat,
    topTypes,
  }),
);
console.log(
  `library-shelf.json: snapshot=${(snap || '').slice(0, 10)} items=${totalItems} titles=${distinctTitles} branches=${branches} floating=${floating}`,
);
console.log('formats:', byFormat.map((r) => `${r.key} (${r.n})`).join(', '));
console.log('top type codes:', topTypes.slice(0, 5).map((r) => `${r.key} (${r.n})`).join(', '));
