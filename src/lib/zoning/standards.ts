// Seattle residential development standards, current to the 2026 land use code.
//
// IMPORTANT: Ordinance 127376 (CB 120993), effective 21 January 2026, collapsed
// NR1 / NR2 / NR3 / RSL into a single "NR" zone and renumbered all of SMC 23.44.
// The old sections (23.44.010 lot area, .012 height, .014 yards, .017 density)
// are repealed. Anything keyed to the old 5,000 / 7,200 / 9,600 sf minimum lot
// tiers is out of date. The same ordinance repealed LR density limits entirely.

export interface Standard {
  label: string;
  value: string;
  cite: string;
  varies?: boolean;
  note?: string;
}

/* ------------------------------------------------------------------ NR zone */

export type UnitType = 'attached' | 'stacked';

export interface NrInputs {
  lotArea: number;
  unitType: UnitType;
  /** Retains a Tier 1 tree, two Tier 2 trees, or meets Green Factor 0.6. */
  greenBonus: boolean;
  /** Within 1/4 mile walking distance of a major transit stop. */
  nearMajorTransit: boolean;
  /** Within a frequent transit service area (1/4 mi bus, 1/2 mi rail). */
  frequentTransit: boolean;
  /** Lot area occupied by deductible critical areas (see ECA_DEDUCTIBLE). */
  ecaDeduction?: number;
}

export interface NrResult {
  countableArea: number;
  densityDivisor: number;
  unitsFromDensity: number;
  unitsFloor: number;
  units: number;
  far: number;
  floorArea: number;
  smallLotFloorApplied: boolean;
  coverage: number;
  coverageArea: number;
  heightBase: number;
  heightBonus: number;
  setbacks: { front: number; rear: number; side: string };
  notes: string[];
}

/** Density divisor in square feet of lot area per dwelling unit. */
function densityDivisor(i: NrInputs): { divisor: number; why: string } {
  if (i.unitType === 'stacked') {
    if (i.greenBonus) return { divisor: 500, why: 'stacked units retaining a Tier 1 tree, two Tier 2 trees, or meeting Green Factor 0.6' };
    return { divisor: 600, why: 'stacked dwelling units' };
  }
  return { divisor: 1250, why: 'attached or detached dwelling units' };
}

/** FAR is set by the density actually achieved, not by the zone. */
function farForDensity(lotPerUnit: number, unitType: UnitType, greenBonus: boolean): { far: number; why: string } {
  if (lotPerUnit > 4000) return { far: 0.6, why: 'less dense than 1 unit per 4,000 sq ft' };
  if (lotPerUnit > 2200) return { far: 0.8, why: '1 unit per 4,000–2,201 sq ft' };
  if (lotPerUnit > 1600) return { far: 1.0, why: '1 unit per 2,200–1,601 sq ft' };
  if (unitType === 'stacked') {
    return greenBonus
      ? { far: 2.0, why: 'stacked units at 1 per 1,600 sq ft or denser, meeting the green or school-proximity test' }
      : { far: 1.8, why: 'stacked units at 1 per 1,600 sq ft or denser' };
  }
  return { far: 1.6, why: 'attached or detached units at 1 per 1,600 sq ft or denser' };
}

/**
 * Model what the NR zone allows on a lot. This follows the ordinance rather
 * than a lookup table because FAR and unit count are solved together.
 */
