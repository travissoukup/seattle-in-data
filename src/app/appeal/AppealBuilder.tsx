'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findComps, analyseComps, type CompParcel, type CompAnalysis } from '@/lib/appeal/comps';
import { buildGrounds, splitOpinion, type Ground } from '@/lib/appeal/grounds';
import { BOE, DEADLINE_RULE, STEPS, BARRED_ARGUMENTS, RELIEF, DENIAL_APPEAL_NOTE } from '@/lib/appeal/process';

const SOCRATA = 'https://data.seattle.gov/resource';
const GIS = 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services';
const KC_GIS = 'https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services';
const ADU = `${GIS}/ADUniverse_feasibility_factors/FeatureServer/0/query`;

const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const norm = (s: string) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim().replace(/ \d{5}(-\d{4})?$/, '');
const basisDenom = (p: { sqft: number; lot: number }, basis: 'building' | 'land') => (basis === 'land' ? p.lot : p.sqft);
const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase());

interface IndexRow { a: string; p: string; z: string }
interface Detail extends CompParcel {
  zip: string; gradeName: string | null; condName: string | null; billYr: number;
}
interface AppealRec { n: string; y: string; t: string; r: string; won: number | null; from?: number; to?: number; cut?: number }
interface AppealsFile { parcels: Record<string, AppealRec[]>; years: Array<{ year: number; decided: number; reduced: number; pending: number; pct: number }>; totalLocalAppeals: number }

