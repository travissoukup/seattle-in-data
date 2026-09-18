// Charges a Seattle construction project pays that are NOT SDCI permit fees,
// and therefore never appear in the City's own fee estimator.
//
// Rates are 2026. Sources are cited per item; see each `cite` field.

export interface OtherCharge {
  key: string;
  label: string;
  amount: number;
  cite: string;
  note?: string;
  /** Payable to someone other than SDCI. */
  payee: string;
}

/* ------------------------------------------- Seattle Public Utilities (SPU) */

/** Capacity charge per meter size — water and wastewater. Director's Rule FIN-220.2. */
export const SPU_CAPACITY: Record<string, { water: number; sewer: number }> = {
  '3/4 in': { water: 6900, sewer: 2600 },
  '1 in': { water: 11730, sewer: 4420 },
  '1.5 in': { water: 22770, sewer: 8580 },
  '2 in': { water: 36570, sewer: 13780 },
};

/** Water tap installation, by meter size and street type. */
export const SPU_TAP: Record<string, { nonArterial: number; arterial: number }> = {
  '3/4 in': { nonArterial: 4800, arterial: 6175 },
  '1 in': { nonArterial: 4975, arterial: 6350 },
  '1.5 in': { nonArterial: 8050, arterial: 9150 },
  '2 in': { nonArterial: 8975, arterial: 10050 },
};

/** Drainage system development charge, per 1,000 sq ft of NEW hard surface. */
export const SPU_DRAINAGE_PER_1000SF = 1225;

/** Side sewer permits, new construction (sanitary + storm). */
export const SPU_SIDE_SEWER_NEW = 750;

/* ------------------------------------ King County Wastewater Capacity Charge */

/** Monthly charge per residential customer equivalent, billed 15 years. */
export const KC_CAPACITY_MONTHLY = 77.99;
export const KC_CAPACITY_MONTHS = 180;
export const KC_RCE: Record<string, number> = {
  'Single family, small': 0.81,
  'Single family, medium': 1.0,
  'Single family, large': 1.16,
  'ADU or DADU': 0.59,
};

/* -------------------------------------------------- Seattle City Light (SCL) */

/** Standard new-service charge by amperage and overhead vs underground. */
export const SCL_SERVICE: Record<string, { overhead: number; underground: number }> = {
  '0–200 A': { overhead: 1502, underground: 5494 },
  '201–400 A': { overhead: 2463, underground: 6270 },
  '401–600 A': { overhead: 3940, underground: 7620 },
};
export const SCL_TEMP_SERVICE = { overhead: 1057, underground: 1998 };

/* ----------------------------------------------------------------- SDOT */

export const SDOT = {
  rowSimple: 214,
  rowComplex: 744,
  hourly: 367,
};

/** SDCI land use review hourly rate, SMC 22.900B.010. */
export const SDCI_LAND_USE_HOURLY = 551;
/** A street improvement exception is billed at the SDCI land use rate, 2-hour minimum. */
export const STREET_IMPROVEMENT_EXCEPTION_MIN = SDCI_LAND_USE_HOURLY * 2;

/** Drainage/wastewater core tap, billed on the side sewer invoice but NOT in the $750. */
export const SPU_CORE_TAP = { '6 inch': 720, '8 or 10 inch': 820 };

/* ------------------------------------------------------------- Sales tax */

/** Seattle combined retail sales tax, effective 1 January 2026. */
export const SALES_TAX_RATE = 0.1055;

/* --------------------------------------------------------------- MHA */

/** Residential MHA payment, $/sq ft, outside Downtown. SMC 23.58C.040 Table B. */
export const MHA_RESIDENTIAL: Record<string, Record<string, number>> = {
  Low: { M: 10.78, M1: 17.33, M2: 19.26 },
  Medium: { M: 20.41, M1: 30.81, M2: 34.28 },
  High: { M: 31.97, M1: 45.83, M2: 50.46 },
};

export interface ProjectCostInputs {
  /** Construction contract value, used for sales tax. */
  contractValue: number;
  newMeter: keyof typeof SPU_CAPACITY | 'none';
  arterial: boolean;
  newHardSurfaceSf: number;
  existingHardSurfaceSf: number;
  rceType: keyof typeof KC_RCE | 'none';
  electricalService: keyof typeof SCL_SERVICE | 'none';
  undergroundPower: boolean;
  sideSewer: boolean;
  streetImprovementException: boolean;
  /** MHA only applies to redevelopment in an (M)-suffixed zone. */
  mhaArea?: 'Low' | 'Medium' | 'High' | 'none';
  mhaSuffix?: 'M' | 'M1' | 'M2';
  mhaFloorAreaSf?: number;
}

