// Builds src/lib/generated/calls.json from 911 Call Data (33kz-ixgy),
// the Seattle CAD feed (10.9M rows, aggregated server side).
//
// The dataset is every police dispatch event, not just 911 calls. Every number
// on the page splits on call_type_received_classification: COMMUNITY_GENERATED
// (someone asked for help: 911, the non-emergency line, alarms, text) versus
// OFFICER_GENERATED (an officer started the event: traffic stops, premise
// checks, patrol work).
// Run: node scripts/fetch-calls.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { soql, group, count, rows, num, inSeattle, sleep } from './lib/socrata.mjs';
import { rollup, zipForPoint } from './lib/zipgeo.mjs';

const ID = '33kz-ixgy';
const TIME = 'cad_event_original_time_queued';
const TYPE = 'initial_call_type';
const CLASS = 'call_type_received_classification';
const COMMUNITY = `${CLASS}='COMMUNITY_GENERATED'`;
const OFFICER = `${CLASS}='OFFICER_GENERATED'`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'calls.json');

// ---- computed period cutoffs ----
const now = new Date();
const CUR_YEAR = now.getUTCFullYear();
const LAST_FULL_YEAR = CUR_YEAR - 1; // most recent complete calendar year
const curYearStart = `${CUR_YEAR}-01-01`;
const firstOfCurrentMonth = `${now.toISOString().slice(0, 7)}-01`;
const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
// Monthly trend: the 3 years of complete months ending with last month.
const monthlyStart = `${CUR_YEAR - 3}${firstOfCurrentMonth.slice(4)}`;
// 2019 is the last calendar year before the pandemic and the SPD staffing
// exodus; a fixed historical anchor for the proactive-policing story.
const PRE_PANDEMIC_YEAR = 2019;
const preStart = `${PRE_PANDEMIC_YEAR}-01-01`;

// The feed starts mid-year; trim the leading partial year from yearly charts.
const lo = soql(ID, { $select: `min(${TIME}) as lo` })[0]?.lo ?? '';
const firstFullYear = lo.slice(5, 10) === '01-01' ? num(lo.slice(0, 4)) : num(lo.slice(0, 4)) + 1;

// ---- headline counts, last 12 months ----
const total12 = count(ID, `${TIME} > '${yearAgo}'`);
const community12 = count(ID, `${TIME} > '${yearAgo}' AND ${COMMUNITY}`);
const officer12 = count(ID, `${TIME} > '${yearAgo}' AND ${OFFICER}`);
const calls911_12 = count(ID, `${TIME} > '${yearAgo}' AND call_type='911'`);
const last30Community = count(ID, `${TIME} > '${monthAgo}' AND ${COMMUNITY}`);

// ---- top call types, community-generated only ----
const topTypes = group(ID, TYPE, { where: `${TIME} > '${yearAgo}' AND ${COMMUNITY}`, limit: 12 })
  .map((r) => ({ key: r[TYPE], n: r.n }))
  .filter((r) => r.key);

// ---- yearly community vs officer split, complete years only ----
const yearlyRaw = soql(ID, {
  $select: `date_extract_y(${TIME}) as y, ${CLASS} as c, count(*) as n`,
  $group: 'y, c',
  $order: 'y',
  $where: `${TIME} < '${curYearStart}'`,
  $limit: '200',
});
const yearlyMap = new Map();
for (const r of yearlyRaw) {
  const y = num(r.y);
  if (!y || y < firstFullYear || y > LAST_FULL_YEAR) continue;
  const row = yearlyMap.get(y) || { y: String(y), community: 0, officer: 0 };
  if (r.c === 'COMMUNITY_GENERATED') row.community += num(r.n);
  else if (r.c === 'OFFICER_GENERATED') row.officer += num(r.n);
  yearlyMap.set(y, row);
}
const yearly = [...yearlyMap.values()].sort((a, b) => num(a.y) - num(b.y));

// Proactive-policing stats: pre-pandemic anchor, the floor, the latest year,
// and the last year that beat the latest ("the most since ...").
const yr = (y) => yearly.find((r) => num(r.y) === y);
const anchorN = yr(PRE_PANDEMIC_YEAR)?.officer ?? 0;
let floorYear = PRE_PANDEMIC_YEAR;
let floorN = anchorN;
for (const r of yearly) {
  if (num(r.y) >= PRE_PANDEMIC_YEAR && r.officer < floorN) {
    floorN = r.officer;
    floorYear = num(r.y);
  }
}
const lastN = yr(LAST_FULL_YEAR)?.officer ?? 0;
let sinceYear = null;
for (const r of yearly) if (num(r.y) < LAST_FULL_YEAR && r.officer > lastN) sinceYear = num(r.y);
const officerStats = {
  anchorYear: PRE_PANDEMIC_YEAR,
  anchorN,
  floorYear,
  floorN,
  lastYear: LAST_FULL_YEAR,
  lastN,
  sinceYear,
  dropPct: anchorN ? Math.round((1 - floorN / anchorN) * 100) : null,
};

