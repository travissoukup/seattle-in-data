/**
 * Cell Transmission Model (Daganzo 1994) for the I-90 corridor, MP 2.0 to 10.1.
 *
 * Standard first-order macroscopic traffic flow on a triangular fundamental
 * diagram. Two parallel cell chains per direction: general purpose (GP) and
 * HOV, coupled at the HOV lane's start/end and by the demand split. Interchange
 * nodes scale flow by ratios derived from WSDOT section AADTs. Demand is the
 * real TMAS weekday hourly curve, user-scalable.
 *
 * Deliberate simplifications, stated in the page methodology: one direction at
 * a time, net interchange flows instead of individual ramps, no lane-changing
 * friction, vehicles are a fluid. This is a planning-sketch model, the kind
 * used for screening, not a microsimulation.
 */

export interface Segment {
  mpStart: number;
  mpEnd: number;
  gpLanes: number;
  hov: boolean;
  capFactor: number; // 1.0 normal; <1 for no-shoulder bridge/tunnel sections
  label?: string;
}

export interface LaneConfig {
  name: string;
  segments: Segment[]; // direction-specific
  centerGpLanes: number; // 0 = center roadway not available to cars (it is the 2 Line)
}

export interface SimParams {
  demandCurveGp: number[]; // 24 hourly boundary volumes, veh/hr
  demandCurveHov: number[];
  demandScale: number; // global multiplier
  hovActive: boolean; // HOV lane operating as HOV
  hovAsGp: boolean; // HOV lane converted to a GP lane
  hovShareScale: number; // scales HOV-eligible share of demand (1 = observed)
  centerGpLanes: number; // reversible center roadway lanes given to this direction
  nodeRatios: { mp: number; ratio: number }[]; // flow multiplier crossing each interchange
  gpOcc: number; // persons per GP vehicle
  hovOcc: number; // persons per HOV vehicle
  railRidersPeakHr: number; // 2 Line people across the bridge per peak hour (context metric)
  stationMp: number; // milepost of the counting station the demand curve was measured at
  /** A crash blocking GP lanes over a milepost range and time window. */
  incident?: { mpStart: number; mpEnd: number; hourStart: number; hourEnd: number; lanesLost: number };
}

export interface SimResult {
  queueMiByBin: Float32Array; // entrance queue length, miles, per time bin
  speed: Float32Array; // [timeBins x cells] mph, GP chain
  speedHov: Float32Array | null;
  timeBins: number;
  cells: number;
  cellMp: number[];
  travelTimeByHour: number[]; // corridor GP travel time, minutes, by departure hour
  travelTimeByHourHov: number[] | null;
  freeFlowMin: number;
  vehHoursDelay: number;
  personHoursDelay: number;
  bridgeVehPeak: number; // vehicles crossing MP 5.0, 6-10am
  bridgePeoplePeak: number; // people in those vehicles + rail context added by caller
  maxQueueMi: number;
}

const CELL_MI = 0.1;
const DT_H = 6 / 3600; // 6 s, CFL-exact for 60 mph and 0.1 mi cells
const STEPS = Math.round(24 / DT_H);
const VF = 60; // mph
const Q_LANE = 2000; // veh/hr/lane capacity
const KJ_LANE = 160; // veh/mi/lane jam density
const MP0 = 2.0;
const MP1 = 10.1;
const BRIDGE_MP = 5.0;
const TIME_BINS = 288; // 5-minute columns for the heatmap

/** Post-R8A mainline (2025). Lane counts from the WSDOT State Highway Log 2024. */
export function segmentsToday(dir: 'EB' | 'WB'): Segment[] {
  return [
    { mpStart: 2.0, mpEnd: 3.4, gpLanes: dir === 'EB' ? 4 : 3, hov: false, capFactor: 1, label: 'Rainier to HOV start' },
    { mpStart: 3.4, mpEnd: 4.3, gpLanes: 3, hov: true, capFactor: 0.93, label: 'Mt Baker Tunnel' },
    { mpStart: 4.3, mpEnd: 5.9, gpLanes: 3, hov: true, capFactor: 0.93, label: 'Floating bridge' },
    { mpStart: 5.9, mpEnd: 7.7, gpLanes: 3, hov: true, capFactor: 1, label: 'Mercer Island' },
    { mpStart: 7.7, mpEnd: 8.3, gpLanes: 3, hov: true, capFactor: 0.95, label: 'East Channel bridge' },
    { mpStart: 8.3, mpEnd: 10.1, gpLanes: 3, hov: true, capFactor: 1, label: 'Bellevue approach' },
  ];
}

