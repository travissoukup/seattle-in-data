'use client';

import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeepDive } from './DeepDive';

/* ------------------------------------------------------------------ types */

interface IndexRow {
  a: string; // normalized address (search key + display)
  p: string; // PIN (Major+Minor)
  z: string; // ZIP (shard key)
}

interface Sale {
  date: string;
  price: number;
  rec?: string;
}

interface Detail {
  pin: string;
  addr: string;
  zip: string;
  lat: number;
  lng: number;
  zone: string;
  zoneFamily: string;
  zoneUnits: number | null;
  zoneFar: number | null;
  mha: boolean;
  lot: number;
  use: string;
  unbuildable: boolean;
  waterfront?: string | null;
  units: number;
  sqft: number;
  beds: number;
  baths: number;
  stories?: number | null;
  yr: number | null;
  age: number | null;
  grade: number | null;
  gradeName: string | null;
  cond: number | null;
  condName: string | null;
  land: number;
  imps: number;
  billYr: number;
  exempt: boolean;
  teardownPct: number;
  buildable: number;
  underbuiltPct: number;
  sales?: Sale[];
}

interface Permit {
  num: string;
  cls: string;
  typ: string;
  desc: string;
  status: string;
  issued: string | null;
  applied: string | null;
  completed: string | null;
  cost: number | null;
  units: number | null;
  link: string | null;
  source: 'Building' | 'Land use';
}

interface CaseRow {
  num: string;
  type: string;
  desc: string;
  opened: string | null;
  lastInsp: string | null;
  lastResult: string | null;
  status: string;
  open: boolean;
  link: string | null;
}

interface EcaHit {
  name: string;
  atPoint: boolean;
  near: boolean;
}

/* -------------------------------------------------------------- constants */

const SOCRATA = 'https://data.seattle.gov/resource';
const GIS = 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services';

// ECA layers, mirroring scripts/build_capacity.py. [label, service, layerId]
const ECA_LAYERS: Array<[string, string, number]> = [
  ['Steep slope', 'Environmentally_Critical_Areas_Steep_Slope', 9],
  ['Known landslide area', 'Environmentally_Critical_Areas_Known_Slides', 1],
  ['Potential slide area', 'Environmentally_Critical_Areas_Potential_Slide_Areas', 7],
  ['Liquefaction prone', 'ECA_Liquefaction_Prone_Areas', 5],
  ['Flood prone', 'ECA_Flood_Prone_Areas', 0],
  ['Wetland', 'Environmentally_Critical_Areas_Wetlands', 10],
  ['Riparian corridor', 'Environmentally_Critical_Areas_Riparian_Corridors', 8],
  ['Peat settlement prone', 'ECA_Peat_Settlement_Prone_Areas', 6],
  ['Fish & wildlife habitat', 'ECA_Fish_and_Wildlife_Habitat_Conservation_Area', 11],
];

/* ---------------------------------------------------------------- helpers */

