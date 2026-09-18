'use client';

import { useEffect, useMemo, useState } from 'react';
import { FeeEstimator } from './FeeEstimator';
import { FeesPaidHere } from './FeesPaidHere';
import { ZoningStandards } from './ZoningStandards';
import { TotalProjectCost } from './TotalProjectCost';

const SOCRATA = 'https://data.seattle.gov/resource';
const GIS = 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services';

export interface DeepDiveDetail {
  addr: string;
  lat: number;
  lng: number;
  zone: string;
  zoneFamily: string;
  zoneUnits: number | null;
  zoneFar: number | null;
  mha: boolean;
  lot: number;
  sqft: number;
  units: number;
  yr: number | null;
  buildable: number;
  unbuildable: boolean;
}

interface AnyPermit {
  num: string;
  typ: string;
  desc: string;
  status: string;
  date: string | null;
  cost: number | null;
  units: number | null;
  link: string | null;
  source: string;
}

interface LiveZoning {
  zoning?: string; mha?: string; mhaValue?: string;
  overlay?: string; shoreline?: string; pedestrian?: string; urbanVillage?: string;
}

function normAddr(s: string) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim().replace(/ \d{5}(-\d{4})?$/, '').trim();
}
const fmtK = (v: number | null) => (v == null ? '—' : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);
const fmtNum = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US'));

