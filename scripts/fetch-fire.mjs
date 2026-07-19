// Builds src/lib/generated/fire.json from Real-Time Fire 911 Calls (kzjm-xkqj).
// Most calls are medical aid, and the fires themselves are mostly outdoors now:
// rubbish and encampment fires, not buildings. Run: node scripts/fetch-fire.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { soql, group, count, rows, num, inSeattle, sleep } from './lib/socrata.mjs';
import { rollup, zipForPoint } from './lib/zipgeo.mjs';

const ID = 'kzjm-xkqj';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'fire.json');

// Computed windows. No hardcoded calendar dates: everything rolls forward.
const now = new Date();
const curYear = now.getUTCFullYear();
const lastFullYear = curYear - 1; // newest complete calendar year
const yearStart = curYear - 7; // first year on the yearly charts (7 full years)
const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const since30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const monthStart = `${curYear - 3}-01-01`; // monthly trend window
const monthEnd = `${now.toISOString().slice(0, 7)}-01`; // trims the partial current month
const pickerStart = `${yearStart}-01-01`;

const inList = (arr) => arr.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');

// Same request path as soql() but with --compressed, for the big paged pulls.
const TOKEN = process.env.SOCRATA_APP_TOKEN ?? '';
function soqlBig(params, { tries = 6 } = {}) {
  const args = ['-s', '--compressed', '--max-time', '240', '-H', `X-App-Token: ${TOKEN}`, '-G', `https://data.seattle.gov/resource/${ID}.json`];
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
  for (let i = 0; i < tries; i++) {
    try {
      const json = JSON.parse(execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }));
      if (Array.isArray(json)) return json;
    } catch {
      /* retry */
    }
    sleep((i + 1) * 4);
  }
  throw new Error(`soqlBig failed for ${ID}`);
}

// ---- Headline counts and top types (last 12 months) ----
const topTypes = group(ID, 'type', { where: `datetime > '${yearAgo}'`, limit: 12 })
  .map((r) => ({ key: r.type, n: r.n }))
  .filter((r) => r.key);

const last12 = count(ID, `datetime > '${yearAgo}'`);
const last30 = count(ID, `datetime > '${since30}'`);

// ---- What share of calls is medical vs an actual fire (last 12 months) ----
// Classified from the full type list, not a hand-picked subset.
const MEDICAL_RE = /aid response|medic response|low acuity|triaged|nurseline|trans to amr|medical alarm/i;
const FIRE_RE = /fire|illegal burn/i;
const NOT_A_FIRE_RE = /alarm|firewatch|hang-up|fire fighter|derailment/i; // "fire" in the name but not a fire
const allTypes12 = group(ID, 'type', { where: `datetime > '${yearAgo}'`, limit: 400 });
let medicalN = 0;
let fireN = 0;
let classifiedTotal = 0;
for (const r of allTypes12) {
  const t = r.type || '';
  classifiedTotal += r.n;
  if (MEDICAL_RE.test(t)) medicalN += r.n;
  else if (FIRE_RE.test(t) && !NOT_A_FIRE_RE.test(t)) fireN += r.n;
}
const shares = {
  total: classifiedTotal,
  medical: medicalN,
  fire: fireN,
  other: classifiedTotal - medicalN - fireN,
  medicalPct: Math.round((100 * medicalN) / classifiedTotal),
  firePct: Math.round((100 * fireN) / classifiedTotal),
  otherPct: 100 - Math.round((100 * medicalN) / classifiedTotal) - Math.round((100 * fireN) / classifiedTotal),
};

