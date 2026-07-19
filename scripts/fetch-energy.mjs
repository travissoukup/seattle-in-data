// Builds src/lib/generated/energy.json from Building Energy Benchmarking (teqw-tu6e).
// Larger Seattle buildings report their yearly energy use to the city.
// Run: node scripts/fetch-energy.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, rows, num, inSeattle } from './lib/socrata.mjs';

const ID = 'teqw-tu6e';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'energy.json');

// One reported gas value (a nursing home logging 2.4 billion kBtu, hundreds of
// times a plausible figure) wrecks the fuel totals. Rows at or above this
// threshold are treated as data-entry errors and listed in gasOutliers.
const GAS_ERROR_KBTU = 1_000_000_000;

// Find the latest reporting year in the data. datayear is a compliance year,
// so every year present is a complete reporting period; no partial trimming needed.
const years = group(ID, 'datayear', { order: 'datayear DESC', limit: 1 });
const year = num(years[0]?.datayear);
const inYear = `datayear='${year}'`;

// Buildings reporting in the latest year, Energy Star coverage, and the raw GHG sum.
const totRow = soql(ID, {
  $select: 'count(*) as total, count(energystarscore) as withscore, sum(totalghgemissions) as ghg',
  $where: inYear,
})[0];
const total = num(totRow.total);
const withScore = num(totRow.withscore);
const scorePct = total ? (withScore / total) * 100 : 0;
const ghg = num(totRow.ghg);

// The largest single GHG record in the latest year, to show how much of the
// citywide sum one self-reported row can carry.
const topGhgRow = soql(ID, {
  $select: 'buildingname, totalghgemissions, steamuse_kbtu',
  $where: `${inYear} AND totalghgemissions IS NOT NULL`,
  $order: 'totalghgemissions DESC',
  $limit: '1',
})[0];
const topGhg = {
  name: topGhgRow?.buildingname ?? '',
  ghg: num(topGhgRow?.totalghgemissions),
  steamKbtu: num(topGhgRow?.steamuse_kbtu),
  sharePct: ghg ? (num(topGhgRow?.totalghgemissions) / ghg) * 100 : 0,
};

// Ten-year trend: buildings reporting, median site EUI, median GHG intensity,
// and the raw reported GHG sum per year.
const yearly = soql(ID, {
  $select:
    'datayear, count(*) as n, median(siteeui_kbtu_sf) as medeui, median(ghgemissionsintensity) as medghgi, sum(totalghgemissions) as ghg',
  $group: 'datayear',
  $order: 'datayear',
  $limit: '50',
}).map((r) => ({
  year: num(r.datayear),
  n: num(r.n),
  medEui: Math.round(num(r.medeui) * 10) / 10,
  medGhgI: Math.round(num(r.medghgi) * 100) / 100,
  ghgKtons: Math.round(num(r.ghg) / 1000),
}));

const firstY = yearly[0];
const lastY = yearly[yearly.length - 1];
const euiChangePct = firstY.medEui ? ((lastY.medEui - firstY.medEui) / firstY.medEui) * 100 : 0;
const reportersChangePct = firstY.n ? ((lastY.n - firstY.n) / firstY.n) * 100 : 0;
const ghgIMin = Math.min(...yearly.map((r) => r.medGhgI));
const ghgIMax = Math.max(...yearly.map((r) => r.medGhgI));

// Fuel trend: electricity vs natural gas, in billions of kBtu. Rows with an
// error-level gas figure are excluded entirely (their electricity is negligible).
const fuelWhere = `naturalgas_kbtu IS NULL OR naturalgas_kbtu < ${GAS_ERROR_KBTU}`;
const fuel = soql(ID, {
  $select: 'datayear, sum(electricity_kbtu) as elec, sum(naturalgas_kbtu) as gas',
  $where: fuelWhere,
  $group: 'datayear',
  $order: 'datayear',
  $limit: '50',
}).map((r) => ({
  year: num(r.datayear),
  elecB: Math.round((num(r.elec) / 1e9) * 100) / 100,
  gasB: Math.round((num(r.gas) / 1e9) * 100) / 100,
}));
const firstF = fuel[0];
const lastF = fuel[fuel.length - 1];
const gasChangePct = firstF.gasB ? ((lastF.gasB - firstF.gasB) / firstF.gasB) * 100 : 0;
const elecChangePct = firstF.elecB ? ((lastF.elecB - firstF.elecB) / firstF.elecB) * 100 : 0;

// The excluded gas rows, listed by name so the page can show its work.
const gasOutliers = soql(ID, {
  $select: 'datayear, buildingname, naturalgas_kbtu',
  $where: `naturalgas_kbtu >= ${GAS_ERROR_KBTU}`,
  $order: 'naturalgas_kbtu DESC',
  $limit: '10',
}).map((r) => ({ year: num(r.datayear), name: r.buildingname, gasB: Math.round((num(r.naturalgas_kbtu) / 1e9) * 100) / 100 }));

