// Builds src/lib/generated/rentals.json from Rental Registration (j2xh-c7vt),
// the city's registered-rental list. Run: node scripts/fetch-rentals.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, count, rows, num, inSeattle } from './lib/socrata.mjs';

const ID = 'j2xh-c7vt';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'rentals.json');

// Total registered units across all properties.
const totalUnits = num(
  soql(ID, { $select: 'sum(rentalhousingunits) as s' })[0]?.s,
);

// Registered properties on record.
const totalProps = count(ID);

// Median units per property. Socrata has no median(); pull unit counts and compute.
const unitRows = rows(ID, {
  select: 'rentalhousingunits',
  where: 'rentalhousingunits IS NOT NULL',
  limit: 50000,
})
  .map((r) => num(r.rentalhousingunits))
  .filter((n) => n > 0)
  .sort((a, b) => a - b);
const medianUnits = unitRows.length
  ? unitRows.length % 2
    ? unitRows[(unitRows.length - 1) / 2]
    : (unitRows[unitRows.length / 2 - 1] + unitRows[unitRows.length / 2]) / 2
  : 0;

// Registered units by ZIP (top 12), summing units not just counting properties.
const byZip = soql(ID, {
  $select: 'originalzip, sum(rentalhousingunits) as units',
  $group: 'originalzip',
  $order: 'units DESC',
  $limit: '12',
})
  .map((r) => ({ key: (r.originalzip || '').trim(), n: num(r.units) }))
  .filter((r) => r.key);

// Map points: sample recent registered properties with coordinates.
const bucket = (u) => {
  if (u <= 1) return '1 unit';
  if (u <= 4) return '2 to 4';
  if (u <= 20) return '5 to 20';
  return '20 plus';
};
const raw = rows(ID, {
  select: 'latitude,longitude,rentalhousingunits,registereddate,propertyname',
  where: 'latitude IS NOT NULL',
  order: 'registereddate DESC',
  limit: 6000,
});
const points = raw
  .map((r) => {
    const u = num(r.rentalhousingunits);
    return {
      lat: num(r.latitude),
      lng: num(r.longitude),
      t: bucket(u),
      d: `${u} unit${u === 1 ? '' : 's'} · ${(r.registereddate || '').slice(0, 10)}`,
    };
  })
  .filter((p) => inSeattle(p.lat, p.lng));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), totalProps, totalUnits, medianUnits, byZip, points }),
);
console.log(
  `rentals.json: props=${totalProps} units=${totalUnits} median=${medianUnits} zips=${byZip.length} points=${points.length}`,
);
console.log('top zips:', byZip.slice(0, 5).map((z) => `${z.key} (${z.n})`).join(', '));