// ---- The outdoor-fire story: yearly counts by fire type ----
const OUTDOOR = ['Rubbish Fire', 'Encampment Fire', 'Dumpster Fire', 'Brush Fire', 'Bark Fire'];
const BUILDING = ['Fire in Building', 'Fire in Single Family Res', 'Fire In A Highrise'];
const yearlyRaw = soql(ID, {
  $select: 'date_extract_y(datetime) as y, type, count(*) as n',
  $group: 'y, type',
  $order: 'y',
  $where: `date_extract_y(datetime) >= ${yearStart} AND date_extract_y(datetime) <= ${lastFullYear} AND type in (${inList([...OUTDOOR, ...BUILDING])})`,
  $limit: '500',
});
const byType = {};
for (const r of yearlyRaw) {
  const t = r.type;
  if (!byType[t]) byType[t] = {};
  byType[t][String(r.y)] = num(r.n);
}
const years = [];
for (let y = yearStart; y <= lastFullYear; y++) years.push(y);
const at = (t, y) => byType[t]?.[String(y)] ?? 0;
const encampFirstYear = years.find((y) => at('Encampment Fire', y) > 0) ?? null;
const fireYearly = years.map((y) => ({
  y: String(y),
  rubbish: at('Rubbish Fire', y),
  // Null before the label existed: those fires were coded under other types.
  encampment: encampFirstYear != null && y >= encampFirstYear ? at('Encampment Fire', y) : null,
  building: BUILDING.reduce((s, t) => s + at(t, y), 0),
  dumpster: at('Dumpster Fire', y),
  brush: at('Brush Fire', y),
  bark: at('Bark Fire', y),
  outdoor: OUTDOOR.reduce((s, t) => s + at(t, y), 0),
}));
const argmax = (rows, key) => rows.reduce((best, r) => ((r[key] ?? -1) > (best[key] ?? -1) ? r : best), rows[0]);
const first = fireYearly[0];
const last = fireYearly[fireYearly.length - 1];
const rubbishPeak = argmax(fireYearly, 'rubbish');
const encampPeak = argmax(fireYearly, 'encampment');
const outdoorPeak = argmax(fireYearly, 'outdoor');
const story = {
  baseYear: num(first.y),
  lastYear: num(last.y),
  rubbishBase: first.rubbish,
  rubbishPeakYear: num(rubbishPeak.y),
  rubbishPeakN: rubbishPeak.rubbish,
  rubbishLast: last.rubbish,
  rubbishFactor: Math.round(rubbishPeak.rubbish / first.rubbish),
  encampFirstYear,
  encampPeakYear: num(encampPeak.y),
  encampPeakN: encampPeak.encampment,
  encampLast: last.encampment,
  encampDropPct: Math.round((1 - last.encampment / encampPeak.encampment) * 100),
  buildingBase: first.building,
  buildingLast: last.building,
  outdoorBase: first.outdoor,
  outdoorPeakYear: num(outdoorPeak.y),
  outdoorPeakN: outdoorPeak.outdoor,
  outdoorLast: last.outdoor,
};

// ---- Overdose responses by year (label exists since 2022) ----
const odYearly = soql(ID, {
  $select: 'date_extract_y(datetime) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: `type = 'Medic Response- Overdose' AND date_extract_y(datetime) <= ${lastFullYear}`,
}).map((r) => ({ y: String(r.y), n: num(r.n) }));
const odPeak = argmax(odYearly, 'n');
const overdose = {
  firstYear: num(odYearly[0]?.y),
  firstN: odYearly[0]?.n ?? 0,
  peakYear: num(odPeak?.y),
  peakN: odPeak?.n ?? 0,
  lastYear: num(odYearly[odYearly.length - 1]?.y),
  lastN: odYearly[odYearly.length - 1]?.n ?? 0,
};

// ---- Monthly trend, partial months trimmed on both ends ----
const monthly = soql(ID, {
  $select: 'date_trunc_ym(datetime) as ym, count(*) as n',
  $group: 'ym',
  $order: 'ym',
  $where: `datetime >= '${monthStart}' AND datetime < '${monthEnd}'`,
}).map((r) => ({ ym: (r.ym || '').slice(0, 7), n: num(r.n) }));

