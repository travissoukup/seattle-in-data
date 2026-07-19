'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  lat: number;
  lng: number;
  color?: string;
  label?: string;
}

export interface PointMapProps {
  points: MapPoint[];
  height?: number;
  legend?: { label: string; color: string }[];
  defaultColor?: string;
  radius?: number;
}

// A simple Leaflet point map. Leaflet is imported inside the effect so this stays
// safe under server rendering. Uses a canvas renderer so a few thousand dots stay
// smooth. Pass already-sampled points; do not hand it the whole dataset.
export function PointMap({ points, height = 460, legend, defaultColor = '#0072b2', radius = 4 }: PointMapProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let map: import('leaflet').Map | undefined;
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !ref.current) return;

      map = L.map(ref.current, { scrollWheelZoom: false, preferCanvas: true }).setView([47.62, -122.33], 11);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);
      let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
      let drawn = 0;
      for (const p of points) {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.lat === 0 || p.lng === 0) continue;
        drawn++;
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
        const c = p.color || defaultColor;
        const m = L.circleMarker([p.lat, p.lng], {
          radius,
          color: c,
          weight: 0.6,
          fillColor: c,
          fillOpacity: 0.55,
        });
        if (p.label) m.bindPopup(p.label);
        m.addTo(layer);
      }
      if (drawn > 0 && Number.isFinite(minLat)) {
        map.fitBounds(
          [
            [minLat, minLng],
            [maxLat, maxLng],
          ],
          { padding: [20, 20] },
        );
      }
      setTimeout(() => map && map.invalidateSize(), 200);
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [points, defaultColor, radius]);

  return (
    <div>
      <div
        ref={ref}
        style={{ height, width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}
      />
      {legend && legend.length ? (
        <div className="map-legend">
          {legend.map((l) => (
            <span key={l.label} className="map-legend-item">
              <span className="map-dot" style={{ background: l.color }} /> {l.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
