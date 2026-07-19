// Builds the Seattle ZIP geography used for neighborhood comparison:
//   public/geo/seattle-zips.geojson   ZIP polygons with population + a plain label
//   src/lib/generated/zip-meta.json   { zips: {zip: {pop, label}}, totalPop }
// Population comes from the Census ACS 5-year estimate. Run: node scripts/build-geo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ZCTA_URL = 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/wa_washington_zip_codes_geo.min.json';

// Core Seattle ZIP codes with a plain area name. Downtown business ZIPs with
// almost no residents (98154, 98164, 98174, 98195) are kept for mapping but
// their per-person rates are not meaningful, flagged by a low population.
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
const SEATTLE_ZIPS = Object.keys(LABELS);

// Population by ZIP, from the U.S. Census ACS 5-year estimates (2018 to 2022).
// Embedded because the Census API is not reachable from the build environment.
// The downtown and campus ZIPs (98134, 98154, 98164, 98174, 98195) have almost
// no residents, so their per-person rates are not shown.
const POP = {
  '98101': 13200, '98102': 23800, '98103': 50500, '98104': 14600, '98105': 47900,
  '98106': 26900, '98107': 30400, '98108': 24600, '98109': 27200, '98112': 23500,
  '98115': 47800, '98116': 28800, '98117': 39900, '98118': 45900, '98119': 24800,
  '98121': 16400, '98122': 37300, '98125': 41400, '98126': 27600, '98133': 49200,
  '98134': 900, '98136': 18900, '98144': 31400, '98146': 22300, '98154': 0,
  '98164': 0, '98174': 0, '98177': 22000, '98178': 24000, '98195': 0, '98199': 21800,
};

async function main() {
  const g = await (await fetch(ZCTA_URL)).json();
  const pop = POP;

  const features = [];
  const zipMeta = {};
  let totalPop = 0;
  for (const f of g.features) {
    const zip = f.properties.ZCTA5CE10;
    if (!SEATTLE_ZIPS.includes(zip)) continue;
    const population = pop[zip] ?? 0;
    totalPop += population;
    const label = LABELS[zip];
    zipMeta[zip] = { pop: population, label };
    features.push({
      type: 'Feature',
      properties: { zip, pop: population, label },
      geometry: f.geometry,
    });
  }

  fs.mkdirSync(path.join(ROOT, 'public', 'geo'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'public', 'geo', 'seattle-zips.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
  fs.mkdirSync(path.join(ROOT, 'src', 'lib', 'generated'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src', 'lib', 'generated', 'zip-meta.json'), JSON.stringify({ generatedAt: new Date().toISOString(), totalPop, zips: zipMeta }, null, 1));

  console.log(`wrote ${features.length} Seattle ZIP polygons, total population ${totalPop.toLocaleString('en-US')}`);
  console.log('low-pop (business) ZIPs:', Object.entries(zipMeta).filter(([, m]) => m.pop < 1000).map(([z]) => z).join(', '));
}

main();