// ---- Per-type monthly series for the picker ----
const pickerTypes = [
  ...new Set([
    ...topTypes.slice(0, 10).map((t) => t.key),
    'Rubbish Fire',
    'Encampment Fire',
    'Dumpster Fire',
    'Brush Fire',
    'Illegal Burn',
    'Fire in Building',
    'Car Fire',
    'Medic Response- Overdose',
  ]),
];
const pickerRaw = soql(ID, {
  $select: 'date_trunc_ym(datetime) as ym, type, count(*) as n',
  $group: 'ym, type',
  $order: 'ym',
  $where: `datetime >= '${pickerStart}' AND datetime < '${monthEnd}' AND type in (${inList(pickerTypes)})`,
  $limit: '10000',
});
const months = [];
for (let d = new Date(`${pickerStart}T00:00:00Z`); d.toISOString().slice(0, 10) < monthEnd; d.setUTCMonth(d.getUTCMonth() + 1)) {
  months.push(d.toISOString().slice(0, 7));
}
const pickerMap = {};
for (const r of pickerRaw) {
  const ym = (r.ym || '').slice(0, 7);
  if (!pickerMap[r.type]) pickerMap[r.type] = {};
  pickerMap[r.type][ym] = num(r.n);
}
const pickerSeries = pickerTypes
  .filter((t) => pickerMap[t])
  .map((t) => {
    const firstYm = months.find((m) => (pickerMap[t][m] ?? 0) > 0);
    // Null before the label first appears, zero for quiet months after.
    const values = months.map((m) => (firstYm && m >= firstYm ? (pickerMap[t][m] ?? 0) : null));
    return { key: t, values };
  });

// ---- Recent points for the map ----
const raw = rows(ID, {
  select: 'latitude,longitude,type,datetime',
  where: 'latitude IS NOT NULL',
  order: 'datetime DESC',
  limit: 6000,
});
const points = raw
  .map((r) => ({ lat: num(r.latitude), lng: num(r.longitude), t: r.type || 'Other', d: (r.datetime || '').slice(0, 10) }))
  .filter((p) => inSeattle(p.lat, p.lng));

// ---- Per-ZIP comparison over a true 12-month window (paged, not sampled) ----
const areaCounts = {};
let binned = 0;
let fetched = 0;
for (let offset = 0; ; offset += 50000) {
  const page = soqlBig({
    $select: 'latitude,longitude',
    $where: `datetime > '${yearAgo}' AND latitude IS NOT NULL`,
    $order: 'datetime',
    $limit: '50000',
    $offset: String(offset),
  });
  fetched += page.length;
  for (const r of page) {
    const z = zipForPoint(num(r.latitude), num(r.longitude));
    if (z) {
      areaCounts[z] = (areaCounts[z] || 0) + 1;
      binned++;
    }
  }
  if (page.length < 50000) break;
}
const areaByZip = rollup(areaCounts, 'the last 12 months');

const windows = { yearAgo, since30, monthStart, monthEnd, yearStart, lastFullYear, pickerStart };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    windows,
    last12,
    last30,
    shares,
    topTypes,
    fireYearly,
    story,
    odYearly,
    overdose,
    monthly,
    picker: { months, series: pickerSeries },
    points,
    areaByZip,
  }),
);
console.log(`fire.json: last12=${last12} last30=${last30} types=${topTypes.length} points=${points.length} months=${monthly.length}`);
console.log(`shares: medical=${shares.medical} (${shares.medicalPct}%) fire=${shares.fire} (${shares.firePct}%) of ${shares.total}`);
console.log(
  `story: rubbish ${story.rubbishBase} (${story.baseYear}) -> peak ${story.rubbishPeakN} (${story.rubbishPeakYear}), ${story.rubbishFactor}x; ` +
    `encampment peak ${story.encampPeakN} (${story.encampPeakYear}) -> ${story.encampLast} (${story.lastYear}), down ${story.encampDropPct}%; ` +
    `building ${story.buildingBase} -> ${story.buildingLast}; outdoor ${story.outdoorBase} -> peak ${story.outdoorPeakN} (${story.outdoorPeakYear}) -> ${story.outdoorLast}`,
);
console.log(`overdose: ${odYearly.map((r) => `${r.y}=${r.n}`).join(' ')}`);
console.log(`picker: ${pickerSeries.length} types x ${months.length} months`);
console.log(`area: fetched=${fetched} binned=${binned} cityRate=${areaByZip.cityRate} topZip=${areaByZip.zips[0]?.zip} (${areaByZip.zips[0]?.per1000}/1k)`);
