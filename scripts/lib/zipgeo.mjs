// Assigns a point to a Seattle ZIP (point in polygon) and rolls counts up into a
// per-ZIP, per-person comparison. Used by the descriptive fetch scripts so each
// page can answer "how does my area compare." Population is ACS 5-year (see
// scripts/build-geo.mjs). Run build-geo.mjs first to create the inputs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');

const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'geo', 'seattle-zips.geojson'), 'utf8'));
export const ZIP_META = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'generated', 'zip-meta.json'), 'utf8')).zips;

// Precompute a bbox per ZIP polygon for a fast reject before the ray test.
const SHAPES = geo.features.map((f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return { zip: f.properties.zip, polys, bbox: [minX, minY, maxX, maxY] };
});

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInPoly(x, y, poly) {
  if (!pointInRing(x, y, poly[0])) return false; // outer ring
  for (let k = 1; k < poly.length; k++) if (pointInRing(x, y, poly[k])) return false; // holes
  return true;
}

export function zipForPoint(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const x = lng, y = lat;
  for (const s of SHAPES) {
    const [minX, minY, maxX, maxY] = s.bbox;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    for (const poly of s.polys) if (pointInPoly(x, y, poly)) return s.zip;
  }
  return null;
}

// Turn a {zip: count} object into a sorted per-ZIP comparison. Rate is per 1,000
// residents; ZIPs with almost no residents (downtown towers, the UW campus) get
// a null rate so they do not show fake-high numbers.
export function rollup(counts, windowLabel) {
  let total = 0;
  const zips = Object.entries(ZIP_META).map(([zip, m]) => {
    const count = counts[zip] || 0;
    total += count;
    const per1000 = m.pop >= 1000 ? Math.round((count / m.pop) * 1000 * 10) / 10 : null;
    return { zip, label: m.label, pop: m.pop, count, per1000 };
  });
  zips.sort((a, b) => {
    if (a.per1000 == null && b.per1000 == null) return b.count - a.count;
    if (a.per1000 == null) return 1;
    if (b.per1000 == null) return -1;
    return b.per1000 - a.per1000;
  });
  const rated = zips.filter((z) => z.per1000 != null);
  const cityRate = rated.length
    ? Math.round((rated.reduce((s, z) => s + z.count, 0) / rated.reduce((s, z) => s + z.pop, 0)) * 1000 * 10) / 10
    : null;
  return { windowLabel, total, cityRate, zips };
}
