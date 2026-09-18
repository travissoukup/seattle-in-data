'use client';

import { useMemo, useState } from 'react';
import {
  computeOtherCharges, SPU_CAPACITY, KC_RCE, SCL_SERVICE, SALES_TAX_RATE, type ProjectCostInputs,
} from '@/lib/fees/other-charges';

const money0 = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

/**
 * The charges beyond SDCI's permit fee. For a new house these routinely total
 * more than the permit itself, and none of them appear in the City's estimator.
 */
export function TotalProjectCost({ sdciFees, mhaZone }: { sdciFees: number; mhaZone: boolean }) {
  const [contractValue, setContractValue] = useState(600000);
  const [newMeter, setNewMeter] = useState<ProjectCostInputs['newMeter']>('3/4 in');
  const [arterial, setArterial] = useState(false);
  const [newHardSurfaceSf, setNewHard] = useState(2400);
  const [existingHardSurfaceSf, setExistingHard] = useState(0);
  const [rceType, setRce] = useState<ProjectCostInputs['rceType']>('Single family, medium');
  const [electricalService, setScl] = useState<ProjectCostInputs['electricalService']>('0–200 A');
  const [undergroundPower, setUnderground] = useState(false);
  const [sideSewer, setSideSewer] = useState(true);
  const [sie, setSie] = useState(false);
  const [mhaArea, setMhaArea] = useState<'none' | 'Low' | 'Medium' | 'High'>('none');
  const [mhaSuffix, setMhaSuffix] = useState<'M' | 'M1' | 'M2'>('M');
  const [mhaFloorAreaSf, setMhaSf] = useState(0);

  const charges = useMemo(
    () => computeOtherCharges({
      contractValue, newMeter, arterial, newHardSurfaceSf, existingHardSurfaceSf, rceType,
      electricalService, undergroundPower, sideSewer, streetImprovementException: sie,
      mhaArea, mhaSuffix, mhaFloorAreaSf,
    }),
    [contractValue, newMeter, arterial, newHardSurfaceSf, existingHardSurfaceSf, rceType,
     electricalService, undergroundPower, sideSewer, sie, mhaArea, mhaSuffix, mhaFloorAreaSf],
  );

  const otherTotal = charges.reduce((s, c) => s + c.amount, 0);
  const salesTax = charges.find((c) => c.key === 'sales-tax')?.amount || 0;
  const grand = otherTotal + sdciFees;

  return (
    <div className="dd-pane">
      <h4 className="dd-head">What the project costs beyond the permit</h4>
      <p className="dd-sub">
        SDCI&rsquo;s permit fee is one line on a longer bill. Utility capacity charges, the County wastewater
        charge, power connection and sales tax are all separate, and together they usually exceed the permit fee
        several times over.
      </p>

      <div className="fee-grid no-print">
        <label>
          <span>Construction contract value</span>
          <input type="number" min={0} step={10000} value={contractValue} onChange={(e) => setContractValue(Number(e.target.value))} />
        </label>
        <label>
          <span>New water meter</span>
          <select value={newMeter} onChange={(e) => setNewMeter(e.target.value as ProjectCostInputs['newMeter'])}>
            <option value="none">None — existing service</option>
            {Object.keys(SPU_CAPACITY).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>
          <span>New hard surface (sq ft)</span>
          <input type="number" min={0} step={100} value={newHardSurfaceSf} onChange={(e) => setNewHard(Number(e.target.value))} />
        </label>
        <label>
          <span>Existing hard surface (credit)</span>
          <input type="number" min={0} step={100} value={existingHardSurfaceSf} onChange={(e) => setExistingHard(Number(e.target.value))} />
        </label>
        <label>
          <span>County wastewater class</span>
          <select value={rceType} onChange={(e) => setRce(e.target.value as ProjectCostInputs['rceType'])}>
            <option value="none">No new connection</option>
            {Object.keys(KC_RCE).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>
          <span>Electrical service</span>
          <select value={electricalService} onChange={(e) => setScl(e.target.value as ProjectCostInputs['electricalService'])}>
            <option value="none">No new service</option>
            {Object.keys(SCL_SERVICE).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="chk"><input type="checkbox" checked={arterial} onChange={(e) => setArterial(e.target.checked)} /><span>Arterial street</span></label>
        <label className="chk"><input type="checkbox" checked={undergroundPower} onChange={(e) => setUnderground(e.target.checked)} /><span>Underground power</span></label>
        <label className="chk"><input type="checkbox" checked={sideSewer} onChange={(e) => setSideSewer(e.target.checked)} /><span>New side sewer</span></label>
        <label className="chk"><input type="checkbox" checked={sie} onChange={(e) => setSie(e.target.checked)} /><span>Street improvement exception</span></label>
      </div>

      {mhaZone ? (
        <details className="fee-extras" open>
          <summary>This lot carries an MHA suffix — redevelopment triggers a payment or affordable units</summary>
          <div className="fee-grid">
            <label>
              <span>MHA area tier</span>
              <select value={mhaArea} onChange={(e) => setMhaArea(e.target.value as 'none' | 'Low' | 'Medium' | 'High')}>
                <option value="none">Not applicable</option>
                <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
              </select>
            </label>
            <label>
              <span>Suffix</span>
              <select value={mhaSuffix} onChange={(e) => setMhaSuffix(e.target.value as 'M' | 'M1' | 'M2')}>
                <option value="M">(M)</option><option value="M1">(M1)</option><option value="M2">(M2)</option>
              </select>
            </label>
            <label>
              <span>Residential floor area (sq ft)</span>
              <input type="number" min={0} step={100} value={mhaFloorAreaSf} onChange={(e) => setMhaSf(Number(e.target.value))} />
            </label>
          </div>
          <p className="fee-note">
            Payment rates run from $10.78 per sq ft in a Low area with an (M) suffix to $50.46 in a High area
            with (M2). You can perform instead of pay by including affordable units — 5% to 11% of the total,
            depending on the same tier.
          </p>
        </details>
      ) : null}

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data">
          <thead><tr><th>Charge</th><th>Payable to</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>
            <tr>
              <td>SDCI permit and review fees<span className="fee-cite">from the estimator tab</span></td>
              <td className="muted">SDCI</td>
              <td style={{ textAlign: 'right' }} className="mono">{money0(sdciFees)}</td>
            </tr>
            {charges.map((c) => (
              <tr key={c.key} className={c.key === 'sales-tax' ? 'fee-ours' : ''}>
                <td>
                  {c.label}
                  {c.note ? <span className="fee-cite">{c.note}</span> : null}
                  <span className="fee-cite">{c.cite}</span>
                </td>
                <td className="muted">{c.payee}</td>
                <td style={{ textAlign: 'right' }} className="mono">{money0(c.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fee-totals">
        <div><span>SDCI permit fees</span><strong>{money0(sdciFees)}</strong></div>
        <div><span>Everything else</span><strong>{money0(otherTotal)}</strong></div>
        <div className="fee-grand"><span>Total before construction</span><strong>{money0(grand)}</strong></div>
      </div>

      <p className="fee-compare">
        Sales tax alone is {money0(salesTax)} on a {money0(contractValue)} contract — {(SALES_TAX_RATE * 100).toFixed(2)}%
        applied to the entire contract including labour and subcontractors. Across this list the permit fee is
        {sdciFees > 0 ? ` about ${Math.round((sdciFees / grand) * 100)}%` : ' a small share'} of what you pay before a
        nail goes in.
      </p>

      <p className="fee-cite" style={{ marginTop: 8 }}>
        Rates effective 2026: SPU Director&rsquo;s Rule FIN-220.2, King County wastewater capacity charge
        $77.99 per month per residential equivalent for 15 years, Seattle City Light DPP 500 P III-417, SDOT
        2026 fee schedule, WA DOR location code 1726, SMC 23.58C.040.
      </p>
    </div>
  );
}
