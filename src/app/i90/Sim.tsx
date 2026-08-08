'use client';

import { useMemo, useState } from 'react';
import data from '@/lib/generated/i90.json';
import { simulate, segmentsToday, segmentsPreR8A, type SimParams, type SimResult } from './engine';
import { TrafficMap } from './TrafficMap';

/** Interactive I-90 corridor simulation. Demand curves are real TMAS counts:
 * pick any actual day from the newest published months, or the weekday
 * average. Everything else is a visible, adjustable assumption. */

type Dir = 'EB' | 'WB';
type PresetKey = 'today' | 'noHov' | 'hovAsGp' | 'preR8A' | 'centerGp';

const ARM_TO_MP = 1.94;

const PRESETS: Record<PresetKey, { name: string; blurb: string }> = {
  today: { name: 'Today (2025)', blurb: '3 GP + 1 HOV each way; center roadway is the 2 Line.' },
  noHov: { name: 'Close the HOV lane', blurb: 'HOV lane closed to everyone; its users join the GP lanes.' },
  hovAsGp: { name: 'HOV lane becomes GP', blurb: 'Same pavement, 4 GP lanes, no HOV priority.' },
  preR8A: { name: 'Pre-2017 layout (2019 demand)', blurb: 'No outer HOV lanes; center express as 2 reversible GP lanes, WB mornings and EB evenings.' },
  centerGp: { name: 'Give cars the center roadway', blurb: 'Today plus 2 reversible GP lanes where the 2 Line runs. The counterfactual.' },
};

function nodeRatiosFromDeltas(): { mp: number; ratio: number }[] {
  // Convert AADT step changes at interchanges into flow multipliers, EB frame.
  const out: { mp: number; ratio: number }[] = [];
  let run = 0;
  const sections = (data.sections as { aadt: number | null; armBegin: number }[])
    .filter((s) => s.aadt && s.armBegin >= 0.3)
    .sort((a, b) => a.armBegin - b.armBegin);
  for (const d of data.interchangeDeltas as { arm: number; delta: number }[]) {
    const mp = d.arm + ARM_TO_MP;
    if (mp <= 2.1 || mp >= 10.0) continue;
    const upstream = sections.filter((s) => s.armBegin < d.arm).pop();
    if (!upstream?.aadt) continue;
    const ratio = (upstream.aadt + d.delta) / upstream.aadt;
    out.push({ mp, ratio: Math.max(0.5, Math.min(1.8, ratio)) });
    run += d.delta;
  }
  return out;
}

const NODE_RATIOS = nodeRatiosFromDeltas();

interface DayCurve { gp: number[]; hov: number[] }
interface DayEntry { date: string; dow: string; season?: string; EB: DayCurve; WB: DayCurve }
const DAYS = (data as unknown as { days: DayEntry[] }).days;
const SUMMER = DAYS.filter((d) => d.season === 'summer2026');
const WINTER = DAYS.filter((d) => d.season !== 'summer2026');
const dayTotal = (x: DayEntry) => ['EB', 'WB'].reduce((s2, dd) => s2 + (x[dd as Dir].gp.reduce((a, b) => a + b, 0)), 0);
const BUSIEST = (SUMMER.length ? SUMMER : DAYS).reduce((best, d) => (dayTotal(d) > dayTotal(best) ? d : best), (SUMMER.length ? SUMMER : DAYS)[0]);

function dayLabel(d: DayEntry): string {
  const [y, m, dd] = d.date.split('-');
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
  return `${d.dow} ${mon} ${Number(dd)}, ${y}`;
}