function normAddr(s: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ \d{5}(-\d{4})?$/, '')
    .trim();
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '—';
  return `$${Math.round(v).toLocaleString('en-US')}`;
}
function fmtK(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  if (v >= 1_000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v)}`;
}
function fmtNum(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString('en-US');
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = s.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d) || /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (!m) return d;
  if (m[0].includes('/')) return `${m[3]}`; // mm/dd/yyyy -> year for sales
  return `${m[2]}/${m[1]}`; // yyyy-mm -> mm/yyyy
}
function saleYear(s: string): string {
  const m = /(\d{4})/.exec(s);
  return m ? m[1] : s;
}
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

const CLOSED_RE = /clos|complet|resolved|withdrawn|void|cancel|no violation|expired/i;

/* --------------------------------------------------------------- the view */

export function PropertyExplorer() {
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState<IndexRow[] | null>(null);
  const [idxLoading, setIdxLoading] = useState(false);
  const [matches, setMatches] = useState<IndexRow[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [focused, setFocused] = useState(false);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const shardCache = useRef<Map<string, Record<string, Detail>>>(new Map());

  // ---- index: fetch once, lazily (it's ~8MB) ----
  const ensureIndex = useCallback(async (): Promise<IndexRow[]> => {
    if (idx) return idx;
    setIdxLoading(true);
    try {
      const r = await fetch('/property/index.json');
      const rows: IndexRow[] = await r.json();
      setIdx(rows);
      return rows;
    } finally {
      setIdxLoading(false);
    }
  }, [idx]);

  // ---- shard -> detail ----
  const loadDetail = useCallback(async (pin: string, zip: string) => {
    setLoadingDetail(true);
    setDetailErr(null);
    try {
      let shard = shardCache.current.get(zip);
      if (!shard) {
        const r = await fetch(`/property/z-${zip}.json`);
        if (!r.ok) throw new Error('shard not found');
        shard = (await r.json()) as Record<string, Detail>;
        shardCache.current.set(zip, shard);
      }
      const d = shard[pin];
      if (!d) throw new Error('parcel not found');
      setDetail(d);
      // shareable URL
      const u = new URL(window.location.href);
      u.searchParams.set('p', pin);
      u.searchParams.set('z', zip);
      window.history.replaceState(null, '', u.toString());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'could not load');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // ---- deep link on mount ----
  useEffect(() => {
    const u = new URL(window.location.href);
    const p = u.searchParams.get('p');
    const z = u.searchParams.get('z');
    if (p && z) loadDetail(p, z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- search ----
  useEffect(() => {
    const q = normAddr(query);
    if (q.length < 3 || !idx) {
      setMatches([]);
      return;
    }
    const starts: IndexRow[] = [];
    const contains: IndexRow[] = [];
    for (let i = 0; i < idx.length && starts.length < 12; i++) {
      if (idx[i].a.startsWith(q)) starts.push(idx[i]);
    }
    if (starts.length < 12) {
      for (let i = 0; i < idx.length && contains.length < 12 - starts.length; i++) {
        if (!idx[i].a.startsWith(q) && idx[i].a.includes(q)) contains.push(idx[i]);
      }
    }
    setMatches([...starts, ...contains]);
    setHighlight(0);
  }, [query, idx]);

  function onFocus() {
    setFocused(true);
    if (!idx && !idxLoading) ensureIndex();
  }
  function pick(row: IndexRow) {
    setQuery(row.a);
    setMatches([]);
    setFocused(false);
    loadDetail(row.p, row.z);
  }
  function onKey(e: React.KeyboardEvent) {
    if (!matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(matches[highlight]);
    }
  }

  return (
    <div className="prop">
      {/* -------- search -------- */}
      <div className="prop-search no-print">
        <input
          className="prop-input"
          type="text"
          placeholder="Start typing an address, e.g. 3066 63rd Ave SW"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={onFocus}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={onKey}
          autoComplete="off"
          spellCheck={false}
        />
        {focused && (matches.length > 0 || (query.length >= 3 && idx)) ? (
          <ul className="prop-ac">
            {matches.length ? (
              matches.map((m, i) => (
                <li
                  key={m.p}
                  className={i === highlight ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(m);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <span className="prop-ac-addr">{titleCase(m.a)}</span>
                  <span className="prop-ac-zip">{m.z}</span>
                </li>
              ))
            ) : (
              <li className="prop-ac-empty">
                No match. This tool covers Seattle houses, townhomes, and small residential parcels — not condos,
                apartments, or commercial buildings.
              </li>
            )}
          </ul>
        ) : null}
        {idxLoading ? <p className="prop-hint">Loading the address list…</p> : null}
      </div>

      {!detail && !loadingDetail ? <EmptyState /> : null}
      {loadingDetail ? <p className="muted" style={{ padding: '2rem 0' }}>Pulling the records together…</p> : null}
      {detailErr && !loadingDetail ? (
        <p className="muted">Could not load that property ({detailErr}). Try another address.</p>
      ) : null}

      {detail ? <Report detail={detail} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------- empty state */

function EmptyState() {
  return (
    <div className="prop-empty no-print">
      <div className="prop-empty-grid">
        {[
          ['🏗️', 'What you can build', 'Zoning, unit capacity, floor area, ADU rules, and how far the lot is from built out.'],
          ['📜', 'Permit history', 'Every building and land-use permit ever filed at the address, live from the city.'],
          ['💰', 'Value & sales', 'Assessed land vs. building, the teardown ratio, and the recorded sale history.'],
          ['🚩', 'Due diligence', 'Open code cases, environmentally critical areas, and other red flags to check.'],
        ].map(([emoji, title, body]) => (
          <div className="prop-empty-card" key={title}>
            <span className="prop-empty-ico" aria-hidden>
              {emoji}
            </span>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>
      <p className="muted prop-empty-note">
        Everything here is assembled from public records (King County Assessor, Seattle SDCI, city GIS). It is a
        starting point for research, not an appraisal, a title report, or advice. Always confirm specifics with the
        city and county before acting.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- report */

function Report({ detail }: { detail: Detail }) {
  const total = detail.land + detail.imps;
  const sales = (detail.sales || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  // One shared critical-areas probe: the deep dive needs to know whether the
  // zoning standards are actually the binding constraint on this lot.
  const [ecaLikely, setEcaLikely] = useState(false);
  useEffect(() => {
    if (detail.lat == null) return;
    let cancelled = false;
    const hit = (service: string, layer: number) =>
      fetch(
        `${GIS}/${service}/FeatureServer/${layer}/query?geometry=${detail.lng},${detail.lat}` +
          `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
          `&distance=15&units=esriSRUnit_Meter&returnCountOnly=true&f=json`,
      )
        .then((r) => r.json())
        .then((j) => (typeof j.count === 'number' ? j.count : 0))
        .catch(() => 0);
    Promise.all([
      hit('Environmentally_Critical_Areas_Steep_Slope', 9),
      hit('Environmentally_Critical_Areas_Known_Slides', 1),
      hit('Environmentally_Critical_Areas_Wetlands', 10),
    ]).then((counts) => {
      if (!cancelled) setEcaLikely(counts.some((c) => c > 0));
    });
    return () => {
      cancelled = true;
    };
  }, [detail.lat, detail.lng]);

  return (
    <div className="prop-report">
      <Hero detail={detail} total={total} />
      <div className="prop-cols">
        <div className="prop-col-main">
          <Buildable detail={detail} />
          <Permits detail={detail} />
          <ValueSales detail={detail} total={total} sales={sales} />
        </div>
        <div className="prop-col-side">
          <MapCard detail={detail} />
          <RedFlags detail={detail} />
          <Records detail={detail} sales={sales} />
        </div>
      </div>

      <DeepDive detail={detail} ecaLikely={ecaLikely} />

      <p className="prop-disclaimer">
        Compiled from public records: King County Assessor parcel extracts, Seattle SDCI permit and code-case
        datasets, and City of Seattle GIS. Assessed values, zoning capacity, and the teardown and &ldquo;room to
        build&rdquo; figures are screening estimates — not an appraisal, a survey, a title report, or legal or
        investment advice. Only SDCI can confirm what a specific lot may be developed into. Verify everything with the
        city and county before you rely on it.
      </p>
    </div>
  );
}

