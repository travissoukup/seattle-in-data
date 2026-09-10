// Rebuilds .targets-data/permit_fees_all.csv from the Permit Fees open dataset
// (k8z7-3feg on data.seattle.gov), keeping the column shape every fees build
// script already consumes.
//
// Origin story worth keeping: this dataset exists because this project asked
// for it. The site first analyzed a June 2026 public records request extract;
// SDCI published the same billing data as an open dataset on Sept 10, 2026.
//
// Semantics note: the open dataset has feeamount and feeamountpaid but no
// balance snapshot and no void flag, so amount_due here is computed
// (feeamount minus feeamountpaid) and INCLUDES voided or reissued invoice
// lines that were never expected to be paid. Paid-based analyses are exact;
// "unpaid" analyses must dedupe reissues (build_fees_revenue.py does).
//
// Run: node scripts/fetch-permit-fees.mjs   (~1.8M rows, a few minutes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, '.targets-data', 'permit_fees_all.csv');
const BACKUP = path.join(ROOT, '.targets-data', 'permit_fees_records_request_2020_2026.csv');
const ID = 'k8z7-3feg';
const PAGE = 50000;

// Preserve the original records-request extract once; it stays the reference
// for true balance-snapshot semantics.
if (fs.existsSync(OUT) && !fs.existsSync(BACKUP)) {
  const head = fs.readFileSync(OUT, { encoding: 'utf8', flag: 'r' }).slice(0, 200);
  if (!head.includes('k8z7-3feg')) {
    fs.copyFileSync(OUT, BACKUP);
    console.log('backed up records-request extract to', path.basename(BACKUP));
  }
}

const esc = (s) => {
  s = s == null ? '' : String(s);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });

// Concurrent runs interleave appends into the same .tmp and corrupt the CSV;
// hold an exclusive PID lock for the whole rebuild.
const LOCK = OUT + '.lock';
try {
  fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
  const pid = Number(fs.readFileSync(LOCK, 'utf8'));
  let alive = false;
  if (pid) {
    try { process.kill(pid, 0); alive = true; } catch {}
  }
  if (alive) {
    console.error(`another fetch-permit-fees run (pid ${pid}) holds ${path.basename(LOCK)}; exiting`);
    process.exit(1);
  }
  fs.rmSync(LOCK);
  fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
}
process.on('exit', () => {
  try { fs.rmSync(LOCK); } catch {}
});

const tmp = OUT + '.tmp';
fs.writeFileSync(tmp, 'record_id,date_invoiced,description,amount_due,amount_paid,source_file\n');

let offset = 0;
let rows = 0;
let paidTotal = 0;
for (;;) {
  const url = `https://data.seattle.gov/resource/${ID}.json?` +
    `$select=permitnum,invoicedate,feedescription,feeamount,feeamountpaid` +
    `&$order=:id&$limit=${PAGE}&$offset=${offset}`;
  let batch;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
      batch = await res.json();
      if (!Array.isArray(batch)) {
        throw new Error(`non-array response: ${JSON.stringify(batch).slice(0, 200)}`);
      }
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  const lines = batch.map((r) => {
    const amt = Number(r.feeamount) || 0;
    const paid = Number(r.feeamountpaid) || 0;
    paidTotal += paid;
    const due = Math.max(0, Math.round((amt - paid) * 100) / 100);
    return [esc(r.permitnum), esc(r.invoicedate || ''), esc(r.feedescription || ''),
      due, paid, ID].join(',');
  });
  fs.appendFileSync(tmp, lines.join('\n') + (lines.length ? '\n' : ''));
  rows += batch.length;
  if (batch.length < PAGE) break;
  offset += PAGE;
  if (offset % 500000 === 0) console.log(`  ...${offset.toLocaleString('en-US')} rows`);
}

fs.renameSync(tmp, OUT);
console.log(`permit_fees_all.csv rebuilt from ${ID}: ${rows.toLocaleString('en-US')} rows, ` +
  `$${(paidTotal / 1e6).toFixed(1)}M paid, ${(fs.statSync(OUT).size / 1048576).toFixed(0)}MB`);
if (rows < 1500000) {
  console.error('row count suspiciously low; refusing to continue');
  process.exit(1);
}
