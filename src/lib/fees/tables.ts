// Seattle SDCI permit fee engine.
//
// Transcribed from the City's own 2026 Fee Estimator workbook so the numbers
// agree with what SDCI will actually invoice, then extended with the fee lines
// the City's spreadsheet leaves out. See src/lib/fees/README for provenance.
//
// Building Valuation Data: 2025 $/sq ft from SDCI Director's Rule (July update),
// as shipped in the 2026 Fee Estimator. Development Fee Index: Fee Subtitle
// Table D-1. Fee split and technology fee: SMC 22.900D.010.A.2 and 22.900A.100.

export const CONSTRUCTION_TYPES = ["IA", "IB", "IIA", "IIB", "IIIA", "IIIB", "IV", "VA", "VB"] as const;
export type ConstructionType = (typeof CONSTRUCTION_TYPES)[number];

export interface Occupancy {
  group: string;
  desc: string;
  icbo: string;
  costs: Record<string, number | null>;
}

/** IBC occupancy group x construction type, dollars per square foot. */
export const BVD: Occupancy[] = [
  { group: 'A-1', desc: 'Assembly, theaters, with stage', icbo: 'Theaters, auditoriums', costs: { IA: 371.72, IB: 358.5, IIA: 347.92, IIB: 334.21, IIIA: 312.29, IIIB: 303.24, IV: 322.78, VA: 291.01, VB: 279.88 } },
  { group: 'A-1a', desc: 'Assembly, theaters, without stage', icbo: 'Theaters, auditoriums', costs: { IA: 341.28, IB: 328.05, IIA: 317.47, IIB: 303.76, IIIA: 282.11, IIIB: 273.07, IV: 292.34, VA: 260.84, VB: 249.71 } },
  { group: 'A-2', desc: 'Assembly, nightclubs', icbo: '', costs: { IA: 293.91, IB: 285.29, IIA: 276.34, IIB: 265.8, IIIA: 248.96, IIIB: 242.2, IV: 256.68, VA: 226.41, VB: 217.82 } },
  { group: 'A-2a', desc: 'Assembly, restaurants, bars, banquet halls', icbo: 'Restaurants', costs: { IA: 292.8, IB: 284.18, IIA: 274.11, IIB: 264.69, IIIA: 246.74, IIIB: 241.09, IV: 255.57, VA: 224.18, VB: 216.71 } },
  { group: 'A-3', desc: 'Assembly, churches', icbo: 'Churches', costs: { IA: 346.37, IB: 333.15, IIA: 322.57, IIB: 308.86, IIIA: 287.35, IIIB: 278.3, IV: 297.43, VA: 266.07, VB: 254.94 } },
  { group: 'A-3a', desc: 'Assembly, general, community halls, libraries, museums', icbo: 'Bowling alleys, libraries', costs: { IA: 290.88, IB: 277.66, IIA: 265.96, IIB: 253.36, IIIA: 230.6, IIIB: 222.67, IV: 241.94, VA: 209.33, VB: 199.31 } },
  { group: 'A-4', desc: 'Assembly, arenas', icbo: '', costs: { IA: 340.16, IB: 326.94, IIA: 315.25, IIB: 302.65, IIIA: 279.89, IIIB: 271.95, IV: 291.23, VA: 258.61, VB: 248.59 } },
  { group: 'B', desc: 'Business', icbo: 'Banks, Medical Office, Office', costs: { IA: 293.15, IB: 282.41, IIA: 271.98, IIB: 260.51, IIIA: 237.27, IIIB: 227.98, IV: 250.28, VA: 209.4, VB: 199.96 } },
  { group: 'E', desc: 'Educational', icbo: 'Schools', costs: { IA: 310.75, IB: 299.95, IIA: 290.47, IIB: 278.44, IIIA: 259.86, IIIB: 246.58, IV: 268.87, VA: 227.67, VB: 220.37 } },
  { group: 'F-1', desc: 'Factory and industrial, moderate hazard', icbo: 'Industrial plants', costs: { IA: 180.89, IB: 172.16, IIA: 161.31, IIB: 155.25, IIIA: 138.22, IIIB: 131.52, IV: 148.01, VA: 114.61, VB: 106.74 } },
  { group: 'F-2', desc: 'Factory and industrial, low hazard', icbo: 'Industrial plants', costs: { IA: 179.78, IB: 171.05, IIA: 161.31, IIB: 154.13, IIIA: 138.22, IIIB: 130.41, IV: 146.9, VA: 114.61, VB: 105.63 } },
  { group: 'H-1', desc: 'High Hazard, explosives', icbo: '', costs: { IA: 168.78, IB: 160.06, IIA: 150.32, IIB: 143.14, IIIA: 127.56, IIIB: 119.75, IV: 135.91, VA: 103.96, VB: null } },
  { group: 'H-2,3,4', desc: 'High Hazard', icbo: '', costs: { IA: 168.78, IB: 160.06, IIA: 150.32, IIB: 143.14, IIIA: 127.56, IIIB: 119.75, IV: 135.91, VA: 103.96, VB: 94.97 } },
  { group: 'H-5', desc: 'HPM', icbo: '', costs: { IA: 325.53, IB: 313.97, IIA: 302.7, IIB: 289.9, IIIA: 264.72, IIIB: 255.32, IV: 278.76, VA: 236.58, VB: 225.76 } },
  { group: 'I-1', desc: 'Institutional, supervised environment', icbo: 'Convalescent hospitals, homes for the elderly', costs: { IA: 294.87, IB: 284.45, IIA: 274.73, IIB: 265.01, IIIA: 242.23, IIIB: 235.54, IV: 265.06, VA: 217.94, VB: 211.1 } },
  { group: 'I-2', desc: 'Institutional, incapacitated', icbo: 'Hospitals', costs: { IA: 511.8, IB: 500.24, IIA: 488.97, IIB: 476.16, IIIA: 448.83, IIIB: null, IV: 465.03, VA: 420.69, VB: null } },
  { group: 'I-2a', desc: 'Institutional,', icbo: 'Nursing homes', costs: { IA: 355.28, IB: 341.53, IIA: 330.27, IIB: 317.46, IIIA: 293.94, IIIB: null, IV: 306.32, VA: 265.8, VB: null } },
  { group: 'I-3', desc: 'Institutional, restrained', icbo: 'Jails', costs: { IA: 380.07, IB: 368.51, IIA: 357.24, IIB: 344.43, IIIA: 320.92, IIIB: 310.4, IV: 333.3, VA: 292.78, VB: 279.73 } },
  { group: 'I-4', desc: 'Institutional, day care facilities', icbo: '', costs: { IA: 294.87, IB: 284.45, IIA: 274.73, IIB: 265.01, IIIA: 242.23, IIIB: 235.54, IV: 265.06, VA: 217.94, VB: 211.1 } },
  { group: 'M', desc: 'Mercantile', icbo: 'Stores, service stations (mini-marts)', costs: { IA: 219.35, IB: 210.73, IIA: 197.88, IIB: 191.24, IIIA: 173.99, IIIB: 168.35, IV: 182.12, VA: 151.44, VB: 143.97 } },
  { group: 'R-1', desc: 'Residential, hotels', icbo: 'Hotels and motels', costs: { IA: 297.64, IB: 287.22, IIA: 277.5, IIB: 267.79, IIIA: 245.55, IIIB: 238.85, IV: 267.83, VA: 221.26, VB: 214.41 } },
  { group: 'R-2', desc: 'Residential, multiple family', icbo: 'Apartment houses', costs: { IA: 248.87, IB: 238.46, IIA: 228.74, IIB: 219.02, IIIA: 197.86, IIIB: 191.17, IV: 219.07, VA: 173.57, VB: 166.73 } },
  { group: 'R-3', desc: 'Residential, one- and two-family', icbo: 'Dwellings', costs: { IA: 235.7, IB: 229.1, IIA: 223.7, IIB: 219.4, IIIA: 211.87, IIIB: 204.03, IV: 215.64, VA: 197.75, VB: 186.29 } },
  { group: 'R-4', desc: 'Residential care, assisted living facilities', icbo: '', costs: { IA: 294.87, IB: 284.45, IIA: 274.73, IIB: 265.01, IIIA: 242.23, IIIB: 235.54, IV: 265.06, VA: 217.94, VB: 211.1 } },
  { group: 'S-1', desc: 'Storage, moderate hazard', icbo: 'Service stations (canopies & service bays), warehouses', costs: { IA: 167.67, IB: 158.94, IIA: 148.09, IIB: 142.03, IIIA: 125.34, IIIB: 118.64, IV: 134.79, VA: 101.73, VB: 93.86 } },
  { group: 'S-2', desc: 'Storage, low hazard', icbo: 'Public garages, warehouse', costs: { IA: 166.56, IB: 157.83, IIA: 148.09, IIB: 140.91, IIIA: 125.34, IIIB: 117.53, IV: 133.68, VA: 101.73, VB: 92.75 } },
  { group: 'U', desc: 'Utility, miscellaneous', icbo: 'Residential garage, private garage', costs: { IA: 128.3, IB: 120.74, IIA: 112.33, IIB: 107.51, IIIA: 95.74, IIIB: 89.45, IV: 102.33, VA: 75.79, VB: 72.18 } },
  { group: 'X', desc: '', icbo: 'Open carports, decks, piers & floats associated with r-3', costs: { IA: 64.15, IB: 60.37, IIA: 56.17, IIB: 53.75, IIIA: 47.87, IIIB: 44.72, IV: 51.16, VA: 37.89, VB: 36.09 } },
];