export function computeNr(i: NrInputs): NrResult {
  const notes: string[] = [];
  const countableArea = Math.max(0, i.lotArea - (i.ecaDeduction || 0));
  if (i.ecaDeduction) notes.push(`${i.ecaDeduction.toLocaleString('en-US')} sq ft deducted for critical areas that reduce yield.`);

  const { divisor, why } = densityDivisor(i);
  // 23.44.060.D.1: a fraction OVER 0.85 counts as one more unit. Not a floor().
  const raw = countableArea / divisor;
  const frac = raw - Math.floor(raw);
  const unitsFromDensity = Math.floor(raw) + (frac > 0.85 ? 1 : 0);
  if (frac > 0.85) {
    notes.push(`The density calculation lands at ${raw.toFixed(2)} units, and a fraction over 0.85 counts as a whole unit (23.44.060.D.1).`);
  }

  // The 4- and 6-unit floors do NOT apply to a lot containing riparian corridor,
  // wetland and buffer, submerged/shoreline-setback land, or designated
  // non-disturbance steep slope (23.44.060.C.1-.3).
  const floorsBlocked = (i.ecaDeduction || 0) > 0;
  let unitsFloor = 0;
  if (floorsBlocked) {
    notes.push('The 4- and 6-unit floors are unavailable because the lot contains critical areas that the code excludes from them (23.44.060.C.1-.3).');
  } else {
    if (countableArea < 5000) { unitsFloor = 4; notes.push('Lots under 5,000 sq ft are allowed 4 units regardless of density (23.44.060.C.1).'); }
    if (countableArea < 7500 && i.nearMajorTransit) { unitsFloor = 6; notes.push('Within a quarter mile of major transit, lots under 7,500 sq ft are allowed 6 units (23.44.060.C.2).'); }
  }

  const units = Math.max(unitsFromDensity, unitsFloor, 1);
  const lotPerUnit = units > 0 ? countableArea / units : countableArea;
  const { far, why: farWhy } = farForDensity(lotPerUnit, i.unitType, i.greenBonus);
  notes.push(`Floor area ratio ${far.toFixed(1)} applies because the proposal works out to ${farWhy}.`);

  let floorArea = far * countableArea;
  let smallLotFloorApplied = false;
  if (countableArea < 5000 && floorArea < 2500) {
    floorArea = 2500;
    smallLotFloorApplied = true;
    notes.push('Lots under 5,000 sq ft may build 2,500 sq ft of chargeable floor area or the FAR amount, whichever is greater (23.44.050.B).');
  }

  const coverage = i.unitType === 'stacked' ? 60 : 50;
  const front = units >= 3 ? 10 : 15;
  let rear = units >= 3 ? 10 : 15;
  let side = '5 ft average, 3 ft minimum';
  if (countableArea < 5000 && i.frequentTransit) {
    rear = 5; side = '3 ft';
    notes.push('Small lots inside a frequent transit service area get reduced rear and side setbacks.');
  }

  return {
    countableArea, densityDivisor: divisor, unitsFromDensity, unitsFloor, units,
    far, floorArea, smallLotFloorApplied,
    coverage, coverageArea: countableArea * (coverage / 100),
    heightBase: 32, heightBonus: 42,
    setbacks: { front, rear, side },
    notes,
  };
}

/* ------------------------------------------------- published standard tables */