/* -------- hero -------- */

function Hero({ detail, total }: { detail: Detail; total: number }) {
  const badges: Array<{ label: string; tone?: string }> = [];
  badges.push({ label: detail.zone || 'Zone n/a', tone: 'zone' });
  if (detail.mha) badges.push({ label: 'MHA area', tone: 'mha' });
  if (detail.use) badges.push({ label: detail.use });
  if (detail.waterfront) badges.push({ label: 'Waterfront', tone: 'water' });
  if (detail.unbuildable) badges.push({ label: 'Flagged unbuildable', tone: 'warn' });

  const bath = detail.baths ? (Number.isInteger(detail.baths) ? detail.baths : detail.baths.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')) : '—';

  return (
    <section className="prop-hero">
      <div className="prop-hero-top">
        <div>
          <h2 className="prop-addr">{titleCase(detail.addr)}</h2>
          <p className="prop-addr-sub">
            Seattle, WA {detail.zip} · Parcel {detail.pin}
          </p>
        </div>
        <button className="prop-print-btn no-print" onClick={() => window.print()}>
          Save / print report
        </button>
      </div>
      <div className="prop-badges">
        {badges.map((b) => (
          <span key={b.label} className={`prop-badge${b.tone ? ` t-${b.tone}` : ''}`}>
            {b.label}
          </span>
        ))}
      </div>
      <div className="prop-hero-stats">
        <HeroStat label="Assessed value" value={fmtK(total)} sub={`Land ${fmtK(detail.land)} · Bldg ${fmtK(detail.imps)} (${detail.billYr})`} />
        <HeroStat label="Built" value={detail.yr ? String(detail.yr) : '—'} sub={detail.age ? `${detail.age} yrs old` : 'year unknown'} />
        <HeroStat label="House size" value={detail.sqft ? `${fmtNum(detail.sqft)} sf` : '—'} sub={`${detail.beds || '—'} bd · ${bath} ba`} />
        <HeroStat label="Lot" value={detail.lot ? `${fmtNum(detail.lot)} sf` : '—'} sub={detail.zoneFamily} />
        <HeroStat
          label="Room to build"
          value={detail.underbuiltPct != null ? `${detail.underbuiltPct}%` : '—'}
          sub="below zoned floor area"
          accent={detail.underbuiltPct >= 60}
        />
      </div>
    </section>
  );
}

function HeroStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`prop-hstat${accent ? ' accent' : ''}`}>
      <div className="prop-hstat-v">{value}</div>
      <div className="prop-hstat-l">{label}</div>
      {sub ? <div className="prop-hstat-s">{sub}</div> : null}
    </div>
  );
}