export function computeOtherCharges(i: ProjectCostInputs): OtherCharge[] {
  const out: OtherCharge[] = [];
  const add = (key: string, label: string, amount: number, payee: string, cite: string, note?: string) => {
    if (amount > 0) out.push({ key, label, amount, payee, cite, note });
  };

  if (i.newMeter !== 'none') {
    const cap = SPU_CAPACITY[i.newMeter];
    const tap = SPU_TAP[i.newMeter];
    add('water-sdc', `Water capacity charge (${i.newMeter} meter)`, cap.water, 'Seattle Public Utilities', 'Director\'s Rule FIN-220.2');
    add('sewer-sdc', 'Wastewater capacity charge', cap.sewer, 'Seattle Public Utilities', 'Director\'s Rule FIN-220.2');
    add('tap', `Water tap installation (${i.arterial ? 'arterial' : 'non-arterial'} street)`, i.arterial ? tap.arterial : tap.nonArterial, 'Seattle Public Utilities', '2026 SPU fee schedule');
  }

  const newHard = Math.max(0, i.newHardSurfaceSf - i.existingHardSurfaceSf);
  add('drainage-sdc', 'Drainage capacity charge', (newHard / 1000) * SPU_DRAINAGE_PER_1000SF, 'Seattle Public Utilities',
    'Director\'s Rule FIN-220.2', `${newHard.toLocaleString('en-US')} sq ft of net new hard surface at $${SPU_DRAINAGE_PER_1000SF} per 1,000 sq ft. Green roofs and permeable paving count.`);

  if (i.sideSewer) {
    add('side-sewer', 'Side sewer permits (sanitary + storm)', SPU_SIDE_SEWER_NEW, 'Seattle Public Utilities', 'SMC 21.16');
    add('core-tap', 'Drainage / wastewater core tap', SPU_CORE_TAP['6 inch'], 'Seattle Public Utilities',
      "Director's Rule FIN-220.2 §I", 'Billed on the same invoice as the side sewer permit but priced separately. A 6-inch tap in normal hours; after-hours and larger taps cost more.');
  }

  if (i.rceType !== 'none') {
    const rce = KC_RCE[i.rceType];
    add('kc-capacity', 'King County wastewater capacity charge', KC_CAPACITY_MONTHLY * rce * KC_CAPACITY_MONTHS,
      'King County', '2026 rate, RCW 35.58', `$${(KC_CAPACITY_MONTHLY * rce).toFixed(2)} a month for 15 years, billed to the owner after connection. Payable as a lump sum at a discount.`);
  }

  if (i.electricalService !== 'none') {
    const s = SCL_SERVICE[i.electricalService];
    add('scl', `Electrical service connection (${i.electricalService}, ${i.undergroundPower ? 'underground' : 'overhead'})`,
      i.undergroundPower ? s.underground : s.overhead, 'Seattle City Light', 'DPP 500 P III-417',
      'A new 200 A residential service draws no per-amp fee; this is the standard connection charge.');
  }

  if (i.streetImprovementException) {
    add('sdot-sie', 'Street improvement exception review', STREET_IMPROVEMENT_EXCEPTION_MIN, 'SDCI',
      'SMC 22.900B.010; SMC 23.53; SDCI Tip 205',
      `Two-hour minimum at the SDCI land use rate of $${SDCI_LAND_USE_HOURLY}/hr; more billed as incurred. Typical review is four to six weeks.`);
  }

  if (i.mhaArea && i.mhaArea !== 'none' && i.mhaSuffix && i.mhaFloorAreaSf) {
    const rate = MHA_RESIDENTIAL[i.mhaArea][i.mhaSuffix];
    add('mha', `Mandatory Housing Affordability payment (${i.mhaArea} area, ${i.mhaSuffix})`, rate * i.mhaFloorAreaSf,
      'City of Seattle', 'SMC 23.58C.040 Table B', `$${rate.toFixed(2)} per sq ft of residential floor area. You may perform instead of pay by including affordable units.`);
  }

  add('sales-tax', 'Retail sales tax on construction', i.contractValue * SALES_TAX_RATE, 'Washington State / King County',
    'WA DOR location code 1726', `${(SALES_TAX_RATE * 100).toFixed(2)}% applies to the whole contract including labour, subcontractors and profit. Usually the single largest line on this list.`);

  return out.sort((a, b) => b.amount - a.amount);
}
