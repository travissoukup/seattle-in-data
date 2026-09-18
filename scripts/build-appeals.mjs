// Bakes King County appeal history for Seattle parcels into
// public/property/appeals.json, keyed by PIN, plus countywide outcome
// benchmarks. Source: the Assessor's "Review History" extract.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DATA = path.join(ROOT, '.targets-data');
const OUT = path.join(ROOT, 'public', 'property');

function parseCsvLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
async function scan(file, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!header) { header = parseCsvLine(line).map((h) => h.trim()); continue; }
    if (!line) continue;
    const cells = parseCsvLine(line);
    const o = {};
    header.forEach((h, i) => (o[h] = (cells[i] || '').trim()));
    onRow(o);
  }
}

const RESULT = {
  '1': 'Sustained — the assessor\'s value was upheld',
  '2': 'Revised — the value was reduced',
  '3': 'Revised on the assessor\'s own recommendation',
  '4': 'Assessor determination upheld',
  '5': 'Assessor determination reversed',
  '20': 'Invalidated', '21': 'Stipulated — settled before decision',
  '22': 'Transferred', '23': 'Dismissed', '24': 'Withdrawn',
};
const TYPE = {
  '1': 'Local appeal', '2': 'State appeal', '3': 'Court',
  '4': 'Assessment review', '5': 'Characteristics review', '6': 'Destroyed property',
};
const WIN = new Set(['2', '3', '5', '21']);
const LOSE = new Set(['1', '4']);

async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
  const seattle = new Set(index.map((r) => r.p));
  console.log(`Seattle parcels in the index: ${seattle.size.toLocaleString('en-US')}`);

  const byPin = new Map();
  const byYear = new Map();   // bill year -> {reduced, upheld, pending}
  let total = 0;

  await scan(path.join(DATA, 'EXTR_ReviewHistory.csv'), (r) => {
    const pin = r.Major + r.Minor;
    const local = r.ReviewType === '1';
    const hr = r.HearingResult;
    if (local) {
      total++;
      const y = r.BillYr;
      if (!byYear.has(y)) byYear.set(y, { reduced: 0, upheld: 0, pending: 0 });
      const b = byYear.get(y);
      if (WIN.has(hr)) b.reduced++;
      else if (LOSE.has(hr)) b.upheld++;
      else b.pending++;
    }
    if (!seattle.has(pin)) return;
    if (!byPin.has(pin)) byPin.set(pin, []);
    byPin.get(pin).push({
      n: r.AppealNbr,
      y: r.BillYr,
      t: TYPE[r.ReviewType] || r.ReviewType,
      r: RESULT[hr] || 'No result recorded',
      won: WIN.has(hr) ? 1 : LOSE.has(hr) ? 0 : null,
    });
  });

  // Value change per appeal, for parcels we care about.
  const wanted = new Set();
  for (const list of byPin.values()) for (const a of list) wanted.add(a.n);
  const orig = new Map(); const fin = new Map();
  await scan(path.join(DATA, 'EXTR_ReviewValHistory.csv'), (r) => {
    if (!wanted.has(r.AppealNbr)) return;
    const tot = (Number(r.ApprLandVal) || 0) + (Number(r.ApprImpsVal) || 0);
    if (tot <= 0) return;
    if (r.ValuationType === '1') orig.set(r.AppealNbr, tot);
    else if (r.ValuationType === '3' || r.ValuationType === '5') fin.set(r.AppealNbr, tot);
  });
  for (const list of byPin.values()) {
    for (const a of list) {
      const o = orig.get(a.n); const f = fin.get(a.n);
      if (o) a.from = o;
      if (f) a.to = f;
      if (o && f && f < o) a.cut = o - f;
    }
  }

  const years = [...byYear.entries()]
    .filter(([y]) => Number(y) >= 2018)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([y, b]) => {
      const decided = b.reduced + b.upheld;
      return { year: Number(y), decided, reduced: b.reduced, upheld: b.upheld, pending: b.pending, pct: decided ? Math.round((b.reduced / decided) * 1000) / 10 : 0 };
    });

  const payload = { parcels: Object.fromEntries(byPin), years, totalLocalAppeals: total };
  fs.writeFileSync(path.join(OUT, 'appeals.json'), JSON.stringify(payload));
  const kb = Math.round(fs.statSync(path.join(OUT, 'appeals.json')).size / 1024);
  console.log(`Seattle parcels with an appeal on file: ${byPin.size.toLocaleString('en-US')}`);
  console.log(`countywide local appeals: ${total.toLocaleString('en-US')}`);
  console.log(`wrote appeals.json (${kb} KB)`);
  console.log('recent outcome rates:');
  years.slice(0, 6).forEach((y) => console.log(`   ${y.year}: ${y.decided.toLocaleString('en-US')} decided, ${y.pct}% reduced, ${y.pending.toLocaleString('en-US')} still pending`));
}
main();
