'use client';

import { useMemo, useState } from 'react';
import {
  computeNr, familyFor, NR_STANDARDS, ADU_STANDARDS, LR_STANDARDS, COMMERCIAL_STANDARDS,
  ECA_EFFECTS, ECA_DEDUCTIBLE, type Standard, type UnitType,
} from '@/lib/zoning/standards';
import type { DeepDiveDetail } from './DeepDive';

const n0 = (v: number) => Math.round(v).toLocaleString('en-US');

function StandardsTable({ rows, caption }: { rows: Standard[]; caption?: string }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>Standard</th><th>Value</th><th>Code section</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.label}>
              <td>
                {s.label}
                {s.varies ? <span className="fee-tag">varies</span> : null}
                {s.note ? <span className="fee-cite">{s.note}</span> : null}
              </td>
              <td><strong>{s.value}</strong></td>
              <td className="muted mono">{s.cite}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {caption ? <p className="fee-note">{caption}</p> : null}
    </div>
  );
}

export function ZoningStandards({
  detail, ecaLikely, liveZone,
}: { detail: DeepDiveDetail; ecaLikely: boolean; liveZone?: string }) {
  // The baked assessor extract predates the January 2026 zone consolidation, so
  // it still says NR1/NR2/NR3. The live zoning layer is authoritative.
  const zone = liveZone || detail.zone;
  const stale = !!liveZone && !!detail.zone && liveZone !== detail.zone;
  const family = familyFor(zone);

  const [unitType, setUnitType] = useState<UnitType>('attached');
  const [greenBonus, setGreenBonus] = useState(false);
  const [nearMajorTransit, setNearMajorTransit] = useState(false);
  const [frequentTransit, setFrequentTransit] = useState(false);
  const [ecaDeduction, setEcaDeduction] = useState(0);

  const nr = useMemo(
    () => computeNr({ lotArea: detail.lot, unitType, greenBonus, nearMajorTransit, frequentTransit, ecaDeduction }),
    [detail.lot, unitType, greenBonus, nearMajorTransit, frequentTransit, ecaDeduction],
  );

  return (
    <div className="dd-pane">
      <h4 className="dd-head">What the rules would let you build</h4>
      <p className="dd-sub">
        Modelled from the land use code as amended by Ordinance 127376, which took effect 21 January 2026 and
        replaced NR1, NR2 and NR3 with a single NR zone. This lot is {n0(detail.lot)} sq ft, zoned{' '}
        <strong>{zone || 'n/a'}</strong>.
        {stale ? (
          <> The county assessor record still lists it as <strong>{detail.zone}</strong>, a designation the city
          retired in January 2026; the live city zoning layer is used here.</>
        ) : null}
      </p>

      {family === 'NR' ? (
        <>
          <div className="std-grid">
            <div className="std">
              <div className="std-v">{nr.units}</div>
              <div className="std-l">Homes allowed</div>
              <div className="std-c">{detail.units} today · 1 per {n0(nr.densityDivisor)} sq ft</div>
            </div>
            <div className="std">
              <div className="std-v">{nr.far.toFixed(1)}</div>
              <div className="std-l">Floor area ratio</div>
              <div className="std-c">set by the density proposed</div>
            </div>
            <div className="std">
              <div className="std-v">{n0(nr.floorArea)} sf</div>
              <div className="std-l">Total floor area</div>
              <div className="std-c">{n0(detail.sqft)} sf built today{nr.smallLotFloorApplied ? ' · small-lot floor' : ''}</div>
            </div>
            <div className="std">
              <div className="std-v">{n0(nr.coverageArea)} sf</div>
              <div className="std-l">Footprint at {nr.coverage}%</div>
              <div className="std-c">ground-floor limit</div>
            </div>
            <div className="std">
              <div className="std-v">{nr.heightBase}–{nr.heightBonus} ft</div>
              <div className="std-l">Height</div>
              <div className="std-c">42 ft with a tree or green bonus</div>
            </div>
            <div className="std">
              <div className="std-v">{nr.setbacks.front}/{nr.setbacks.rear} ft</div>
              <div className="std-l">Front / rear setback</div>
              <div className="std-c">side {nr.setbacks.side}</div>
            </div>
          </div>

          <div className="fee-grid no-print">
            <label>
              <span>Configuration</span>
              <select value={unitType} onChange={(e) => setUnitType(e.target.value as UnitType)}>
                <option value="attached">Attached or detached houses</option>
                <option value="stacked">Stacked flats</option>
              </select>
            </label>
            <label>
              <span>Deductible critical area (sq ft)</span>
              <input type="number" min={0} step={100} value={ecaDeduction} onChange={(e) => setEcaDeduction(Number(e.target.value))} />
            </label>
            <label className="chk">
              <input type="checkbox" checked={greenBonus} onChange={(e) => setGreenBonus(e.target.checked)} />
              <span>Tree retention / Green Factor 0.6</span>
            </label>
            <label className="chk">
              <input type="checkbox" checked={nearMajorTransit} onChange={(e) => setNearMajorTransit(e.target.checked)} />
              <span>Within ¼ mile of major transit</span>
            </label>
            <label className="chk">
              <input type="checkbox" checked={frequentTransit} onChange={(e) => setFrequentTransit(e.target.checked)} />
              <span>In a frequent transit service area</span>
            </label>
          </div>

          {nr.notes.length ? (
            <ul className="prop-facts" style={{ margin: '10px 0 0' }}>
              {nr.notes.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          ) : null}

          <h4 className="fee-h4">Neighborhood Residential standards</h4>
          <StandardsTable rows={NR_STANDARDS} />

          <h4 className="fee-h4">Accessory dwelling units</h4>
          <StandardsTable
            rows={ADU_STANDARDS}
            caption="The 2026 code removed the exemption that let ADU floor area sit outside the FAR limit. An ADU now uses up unit count and floor area like any other unit."
          />
        </>
      ) : null}

      {family === 'LR' ? (
        <>
          <h4 className="fee-h4">Lowrise standards</h4>
          <StandardsTable
            rows={LR_STANDARDS}
            caption="Ordinance 127376 repealed LR density limits outright, so how many units fit is now a question of floor area, height and setbacks rather than a unit cap."
          />
        </>
      ) : null}

      {family === 'MR' || family === 'COMMERCIAL' ? (
        <>
          <h4 className="fee-h4">{family === 'MR' ? 'Midrise and highrise' : 'Commercial and mixed use'} standards</h4>
          <StandardsTable rows={COMMERCIAL_STANDARDS} />
        </>
      ) : null}

      {!family ? (
        <p className="muted">No standard dimensions are catalogued for this zone. Check the code directly.</p>
      ) : null}

      <h4 className="fee-h4">How critical areas change the answer</h4>
      {ecaLikely ? (
        <p className="dd-sub" style={{ marginBottom: 8 }}>
          This parcel has critical areas mapped nearby. The important thing is that most designations do not reduce
          how much you can build — only these four do: {ECA_DEDUCTIBLE.join(', ').toLowerCase()}.
        </p>
      ) : (
        <p className="dd-sub" style={{ marginBottom: 8 }}>
          No critical areas are mapped at this point. Shown for reference, since mapping is approximate and the
          boundary may sit close by.
        </p>
      )}
      <StandardsTable rows={ECA_EFFECTS} />

      <p className="fee-note" style={{ marginTop: 12 }}>
        Setbacks, height and coverage all carry exceptions for corner lots, through lots, existing nonconforming
        structures, roof form and overlays. Confirm the numbers for this parcel with SDCI before designing, using
        their{' '}
        <a href="https://cosgisweb.seattle.gov/DPDApps/SDCIParcelData/parceldata.aspx" target="_blank" rel="noopener noreferrer">
          parcel data tool
        </a>{' '}
        or a pre-application meeting.
      </p>
    </div>
  );
}