// ---- priority-1 first-response time, community calls, complete years ----
const respRaw = soql(ID, {
  $select: `date_extract_y(${TIME}) as y, avg(cad_event_first_response_time_s_) as s, count(*) as n`,
  $where: `priority='1' AND ${COMMUNITY} AND cad_event_first_response_time_s_ IS NOT NULL AND ${TIME} < '${curYearStart}'`,
  $group: 'y',
  $order: 'y',
  $limit: '100',
});
const respYearly = respRaw
  .map((r) => ({ y: String(num(r.y)), sec: Math.round(num(r.s)), min: Math.round((num(r.s) / 60) * 10) / 10, n: num(r.n) }))
  .filter((r) => num(r.y) >= firstFullYear && num(r.y) <= LAST_FULL_YEAR);
const respAnchor = respYearly.find((r) => num(r.y) === PRE_PANDEMIC_YEAR);
const respWorst = respYearly.reduce((a, b) => (b.sec > a.sec ? b : a), respYearly[0]);
const respLast = respYearly[respYearly.length - 1];
const respStats = {
  anchorYear: PRE_PANDEMIC_YEAR,
  anchorMin: respAnchor?.min ?? null,
  worstYear: num(respWorst?.y),
  worstMin: respWorst?.min ?? null,
  lastYear: num(respLast?.y),
  lastMin: respLast?.min ?? null,
};

// ---- monthly community vs officer, complete months, last 3 years ----
const monthlyRaw = soql(ID, {
  $select: `date_trunc_ym(${TIME}) as ym, ${CLASS} as c, count(*) as n`,
  $group: 'ym, c',
  $order: 'ym',
  $where: `${TIME} >= '${monthlyStart}' AND ${TIME} < '${firstOfCurrentMonth}'`,
  $limit: '500',
});
const monthlyMap = new Map();
for (const r of monthlyRaw) {
  const ym = (r.ym || '').slice(0, 7);
  if (!ym) continue;
  const row = monthlyMap.get(ym) || { ym, community: 0, officer: 0 };
  if (r.c === 'COMMUNITY_GENERATED') row.community += num(r.n);
  else if (r.c === 'OFFICER_GENERATED') row.officer += num(r.n);
  monthlyMap.set(ym, row);
}
const monthly = [...monthlyMap.values()].sort((a, b) => (a.ym < b.ym ? -1 : 1));

// ---- per-type monthly series for the picker (top community types, 2019+) ----
const inList = topTypes.map((t) => `'${t.key.replace(/'/g, "''")}'`).join(',');
const typeRaw = soql(ID, {
  $select: `date_trunc_ym(${TIME}) as ym, ${TYPE} as t, count(*) as n`,
  $where: `${COMMUNITY} AND ${TYPE} in (${inList}) AND ${TIME} >= '${preStart}' AND ${TIME} < '${firstOfCurrentMonth}'`,
  $group: 'ym, t',
  $order: 'ym',
  $limit: '10000',
});
const typeMonths = [];
for (let d = new Date(`${preStart}T00:00:00Z`); d.toISOString().slice(0, 10) < firstOfCurrentMonth; d.setUTCMonth(d.getUTCMonth() + 1)) {
  typeMonths.push(d.toISOString().slice(0, 7));
}
const monthIdx = new Map(typeMonths.map((m, i) => [m, i]));
const typeSeriesMap = new Map(topTypes.map((t) => [t.key, typeMonths.map(() => 0)]));
for (const r of typeRaw) {
  const i = monthIdx.get((r.ym || '').slice(0, 7));
  const vals = typeSeriesMap.get(r.t);
  if (i != null && vals) vals[i] = num(r.n);
}
const typeTrend = {
  months: typeMonths,
  series: topTypes.map((t) => ({ key: t.key, values: typeSeriesMap.get(t.key) })),
};

// Welfare-check record, computed from complete years.
const welfareRaw = soql(ID, {
  $select: `date_extract_y(${TIME}) as y, count(*) as n`,
  $where: `${TYPE}='SERVICE - WELFARE CHECK' AND ${TIME} < '${curYearStart}'`,
  $group: 'y',
  $order: 'y',
  $limit: '100',
})
  .map((r) => ({ y: num(r.y), n: num(r.n) }))
  .filter((r) => r.y >= firstFullYear && r.y <= LAST_FULL_YEAR);
