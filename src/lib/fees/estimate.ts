// Fee calculation, mirroring the City's 2026 Fee Estimator workbook exactly,
// then adding the lines that workbook leaves out.
//
// The City's sheet computes: value from the BVD table -> Development Fee Index
// (Table D-1) -> plan review (100% of DFI) + permit fee (100% of DFI, split
// half at intake and half at issuance) -> 5% technology fee -> state surcharge.
// Everything past `core` below is our addition.

import { BVD, DFI_TIERS, BASE_FEE, STATE_SURCHARGE, STATE_SURCHARGE_PER_EXTRA_UNIT, TECH_FEE_RATE } from './tables';

export type BuildingType = 'Residential' | 'Commercial' | 'Mixed Use';

export interface AreaInput {
  /** IBC occupancy group, e.g. "R-3". */
  group: string;
  /** Construction type, e.g. "VB". */
  type: string;
  sqft: number;
}

export interface EstimateInput {
  areas: AreaInput[];
  /** Value of alteration/tenant-improvement work not captured by new area. */
  additionalWork?: number;
  /** Stories above grade; only affects IA/IB per the City's sheet. */
  stories?: number;
  buildingType?: BuildingType;
  dwellingUnits?: number;
  /** Optional extras we model that the City's sheet omits. */
  extras?: ExtrasInput;
}

export interface ExtrasInput {
  /** Land use review (design review, SEPA, variance, subdivision...). */
  landUse?: number;
  /** Geotechnical / ECA review, typically hourly. */
  geotechHours?: number;
  /** Drainage / grading review. */
  drainage?: number;
  /** Anticipated extra plan-review or revision hours. */
  extraReviewHours?: number;
  /** SDCI hourly rate to apply to the hour-based lines. */
  hourlyRate?: number;
  /** Flat other charges (street use, utility connections, MHA payment...). */
  other?: number;
}

/** Look up $/sq ft for an occupancy + construction type. */
export function costPerSqFt(group: string, type: string): number | null {
  const row = BVD.find((o) => o.group === group);
  if (!row) return null;
  const v = row.costs[type];
  return typeof v === 'number' ? v : null;
}

/** Value of new construction, per Step 1 of the City's sheet. */
export function newConstructionValue(areas: AreaInput[]): number {
  return areas.reduce((sum, a) => {
    const c = costPerSqFt(a.group, a.type);
    if (!c || !a.sqft) return sum;
    return sum + c * a.sqft;
  }, 0);
}

/**
 * The City applies a small multiplier for tall IA/IB buildings:
 * each story above the third adds 0.5%.
 */
export function storyMultiplier(stories: number | undefined, areas: AreaInput[]): number {
  const hasHighRiseType = areas.some((a) => a.type === 'IA' || a.type === 'IB');
  if (!hasHighRiseType || !stories || stories <= 3) return 1;
  return (stories - 3) * 0.005 + 1;
}

/** Round up the way Table D-1 does before applying the marginal rate. */
function ceilForTier(value: number): number {
  const step = value < 175000 ? 100 : 1000;
  return Math.ceil(value / step) * step;
}

/**
 * Development Fee Index — Fee Subtitle Table D-1.
 * Tiered: a base amount plus a marginal rate on value above the tier floor.
 */
export function developmentFeeIndex(value: number): number {
  if (!value || value <= 0) return 0;
  const v = ceilForTier(value);
  for (const t of DFI_TIERS) {
    const inTier = v < t.upTo || (t.upTo === 200000000 && v > t.upTo);
    if (!inTier) continue;
    let fee = t.base;
    if (t.per100) fee += ((v - t.from) / 100) * t.per100;
    else if (t.per1000) fee += ((v - t.from) / 1000) * t.per1000;
    return Math.max(BASE_FEE, fee);
  }
  // Above the top tier.
  const last = DFI_TIERS[DFI_TIERS.length - 1];
  return Math.max(BASE_FEE, last.base + ((v - last.from) / 1000) * (last.per1000 || 0));
}

export interface FeeLine {
  label: string;
  amount: number;
  when: 'intake' | 'issuance' | 'later';
  cite?: string;
  note?: string;
  ours?: boolean; // true when this line is absent from the City's estimator
}

