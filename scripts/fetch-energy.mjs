// Builds src/lib/generated/energy.json from Building Energy Benchmarking (teqw-tu6e).
// Larger Seattle buildings report their yearly energy use to the city.
// Run: node scripts/fetch-energy.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';

const ID = 'teqw-tu6e';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'energy.json');

// Find the latest reporting year in the data.
const years = group(ID, 'datayear', { order: 'datayear DESC', limit: 1 });
const year = years[0]?.datayear;
const inYear = `datayear='${year}'`;

// Buildings reporting in the latest year, and how many have an Energy Star score.
const scoreRow = soql(ID, {
  $select: 'count(*) as total, count(energystarscore) as withscore',
  $where: inYear,
})[0];
const total = num(scoreRow.total);
const withScore = num(scoreRow.withscore);
const scorePct = total ? (withScore / total) * 100 : 0;

// Total greenhouse gas emissions reported, in metric tons.
const ghg = num(soql(ID, { $select: 'sum(totalghgemissions) as ghg', $where: inYear })[0]?.ghg);

// Median site energy use intensity (kBtu per square foot) by building type.
const euiByType = soql(ID, {
  $select: 'buildingtype, median(siteeui_kbtu_sf) as med, count(*) as n',
  $where: `${inYear} AND siteeui_kbtu_sf IS NOT NULL AND siteeui_kbtu_sf > 0`,
  $group: 'buildingtype',
  $order: 'med DESC',
  $limit: '15',
})
  .map((r) => ({ key: r.buildingtype, eui: num(r.med), n: num(r.n) }))
  .filter((r) => r.key && r.n >= 5);

// Count of buildings by type, for the map legend ordering (top 5 get color).
const byType = group(ID, 'buildingtype', { where: inYear, limit: 12 })
  .map((r) => ({ key: r.buildingtype, n: r.n }))
  .filter((r) => r.key);

// Map points: latest-year buildings with coordinates.
const raw = rows(ID, {
  select: 'latitude,longitude,buildingtype,buildingname,siteeui_kbtu_sf',
  where: `${inYear} AND latitude IS NOT NULL`,
  order: 'siteenergyuse_kbtu DESC',
  limit: 5000,
});
const points = raw
  .map((r) => ({
    lat: num(r.latitude),
    lng: num(r.longitude),
    t: r.buildingtype || 'Other',
    name: r.buildingname || 'Building',
    eui: num(r.siteeui_kbtu_sf),
  }))
  .filter((p) => inSeattle(p.lat, p.lng));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    year,
    total,
    withScore,
    scorePct,
    ghg,
    euiByType,
    byType,
    points,
  }),
);
console.log(
  `energy.json: year=${year} total=${total} withScore=${withScore} (${scorePct.toFixed(0)}%) ghg=${Math.round(ghg)} types=${byType.length} euiRows=${euiByType.length} points=${points.length}`,
);
console.log('top by count:', byType.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
