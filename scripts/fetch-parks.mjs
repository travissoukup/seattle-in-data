// Builds src/lib/generated/parks.json from two Seattle Parks datasets:
// Park Addresses (v5tj-kqhc) for the map points, and Park Features (xrnu-8eiq)
// for the most common feature types. Run: node scripts/fetch-parks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num, inSeattle } from './lib/socrata.mjs';

const ADDR = 'v5tj-kqhc';
const FEAT = 'xrnu-8eiq';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'parks.json');

// Every park address. location_1 carries latitude/longitude as strings.
const raw = rows(ADDR, { select: 'name,address,x_coord,y_coord', limit: 6000 });
const points = raw
  .map((r) => ({ lat: num(r.y_coord), lng: num(r.x_coord), name: r.name || 'Park', addr: r.address || '' }))
  .filter((p) => inSeattle(p.lat, p.lng));

const totalRows = count(ADDR);

// Most common feature types across all parks.
const features = group(FEAT, 'feature_desc', { limit: 12 })
  .map((r) => ({ key: r.feature_desc, n: r.n }))
  .filter((r) => r.key);

const totalFeatures = count(FEAT);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalRows,
    mapped: points.length,
    totalFeatures,
    features,
    points,
  }),
);
console.log(
  `parks.json: addressRows=${totalRows} mapped=${points.length} totalFeatures=${totalFeatures} featureTypes=${features.length}`,
);
console.log('top features:', features.slice(0, 5).map((f) => `${f.key} (${f.n})`).join(', '));
