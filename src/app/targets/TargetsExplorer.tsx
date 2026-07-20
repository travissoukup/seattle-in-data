'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

interface Target {
  pin: string;
  addr: string;
  zip: string;
  lat: number;
  lng: number;
  mode: 'own' | 'build';
  units: number;
  cap: number | null;
  zone: string;
  lot: number;
  yr: number | null;
  grade: number | null;
  cond: number | null;
  sqft: number;
  land: number;
  imps: number;
  landShare: number;
  perUnit: number;
  priceRatio: number;
  open: number;
  esc: boolean;
  rrio: number;
  saleY: number | null;
  salePrice: number | null;
  score: number;
  parts: Record<string, number>;
}
interface TargetsData {
  generatedAt: string;
  cityPerUnit: number;
  compsN: number;
  compsSinceY: number;
  comps: Record<string, { n: number; medPerUnit: number }>;
  counts: { own: number; build: number; buildScanned: number };
  targets: Target[];
}

function scoreColor(s: number): string {
  if (s >= 7) return '#d7191c';
  if (s >= 5.5) return '#fc8d59';
  if (s >= 4) return '#fee08b';
  return '#9aa3ad';
}
const LEGEND = [
  { label: '7+', color: '#d7191c' },
  { label: '5.5 to 7', color: '#fc8d59' },
  { label: '4 to 5.5', color: '#fee08b' },
  { label: 'under 4', color: '#9aa3ad' },
];

const PART_LABELS: Record<string, { name: string; weight: string; hint: string }> = {
  price: { name: 'Priced under comps', weight: '30%', hint: 'assessed value per unit vs what 2-4 unit buildings sell for in this ZIP' },
  land: { name: 'Value is in the land', weight: '20%', hint: 'land share of assessed value; high means the building barely counts' },
  gap: { name: 'Room to add units', weight: '20%', hint: 'units the zone allows minus units standing today' },
  distress: { name: 'Open code cases', weight: '12%', hint: 'active code enforcement at this address' },
  age: { name: 'Old or worn building', weight: '12%', hint: 'building age, downgraded if condition is average or better' },
  held: { name: 'Held 15+ years', weight: '6%', hint: 'no arm’s-length sale in 15 years; owners with old basis sell more readily' },
};

const LOT_MIN = [
  { label: 'Any lot size', v: 0 },
  { label: '3,000+ sqft', v: 3000 },
  { label: '4,000+ sqft', v: 4000 },
  { label: '5,000+ sqft', v: 5000 },
  { label: '7,000+ sqft', v: 7000 },
];