/* -------- map -------- */

function MapCard({ detail }: { detail: Detail }) {
  const el = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | import('leaflet').CircleMarker | null>(null);

  useEffect(() => {
    if (!el.current || detail.lat == null) return;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current) return;
      if (!mapRef.current) {
        const map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView(
          [detail.lat, detail.lng],
          18,
        );
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Imagery &copy; Esri',
          maxZoom: 20,
        }).addTo(map);
        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 120);
      } else {
        mapRef.current.setView([detail.lat, detail.lng], 18);
      }
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = L.circleMarker([detail.lat, detail.lng], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: '#e8590c',
        fillOpacity: 0.95,
      }).addTo(mapRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [detail.lat, detail.lng]);

  return (
    <section className="card prop-section">
      <h3 className="prop-h">Where it is</h3>
      <div ref={el} className="prop-map" />
      <p className="prop-map-links">
        <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${detail.lat},${detail.lng}`} target="_blank" rel="noopener noreferrer">
          Street View
        </a>
        <a href={`https://www.google.com/maps/search/?api=1&query=${detail.lat},${detail.lng}`} target="_blank" rel="noopener noreferrer">
          Google Maps
        </a>
      </p>
    </section>
  );
}

/* -------- what you can build -------- */

function Buildable({ detail }: { detail: Detail }) {
  const allowed = detail.zoneUnits;
  const existing = detail.units || 0;
  const headroom = allowed != null ? Math.max(0, allowed - existing) : null;

  return (
    <section className="card prop-section">
      <h3 className="prop-h">What you can build here</h3>
      <p className="prop-lead">
        The lot is zoned <strong>{detail.zone || 'n/a'}</strong>
        {detail.zoneFamily ? ` (${detail.zoneFamily.toLowerCase()})` : ''}. These are screening estimates from the
        zone and lot size — only SDCI can confirm what a specific parcel allows.
      </p>

      <div className="prop-build-grid">
        <BuildStat
          big={allowed != null ? String(allowed) : '—'}
          label="Homes the zoning may allow"
          sub={allowed != null ? `${existing} today · ~${headroom} more` : 'varies by zone'}
        />
        <BuildStat
          big={detail.buildable ? `${fmtNum(detail.buildable)} sf` : '—'}
          label="Zoned floor area"
          sub={detail.zoneFar ? `${detail.zoneFar.toFixed(2)}× lot (FAR)` : 'FAR varies'}
        />
        <BuildStat
          big={detail.sqft ? `${fmtNum(detail.sqft)} sf` : '—'}
          label="Built today"
          sub={detail.underbuiltPct != null ? `${detail.underbuiltPct}% below the cap` : ''}
          accent={detail.underbuiltPct >= 60}
        />
      </div>

      {detail.buildable && detail.sqft ? (
        <div className="prop-bar" aria-hidden>
          <div className="prop-bar-fill" style={{ width: `${Math.min(100, Math.round((detail.sqft / detail.buildable) * 100))}%` }} />
          <span className="prop-bar-label">
            {Math.min(100, Math.round((detail.sqft / detail.buildable) * 100))}% of zoned floor area used
          </span>
        </div>
      ) : null}

      <ul className="prop-facts">
        <li>
          <strong>Backyard cottage / ADU.</strong> State law (HB 1337) lets most Seattle lots add up to two accessory
          units — an attached ADU and a detached backyard cottage — subject to SDCI review.
        </li>
        {detail.mha ? (
          <li>
            <strong>Mandatory Housing Affordability.</strong> The{' '}
            <code>(M)</code> suffix means redevelopment here either includes affordable units or pays into the MHA
            fund.
          </li>
        ) : null}
        {detail.unbuildable ? (
          <li className="warn">
            <strong>Flagged unbuildable.</strong> The assessor marks this parcel as unbuildable — often an access,
            easement, or critical-area constraint. Confirm before assuming any capacity.
          </li>
        ) : null}
        <li>
          Run the full scenario — unit yield, FAR, setbacks, and parking — in the{' '}
          <a href="/capacity">capacity workbook</a>, or confirm zoning on the{' '}
          <a href={`https://cosgisweb.seattle.gov/DPDApps/SDCIParcelData/parceldata.aspx`} target="_blank" rel="noopener noreferrer">
            SDCI parcel lookup
          </a>
          .
        </li>
      </ul>
    </section>
  );
}

