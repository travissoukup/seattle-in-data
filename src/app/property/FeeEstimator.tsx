'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { estimate, type AreaInput, type BuildingType } from '@/lib/fees/estimate';
import { BVD, CONSTRUCTION_TYPES } from '@/lib/fees/tables';
import {
  SFD_ALLIN, ALLIN_MULTIPLE, COMMON_EXTRAS, EXTRAS_INCIDENCE, COMPANION_PERMITS, benchmarkFor,
} from '@/lib/fees/benchmarks';

const money = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

/**
 * SDCI hourly review rates, SMC 22.900B.010. Land use review bills at a much
 * higher rate than general technical review, so the default matters.
 */
const DEFAULT_HOURLY = 292;
const LAND_USE_HOURLY = 551;

interface Preset {
  key: string;
  label: string;
  blurb: string;
  areas: AreaInput[];
  additionalWork: number;
  units: number;
  buildingType: BuildingType;
  geotechHours?: number;
  drainage?: number;
}

const PRESETS: Preset[] = [
  {
    key: 'house',
    label: 'New single-family house',
    blurb: 'Ground-up house, wood frame',
    areas: [{ group: 'R-3', type: 'VB', sqft: 2500 }],
    additionalWork: 0, units: 1, buildingType: 'Residential', drainage: 0,
  },
  {
    key: 'dadu',
    label: 'Backyard cottage (DADU)',
    blurb: 'Detached accessory dwelling',
    areas: [{ group: 'R-3', type: 'VB', sqft: 800 }],
    additionalWork: 0, units: 1, buildingType: 'Residential',
  },
  {
    key: 'addition',
    label: 'Addition',
    blurb: 'New floor area on an existing house',
    areas: [{ group: 'R-3', type: 'VB', sqft: 600 }],
    additionalWork: 0, units: 1, buildingType: 'Residential',
  },
  {
    key: 'remodel',
    label: 'Kitchen / bath remodel',
    blurb: 'No new floor area — value of work only',
    areas: [],
    additionalWork: 80000, units: 1, buildingType: 'Residential',
  },
  {
    key: 'garage',
    label: 'Detached garage',
    blurb: 'Unconditioned accessory structure',
    areas: [{ group: 'U', type: 'VB', sqft: 440 }],
    additionalWork: 0, units: 0, buildingType: 'Residential',
  },
  {
    key: 'fourplex',
    label: 'Fourplex',
    blurb: 'Middle housing, 4 units',
    areas: [{ group: 'R-2', type: 'VA', sqft: 5200 }],
    additionalWork: 0, units: 4, buildingType: 'Residential',
  },
];

