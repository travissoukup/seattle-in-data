// King County property tax assessment appeal — process facts.
//
// Every figure here was verified against the RCW, the WAC, and the live 2026
// King County petition PDF. Two traps are deliberately encoded:
//
//  1. The deadline is PER PARCEL, not a calendar date. King County mails value
//     notices May through November on a rolling cycle, so for most properties
//     the July 1 prong has already passed and the 60-day prong controls. We
//     link the county's own lookup rather than computing a date we could get
//     wrong.
//  2. The county's own senior-exemption form is stale on the veteran
//     disability threshold and the income limit. The statute governs.

export const BOE = {
  name: 'King County Board of Equalization',
  address: '516 Third Avenue, Room 1222, Seattle, WA 98104',
  phone: '(206) 477-3400',
  formsUrl: 'https://kingcounty.gov/en/independents/governance-and-leadership/government-oversight/board-appeals-equalization/appeals-forms',
  deadlineLookupUrl: 'https://blue.kingcounty.gov/assessor/eappeals/RPLookup.aspx',
  eAppealsUrl: 'https://blue.kingcounty.gov/assessor/eappeals/',
  filingCost: 'Free. There is no fee to file an appeal.',
};

export interface Step {
  title: string;
  body: string;
  cite?: string;
  warn?: boolean;
}

export const DEADLINE_RULE: Step = {
  title: 'Your deadline depends on your own value notice, not the calendar',
  body:
    'The petition is due on the LATER of two dates: 1 July of the assessment year, or 60 days after the mailing date printed on your Assessor\'s Official Property Value Notice. King County adopted the 60-day option, and it mails value notices between May and November on a rolling geographic cycle. For most properties the 1 July date has already passed, which means the real deadline is 60 days from your own notice. Look yours up rather than assuming.',
  cite: 'RCW 84.40.038(1); WAC 458-14-056(2)',
  warn: true,
};

export const STEPS: Step[] = [
  {
    title: 'You must state a specific opinion of value',
    body:
      'The petition asks for your estimate of fair market value, split into land and improvements. A petition without one is not complete and the Board must reject it. This tool produces that number from comparable sales so you are not guessing.',
    cite: 'WAC 458-14-056(5)',
  },
  {
    title: 'Your reasons must be about market value',
    body:
      'A petition that says only that the value is too high, or that taxes are unaffordable, is rejected as incomplete. King County also states plainly that it cannot consider assessment comparisons with other properties, percentage increases in value, personal hardship, or the amount of the tax. Arguments must go to what the property would sell for.',
    cite: 'WAC 458-14-056(5)',
    warn: true,
  },
  {
    title: 'You can file now and add evidence later',
    body:
      'If your evidence is not ready, file the petition on time and mark it Incomplete. That preserves your right of appeal. Any comparable sales or other documentary evidence must then reach both the Assessor and the Board at least 21 business days before your hearing, excluding legal holidays. The Assessor is held to the same deadline in the other direction.',
    cite: 'WAC 458-14-056(5); WAC 458-14-066',
  },
  {
    title: 'The assessor is presumed correct, and you have to overcome that',
    body:
      'The law presumes the assessor\'s value is right. To displace it you need clear, cogent and convincing evidence — a higher bar than the ordinary balance of probabilities. One exception matters: if you show that the assessor\'s valuation METHOD is flawed, the presumption drops away and the ordinary standard applies.',
    cite: 'RCW 84.40.0301; WAC 458-14-046(6)',
  },
  {
    title: 'What happens next',
    body:
      'The Assessor responds with their own evidence at least 21 business days before the hearing. Hearings may be in person, by phone, or decided on the written record if you prefer not to appear. If you disagree with the Board\'s decision you can appeal onward to the Washington State Board of Tax Appeals.',
  },
];

export const BARRED_ARGUMENTS = [
  'My assessment went up more than my neighbours\' did',
  'My taxes are higher than I can afford',
  'The percentage increase is unreasonable',
  'Other properties on my street are assessed for less',
  'The assessment is simply too high (with nothing further)',
];

/* ------------------------------------------------------------- exemptions */

export interface Relief {
  name: string;
  who: string;
  worth: string;
  deadline: string;
  cite: string;
  url?: string;
  note?: string;
}

/**
 * Income limits are chosen by the TAX YEAR being applied for, not by the year
 * on the county's circulating form. An application filed now is for 2027 taxes
 * and uses the 2027-2029 table.
 */
export const SENIOR_INCOME_2027 = { tier1: 76000, tier2: 89000, tier3: 101000, deferral: 113512 };

export const RELIEF: Relief[] = [
  {
    name: 'Senior citizen and disabled persons exemption',
    who:
      'Age 61 or older on 31 December of the year you file, OR unable to work because of a disability, OR a veteran with a combined service-connected evaluation rating of 40 percent or higher (or a total disability rating). You must own and occupy the home.',
    worth:
      'A large reduction, and the most underclaimed relief in the county. Income limits for 2027 taxes: $76,000, $89,000 and $101,000 for the three benefit tiers.',
    deadline: 'Claims may be filed at any time during the year for exemption from the following year\'s taxes.',
    cite: 'RCW 84.36.381; RCW 84.36.383; RCW 84.36.385',
    note:
      'The threshold for veterans dropped from 80 percent to 40 percent in 2025. King County\'s circulating form still prints the old 80 percent figure and an $84,000 income limit — both are stale. The statute controls.',
  },
  {
    name: 'Property tax deferral',
    who: 'Seniors and people with disabilities who meet the ownership and occupancy tests, with disposable income up to $113,512 for 2027.',
    worth: 'The state pays the tax and places a lien, repaid when the property changes hands.',
    deadline: 'Apply through the Assessor.',
    cite: 'RCW 84.38',
  },
  {
    name: 'Home improvement exemption',
    who: 'Owners of a single-family home who make physical improvements.',
    worth: 'Up to three years of exemption on the added value of the improvement. Widely missed by people who have just renovated.',
    deadline: 'Apply before the improvement is complete.',
    cite: 'RCW 84.36.400',
  },
  {
    name: 'Destroyed property relief',
    who: 'Owners whose property was destroyed or damaged by fire, flood, landslide or similar.',
    worth: 'A reduction in assessed value reflecting the loss.',
    deadline: 'Apply within the statutory window after the loss.',
    cite: 'RCW 84.70',
  },
  {
    name: 'Widows and widowers of veterans assistance',
    who: 'Qualifying surviving spouses of veterans, meeting age and income tests.',
    worth: 'A grant that offsets property tax.',
    deadline: 'Filed no later than 30 days before the tax is due.',
    cite: 'RCW 84.39',
  },
];

/** An exemption denial is appealed on the same clock as a value appeal. */
export const DENIAL_APPEAL_NOTE =
  'If an exemption is denied, the denial is appealable to the Board of Equalization on the same schedule as a value appeal: the later of 1 July or 60 days after the denial was mailed. Not 30 days.';
