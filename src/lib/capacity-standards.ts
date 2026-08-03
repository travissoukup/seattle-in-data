/**
 * Development standards for LR1 (M) applied to 3066 63rd Ave SW (PIN 6373000105).
 *
 * Every value was verified against the live Seattle Municipal Code (Municode,
 * July 15 2026 version) and the signed One Seattle Plan legislation
 * (Ord. 127376 / CB 120993, effective Jan 21 2026) by a research pass on
 * Aug 3 2026, with each number cross-checked in at least two sources.
 * Confidence: 'high' means the value was read in the current code text.
 * This is feasibility-grade analysis, not legal advice; the `unresolved`
 * list at the bottom is what a pre-application conference must confirm.
 */

export interface Standard {
  name: string;
  value: string;
  plain: string;
  citation: string;
  sourceUrl?: string;
  confidence: 'high' | 'medium' | 'low';
}

export const EFFECTIVE_CODE =
  'SMC Chapter 23.45 as amended by Ord. 127376 (CB 120993), effective Jan 21, 2026';

export const STANDARDS: Standard[] = [
  {
    name: 'Floor area ratio (attached or detached units)',
    value: '1.3 FAR = 6,136 sf on this lot',
    plain:
      'Townhouses, rowhouses, cottages, or houses can total 1.3 times the lot area in chargeable floor area. The old per-housing-type FAR table is gone.',
    citation: 'SMC 23.45.510.B, Table A (Ord. 127376 sec. 35)',
    sourceUrl:
      'https://library.municode.com/wa/seattle/codes/municipal_code?nodeId=TIT23LAUSCO_SUBTITLE_IIILAUSRE_CH23.45MU',
    confidence: 'high',
  },
  {
    name: 'Floor area ratio (stacked units)',
    value: '1.5 FAR = 7,080 sf on this lot',
    plain: 'Stacked flats get the higher 1.5 FAR in LR1 with an MHA suffix.',
    citation: 'SMC 23.45.510.B, Table A (Ord. 127376 sec. 35)',
    sourceUrl:
      'https://library.municode.com/wa/seattle/codes/municipal_code?nodeId=TIT23LAUSCO_SUBTITLE_IIILAUSRE_CH23.45MU',
    confidence: 'high',
  },
  {
    name: 'FAR exemption for the 1917 house',
    value: '780 sf exempt if the house stays',
    plain:
      'Floor area in a pre-1982 house that stays residential does not count against FAR, as long as no new principal structure sits between it and the street and the area all existed in 1982. Keeping the cottage adds its area on top of the FAR budget.',
    citation: 'SMC 23.45.510.D.3 (Ord. 127376 sec. 35)',
    confidence: 'high',
  },
  {
    name: 'Maximum unit count',
    value: 'No cap',
    plain:
      'The former LR1 density limit (1 unit per 1,150 sf, which would have capped this lot at 4 units) was repealed outright. Units are now limited by FAR, height, setbacks, and amenity area, not a count.',
    citation: 'Former SMC 23.45.512, repealed by Ord. 127376 sec. 36',
    confidence: 'high',
  },
  {
    name: 'Height limit',
    value: '32 ft, up to 37 ft at a pitched-roof ridge',
    plain:
      'Base 32 ft for all unit types. A pitched roof may ridge 5 ft higher; stacked units with a mostly below-grade story get 4 ft more; parapets and railings 4 ft.',
    citation: 'SMC 23.45.514.A Table A, subsections D, E, F, I (Ord. 127376 sec. 37)',
    confidence: 'high',
  },
  {
    name: 'Setbacks',
    value: 'Front 7 ft avg (5 min), side 5 ft, rear 0 ft at an alley else 7 ft avg (5 min)',
    plain:
      'One uniform table for all LR housing types now. Whether the rear lot line abuts an alley needs a survey check.',
    citation: 'SMC 23.45.518.A, Table A (Ord. 127376 sec. 38)',
    confidence: 'high',
  },
  {
    name: 'Separation between buildings',
    value: '5 ft minimum',
    plain:
      'New structures need 5 ft between buildings with floor area, which is what makes keep-the-house-and-build-behind site plans workable.',
    citation: 'SMC 23.45.519 (new, Ord. 127376 sec. 39)',
    confidence: 'high',
  },
  {
    name: 'Amenity area',
    value: '20% of lot = 944 sf here',
    plain:
      'A fifth of the lot must be usable amenity space; private spaces at least 60 sf, common at least 250 sf. Driveways do not count.',
    citation: 'SMC 23.45.522 (Ord. 127376 sec. 40)',
    confidence: 'high',
  },
  {
    name: 'Lot coverage',
    value: 'No limit in LR zones',
    plain:
      'Coverage is controlled indirectly by FAR, setbacks, amenity area, and Green Factor landscaping (score 0.6 when building more than one new unit).',
    citation: 'Absence verified in SMC Ch. 23.45; Green Factor per 23.45.524.A.2.a',
    confidence: 'high',
  },
  {
    name: 'MHA obligation',
    value: '$20.41 per sf of new residential floor area, or 6% of units affordable',
    plain:
      'This parcel is in the Medium MHA fee area with a plain (M) suffix. The payment rate holds for permits vesting Mar 1, 2026 through Feb 28, 2027. ADU floor area is exempt from the payment base. The performance option rounds small projects up to 2 affordable units, which makes payment the realistic path at this scale.',
    citation: 'Table B for 23.58C.040 (Medium area, (M) row); SMC 23.58C.050; SDCI adjusted rate table',
    confidence: 'high',
  },
  {
    name: 'ADUs',
    value: '2 per lot, any mix, 1,000 sf each (1,200 sf with 3+ bedrooms)',
    plain:
      'Two accessory units can ride along with a house, attached or detached, 32 ft height, no parking, no owner-occupancy requirement, and no MHA payment on their floor area.',
    citation: 'SMC 23.42.022 (Ord. 127376 sec. 21); RCW 36.70A.680-.681 (HB 1337, 2023)',
    confidence: 'high',
  },
  {
    name: 'Parking',
    value: 'Zero for units under 1,200 sf; 0.5 stalls per unit at 1,200 sf or larger',
    plain:
      'This lot is outside the frequent transit area, but that no longer matters much: the new table requires no parking for units under 1,200 sf, and the old Alki 1.5-stall overlay was repealed. Unit sizing is the parking lever.',
    citation: 'SMC 23.54.015, Table B rows F and K (Ord. 127376 sec. 59); backstopped by SB 5184 (2025)',
    confidence: 'high',
  },
  {
    name: 'Trees',
    value: 'Arborist inventory required; Tier 1 to 2 trees can bind the site plan',
    plain:
      'Heritage (Tier 1) trees cannot be removed. Tier 2 trees (24 inch and larger trunks) are removable during development only within the 85 percent development-area rule, with replacement or payment. Whether any stand here needs an inventory.',
    citation: 'SMC 25.11.050, .070.B, .090; SDCI Director’s Rule 8-2023',
    confidence: 'high',
  },
  {
    name: 'Environmentally critical areas',
    value: 'Liquefaction-prone area: geotech study required, no capacity reduction',
    plain:
      'The city GIS places this parcel in a liquefaction-prone ECA. That adds a geotechnical report and foundation design at permitting but does not reduce allowed units or floor area in LR zones. All nine other ECA layers are clear at this point.',
    citation: 'SMC 25.09; Seattle GIS ECA layers queried at the parcel point, Aug 3, 2026',
    confidence: 'high',
  },
  {
    name: 'Optional 25% affordable path',
    value: 'FAR 2.0 (9,440 sf) and 55 ft height, no unit cap',
    plain:
      'A new voluntary path trades 25 percent affordable units for far more floor area and height. Almost certainly overkill on 4,720 sf, but it is the ceiling the code now allows.',
    citation: 'SMC 23.45.560 (new, Ord. 127376 sec. 47)',
    confidence: 'high',
  },
];