function BuildStat({ big, label, sub, accent }: { big: string; label: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`prop-bstat${accent ? ' accent' : ''}`}>
      <div className="prop-bstat-v">{big}</div>
      <div className="prop-bstat-l">{label}</div>
      {sub ? <div className="prop-bstat-s">{sub}</div> : null}
    </div>
  );
}

/* -------- permits (live) -------- */

function Permits({ detail }: { detail: Detail }) {
  const [permits, setPermits] = useState<Permit[] | null>(null);
  const [err, setErr] = useState(false);
  const addr = normAddr(detail.addr);

  useEffect(() => {
    let cancelled = false;
    setPermits(null);
    setErr(false);
    (async () => {
      try {
        const mk = (ds: string, src: 'Building' | 'Land use', extra: string) => {
          const where = `upper(originaladdress1)='${addr.replace(/'/g, "''")}'`;
          const sel = `permitnum,permitclassmapped,permittypedesc,description,statuscurrent,issueddate,applieddate,${extra}`;
          return fetch(
            `${SOCRATA}/${ds}.json?$where=${encodeURIComponent(where)}&$select=${encodeURIComponent(sel)}&$limit=300`,
          )
            .then((r) => (r.ok ? r.json() : []))
            .then((rows: Record<string, string>[]) =>
              rows.map(
                (r): Permit => ({
                  num: r.permitnum || '',
                  cls: r.permitclassmapped || '',
                  typ: r.permittypedesc || '',
                  desc: r.description || '',
                  status: r.statuscurrent || '',
                  issued: r.issueddate || null,
                  applied: r.applieddate || null,
                  completed: r.completeddate || null,
                  cost: r.estprojectcost != null ? Number(r.estprojectcost) : null,
                  units: r.housingunits != null ? Number(r.housingunits) : null,
                  link: r.link || null,
                  source: src,
                }),
              ),
            )
            .catch(() => [] as Permit[]);
        };
        const [b, l] = await Promise.all([
          mk('76t5-zqzr', 'Building', 'completeddate,estprojectcost,housingunits,link'),
          mk('ht3q-kdvx', 'Land use', 'estprojectcost,housingunits,link'),
        ]);
        if (cancelled) return;
        const all = [...b, ...l].sort((x, y) => {
          const dx = x.issued || x.applied || '';
          const dy = y.issued || y.applied || '';
          return dx < dy ? 1 : dx > dy ? -1 : 0;
        });
        setPermits(all);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addr]);

  const totalInvest = permits ? permits.reduce((s, p) => s + (p.cost || 0), 0) : 0;

  return (
    <section className="card prop-section">
      <h3 className="prop-h">Permit history</h3>
      {permits == null && !err ? <p className="muted">Checking the city permit records…</p> : null}
      {err ? <p className="muted">Couldn&rsquo;t reach the live permit records just now.</p> : null}
      {permits && permits.length === 0 ? (
        <p className="muted">No permits on file at this address in the city&rsquo;s open datasets.</p>
      ) : null}
      {permits && permits.length > 0 ? (
        <>
          <p className="prop-lead">
            {permits.length} permit{permits.length === 1 ? '' : 's'} on record
            {totalInvest > 0 ? ` · ${fmtK(totalInvest)} in declared project value` : ''}.
          </p>
          <ol className="prop-timeline">
            {permits.slice(0, 40).map((p) => {
              const open = p.status && !CLOSED_RE.test(p.status);
              return (
                <li key={`${p.source}-${p.num}`} className="prop-tl">
                  <span className="prop-tl-year">{fmtDate(p.issued || p.applied) === '—' ? '—' : (p.issued || p.applied || '').slice(0, 4)}</span>
                  <div className="prop-tl-body">
                    <div className="prop-tl-head">
                      <span className="prop-tl-type">{p.typ || p.cls || p.source}</span>
                      <span className={`prop-tl-status${open ? ' open' : ''}`}>{p.status || '—'}</span>
                    </div>
                    {p.desc ? <p className="prop-tl-desc">{p.desc}</p> : null}
                    <p className="prop-tl-meta">
                      {p.source} · {p.num}
                      {p.cost ? ` · ${fmtK(p.cost)}` : ''}
                      {p.link ? (
                        <>
                          {' · '}
                          <a href={p.link} target="_blank" rel="noopener noreferrer">
                            city record
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {permits.length > 40 ? <p className="muted">Showing the 40 most recent of {permits.length}.</p> : null}
        </>
      ) : null}
    </section>
  );
}

/* -------- value & sales -------- */

function ValueSales({ detail, total, sales }: { detail: Detail; total: number; sales: Sale[] }) {
  const last = sales[0];
  return (
    <section className="card prop-section">
      <h3 className="prop-h">Value &amp; sales</h3>
      <div className="prop-split">
        <div className="prop-split-bar" aria-hidden>
          <div className="seg land" style={{ width: `${total ? (detail.land / total) * 100 : 0}%` }} />
          <div className="seg imps" style={{ width: `${total ? (detail.imps / total) * 100 : 0}%` }} />
        </div>
        <div className="prop-split-legend">
          <span>
            <i className="dot land" /> Land {fmtK(detail.land)} ({total ? Math.round((detail.land / total) * 100) : 0}%)
          </span>
          <span>
            <i className="dot imps" /> Building {fmtK(detail.imps)} ({total ? Math.round((detail.imps / total) * 100) : 0}%)
          </span>
        </div>
      </div>
      <p className="prop-lead">
        {detail.teardownPct >= 85 ? (
          <>
            Nearly all the value — <strong>{detail.teardownPct}%</strong> — is in the land, not the structure. On
            paper this is a classic teardown/redevelopment profile.
          </>
        ) : detail.teardownPct >= 60 ? (
          <>
            <strong>{detail.teardownPct}%</strong> of the assessed value is in the land. The building contributes
            relatively little.
          </>
        ) : (
          <>
            The building still carries <strong>{100 - detail.teardownPct}%</strong> of the assessed value, so this
            reads as a keep-and-improve rather than a teardown.
          </>
        )}
        {detail.exempt ? ' This parcel is tax-exempt.' : ''}
      </p>

      {sales.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Sale price</th>
                <th>Recording #</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s, i) => (
                <tr key={i}>
                  <td>{saleYear(s.date)}</td>
                  <td>{fmtMoney(s.price)}</td>
                  <td className="muted">{s.rec || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No recorded arm&rsquo;s-length sale on file.</p>
      )}
      {last ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Most recent recorded sale: {fmtMoney(last.price)} in {saleYear(last.date)}. Sale records can include
          non-market transfers; confirm with the county.
        </p>
      ) : null}
    </section>
  );
}

/* -------- due diligence / red flags -------- */

function RedFlags({ detail }: { detail: Detail }) {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [rental, setRental] = useState<{ status: string; units: number } | null | 'none'>(null);
  const [eca, setEca] = useState<EcaHit[] | null>(null);
  const addr = normAddr(detail.addr);

  // code cases (live)
  useEffect(() => {
    let cancelled = false;
    setCases(null);
    const where = `upper(originaladdress1)='${addr.replace(/'/g, "''")}'`;
    const sel = 'recordnum,recordtypedesc,description,opendate,lastinspdate,lastinspresult,statuscurrent,link';
    fetch(`${SOCRATA}/ez4a-iug7.json?$where=${encodeURIComponent(where)}&$select=${encodeURIComponent(sel)}&$limit=200`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Record<string, string>[]) => {
        if (cancelled) return;
        setCases(
          rows
            .map(
              (r): CaseRow => ({
                num: r.recordnum || '',
                type: r.recordtypedesc || '',
                desc: r.description || '',
                opened: r.opendate || null,
                lastInsp: r.lastinspdate || null,
                lastResult: r.lastinspresult || null,
                status: r.statuscurrent || '',
                open: !!r.statuscurrent && !CLOSED_RE.test(r.statuscurrent),
                link: r.link || null,
              }),
            )
            .sort((a, b) => (Number(b.open) - Number(a.open)) || ((a.opened || '') < (b.opened || '') ? 1 : -1)),
        );
      })
      .catch(() => !cancelled && setCases([]));
    return () => {
      cancelled = true;
    };
  }, [addr]);

  // rental registration (live)
  useEffect(() => {
    let cancelled = false;
    setRental(null);
    const where = `upper(originaladdress1)='${addr.replace(/'/g, "''")}'`;
    fetch(`${SOCRATA}/j2xh-c7vt.json?$where=${encodeURIComponent(where)}&$select=statuscurrent,rentalhousingunits&$limit=5`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Record<string, string>[]) => {
        if (cancelled) return;
        if (!rows.length) setRental('none');
        else setRental({ status: rows[0].statuscurrent || 'Registered', units: Number(rows[0].rentalhousingunits || 0) });
      })
      .catch(() => !cancelled && setRental('none'));
    return () => {
      cancelled = true;
    };
  }, [addr]);

  // ECA (live GIS point queries)
  useEffect(() => {
    let cancelled = false;
    setEca(null);
    if (detail.lat == null) {
      setEca([]);
      return;
    }
    const count = (service: string, layer: number, dist?: number) => {
      const u =
        `${GIS}/${service}/FeatureServer/${layer}/query?geometry=${detail.lng},${detail.lat}` +
        `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
        (dist ? `&distance=${dist}&units=esriSRUnit_Meter` : '') +
        `&returnCountOnly=true&f=json`;
      return fetch(u)
        .then((r) => r.json())
        .then((j) => (typeof j.count === 'number' ? j.count : 0))
        .catch(() => 0);
    };
    (async () => {
      const hits = await Promise.all(
        ECA_LAYERS.map(async ([name, service, layer]) => {
          const [at, near] = await Promise.all([count(service, layer), count(service, layer, 60)]);
          return { name, atPoint: at > 0, near: near > 0 } as EcaHit;
        }),
      );
      if (!cancelled) setEca(hits.filter((h) => h.atPoint || h.near));
    })();
    return () => {
      cancelled = true;
    };
  }, [detail.lat, detail.lng]);

  const openCases = cases?.filter((c) => c.open) || [];
  const ecaAt = eca?.filter((e) => e.atPoint) || [];
  const ecaNear = eca?.filter((e) => !e.atPoint && e.near) || [];

  return (
    <section className="card prop-section">
      <h3 className="prop-h">Due diligence</h3>

      <ul className="prop-flags">
        {/* open code cases */}
        <li className={openCases.length ? 'bad' : 'ok'}>
          <span className="prop-flag-ico">{openCases.length ? '⚠' : '✓'}</span>
          <div>
            {cases == null ? (
              <span className="muted">Checking open code cases…</span>
            ) : openCases.length ? (
              <>
                <strong>{openCases.length} open code case{openCases.length === 1 ? '' : 's'}.</strong>{' '}
                {openCases
                  .slice(0, 3)
                  .map((c) => c.type)
                  .join(', ')}
                {openCases.length > 3 ? ', …' : ''}
              </>
            ) : (
              <>No open code cases on file.</>
            )}
          </div>
        </li>

        {/* ECA */}
        <li className={ecaAt.length ? 'bad' : ecaNear.length ? 'warn' : 'ok'}>
          <span className="prop-flag-ico">{ecaAt.length ? '⚠' : ecaNear.length ? '•' : '✓'}</span>
          <div>
            {eca == null ? (
              <span className="muted">Checking environmentally critical areas…</span>
            ) : ecaAt.length ? (
              <>
                <strong>Environmentally critical area on the parcel:</strong> {ecaAt.map((e) => e.name).join(', ')}.
                This can add geotech, drainage, or tree review and limit buildable area.
              </>
            ) : ecaNear.length ? (
              <>
                <strong>ECA nearby (within ~60 m):</strong> {ecaNear.map((e) => e.name).join(', ')}. May still trigger
                review.
              </>
            ) : (
              <>No mapped environmentally critical areas here.</>
            )}
          </div>
        </li>

        {/* unbuildable */}
        {detail.unbuildable ? (
          <li className="bad">
            <span className="prop-flag-ico">⚠</span>
            <div>
              <strong>Assessor flags this parcel unbuildable.</strong> Often an access, easement, or critical-area
              issue — confirm before assuming development potential.
            </div>
          </li>
        ) : null}

        {/* rental registration */}
        <li className={rental && rental !== 'none' ? 'info' : 'ok'}>
          <span className="prop-flag-ico">{rental && rental !== 'none' ? 'ℹ' : '✓'}</span>
          <div>
            {rental == null ? (
              <span className="muted">Checking the rental registry…</span>
            ) : rental === 'none' ? (
              <>Not in the city&rsquo;s rental registry (RRIO) — consistent with an owner-occupied home.</>
            ) : (
              <>
                <strong>Registered rental (RRIO):</strong> {titleCase(rental.status)}
                {rental.units ? `, ${rental.units} unit${rental.units === 1 ? '' : 's'}` : ''}.
              </>
            )}
          </div>
        </li>

        {/* age / condition */}
        {detail.cond != null && detail.cond <= 2 ? (
          <li className="warn">
            <span className="prop-flag-ico">•</span>
            <div>
              <strong>Condition rated {detail.condName}.</strong> The assessor rates the structure below average —
              budget for deferred maintenance and inspection.
            </div>
          </li>
        ) : null}
        {detail.yr && detail.yr < 1940 ? (
          <li className="info">
            <span className="prop-flag-ico">ℹ</span>
            <div>
              <strong>Built {detail.yr}.</strong> Pre-war homes commonly carry knob-and-tube wiring, oil tanks, lead,
              or asbestos — worth a targeted inspection.
            </div>
          </li>
        ) : null}
      </ul>

      {cases && cases.length ? (
        <details className="prop-cases">
          <summary>{cases.length} code case{cases.length === 1 ? '' : 's'} on record</summary>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Opened</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.num}>
                    <td>{(c.opened || '').slice(0, 10) || '—'}</td>
                    <td>
                      {c.type}
                      {c.link ? (
                        <>
                          {' '}
                          <a href={c.link} target="_blank" rel="noopener noreferrer" className="muted">
                            ↗
                          </a>
                        </>
                      ) : null}
                    </td>
                    <td className={c.open ? 'esc' : ''}>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}

/* -------- records & links -------- */

function Records({ detail, sales }: { detail: Detail; sales: Sale[] }) {
  const pin = detail.pin;
  const links: Array<[string, string, string]> = [
    [
      'King County Assessor — eReal Property',
      `https://blue.kingcounty.com/Assessor/eRealProperty/Detail.aspx?ParcelNbr=${pin}`,
      'Official assessment, characteristics, and history',
    ],
    [
      'King County Parcel Viewer',
      `https://gismaps.kingcounty.gov/parcelviewer2/?pin=${pin}`,
      'Boundaries, dimensions, and map layers',
    ],
    [
      'King County Recorder — document search',
      'https://recordsearch.kingcounty.gov/LandmarkWeb',
      'Deeds, mortgages, easements, liens (search by name or recording #)',
    ],
    [
      'SDCI parcel & permit data',
      'https://cosgisweb.seattle.gov/DPDApps/SDCIParcelData/parceldata.aspx',
      'Zoning, overlays, and the full permit file',
    ],
    [
      'King County property tax & sales',
      `https://payments.kingcounty.gov/ptreal/RealProperty?parcelNbr=${pin}`,
      'Tax history, levy detail, payment status',
    ],
  ];
  const recs = sales.filter((s) => s.rec).slice(0, 3);

  return (
    <section className="card prop-section">
      <h3 className="prop-h">Records &amp; official sources</h3>
      <ul className="prop-links">
        {links.map(([label, href, sub]) => (
          <li key={href}>
            <a href={href} target="_blank" rel="noopener noreferrer">
              {label} ↗
            </a>
            <span className="prop-links-sub">{sub}</span>
          </li>
        ))}
      </ul>
      {recs.length ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Recording numbers from recorded sales — look these up at the Recorder&rsquo;s Office:{' '}
          {recs.map((s) => s.rec).join(', ')}.
        </p>
      ) : null}
    </section>
  );
}