const welfarePeak = welfareRaw.reduce((a, b) => (b.n > a.n ? b : a), welfareRaw[0]);
const welfarePrior = welfareRaw.filter((r) => r.y !== welfarePeak.y).reduce((a, b) => (b.n > a.n ? b : a), { y: null, n: 0 });
const welfareStats = { peakYear: welfarePeak.y, peakN: welfarePeak.n, priorYear: welfarePrior.y, priorN: welfarePrior.n };

// ---- map points: the most recent community calls with coordinates ----
const raw = rows(ID, {
  select: `dispatch_latitude,dispatch_longitude,${TYPE},${TIME}`,
  where: `dispatch_latitude IS NOT NULL AND ${COMMUNITY}`,
  order: `${TIME} DESC`,
  limit: 6000,
});
const points = raw
  .map((r) => ({
    lat: num(r.dispatch_latitude),
    lng: num(r.dispatch_longitude),
    t: r[TYPE] || 'Other',
    d: (r[TIME] || '').slice(0, 10),
  }))
  .filter((p) => inSeattle(p.lat, p.lng));

// ---- per-ZIP rollup: every community call in the last 12 months ----
// The dataset has no ZIP field, so page the full window of coordinates
// (roughly 460k rows, 50k a page) and bin each point into a Seattle ZIP.
function soqlPage(params) {
  const args = ['-s', '--compressed', '--max-time', '240', '-H', `X-App-Token: ${process.env.SOCRATA_APP_TOKEN ?? ''}`, '-G', `https://data.seattle.gov/resource/${ID}.json`];
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
  let last = '';
  for (let i = 0; i < 6; i++) {
    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
      const json = JSON.parse(out);
      if (Array.isArray(json)) return json;
      last = out.slice(0, 200);
    } catch (e) {
      last = String(e.message).slice(0, 200);
    }
    sleep((i + 1) * 4);
  }
  throw new Error(`paged soql failed: ${last}`);
}

const PAGE = 50000;
const zipCounts = {};
let binned = 0;
let windowRows = 0;
for (let offset = 0; ; offset += PAGE) {
  const page = soqlPage({
    $select: 'dispatch_latitude,dispatch_longitude',
    $where: `${TIME} > '${yearAgo}' AND ${COMMUNITY} AND dispatch_latitude IS NOT NULL`,
    $order: 'cad_event_number',
    $limit: String(PAGE),
    $offset: String(offset),
  });
  windowRows += page.length;
  for (const r of page) {
    const z = zipForPoint(num(r.dispatch_latitude), num(r.dispatch_longitude));
    if (z) {
      zipCounts[z] = (zipCounts[z] || 0) + 1;
      binned++;
    }
  }
  console.log(`  zip paging: offset=${offset} got=${page.length} binned=${binned}`);
  if (page.length < PAGE) break;
}
const areaByZip = rollup(zipCounts, 'the last 12 months');

const stats = {
  total12,
  community12,
  officer12,
  calls911_12,
  last30Community,
  officerSharePct: total12 ? Math.round((officer12 / total12) * 100) : null,
  share911Pct: community12 ? Math.round((calls911_12 / community12) * 100) : null,
  officer: officerStats,
  resp: respStats,
  welfare: welfareStats,
};

const meta = { yearAgo, monthlyStart, firstOfCurrentMonth, preStart, curYearStart, firstFullYear, lastFullYear: LAST_FULL_YEAR };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), stats, meta, topTypes, yearly, respYearly, monthly, typeTrend, points, areaByZip }),
);
console.log(`calls.json: community12=${community12} officer12=${officer12} calls911=${calls911_12} total12=${total12}`);
console.log(`officer arc: ${officerStats.anchorYear}=${officerStats.anchorN} floor ${officerStats.floorYear}=${officerStats.floorN} last ${officerStats.lastYear}=${officerStats.lastN} (most since ${officerStats.sinceYear})`);
console.log(`resp p1: ${respStats.anchorYear}=${respStats.anchorMin}min worst ${respStats.worstYear}=${respStats.worstMin}min last ${respStats.lastYear}=${respStats.lastMin}min`);
console.log(`welfare: peak ${welfareStats.peakYear}=${welfareStats.peakN} prior ${welfareStats.priorYear}=${welfareStats.priorN}`);
console.log(`types=${topTypes.length} points=${points.length} months=${monthly.length} years=${yearly.length} typeTrendMonths=${typeTrend.months.length}`);
console.log('top types:', topTypes.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
console.log(`areaByZip: windowRows=${windowRows} binned=${binned} total=${areaByZip.total} cityRate=${areaByZip.cityRate} window="${areaByZip.windowLabel}"`);
console.log('top zips:', areaByZip.zips.slice(0, 5).map((z) => `${z.zip} ${z.label} count=${z.count} per1000=${z.per1000}`).join(' | '));
