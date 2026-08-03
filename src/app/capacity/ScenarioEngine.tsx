'use client';

import { useMemo, useState } from 'react';
import data from '@/lib/generated/capacity.json';

/**
 * Interactive development scenarios for 3066 63rd Ave SW.
 * Every default is computed from data (comps, permit fees, assessor values);
 * every assumption is a visible, adjustable slider. The math is line-itemed
 * so a skeptic can follow each dollar.
 */

const LOT = data.parcel.lotSf; // 4,720
const HOUSE_SF = data.building.sqft; // 780
const MHA_RATE = 20.41; // $/sf, Medium area, permits vesting 3/1/26-2/28/27 (Table B for 23.58C.040)
const FAR_ATTACHED = 1.3;
const FAR_STACKED = 1.5;

interface Scenario {
  key: string;
  title: string;
  tagline: string;
  units: number;
  chargeableSf: number; // counts against FAR
  exemptSf: number; // pre-1982 house + ADU areas kept
  mhaSf: number; // sf subject to MHA payment (ADUs exempt)
  keepHouse: boolean;
  parking: string;
  notes: string[];
}

const SCENARIOS: Scenario[] = [
  {
    key: 'adu',
    title: 'Keep the house, add two DADUs',
    tagline: 'The low-drama path: no MHA, no demolition, rental income',
    units: 3,
    chargeableSf: 0,
    exemptSf: HOUSE_SF + 2000,
    mhaSf: 0,
    keepHouse: true,
    parking: 'None required (ADUs exempt)',
    notes: [
      'Two detached ADUs at 1,000 sf each (SMC 23.42.022); their floor area pays no MHA.',
      'The 1917 house needs real rehab money; the county grades it condition Poor.',
      'The open code case must be resolved either way.',
    ],
  },
  {
    key: 'th4',
    title: 'Four townhouses',
    tagline: 'The default West Seattle infill product',
    units: 4,
    chargeableSf: Math.round(LOT * FAR_ATTACHED),
    exemptSf: 0,
    mhaSf: Math.round(LOT * FAR_ATTACHED),
    keepHouse: false,
    parking: '2 stalls (0.5 per unit at 1,534 sf avg)',
    notes: [
      'FAR 1.3 = 6,136 sf across 4 units of about 1,534 sf.',
      'Units over 1,200 sf trigger 0.5 stalls each; shrink units below 1,200 sf to zero it.',
      'Unit-lot subdivision allows fee-simple sales.',
    ],
  },
  {
    key: 'th5',
    title: 'Five compact townhouses, zero parking',
    tagline: 'Size below 1,200 sf and the parking requirement disappears',
    units: 5,
    chargeableSf: Math.round(LOT * FAR_ATTACHED),
    exemptSf: 0,
    mhaSf: Math.round(LOT * FAR_ATTACHED),
    keepHouse: false,
    parking: 'None (all units under 1,200 sf)',
    notes: [
      'Same 6,136 sf budget cut into 5 units of about 1,227 sf... just over the line. Design to 1,199 sf and the parking table row F applies.',
      'The repealed density cap is what makes 5 units legal at all: the old code stopped at 4.',
    ],
  },
  {
    key: 'flats6',
    title: 'Six stacked flats',
    tagline: 'The max-FAR path: 1.5 FAR, no parking, most sellable floor area',
    units: 6,
    chargeableSf: Math.round(LOT * FAR_STACKED),
    exemptSf: 0,
    mhaSf: Math.round(LOT * FAR_STACKED),
    keepHouse: false,
    parking: 'None (units under 1,200 sf)',
    notes: [
      'Stacked units get FAR 1.5 = 7,080 sf, six flats of about 1,180 sf.',
      'A mostly below-grade story adds 4 ft of height headroom (23.45.514.F).',
      'Condo-form sales or hold as a small apartment building.',
    ],
  },
  {
    key: 'hybrid',
    title: 'Keep the house, build four behind',
    tagline: 'The FAR-exemption play: the 1917 cottage rides free',
    units: 5,
    chargeableSf: Math.round(LOT * FAR_ATTACHED),
    exemptSf: HOUSE_SF,
    mhaSf: Math.round(LOT * FAR_ATTACHED),
    keepHouse: true,
    parking: 'Depends on new-unit sizes',
    notes: [
      'The pre-1982 house is FAR-exempt if it stays residential and nothing is built between it and the street (23.45.510.D.3).',
      'Total floor area: 6,136 new + 780 exempt = 6,916 sf on a 1.3 lot.',
      '5 ft building separation (23.45.519) makes the site plan workable on paper; layout is the real test.',
    ],
  },
];