export function Sim() {
  const [dir, setDir] = useState<Dir>('WB');
  const [dateKey, setDateKey] = useState<string>(BUSIEST?.date ?? 'avg');
  const [preset, setPreset] = useState<PresetKey>('today');
  const [demandScale, setDemandScale] = useState(100);
  const [hovShareScale, setHovShareScale] = useState(100);
  const [gpOcc, setGpOcc] = useState(1.2);
  const [hovOcc, setHovOcc] = useState(2.4);
  const [railRiders, setRailRiders] = useState(2000);
  const [incident, setIncident] = useState(false);

  const { result, baseline } = useMemo(() => {
    const year = preset === 'preR8A' ? '2019' : '2025';
    const prof = (data.profiles as unknown as Record<string, Record<Dir, { gp: number[]; hov: number[] }>>)[year];
    const day = preset === 'preR8A' || dateKey === 'avg' ? null : DAYS.find((d) => d.date === dateKey);
    const curve = day ? day[dir] : prof[dir];

    const build = (pk: PresetKey, withIncident: boolean): SimResult => {
      const segs = pk === 'preR8A' ? segmentsPreR8A(dir) : segmentsToday(dir);
      // Reversible center: WB gets it 5am-1pm historically; we grant it to the
      // direction being simulated during its peak by giving the lanes all day
      // and letting the demand curve decide when they matter.
      const centerLanes = pk === 'preR8A' || pk === 'centerGp' ? 2 : 0;
      const p: SimParams = {
        demandCurveGp: curve.gp,
        demandCurveHov: curve.hov,
        demandScale: demandScale / 100,
        hovActive: pk === 'today' || pk === 'centerGp',
        hovAsGp: pk === 'hovAsGp',
        hovShareScale: hovShareScale / 100,
        centerGpLanes: centerLanes,
        nodeRatios: NODE_RATIOS,
        gpOcc,
        hovOcc,
        railRidersPeakHr: railRiders,
        stationMp: year === '2025' ? 4.2 : 3.0,
        incident: withIncident
          ? { mpStart: 4.3, mpEnd: 4.6, hourStart: 7.5, hourEnd: 8.5, lanesLost: 1 }
          : undefined,
      };
      if (pk === 'noHov') { p.hovActive = false; p.hovAsGp = false; }
      return simulate(segs, dir, p);
    };

    return {
      result: build(preset, incident),
      baseline: preset === 'today' && !incident ? null : build('today', false),
    };
  }, [dir, dateKey, preset, demandScale, hovShareScale, gpOcc, hovOcc, railRiders, incident]);

  const peakTT = Math.max(...result.travelTimeByHour);
  const peakHr = result.travelTimeByHour.indexOf(peakTT);
  const amTT = result.travelTimeByHour[8];
  const pmTT = result.travelTimeByHour[17];
  const hovAmTT = result.travelTimeByHourHov?.[8];
  const railPeople4h = railRiders * 4;
  const peoplePeakWithRail = result.bridgePeoplePeak + (preset === 'centerGp' || preset === 'preR8A' ? 0 : railPeople4h);

  const fmtMin = (m: number) => `${m.toFixed(0)} min`;
  const delta = (a: number, b: number) => {
    if (b < 1) return a < 1 ? 'same as today' : 'today has none';
    const d = ((a - b) / b) * 100;
    return `${d >= 0 ? '+' : ''}${d.toFixed(0)}% vs today`;
  };

  return (
    <div>
      <div className="card">
        <div className="lf-row">
          <div className="lf-field">
            <label>Direction</label>
            <select value={dir} onChange={(e) => setDir(e.target.value as Dir)}>
              <option value="WB">Westbound (into Seattle)</option>
              <option value="EB">Eastbound (toward Bellevue)</option>
            </select>
          </div>
          <div className="lf-field">
            <label>Day to simulate</label>
            <select value={preset === 'preR8A' ? 'avg' : dateKey} disabled={preset === 'preR8A'} onChange={(e) => setDateKey(e.target.value)}>
              <option value="avg">Average weekday (May 2025)</option>
              <optgroup label="Summer 2026 (newest, raw recorder data)">
                {SUMMER.map((d) => (
                  <option key={d.date} value={d.date}>
                    {dayLabel(d)}{d.date === BUSIEST.date ? ' (busiest)' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Winter 2025 (accepted federal data)">
                {WINTER.map((d) => (
                  <option key={d.date} value={d.date}>{dayLabel(d)}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="lf-field grow">
            <label>Scenario</label>
            <div className="lf-chips">
              {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                <button key={k} className={`chip ${preset === k ? 'on' : ''}`} onClick={() => setPreset(k)}>
                  {PRESETS[k].name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="note" style={{ margin: '6px 0 10px' }}>{PRESETS[preset].blurb}</p>
        <div className="lf-row">
          {[
            { label: `Demand: ${demandScale}%`, v: demandScale, set: setDemandScale, min: 50, max: 140, step: 5 },
            { label: `HOV-eligible share: ${hovShareScale}% of observed`, v: hovShareScale, set: setHovShareScale, min: 40, max: 200, step: 10 },
          ].map((a) => (
            <div key={a.label} className="lf-field">
              <label>{a.label}</label>
              <input type="range" min={a.min} max={a.max} step={a.step} value={a.v} onChange={(e) => a.set(Number(e.target.value))} />
            </div>
          ))}
          <div className="lf-field">
            <label>People per car: GP {gpOcc.toFixed(1)}</label>
            <input type="range" min={1} max={1.6} step={0.05} value={gpOcc} onChange={(e) => setGpOcc(Number(e.target.value))} />
          </div>
          <div className="lf-field">
            <label>per HOV vehicle: {hovOcc.toFixed(1)}</label>
            <input type="range" min={2} max={8} step={0.1} value={hovOcc} onChange={(e) => setHovOcc(Number(e.target.value))} />
          </div>
          <div className="lf-field">
            <label>2 Line riders/peak hr: {railRiders.toLocaleString('en-US')}</label>
            <input type="range" min={0} max={6000} step={250} value={railRiders} onChange={(e) => setRailRiders(Number(e.target.value))} />
          </div>
          <div className="lf-field">
            <label>What jams this road</label>
            <button className={`chip ${incident ? 'on' : ''}`} onClick={() => setIncident(!incident)}>
              Crash at the bridge, 7:30 to 8:30am (blocks 1 lane)
            </button>
          </div>
        </div>
      </div>

      <TrafficMap result={result} dir={dir} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">8am corridor drive (GP)</div>
          <div className="value">{fmtMin(amTT)}</div>
          <div className="sub">{baseline ? `${delta(amTT, baseline.travelTimeByHour[8])}` : `free flow ${fmtMin(result.freeFlowMin)}`}{hovAmTT ? ` · HOV ${fmtMin(hovAmTT)}` : ''}</div>
        </div>
        <div className="stat-card">
          <div className="label">5pm corridor drive (GP)</div>
          <div className="value">{fmtMin(pmTT)}</div>
          <div className="sub">{baseline ? `${delta(pmTT, baseline.travelTimeByHour[17])}` : `worst hour ${peakHr}:00 at ${fmtMin(peakTT)}`}</div>
        </div>
        <div className="stat-card">
          <div className="label">Vehicle-hours of delay/day</div>
          <div className="value">{result.vehHoursDelay.toLocaleString('en-US')}</div>
          <div className="sub">{baseline ? `${delta(result.vehHoursDelay, baseline.vehHoursDelay)}` : 'this direction only'}</div>
        </div>
        <div className="stat-card">
          <div className="label">People across the bridge, 6-10am</div>
          <div className="value">{peoplePeakWithRail.toLocaleString('en-US')}</div>
          <div className="sub">
            {result.bridgeVehPeak.toLocaleString('en-US')} vehicles
            {preset === 'centerGp' || preset === 'preR8A' ? ' · no 2 Line in this scenario' : ` + ${railPeople4h.toLocaleString('en-US')} on the 2 Line`}
          </div>
        </div>
      </div>

      {baseline ? (
        <p className="note">
          Comparison baseline is Today (2025) with identical sliders. The 2 Line people are added only in scenarios
          where the center roadway stays rail; in center-as-GP scenarios those riders are assumed lost to cars or
          other routes, which is generous to the car scenario.
        </p>
      ) : null}
    </div>
  );
}
