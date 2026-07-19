// Builds src/lib/generated/force.json from Use of Force (ppi5-g2bj),
// SPD's log of incidents where officers used force. Run: node scripts/fetch-force.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, num } from './lib/socrata.mjs';

const ID = 'ppi5-g2bj';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'force.json');

const now = new Date();
const curYear = now.getUTCFullYear();
const curYearStart = `${curYear}-01-01`;
const latestFullYear = curYear - 1;

// Black share of Seattle's population, US Census 2020 (Black or African American
// alone, ~7.1%). External benchmark for the subject-race chart, rounded.
const BLACK_POP_SHARE_PCT = 7;

// Force level / type mix (all-time).
const byType = group(ID, 'incident_type', { limit: 12 })
  .map((r) => ({ key: r.incident_type, n: r.n }))
  .filter((r) => r.key);
const mostCommon = byType[0]?.key || '';
const mostCommonCount = byType[0]?.n || 0;

// Reports per year, complete years only (trim the trailing partial year).
// The dataset starts in late January 2014, so 2014 misses most of one month.
const yearly = soql(ID, {
  $select: 'date_extract_y(occured_date_time) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: `occured_date_time < '${curYearStart}'`,
}).map((r) => ({ y: String(num(r.y)), n: num(r.n) }));

const total = count(ID);
const latestYearRow = yearly.find((r) => r.y === String(latestFullYear));
const latestYearCount = latestYearRow ? latestYearRow.n : 0;
const peak = yearly.reduce((a, b) => (b.n > a.n ? b : a));
const lowest = yearly.reduce((a, b) => (b.n < a.n ? b : a));
const declinePct = Math.round((1 - latestYearCount / peak.n) * 100);
const isRecordLow = lowest.y === String(latestFullYear);
const firstYear = yearly[0]?.y || '';

// Officer-involved shootings per year, complete years only.
const oisYearly = soql(ID, {
  $select: 'date_extract_y(occured_date_time) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: `incident_type like '%OIS%' AND occured_date_time < '${curYearStart}'`,
}).map((r) => ({ y: String(num(r.y)), n: num(r.n) }));
// Fill years with zero shootings so the line does not skip them.
const oisMap = new Map(oisYearly.map((r) => [r.y, r.n]));
const ois = yearly.map((r) => ({ y: r.y, n: oisMap.get(r.y) ?? 0 }));
const oisLow = ois.reduce((a, b) => (b.n < a.n ? b : a));
const oisLatest = ois.find((r) => r.y === String(latestFullYear))?.n ?? 0;
const oisPeak = ois.reduce((a, b) => (b.n > a.n ? b : a));

// Subject race (all-time), with shares.
const byRace = group(ID, 'subject_race', { limit: 20 })
  .map((r) => ({ key: r.subject_race, n: r.n }))
  .filter((r) => r.key);
const raceTotal = byRace.reduce((s, r) => s + r.n, 0);
const black = byRace.find((r) => r.key === 'Black or African American');
const white = byRace.find((r) => r.key === 'White');
const notSpecified = byRace.find((r) => r.key === 'Not Specified');
const race = {
  rows: byRace.map((r) => ({ ...r, sharePct: Math.round((1000 * r.n) / raceTotal) / 10 })),
  total: raceTotal,
  blackCount: black?.n ?? 0,
  blackSharePct: Math.round((100 * (black?.n ?? 0)) / raceTotal),
  whiteCount: white?.n ?? 0,
  whiteSharePct: Math.round((100 * (white?.n ?? 0)) / raceTotal),
  notSpecifiedCount: notSpecified?.n ?? 0,
  blackPopSharePct: BLACK_POP_SHARE_PCT,
  blackVsPopRatio: Math.round((((black?.n ?? 0) / raceTotal) * 100) / BLACK_POP_SHARE_PCT),
};

// Officer concentration: group by officer_id, then measure how top-heavy it is.
const officerRows = group(ID, 'officer_id', { limit: 3000 })
  .map((r) => ({ id: r.officer_id, n: r.n }))
  .filter((r) => r.id);
const officerTotal = officerRows.reduce((s, r) => s + r.n, 0);
const topTenthCount = Math.ceil(officerRows.length * 0.1);
const topTenthSum = officerRows.slice(0, topTenthCount).reduce((s, r) => s + r.n, 0);
const officers = {
  distinct: officerRows.length,
  reportTotal: officerTotal,
  top: officerRows.slice(0, 12).map((r) => ({ key: `Officer ${r.id}`, n: r.n })),
  topOfficerCount: officerRows[0]?.n ?? 0,
  median: officerRows[Math.floor(officerRows.length / 2)]?.n ?? 0,
  topTenthCount,
  topTenthSharePct: Math.round((100 * topTenthSum) / officerTotal),
  top100: officerRows.slice(0, 100).map((r) => ({ id: r.id, n: r.n })),
};