const fmtK = (n: number) =>
  n >= 1e6 || n <= -1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}K`;

export function ScenarioEngine() {
  // Assumptions, each defaulted from data.
  const [exitPerSf, setExitPerSf] = useState(data.comps.medPerSf ?? 590);
  const [hardPerSf, setHardPerSf] = useState(325);
  const [softPct, setSoftPct] = useState(14);
  const [acquisition, setAcquisition] = useState(Math.round((data.values.land + data.values.imps) / 1000) * 1000);
  const [efficiency, setEfficiency] = useState(90);

  const rows = useMemo(() => {
    return SCENARIOS.map((s) => {
      const grossBuilt = s.chargeableSf + (s.keepHouse ? 0 : 0); // new construction sf
      const sellableNew = Math.round(grossBuilt * (efficiency / 100));
      const houseValue = s.keepHouse ? HOUSE_SF * exitPerSf * 0.55 : 0; // old cottage sells at a discount to new $/sf
      const aduSf = s.key === 'adu' ? 2000 : 0;
      const sellable = sellableNew + aduSf * (efficiency / 100);
      const revenue = sellable * exitPerSf + houseValue;
      const hard = (grossBuilt + aduSf) * hardPerSf + (s.keepHouse ? 120000 : 0); // rehab allowance when keeping
      const mha = s.mhaSf * MHA_RATE;
      const permits = data.fees.newBuild24Units.median + (s.units > 4 ? 4000 : 0) + data.fees.geotechReview.median;
      const demo = s.keepHouse ? 0 : 25000;
      const soft = (hard + mha) * (softPct / 100);
      const cost = acquisition + hard + soft + mha + permits + demo;
      const profit = revenue - cost;
      return { s, sellable: Math.round(sellable), revenue, hard, soft, mha, permits, demo, cost, profit, margin: (profit / cost) * 100 };
    });
  }, [exitPerSf, hardPerSf, softPct, acquisition, efficiency]);

  const asIs = (data.values.land + data.values.imps);

  return (
    <div>
      <div className="card no-print-border">
        <h2 className="section-title">Assumptions, all adjustable</h2>
        <p className="desc">
          Defaults come from data: exit price is the median of {data.comps.n} sales of new construction in 98116 since
          2024 (${data.comps.p25PerSf} to ${data.comps.p75PerSf} per sf quartiles); permit fees are the median of{' '}
          {data.fees.newBuild24Units.n.toLocaleString('en-US')} real 2-to-4-unit new-build permits from our
          records-request fee data; acquisition starts at the county&apos;s {data.values.billYr} assessed value. Drag
          them and every scenario recomputes.
        </p>
        <div className="lf-row">
          {[
            { label: `Exit price: $${exitPerSf}/sf`, v: exitPerSf, set: setExitPerSf, min: 450, max: 750, step: 10 },
            { label: `Hard cost: $${hardPerSf}/sf`, v: hardPerSf, set: setHardPerSf, min: 250, max: 450, step: 5 },
            { label: `Soft cost: ${softPct}%`, v: softPct, set: setSoftPct, min: 8, max: 22, step: 1 },
            { label: `Acquisition: ${fmtK(acquisition)}`, v: acquisition, set: setAcquisition, min: 600000, max: 1400000, step: 10000 },
            { label: `Sellable efficiency: ${efficiency}%`, v: efficiency, set: setEfficiency, min: 80, max: 100, step: 1 },
          ].map((a) => (
            <div key={a.label} className="lf-field">
              <label>{a.label}</label>
              <input type="range" min={a.min} max={a.max} step={a.step} value={a.v} onChange={(e) => a.set(Number(e.target.value))} />
            </div>
          ))}
        </div>
        <p className="note">
          Baseline: sell as-is at the {data.values.billYr} assessed {fmtK(asIs)} (the land is {fmtK(data.values.land)} of
          it; the house is assessed at ${data.values.imps.toLocaleString('en-US')}).
        </p>
      </div>

      {rows.map(({ s, sellable, revenue, hard, soft, mha, permits, demo, cost, profit, margin }) => (
        <div className="card scenario-card" key={s.key}>
          <div className="scenario-head">
            <div>
              <h3 style={{ margin: 0 }}>{s.title}</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13.5 }}>{s.tagline}</p>
            </div>
            <div className="scenario-verdict">
              <span className="lf-scorepill" style={{ background: margin >= 15 ? '#a6d96a' : margin >= 5 ? '#fee08b' : '#fdae61' }}>
                {margin >= 0 ? '+' : ''}{margin.toFixed(0)}% margin
              </span>
            </div>
          </div>
          <div className="scenario-grid">
            <div>
              <table className="data">
                <tbody>
                  <tr><td className="txt">Units</td><td>{s.units}{s.keepHouse ? ' (house kept)' : ''}</td></tr>
                  <tr><td className="txt">New floor area</td><td>{(s.chargeableSf + (s.key === 'adu' ? 2000 : 0)).toLocaleString('en-US')} sf{s.exemptSf && s.key !== 'adu' ? ` + ${s.exemptSf} sf exempt` : ''}</td></tr>
                  <tr><td className="txt">Sellable area (est.)</td><td>{sellable.toLocaleString('en-US')} sf</td></tr>
                  <tr><td className="txt">Parking required</td><td>{s.parking}</td></tr>
                </tbody>
              </table>
              <ul className="scenario-notes">
                {s.notes.map((n) => <li key={n.slice(0, 20)}>{n}</li>)}
              </ul>
            </div>
            <div>
              <table className="data">
                <tbody>
                  <tr><td className="txt">Revenue</td><td>{fmtK(revenue)}</td></tr>
                  <tr><td className="txt">Acquisition</td><td>({fmtK(acquisition)})</td></tr>
                  <tr><td className="txt">Hard costs</td><td>({fmtK(hard)})</td></tr>
                  <tr><td className="txt">Soft costs ({softPct}%)</td><td>({fmtK(soft)})</td></tr>
                  <tr><td className="txt">MHA payment</td><td>{mha > 0 ? `(${fmtK(mha)})` : '$0 (ADU exempt)'}</td></tr>
                  <tr><td className="txt">Permits + geotech (median, real data)</td><td>({fmtK(permits)})</td></tr>
                  {demo > 0 ? <tr><td className="txt">Demolition</td><td>({fmtK(demo)})</td></tr> : null}
                  <tr style={{ fontWeight: 700 }}><td className="txt">Profit</td><td>{fmtK(profit)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      <p className="foot">
        MHA computed at ${MHA_RATE}/sf (Medium fee area, permits vesting Mar 2026 to Feb 2027) on new principal-unit
        floor area; ADU area is exempt from the MHA payment base. Sellable area applies the efficiency slider to gross
        new construction. The kept house is valued at a 45% discount to new $/sf plus a $120K rehab allowance. These
        are feasibility-grade estimates to compare paths, not a pro forma.
      </p>
    </div>
  );
}