export const NR_STANDARDS: Standard[] = [
  { label: 'Zone', value: 'NR — a single Neighborhood Residential zone', cite: 'Ord. 127376, effective 21 Jan 2026', note: 'NR1, NR2, NR3 and RSL were consolidated; the old minimum-lot-size tiers no longer exist.' },
  { label: 'Density — attached or detached', value: '1 unit per 1,250 sq ft of lot area', cite: 'SMC 23.44.060.A.4' },
  { label: 'Density — stacked flats', value: '1 unit per 600 sq ft, or 1 per 500 sq ft with the tree or Green Factor bonus', cite: 'SMC 23.44.060.A.1–.2', note: 'Stacked flats are the highest-yield configuration by a wide margin.' },
  { label: 'Units by right', value: '4 on any lot; 6 on lots under 7,500 sq ft within a quarter mile of major transit', cite: 'SMC 23.44.060.C.1–.3', varies: true, note: 'These floors do not apply to a lot containing riparian corridor, wetland, submerged land, or designated non-disturbance steep slope.' },
  { label: 'Density rounding', value: 'A fraction over 0.85 counts as one more unit', cite: 'SMC 23.44.060.D.1', note: 'A 7,400 sq ft lot works out to 5.92 units, which the code rounds to 6.' },
  { label: 'Floor area ratio', value: '0.6 to 2.0, set by the density actually proposed', cite: 'Table A for SMC 23.44.050', varies: true },
  { label: 'Small-lot floor area', value: 'Lots under 5,000 sq ft: 2,500 sq ft or the FAR amount, whichever is greater', cite: 'SMC 23.44.050.B' },
  { label: 'Maximum height', value: '32 ft base; 42 ft with any qualifying bonus', cite: 'SMC 23.44.070.A', note: 'Retaining one Tier 1 or Tier 2 tree is enough to reach 42 ft, so treat 42 as the realistic design height.' },
  { label: 'Roof additions', value: 'Pitched ridge +5 ft, green roof +2 ft, solar +4 ft, parapets and railings +4 ft', cite: 'SMC 23.44.070.B–.C', note: 'These stack on top of 32 or 42 ft.' },
  { label: 'Front setback', value: '15 ft with 1–2 units; 10 ft with 3 or more', cite: 'Table A for SMC 23.44.090' },
  { label: 'Rear setback', value: '15 ft with 1–2 units; 10 ft with 3+; 0 ft where it abuts an alley', cite: 'Table A for SMC 23.44.090', varies: true },
  { label: 'Side setback', value: '5 ft average, 3 ft minimum', cite: 'Table A for SMC 23.44.090', varies: true, note: 'A flat 3 ft on lots under 5,000 sq ft inside a frequent transit service area.' },
  { label: 'Lot coverage', value: '50%; 60% for stacked units or the cottage-court layout', cite: 'SMC 23.44.080.A, .F, .G' },
  { label: 'Maximum structure width', value: '90 ft', cite: 'SMC 23.44.130' },
  { label: 'Amenity area', value: '25% of lot area for stacked units, 20% for attached and detached', cite: 'SMC 23.44.110', varies: true },
  { label: 'Parking', value: '1 space per 2 units, but zero in most of Seattle', cite: 'Table B for SMC 23.54.015', note: 'No parking is required in urban villages within transit areas, or for any unit under 1,200 sq ft, or for ADUs.' },
];

export const ADU_STANDARDS: Standard[] = [
  { label: 'Number allowed', value: 'Up to 2 per lot, attached, detached or stacked', cite: 'SMC 23.42.022.C–.D' },
  { label: 'Maximum size', value: '1,000 sq ft with up to 2 bedrooms; 1,200 sq ft with 3 or more', cite: 'SMC 23.42.022.G.1' },
  { label: 'Excluded from the size cap', value: 'Up to 250 sq ft of attached garage, all underground stories, 35 sq ft of bike parking', cite: 'SMC 23.42.022.G.2' },
  { label: 'Counts toward density and FAR', value: 'Yes — the former exemption was repealed', cite: 'SMC 23.42.022.E, .J', note: 'An ADU now consumes unit count and floor area rather than being additional to them.' },
  { label: 'Owner occupancy', value: 'Not required', cite: 'SMC 23.42.022' },
  { label: 'Parking', value: 'None required', cite: 'SMC 23.42.022.I' },
  { label: 'Rear setback', value: '5 ft, or 0 ft abutting an alley', cite: 'Table A for SMC 23.44.090 fn.3' },
];

