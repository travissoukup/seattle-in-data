// Comparable-sales engine for a property tax assessment appeal.
//
// The King County Assessor values residential property by mass appraisal, which
// is accurate in aggregate and often wrong on an individual house. An appeal
// succeeds by showing the Board a better-matched set of arm's-length sales than
// the model used. This finds those sales from the assessor's own data.
//
// Everything here runs against one ZIP shard already in the browser, so the
// analysis is free and needs no server.

export interface CompSale {
  date: string;
  price: number;
  rec?: string;
  /** Sale reason code. 1 is an ordinary sale; other codes are transfers. */
  rsn?: string;
  /** Non-blank means the county flagged the sale as questionable. */
  wrn?: string;
}

export interface CompParcel {
  pin: string;
  addr: string;
  lat: number;
  lng: number;
  lot: number;
  sqft: number;
  beds: number;
  baths: number;
  yr: number | null;
  grade: number | null;
  cond: number | null;
  land: number;
  imps: number;
  units: number;
  use?: string;
  /** Non-empty when the assessor records a waterfront location. */
  waterfront?: string | null;
  sales?: CompSale[];
}

/** True when the land carries essentially all the value, e.g. a teardown or
 *  a waterfront lot. Building price-per-square-foot is meaningless here. */
export function isLandDominated(p: CompParcel): boolean {
  const total = p.land + p.imps;
  return total > 0 && p.imps / total < 0.15;
}

export interface ScoredComp {
  parcel: CompParcel;
  sale: CompSale;
  saleYear: number;
  distanceMi: number;
  pricePerSqFt: number;
  /** 0-100; higher is a closer match. */
  score: number;
  /** Human-readable reasons this is or is not a good match. */
  why: string[];
}

/* ------------------------------------------------------------- filtering */

/**
 * Only ordinary, arm's-length sales belong in a comp set. Sale reason 1 is an
 * ordinary sale; any other code is a transfer (estate, trade, foreclosure,
 * family, government). A non-blank sale warning is the county's own flag that
 * the price does not represent market value.
 */
export function isArmsLength(s: CompSale): boolean {
  if (!s.price || s.price <= 1000) return false;
  const reason = (s.rsn || '').trim();
  if (reason && reason !== '1') return false;
  const warn = (s.wrn || '').trim();
  if (warn) return false;
  return true;
}

export function saleYearOf(s: CompSale): number {
  const m = /(\d{4})/.exec(s.date || '');
  return m ? Number(m[1]) : 0;
}

function haversineMi(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const t = Math.PI / 180;
  const dLat = (bLat - aLat) * t;
  const dLng = (bLng - aLng) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * t) * Math.cos(bLat * t) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/* --------------------------------------------------------------- scoring */

export interface CompOptions {
  /** Assessment year; value is set as of 1 January of this year. */
  assessmentYear: number;
  /** How many years back of sales to consider. */
  lookbackYears?: number;
  maxDistanceMi?: number;
  minComps?: number;
  maxComps?: number;
}

const DEFAULTS: Required<Omit<CompOptions, 'assessmentYear'>> = {
  lookbackYears: 3,
  maxDistanceMi: 0.75,
  minComps: 3,
  maxComps: 8,
};