/** Fee Subtitle Table D-1. Each tier is base + a marginal rate above `from`. */
export const DFI_TIERS = [
  { from: 0, upTo: 1000, base: 325.0, per100: null, per1000: null },
  { from: 1000, upTo: 25000, base: 325.0, per100: 1.6, per1000: null },
  { from: 25000, upTo: 50000, base: 709.0, per100: 1.55, per1000: null },
  { from: 50000, upTo: 75000, base: 1096.5, per100: 1.5, per1000: null },
  { from: 75000, upTo: 100000, base: 1471.5, per100: 1.4, per1000: null },
  { from: 100000, upTo: 175000, base: 1821.5, per100: null, per1000: 7.75 },
  { from: 175000, upTo: 250000, base: 2402.75, per100: null, per1000: 7.75 },
  { from: 250000, upTo: 500000, base: 2984.0, per100: null, per1000: 7.5 },
  { from: 500000, upTo: 750000, base: 4859.0, per100: null, per1000: 7.0 },
  { from: 750000, upTo: 1000000, base: 6609.0, per100: null, per1000: 7.0 },
  { from: 1000000, upTo: 1500000, base: 8359.0, per100: null, per1000: 6.75 },
  { from: 1500000, upTo: 2000000, base: 11734.0, per100: null, per1000: 6.75 },
  { from: 2000000, upTo: 2500000, base: 14984.0, per100: null, per1000: 6.0 },
  { from: 2500000, upTo: 3000000, base: 17984.0, per100: null, per1000: 6.0 },
  { from: 3000000, upTo: 3500000, base: 20984.0, per100: null, per1000: 5.25 },
  { from: 3500000, upTo: 4000000, base: 23609.0, per100: null, per1000: 5.25 },
  { from: 4000000, upTo: 4500000, base: 26109.0, per100: null, per1000: 4.5 },
  { from: 4500000, upTo: 5000000, base: 28359.0, per100: null, per1000: 4.5 },
  { from: 5000000, upTo: 10000000, base: 30609.0, per100: null, per1000: 4.0 },
  { from: 10000000, upTo: 25000000, base: 50609.0, per100: null, per1000: 4.0 },
  { from: 25000000, upTo: 50000000, base: 110609.0, per100: null, per1000: 4.0 },
  { from: 50000000, upTo: 75000000, base: 191859.0, per100: null, per1000: 2.75 },
  { from: 75000000, upTo: 100000000, base: 260609.0, per100: null, per1000: 2.75 },
  { from: 100000000, upTo: 150000000, base: 329359.0, per100: null, per1000: 2.25 },
  { from: 150000000, upTo: 200000000, base: 441859.0, per100: null, per1000: 2.25 },
  { from: 200000000, upTo: 200000000, base: 554359.0, per100: null, per1000: 2.0 },
];

/** Minimum fee floor — the base fee, SMC 22.900B.010. */
export const BASE_FEE = 325;

/** WA state building permit surcharge base, by building type. */
export const STATE_SURCHARGE: Record<string, number> = {"Residential": 6.5, "Commercial": 25.0, "Mixed Use": 31.5};
/** Each dwelling unit past the first adds this to the state surcharge. */
export const STATE_SURCHARGE_PER_EXTRA_UNIT = 2;

/** Technology fee rate, SMC 22.900A.100. */
export const TECH_FEE_RATE = 0.05;
