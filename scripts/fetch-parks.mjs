// Builds src/lib/generated/parks.json from two Seattle Parks datasets:
// Park Addresses (v5tj-kqhc) for the map points, and Park Features (xrnu-8eiq)
// for feature types, the best-stocked-park ranking, and scarce features.
// Run: node scripts/fetch-parks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, rows, num, inSeattle } from './lib/socrata.mjs';

const ADDR = 'v5tj-kqhc';
const FEAT = 'xrnu-8eiq';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'parks.json');

// Every park address. One row per park; pmaid keys the join to the feature list.
const raw = rows(ADDR, { select: 'pmaid,name,address,x_coord,y_coord', limit: 6000 });
const nameByPmaid = new Map(raw.map((r) => [r.pmaid, r.name]));

// Every park-feature pair (about a thousand rows), so we can aggregate both ways.
const featRows = rows(FEAT, { select: 'pmaid,feature_desc', limit: 6000 }).filter((r) => r.feature_desc && r.pmaid);

// Features per park, for the filterable map and the best-stocked ranking.
const featuresByPark = new Map();
for (const r of featRows) {
  if (!featuresByPark.has(r.pmaid)) featuresByPark.set(r.pmaid, []);
  featuresByPark.get(r.pmaid).push(r.feature_desc);
}

const points = raw
  .map((r) => ({
    lat: num(r.y_coord),
    lng: num(r.x_coord),
    name: r.name || 'Park',
    addr: r.address || '',
    features: (featuresByPark.get(r.pmaid) || []).sort(),
  }))
  .filter((p) => inSeattle(p.lat, p.lng));

const totalRows = count(ADDR);
const totalFeatures = count(FEAT);

// All feature types, counted. No cap: the rare ones are the story.
const featCounts = new Map();
for (const r of featRows) featCounts.set(r.feature_desc, (featCounts.get(r.feature_desc) || 0) + 1);
const features = [...featCounts.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));

// Best-stocked parks: feature count per pmaid, joined to the address list for names.
const perPark = new Map();
for (const r of featRows) perPark.set(r.pmaid, (perPark.get(r.pmaid) || 0) + 1);
const topParks = [...perPark.entries()]
  .map(([pmaid, n]) => ({ name: nameByPmaid.get(pmaid), n }))
  .filter((p) => p.name)
  .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  .slice(0, 12);

// Coverage: how many of the address-list parks appear in the feature list at all.
const coveredParks = new Set(featRows.map((r) => r.pmaid)).size;

// Named scarcity numbers for prose.
const byKey = (k) => features.find((f) => f.key === k)?.n ?? 0;
const scarcity = {
  firePits: byKey('Fire Pits'),
  volleyball: byKey('Volleyball Courts'),
  swimBeaches: byKey('Swimming Beaches'),
  sprayParks: byKey('Spray Parks'),
  skateParks: byKey('Skate Park'),
  offLeash: byKey('Dog Off Leash Areas'),
};
for (const [k, v] of Object.entries(scarcity)) {
  if (!v) throw new Error(`scarcity field ${k} came back 0; feature_desc labels may have changed`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalRows,
    mapped: points.length,
    totalFeatures,
    featureTypes: features.length,
    coveredParks,
    unlistedParks: totalRows - coveredParks,
    features,
    topParks,
    scarcity,
    points,
  }),
);
console.log(
  `parks.json: addressRows=${totalRows} mapped=${points.length} totalFeatures=${totalFeatures} featureTypes=${features.length} coveredParks=${coveredParks}`,
);
console.log('top parks:', topParks.slice(0, 5).map((p) => `${p.name} (${p.n})`).join(', '));
console.log('scarcity:', JSON.stringify(scarcity));
console.log('top features:', features.slice(0, 3).map((f) => `${f.key} (${f.n})`).join(', '));