/** Score a candidate against the subject. 100 is a perfect match. */
function scoreComp(subject: CompParcel, p: CompParcel, sale: CompSale, distMi: number, opts: Required<CompOptions>): { score: number; why: string[] } {
  const why: string[] = [];
  let score = 100;

  const pen = (amount: number, msg: string) => { score -= amount; why.push(msg); };
  const good = (msg: string) => why.push(msg);

  const landBasis = isLandDominated(subject);

  // Living area is the strongest driver — unless the land carries the value.
  if (!landBasis && subject.sqft > 0 && p.sqft > 0) {
    const ratio = p.sqft / subject.sqft;
    const diff = Math.abs(1 - ratio);
    if (diff <= 0.1) good(`Living area within 10% (${p.sqft.toLocaleString('en-US')} vs ${subject.sqft.toLocaleString('en-US')} sq ft)`);
    else pen(Math.min(30, diff * 90), `Living area differs ${Math.round(diff * 100)}%`);
  }

  // Lot size. Decisive when the land carries the value.
  if (subject.lot > 0 && p.lot > 0) {
    const diff = Math.abs(1 - p.lot / subject.lot);
    if (diff <= 0.2) good('Lot size closely matched');
    else pen(Math.min(landBasis ? 40 : 15, diff * (landBasis ? 70 : 25)), `Lot differs ${Math.round(diff * 100)}%`);
  }

  // Age.
  if (subject.yr && p.yr) {
    const d = Math.abs(subject.yr - p.yr);
    if (d <= 8) good(`Built within ${d} years (${p.yr})`);
    else pen(Math.min(15, d * 0.4), `Built ${d} years apart (${p.yr})`);
  }

  // Construction grade and condition are the assessor's own quality measures.
  if (subject.grade != null && p.grade != null) {
    const d = Math.abs(subject.grade - p.grade);
    if (d === 0) good('Identical construction grade');
    else pen(d * 8, `Grade differs by ${d}`);
  }
  if (subject.cond != null && p.cond != null) {
    const d = Math.abs(subject.cond - p.cond);
    if (d > 0) pen(d * 6, `Condition differs by ${d}`);
  }

  // Bedrooms.
  if (subject.beds && p.beds) {
    const d = Math.abs(subject.beds - p.beds);
    if (d > 0) pen(d * 4, `${p.beds} bedrooms vs ${subject.beds}`);
  }

  // Proximity.
  if (distMi <= 0.15) good(`${distMi.toFixed(2)} miles away`);
  else pen(Math.min(20, distMi * 20), `${distMi.toFixed(2)} miles away`);

  // Recency relative to the 1 January valuation date.
  const yr = saleYearOf(sale);
  const yearsBefore = opts.assessmentYear - yr;
  if (yearsBefore <= 1) good(`Sold ${yr}, close to the ${opts.assessmentYear} valuation date`);
  else pen(Math.min(20, yearsBefore * 6), `Sold ${yr}, ${yearsBefore} years before the valuation date`);

  return { score: Math.max(0, Math.round(score)), why };
}

/** Find and rank comparable sales for a subject parcel within one ZIP shard. */
export function findComps(
  subject: CompParcel,
  universe: CompParcel[],
  options: CompOptions,
): ScoredComp[] {
  const opts = { ...DEFAULTS, ...options };
  const landBasis = isLandDominated(subject);
  const out: ScoredComp[] = [];

  for (const p of universe) {
    if (p.pin === subject.pin) continue;
    if (!p.sales || !p.sales.length) continue;
    if (!p.sqft || !p.lat) continue;
    // Compare like with like: single-unit residences only, when the subject is one.
    if (subject.units <= 1 && p.units > 1) continue;
    // Waterfront is a value class of its own; never mix the two.
    const subjWf = !!(subject.waterfront && subject.waterfront !== '0');
    const compWf = !!(p.waterfront && p.waterfront !== '0');
    if (subjWf !== compWf) continue;
    // A land-dominated subject needs land-dominated comps.
    if (landBasis && !isLandDominated(p)) continue;

    const dist = haversineMi(subject.lat, subject.lng, p.lat, p.lng);
    if (dist > opts.maxDistanceMi) continue;

    for (const sale of p.sales) {
      if (!isArmsLength(sale)) continue;
      const yr = saleYearOf(sale);
      if (!yr) continue;
      if (yr < opts.assessmentYear - opts.lookbackYears) continue;
      if (yr > opts.assessmentYear) continue; // after the valuation date

      const { score, why } = scoreComp(subject, p, sale, dist, opts);
      const denom = landBasis ? p.lot : p.sqft;
      out.push({
        parcel: p, sale, saleYear: yr, distanceMi: dist,
        pricePerSqFt: denom ? sale.price / denom : 0,
        score, why,
      });
    }
  }

  // Keep the best sale per parcel, then the best parcels overall.
  const bestPerParcel = new Map<string, ScoredComp>();
  for (const c of out) {
    const prev = bestPerParcel.get(c.parcel.pin);
    if (!prev || c.score > prev.score) bestPerParcel.set(c.parcel.pin, c);
  }
  return [...bestPerParcel.values()].sort((a, b) => b.score - a.score).slice(0, opts.maxComps);
}