// Extreme steam records across all years (billions of kBtu on a single row).
// These are what make the yearly GHG sums swing; the page names them.
const steamOutliers = soql(ID, {
  $select: 'datayear, buildingname, steamuse_kbtu, totalghgemissions',
  $where: 'steamuse_kbtu > 2000000000',
  $order: 'steamuse_kbtu DESC',
  $limit: '10',
}).map((r) => ({
  year: num(r.datayear),
  name: r.buildingname,
  steamB: Math.round((num(r.steamuse_kbtu) / 1e9) * 100) / 100,
  ghg: num(r.totalghgemissions),
}));

// Median site EUI by EPA property type (the labels readers recognize), latest year.
const euiByEpaAll = soql(ID, {
  $select: 'epapropertytype, median(siteeui_kbtu_sf) as med, count(*) as n',
  $where: `${inYear} AND siteeui_kbtu_sf IS NOT NULL AND siteeui_kbtu_sf > 0`,
  $group: 'epapropertytype',
  $order: 'med DESC',
  $limit: '100',
})
  .map((r) => ({ key: r.epapropertytype, eui: Math.round(num(r.med) * 10) / 10, n: num(r.n) }))
  .filter((r) => r.key && r.key !== 'NA' && r.n >= 10);
const euiByEpa = euiByEpaAll.slice(0, 12);
const lowRise = euiByEpaAll.find((r) => r.key.startsWith('Multifamily LR')) ?? euiByEpaAll[euiByEpaAll.length - 1];
const topEpa = euiByEpaAll[0];

// Compliance: who did not file properly in the latest year, and why.
const compliance = group(ID, 'compliancestatus', { where: inYear, limit: 10 });
const notCompliant = num(compliance.find((r) => r.compliancestatus === 'Not Compliant')?.n);
const notCompliantPct = total ? (notCompliant / total) * 100 : 0;
const complianceIssues = group(ID, 'complianceissue', {
  where: `${inYear} AND compliancestatus='Not Compliant'`,
  limit: 10,
})
  .map((r) => ({ key: r.complianceissue, n: r.n }))
  .filter((r) => r.key);

// Count of buildings by coarse type, for the map legend ordering (top 5 get color).
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
    firstYear: firstY.year,
    total,
    withScore,
    scorePct,
    ghg,
    topGhg,
    yearly,
    euiFirst: firstY.medEui,
    euiLast: lastY.medEui,
    euiChangePct,
    reportersFirst: firstY.n,
    reportersChangePct,
    ghgIMin,
    ghgIMax,
    fuel,
    gasFirstB: firstF.gasB,
    gasLastB: lastF.gasB,
    gasChangePct,
    elecChangePct,
    gasOutliers,
    gasErrorKbtu: GAS_ERROR_KBTU,
    steamOutliers,
    euiByEpa,
    topEpa,
    lowRise,
    notCompliant,
    notCompliantPct,
    complianceIssues,
    byType,
    points,
  }),
);
console.log(
  `energy.json: year=${year} total=${total} withScore=${withScore} (${scorePct.toFixed(0)}%) ghg=${Math.round(ghg)}`,
);
console.log(
  `trend: ${firstY.year}-${lastY.year}, medEui ${firstY.medEui} -> ${lastY.medEui} (${euiChangePct.toFixed(1)}%), reporters ${firstY.n} -> ${lastY.n} (+${reportersChangePct.toFixed(1)}%)`,
);
console.log(
  `fuel: gas ${firstF.gasB}B -> ${lastF.gasB}B (+${gasChangePct.toFixed(1)}%), elec ${firstF.elecB}B -> ${lastF.elecB}B (+${elecChangePct.toFixed(1)}%), gasOutliers=${gasOutliers.length}`,
);
console.log(
  `topGhg: ${topGhg.name} ${Math.round(topGhg.ghg)} tons (${topGhg.sharePct.toFixed(1)}% of sum); notCompliant=${notCompliant} (${notCompliantPct.toFixed(1)}%), issues=${complianceIssues.length}`,
);
console.log(`steamOutliers: ${steamOutliers.map((o) => `${o.name} ${o.year} ${o.steamB}B`).join(' | ')}`);
console.log(`epa types (n>=10): ${euiByEpaAll.length}, top=${topEpa.key} ${topEpa.eui}, lowRise=${lowRise.key} ${lowRise.eui}`);
console.log('top by count:', byType.slice(0, 5).map((t) => `${t.key} (${t.n})`).join(', '));