export function FeeEstimator({
  zone,
  lot,
  ecaLikely,
  onTotal,
}: {
  zone?: string;
  lot?: number;
  ecaLikely?: boolean;
  onTotal?: (total: number) => void;
}) {
  const [presetKey, setPresetKey] = useState('house');
  const preset = PRESETS.find((p) => p.key === presetKey) || PRESETS[0];

  const [areas, setAreas] = useState<AreaInput[]>(preset.areas);
  const [additionalWork, setAdditionalWork] = useState(preset.additionalWork);
  const [units, setUnits] = useState(preset.units);
  const [buildingType, setBuildingType] = useState<BuildingType>(preset.buildingType);
  const [stories, setStories] = useState(2);

  // extras — the lines the City's own estimator leaves out
  const [landUse, setLandUse] = useState(0);
  const [geotechHours, setGeotechHours] = useState(ecaLikely ? 8 : 0);
  const [drainage, setDrainage] = useState(0);
  const [extraReviewHours, setExtraReviewHours] = useState(4);
  const [other, setOther] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(DEFAULT_HOURLY);

  function applyPreset(k: string) {
    const p = PRESETS.find((x) => x.key === k);
    if (!p) return;
    setPresetKey(k);
    setAreas(p.areas.map((a) => ({ ...a })));
    setAdditionalWork(p.additionalWork);
    setUnits(p.units);
    setBuildingType(p.buildingType);
    setGeotechHours(ecaLikely ? 8 : p.geotechHours || 0);
    setDrainage(p.drainage || 0);
  }

  const result = useMemo(
    () =>
      estimate({
        areas, additionalWork, stories, buildingType, dwellingUnits: units,
        extras: { landUse, geotechHours, drainage, extraReviewHours, other, hourlyRate },
      }),
    [areas, additionalWork, stories, buildingType, units, landUse, geotechHours, drainage, extraReviewHours, other, hourlyRate],
  );

  const setArea = (i: number, patch: Partial<AreaInput>) =>
    setAreas((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const addArea = () => setAreas((p) => [...p, { group: 'R-3', type: 'VB', sqft: 0 }]);
  const removeArea = (i: number) => setAreas((p) => p.filter((_, j) => j !== i));

  const extrasTotal = result.total - result.cityOnlyTotal;

  // Surface the figure so the project-cost tab can put it in context.
  const lastReported = useRef<number>(-1);
  useEffect(() => {
    if (onTotal && lastReported.current !== result.total) {
      lastReported.current = result.total;
      onTotal(result.total);
    }
  }, [result.total, onTotal]);

  return (
    <section className="card prop-section">
      <h3 className="prop-h">Permit fee estimator</h3>
      <p className="prop-lead">
        Built on the City&rsquo;s own 2026 fee tables, so the core numbers match what SDCI will invoice — then
        extended with the charges the City&rsquo;s spreadsheet leaves out, and split by when you actually have to
        pay.{zone ? ` Pre-set for this ${zone} lot.` : ''}
      </p>

      {/* ---- what are you building ---- */}
      <div className="fee-presets no-print">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`fee-preset${presetKey === p.key ? ' on' : ''}`}
            onClick={() => applyPreset(p.key)}
            type="button"
          >
            <span className="fee-preset-l">{p.label}</span>
            <span className="fee-preset-b">{p.blurb}</span>
          </button>
        ))}
      </div>

      {/* ---- areas ---- */}
      <h4 className="fee-h4">New floor area</h4>
      {areas.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
          No new floor area — this project is valued from the cost of work below.
        </p>
      ) : null}
      {areas.map((a, i) => {
        const psf = BVD.find((o) => o.group === a.group)?.costs[a.type];
        return (
          <div className="fee-area" key={i}>
            <label>
              <span>Use</span>
              <select value={a.group} onChange={(e) => setArea(i, { group: e.target.value })}>
                {BVD.map((o) => (
                  <option key={o.group} value={o.group}>
                    {o.group} — {o.desc || o.icbo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Construction</span>
              <select value={a.type} onChange={(e) => setArea(i, { type: e.target.value })}>
                {CONSTRUCTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Sq ft</span>
              <input
                type="number" min={0} value={a.sqft}
                onChange={(e) => setArea(i, { sqft: Number(e.target.value) })}
              />
            </label>
            <span className="fee-psf">
              {typeof psf === 'number' ? `$${psf.toFixed(2)}/sf` : 'not permitted'}
            </span>
            <button className="fee-x no-print" onClick={() => removeArea(i)} type="button" aria-label="Remove">×</button>
          </div>
        );
      })}
      <button className="fee-add no-print" onClick={addArea} type="button">+ Add an area</button>

      {/* ---- other inputs ---- */}
      <div className="fee-grid">
        <label>
          <span>Value of alteration work (no new area)</span>
          <input type="number" min={0} step={1000} value={additionalWork} onChange={(e) => setAdditionalWork(Number(e.target.value))} />
        </label>
        <label>
          <span>Dwelling units</span>
          <input type="number" min={0} value={units} onChange={(e) => setUnits(Number(e.target.value))} />
        </label>
        <label>
          <span>Building type</span>
          <select value={buildingType} onChange={(e) => setBuildingType(e.target.value as BuildingType)}>
            <option>Residential</option><option>Commercial</option><option>Mixed Use</option>
          </select>
        </label>
        <label>
          <span>Stories</span>
          <input type="number" min={1} value={stories} onChange={(e) => setStories(Number(e.target.value))} />
        </label>
      </div>

      {/* ---- the extras ---- */}
      <details className="fee-extras" open={ecaLikely}>
        <summary>Charges the City&rsquo;s estimator leaves out {extrasTotal > 0 ? `— ${money0(extrasTotal)} here` : ''}</summary>
        <div className="fee-grid">
          <label>
            <span>Land use review</span>
            <input type="number" min={0} step={100} value={landUse} onChange={(e) => setLandUse(Number(e.target.value))} />
          </label>
          <label>
            <span>Geotech / critical-areas review (hours)</span>
            <input type="number" min={0} value={geotechHours} onChange={(e) => setGeotechHours(Number(e.target.value))} />
          </label>
          <label>
            <span>Drainage &amp; grading review</span>
            <input type="number" min={0} step={100} value={drainage} onChange={(e) => setDrainage(Number(e.target.value))} />
          </label>
          <label>
            <span>Revisions / extra review (hours)</span>
            <input type="number" min={0} value={extraReviewHours} onChange={(e) => setExtraReviewHours(Number(e.target.value))} />
          </label>
          <label>
            <span>Other (street use, utilities, MHA)</span>
            <input type="number" min={0} step={100} value={other} onChange={(e) => setOther(Number(e.target.value))} />
          </label>
          <label>
            <span>Hourly review rate</span>
            <select value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))}>
              <option value={DEFAULT_HOURLY}>${DEFAULT_HOURLY} — SDCI base / technical review</option>
              <option value={LAND_USE_HOURLY}>${LAND_USE_HOURLY} — land use review</option>
            </select>
          </label>
        </div>
        {ecaLikely ? (
          <p className="fee-note">
            This parcel is mapped in an environmentally critical area, so geotechnical review hours are pre-filled.
            Projects on mapped slopes routinely need a geotechnical report and city geotech review.
          </p>
        ) : null}
      </details>

      {/* ---- result ---- */}
      <div className="fee-out">
        <div className="fee-val">
          <span className="fee-val-k">Project value used</span>
          <span className="fee-val-v">{money0(result.value)}</span>
          {result.multiplier > 1 ? <span className="fee-val-n">includes {((result.multiplier - 1) * 100).toFixed(1)}% tall-building multiplier</span> : null}
          <span className="fee-val-n">Development Fee Index {money(result.dfi)}</span>
        </div>

        <table className="data fee-table">
          <thead>
            <tr><th>Fee</th><th>When</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
          </thead>
          <tbody>
            {result.lines.filter((l) => l.amount > 0).map((l, i) => (
              <tr key={i} className={l.ours ? 'fee-ours' : ''}>
                <td>
                  {l.label}
                  {l.ours ? <span className="fee-tag">not in City tool</span> : null}
                  {l.cite ? <span className="fee-cite">{l.cite}</span> : null}
                </td>
                <td className="fee-when">{l.when === 'intake' ? 'At application' : l.when === 'issuance' ? 'At issuance' : 'During review'}</td>
                <td style={{ textAlign: 'right' }} className="mono">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="fee-totals">
          <div><span>Due at application</span><strong>{money(result.intakeTotal)}</strong></div>
          <div><span>Due at issuance</span><strong>{money(result.issuanceTotal)}</strong></div>
          {result.laterTotal > 0 ? <div><span>Likely during review</span><strong>{money(result.laterTotal)}</strong></div> : null}
          <div className="fee-grand"><span>Total</span><strong>{money(result.total)}</strong></div>
        </div>

        {extrasTotal > 0 ? (
          <p className="fee-compare">
            The City&rsquo;s own estimator would show <strong>{money(result.cityOnlyTotal)}</strong> for this project.
            The extra <strong>{money(extrasTotal)}</strong> above is review and connection charges its spreadsheet
            does not model.
          </p>
        ) : null}
      </div>

      <RealityCheck
        kind={areas.length > 0 && areas.some((a) => a.sqft > 0) && additionalWork === 0 ? 'new' : 'altAdd'}
        projectValue={result.value}
        coreTotal={result.cityOnlyTotal}
      />

      <p className="prop-disclaimer" style={{ marginTop: 14 }}>
        An estimate, not a quote. Valuation uses SDCI&rsquo;s Building Valuation Data; SDCI may set a different
        value, and final fees depend on the review path your project takes. Confirm against the current Fee
        Subtitle (SMC 22.900) before budgeting.
      </p>
    </section>
  );
}


/* ------------------------------------------------------------------ *
 * Reality check: what SDCI actually invoiced on comparable permits.
 * This is the part the City's own spreadsheet cannot do.
 * ------------------------------------------------------------------ */

function RealityCheck({
  kind, projectValue, coreTotal,
}: { kind: 'new' | 'altAdd'; projectValue: number; coreTotal: number }) {
  const mult = ALLIN_MULTIPLE[kind];
  const band = SFD_ALLIN[kind];
  const cost = benchmarkFor(kind, projectValue);
  const likely = coreTotal * mult.median;
  const high = coreTotal * mult.p90;

  return (
    <div className="rc">
      <h4 className="fee-h4" style={{ marginTop: 0 }}>Reality check against real permits</h4>

      <div className="rc-band">
        <div className="rc-b">
          <span className="rc-k">Core fees, as calculated</span>
          <span className="rc-v">{money0(coreTotal)}</span>
          <span className="rc-n">what the City&rsquo;s estimator shows</span>
        </div>
        <div className="rc-b hi">
          <span className="rc-k">Likely all-in</span>
          <span className="rc-v">{money0(likely)}</span>
          <span className="rc-n">{mult.median}× core — the median outcome</span>
        </div>
        <div className="rc-b">
          <span className="rc-k">Plan for up to</span>
          <span className="rc-v">{money0(high)}</span>
          <span className="rc-n">{mult.p90}× core — 1 permit in 10 lands here</span>
        </div>
      </div>

      <p className="fee-note">
        Across <strong>{mult.n.toLocaleString('en-US')}</strong> comparable permits from 2023–2025, what SDCI
        actually invoiced ran <strong>{mult.median}× the core package</strong> at the median and{' '}
        <strong>{mult.p90}×</strong> at the 90th percentile. For reference, every{' '}
        {band.label.toLowerCase()} permit in that period (n={band.n.toLocaleString('en-US')}) had a median
        all-in of <strong>{money0(band.median)}</strong>, with a quarter under {money0(band.p25)} and a tenth
        over {money0(band.p90)}.
        {cost ? (
          <> At your project value the closest cohort is <strong>{cost.band}</strong> — median{' '}
          {money0(cost.median)} (n={cost.n.toLocaleString('en-US')}), about {cost.pct}% of declared project cost.</>
        ) : null}
      </p>

      <details className="fee-extras" style={{ marginTop: 10 }}>
        <summary>
          The charges that actually surprise people — {EXTRAS_INCIDENCE[kind]}% of these permits pick up at least one
        </summary>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Fee line</th><th style={{ textAlign: 'right' }}>Hits</th><th style={{ textAlign: 'right' }}>Median</th><th style={{ textAlign: 'right' }}>p90</th></tr>
            </thead>
            <tbody>
              {COMMON_EXTRAS.map((e) => {
                const pct = kind === 'new' ? e.pctNew : (e.pctAlt ?? 0);
                return (
                  <tr key={e.line}>
                    <td>{e.line}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{pct}%</td>
                    <td style={{ textAlign: 'right' }} className="mono">{money0(e.median)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{money0(e.p90)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="fee-note">
          Drainage review has the highest incidence: 47.7% of new single-family permits pay drainage hours beyond
          the minimum. The missed-inspection fee is the only avoidable line in this table.
        </p>
      </details>

      <details className="fee-extras" style={{ marginTop: 8 }}>
        <summary>Separate permits the same job usually also needs</summary>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Permit</th><th style={{ textAlign: 'right' }}>Median</th><th style={{ textAlign: 'right' }}>p75</th></tr></thead>
            <tbody>
              {COMPANION_PERMITS.map((c) => (
                <tr key={c.type}>
                  <td>{c.label} <span className="fee-cite">{c.type} · n={c.n.toLocaleString('en-US')}</span></td>
                  <td style={{ textAlign: 'right' }} className="mono">{money0(c.median)}</td>
                  <td style={{ textAlign: 'right' }} className="mono">{money0(c.p75)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fee-note">
          The estimate above covers one construction permit. Electrical, heating and mechanical work are
          permitted separately, so a normal job adds roughly $250–$800 on top.
        </p>
      </details>

      <p className="fee-cite" style={{ marginTop: 8 }}>
        Benchmarks computed from 1,765,291 cleaned invoice lines across 395,097 permits (Permit Fees k8z7-3feg
        joined to Building Permits 76t5-zqzr). Historical charges under the schedules then in effect — a sanity
        band, not a quote.
      </p>
    </div>
  );
}
