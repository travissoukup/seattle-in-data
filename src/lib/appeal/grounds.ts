// Appeal grounds other than comparable sales.
//
// Errors in the assessor's own property record are the cheapest ground to win
// on: they are objective, documentary, and do not require the Board to weigh
// competing opinions of value. Physical constraints on the land are the next
// strongest, because mass appraisal tends to miss them.

export interface Ground {
  key: string;
  strength: 'strong' | 'moderate' | 'supporting';
  heading: string;
  finding: string;
  /** What the owner should attach to the petition. */
  evidence: string;
  cite?: string;
}

export interface GroundsInput {
  /** Assessor's record. */
  sqft: number;
  beds: number;
  baths: number;
  yr: number | null;
  grade: number | null;
  gradeName: string | null;
  cond: number | null;
  condName: string | null;
  lot: number;
  land: number;
  imps: number;
  /** Live joins. */
  openCodeCases: number;
  ecaFlags: string[];
  /** Share of the lot that is mapped steep slope, 0-1. */
  steepSlopePct?: number;
  /** Any permit that suggests the record is out of date. */
  permitCount: number;
  /** Whether a recorded landslide incident sits near the property. */
  nearbyLandslide?: { address: string; date: string; status: string } | null;
}

export function buildGrounds(i: GroundsInput): Ground[] {
  const out: Ground[] = [];
  const total = i.land + i.imps;

  // --- physical constraint on the land ---
  if (i.steepSlopePct && i.steepSlopePct > 0.15) {
    const pct = Math.round(i.steepSlopePct * 100);
    out.push({
      key: 'steep-slope',
      strength: pct > 30 ? 'strong' : 'moderate',
      heading: `${pct}% of the lot is mapped steep slope`,
      finding:
        `The city maps ${pct} percent of this parcel — roughly ${Math.round(i.lot * i.steepSlopePct).toLocaleString('en-US')} square feet of ${i.lot.toLocaleString('en-US')} — as steep slope. Land in a steep slope area cannot be built on without relief from the prohibition, and it is deducted from the lot area used to calculate density and lot coverage. A buyer would pay less for this lot than for a flat one of the same nominal size, and the land assessment of $${i.land.toLocaleString('en-US')} should reflect that.`,
      evidence: 'A printout of the city\'s Environmentally Critical Areas map centred on the parcel, and the parcel\'s steep-slope percentage from the city\'s own feasibility data.',
      cite: 'SMC 25.09.012; SMC 23.44.060.D.6',
    });
  }

  const hardEca = i.ecaFlags.filter((f) => /slide|steep|liquefaction|wetland|flood|peat/i.test(f));
  if (hardEca.length) {
    out.push({
      key: 'eca',
      strength: 'moderate',
      heading: `Critical areas mapped on or beside the parcel: ${hardEca.join(', ')}`,
      finding:
        `These designations restrict what can be built, add geotechnical review to any permit, and narrow the pool of buyers and lenders. Mass appraisal models apply neighbourhood-level adjustments and frequently miss parcel-level constraints of this kind.`,
      evidence: 'The city ECA map for the parcel, and any geotechnical report you hold.',
      cite: 'SMC 25.09',
    });
  }

  if (i.nearbyLandslide) {
    out.push({
      key: 'landslide-incident',
      strength: 'strong',
      heading: 'A documented landslide incident sits near this property',
      finding:
        `The city's landslide documentation records an incident at ${i.nearbyLandslide.address} on ${i.nearbyLandslide.date}, with a status of "${i.nearbyLandslide.status}". A recorded, recent slide in the immediate vicinity is a market fact: it is disclosable on sale and it affects what a buyer will pay.`,
      evidence: 'The city\'s landslide documentation record, and any SDCI emergency order or tag notice for the affected properties.',
    });
  }

  // --- record accuracy ---
  if (i.cond != null && i.cond <= 2) {
    out.push({
      key: 'condition',
      strength: 'moderate',
      heading: `The assessor already rates the condition ${i.condName}`,
      finding:
        `Condition is recorded as ${i.cond} of 5 (${i.condName}). If the house is in worse shape than that, or has deferred maintenance the assessor has not seen, the improvement value of $${i.imps.toLocaleString('en-US')} is overstated. The assessor values from the exterior and from permits; interior condition is rarely inspected.`,
      evidence: 'Dated photographs of each deficiency, and contractor estimates for the repairs needed.',
    });
  }

  if (i.openCodeCases > 0) {
    out.push({
      key: 'code-cases',
      strength: 'moderate',
      heading: `${i.openCodeCases} open code case${i.openCodeCases === 1 ? '' : 's'} against the property`,
      finding:
        `An open code case is an encumbrance a buyer must resolve, and it is evidence of a condition the assessment may not reflect.`,
      evidence: 'The SDCI case record and any notice of violation.',
    });
  }

  if (i.yr && new Date().getFullYear() - i.yr > 70 && i.permitCount <= 1) {
    out.push({
      key: 'age-no-permits',
      strength: 'supporting',
      heading: `Built ${i.yr}, with almost no permit history`,
      finding:
        `A house of this age with essentially no recorded permit work has probably not been modernised. Original wiring, plumbing, heating, windows and insulation all reduce what a buyer will pay relative to an updated house of the same size, and mass appraisal will not have captured it.`,
      evidence: 'Photographs of the original systems — the panel, the furnace, the windows — and a contractor estimate to bring them current.',
    });
  }

  // --- always: verify the record ---
  out.push({
    key: 'verify-record',
    strength: 'strong',
    heading: 'Check the assessor\'s record against your house before anything else',
    finding:
      `The assessor has this property as ${i.sqft.toLocaleString('en-US')} square feet of living area, ${i.beds} bedroom${i.beds === 1 ? '' : 's'}, ${i.baths} bathroom${i.baths === 1 ? '' : 's'}, built ${i.yr ?? 'unknown'}, construction grade ${i.grade ?? '?'} (${i.gradeName ?? 'n/a'}), condition ${i.cond ?? '?'} (${i.condName ?? 'n/a'}), on ${i.lot.toLocaleString('en-US')} square feet of land. If any of that is wrong, that is the simplest appeal there is — it is documentary rather than a matter of opinion, and the assessor will often correct it without a hearing.`,
    evidence: 'Measured floor plans or an appraisal showing the true square footage, photographs, or a survey showing the true lot area.',
  });

  const order = { strong: 0, moderate: 1, supporting: 2 };
  return out.sort((a, b) => order[a.strength] - order[b.strength]);
}

/** Split a target total value back into land and improvements for the petition. */
export function splitOpinion(target: number, land: number, imps: number): { land: number; imps: number } {
  const total = land + imps;
  if (total <= 0) return { land: Math.round(target), imps: 0 };
  // Mass appraisal rarely misprices land; put the reduction on improvements
  // first, which is also the easier argument to support with photographs.
  const impsTarget = Math.max(0, target - land);
  if (impsTarget > 0) return { land, imps: Math.round(impsTarget) };
  return { land: Math.round(target), imps: 0 };
}
