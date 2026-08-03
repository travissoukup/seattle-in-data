import Link from 'next/link';
import data from '@/lib/generated/capacity.json';
import { STANDARDS, UNRESOLVED, FINDINGS, EFFECTIVE_CODE } from '@/lib/capacity-standards';
import { fmtInt } from '@/lib/format';
import { ScenarioEngine } from './ScenarioEngine';
import { PreparedBar } from './PreparedBar';
import './capacity.css';

// Personal analysis artifact. Unlisted: not in the catalog or sitemap, noindex.
export const metadata = {
  title: 'Development capacity: 3066 63rd Ave SW',
  description: 'A computed development-capacity analysis for one West Seattle parcel, with citations.',
  robots: { index: false, follow: false },
};

const STACKED_CAP = Math.round(data.parcel.lotSf * 1.5);
const UNDERBUILT_PCT = Math.round((1 - data.building.sqft / STACKED_CAP) * 100);

export default function CapacityPage() {
  const ecaHits = data.eca.filter((e) => e.atPoint);
  const ecaClear = data.eca.filter((e) => !e.atPoint);
  const lastSale = data.sales[data.sales.length - 1];

  return (
    <>
      <p className="crumb no-print">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> Capacity analysis
      </p>

      <div className="page-head">
        <p className="eyebrow">Development capacity, computed</p>
        <h1>
          3066 63rd Ave SW is {UNDERBUILT_PCT}% underbuilt. Here is the math.
        </h1>
        <p>
          A {fmtInt(data.building.sqft)} sf house from {data.building.yrBuilt} stands on a lot where current code
          allows {fmtInt(STACKED_CAP)} sf of stacked flats with no unit cap. Every number on this page is computed
          from the current Seattle Municipal Code, King County assessor records, city GIS layers, and 1.4 million
          permit fee records, with the citation next to it. Where a fact needs SDCI confirmation, it says so.
        </p>
        <div className="cap-chips">
          <span className="cap-chip">Zone {data.parcel.zone}</span>
          <span className="cap-chip">MHA fee area: Medium</span>
          <span className="cap-chip warn">ECA: liquefaction prone</span>
          <span className="cap-chip">Not in frequent transit area</span>
          <span className="cap-chip good">No unit cap (density limit repealed Jan 2026)</span>
        </div>
      </div>

      <PreparedBar />

      <div className="cap-hero">
        <div className="stat-card">
          <div className="label">Standing today</div>
          <div className="value">{fmtInt(data.building.sqft)} sf</div>
          <div className="sub">{data.building.units} unit, built {data.building.yrBuilt}, condition Poor (2/5)</div>
        </div>
        <div className="stat-card">
          <div className="label">Allowed, attached units (FAR 1.3)</div>
          <div className="value">{fmtInt(Math.round(data.parcel.lotSf * 1.3))} sf</div>
          <div className="sub">+ {fmtInt(data.building.sqft)} sf exempt if the 1917 house stays</div>
        </div>
        <div className="stat-card">
          <div className="label">Allowed, stacked flats (FAR 1.5)</div>
          <div className="value">{fmtInt(STACKED_CAP)} sf</div>
          <div className="sub">32 ft height, zero parking below 1,200 sf units</div>
        </div>
        <div className="stat-card">
          <div className="label">County assessed ({data.values.billYr})</div>
          <div className="value">${(data.values.land / 1000).toFixed(0)}K</div>
          <div className="sub">
            land; the house is assessed at ${fmtInt(data.values.imps)}. Last sold {lastSale?.date.slice(-4)} for $
            {fmtInt(lastSale?.price ?? 0)}.
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">What the county and city actually know about this parcel</h2>
        <table className="data">
          <tbody>
            <tr><td className="txt">Parcel / lot</td><td>PIN {data.pin} &middot; {fmtInt(data.parcel.lotSf)} sf &middot; buildable per county ({data.parcel.unbuildable === 'False' ? 'no unbuildable flag' : 'flagged'})</td></tr>
            <tr><td className="txt">Existing building</td><td>{fmtInt(data.building.sqft)} sf, {data.building.beds} bed / {data.building.bathsFull} bath, built {data.building.yrBuilt}, grade {data.building.grade} (Fair), condition {data.building.condition} (Poor)</td></tr>
            <tr><td className="txt">Assessed value</td><td>${fmtInt(data.values.land)} land + ${fmtInt(data.values.imps)} improvements ({data.values.billYr}): the county itself prices the structure at scrap</td></tr>
            <tr><td className="txt">Sale history</td><td>{data.sales.map((s) => `${s.date} for $${s.price.toLocaleString('en-US')}`).join('; ')} (27 years held)</td></tr>
            <tr><td className="txt">Code enforcement</td><td>One open case, escalated status (SDCI complaint records)</td></tr>
            <tr><td className="txt">Zoning (city GIS)</td><td>{data.zoningGis.ZONING}, MHA {data.zoningGis.MHA}, no overlay, no shoreline district</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="section-title">The environmental check, actually run</h2>
        <p className="desc">
          Ten city ECA layers queried at the parcel point and within 60 meters, {new Date(data.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
        </p>
        <table className="data">
          <tbody>
            {ecaHits.map((e) => (
              <tr key={e.name} style={{ fontWeight: 700 }}>
                <td className="txt">{e.name}</td>
                <td>YES, at the parcel. Geotechnical study and foundation design required at permitting (SMC 25.09); no reduction in allowed units or floor area. Median geotech review fee on real permits: ${fmtInt(data.fees.geotechReview.median)} (90th percentile ${fmtInt(data.fees.geotechReview.p90)}).</td>
              </tr>
            ))}
            <tr>
              <td className="txt">All other layers</td>
              <td>Clear at the parcel and within 60 m: {ecaClear.map((e) => e.name.toLowerCase()).join(', ')}</td>
            </tr>
            <tr>
              <td className="txt">Transit status</td>
              <td>Outside the frequent transit service area and outside every HB 1110 major-transit half mile. Under current code this barely matters: units under 1,200 sf need no parking anywhere in the city.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="section-title">The standards, with citations</h2>
        <p className="desc">{EFFECTIVE_CODE}. Confidence &quot;high&quot; means the value was read in the current code text this week, not remembered.</p>
        <div className="table-wrap">
          <table className="data findings-table">
            <thead>
              <tr><th className="txt">Standard</th><th className="txt wrap">Value here</th><th className="txt wrap">Plain English</th><th className="txt">Citation</th></tr>
            </thead>
            <tbody>
              {STANDARDS.map((s) => (
                <tr key={s.name}>
                  <td className="txt" style={{ fontWeight: 600 }}>{s.name}</td>
                  <td className="txt wrap">{s.value}</td>
                  <td className="txt wrap muted">{s.plain}</td>
                  <td className="txt" style={{ fontSize: 12 }}>{s.citation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="page-head" style={{ marginTop: 26 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>Five ways to build it, priced</h2>
        <p className="desc">
          Yield first, then dollars. Exit prices come from {data.comps.n} actual sales of new construction in this ZIP
          since 2024; permit costs come from the fees {fmtInt(data.fees.newBuild24Units.n)} comparable projects
          actually paid.
        </p>
      </div>

      <ScenarioEngine />

      <div className="card">
        <h2 className="section-title">What the Underbuilt report said, next to what is true</h2>
        <p className="desc">Their August 2026 report on this exact parcel, line by line.</p>
        <div className="table-wrap">
          <table className="data findings-table">
            <thead>
              <tr><th className="txt wrap">The report</th><th className="txt wrap">Computed reality</th><th className="txt">Citation</th></tr>
            </thead>
            <tbody>
              {FINDINGS.map((f) => (
                <tr key={f.claim.slice(0, 24)}>
                  <td className="txt wrap muted">{f.claim}</td>
                  <td className="txt wrap">{f.reality}</td>
                  <td className="txt" style={{ fontSize: 12 }}>{f.citation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">What still needs SDCI</h2>
        <ul className="notes-list">
          {UNRESOLVED.map((u) => <li key={u.slice(0, 24)}>{u}</li>)}
        </ul>
      </div>

      <div className="caveat">
        <strong>What this is.</strong> A feasibility-grade screening analysis built from public records: the current
        municipal code, county assessor extracts, city GIS layers, recorded sales, and a records-request extract of
        1.4 million SDCI fee invoices. It is not legal advice, not an appraisal, and not a substitute for a
        pre-application conference. The code cited took effect January 21, 2026 and Seattle is still adjusting it;
        verify every load-bearing number with SDCI before money moves.
      </div>

      <div className="print-footer print-only">
        Sources: SMC Title 23 (Municode, July 2026); Ord. 127376 (CB 120993); King County Assessor extracts; Seattle
        GIS (zoning, ECA, transit layers); SDCI MHA payment tables; recorded sales through mid 2026; SDCI fee invoice
        extract (public records request, 2020 to June 2026). Generated {new Date(data.generatedAt).toLocaleDateString('en-US')}.
      </div>
    </>
  );
}
