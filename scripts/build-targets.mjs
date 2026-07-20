// Builds public/targets.json: scored small-multifamily acquisition candidates in Seattle.
//
// A target is a parcel that either (a) already holds 2 to 4 living units, or
// (b) holds one unit on land whose zoning allows more, with signals that the
// value sits in the land (teardown ratio, age, condition, open code cases).
// The score is a transparent weighted blend; every component ships in the JSON
// so the page can show why a parcel scored what it did. Signals, not verdicts.
//
// Inputs (all public):
//   .targets-data/EXTR_Parcel.csv          King County assessor: parcel attributes
//   .targets-data/EXTR_ResBldg.csv         living units, year built, grade, condition
//   .targets-data/EXTR_RPAcct_NoName.csv   current appraised land and improvement value
//   .targets-data/EXTR_RPSale.csv          all recorded sales (comps + last sale)
//   ArcGIS PARCEL_ADDRESS_PUB_AREA_3069    PIN -> LAT/LON (cached after first run)
//   data.seattle.gov j2xh-c7vt             RRIO registered rentals (address join)
//   public/leads.json                      open code cases per address (address join)
//
// The assessor CSVs are downloaded by hand from aqua.kingcounty.gov (see README
// in .targets-data or run scripts/download-assessor.sh). Not part of the weekly
// refresh; re-run when the county posts new extracts (roughly monthly).
//
// Run: node scripts/build-targets.mjs
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DATA = path.join(ROOT, '.targets-data');
const OUT = path.join(ROOT, 'public', 'targets.json');
const COORD_CACHE = path.join(DATA, 'coords.json');

// ---------- tiny quoted-CSV line parser ----------
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
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
  let n = 0;
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line).map((h) => h.trim());
      continue;
    }
    if (!line) continue;
    const cells = parseCsvLine(line);
    onRow(header, cells);
    n++;
  }
  return n;
}
const idx = (header, name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`column ${name} missing`);
  return i;
};

// Collapse whitespace, uppercase, drop a trailing ZIP token. Both the assessor
// building address and the Seattle complaint/RRIO addresses reduce to this form.
function normAddr(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ \d{5}(-\d{4})?$/, '')
    .trim();
}

// How many units the zone allows on a typical lot. HEURISTIC: Seattle's middle
// housing rules (state HB 1110) allow 4 units in neighborhood-residential zones
// (6 with affordability or near frequent transit); lowrise and denser zones
// allow more, limited by FAR and lot specifics. These numbers are a screening
// guide, not an entitlement; the page says so.
function zoneCapacity(zoneRaw) {
  const z = String(zoneRaw || '').toUpperCase().trim();
  if (!z) return null;
  if (/^(NR|SF|RSL)/.test(z)) return 4;
  if (/^LR1/.test(z)) return 6;
  if (/^LR2/.test(z)) return 8;
  if (/^LR3/.test(z)) return 12;
  if (/^(MR|HR)/.test(z)) return 20;
  if (/^(NC|C1|C2|SM|D|IB|IC|IG|MPC|UI|UV)/.test(z)) return 12;
  return null; // unknown code: no capacity claim
}

