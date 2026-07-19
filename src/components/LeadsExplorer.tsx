'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

interface LeadCase {
  cat: string;
  opened: string;
  status: string;
  num: string;
}
interface Lead {
  addr: string;
  zip: string;
  lat: number;
  lng: number;
  score: number;
  openCount: number;
  daysSince: number;
  latest: string;
  trend: 'up' | 'flat' | 'down';
  cats: string[];
  escalated: boolean;
  topCat: string;
  cases: LeadCase[];
}
interface LeadsData {
  generatedAt: string;
  todayStr: string;
  total: number;
  types: { key: string; n: number }[];
  zips: { key: string; n: number }[];
  leads: Lead[];
}

// Higher score means a stronger distress signal, so hotter color.
function scoreColor(s: number): string {
  if (s >= 8) return '#d7191c';
  if (s >= 6) return '#fc8d59';
  if (s >= 4) return '#fee08b';
  return '#9aa3ad';
}
const LEGEND = [
  { label: '8 to 10', color: '#d7191c' },
  { label: '6 to 8', color: '#fc8d59' },
  { label: '4 to 6', color: '#fee08b' },
  { label: 'under 4', color: '#9aa3ad' },
];
const RECENCY = [
  { label: 'Any time', days: 1e9 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'Last year', days: 365 },
];
const TREND_ARROW = { up: '↑ worsening', flat: '→ steady', down: '↓ easing' };
const MAX_MARKERS = 6000;
const MAX_ROWS = 250;

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function LeadsExplorer() {
  const [data, setData] = useState<LeadsData | null>(null);
  const [err, setErr] = useState<string>('');

  // filters
  const [q, setQ] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [recency, setRecency] = useState(1e9);
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [zips, setZips] = useState<Set<string>>(new Set());
  // sort + selection
  const [sortKey, setSortKey] = useState<'score' | 'openCount' | 'daysSince' | 'addr' | 'zip'>('score');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [selected, setSelected] = useState<Lead | null>(null);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);

  useEffect(() => {
    fetch('/leads.json')
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const ql = q.trim().toUpperCase();
    return data.leads.filter((l) => {
      if (l.score < minScore) return false;
      if (l.daysSince > recency) return false;
      if (escalatedOnly && !l.escalated) return false;
      if (ql && !l.addr.includes(ql)) return false;
      if (types.size && !l.cats.some((c) => types.has(c))) return false;
      if (zips.size && !zips.has(l.zip)) return false;
      return true;
    });
  }, [data, q, minScore, recency, escalatedOnly, types, zips]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: number | string = a[sortKey];
      let bv: number | string = b[sortKey];
      if (sortKey === 'addr' || sortKey === 'zip') return String(av).localeCompare(String(bv)) * sortDir;
      return ((Number(av) || 0) - (Number(bv) || 0)) * sortDir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // create the map once data + element are ready
  useEffect(() => {
    if (!data || !mapEl.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { preferCanvas: true, scrollWheelZoom: false }).setView([47.62, -122.33], 11);
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

  // redraw markers when the filtered set changes
  useEffect(() => {
    drawMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted]);

  function drawMarkers() {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    const pts = sorted.slice(0, MAX_MARKERS);
    for (const l of pts) {
      const m = L.circleMarker([l.lat, l.lng], {
        radius: l.score >= 8 ? 6 : l.score >= 6 ? 5 : 4,
        color: '#333',
        weight: 0.5,
        fillColor: scoreColor(l.score),
        fillOpacity: 0.8,
      });
      m.on('click', () => {
        setSelected(l);
      });
      m.addTo(layer);
    }
  }

  function focusLead(l: Lead) {
    setSelected(l);
    const map = mapRef.current;
    if (map) map.setView([l.lat, l.lng], 16, { animate: true });
  }

  function sortBy(k: typeof sortKey) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === 'addr' || k === 'zip' ? 1 : -1);
    }
  }

  function toggleSet(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  function resetFilters() {
    setQ('');
    setMinScore(0);
    setRecency(1e9);
    setEscalatedOnly(false);
    setTypes(new Set());
    setZips(new Set());
  }

  function exportCsv() {
    const cols = ['address', 'zip', 'score', 'open_cases', 'latest_open', 'days_since', 'trend', 'top_type', 'all_types', 'escalated'];
    const lines = [cols.join(',')];
    for (const l of sorted) {
      lines.push(
        [l.addr, l.zip, l.score, l.openCount, l.latest, l.daysSince, l.trend, l.topCat, l.cats.join('; '), l.escalated ? 'yes' : 'no']
          .map(csvCell)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seattle-code-leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (err) return <p className="muted">Could not load the data: {err}</p>;
  if (!data) return <p className="muted">Loading properties...</p>;

  const arrow = (k: typeof sortKey) => (sortKey === k ? (sortDir < 0 ? ' ▼' : ' ▲') : '');

  return (
    <div className="lead-x">
      <div className="lead-filters card">
        <div className="lf-row">
          <div className="lf-field grow">
            <label>Search address</label>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 24th Ave" />
          </div>
          <div className="lf-field">
            <label>Lowest score: {minScore}</label>
            <input type="range" min={0} max={10} step={1} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          </div>
          <div className="lf-field">
            <label>Newest case</label>
            <select value={recency} onChange={(e) => setRecency(Number(e.target.value))}>
              {RECENCY.map((r) => (
                <option key={r.label} value={r.days}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <label className="lf-check">
            <input type="checkbox" checked={escalatedOnly} onChange={(e) => setEscalatedOnly(e.target.checked)} /> Escalated only
          </label>
        </div>

        <div className="lf-field">
          <label>Violation type</label>
          <div className="chips">
            {data.types.map((t) => (
              <button key={t.key} className={'chip' + (types.has(t.key) ? ' on' : '')} onClick={() => toggleSet(types, t.key, setTypes)}>
                {t.key} <span className="chip-n">{t.n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="lf-field">
          <label>ZIP code</label>
          <div className="chips chips-scroll">
            {data.zips.map((z) => (
              <button key={z.key} className={'chip' + (zips.has(z.key) ? ' on' : '')} onClick={() => toggleSet(zips, z.key, setZips)}>
                {z.key}
              </button>
            ))}
          </div>
        </div>

        <div className="lf-row lf-actions">
          <span className="lead-count">
            <strong>{sorted.length.toLocaleString('en-US')}</strong> of {data.total.toLocaleString('en-US')} properties
          </span>
          <button className="csv-btn" onClick={exportCsv}>
            Download CSV
          </button>
          <button className="ghost-btn" onClick={resetFilters}>
            Reset
          </button>
        </div>
      </div>

      <div className="lead-body">
        <div className="lead-map">
          <div ref={mapEl} className="lead-map-canvas" />
          <div className="map-legend">
            {LEGEND.map((l) => (
              <span key={l.label} className="map-legend-item">
                <span className="map-dot" style={{ background: l.color }} /> {l.label}
              </span>
            ))}
          </div>
          {sorted.length > MAX_MARKERS ? (
            <p className="foot">Map shows the {MAX_MARKERS.toLocaleString('en-US')} highest-scoring matches. Narrow the filters or use the CSV for the full set.</p>
          ) : null}
        </div>

        <div className="lead-list">
          <div className="scroll" style={{ maxHeight: 540 }}>
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => sortBy('score')}>
                    Score{arrow('score')}
                  </th>
                  <th className="sortable" onClick={() => sortBy('addr')}>
                    Address{arrow('addr')}
                  </th>
                  <th className="sortable num" onClick={() => sortBy('openCount')}>
                    Open{arrow('openCount')}
                  </th>
                  <th className="sortable num" onClick={() => sortBy('daysSince')}>
                    Days{arrow('daysSince')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, MAX_ROWS).map((l) => (
                  <tr
                    key={l.addr}
                    className={'clickable' + (selected?.addr === l.addr ? ' sel' : '')}
                    onClick={() => focusLead(l)}
                  >
                    <td>
                      <span className="score-badge" style={{ background: scoreColor(l.score) }}>
                        {l.score}
                      </span>
                    </td>
                    <td>
                      <div className="addr">{l.addr}</div>
                      <div className="addr-sub">
                        {l.topCat} {l.escalated ? <span className="esc">escalated</span> : null}
                      </div>
                    </td>
                    <td className="num">{l.openCount}</td>
                    <td className="num">{l.daysSince}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length > MAX_ROWS ? (
            <p className="foot">Showing the first {MAX_ROWS} rows. Sort or filter to find others, or download the full CSV.</p>
          ) : null}
        </div>
      </div>

      {selected ? (
        <>
          <div className="drawer-bg" onClick={() => setSelected(null)} />
          <div className="drawer open">
            <button className="x" onClick={() => setSelected(null)}>
              &times;
            </button>
            <div className="d-score" style={{ color: scoreColor(selected.score) }}>
              {selected.score}
              <span className="d-of"> / 10</span>
            </div>
            <h2 style={{ margin: '4px 0 2px', border: 'none' }}>{selected.addr}</h2>
            <p className="sub">
              ZIP {selected.zip} &middot; {selected.openCount} open case{selected.openCount === 1 ? '' : 's'} &middot;{' '}
              {TREND_ARROW[selected.trend]}
            </p>
            <p className="note">
              Newest case opened {selected.latest} ({selected.daysSince} days ago). Types: {selected.cats.join(', ')}.
            </p>
            <h3>Open cases</h3>
            <table className="d-cases">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Opened</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selected.cases.map((c) => (
                  <tr key={c.num}>
                    <td>{c.cat}</td>
                    <td>{c.opened}</td>
                    <td>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="foot">
              Case numbers: {selected.cases.map((c) => c.num).join(', ')}. Look any of them up on the Seattle Services Portal.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