/** Pre-R8A (2015-2017): no outer-roadway HOV; center reversible express existed instead. */
export function segmentsPreR8A(dir: 'EB' | 'WB'): Segment[] {
  return segmentsToday(dir).map((s) => ({ ...s, hov: false }));
}

function cellsFrom(segments: Segment[], dir: 'EB' | 'WB') {
  const n = Math.round((MP1 - MP0) / CELL_MI);
  const mp: number[] = [];
  const gpLanes: number[] = [];
  const hov: boolean[] = [];
  const capF: number[] = [];
  for (let i = 0; i < n; i++) {
    const m = dir === 'EB' ? MP0 + (i + 0.5) * CELL_MI : MP1 - (i + 0.5) * CELL_MI;
    const seg = segments.find((s) => m >= s.mpStart && m < s.mpEnd) ?? segments[segments.length - 1];
    mp.push(m);
    gpLanes.push(seg.gpLanes);
    hov.push(seg.hov);
    capF.push(seg.capFactor);
  }
  return { n, mp, gpLanes, hov, capF };
}

/** One chain of the CTM: densities k (veh/mi), per-cell lanes and capacity. */
function step(
  k: Float64Array, lanes: number[], capF: number[], inflow: number, outCapRatio: number,
  nodeRatio: (i: number) => number,
): { spill: number; out: number } {
  const n = k.length;
  const send = new Float64Array(n);
  const recv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const L = lanes[i];
    if (L === 0) { send[i] = 0; recv[i] = 0; continue; }
    const qmax = Q_LANE * L * capF[i];
    const kc = qmax / VF;
    const w = qmax / (KJ_LANE * L - kc);
    send[i] = Math.min(VF * k[i], qmax);
    recv[i] = Math.min(w * (KJ_LANE * L - k[i]), qmax);
  }
  // Interchange nodes are real sources and sinks, not flux multipliers: with
  // ratio r at a node, a share (1-r) of the arriving flow exits the freeway
  // (r<1), or ramp traffic equal to (r-1) of it merges in (r>1). Mass is
  // conserved on the mainline apart from these explicit ramp flows.
  const inF = new Float64Array(n);
  const outF = new Float64Array(n);
  inF[0] = Math.min(inflow, recv[0] > 0 ? recv[0] : 0);
  const spill = inflow - inF[0];
  for (let i = 1; i < n; i++) {
    const r = nodeRatio(i);
    const exit = send[i - 1] * Math.max(0, 1 - r); // off-ramp, leaves freely
    const wantMain = send[i - 1] * Math.min(r, 1);
    const wantOn = send[i - 1] * Math.max(0, r - 1); // on-ramp merge
    const want = wantMain + wantOn;
    const scale = want > recv[i] && want > 0 ? recv[i] / want : 1;
    inF[i] = want * scale;
    outF[i - 1] = wantMain * scale + exit;
  }
  outF[n - 1] = send[n - 1] * outCapRatio;
  for (let i = 0; i < n; i++) {
    k[i] += (DT_H / CELL_MI) * (inF[i] - outF[i]);
    if (k[i] < 0) k[i] = 0;
  }
  return { spill, out: outF[n - 1] };
}

