// Builds the Seattle ZIP geography used for the area comparison tables:
//   public/geo/seattle-zips.geojson   ZIP polygons with population + a plain label
//   src/lib/generated/zip-meta.json   { zips: {zip: {pop, label}}, totalPop, acsRelease }
//
// Polygons: Census cartographic boundary ZCTAs, 2020 vintage (cb_2020_us_zcta520_500k),
// converted with mapshaper. Population: ACS 5-year via the Census Reporter API
// (api.census.gov is not reachable from this build environment; Census Reporter
// mirrors the same ACS tables). Nothing here is hand-typed except the ZIP list
// and the neighborhood labels.
//
// Run once (or when ACS updates): node scripts/build-geo.mjs
// Not part of the weekly data refresh; geography and ACS change yearly at most.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TMP = path.join(ROOT, '.geo-tmp');
const TIGER_URL = 'https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip';

// Core Seattle ZIP codes with a plain area name. The downtown office ZIPs
// (98154, 98164, 98174) have almost no residents; they keep polygons for maps
// but the comparison tables show n/a instead of a fake-high per-person rate.
const LABELS = {
  '98101': 'Downtown', '98102': 'Capitol Hill and Eastlake', '98103': 'Wallingford, Fremont, Green Lake',
  '98104': 'Pioneer Square and Chinatown', '98105': 'University District', '98106': 'Delridge and Highland Park',
  '98107': 'Ballard', '98108': 'Beacon Hill and Georgetown', '98109': 'South Lake Union and Queen Anne',
  '98112': 'Montlake and Madison Park', '98115': 'Ravenna, Bryant, Wedgwood', '98116': 'West Seattle and Alki',
  '98117': 'Ballard and Crown Hill', '98118': 'Columbia City and Rainier Valley', '98119': 'Queen Anne',
  '98121': 'Belltown', '98122': 'Capitol Hill and Central District', '98125': 'Lake City and Northgate',
  '98126': 'West Seattle and Highland Park', '98133': 'Bitter Lake and Broadview', '98134': 'SODO',
  '98136': 'West Seattle and Fauntleroy', '98144': 'Mount Baker and Judkins Park', '98146': 'White Center and Arbor Heights',
  '98154': 'Downtown core', '98164': 'Downtown core', '98174': 'Downtown core',
  '98177': 'Broadview and Blue Ridge', '98178': 'Rainier Beach and Skyway', '98195': 'University of Washington',
  '98199': 'Magnolia',
};
const ZIPS = Object.keys(LABELS);

async function fetchPopulations() {
  const geoIds = ZIPS.map((z) => `86000US${z}`).join(',');
  const url = `https://api.censusreporter.org/1.0/data/show/latest?table_ids=B01003&geo_ids=${geoIds}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`censusreporter ${r.status}`);
  const j = await r.json();
  const pop = {};
  for (const z of ZIPS) {
    const est = j.data?.[`86000US${z}`]?.B01003?.estimate?.B01003001;
    if (typeof est !== 'number') throw new Error(`no population for ${z}`);
    pop[z] = Math.round(est);
  }
  return { pop, release: j.release?.name || 'ACS 5-year' };
}

async function fetchPolygons() {
  fs.mkdirSync(TMP, { recursive: true });
  const zipPath = path.join(TMP, 'zcta.zip');
  if (!fs.existsSync(zipPath)) {
    console.log('downloading TIGER 2020 ZCTA boundaries (~70MB)...');
    const r = await fetch(TIGER_URL);
    if (!r.ok) throw new Error(`tiger ${r.status}`);
    fs.writeFileSync(zipPath, Buffer.from(await r.arrayBuffer()));
  }
  execSync(`cd "${TMP}" && unzip -o -q zcta.zip`, { stdio: 'inherit' });
  const filter = `[${ZIPS.map((z) => `'${z}'`).join(',')}].indexOf(ZCTA5CE20) > -1`;
  execSync(
    `npx -y mapshaper "${path.join(TMP, 'cb_2020_us_zcta520_500k.shp')}" -filter "${filter}" -o "${path.join(TMP, 'seattle.geojson')}" format=geojson precision=0.00001`,
    { stdio: 'inherit' },
  );
  return JSON.parse(fs.readFileSync(path.join(TMP, 'seattle.geojson'), 'utf8'));
}

async function main() {
  const [{ pop, release }, shapes] = await Promise.all([fetchPopulations(), fetchPolygons()]);

  const features = [];
  const zipMeta = {};
  let totalPop = 0;
  for (const f of shapes.features) {
    const zip = f.properties.ZCTA5CE20;
    if (!LABELS[zip]) continue;
    const population = pop[zip];
    totalPop += population;
    zipMeta[zip] = { pop: population, label: LABELS[zip] };
    features.push({ type: 'Feature', properties: { zip, pop: population, label: LABELS[zip] }, geometry: f.geometry });
  }
  const missing = ZIPS.filter((z) => !zipMeta[z]);
  if (missing.length) throw new Error(`no polygon for: ${missing.join(', ')}`);

  fs.mkdirSync(path.join(ROOT, 'public', 'geo'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'public', 'geo', 'seattle-zips.geojson'),
    JSON.stringify({ type: 'FeatureCollection', features }),
  );
  fs.mkdirSync(path.join(ROOT, 'src', 'lib', 'generated'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'src', 'lib', 'generated', 'zip-meta.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), acsRelease: release, totalPop, zips: zipMeta }, null, 1),
  );

  console.log(`wrote ${features.length} ZIP polygons (2020 ZCTAs), population ${totalPop.toLocaleString('en-US')} (${release})`);
  console.log('n/a-rate ZIPs (pop < 1000):', Object.entries(zipMeta).filter(([, m]) => m.pop < 1000).map(([z]) => z).join(', ') || 'none');
}

main();
