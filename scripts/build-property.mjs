// Builds the address-lookup property dataset for the /property dashboard.
//   public/property/index.json        compact [addr, pin, zip, lat, lng, disp] for search
//   public/property/z-<zip>.json      full per-parcel detail, keyed by PIN, one file per ZIP
//
// Static core (assessor facts, zoning capacity, teardown/underbuilt math). The
// page fetches the live layers per address at open time: permit history,
// open code cases, environmentally critical areas, neighborhood context.
//
// Inputs: the King County Assessor extracts in .targets-data/ (see
// scripts/build-targets.mjs) plus .targets-data/coords.json (PIN -> lat/lng).
// Run: node scripts/build-property.mjs
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DATA = path.join(ROOT, '.targets-data');
const OUT = path.join(ROOT, 'public', 'property');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
async function scanCsv(file, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!header) { header = parseCsvLine(line).map((h) => h.trim()); continue; }
    if (!line) continue;
    onRow(header, parseCsvLine(line));
  }
}
const col = (header) => {
  const map = {};
  header.forEach((h, i) => (map[h] = i));
  return (cells, name) => cells[map[name]];
};
const num = (v) => { const x = Number(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(x) ? x : 0; };

// Collapse whitespace, uppercase, drop a trailing ZIP. Matches the permit and
// complaint address forms so the page can join by address at open time.
function normAddr(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim().replace(/ \d{5}(-\d{4})?$/, '').trim();
}
function tidyAddr(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().replace(/ (\d{5})(-\d{4})?$/, '');
}

// Present-use codes (SDCI/assessor) worth naming for a homeowner audience.
const USE = {
  '2': 'Single-family residence', '3': 'Duplex', '4': 'Triplex', '5': 'Fourplex',
  '6': 'Apartment', '7': 'Condominium', '8': 'Townhouse plat', '9': 'Rooming house',
  '10': 'Mobile home', '11': 'Vacant residential', '29': 'Townhouse',
  '300': 'Vacant residential', '2': 'Single-family residence',
};
const GRADE = { 1: 'Cabin', 2: 'Substandard', 3: 'Poor', 4: 'Low', 5: 'Fair', 6: 'Low average', 7: 'Average', 8: 'Good', 9: 'Better', 10: 'Very good', 11: 'Excellent', 12: 'Luxury', 13: 'Mansion' };
const COND = { 1: 'Poor', 2: 'Fair', 3: 'Average', 4: 'Good', 5: 'Very good' };

// Zone capacity + FAR heuristics, consistent with /capacity and /targets. These
// are screening estimates; only SDCI can confirm what a specific lot allows.
function zoneInfo(zoneRaw) {
  const z = String(zoneRaw || '').toUpperCase().trim();
  const base = z.split(/[\s(]/)[0];
  let units = null, far = null, family = 'Other';
  if (/^(NR|SF|RSL)/.test(z)) { units = 4; far = 0.75; family = 'Neighborhood residential'; }
  else if (/^LR1/.test(z)) { units = 6; far = 1.3; family = 'Lowrise'; }
  else if (/^LR2/.test(z)) { units = 8; far = 1.5; family = 'Lowrise'; }
  else if (/^LR3/.test(z)) { units = 12; far = 2.0; family = 'Lowrise'; }
  else if (/^(MR|HR)/.test(z)) { units = 20; far = 3.2; family = 'Midrise or highrise'; }
  else if (/^(NC|C1|C2|SM|D|IB|IC|IG|MPC|UI|UV)/.test(z)) { units = 12; far = 2.5; family = 'Commercial or mixed use'; }
  const mha = /\(M/.test(z);
  return { base, units, far, family, mha };
}

async function main() {
  // ---- Parcel: Seattle residential parcels ----
  const parcels = new Map();
  await scanCsv(path.join(DATA, 'EXTR_Parcel.csv'), (h, c) => {
    const g = col(h);
    if (g(c, 'DistrictName').trim().toUpperCase() !== 'SEATTLE') return;
    if (g(c, 'PropType').trim() !== 'R') return;
    const pin = g(c, 'Major') + g(c, 'Minor');
    parcels.set(pin, {
      zone: g(c, 'CurrentZoning').trim(),
      lot: num(g(c, 'SqFtLot')),
      use: g(c, 'PresentUse').trim(),
      unbuildable: g(c, 'Unbuildable').trim().toUpperCase() === 'TRUE',
      pctUnusable: num(g(c, 'PcntUnusable')),
      waterfront: g(c, 'WfntLocation') ? g(c, 'WfntLocation').trim() : '',
    });
  });
  console.log(`parcels: ${parcels.size.toLocaleString('en-US')} Seattle residential`);

  // ---- Building ----
  const bldgs = new Map();
  await scanCsv(path.join(DATA, 'EXTR_ResBldg.csv'), (h, c) => {
    const g = col(h);
    const pin = g(c, 'Major') + g(c, 'Minor');
    if (!parcels.has(pin)) return;
    const cur = bldgs.get(pin) || { units: 0, sqft: 0, beds: 0, bathFull: 0, bath34: 0, bathHalf: 0, stories: 0, yr: null, grade: null, cond: null, addr: '', zipRaw: '', heat: '' };
    cur.units += num(g(c, 'NbrLivingUnits'));
    cur.sqft += num(g(c, 'SqFtTotLiving'));
    cur.beds += num(g(c, 'Bedrooms'));
    cur.bathFull += num(g(c, 'BathFullCount'));
    cur.bath34 += num(g(c, 'Bath3qtrCount'));
    cur.bathHalf += num(g(c, 'BathHalfCount'));
    cur.stories = Math.max(cur.stories, num(g(c, 'Stories')));
    const yr = num(g(c, 'YrBuilt')) || null;
    if (yr && (!cur.yr || yr < cur.yr)) cur.yr = yr;
    const grade = num(g(c, 'BldgGrade')) || null;
    if (grade && (!cur.grade || grade < cur.grade)) cur.grade = grade;
    const cond = num(g(c, 'Condition')) || null;
    if (cond && (!cur.cond || cond < cur.cond)) cur.cond = cond;
    if (!cur.addr) { cur.addr = g(c, 'Address'); cur.zipRaw = (g(c, 'ZipCode') || '').trim(); cur.heat = (g(c, 'HeatSource') || '').trim(); }
    bldgs.set(pin, cur);
  });
  console.log(`buildings: ${bldgs.size.toLocaleString('en-US')}`);

  // ---- Values (latest bill year) ----
  const vals = new Map();
  await scanCsv(path.join(DATA, 'EXTR_RPAcct_NoName.csv'), (h, c) => {
    const g = col(h);
    const pin = g(c, 'Major') + g(c, 'Minor');
    if (!parcels.has(pin)) return;
    const billYr = num(g(c, 'BillYr'));
    const prev = vals.get(pin);
    if (prev && prev.billYr >= billYr) return;
    vals.set(pin, {
      land: num(g(c, 'ApprLandVal')), imps: num(g(c, 'ApprImpsVal')), billYr,
      exempt: g(c, 'TaxStat').trim().toUpperCase() === 'X',
    });
  });
  console.log(`values: ${vals.size.toLocaleString('en-US')}`);

  // ---- Sales history (arm's-length, $ > 0) ----
  const sales = new Map();
  const REASON = { '1': 'Sale', '18': 'Estate', '11': 'Trade' };
  await scanCsv(path.join(DATA, 'EXTR_RPSale.csv'), (h, c) => {
    const g = col(h);
    const pin = g(c, 'Major') + g(c, 'Minor');
    if (!parcels.has(pin)) return;
    const price = num(g(c, 'SalePrice'));
    if (price <= 0) return;
    const arr = sales.get(pin) || [];
    arr.push({
      date: g(c, 'DocumentDate').trim(), price,
      rec: g(c, 'RecordingNbr').trim(),
      rsn: g(c, 'SaleReason').trim(),   // 1 = ordinary sale; other codes are transfers
      wrn: g(c, 'SaleWarning').trim(),  // non-blank flags a questionable sale
    });
    sales.set(pin, arr);
  });
  console.log(`sales: ${sales.size.toLocaleString('en-US')} parcels with sale history`);

  // The assessor's ZipCode column is dirty: blanks, ZIP+4 fragments, and free
  // text like 'SFR' or 'D1 south'. Pull the first clean 5-digit King County ZIP,
  // then fill the gaps from the modal ZIP of the parcel's own plat (Major),
  // which is geographically tight enough to be reliable.
  const cleanZip = (raw) => {
    const m = String(raw || '').match(/(9[0-9]{4})/);
    if (!m) return '';
    const z = m[1];
    return z >= '98001' && z <= '98299' ? z : '';
  };
  const platZips = new Map();
  for (const [pin, b] of bldgs) {
    const z = cleanZip(b.zipRaw);
    if (!z) continue;
    const major = pin.slice(0, 6);
    if (!platZips.has(major)) platZips.set(major, new Map());
    const m = platZips.get(major);
    m.set(z, (m.get(z) || 0) + 1);
  }
  const platMode = new Map();
  for (const [major, counts] of platZips) {
    let best = '', n = 0;
    for (const [z, c] of counts) if (c > n) { best = z; n = c; }
    platMode.set(major, best);
  }
  let zipDirect = 0, zipInferred = 0, zipMissing = 0;

  const coords = JSON.parse(fs.readFileSync(path.join(DATA, 'coords.json'), 'utf8'));

  // ---- assemble ----
  fs.mkdirSync(OUT, { recursive: true });
  const index = [];
  const byZip = new Map();
  let placed = 0, noCoord = 0;
  const curYear = new Date().getFullYear();
  for (const [pin, p] of parcels) {
    const b = bldgs.get(pin);
    if (!b || !b.addr) continue;
    const co = coords[pin];
    if (!co) { noCoord++; continue; }
    const v = vals.get(pin) || { land: 0, imps: 0, billYr: null, exempt: false };
    let zip = cleanZip(b.zipRaw);
    if (zip) zipDirect++;
    else {
      zip = platMode.get(pin.slice(0, 6)) || '';
      if (zip) zipInferred++; else zipMissing++;
    }
    if (!zip) continue; // unroutable without a shard key
    const disp = tidyAddr(b.addr);
    const zi = zoneInfo(p.zone);
    const total = v.land + v.imps;
    const teardownPct = total > 0 ? Math.round((v.land / total) * 100) : null;
    const buildable = zi.far ? Math.round(p.lot * zi.far) : null;
    const underbuiltPct = buildable && b.sqft > 0 ? Math.max(0, Math.round((1 - b.sqft / buildable) * 100)) : null;
    const sHist = (sales.get(pin) || []).sort((a, z) => (a.date < z.date ? 1 : -1)).slice(0, 8);

    const detail = {
      pin, addr: disp, zip, lat: co[0], lng: co[1],
      zone: p.zone, zoneFamily: zi.family, zoneUnits: zi.units, zoneFar: zi.far, mha: zi.mha,
      lot: p.lot, use: USE[p.use] || (p.use ? `Use code ${p.use}` : 'Residential'),
      unbuildable: p.unbuildable, waterfront: (p.waterfront && p.waterfront !== '0') ? p.waterfront : null,
      units: b.units, sqft: b.sqft, beds: b.beds,
      baths: Math.round((b.bathFull + 0.75 * b.bath34 + 0.5 * b.bathHalf) * 100) / 100,
      stories: b.stories || null, yr: b.yr, age: b.yr ? curYear - b.yr : null,
      grade: b.grade, gradeName: b.grade ? GRADE[b.grade] : null,
      cond: b.cond, condName: b.cond ? COND[b.cond] : null,
      land: v.land, imps: v.imps, billYr: v.billYr, exempt: v.exempt,
      teardownPct, buildable, underbuiltPct,
      sales: sHist,
    };
    for (const k of Object.keys(detail)) {
      const val = detail[k];
      if (val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) delete detail[k];
    }
    if (!byZip.has(zip)) byZip.set(zip, {});
    byZip.get(zip)[pin] = detail;
    index.push({ a: normAddr(b.addr), p: pin, z: zip });
    placed++;
  }

  console.log(`zip: ${zipDirect.toLocaleString('en-US')} from the record, ${zipInferred.toLocaleString('en-US')} inferred from the plat, ${zipMissing.toLocaleString('en-US')} unresolved and skipped`);
  for (const [zip, obj] of byZip) {
    fs.writeFileSync(path.join(OUT, `z-${zip}.json`), JSON.stringify(obj));
  }
  index.sort((a, z) => (a.a < z.a ? -1 : 1));
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));

  const idxKb = Math.round(fs.statSync(path.join(OUT, 'index.json')).size / 1024);
  console.log(`wrote ${placed.toLocaleString('en-US')} parcels across ${byZip.size} ZIP shards; index ${idxKb}KB (${index.length.toLocaleString('en-US')} addresses); ${noCoord.toLocaleString('en-US')} skipped for no coords`);
  console.log('sample:', JSON.stringify(index.find((r) => r.p === '6373000105') || index[0]));
}

main();