export function AppealBuilder() {
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState<IndexRow[] | null>(null);
  const [matches, setMatches] = useState<IndexRow[]>([]);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [universe, setUniverse] = useState<CompParcel[]>([]);
  const [appeals, setAppeals] = useState<AppealsFile | null>(null);
  const [openCases, setOpenCases] = useState(0);
  const [permitCount, setPermitCount] = useState(0);
  const [steepPct, setSteepPct] = useState<number | undefined>();
  const [ecaFlags, setEcaFlags] = useState<string[]>([]);
  const [slide, setSlide] = useState<{ address: string; date: string; status: string } | null>(null);

  const shard = useRef<Map<string, Record<string, Detail>>>(new Map());

  const ensureIndex = useCallback(async () => {
    if (idx) return idx;
    const r = await fetch('/property/index.json');
    const rows: IndexRow[] = await r.json();
    setIdx(rows);
    return rows;
  }, [idx]);

  useEffect(() => {
    fetch('/property/appeals.json').then((r) => (r.ok ? r.json() : null)).then(setAppeals).catch(() => {});
  }, []);

  useEffect(() => {
    const q = norm(query);
    if (q.length < 3 || !idx) { setMatches([]); return; }
    const starts: IndexRow[] = [];
    for (let i = 0; i < idx.length && starts.length < 10; i++) if (idx[i].a.startsWith(q)) starts.push(idx[i]);
    setMatches(starts); setHighlight(0);
  }, [query, idx]);

  const load = useCallback(async (pin: string, zip: string) => {
    setLoading(true);
    try {
      let s = shard.current.get(zip);
      if (!s) {
        const r = await fetch(`/property/z-${zip}.json`);
        s = (await r.json()) as Record<string, Detail>;
        shard.current.set(zip, s);
      }
      const d = s[pin];
      if (!d) throw new Error('not found');
      setDetail(d);
      setUniverse(Object.values(s));

      const addr = norm(d.addr).replace(/'/g, "''");
      // live: open code cases, permit count
      fetch(`${SOCRATA}/ez4a-iug7.json?$where=${encodeURIComponent(`upper(originaladdress1)='${addr}'`)}&$select=statuscurrent&$limit=100`)
        .then((r) => r.json())
        .then((rows: { statuscurrent?: string }[]) =>
          setOpenCases(rows.filter((r) => r.statuscurrent && !/clos|complet|resolved|withdrawn|void|cancel|no violation|expired/i.test(r.statuscurrent)).length))
        .catch(() => {});
      fetch(`${SOCRATA}/76t5-zqzr.json?$where=${encodeURIComponent(`upper(originaladdress1)='${addr}'`)}&$select=permitnum&$limit=200`)
        .then((r) => r.json()).then((rows: unknown[]) => setPermitCount(rows.length)).catch(() => {});

      // city feasibility snapshot: steep slope share of the lot
      fetch(`${ADU}?where=${encodeURIComponent(`KCGIS_CGDB_PARCEL_SV_PIN='${pin}'`)}&outFields=STEEPSLOPE_PC,KNOWNSLIDE,POTENTIALSLIDE,LIQUEFACTION&returnGeometry=false&f=json`)
        .then((r) => r.json())
        .then((j) => {
          const a = j.features?.[0]?.attributes;
          if (!a) return;
          if (typeof a.STEEPSLOPE_PC === 'number') setSteepPct(a.STEEPSLOPE_PC);
          const f: string[] = [];
          if (a.KNOWNSLIDE === 1) f.push('known landslide area');
          if (a.POTENTIALSLIDE === 1) f.push('potential slide area');
          if (a.LIQUEFACTION === 1) f.push('liquefaction prone');
          setEcaFlags(f);
        })
        .catch(() => {});

      // documented landslide incidents nearby
      fetch(`${KC_GIS}/Seattle_LandslideDocumentationPoint_view/FeatureServer/0/query?geometry=${d.lng},${d.lat}&geometryType=esriGeometryPoint&inSR=4326&distance=1500&units=esriSRUnit_Foot&spatialRel=esriSpatialRelIntersects&outFields=Address,OccurredDateTime,LandslideStatus,CityInvolvement&returnGeometry=false&f=json`)
        .then((r) => r.json())
        .then((j) => {
          const fs = j.features || [];
          if (!fs.length) return;
          const best = fs.sort((a: { attributes: { OccurredDateTime?: number } }, b: { attributes: { OccurredDateTime?: number } }) => (b.attributes.OccurredDateTime || 0) - (a.attributes.OccurredDateTime || 0))[0].attributes;
          setSlide({
            address: best.Address || 'nearby',
            date: best.OccurredDateTime ? new Date(best.OccurredDateTime).toISOString().slice(0, 10) : 'undated',
            status: best.CityInvolvement || best.LandslideStatus || 'recorded',
          });
        })
        .catch(() => {});

      const u = new URL(window.location.href);
      u.searchParams.set('p', pin); u.searchParams.set('z', zip);
      window.history.replaceState(null, '', u.toString());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const u = new URL(window.location.href);
    const p = u.searchParams.get('p'); const z = u.searchParams.get('z');
    if (p && z) { ensureIndex().then(() => load(p, z)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assessmentYear = detail?.billYr || new Date().getFullYear();
  const analysis: CompAnalysis | null = useMemo(() => {
    if (!detail || !universe.length) return null;
    const comps = findComps(detail, universe, { assessmentYear, lookbackYears: 3, maxDistanceMi: 0.75, maxComps: 8 });
    return analyseComps(detail, comps);
  }, [detail, universe, assessmentYear]);

  const grounds: Ground[] = useMemo(() => {
    if (!detail) return [];
    return buildGrounds({
      sqft: detail.sqft, beds: detail.beds, baths: detail.baths, yr: detail.yr,
      grade: detail.grade, gradeName: detail.gradeName, cond: detail.cond, condName: detail.condName,
      lot: detail.lot, land: detail.land, imps: detail.imps,
      openCodeCases: openCases, ecaFlags, steepSlopePct: steepPct,
      permitCount, nearbyLandslide: slide,
    });
  }, [detail, openCases, ecaFlags, steepPct, permitCount, slide]);

  const priorAppeals = detail && appeals ? appeals.parcels[detail.pin] || [] : [];
  const recent = appeals?.years.filter((y) => y.decided > 500).slice(0, 4) || [];

  return (
    <div className="prop">
      <div className="prop-search no-print">
        <input
          className="prop-input" type="text" placeholder="Start typing your address, e.g. 4810 54th Ave SW"
          value={query} onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setFocused(true); if (!idx) ensureIndex(); }}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (!matches.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); const m = matches[highlight]; setQuery(m.a); setMatches([]); load(m.p, m.z); }
          }}
          autoComplete="off" spellCheck={false}
        />
        {focused && matches.length ? (
          <ul className="prop-ac">
            {matches.map((m, i) => (
              <li key={m.p} className={i === highlight ? 'on' : ''}
                  onMouseDown={(e) => { e.preventDefault(); setQuery(m.a); setMatches([]); load(m.p, m.z); }}
                  onMouseEnter={() => setHighlight(i)}>
                <span className="prop-ac-addr">{title(m.a)}</span><span className="prop-ac-zip">{m.z}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {loading ? <p className="muted">Pulling your assessment and the sales around you…</p> : null}
      {!detail && !loading ? <Intro years={recent} total={appeals?.totalLocalAppeals} /> : null}

      {detail && analysis ? (
        <Report
          detail={detail} analysis={analysis} grounds={grounds}
          priorAppeals={priorAppeals} years={recent} assessmentYear={assessmentYear}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ intro */

function Intro({ years, total }: { years: Array<{ year: number; decided: number; pct: number }>; total?: number }) {
  return (
    <div className="prop-empty no-print">
      <div className="prop-empty-grid">
        {[
          ['📊', 'Comparable sales', 'The assessor values by computer model. This finds the arm\'s-length sales nearest your house and works out what they imply.'],
          ['🔎', 'Grounds that apply', 'Record errors, condition, and physical constraints on the land — assembled from your permits, code cases and the city\'s critical-areas maps.'],
          ['📝', 'A filled-in opinion of value', 'The petition is rejected without one. This produces a defensible number split into land and improvements.'],
          ['📮', 'How to file', 'Your deadline, the form, where it goes, and what the Board will and will not consider.'],
        ].map(([e, t, b]) => (
          <div className="prop-empty-card" key={t}>
            <span className="prop-empty-ico" aria-hidden>{e}</span>
            <h3>{t}</h3><p>{b}</p>
          </div>
        ))}
      </div>
      {years.length ? (
        <p className="muted prop-empty-note">
          Across {total ? `${n0(total)} ` : ''}King County local appeals, recent outcomes run:{' '}
          {years.map((y) => `${y.year} — ${y.pct}% of ${n0(y.decided)} decided appeals reduced`).join('; ')}. Filing
          is free. This tool is not legal advice and does not file anything for you.
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- report */

function Report({
  detail, analysis, grounds, priorAppeals, years, assessmentYear,
}: {
  detail: Detail; analysis: CompAnalysis; grounds: Ground[];
  priorAppeals: AppealRec[]; years: Array<{ year: number; decided: number; pct: number }>; assessmentYear: number;
}) {
  const assessed = detail.land + detail.imps;
  const target = analysis.verdict === 'over' ? analysis.indicatedValue : assessed;
  const split = splitOpinion(target, detail.land, detail.imps);

  const verdictHead: Record<CompAnalysis['verdict'], string> = {
    over: 'The sales nearby suggest you are over-assessed',
    fair: 'The sales nearby suggest your assessment is about right',
    under: 'The sales nearby suggest you are assessed below market',
    insufficient: 'Not enough matched sales to argue value',
  };

  return (
    <div className="prop-report">
      <section className="prop-hero">
        <div className="prop-hero-top">
          <div>
            <h2 className="prop-addr">{title(detail.addr)}</h2>
            <p className="prop-addr-sub">Parcel {detail.pin} · {assessmentYear} assessment</p>
          </div>
          <button className="prop-print-btn no-print" onClick={() => window.print()}>Save / print packet</button>
        </div>
        <div className="prop-hero-stats">
          <div className="prop-hstat"><div className="prop-hstat-v">{money(assessed)}</div><div className="prop-hstat-l">Assessed</div><div className="prop-hstat-s">Land {money(detail.land)} · Bldg {money(detail.imps)}</div></div>
          <div className="prop-hstat"><div className="prop-hstat-v">{analysis.indicatedValue ? money(analysis.indicatedValue) : '—'}</div><div className="prop-hstat-l">Comps indicate</div><div className="prop-hstat-s">{analysis.comps.length} sales considered</div></div>
          <div className={`prop-hstat${analysis.verdict === 'over' ? ' accent' : ''}`}><div className="prop-hstat-v">{analysis.gap > 0 ? money(analysis.gap) : '—'}</div><div className="prop-hstat-l">Possible over-assessment</div><div className="prop-hstat-s">{analysis.gapPct ? `${Math.round(analysis.gapPct)}%` : ''}</div></div>
          <div className="prop-hstat"><div className="prop-hstat-v">{detail.sqft ? `${n0(detail.sqft)} sf` : '—'}</div><div className="prop-hstat-l">Living area on record</div><div className="prop-hstat-s">{detail.beds} bd · {detail.baths} ba · {detail.yr}</div></div>
          <div className="prop-hstat"><div className="prop-hstat-v">{priorAppeals.length}</div><div className="prop-hstat-l">Past appeals here</div><div className="prop-hstat-s">{priorAppeals.length ? priorAppeals[0].y : 'never appealed'}</div></div>
        </div>
      </section>

      <div className={`ap-verdict ${analysis.verdict}`}>
        <h3>{verdictHead[analysis.verdict]}</h3>
        <p>{analysis.summary}</p>
        {analysis.verdict === 'over' ? (
          <div className="ap-nums">
            <div className="ap-num"><div className="ap-num-v">{money(split.land)}</div><div className="ap-num-l">Opinion of value — land</div></div>
            <div className="ap-num"><div className="ap-num-v">{money(split.imps)}</div><div className="ap-num-l">Opinion of value — improvements</div></div>
            <div className="ap-num"><div className="ap-num-v">{money(split.land + split.imps)}</div><div className="ap-num-l">Total for the petition</div></div>
          </div>
        ) : null}
      </div>

      {analysis.verdict === 'under' ? (
        <div className="ap-warn">
          <strong>Do not file a value appeal on this property.</strong> The Board can raise a value as well as lower
          it. The comparable sales here point above your current assessment, so a value appeal would work against
          you. The record-accuracy grounds below may still be worth pursuing with the Assessor directly.
        </div>
      ) : null}

      <div className="prop-cols">
        <div className="prop-col-main">
          <Comps analysis={analysis} detail={detail} />
          <Grounds grounds={grounds} />
        </div>
        <div className="prop-col-side">
          <HowToFile />
          <PriorAppeals appeals={priorAppeals} years={years} />
          <ReliefCard />
        </div>
      </div>

      <p className="prop-disclaimer">
        Assembled from King County Assessor records, City of Seattle permit and critical-areas data. This is a
        research aid, not legal, tax, or appraisal advice, and it does not file anything on your behalf. Assessed
        values, comparable sales and the grounds above should be checked against the assessor&rsquo;s own record
        before you submit. Confirm your filing deadline on the county&rsquo;s lookup — it is specific to your parcel.
      </p>
    </div>
  );
}

function Comps({ analysis, detail }: { analysis: CompAnalysis; detail: Detail }) {
  const shown = analysis.comps.slice(0, 3);
  return (
    <section className="card prop-section">
      <h3 className="prop-h">Your three strongest comparable sales</h3>
      <p className="prop-lead">
        King County&rsquo;s petition worksheet has room for three. These are the closest arm&rsquo;s-length sales
        by {analysis.basis === 'land' ? 'lot size, location and date' : 'living area, lot, age, construction grade, condition and distance'};
        non-market transfers such as estate and family sales are excluded, as the Board would exclude them.
      </p>
      {analysis.basis === 'land' ? (
        <div className="ap-warn" style={{ marginTop: 0 }}>
          <strong>This property is valued on its land.</strong> The assessor puts {Math.round((detail.land / (detail.land + detail.imps)) * 100)} percent
          of the value in the land and almost none in the building, so comparing price per square foot of living
          area would be meaningless. The comparison below is per square foot of <em>lot</em>, against other
          land-dominated sales{detail.waterfront ? ', waterfront to waterfront' : ''}. Land comps are genuinely
          harder to argue than house comps, and an appraiser is worth the money on a property like this.
        </div>
      ) : null}
      {shown.length === 0 ? <p className="muted">No sufficiently similar sales were found nearby.</p> : null}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Address</th><th className="num">Sold</th><th className="num">Price</th><th className="num">{analysis.basis === 'land' ? 'Lot sf' : 'Living sf'}</th><th className="num">$/sf</th><th className="num">Miles</th><th className="num">Match</th></tr>
          </thead>
          <tbody>
            <tr className="fee-ours">
              <td><strong>{title(detail.addr)}</strong><span className="fee-cite">your property</span></td>
              <td className="num">—</td>
              <td className="num">{money(detail.land + detail.imps)}<span className="fee-cite">assessed</span></td>
              <td className="num">{n0(basisDenom(detail, analysis.basis))}</td>
              <td className="num">${Math.round((detail.land + detail.imps) / (basisDenom(detail, analysis.basis) || 1))}</td>
              <td className="num">—</td><td className="num">—</td>
            </tr>
            {shown.map((c) => (
              <tr key={c.parcel.pin}>
                <td>{title(c.parcel.addr)}<span className="fee-cite">{c.why.slice(0, 2).join(' · ')}</span></td>
                <td className="num">{c.saleYear}</td>
                <td className="num">{money(c.sale.price)}</td>
                <td className="num">{n0(basisDenom(c.parcel, analysis.basis))}</td>
                <td className="num">${Math.round(c.pricePerSqFt)}</td>
                <td className="num">{c.distanceMi.toFixed(2)}</td>
                <td className="num">{c.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {analysis.medianPricePerSqFt ? (
        <p className="fee-note">
          Median across the matched sales: <strong>${Math.round(analysis.medianPricePerSqFt)} per square foot
          of {analysis.basis === 'land' ? 'lot' : 'living area'}</strong>, which on{' '}
          {n0(basisDenom(detail, analysis.basis))} square feet indicates <strong>{money(analysis.indicatedValue)}</strong>.
          Your assessment works out to ${Math.round((detail.land + detail.imps) / (basisDenom(detail, analysis.basis) || 1))} per square foot
          on the same basis.
        </p>
      ) : null}
    </section>
  );
}

function Grounds({ grounds }: { grounds: Ground[] }) {
  return (
    <section className="card prop-section">
      <h3 className="prop-h">Grounds that apply to this property</h3>
      <p className="prop-lead">
        Ranked by how much weight the Board tends to give them. Record errors are the easiest to win because they
        are documentary rather than a matter of opinion.
      </p>
      {grounds.map((g) => (
        <div key={g.key} className={`ap-ground ${g.strength}`}>
          <h4>{g.heading}<span className="ap-tag">{g.strength}</span></h4>
          <p>{g.finding}</p>
          <div className="ap-eyebrow">What to attach</div>
          <p className="ap-ev">{g.evidence}</p>
          {g.cite ? <span className="ap-cite">{g.cite}</span> : null}
        </div>
      ))}
    </section>
  );
}

function HowToFile() {
  return (
    <section className="card prop-section">
      <h3 className="prop-h">How to file</h3>
      <div className="ap-warn">
        <strong>{DEADLINE_RULE.title}.</strong>
        <p style={{ margin: '.4rem 0 0', fontSize: '.9rem', lineHeight: 1.55 }}>{DEADLINE_RULE.body}</p>
        <p style={{ margin: '.5rem 0 0' }}>
          <a href={BOE.deadlineLookupUrl} target="_blank" rel="noopener noreferrer"><strong>Look up your parcel&rsquo;s deadline ↗</strong></a>
        </p>
        <span className="ap-cite">{DEADLINE_RULE.cite}</span>
      </div>

      <ol className="ap-steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <h4>{s.title}</h4>
            <p>{s.body}</p>
            {s.cite ? <span className="ap-cite">{s.cite}</span> : null}
          </li>
        ))}
      </ol>

      <div className="ap-eyebrow">Arguments the Board cannot consider</div>
      <ul className="ap-barred">{BARRED_ARGUMENTS.map((b) => <li key={b}>{b}</li>)}</ul>

      <div className="ap-eyebrow" style={{ marginTop: '.8rem' }}>Where it goes</div>
      <p style={{ fontSize: '.9rem', margin: '.2rem 0 0', lineHeight: 1.55 }}>
        <a href={BOE.formsUrl} target="_blank" rel="noopener noreferrer">Download the petition ↗</a>{' '}
        or file online through <a href={BOE.eAppealsUrl} target="_blank" rel="noopener noreferrer">eAppeals ↗</a>.<br />
        {BOE.name}, {BOE.address}<br />
        {BOE.phone} · {BOE.filingCost}<br />
        <span className="muted">Use paper clips rather than staples.</span>
      </p>
    </section>
  );
}

function PriorAppeals({ appeals, years }: { appeals: AppealRec[]; years: Array<{ year: number; decided: number; pct: number }> }) {
  return (
    <section className="card prop-section">
      <h3 className="prop-h">Appeal history</h3>
      {appeals.length === 0 ? (
        <p className="muted" style={{ fontSize: '.92rem' }}>No appeal has ever been filed on this parcel.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Year</th><th>Type</th><th>Outcome</th><th className="num">Change</th></tr></thead>
            <tbody>
              {appeals.slice(0, 8).map((a) => (
                <tr key={a.n}>
                  <td>{a.y}</td><td>{a.t}</td><td>{a.r}</td>
                  <td className="num">{a.cut ? `−${money(a.cut)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {years.length ? (
        <>
          <div className="ap-eyebrow" style={{ marginTop: '.8rem' }}>Countywide outcomes</div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Assessment year</th><th className="num">Decided</th><th className="num">Reduced</th></tr></thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year}><td>{y.year}</td><td className="num">{n0(y.decided)}</td><td className="num">{y.pct}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fee-note">
            Local appeals to the Board of Equalization, counting only those with a decided outcome. Recent years
            still have appeals pending, so these rates will move.
          </p>
        </>
      ) : null}
    </section>
  );
}

function ReliefCard() {
  return (
    <section className="card prop-section">
      <h3 className="prop-h">Relief you may qualify for instead</h3>
      <p className="prop-lead">
        For many owners an exemption is worth far more than winning an appeal, and it is the most commonly missed
        money in the property tax system.
      </p>
      {RELIEF.map((r) => (
        <div className="ap-relief" key={r.name}>
          <h4>{r.name}</h4>
          <dl>
            <dt>Who</dt><dd>{r.who}</dd>
            <dt>Worth</dt><dd>{r.worth}</dd>
            <dt>When</dt><dd>{r.deadline}</dd>
          </dl>
          {r.note ? <p className="ap-ev" style={{ marginTop: '.4rem' }}><strong>Note.</strong> {r.note}</p> : null}
          <span className="ap-cite">{r.cite}</span>
        </div>
      ))}
      <p className="fee-note">{DENIAL_APPEAL_NOTE}</p>
    </section>
  );
}