// Precinct coverage: the precinct field went blank in 2025 (nearly every report
// carries a '-' placeholder). Find the last year where real precincts still
// cover most reports, and restrict the precinct chart to that range.
const SKIP = new Set(['-', 'X', 'OOJ', '0', '']);
const precinctByYear = soql(ID, {
  $select: 'date_extract_y(occured_date_time) as y, precinct, count(*) as n',
  $group: 'y, precinct',
  $order: 'y',
});
const perYear = new Map();
for (const r of precinctByYear) {
  const y = String(num(r.y));
  const cur = perYear.get(y) || { real: 0, all: 0 };
  cur.all += num(r.n);
  if (r.precinct && !SKIP.has(r.precinct)) cur.real += num(r.n);
  perYear.set(y, cur);
}
let precinctEndYear = Number(firstYear);
for (const [y, c] of [...perYear.entries()].sort()) {
  if (c.all > 0 && c.real / c.all >= 0.5) precinctEndYear = Math.max(precinctEndYear, Number(y));
}
const precinctWhere = `occured_date_time < '${precinctEndYear + 1}-01-01'`;
const byPrecinct = group(ID, 'precinct', { limit: 20, where: precinctWhere })
  .map((r) => ({ key: r.precinct, n: r.n }))
  .filter((r) => r.key && !SKIP.has(r.key));

// Monthly counts by level, complete months only, pivoted for the research CSV.
const firstOfCurrentMonth = `${curYear}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
const monthlyRaw = soql(ID, {
  $select: 'date_trunc_ym(occured_date_time) as m, incident_type, count(*) as n',
  $group: 'm, incident_type',
  $order: 'm',
  $where: `occured_date_time < '${firstOfCurrentMonth}'`,
});
const monthMap = new Map();
for (const r of monthlyRaw) {
  const m = String(r.m).slice(0, 7);
  const cur = monthMap.get(m) || { m, level1: 0, level2: 0, level3: 0, ois: 0 };
  const t = String(r.incident_type || '');
  if (t.includes('OIS')) cur.ois += num(r.n);
  else if (t.startsWith('Level 1')) cur.level1 += num(r.n);
  else if (t.startsWith('Level 2')) cur.level2 += num(r.n);
  else if (t.startsWith('Level 3')) cur.level3 += num(r.n);
  monthMap.set(m, cur);
}
const monthly = [...monthMap.values()].sort((a, b) => (a.m < b.m ? -1 : 1));

const meta = { curYearStart, firstOfCurrentMonth, precinctEndYear, firstYear };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    latestFullYear,
    latestYearCount,
    peakYear: peak.y,
    peakCount: peak.n,
    declinePct,
    isRecordLow,
    mostCommon,
    mostCommonCount,
    byType,
    byPrecinct,
    yearly,
    ois,
    oisLow,
    oisLatest,
    oisPeak,
    race,
    officers,
    monthly,
    meta,
  }),
);
console.log(`force.json: total=${total} latestFullYear=${latestFullYear} latestYearCount=${latestYearCount}`);
console.log(`peak: ${peak.y}=${peak.n}, decline ${declinePct}%, recordLow=${isRecordLow}`);
console.log('types:', byType.map((t) => `${t.key} (${t.n})`).join(', '));
console.log(`precincts (through ${precinctEndYear}):`, byPrecinct.map((p) => `${p.key} (${p.n})`).join(', '));
console.log('years:', yearly.map((y) => `${y.y}:${y.n}`).join(', '));
console.log('ois:', ois.map((y) => `${y.y}:${y.n}`).join(', '));
console.log(`race: black=${race.blackCount} (${race.blackSharePct}%), white=${race.whiteCount} (${race.whiteSharePct}%), notSpecified=${race.notSpecifiedCount}`);
console.log(`officers: ${officers.distinct} distinct, top=${officers.topOfficerCount}, median=${officers.median}, top10%=${officers.topTenthSharePct}% of reports`);
console.log(`monthly rows: ${monthly.length} (${monthly[0]?.m} to ${monthly[monthly.length - 1]?.m})`);
