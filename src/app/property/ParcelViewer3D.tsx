'use client';

import { useEffect, useRef, useState } from 'react';
import { computeNr, familyFor } from '@/lib/zoning/standards';
import type { DeepDiveDetail } from './DeepDive';

const KC_PARCELS = 'https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_Parcels/MapServer/0/query';

/** Feet of elevation per storey, for massing the existing house. */
const STOREY_FT = 10;

type Ring = [number, number][];

/** Signed area in square metres of a ring already projected to a local frame. */
function ringArea(pts: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * Inset a polygon by a uniform distance in feet.
 *
 * Winding cannot be assumed: ArcGIS returns exterior rings clockwise while
 * GeoJSON expects counter-clockwise, so rather than guess we offset both ways
 * and keep whichever actually shrinks the ring. A simple miter offset, good
 * enough for a screening envelope — it is not a survey.
 */
function insetRing(ring: Ring, feet: number): Ring {
  if (ring.length < 4) return ring;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const lng0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const metres = feet * 0.3048;

  const pts = ring.map(([lng, lat]) => [(lng - lng0) * mPerDegLng, (lat - lat0) * mPerDegLat] as [number, number]);
  const closed =
    pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  const work = closed ? pts.slice(0, -1) : pts;
  const n = work.length;
  if (n < 3) return ring;

  const offset = (dir: 1 | -1): [number, number][] =>
    work.map((_, i) => {
      const prev = work[(i - 1 + n) % n];
      const cur = work[i];
      const next = work[(i + 1) % n];
      const normal = (a: [number, number], b: [number, number]): [number, number] => {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        return [(-dy / len) * dir, (dx / len) * dir];
      };
      const n1 = normal(prev, cur);
      const n2 = normal(cur, next);
      let bx = n1[0] + n2[0];
      let by = n1[1] + n2[1];
      const blen = Math.hypot(bx, by) || 1;
      bx /= blen;
      by /= blen;
      // Miter length keeps parallel edges parallel after the offset.
      const cosHalf = Math.max(0.35, n1[0] * bx + n1[1] * by);
      const d = metres / cosHalf;
      return [cur[0] - bx * d, cur[1] - by * d];
    });

  const target = Math.abs(ringArea(work));
  const candidates = [offset(1), offset(-1)];
  const shrunk = candidates
    .map((c) => ({ c, a: Math.abs(ringArea(c)) }))
    .filter((x) => x.a < target)
    .sort((a, b) => b.a - a.a)[0];

  // If neither direction shrinks, the setback has consumed the lot.
  if (!shrunk) return ring;

  const back = shrunk.c.map(
    ([x, y]) => [x / mPerDegLng + lng0, y / mPerDegLat + lat0] as [number, number],
  );
  back.push(back[0]);
  return back;
}

function centroid(ring: Ring): [number, number] {
  const n = ring.length - 1;
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; }
  return [x / n, y / n];
}

/** A rectangle at the centroid sized to an approximate building footprint. */
function footprintRing(center: [number, number], sqft: number): Ring {
  const side = Math.sqrt(Math.max(400, sqft)) * 0.3048; // metres
  const [lng0, lat0] = center;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const dx = side / 2 / mPerDegLng;
  const dy = side / 2 / mPerDegLat;
  return [
    [lng0 - dx, lat0 - dy], [lng0 + dx, lat0 - dy],
    [lng0 + dx, lat0 + dy], [lng0 - dx, lat0 + dy],
    [lng0 - dx, lat0 - dy],
  ];
}

