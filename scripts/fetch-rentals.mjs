// Builds src/lib/generated/rentals.json from Rental Registration (j2xh-c7vt),
// the city's registered-rental list. Run: node scripts/fetch-rentals.mjs
//
// Note on the dataset: registrations expire after two years and expired rows
// drop out, so this is a rolling roster of active registrations, not a history.
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

// The registry's rolling window: earliest and latest registration dates on the
// active list. Computed, never hardcoded, since the window slides every day.
const span = soql(ID, {
  $select: 'min(registereddate) as lo, max(registereddate) as hi',
})[0] ?? {};
const minRegYear = num((span.lo || '').slice(0, 4));
const maxRegYear = num((span.hi || '').slice(0, 4));

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

// Size buckets: properties vs units, the concentration story. "20 or more"
// is the big-building cutoff; shares are of the whole registry.
const BUCKET_CASE =
  'case(rentalhousingunits <= 1, "1 unit", rentalhousingunits <= 4, "2 to 4", rentalhousingunits <= 19, "5 to 19", rentalhousingunits >= 20, "20 or more")';
const BUCKET_ORDER = ['1 unit', '2 to 4', '5 to 19', '20 or more'];
const bucketRaw = soql(ID, {
  $select: `${BUCKET_CASE} as b, count(*) as props, sum(rentalhousingunits) as units`,
  $group: 'b',
});
const sizeBuckets = BUCKET_ORDER.map((label) => {
  const r = bucketRaw.find((x) => x.b === label) ?? {};
  const props = num(r.props);
  const units = num(r.units);
  return {
    label,
    props,
    units,
    propShare: totalProps ? (100 * props) / totalProps : 0,
    unitShare: totalUnits ? (100 * units) / totalUnits : 0,
  };
});
const single = sizeBuckets[0];
const big = sizeBuckets[sizeBuckets.length - 1];

// Biggest managers by summed units, from propertycontactname. The field often
// duplicates itself ("Greystar , Greystar"), so collapse repeated halves, then
// drop blanks and generic placeholder names before re-merging.
const PLACEHOLDER = /^(property manager|community manager|manager|owner|landlord|n\/?a|none)$/i;
const cleanName = (s) => {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  const parts = t.split(' , ').map((p) => p.trim());
  if (parts.length > 1 && parts.every((p) => p === parts[0])) return parts[0];
  return t;
};
const contactRaw = soql(ID, {
  $select: 'propertycontactname as c, count(*) as props, sum(rentalhousingunits) as units',
  $group: 'c',
  $order: 'units DESC',
  $limit: '80',
});
const merged = new Map();
for (const r of contactRaw) {
  const name = cleanName(r.c);
  if (!name || PLACEHOLDER.test(name)) continue;
  const cur = merged.get(name) ?? { name, props: 0, units: 0 };
  cur.props += num(r.props);
  cur.units += num(r.units);
  merged.set(name, cur);
}
const topManagers = [...merged.values()].sort((a, b) => b.units - a.units).slice(0, 12);
// How many rows have no contact at all, for the footnote.
const blankContacts = count(ID, 'propertycontactname IS NULL');

// Registered units by ZIP (top 12), summing units not just counting properties.
const byZip = soql(ID, {
  $select: 'originalzip, sum(rentalhousingunits) as units',
  $group: 'originalzip',
  $order: 'units DESC',
  $limit: '12',
})
  .map((r) => ({ key: (r.originalzip || '').trim(), n: num(r.units) }))
  .filter((r) => r.key);

// Map points: sample the most recent registered properties with coordinates.
const bucket = (u) => {
  if (u <= 1) return '1 unit';
  if (u <= 4) return '2 to 4';
  if (u <= 19) return '5 to 19';
  return '20 or more';
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
// The sample's own date window, so the map can say when its dots were filed.
const pointDates = raw.map((r) => (r.registereddate || '').slice(0, 10)).filter(Boolean).sort();
const mapMinDate = pointDates[0] ?? '';
const mapMinYear = num(mapMinDate.slice(0, 4));
const mapMaxYear = num((pointDates[pointDates.length - 1] ?? '').slice(0, 4));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalProps,
    totalUnits,
    medianUnits,
    minRegYear,
    maxRegYear,
    sizeBuckets,
    single,
    big,
    topManagers,
    blankContacts,
    byZip,
    points,
    mapMinDate,
    mapMinYear,
    mapMaxYear,
  }),
);
console.log(
  `rentals.json: props=${totalProps} units=${totalUnits} median=${medianUnits} window=${minRegYear}-${maxRegYear} zips=${byZip.length} points=${points.length} map=${mapMinYear}-${mapMaxYear}`,
);
console.log(
  `concentration: single ${single.props} props (${single.propShare.toFixed(1)}%) hold ${single.unitShare.toFixed(1)}% of units; big ${big.props} props (${big.propShare.toFixed(1)}%) hold ${big.units} units (${big.unitShare.toFixed(1)}%)`,
);
console.log('top managers:', topManagers.slice(0, 5).map((m) => `${m.name} (${m.units}u/${m.props}p)`).join(', '));
console.log('top zips:', byZip.slice(0, 5).map((z) => `${z.key} (${z.n})`).join(', '));