type SortKey = 'score' | 'perUnit' | 'priceRatio' | 'lot' | 'yr' | 'units' | 'landShare' | 'addr' | 'zip';
const SORT_KEYS: SortKey[] = ['score', 'perUnit', 'priceRatio', 'lot', 'yr', 'units', 'landShare', 'addr', 'zip'];
const MAX_MARKERS = 6000;
const MAX_ROWS = 250;

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function fmtK(n: number): string {
  return n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}K`;
}
function urlParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search);
}
function splitParam(v: string | null | undefined): string[] {
  return (v ?? '').split('|').filter(Boolean);
}
function zoneGroup(zone: string): string {
  const z = zone.toUpperCase();
  if (/^(NR|SF|RSL)/.test(z)) return 'NR';
  if (/^LR/.test(z)) return 'LR';
  return 'Other';
}

export function TargetsExplorer() {
  const [data, setData] = useState<TargetsData | null>(null);
  const [err, setErr] = useState('');

  const [q, setQ] = useState(() => urlParams()?.get('q') ?? '');
  const [mode, setMode] = useState<'all' | 'own' | 'build'>(() => {
    const v = urlParams()?.get('mode');
    return v === 'own' || v === 'build' ? v : 'all';
  });
  const [minScore, setMinScore] = useState(() => {
    const v = Number(urlParams()?.get('min'));
    return v >= 1 && v <= 10 ? v : 0;
  });
  const [units, setUnits] = useState(() => {
    const v = Number(urlParams()?.get('u'));
    return [2, 3, 4].includes(v) ? v : 0;
  });
  const [lotMin, setLotMin] = useState(() => {
    const v = Number(urlParams()?.get('lot'));
    return LOT_MIN.some((l) => l.v === v) ? v : 0;
  });
  const [zoneGroups, setZoneGroups] = useState<Set<string>>(() => new Set(splitParam(urlParams()?.get('zg'))));
  const [zips, setZips] = useState<Set<string>>(() => new Set(splitParam(urlParams()?.get('zip'))));
  const [casesOnly, setCasesOnly] = useState(() => urlParams()?.get('cases') === '1');
  const [underComps, setUnderComps] = useState(() => urlParams()?.get('under') === '1');
  const [longHeld, setLongHeld] = useState(() => urlParams()?.get('held') === '1');

  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const v = urlParams()?.get('sort');
    return SORT_KEYS.includes(v as SortKey) ? (v as SortKey) : 'score';
  });
  const [sortDir, setSortDir] = useState<1 | -1>(() => (urlParams()?.get('dir') === 'asc' ? 1 : -1));
  const [selected, setSelected] = useState<Target | null>(null);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);

  useEffect(() => {
    fetch('/targets.json')
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (mode !== 'all') sp.set('mode', mode);
    if (minScore > 0) sp.set('min', String(minScore));
    if (units) sp.set('u', String(units));
    if (lotMin) sp.set('lot', String(lotMin));
    if (zoneGroups.size) sp.set('zg', [...zoneGroups].sort().join('|'));
    if (zips.size) sp.set('zip', [...zips].sort().join('|'));
    if (casesOnly) sp.set('cases', '1');
    if (underComps) sp.set('under', '1');
    if (longHeld) sp.set('held', '1');
    if (sortKey !== 'score' || sortDir !== -1) {
      sp.set('sort', sortKey);
      sp.set('dir', sortDir === 1 ? 'asc' : 'desc');
    }
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [q, mode, minScore, units, lotMin, zoneGroups, zips, casesOnly, underComps, longHeld, sortKey, sortDir]);

  const topZips = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const t of data.targets) counts.set(t.zip, (counts.get(t.zip) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const ql = q.trim().toUpperCase();
    const curYear = new Date().getFullYear();
    return data.targets.filter((t) => {
      if (mode !== 'all' && t.mode !== mode) return false;
      if (t.score < minScore) return false;
      if (units && t.units !== units) return false;
      if (lotMin && t.lot < lotMin) return false;
      if (zoneGroups.size && !zoneGroups.has(zoneGroup(t.zone))) return false;
      if (zips.size && !zips.has(t.zip)) return false;
      if (casesOnly && t.open === 0) return false;
      if (underComps && t.priceRatio > 0.8) return false;
      if (longHeld && !(t.saleY && curYear - t.saleY >= 15)) return false;
      if (ql && !t.addr.includes(ql) && !t.pin.includes(ql)) return false;
      return true;
    });
  }, [data, q, mode, minScore, units, lotMin, zoneGroups, zips, casesOnly, underComps, longHeld]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (sortKey === 'addr' || sortKey === 'zip') return String(av).localeCompare(String(bv)) * sortDir;
      return ((Number(av) || 0) - (Number(bv) || 0)) * sortDir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    if (!data || !mapEl.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { preferCanvas: true, scrollWheelZoom: false });
      map.fitBounds([[47.49, -122.43], [47.74, -122.23]]);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 150);
      drawMarkers();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    drawMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted]);

  function drawMarkers() {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    for (const t of sorted.slice(0, MAX_MARKERS)) {
      const m = L.circleMarker([t.lat, t.lng], {
        radius: t.score >= 7 ? 6 : t.score >= 5.5 ? 5 : 4,
        color: t.mode === 'own' ? '#0b3a5c' : '#7a5195',
        weight: t.mode === 'own' ? 1.2 : 0.8,
        fillColor: scoreColor(t.score),
        fillOpacity: 0.85,
      });
      m.bindPopup(
        `<strong>${t.addr}</strong><br/>${t.mode === 'own' ? `${t.units} units today` : `1 unit, zone allows ${t.cap}`} &middot; ${t.zone}<br/>Score ${t.score} &middot; assessed ${fmtK(t.land + t.imps)}`,
      );
      m.on('click', () => setSelected(t));
      m.addTo(layer);
    }
  }

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, v: string) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  }
  function sortBy(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === 'addr' || k === 'zip' || k === 'perUnit' || k === 'priceRatio' || k === 'yr' ? 1 : -1);
    }
  }
  function downloadCsv() {
    const headers = ['pin', 'address', 'zip', 'mode', 'units_now', 'zone', 'zone_allows', 'lot_sqft', 'year_built', 'assessed_land', 'assessed_imps', 'land_share_pct', 'assessed_per_unit', 'vs_zip_comp', 'open_cases', 'rrio_units', 'last_sale_year', 'last_sale_price', 'score'];
    const rows = sorted.map((t) => [t.pin, t.addr, t.zip, t.mode, t.units, t.zone, t.cap, t.lot, t.yr, t.land, t.imps, t.landShare, t.perUnit, t.priceRatio, t.open, t.rrio, t.saleY, t.salePrice, t.score]);
    const csv = [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'seattle-targets.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (err) return <div className="card">Could not load targets.json: {err}</div>;
  if (!data) return <div className="card">Loading 24,000+ scored parcels&hellip;</div>;

  const zipComp = selected ? data.comps[selected.zip]?.medPerUnit : null;

  return (
    <div>
      <div className="card">
        <div className="lf-row">
          <div className="lf-field grow">
            <label>Search address or parcel number</label>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 45TH ST or 1234567890" />
          </div>
          <div className="lf-field">
            <label>Kind of target</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'all' | 'own' | 'build')}>
              <option value="all">Both kinds</option>
              <option value="own">Has 2 to 4 units now</option>
              <option value="build">One unit, room to build</option>
            </select>
          </div>
          <div className="lf-field">
            <label>Min score: {minScore || 'any'}</label>
            <input type="range" min={0} max={9} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          </div>
          <div className="lf-field">
            <label>Units today</label>
            <select value={units} onChange={(e) => setUnits(Number(e.target.value))}>
              <option value={0}>Any</option>
              <option value={2}>Duplex (2)</option>
              <option value={3}>Triplex (3)</option>
              <option value={4}>Fourplex (4)</option>
            </select>
          </div>
          <div className="lf-field">
            <label>Lot size</label>
            <select value={lotMin} onChange={(e) => setLotMin(Number(e.target.value))}>
              {LOT_MIN.map((l) => (
                <option key={l.v} value={l.v}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="lf-row" style={{ marginTop: 8 }}>
          <div className="lf-chips">
            {(['NR', 'LR', 'Other'] as const).map((zg) => (
              <button key={zg} className={`chip ${zoneGroups.has(zg) ? 'on' : ''}`} onClick={() => toggle(zoneGroups, setZoneGroups, zg)}>
                {zg === 'NR' ? 'Neighborhood res.' : zg === 'LR' ? 'Lowrise' : 'Other zones'}
              </button>
            ))}
            <span className="chip-sep" />
            <button className={`chip ${casesOnly ? 'on' : ''}`} onClick={() => setCasesOnly(!casesOnly)}>
              Open code case
            </button>
            <button className={`chip ${underComps ? 'on' : ''}`} onClick={() => setUnderComps(!underComps)}>
              Well under comps
            </button>
            <button className={`chip ${longHeld ? 'on' : ''}`} onClick={() => setLongHeld(!longHeld)}>
              Held 15+ years
            </button>
          </div>
        </div>

        <div className="lf-row" style={{ marginTop: 6 }}>
          <div className="lf-chips">
            {topZips.map(([z, n]) => (
              <button key={z} className={`chip ${zips.has(z) ? 'on' : ''}`} onClick={() => toggle(zips, setZips, z)}>
                {z} ({n})
              </button>
            ))}
          </div>
        </div>

        <p className="note" style={{ margin: '10px 0 0' }}>
          <strong>{filtered.length.toLocaleString('en-US')}</strong> of {data.targets.length.toLocaleString('en-US')} parcels
          match. Map shows the top {Math.min(MAX_MARKERS, filtered.length).toLocaleString('en-US')} by current sort.{' '}
          <button className="csv-btn" onClick={downloadCsv} style={{ marginLeft: 8 }}>
            Download CSV ({filtered.length.toLocaleString('en-US')} rows)
          </button>
        </p>
      </div>

      <div className="card" style={{ padding: 10 }}>
        <div ref={mapEl} className="lead-map-canvas" />
        <div className="lf-legend">
          <span className="muted" style={{ marginRight: 6 }}>Score:</span>
          {LEGEND.map((l) => (
            <span key={l.label} className="lf-key">
              <span className="lf-dot" style={{ background: l.color }} /> {l.label}
            </span>
          ))}
          <span className="lf-key" style={{ marginLeft: 12 }}>
            <span className="lf-dot" style={{ background: '#fff', border: '2px solid #0b3a5c' }} /> ring: has 2 to 4 units
          </span>
          <span className="lf-key">
            <span className="lf-dot" style={{ background: '#fff', border: '2px solid #7a5195' }} /> ring: room to build
          </span>
        </div>
      </div>

      <div className="lf-split">
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th className="txt clickable" onClick={() => sortBy('addr')}>Address</th>
                <th className="clickable" onClick={() => sortBy('units')}>Units</th>
                <th className="txt">Zone</th>
                <th className="clickable" onClick={() => sortBy('lot')}>Lot</th>
                <th className="clickable" onClick={() => sortBy('yr')}>Built</th>
                <th className="clickable" onClick={() => sortBy('perUnit')}>Assessed/unit</th>
                <th className="clickable" onClick={() => sortBy('priceRatio')}>vs comps</th>
                <th className="clickable" onClick={() => sortBy('landShare')}>Land %</th>
                <th className="clickable" onClick={() => sortBy('score')}>Score</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, MAX_ROWS).map((t) => (
                <tr key={t.pin} onClick={() => setSelected(t)} style={{ cursor: 'pointer' }}>
                  <td className="txt">
                    {t.addr}
                    {t.open > 0 ? <span title="open code cases"> &#9873;</span> : null}
                  </td>
                  <td>
                    {t.units}
                    {t.cap && t.cap > t.units ? <span className="muted"> /{t.cap}</span> : null}
                  </td>
                  <td className="txt">{t.zone}</td>
                  <td>{t.lot.toLocaleString('en-US')}</td>
                  <td>{t.yr ?? 'n/a'}</td>
                  <td>{fmtK(t.perUnit)}</td>
                  <td>{Math.round(t.priceRatio * 100)}%</td>
                  <td>{t.landShare}%</td>
                  <td>
                    <span className="lf-scorepill" style={{ background: scoreColor(t.score) }}>
                      {t.score.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > MAX_ROWS ? (
            <p className="foot">Showing the first {MAX_ROWS} rows. Narrow the filters or download the CSV for the full list.</p>
          ) : null}
        </div>

        {selected ? (
          <div className="card lf-drawer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ margin: 0 }}>{selected.addr}</h3>
              <button className="csv-btn" onClick={() => setSelected(null)}>Close</button>
            </div>
            <p className="muted" style={{ margin: '4px 0 10px' }}>
              {selected.mode === 'own'
                ? `${selected.units} units today`
                : `1 unit today; the ${selected.zone} zone allows about ${selected.cap}`}{' '}
              &middot; {selected.zip} &middot; parcel {selected.pin}
            </p>

            <table className="data">
              <tbody>
                <tr><td className="txt">Zone / lot</td><td>{selected.zone} &middot; {selected.lot.toLocaleString('en-US')} sqft</td></tr>
                <tr><td className="txt">Built</td><td>{selected.yr ?? 'n/a'}{selected.cond ? ` · condition ${selected.cond}/5` : ''}{selected.grade ? ` · grade ${selected.grade}` : ''}</td></tr>
                <tr><td className="txt">Assessed</td><td>{fmtK(selected.land + selected.imps)} ({fmtK(selected.land)} land, {selected.landShare}% of value)</td></tr>
                <tr>
                  <td className="txt">Per unit ({selected.mode === 'own' ? 'existing' : 'buildable'})</td>
                  <td>
                    {fmtK(selected.perUnit)}
                    {zipComp ? ` vs ${fmtK(zipComp)} ZIP comp (${Math.round(selected.priceRatio * 100)}%)` : ` vs ${fmtK(data.cityPerUnit)} citywide (${Math.round(selected.priceRatio * 100)}%)`}
                  </td>
                </tr>
                <tr><td className="txt">Last sale</td><td>{selected.saleY ? `${selected.saleY} for ${fmtK(selected.salePrice || 0)}` : 'none on record (100K+ arm’s length)'}</td></tr>
                <tr><td className="txt">Code cases</td><td>{selected.open > 0 ? `${selected.open} open${selected.esc ? ', escalated' : ''}` : 'none open'}</td></tr>
                <tr><td className="txt">Registered rental</td><td>{selected.rrio > 0 ? `yes, ${selected.rrio} unit${selected.rrio > 1 ? 's' : ''} (RRIO)` : 'not registered'}</td></tr>
              </tbody>
            </table>

            <h4 style={{ margin: '14px 0 6px' }}>Why it scored {selected.score.toFixed(1)}</h4>
            {Object.entries(PART_LABELS).map(([k, meta]) => (
              <div key={k} className="lf-part">
                <div className="lf-part-head">
                  <span>{meta.name} <span className="muted">({meta.weight})</span></span>
                  <span>{Math.round((selected.parts[k] ?? 0) * 100)}</span>
                </div>
                <div className="lf-bar-track">
                  <div className="lf-bar-fill" style={{ width: `${Math.round((selected.parts[k] ?? 0) * 100)}%` }} />
                </div>
                <div className="lf-part-hint">{meta.hint}</div>
              </div>
            ))}

            <p style={{ marginTop: 14 }}>
              <a href={`https://blue.kingcounty.com/Assessor/eRealProperty/Detail.aspx?ParcelNbr=${selected.pin}`} target="_blank" rel="noopener noreferrer">
                County record
              </a>{' '}
              &middot;{' '}
              <a href={`https://gismaps.kingcounty.gov/parcelviewer2/?pin=${selected.pin}`} target="_blank" rel="noopener noreferrer">
                Parcel viewer
              </a>{' '}
              &middot;{' '}
              <a href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`} target="_blank" rel="noopener noreferrer">
                Street view
              </a>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
