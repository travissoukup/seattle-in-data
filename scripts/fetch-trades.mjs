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

// Issued per year, two series. Trade and Electrical keyed by year.
// issueddate is stored as text (YYYY-MM-DD), so use substring + string compares.
const yearSql = (id) =>
  soql(id, {
    $select: 'substring(issueddate,1,4) as y, count(*) as n',
    $group: 'y',
    $order: 'y',
    $where: "issueddate >= '2005-01-01'",
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

// Totals.
const totalTrade = count(TRADE);
const totalElec = count(ELEC);
const lastYear = String(Number(thisYear) - 1);
const issuedLastYear =
  count(TRADE, `issueddate >= '${lastYear}-01-01' AND issueddate < '${thisYear}-01-01'`) +
  count(ELEC, `issueddate >= '${lastYear}-01-01' AND issueddate < '${thisYear}-01-01'`);

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
    tradeTypes,
    yearly,
    points,
  }),
);
console.log(
  `trades.json: trade=${totalTrade} elec=${totalElec} issuedLastYear(${lastYear})=${issuedLastYear} types=${tradeTypes.length} years=${yearly.length} points=${points.length}`,
);
console.log('top trade types:', tradeTypes.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