export function simulate(cfgSegments: Segment[], dir: 'EB' | 'WB', p: SimParams): SimResult {
  const { n, mp, gpLanes, hov, capF } = cellsFrom(cfgSegments, dir);

  // Effective lanes per chain per cell.
  const gpL = gpLanes.map((L, i) => {
    let l = L + (p.hovAsGp && hov[i] ? 1 : 0);
    // center roadway lanes span the express roadway extent, MP 3.0 to 6.2
    if (p.centerGpLanes > 0 && mp[i] >= 3.0 && mp[i] <= 6.2) l += p.centerGpLanes;
    return l;
  });
  const hovL = hov.map((h) => (h && p.hovActive && !p.hovAsGp ? 1 : 0));
  // Incident variant: same corridor with lanes removed over the crash extent.
  const inc = p.incident;
  const gpLIncident = inc
    ? gpL.map((l, i) => (mp[i] >= inc.mpStart && mp[i] <= inc.mpEnd ? Math.max(1, l - inc.lanesLost) : l))
    : gpL;
  const hovExists = hovL.some((l) => l > 0);
  // The HOV lane exists on a contiguous stretch; run its chain only there and
  // let traffic exit freely at the end (in reality it merges into GP; the
  // methodology notes this simplification).
  const hovStart = hovL.indexOf(1);
  const hovEnd = hovL.lastIndexOf(1);
  const hovLen = hovExists ? hovEnd - hovStart + 1 : 0;

  // Node ratios by cell index (interchange multipliers land between cells).
  const ratioAt = new Map<number, number>();
  for (const nr of p.nodeRatios) {
    const idx = dir === 'EB'
      ? Math.round((nr.mp - MP0) / CELL_MI)
      : Math.round((MP1 - nr.mp) / CELL_MI);
    if (idx > 0 && idx < n) ratioAt.set(idx, dir === 'EB' ? nr.ratio : 1 / nr.ratio);
  }
  const nodeRatio = (i: number) => ratioAt.get(i) ?? 1;

  // The demand curve was measured mid-corridor. Pre-scale the boundary inflow
  // so that after every interchange multiplier between the boundary and the
  // station, the flow at the station matches the measured curve.
  const stationIdx = dir === 'EB'
    ? Math.round((p.stationMp - MP0) / CELL_MI)
    : Math.round((MP1 - p.stationMp) / CELL_MI);
  let boundaryScale = 1;
  for (let i = 1; i <= Math.min(stationIdx, n - 1); i++) boundaryScale *= nodeRatio(i);
  const inflowScale = 1 / Math.max(0.2, boundaryScale);

  const kGp = new Float64Array(n);
  const kHov = new Float64Array(Math.max(1, hovLen));
  const hovLanesSub = new Array(Math.max(1, hovLen)).fill(1);
  const hovCapFSub = hovExists ? capF.slice(hovStart, hovEnd + 1) : [1];
  const speed = new Float32Array(TIME_BINS * n);
  const queueMiByBin = new Float32Array(TIME_BINS);
  const speedHov = hovExists ? new Float32Array(TIME_BINS * n) : null;
  const stepsPerBin = STEPS / TIME_BINS;

  const bridgeIdx = dir === 'EB'
    ? Math.round((BRIDGE_MP - MP0) / CELL_MI)
    : Math.round((MP1 - BRIDGE_MP) / CELL_MI);

  let vehHoursDelay = 0;
  let bridgeVehPeak = 0;
  let bridgeHovVehPeak = 0;
  let maxQueueMi = 0;
  let gpQueue = 0; // vehicles queued at the boundary that could not enter
  let hovQueue = 0;

  const freeFlowMin = ((MP1 - MP0) / VF) * 60;

  for (let s = 0; s < STEPS; s++) {
    const hour = Math.floor(s * DT_H) % 24;
    const hovShare = Math.min(0.9, ((p.demandCurveHov[hour] * p.hovShareScale) /
      Math.max(1, p.demandCurveGp[hour] + p.demandCurveHov[hour])));
    const total = (p.demandCurveGp[hour] + p.demandCurveHov[hour]) * p.demandScale * inflowScale;
    let hovDemand = hovExists ? total * hovShare : 0;
    let gpDemand = total - hovDemand;

    gpDemand += gpQueue / DT_H; gpQueue = 0;
    hovDemand += hovQueue / DT_H; hovQueue = 0;

    const hrNow = s * DT_H;
    const lanesNow = inc && hrNow >= inc.hourStart && hrNow < inc.hourEnd ? gpLIncident : gpL;
    const rGp = step(kGp, lanesNow, capF, gpDemand, 1, nodeRatio);
    gpQueue += rGp.spill * DT_H;
    if (hovExists) {
      const rHov = step(kHov, hovLanesSub, hovCapFSub, hovDemand, 1,
        (i) => nodeRatio(i + hovStart));
      hovQueue += rHov.spill * DT_H;
    }

    // metrics: delay = vehicle-hours spent below free-flow speed
    for (let i = 0; i < n; i++) {
      const kTot = kGp[i];
      const vGp = kTot > 0.5 ? Math.min(VF, (Math.min(VF * kTot, Q_LANE * lanesNow[i] * capF[i]) / kTot)) : VF;
      vehHoursDelay += kTot * CELL_MI * DT_H * Math.max(0, 1 - vGp / VF);
    }
    vehHoursDelay += gpQueue * DT_H + hovQueue * DT_H;
    const hr = s * DT_H;
    if (hr >= 6 && hr < 10) {
      bridgeVehPeak += Math.min(VF * kGp[bridgeIdx], Q_LANE * lanesNow[bridgeIdx] * capF[bridgeIdx]) * DT_H;
      if (hovExists && bridgeIdx >= hovStart && bridgeIdx <= hovEnd) {
        const bi = bridgeIdx - hovStart;
        bridgeHovVehPeak += Math.min(VF * kHov[bi], Q_LANE * hovCapFSub[bi]) * DT_H;
      }
    }
    let queueMi = gpQueue / (KJ_LANE * (lanesNow[0] || 1));
    for (let i = 0; i < n; i++) if (kGp[i] > 0.6 * KJ_LANE * lanesNow[i]) queueMi += CELL_MI;
    if (queueMi > maxQueueMi) maxQueueMi = queueMi;

    // record heatmap
    const bin = Math.floor(s / stepsPerBin);
    if (s % stepsPerBin === stepsPerBin - 1) {
      queueMiByBin[bin] = (gpQueue + hovQueue) / (KJ_LANE * Math.max(1, gpL[0] + (hovExists ? 1 : 0)));
      for (let i = 0; i < n; i++) {
        const kT = kGp[i];
        const qmaxI = Q_LANE * lanesNow[i] * capF[i];
        const vCtm = kT > 0.5 ? Math.min(VF, Math.min(VF * kT, qmaxI) / kT) : VF;
        // Near capacity, real freeway speeds sag before flow breaks down (the
        // triangular diagram holds free-flow speed right up to qmax). Shape the
        // recorded speed with an HCM-style dip: ~47 mph at full utilization.
        const util = Math.min(1, Math.min(VF * kT, qmaxI) / qmaxI);
        speed[bin * n + i] = Math.min(vCtm, VF * (1 - 0.22 * util * util * util));
        if (speedHov) {
          if (i < hovStart || i > hovEnd) {
            speedHov[bin * n + i] = speed[bin * n + i];
          } else {
            const kH = kHov[i - hovStart];
            const qmaxH = Q_LANE * hovCapFSub[i - hovStart];
            const vH = kH > 0.5 ? Math.min(VF, Math.min(VF * kH, qmaxH) / kH) : VF;
            const utilH = Math.min(1, Math.min(VF * kH, qmaxH) / qmaxH);
            speedHov[bin * n + i] = Math.min(vH, VF * (1 - 0.22 * utilH * utilH * utilH));
          }
        }
      }
    }
  }

  // travel time by departure hour: integrate cell speeds along the corridor
  const travelTimeByHour: number[] = [];
  const travelTimeByHourHov: number[] | null = speedHov ? [] : null;
  for (let h = 0; h < 24; h++) {
    const bin = Math.min(TIME_BINS - 1, Math.round(((h + 0.5) / 24) * TIME_BINS));
    let t = 0, tH = 0;
    for (let i = 0; i < n; i++) {
      t += CELL_MI / Math.max(5, speed[bin * n + i]);
      if (speedHov) tH += CELL_MI / Math.max(5, speedHov[bin * n + i]);
    }
    travelTimeByHour.push(t * 60);
    if (travelTimeByHourHov) travelTimeByHourHov.push(tH * 60);
  }

  const bridgePeoplePeak = bridgeVehPeak * p.gpOcc + bridgeHovVehPeak * p.hovOcc;

  return {
    queueMiByBin,
    speed, speedHov, timeBins: TIME_BINS, cells: n, cellMp: mp,
    travelTimeByHour, travelTimeByHourHov, freeFlowMin,
    vehHoursDelay: Math.round(vehHoursDelay),
    personHoursDelay: Math.round(vehHoursDelay * p.gpOcc),
    bridgeVehPeak: Math.round(bridgeVehPeak + bridgeHovVehPeak),
    bridgePeoplePeak: Math.round(bridgePeoplePeak),
    maxQueueMi: Math.round(maxQueueMi * 10) / 10,
  };
}