export function ParcelViewer3D({ detail, ecaLikely }: { detail: DeepDiveDetail; ecaLikely: boolean }) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<import('maplibre-gl').Map | null>(null);
  type GJSource = import('maplibre-gl').GeoJSONSource;
  const [ring, setRing] = useState<Ring | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [units, setUnits] = useState(detail.units || 1);
  const [stacked, setStacked] = useState(false);
  const [explode, setExplode] = useState(0);
  const [showEnvelope, setShowEnvelope] = useState(true);

  const family = familyFor(detail.zone);
  const model = computeNr({
    lotArea: detail.lot, unitType: stacked ? 'stacked' : 'attached',
    greenBonus: false, nearMajorTransit: false, frequentTransit: false,
  });
  const heightLimit = model.heightBonus;
  const setbackSide = 5;

  // --- parcel geometry ---
  useEffect(() => {
    let cancelled = false;
    fetch(`${KC_PARCELS}?where=${encodeURIComponent(`PIN='${detail.pin}'`)}&outFields=PIN&returnGeometry=true&outSR=4326&f=json`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const rings = j?.features?.[0]?.geometry?.rings;
        if (!rings || !rings.length) { setErr('No parcel boundary published for this PIN.'); return; }
        setRing(rings[0] as Ring);
      })
      .catch(() => !cancelled && setErr('Could not reach the county parcel service.'));
    return () => { cancelled = true; };
  }, [detail.pin]);

  // --- map ---
  useEffect(() => {
    if (!el.current || !ring || map.current) return;
    let cancelled = false;
    (async () => {
      const maplibregl = await import('maplibre-gl');
      if (cancelled || !el.current) return;

      const m = new maplibregl.Map({
        container: el.current,
        style: {
          version: 8,
          sources: {
            sat: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              maxzoom: 19,
              attribution: 'Imagery &copy; Esri, Maxar',
            },
            terrain: {
              type: 'raster-dem',
              tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
              tileSize: 256,
              encoding: 'terrarium',
              maxzoom: 15,
              attribution: 'Elevation: Mapzen / AWS Terrain Tiles',
            },
          },
          layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
        },
        center: [detail.lng, detail.lat],
        zoom: 18,
        pitch: 62,
        bearing: -28,
        maxZoom: 20,
        attributionControl: { compact: true },
      });
      map.current = m;
      m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

      m.on('load', () => {
        if (cancelled) return;
        m.setTerrain({ source: 'terrain', exaggeration: 1 });
        m.addSource('parcel', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } } });
        m.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcel', paint: { 'fill-color': '#ffd43b', 'fill-opacity': 0.18 } });
        m.addLayer({ id: 'parcel-line', type: 'line', source: 'parcel', paint: { 'line-color': '#ffd43b', 'line-width': 3 } });

        m.addSource('envelope', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({
          id: 'envelope-3d', type: 'fill-extrusion', source: 'envelope',
          paint: {
            'fill-extrusion-color': '#4dabf7',
            'fill-extrusion-opacity': 0.42,
            'fill-extrusion-height': ['get', 'top'],
            'fill-extrusion-base': ['get', 'base'],
          },
        });

        m.addSource('building', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({
          id: 'building-3d', type: 'fill-extrusion', source: 'building',
          paint: {
            'fill-extrusion-color': '#e8590c',
            'fill-extrusion-opacity': 0.92,
            'fill-extrusion-height': ['get', 'top'],
            'fill-extrusion-base': ['get', 'base'],
          },
        });
        setReady(true);
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ring]);

  // --- redraw the volumes when the model changes ---
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !ring) return;
    const inset = insetRing(ring, setbackSide);
    const lift = explode * 28;

    (m.getSource('envelope') as GJSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: showEnvelope ? [{
        type: 'Feature',
        properties: { base: lift * 0.3048, top: (lift + heightLimit) * 0.3048 },
        geometry: { type: 'Polygon', coordinates: [inset] },
      }] : [],
    } as GeoJSON.FeatureCollection);

    const storeys = detail.sqft && detail.units ? Math.max(1, Math.round((detail.sqft / Math.max(1, detail.units)) / 900)) : 2;
    const fp = footprintRing(centroid(ring), (detail.sqft || 1200) / Math.max(1, storeys));
    (m.getSource('building') as GJSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { base: 0, top: storeys * STOREY_FT * 0.3048 },
        geometry: { type: 'Polygon', coordinates: [fp] },
      }],
    } as GeoJSON.FeatureCollection);
  }, [ready, ring, explode, heightLimit, showEnvelope, detail.sqft, detail.units]);

  return (
    <div className="dd-pane">
      <h4 className="dd-head">The lot in three dimensions</h4>
      <p className="dd-sub">
        Your parcel on real terrain, with the legal building envelope drawn as a volume: the lot inset by the side
        setback and raised to the height limit. The solid block is roughly what stands there now. The empty space
        between them is the capacity the zoning allows and the property is not using.
      </p>

      {err ? <p className="muted">{err}</p> : null}
      {!ring && !err ? <p className="muted">Fetching the parcel boundary…</p> : null}

      <div ref={el} className="mv3d" />

      <div className="fee-grid no-print" style={{ marginTop: 10 }}>
        <label>
          <span>Homes modelled</span>
          <input type="number" min={1} max={20} value={units} onChange={(e) => setUnits(Number(e.target.value))} />
        </label>
        <label className="chk">
          <input type="checkbox" checked={stacked} onChange={(e) => setStacked(e.target.checked)} />
          <span>Stacked flats</span>
        </label>
        <label className="chk">
          <input type="checkbox" checked={showEnvelope} onChange={(e) => setShowEnvelope(e.target.checked)} />
          <span>Show envelope</span>
        </label>
        <label>
          <span>Separate the layers</span>
          <input type="range" min={0} max={3} step={0.1} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
        </label>
      </div>

      <div className="std-grid" style={{ marginTop: 6 }}>
        <div className="std"><div className="std-v">{model.units}</div><div className="std-l">Homes the code allows</div><div className="std-c">{detail.units} today</div></div>
        <div className="std"><div className="std-v">{heightLimit} ft</div><div className="std-l">Height limit</div><div className="std-c">32 ft base, 42 with a bonus</div></div>
        <div className="std"><div className="std-v">{Math.round(model.floorArea).toLocaleString('en-US')} sf</div><div className="std-l">Floor area allowed</div><div className="std-c">{detail.sqft.toLocaleString('en-US')} sf built</div></div>
        <div className="std"><div className="std-v">{setbackSide} ft</div><div className="std-l">Side setback used</div><div className="std-c">front {model.setbacks.front} · rear {model.setbacks.rear}</div></div>
      </div>

      <p className="fee-note">
        {family === 'NR'
          ? 'The envelope is inset by the side setback, which is the widest the building could go laterally. Front and rear setbacks are deeper, so the real envelope is shorter front-to-back than the volume shown.'
          : 'Envelope modelling is tuned for Neighborhood Residential lots; treat it as indicative in this zone.'}
        {ecaLikely ? ' This parcel has critical areas mapped, and those rules override the zoning envelope.' : ''}
        {' '}A screening model, not a design. Terrain from the Mapzen/AWS elevation tiles; parcel boundary from King County GIS.
      </p>
    </div>
  );
}