export interface Estimate {
  value: number;
  valueBeforeMultiplier: number;
  multiplier: number;
  dfi: number;
  lines: FeeLine[];
  intakeTotal: number;
  issuanceTotal: number;
  laterTotal: number;
  total: number;
  cityOnlyTotal: number;
}

export function estimate(input: EstimateInput): Estimate {
  const base = newConstructionValue(input.areas);
  const mult = storyMultiplier(input.stories, input.areas);
  const additional = input.additionalWork || 0;
  const value = base * mult + additional;

  const dfi = developmentFeeIndex(value);

  const planReview = dfi;                                   // 100% of DFI
  const permitHalfAtIntake = dfi === 0 ? 0 : Math.max(BASE_FEE, 0.5 * dfi);
  const permitRemainder = Math.max(0, dfi - permitHalfAtIntake);

  const intakeSubtotal = planReview + permitHalfAtIntake;
  const techIntake = intakeSubtotal * TECH_FEE_RATE;
  const techIssuance = permitRemainder * TECH_FEE_RATE;

  const bt: BuildingType = input.buildingType || 'Residential';
  const units = input.dwellingUnits || 0;
  const surcharge =
    value === 0 ? 0 : (STATE_SURCHARGE[bt] || 0) + (units > 0 ? (units - 1) * STATE_SURCHARGE_PER_EXTRA_UNIT : 0);

  const lines: FeeLine[] = [
    { label: 'Plan review fee', amount: planReview, when: 'intake', cite: 'Fee Subtitle Table D-2 — 100% of the Development Fee Index' },
    { label: 'Permit fee — half due at intake', amount: permitHalfAtIntake, when: 'intake', cite: 'SMC 22.900D.010.A.2' },
    { label: 'Technology fee on intake (5%)', amount: techIntake, when: 'intake', cite: 'SMC 22.900A.100' },
    { label: 'Permit fee — balance at issuance', amount: permitRemainder, when: 'issuance', cite: 'SMC 22.900D.010.A.2' },
    { label: 'Technology fee on issuance (5%)', amount: techIssuance, when: 'issuance', cite: 'SMC 22.900A.100' },
    { label: 'Washington State building permit surcharge', amount: surcharge, when: 'issuance', cite: 'RCW 19.27.085', note: units > 1 ? `${bt} base plus $2 for each unit past the first` : bt },
  ];

  const cityOnlyTotal = lines.reduce((s, l) => s + l.amount, 0);

  // --- lines the City's own estimator does not model ---
  const x = input.extras || {};
  const rate = x.hourlyRate || 0;
  const add = (label: string, amount: number, when: FeeLine['when'], cite: string, note?: string) => {
    if (amount > 0) lines.push({ label, amount, when, cite, note, ours: true });
  };
  add('Land use review', x.landUse || 0, 'intake', 'Fee Subtitle chapter C', 'Design review, SEPA, variance, subdivision');
  add('Geotechnical / critical-areas review', (x.geotechHours || 0) * rate, 'intake', 'SMC 22.900D.145', x.geotechHours ? `${x.geotechHours} hrs at $${rate}/hr` : undefined);
  add('Drainage & grading review', x.drainage || 0, 'intake', 'Fee Subtitle chapter D');
  add('Allowance for revisions / extra review', (x.extraReviewHours || 0) * rate, 'later', 'Fee Subtitle hourly rates', x.extraReviewHours ? `${x.extraReviewHours} hrs at $${rate}/hr` : undefined);
  add('Other charges', x.other || 0, 'later', 'Varies', 'Street use, utility connections, MHA payment');

  const sumWhen = (w: FeeLine['when']) => lines.filter((l) => l.when === w).reduce((s, l) => s + l.amount, 0);

  return {
    value,
    valueBeforeMultiplier: base + additional,
    multiplier: mult,
    dfi,
    lines,
    intakeTotal: sumWhen('intake'),
    issuanceTotal: sumWhen('issuance'),
    laterTotal: sumWhen('later'),
    total: lines.reduce((s, l) => s + l.amount, 0),
    cityOnlyTotal,
  };
}
