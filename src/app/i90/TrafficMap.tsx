'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import data from '@/lib/generated/i90.json';
import type { SimResult } from './engine';

/** Google-Maps-style live traffic view: the real I-90 centerline colored by
 * simulated speed, with a time-of-day scrubber and a play button. The GP lanes
 * are the solid line; the HOV lane is the thin dashed overlay. A dark red tail
 * past the corridor entrance shows the queue waiting to get in. */

const MP0 = 2.0;
const MP1 = 10.1;
const CELL_MI = 0.1;

type Geom = [number, number, number][]; // [mp, lat, lng]

/** Bands are tuned to what the model actually produces: shaped speeds sit in
 * 47-60 for uncongested flow (queued traffic drops well below), so the busy
 * range must span visible colors the way traffic apps key color to delay. */
function speedColor(v: number): string {
  if (v >= 55) return '#1a9850'; // free flow
  if (v >= 51) return '#91cf60'; // getting busy
  if (v >= 48) return '#fee08b'; // heavy, near capacity
  if (v >= 38) return '#fc8d59'; // at capacity / slowing
  if (v >= 22) return '#d73027'; // congested
  return '#7f0000'; // stop and go
}

/** Interpolated point at an exact milepost, from the bracketing geometry points. */
function interpAt(geom: Geom, mp: number): [number, number] | null {
  let lo: Geom[number] | null = null;
  let hi: Geom[number] | null = null;
  for (const g of geom) {
    if (g[0] <= mp) lo = g;
    if (g[0] >= mp) { hi = g; break; }
  }
  if (!lo || !hi) return null;
  if (hi[0] === lo[0]) return [lo[1], lo[2]];
  const f = (mp - lo[0]) / (hi[0] - lo[0]);
  return [lo[1] + (hi[1] - lo[1]) * f, lo[2] + (hi[2] - lo[2]) * f];
}

/** Continuous polyline for a milepost range: interpolated endpoints plus any
 * raw geometry points inside, so every cell draws even between sparse points. */
function pointsForRange(geom: Geom, a: number, b: number): [number, number][] {
  const pts: [number, number][] = [];
  const start = interpAt(geom, a);
  if (start) pts.push(start);
  for (const g of geom) if (g[0] > a && g[0] < b) pts.push([g[1], g[2]]);
  const end = interpAt(geom, b);
  if (end) pts.push(end);
  return pts;
}

export function TrafficMap({ result, dir }: { result: SimResult; dir: 'EB' | 'WB' }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const gpLines = useRef<import('leaflet').Polyline[]>([]);
  const hovLines = useRef<import('leaflet').Polyline[]>([]);
  const queueLine = useRef<import('leaflet').Polyline | null>(null);
  const [bin, setBin] = useState(96); // 8:00 am
  const [playing, setPlaying] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const geom = (data as unknown as { geometry: Geom }).geometry;

  // build the map + one polyline per sim cell, once
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapEl.current) return;
      const map = L.map(mapEl.current, { scrollWheelZoom: false });
      map.fitBounds([[47.55, -122.32], [47.61, -122.14]]);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19,
      }).addTo(map);
      for (let c = 0; c < result.cells; c++) {
        const mpA = MP0 + c * CELL_MI;
        const pts = pointsForRange(geom, mpA, mpA + CELL_MI);
        if (pts.length < 2) { gpLines.current.push(null as unknown as import('leaflet').Polyline); hovLines.current.push(null as unknown as import('leaflet').Polyline); continue; }
        const gp = L.polyline(pts, { color: '#1a9850', weight: 7, opacity: 0.95 }).addTo(map);
        const hv = L.polyline(pts, { color: '#1a9850', weight: 3, opacity: 1, dashArray: '2 10' }).addTo(map);
        gpLines.current.push(gp);
        hovLines.current.push(hv);
      }
      queueLine.current = L.polyline([], { color: '#7a0177', weight: 9, opacity: 0.9 }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 150);
    })().catch((e) => console.error('TrafficMap init failed:', e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recolor on time / result change
  useEffect(() => {
    const n = result.cells;
    for (let c = 0; c < n; c++) {
      // cell index runs in travel direction; map cells are west-to-east by mp
      const cellIdx = dir === 'EB' ? c : n - 1 - c;
      const gp = gpLines.current[c];
      const hv = hovLines.current[c];
      if (!gp) continue;
      gp.setStyle({ color: speedColor(result.speed[bin * n + cellIdx]) });
      if (result.speedHov) {
        hv.setStyle({ color: speedColor(result.speedHov[bin * n + cellIdx]), opacity: 0.95 });
      } else {
        hv.setStyle({ opacity: 0 });
      }
    }
    // entrance queue tail: WB queues extend east of MP 10.1, EB west of MP 2.0
    const q = result.queueMiByBin[bin];
    if (queueLine.current) {
      if (q > 0.02) {
        const pts = dir === 'WB'
          ? pointsForRange(geom, MP1, Math.min(13.9, MP1 + q))
          : pointsForRange(geom, Math.max(1.94, MP0 - q), MP0);
        queueLine.current.setLatLngs(pts.length >= 2 ? pts : []);
      } else {
        queueLine.current.setLatLngs([]);
      }
    }
  }, [bin, result, dir, geom, mapReady]);

  // play through the day
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setBin((b) => (b + 2) % 288), 120);
    return () => clearInterval(id);
  }, [playing]);

  const hh = Math.floor((bin * 5) / 60);
  const mm = (bin * 5) % 60;

  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="lf-row" style={{ padding: '4px 8px 8px', alignItems: 'center' }}>
        <button className="csv-btn" onClick={() => setPlaying(!playing)} style={{ minWidth: 74 }}>
          {playing ? 'Pause' : 'Play day'}
        </button>
        <div className="lf-field grow">
          <label>
            Time of day: <strong>{String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}</strong>
            {result.queueMiByBin[bin] > 0.02 ? ` · entrance queue ${result.queueMiByBin[bin].toFixed(1)} mi` : ''}
          </label>
          <input type="range" min={0} max={287} value={bin} onChange={(e) => setBin(Number(e.target.value))} />
        </div>
      </div>
      <div ref={mapEl} style={{ height: 380, borderRadius: 8 }} />
      <div className="lf-legend">
        <span className="lf-key"><span className="lf-dot" style={{ background: '#1a9850' }} /> free flow</span>
        <span className="lf-key"><span className="lf-dot" style={{ background: '#91cf60' }} /> busy</span>
        <span className="lf-key"><span className="lf-dot" style={{ background: '#fee08b' }} /> heavy</span>
        <span className="lf-key"><span className="lf-dot" style={{ background: '#fc8d59' }} /> slowing</span>
        <span className="lf-key"><span className="lf-dot" style={{ background: '#d73027' }} /> jammed</span>
        <span className="lf-key"><span className="lf-dot" style={{ background: '#7a0177' }} /> queue to enter</span>
        <span className="lf-key muted">solid: GP lanes &middot; dashed: HOV lane &middot; {dir === 'WB' ? 'westbound' : 'eastbound'} shown</span>
      </div>
    </div>
  );
}