async function main() {
  // ---------- pass 1: Seattle residential parcels ----------
  const parcels = new Map(); // pin -> {zone, lot, use, unusable}
  await scanCsv(path.join(DATA, 'EXTR_Parcel.csv'), (h, c) => {
    const district = c[idx(h, 'DistrictName')].trim().toUpperCase();
    if (district !== 'SEATTLE') return;
    if (c[idx(h, 'PropType')].trim() !== 'R') return; // land+improvement residential
    const pin = c[idx(h, 'Major')] + c[idx(h, 'Minor')];
    const unbuildable = c[idx(h, 'Unbuildable')].trim().toUpperCase() === 'TRUE';
    const pcntUnusable = Number(c[idx(h, 'PcntUnusable')]) || 0;
    parcels.set(pin, {
      zone: c[idx(h, 'CurrentZoning')].trim(),
      lot: Number(c[idx(h, 'SqFtLot')]) || 0,
      use: c[idx(h, 'PresentUse')].trim(),
      bad: unbuildable || pcntUnusable > 50,
    });
  });
  console.log(`parcels: ${parcels.size.toLocaleString('en-US')} Seattle residential`);

  // ---------- pass 2: buildings (units, age, condition, address) ----------
  const bldgs = new Map(); // pin -> aggregate
  await scanCsv(path.join(DATA, 'EXTR_ResBldg.csv'), (h, c) => {
    const pin = c[idx(h, 'Major')] + c[idx(h, 'Minor')];
    if (!parcels.has(pin)) return;
    const units = Number(c[idx(h, 'NbrLivingUnits')]) || 0;
    const yr = Number(c[idx(h, 'YrBuilt')]) || null;
    const cur = bldgs.get(pin) || {
      units: 0, yr: null, grade: null, cond: null, sqft: 0, beds: 0, addr: '', zip: '',
    };
    cur.units += units;
    cur.sqft += Number(c[idx(h, 'SqFtTotLiving')]) || 0;
    cur.beds += Number(c[idx(h, 'Bedrooms')]) || 0;
    if (yr && (!cur.yr || yr < cur.yr)) cur.yr = yr;
    const grade = Number(c[idx(h, 'BldgGrade')]) || null;
    if (grade && (!cur.grade || grade < cur.grade)) cur.grade = grade;
    const cond = Number(c[idx(h, 'Condition')]) || null;
    if (cond && (!cur.cond || cond < cur.cond)) cur.cond = cond;
    if (!cur.addr) {
      cur.addr = normAddr(c[idx(h, 'Address')]);
      cur.zip = c[idx(h, 'ZipCode')].trim().slice(0, 5);
    }
    bldgs.set(pin, cur);
  });
  console.log(`buildings: ${bldgs.size.toLocaleString('en-US')} parcels with residential buildings`);

  // ---------- pass 3: current appraised values ----------
  const vals = new Map(); // pin -> {land, imps, billYr, exempt}
  await scanCsv(path.join(DATA, 'EXTR_RPAcct_NoName.csv'), (h, c) => {
    const pin = c[idx(h, 'Major')] + c[idx(h, 'Minor')];
    if (!parcels.has(pin)) return;
    const billYr = Number(c[idx(h, 'BillYr')]) || 0;
    const prev = vals.get(pin);
    if (prev && prev.billYr >= billYr) return;
    vals.set(pin, {
      land: Number(c[idx(h, 'ApprLandVal')]) || 0,
      imps: Number(c[idx(h, 'ApprImpsVal')]) || 0,
      billYr,
      exempt: c[idx(h, 'TaxStat')].trim().toUpperCase() === 'X',
    });
  });
  console.log(`values: ${vals.size.toLocaleString('en-US')} accounts`);

  // ---------- pass 4: sales (latest per pin + 2-4 unit comps) ----------
  const CUR_YEAR = new Date().getFullYear();
  const lastSale = new Map(); // pin -> {y, price}
  const compSales = []; // {zip, perUnit, y} for 2-4 unit parcels
  await scanCsv(path.join(DATA, 'EXTR_RPSale.csv'), (h, c) => {
    const pin = c[idx(h, 'Major')] + c[idx(h, 'Minor')];
    if (!parcels.has(pin)) return;
    if (c[idx(h, 'PrincipalUse')].trim() !== '6') return; // residential use sales
    const price = Number(c[idx(h, 'SalePrice')]) || 0;
    if (price < 100000) return; // rough non-market filter (gifts, $0 transfers)
    const date = c[idx(h, 'DocumentDate')].trim(); // MM/DD/YYYY
    const y = Number(date.slice(-4)) || 0;
    if (!y) return;
    const prev = lastSale.get(pin);
    if (!prev || y > prev.y) lastSale.set(pin, { y, price });
    const b = bldgs.get(pin);
    if (b && b.units >= 2 && b.units <= 4 && y >= CUR_YEAR - 3) {
      compSales.push({ zip: b.zip, perUnit: price / b.units, y });
    }
  });
  console.log(`sales: last-sale for ${lastSale.size.toLocaleString('en-US')} parcels, ${compSales.length} comp sales (2-4 units, since ${CUR_YEAR - 3})`);

  // comps: median $/unit by ZIP + citywide
  const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const compsByZip = {};
  for (const s of compSales) (compsByZip[s.zip] ||= []).push(s.perUnit);
  const comps = Object.fromEntries(
    Object.entries(compsByZip)
      .filter(([z, a]) => z && a.length >= 5)
      .map(([z, a]) => [z, { n: a.length, medPerUnit: Math.round(median(a)) }]),
  );
  const cityPerUnit = Math.round(median(compSales.map((s) => s.perUnit)));
  console.log(`comps: citywide median $${cityPerUnit.toLocaleString('en-US')}/unit across ${compSales.length} sales, ${Object.keys(comps).length} ZIPs`);

  // ---------- coordinates: PIN -> LAT/LON (cached) ----------
  let coords = {};
  if (fs.existsSync(COORD_CACHE)) {
    coords = JSON.parse(fs.readFileSync(COORD_CACHE, 'utf8'));
    console.log(`coords: ${Object.keys(coords).length.toLocaleString('en-US')} from cache`);
  } else {
    const base = 'https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/PARCEL_ADDRESS_PUB_AREA_3069/FeatureServer/0/query';
    let offset = 0;
    for (;;) {
      const url = `${base}?where=CTYNAME%3D%27SEATTLE%27&outFields=PIN,LAT,LON&returnGeometry=false&orderByFields=PIN&resultOffset=${offset}&resultRecordCount=1000&f=json`;
      let ok = false;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        try {
          const r = await fetch(url);
          const j = await r.json();
          const feats = j.features || [];
          for (const f of feats) {
            const a = f.attributes;
            if (a.PIN && a.LAT && a.LON) coords[a.PIN] = [Number(a.LAT), Number(a.LON)];
          }
          ok = true;
          if (feats.length < 1000) offset = -1;
        } catch {
          await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        }
      }
      if (!ok) throw new Error(`coord page failed at offset ${offset}`);
      if (offset === -1) break;
      offset += 1000;
      if (offset % 20000 === 0) console.log(`  coords... ${offset.toLocaleString('en-US')}`);
    }
    fs.writeFileSync(COORD_CACHE, JSON.stringify(coords));
    console.log(`coords: ${Object.keys(coords).length.toLocaleString('en-US')} fetched and cached`);
  }

  // ---------- RRIO registered rentals (address join) ----------
  const rrio = new Map(); // normAddr|zip -> units
  {
    let offset = 0;
    for (;;) {
      const url = `https://data.seattle.gov/resource/j2xh-c7vt.json?$select=originaladdress1,originalzip,rentalhousingunits&$where=statuscurrent='Active Registration'&$order=:id&$limit=50000&$offset=${offset}`;
      const r = await fetch(url);
      const j = await r.json();
      for (const row of j) {
        const key = `${normAddr(row.originaladdress1)}|${String(row.originalzip || '').slice(0, 5)}`;
        rrio.set(key, (rrio.get(key) || 0) + (Number(row.rentalhousingunits) || 0));
      }
      if (j.length < 50000) break;
      offset += 50000;
    }
    console.log(`rrio: ${rrio.size.toLocaleString('en-US')} active registered rental addresses`);
  }

  // ---------- open code cases (leads.json, address join) ----------
  const cases = new Map(); // normAddr|zip -> {open, escalated}
  {
    const leads = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'leads.json'), 'utf8'));
    for (const l of leads.leads) {
      cases.set(`${normAddr(l.addr)}|${l.zip}`, { open: l.openCount, escalated: !!l.escalated });
    }
    console.log(`cases: ${cases.size.toLocaleString('en-US')} addresses with open code cases`);
  }

  // ---------- assemble + score ----------
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const targets = [];
  let skippedNoCoord = 0;
  for (const [pin, p] of parcels) {
    if (p.bad) continue;
    const b = bldgs.get(pin);
    if (!b || !b.units || !b.addr) continue;
    const v = vals.get(pin);
    if (!v || v.exempt || (v.land + v.imps) <= 0) continue;
    if (p.lot < 1500) continue;

    const cap = zoneCapacity(p.zone);
    const units = b.units;
    const own24 = units >= 2 && units <= 4;
    const buildGap = cap ? Math.max(0, cap - units) : 0;

    // Build-path candidates need a reason to be on the list at all.
    if (!own24) {
      if (units !== 1 || !cap || cap < 4) continue;
      const landShareRaw = v.land / (v.land + v.imps);
      const key = `${b.addr}|${b.zip}`;
      const distress = cases.get(key);
      const interesting =
        p.lot >= 4000 || landShareRaw >= 0.6 || (b.yr && b.yr <= 1955) ||
        (b.grade && b.grade <= 6) || (b.cond && b.cond <= 2) || !!distress;
      if (!interesting) continue;
    }

    const co = coords[pin];
    if (!co) { skippedNoCoord++; continue; }

    const total = v.land + v.imps;
    const landShare = v.land / total;
    const key = `${b.addr}|${b.zip}`;
    const distress = cases.get(key) || { open: 0, escalated: false };
    const rrioUnits = rrio.get(key) || 0;
    const sale = lastSale.get(pin) || null;

    // Price signal: assessed cost per unit you would end up with (existing
    // units for 2-4s, zone capacity for build candidates) vs the ZIP's median
    // sale price per unit for 2-4 unit buildings. Below 1.0 means the assessed
    // basis per unit is under what small multifamily trades for nearby.
    const perUnitDenom = own24 ? units : Math.max(cap || 1, 1);
    const assessedPerUnit = total / perUnitDenom;
    const zipComp = comps[b.zip]?.medPerUnit || cityPerUnit;
    const priceRatio = assessedPerUnit / zipComp;

    // Score parts, each 0..1.
    const parts = {
      price: clamp01((1.4 - priceRatio) / 1.0), // ratio 0.4 -> 1.0, ratio 1.4 -> 0
      land: clamp01((landShare - 0.3) / 0.5), // 0.3 -> 0, 0.8 -> 1
      gap: cap ? clamp01(buildGap / cap) : 0,
      distress: clamp01(distress.open / 3) * (distress.escalated ? 1 : 0.7),
      age: clamp01(((b.yr ? CUR_YEAR - b.yr : 0) - 40) / 60) * (b.cond && b.cond <= 2 ? 1 : 0.75),
      held: sale && CUR_YEAR - sale.y >= 15 ? 1 : 0,
    };
    const W = { price: 0.3, land: 0.2, gap: 0.2, distress: 0.12, age: 0.12, held: 0.06 };
    const score = Math.round(Object.entries(W).reduce((s, [k, w]) => s + w * parts[k], 0) * 100) / 10;

    targets.push({
      pin,
      addr: b.addr,
      zip: b.zip,
      lat: co[0],
      lng: co[1],
      mode: own24 ? 'own' : 'build',
      units,
      cap,
      zone: p.zone,
      lot: p.lot,
      yr: b.yr,
      grade: b.grade,
      cond: b.cond,
      sqft: b.sqft,
      land: v.land,
      imps: v.imps,
      landShare: Math.round(landShare * 100),
      perUnit: Math.round(assessedPerUnit),
      priceRatio: Math.round(priceRatio * 100) / 100,
      open: distress.open,
      esc: distress.escalated,
      rrio: rrioUnits,
      saleY: sale?.y || null,
      salePrice: sale?.price || null,
      score,
      parts: Object.fromEntries(Object.entries(parts).map(([k, x]) => [k, Math.round(x * 100) / 100])),
    });
  }

  // Keep all 2-4s; cap build candidates to the best-scored so the JSON stays shippable.
  const own = targets.filter((t) => t.mode === 'own').sort((a, b) => b.score - a.score);
  const build = targets.filter((t) => t.mode === 'build').sort((a, b) => b.score - a.score).slice(0, 15000);
  const final = [...own, ...build];

  fs.writeFileSync(
    OUT,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      cityPerUnit,
      compsN: compSales.length,
      compsSinceY: CUR_YEAR - 3,
      comps,
      counts: { own: own.length, build: build.length, buildScanned: targets.length - own.length, skippedNoCoord },
      targets: final,
    }),
  );
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`targets.json: ${final.length.toLocaleString('en-US')} targets (${own.length.toLocaleString('en-US')} own 2-4, ${build.length.toLocaleString('en-US')} build path of ${(targets.length - own.length).toLocaleString('en-US')} scanned), ${kb.toLocaleString('en-US')}KB`);
  console.log('top own:', own.slice(0, 3).map((t) => `${t.addr} (${t.units}u, ${t.score})`).join(' | '));
  console.log('top build:', build.slice(0, 3).map((t) => `${t.addr} (${t.zone}, ${t.score})`).join(' | '));
}

main();