/** Open questions a pre-application conference must settle. */
export const UNRESOLVED: string[] = [
  'Does the rear lot line abut an alley? That decides a 0 ft vs 7 ft average rear setback.',
  'All 780 sf of the house must predate 1982 with no later additions for the FAR exemption; confirm at pre-app.',
  'Whether any Tier 1 or Tier 2 trees stand on or overhang the lot needs an arborist inventory.',
  'The $20.41 MHA rate holds for permits vesting through Feb 28, 2027; a new rate lands Mar 1, 2027.',
  'Scope of liquefaction-area geotech requirements is a permit-time determination by SDCI.',
  'Was the parcel ever zoned RSL? If so the 25% affordable path FAR rises from 2.0 to 2.7.',
  'Phase 2 One Seattle Plan rezones could remap this parcel later; check status at application.',
];

/** The Breezy Underbuilt report's statements vs what the code and data actually say. */
export const FINDINGS: { claim: string; reality: string; citation: string }[] = [
  {
    claim: 'Prints the lot size but never computes buildable floor area, unit yield, or an underbuilt percentage.',
    reality:
      'Computed: 6,136 sf chargeable (attached) or 7,080 sf (stacked), plus the 780 sf house exemption. The lot sits at 11% of stacked capacity: 89% underbuilt.',
    citation: 'SMC 23.45.510.B Table A',
  },
  {
    claim: '"The specific FAR and lot coverage for LR1(M) must be pulled from Title 23.45."',
    reality:
      'We pulled them. FAR is 1.3 (1.5 stacked). There is no lot coverage limit in LR zones; that concept belongs to Chapter 23.44.',
    citation: 'SMC 23.45.510; coverage absence verified in Ch. 23.45',
  },
  {
    claim: 'Height "typically 30-35 ft"; front setback "commonly 10-15 ft"; side "often 5-7 ft."',
    reality:
      'Exactly 32 ft (37 at a pitched ridge). Front 7 ft average with a 5 ft minimum, side 5 ft. The ranges quoted describe a code that was replaced on Jan 21, 2026.',
    citation: 'SMC 23.45.514 Table A; 23.45.518 Table A',
  },
  {
    claim: 'No MHA fee estimate anywhere, on a lot whose zone suffix exists because of MHA.',
    reality:
      'Medium fee area, $20.41 per sf: about $125K on a full attached build, $145K stacked, $0 on the ADU path. It is the single biggest line item after construction.',
    citation: 'Table B for 23.58C.040; SDCI adjusted rates',
  },
  {
    claim: 'Cites HB 1110 as the authority for ADUs.',
    reality: 'The state ADU law is HB 1337 (RCW 36.70A.680-.698). HB 1110 is middle housing.',
    citation: 'RCW 36.70A.680',
  },
  {
    claim: '"No specific overlay districts... appear," then tells the reader to confirm ECA status themselves.',
    reality:
      'The city GIS answers in one query: this parcel is in a liquefaction-prone ECA (geotech study required). The other nine ECA layers are clear. The tree ordinance goes unmentioned entirely.',
    citation: 'Seattle GIS ECA layers; SMC 25.09; SMC 25.11',
  },
  {
    claim: 'Treats the parcel as a generic single family lot ("categorized here as SINGLE_FAMILY").',
    reality:
      'The county assesses the house at $1,000 against $859,000 of land, there is an open escalated code case, and the former LR1 unit cap that would have limited this lot to 4 units was repealed. None of that is in the report.',
    citation: 'King County assessor 2026; SDCI code cases; Ord. 127376 sec. 36',
  },
];