export const LR_STANDARDS: Standard[] = [
  { label: 'Density limits', value: 'None — repealed', cite: 'Ord. 127376 §36 repealing SMC 23.45.512', note: 'Unit count in LR zones is now governed only by FAR, height, setbacks and amenity area.' },
  { label: 'Floor area ratio, with an (M) suffix', value: 'LR1 1.3 · LR2 1.4 · LR3 1.8 outside urban villages, 2.3 inside', cite: 'Table A for SMC 23.45.510', varies: true, note: 'Stacked-unit configurations get more.' },
  { label: 'Floor area ratio, without (M)', value: 'LR1 1.0 · LR2 1.1 · LR3 1.2', cite: 'Table A for SMC 23.45.510', varies: true },
  { label: 'Height', value: 'LR1 32 ft · LR2 40 ft · LR3 40–50 ft; each drops to 32 ft without an (M) suffix', cite: 'Table A for SMC 23.45.514', varies: true },
  { label: 'Setbacks', value: 'Front 7 ft average / 5 ft min; rear the same, or 0 ft at an alley; side a flat 5 ft', cite: 'Table A for SMC 23.45.518', note: 'The old matrix that varied by housing type was repealed in favour of one uniform table.' },
  { label: 'Upper-level setback', value: '12 ft from any line abutting an NR lot above 34 ft', cite: 'SMC 23.45.518.A.2', note: 'This is the rule that most often reshapes an LR3 building.' },
];

export const COMMERCIAL_STANDARDS: Standard[] = [
  { label: 'Height', value: 'Whatever the Official Land Use Map designates for the parcel', cite: 'SMC 23.47A.012', varies: true },
  { label: 'Floor area ratio', value: 'Keyed to the mapped height: roughly 2.25 at 30 ft, 3.0 at 40 ft, 4.25 at 65 ft, 4.5 at 85 ft', cite: 'Table A for SMC 23.47A.013', varies: true },
  { label: 'Station Area Overlay', value: 'A higher FAR table applies — roughly 3.0 / 4.0 / 5.75 / 6.0 / 7.0', cite: 'Table B for SMC 23.47A.013', varies: true },
];

/* ---------------------------------------------------------------- ECA rules */

/** Only these critical areas reduce density, minimum lot size and lot coverage. */
export const ECA_DEDUCTIBLE = [
  'Riparian corridors',
  'Wetlands and their buffers',
  'Submerged land and area within the shoreline setback',
  'Designated non-disturbance area in steep slopes',
];

export const ECA_EFFECTS: Standard[] = [
  { label: 'What actually reduces yield', value: 'Only riparian corridors, wetlands, submerged/shoreline land, and designated non-disturbance steep slope', cite: 'SMC 23.44.060.D.6, 23.44.080.B', note: 'Liquefaction, peat, seismic, flood-prone and plain landslide-prone designations do NOT reduce the units or floor area a lot can hold.' },
  { label: 'Steep slope definition', value: 'A slope of 40% or steeper over at least 10 ft of vertical rise', cite: 'SMC 25.09.012.A.4' },
  { label: 'Steep slope buffer', value: '15 ft from the top and the toe', cite: 'SMC 25.09.090.C.1' },
  { label: 'Development in a steep slope area', value: 'Prohibited unless relief or a variance is granted', cite: 'SMC 25.09.090.B.2', varies: true, note: 'Slopes under 20 ft of rise and 30 ft or more from other steep slope areas commonly qualify for relief.' },
  { label: 'Geotechnical report', value: 'Required for development in a landslide-prone area', cite: 'SMC 25.09.080', note: 'Landslide-prone is broader than steep-slope, so a lot can need geotech without losing buildable area.' },
  { label: 'Lot coverage floor', value: 'Never less than 625 sq ft on a critical-areas lot', cite: 'SMC 23.44.080.D' },
];

export function familyFor(zone: string): 'NR' | 'LR' | 'MR' | 'COMMERCIAL' | null {
  const z = String(zone || '').toUpperCase().trim();
  if (/^(NR|SF|RSL)/.test(z)) return 'NR';
  if (/^LR/.test(z)) return 'LR';
  if (/^(MR|HR)/.test(z)) return 'MR';
  if (/^(NC|C1|C2|SM|D|IB|IC|IG|MPC|UI|UV)/.test(z)) return 'COMMERCIAL';
  return null;
}