const TABS = [
  { key: 'zoning', label: 'Zoning & standards' },
  { key: 'build', label: 'What you can build' },
  { key: 'permits', label: 'Permit history' },
  { key: 'estimate', label: 'Fee estimator' },
  { key: 'cost', label: 'Total project cost' },
  { key: 'paid', label: 'Fees charged here' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function DeepDive({ detail, ecaLikely }: { detail: DeepDiveDetail; ecaLikely: boolean }) {
  const [tab, setTab] = useState<TabKey>('zoning');
  const [feeTotal, setFeeTotal] = useState(0);
  const [permits, setPermits] = useState<AnyPermit[] | null>(null);
  const [zoning, setZoning] = useState<LiveZoning | null>(null);
  const addr = normAddr(detail.addr);

  // --- every permit type at this address ---
  useEffect(() => {
    let cancelled = false;
    setPermits(null);
    const where = `upper(originaladdress1)='${addr.replace(/'/g, "''")}'`;
    const get = (ds: string, src: string, sel: string, dateField: string) =>
      fetch(`${SOCRATA}/${ds}.json?$where=${encodeURIComponent(where)}&$select=${encodeURIComponent(sel)}&$limit=300`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Record<string, string>[]) =>
          rows.map((r): AnyPermit => ({
            num: r.permitnum || '',
            typ: r.permittypedesc || r.permittype || r.permitclassmapped || src,
            desc: r.description || '',
            status: r.statuscurrent || '',
            date: r[dateField] || r.issueddate || r.applieddate || null,
            cost: r.estprojectcost != null ? Number(r.estprojectcost) : null,
            units: r.housingunits != null ? Number(r.housingunits) : null,
            link: (r.link as unknown as { url?: string })?.url || null,
            source: src,
          })),
        )
        .catch(() => [] as AnyPermit[]);

    Promise.all([
      get('76t5-zqzr', 'Building', 'permitnum,permitclassmapped,permittypedesc,description,statuscurrent,issueddate,applieddate,estprojectcost,housingunits,link', 'issueddate'),
      get('ht3q-kdvx', 'Land use', 'permitnum,permitclassmapped,permittypedesc,description,statuscurrent,issueddate,applieddate,estprojectcost,link', 'issueddate'),
      get('c87v-5hwh', 'Trade', 'permitnum,permittype,description,statuscurrent,issueddate,applieddate,link', 'issueddate'),
      get('c4tj-daue', 'Electrical', 'permitnum,description,statuscurrent,issueddate,applieddate,link', 'issueddate'),
    ]).then((sets) => {
      if (cancelled) return;
      const all = sets.flat().sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
      setPermits(all);
    });
    return () => { cancelled = true; };
  }, [addr]);

  // --- live zoning attributes at the parcel point ---
  useEffect(() => {
    let cancelled = false;
    setZoning(null);
    if (detail.lat == null) return;
    const q = (svc: string, layer: number, fields: string) =>
      fetch(`${GIS}/${svc}/FeatureServer/${layer}/query?geometry=${detail.lng},${detail.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${fields}&returnGeometry=false&f=json`)
        .then((r) => r.json())
        .then((j) => (j.features && j.features[0] ? j.features[0].attributes : null))
        .catch(() => null);
    Promise.all([
      q('Current_Land_Use_Zoning_Detail_2', 0, 'ZONING,MHA,MHA_VALUE,OVERLAY,SHORELINE,PEDESTRIAN'),
      q('Urban_Villages_and_Centers', 0, 'UV_NAME'),
    ]).then(([z, uv]) => {
      if (cancelled) return;
      setZoning({
        zoning: z?.ZONING, mha: z?.MHA, mhaValue: z?.MHA_VALUE,
        overlay: z?.OVERLAY, shoreline: z?.SHORELINE, pedestrian: z?.PEDESTRIAN,
        urbanVillage: uv?.UV_NAME,
      });
    });
    return () => { cancelled = true; };
  }, [detail.lat, detail.lng]);

  const permitNums = useMemo(() => (permits || []).map((p) => p.num).filter(Boolean), [permits]);
  const declared = useMemo(() => (permits || []).reduce((s, p) => s + (p.cost || 0), 0), [permits]);

  return (
    <section className="card prop-section prop-deepdive">
      <h3 className="prop-h">Property deep dive</h3>
      <p className="prop-lead">
        Everything the public record holds on what this lot is, what the rules let you do with it, what has been
        permitted here before, and what it costs to get a permit.
      </p>

      <div className="dd-tabs no-print" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={`dd-tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === 'permits' && permits ? <span className="dd-count">{permits.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'zoning' ? <ZoningTab detail={detail} zoning={zoning} ecaLikely={ecaLikely} /> : null}
      {tab === 'build' ? <ZoningStandards detail={detail} ecaLikely={ecaLikely} liveZone={(zoning?.zoning || '').trim()} /> : null}
      {tab === 'permits' ? <PermitsTab permits={permits} declared={declared} /> : null}
      {tab === 'paid' ? <FeesPaidHere permitNumbers={permitNums} /> : null}
      {tab === 'cost' ? <TotalProjectCost sdciFees={feeTotal} mhaZone={detail.mha} /> : null}

      {/* Kept mounted so the project-cost tab always has a current fee figure. */}
      <div className="dd-pane" style={{ display: tab === 'estimate' ? 'block' : 'none' }}>
        <FeeEstimator zone={detail.zone} lot={detail.lot} ecaLikely={ecaLikely} onTotal={setFeeTotal} />
      </div>

    </section>
  );
}

/* ---------------- zoning tab ---------------- */

function ZoningTab({ detail, zoning, ecaLikely }: { detail: DeepDiveDetail; zoning: LiveZoning | null; ecaLikely: boolean }) {
  // The zoning service returns 'Y'/'N' flags and single-space strings for
  // "nothing mapped", so both need normalising before display.
  const clean = (v?: string) => {
    const t = (v || '').trim();
    return t.length ? t : '';
  };
  const yesNo = (v?: string) => {
    const t = clean(v).toUpperCase();
    if (t === 'Y' || t === 'YES') return true;
    if (t === 'N' || t === 'NO') return false;
    return null;
  };
  const mhaFlag = yesNo(zoning?.mha);
  const mhaApplies = mhaFlag === null ? detail.mha : mhaFlag;

  const rows: Array<[string, string, string?]> = [
    ['Zone', clean(zoning?.zoning) || detail.zone || '—', 'City of Seattle zoning map (live)'],
    ['Zone family', detail.zoneFamily || '—', 'Assessor classification'],
    ['Lot area', detail.lot ? `${fmtNum(detail.lot)} sq ft` : '—', 'King County Assessor'],
    ['Mandatory Housing Affordability', mhaApplies ? 'Applies' : 'Does not apply', 'MHA applies on redevelopment'],
    ['MHA payment tier', clean(zoning?.mhaValue) || 'Not applicable', 'Sets the per-sq-ft payment if you pay rather than perform'],
    ['Urban village', clean(zoning?.urbanVillage) || 'Not in an urban village', 'Affects density and parking rules'],
    ['Overlay', clean(zoning?.overlay) || 'None mapped', 'Design review and special district rules'],
    ['Shoreline', clean(zoning?.shoreline) || 'None mapped', 'Shoreline Master Program jurisdiction'],
    ['Pedestrian designation', clean(zoning?.pedestrian) || 'None', 'Street-level use requirements'],
    ['Critical areas', ecaLikely ? 'Mapped — see due diligence' : 'None mapped at this point', 'SMC 25.09 steep slope / landslide / wetland'],
  ];

  return (
    <div className="dd-pane">
      <h4 className="dd-head">Zoning and designations</h4>
      <p className="dd-sub">
        Pulled live from the City&rsquo;s zoning and overlay layers at this parcel, so it reflects the map as it
        stands today rather than a cached copy.
      </p>
      {zoning === null ? <p className="muted">Checking the city zoning layers…</p> : null}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Designation</th><th>Value</th><th>Why it matters</th></tr></thead>
          <tbody>
            {rows.map(([k, v, note]) => (
              <tr key={k}><td>{k}</td><td><strong>{v}</strong></td><td className="muted">{note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fee-note">
        Zoning tells you the category; the development standards in the next tab tell you the actual dimensions.
        On a lot with mapped critical areas those standards are not the binding constraint — the critical-areas
        rules are.
      </p>
    </div>
  );
}

/* ---------------- permits tab ---------------- */

function PermitsTab({ permits, declared }: { permits: AnyPermit[] | null; declared: number }) {
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('All');
  const sources = useMemo(
    () => ['All', ...Array.from(new Set((permits || []).map((p) => p.source)))],
    [permits],
  );
  const shown = useMemo(() => {
    let a = permits || [];
    if (src !== 'All') a = a.filter((p) => p.source === src);
    const t = q.trim().toLowerCase();
    if (t) a = a.filter((p) => `${p.num} ${p.typ} ${p.desc} ${p.status}`.toLowerCase().includes(t));
    return a;
  }, [permits, q, src]);

  return (
    <div className="dd-pane">
      <h4 className="dd-head">Every permit on file</h4>
      <p className="dd-sub">
        Building, land use, trade and electrical permits at this address, live from the City&rsquo;s open data.
        {declared > 0 ? ` Declared project value across all of them: ${fmtK(declared)}.` : ''}
      </p>

      {permits === null ? <p className="muted">Loading the permit record…</p> : null}
      {permits && permits.length === 0 ? <p className="muted">No permits on file at this address.</p> : null}

      {permits && permits.length > 0 ? (
        <>
          <div className="dd-filters no-print">
            <input
              className="dd-search" placeholder="Search descriptions, numbers, status…"
              value={q} onChange={(e) => setQ(e.target.value)}
            />
            <select value={src} onChange={(e) => setSrc(e.target.value)}>
              {sources.map((s) => <option key={s}>{s}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 13 }}>{shown.length} of {permits.length}</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Description</th><th>Status</th><th style={{ textAlign: 'right' }}>Value</th></tr>
              </thead>
              <tbody>
                {shown.map((p, i) => (
                  <tr key={`${p.num}-${i}`}>
                    <td className="mono">{p.date ? p.date.slice(0, 10) : '—'}</td>
                    <td>
                      {p.typ}
                      <span className="fee-cite">{p.source} · {p.num}</span>
                    </td>
                    <td>
                      {p.desc || '—'}
                      {p.link ? <> <a href={p.link} target="_blank" rel="noopener noreferrer" className="muted">↗</a></> : null}
                    </td>
                    <td>{p.status || '—'}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{p.cost ? fmtK(p.cost) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