/* ------------------------------------------------------------- conclusion */

export interface CompAnalysis {
  /** 'building' compares price per square foot of living area; 'land' compares
   *  price per square foot of lot, used when improvements carry no value. */
  basis: 'building' | 'land';
  comps: ScoredComp[];
  /** Median sale price per square foot across the comps. */
  medianPricePerSqFt: number;
  /** What the subject would be worth at that rate. */
  indicatedValue: number;
  assessedValue: number;
  /** Positive means assessed above what the comps indicate. */
  gap: number;
  gapPct: number;
  /** Honest verdict, including "you are fairly assessed". */
  verdict: 'over' | 'fair' | 'under' | 'insufficient';
  summary: string;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function analyseComps(subject: CompParcel, comps: ScoredComp[]): CompAnalysis {
  const assessed = subject.land + subject.imps;
  const landBasis = isLandDominated(subject);
  const basis: 'building' | 'land' = landBasis ? 'land' : 'building';
  const usable = comps.filter((c) => c.score >= 45 && c.pricePerSqFt > 0);

  if (usable.length < 3) {
    return {
      basis, comps, medianPricePerSqFt: 0, indicatedValue: 0, assessedValue: assessed,
      gap: 0, gapPct: 0, verdict: 'insufficient',
      summary: `Only ${usable.length} closely matched arm's-length sale${usable.length === 1 ? '' : 's'} could be found nearby${landBasis ? ' on a comparable land basis' : ''}. That is not enough to build a comparable-sales argument; the record-accuracy and condition grounds below may still apply.`,
    };
  }

  const ppsf = median(usable.map((c) => c.pricePerSqFt));
  const indicated = ppsf * (landBasis ? subject.lot : subject.sqft);
  const gap = assessed - indicated;
  const gapPct = indicated > 0 ? (gap / indicated) * 100 : 0;

  let verdict: CompAnalysis['verdict'] = 'fair';
  if (gapPct > 10) verdict = 'over';
  else if (gapPct < -10) verdict = 'under';

  const summaries: Record<CompAnalysis['verdict'], string> = {
    over: `The ${usable.length} closest arm's-length sales imply a value near $${Math.round(indicated).toLocaleString('en-US')}, against an assessment of $${assessed.toLocaleString('en-US')} — roughly ${Math.abs(Math.round(gapPct))}% high. That is a workable basis for an appeal.`,
    fair: `The ${usable.length} closest arm's-length sales imply a value near $${Math.round(indicated).toLocaleString('en-US')}, against an assessment of $${assessed.toLocaleString('en-US')}. That is within ${Math.abs(Math.round(gapPct))}%, which is normal variation in mass appraisal and unlikely to win on comparable sales alone.`,
    under: `The comparable sales imply a value near $${Math.round(indicated).toLocaleString('en-US')}, which is ABOVE the $${assessed.toLocaleString('en-US')} assessment. Appealing on value would invite the Board to raise it. Do not file on this ground.`,
    insufficient: '',
  };

  return {
    basis, comps, medianPricePerSqFt: ppsf, indicatedValue: indicated, assessedValue: assessed,
    gap, gapPct, verdict, summary: summaries[verdict],
  };
}
