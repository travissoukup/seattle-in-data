// Builds src/lib/generated/trades.json from two datasets:
// Trade Permits (c87v-5hwh) and Electrical Permits (c4tj-daue).
// Run: node scripts/fetch-trades.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';

const TRADE = 'c87v-5hwh';
const ELEC = 'c4tj-daue';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'trades.json');

// Top trade permit types.
const tradeTypes = group(TRADE, 'permittype', { limit: 12 })
  .map((r) => ({ key: r.permittype, n: r.n }))
  .filter((r) => r.key);

// Chart start: the first full calendar year both datasets cover. Each dataset's
// earliest record lands mid-year (July 2002 for both), so that leading partial
// year is trimmed rather than plotted as a fake dip.
const firstFullYear = (id) => {
  const d = String(soql(id, { $select: 'min(issueddate) as d' })[0]?.d || '').slice(0, 10);
  const y = Number(d.slice(0, 4));
  return d.endsWith('-01-01') ? y : y + 1;
};
const chartStart = Math.max(firstFullYear(TRADE), firstFullYear(ELEC));

// Issued per year, two series. Trade and Electrical keyed by year.
// issueddate is stored as text (YYYY-MM-DD), so use substring + string compares.
const yearSql = (id, extraWhere) =>
  soql(id, {
    $select: 'substring(issueddate,1,4) as y, count(*) as n',
    $group: 'y',
    $order: 'y',
    $where: `issueddate >= '${chartStart}-01-01'` + (extraWhere ? ` AND ${extraWhere}` : ''),
  })
    .map((r) => ({ y: String(r.y), n: num(r.n) }))
    .filter((r) => r.y && r.y.length === 4);

const tradeYears = yearSql(TRADE);
const elecYears = yearSql(ELEC);

const tradeMap = new Map(tradeYears.map((r) => [r.y, r.n]));
const elecMap = new Map(elecYears.map((r) => [r.y, r.n]));
const years = [...new Set([...tradeMap.keys(), ...elecMap.keys()])].sort();
// Drop the current (partial) year so the line does not nosedive.
const thisYear = String(new Date().getFullYear());
const yearly = years
  .filter((y) => y < thisYear)
  .map((y) => ({ y, trade: tradeMap.get(y) || 0, elec: elecMap.get(y) || 0 }));

// Electrification: heat pump vs gas furnace mentions in trade permit
// descriptions, by issue year. Free-text LIKE match, verified against the live
// API before publishing. Current partial year is trimmed like the main chart.
const hpYears = yearSql(TRADE, "upper(description) LIKE '%HEAT PUMP%'");
const gasYears = yearSql(TRADE, "upper(description) LIKE '%GAS FURNACE%'");
const hpMap = new Map(hpYears.map((r) => [r.y, r.n]));
const gasMap = new Map(gasYears.map((r) => [r.y, r.n]));
const electrify = years
  .filter((y) => y < thisYear)
  .map((y) => ({ y, hp: hpMap.get(y) || 0, gas: gasMap.get(y) || 0 }));

// Totals.
const totalTrade = count(TRADE);
const totalElec = count(ELEC);
const lastYear = String(Number(thisYear) - 1);
const tradeLastYear = count(TRADE, `issueddate >= '${lastYear}-01-01' AND issueddate < '${thisYear}-01-01'`);
const elecLastYear = count(ELEC, `issueddate >= '${lastYear}-01-01' AND issueddate < '${thisYear}-01-01'`);
const issuedLastYear = tradeLastYear + elecLastYear;

// Headline stats for the electrification story, all computed from the series.
const hpDecadeYear = String(Number(lastYear) - 10);
const hpDecadeAgo = hpMap.get(hpDecadeYear) || 0;
const gasDecadeAgo = gasMap.get(hpDecadeYear) || 0;
const hpLastYear = hpMap.get(lastYear) || 0;
const gasLastYear = gasMap.get(lastYear) || 0;
const hpPeak = electrify.reduce((best, r) => (r.hp > best.hp ? r : best), electrify[0]);
const hpMultiple = hpDecadeAgo ? Math.round((hpPeak.hp / hpDecadeAgo) * 10) / 10 : 0;
const hpShareLastYear = tradeLastYear ? Math.round((hpLastYear / tradeLastYear) * 1000) / 10 : 0;

// Who pulls electrical permits: top contractors over the trailing 12 months,
// plus the share of recent permits that list no contractor at all.
const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const contractorRows = group(ELEC, 'contractorcompanyname', { where: `issueddate >= '${since}'`, limit: 13 });
const recentElec = count(ELEC, `issueddate >= '${since}'`);
const noContractorN = contractorRows.find((r) => !r.contractorcompanyname)?.n || 0;
const noContractorPct = recentElec ? Math.round((noContractorN / recentElec) * 1000) / 10 : 0;
const contractors = contractorRows
  .filter((r) => r.contractorcompanyname)
  .slice(0, 10)
  .map((r) => ({ key: r.contractorcompanyname, n: r.n }));

// Map points: recent issued from both, ~3000 each.
const tradeRaw = rows(TRADE, {
  select: 'latitude,longitude,permittype,issueddate',
  where: 'latitude IS NOT NULL AND issueddate IS NOT NULL',
  order: 'issueddate DESC',
  limit: 3000,
});
const elecRaw = rows(ELEC, {
  select: 'latitude,longitude,issueddate',
  where: 'latitude IS NOT NULL AND issueddate IS NOT NULL',
  order: 'issueddate DESC',
  limit: 3000,
});

const points = [
  ...tradeRaw.map((r) => ({
    lat: num(r.latitude),
    lng: num(r.longitude),
    t: 'Trade',
    sub: r.permittype || 'Trade',
    d: (r.issueddate || '').slice(0, 10),
  })),
  ...elecRaw.map((r) => ({
    lat: num(r.latitude),
    lng: num(r.longitude),
    t: 'Electrical',
    sub: 'Electrical',
    d: (r.issueddate || '').slice(0, 10),
  })),
].filter((p) => inSeattle(p.lat, p.lng));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalTrade,
    totalElec,
    issuedLastYear,
    lastYear,
    chartStart,
    tradeTypes,
    yearly,
    electrify,
    hpDecadeYear,
    hpDecadeAgo,
    hpLastYear,
    hpPeakYear: hpPeak.y,
    hpPeakN: hpPeak.hp,
    hpMultiple,
    hpShareLastYear,
    gasDecadeAgo,
    gasLastYear,
    contractors,
    recentElec,
    noContractorN,
    noContractorPct,
    contractorSince: since,
    points,
  }),
);
console.log(
  `trades.json: trade=${totalTrade} elec=${totalElec} issuedLastYear(${lastYear})=${issuedLastYear} chartStart=${chartStart} types=${tradeTypes.length} years=${yearly.length} points=${points.length}`,
);
console.log('top trade types:', tradeTypes.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
console.log(
  `heat pump: ${hpDecadeYear}=${hpDecadeAgo} peak ${hpPeak.y}=${hpPeak.hp} (${hpMultiple}x) ${lastYear}=${hpLastYear} share=${hpShareLastYear}% | gas furnace ${hpDecadeYear}=${gasDecadeAgo} ${lastYear}=${gasLastYear}`,
);
console.log(
  `electrical since ${since}: total=${recentElec} noContractor=${noContractorN} (${noContractorPct}%) top=${contractors
    .slice(0, 3)
    .map((c) => `${c.key} (${c.n})`)
    .join(', ')}`,
);
