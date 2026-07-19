// Catalog for Seattle in Data: the categories, the maps and pages inside each,
// and the public data behind them. This is the single source of truth for the
// homepage and the category pages. Edit here to add or move a page.
// House rule: plain words, short sentences, and no em or en dash characters.

export type EntryStatus = 'investigation' | 'live' | 'planned';

export interface Entry {
  title: string;
  blurb: string;
  status: EntryStatus;
  href: string;
  datasets: string[];
}

export interface Category {
  slug: string;
  name: string;
  tagline: string;
  accent: string;
  intro: string;
  entries: Entry[];
}

// The standalone apps. Walkability and the reviewer dashboard ship as static
// apps under this site's public/ folder. Permit Watch is its own deployment.
export const DASHBOARDS: Record<string, string> = {
  DASH_WALK: '/walkability',
  DASH_SDCI: 'https://sdci-permit-watch.vercel.app',
  DASH_REVIEWERS: '/reviewers',
};

export const STATUS_LABEL: Record<EntryStatus, string> = {
  investigation: 'Explore',
  live: 'Live app',
  planned: 'Coming soon',
};

export const HERO = {
  title: 'Seattle in Data',
  tagline: 'Maps and charts about your city, made from public records.',
  intro:
    'Seattle keeps records on almost everything it does. How long a permit takes. What books people check out. Where 911 calls come from. Most of it sits in public databases that hardly anyone opens. This site turns that data into plain maps and charts you can actually use. Pick a topic below and click in. It all comes from public records, and every page links back to the source so you can check the numbers yourself.',
};

export const CATEGORIES: Category[] = [
  {
    slug: 'permits-and-construction',
    name: 'Permits and Construction',
    tagline: "What's getting built, and how long it takes",
    accent: '#0072b2',
    intro:
      'Want to add a deck, build a house, or open a shop? You need a permit, and the city tracks every one. These pages show where building has been happening lately, how long permits take to get approved, and what happens when someone breaks the rules. If you have ever wondered why a project down the block is dragging on, start here.',
    entries: [
      {
        title: 'Where Seattle is building',
        blurb: 'Seattle permits far fewer new homes than it did at the 2021 peak, even as declared construction dollars set records. Charts of the housing pipeline, plus a map of recent permits and a ZIP-by-ZIP comparison.',
        status: 'investigation',
        href: '/building-map',
        datasets: ['Building Permits (76t5-zqzr)'],
      },
      {
        title: 'How long permits take',
        blurb: 'A full report on the permit pipeline: how long it takes to get approved, how much of the wait is the city versus you, and where the backlog sits.',
        status: 'live',
        href: 'DASH_SDCI',
        datasets: ['Building Permits (76t5-zqzr)', 'Land Use Permits (ht3q-kdvx)'],
      },
      {
        title: 'Which reviewers are fast or slow',
        blurb: 'Plan reviewers handle your drawings one round at a time. This shows how long each reviewer usually takes and how often they ask for changes.',
        status: 'live',
        href: 'DASH_REVIEWERS',
        datasets: ['Plan Review (tqk8-y2z5)'],
      },
      {
        title: 'Is the wait the city or you?',
        blurb: 'Street permits get split into days the city held the file and days it sat with the applicant. Across 69,000 permits, most of the wait is the applicant, but the city\'s own clock started creeping back up in 2025.',
        status: 'investigation',
        href: '/street-use',
        datasets: ['Street Use Permits (crg2-ssqd)'],
      },
      {
        title: 'Does hiring a pro speed things up?',
        blurb: 'Permits carried 16,123 new homes in 2021 and under 9,000 a year since 2023. Same data kills a myth: hiring a contractor who files constantly does not speed up review.',
        status: 'investigation',
        href: '/permits',
        datasets: ['Building Permits (76t5-zqzr)'],
      },
      {
        title: 'Code complaints and violations',
        blurb: 'When someone reports a junky building, an illegal unit, or an ignored repair, the city opens a case. The emergency channel has jumped about eightfold in three years.',
        status: 'investigation',
        href: '/violations',
        datasets: ['Code Complaints and Violations (ez4a-iug7)'],
      },
      {
        title: 'Find properties with open code cases',
        blurb: 'Every property with an open code case, scored 0 to 10 for how strong the distress signal is. Filter by type, ZIP, score, and recency, click a property for its case history, share a filtered view by URL, and download the list as a CSV.',
        status: 'investigation',
        href: '/leads',
        datasets: ['Code Complaints and Violations (ez4a-iug7)'],
      },
      {
        title: 'Trade and electrical work',
        blurb: 'Heat pump permits climbed to a peak of 9,435 a year while gas furnace permits sat still, a citywide electrification story written into permit descriptions. Plus who pulls the permits and where the work happens.',
        status: 'investigation',
        href: '/trades',
        datasets: ['Trade Permits (c87v-5hwh)', 'Electrical Permits (c4tj-daue)'],
      },
    ],
  },
  {
    slug: 'books-pets-parks',
    name: 'Books, Pets, and Parks',
    tagline: 'The fun side of city data',
    accent: '#d55e00',
    intro:
      'Not everything the city tracks is about money or rules. Some of it is just fun. The library posts what people check out. Pet owners register their dogs and cats by name and breed. The parks department lists every park and what is in it. These pages are a relaxed look at daily life in Seattle.',
    entries: [
      {
        title: 'What Seattle reads',
        blurb: 'The library just set an all-time checkout record, one year after ransomware took the catalog down. Every month it posts what people checked out, title by title.',
        status: 'investigation',
        href: '/library',
        datasets: ['Checkouts by Title (tmmm-ytt6)'],
      },
      {
        title: 'Seattle by pet',
        blurb: 'Every licensed pet has a species, a breed, a name, and a ZIP code. Cats\' share of pets doubles from the single-family edges to downtown, and dog breeds sort by money.',
        status: 'investigation',
        href: '/pets',
        datasets: ['Pet Licenses (jguv-t9rb)'],
      },
      {
        title: 'What the library owns',
        blurb: 'The library counts its shelves every month. One downtown building holds more than all 26 branches combined, and the count has fallen about 9 percent since 2017.',
        status: 'investigation',
        href: '/library-shelf',
        datasets: ['Library Collection Inventory (6vkj-f5xf)'],
      },
      {
        title: 'Every park in Seattle',
        blurb: 'Only 2 of Seattle\'s 412 parks have a fire pit and 8 have a swimming beach. A ranking of the best-stocked parks (Magnuson leads with 16 features) plus a map you can filter by restrooms, play areas, or off-leash runs.',
        status: 'investigation',
        href: '/parks',
        datasets: ['Park Addresses (v5tj-kqhc)', 'Park Features (xrnu-8eiq)'],
      },
    ],
  },
  {
    slug: 'getting-around',
    name: 'Getting Around',
    tagline: 'Walking, biking, parking, and reports',
    accent: '#009e73',
    intro:
      'Getting around a city leaves a trail of data. Counters track how many people bike over the bridges. Parking meters log every payment. People report potholes and broken streetlights through the city app. These pages map how Seattle moves and what residents ask the city to fix.',
    entries: [
      {
        title: 'Walk score for every block',
        blurb: 'A color map that scores how walkable each part of the city is, from sidewalks and parks to bus stops and hills. You can change what counts and watch it redraw.',
        status: 'live',
        href: 'DASH_WALK',
        datasets: ['OpenStreetMap sidewalks, parks, transit, and slope'],
      },
      {
        title: 'Did parking come back?',
        blurb: 'Seattle meters report occupancy nearly every minute. From 2019 to 2025 only the downtown core got its paid drivers back, and Ballard is down about 40 percent at every hour of the day, dinner time included.',
        status: 'investigation',
        href: '/parking',
        datasets: ['Paid Parking Transactions (gg89-k5p6)'],
      },
      {
        title: 'Bike counts on the Fremont Bridge',
        blurb: 'The city counts bikes crossing certain spots every hour. This shows how many people ride and how it rises and falls with the seasons.',
        status: 'investigation',
        href: '/bikes',
        datasets: ['Fremont Bridge Bike Counter (65db-xm6k)'],
      },
      {
        title: 'What people report to the city',
        blurb: 'Seattle files about twice the 311 reports it did in 2021. Encampment complaints drove much of the rise, and nearly four in five reports now arrive through the Find It Fix It app.',
        status: 'investigation',
        href: '/requests',
        datasets: ['Customer Service Requests (5ngg-rpne)'],
      },
      {
        title: 'How much energy buildings use',
        blurb: 'The median big building uses less energy per square foot than a decade ago, but natural gas keeps climbing. Trends, energy use by property type, and the buildings that didn\'t report.',
        status: 'investigation',
        href: '/energy',
        datasets: ['Building Energy Benchmarking (teqw-tu6e)'],
      },
    ],
  },
  {
    slug: 'city-money',
    name: 'City Money',
    tagline: 'Pay, budgets, and where dollars go',
    accent: '#cc79a7',
    intro:
      'The city runs on public money, and it has to show where that money goes. You can see what every city worker earns per hour, how the yearly budget is split between departments, and which big projects the city is paying for. These pages follow the dollars.',
    entries: [
      {
        title: 'What the city pays its workers',
        blurb: 'The most common city job is lifeguard, at a third of what patrol officers make. Every employee\'s pay rate by title and department, top rung to bottom.',
        status: 'investigation',
        href: '/wages',
        datasets: ['City Wage Data (2khk-5ukd)'],
      },
      {
        title: 'Where the money goes',
        blurb: 'The city budgets over $7 billion a year, but the council really steers only the General Fund slice. See which departments grew, which got cut, and which came back.',
        status: 'investigation',
        href: '/budget',
        datasets: ['City Operating Budget (8u2j-imqx)'],
      },
      {
        title: 'What the city is building',
        blurb: 'Two thirds of Seattle\'s capital budget goes to Public Utilities and City Light. The dollars by year, the biggest project lines, and a map of where the building is.',
        status: 'investigation',
        href: '/capital',
        datasets: ['Capital Projects (bsgq-948x)', 'Capital Budget (m6va-m4qe)'],
      },
    ],
  },
  {
    slug: 'safety-and-911',
    name: 'Safety and 911',
    tagline: 'Calls, crime, and police',
    accent: '#56b4e9',
    intro:
      'These are the heaviest datasets the city publishes, so read them with care. A 911 call is a request for help, not proof of a crime. A police report is not a court ruling. These pages map where calls and reported crime happen, and track how the police are checked. We say what each one can and cannot tell you.',
    entries: [
      {
        title: 'Where 911 calls come from',
        blurb: 'What people call the police about, split from the work officers start on their own. A call means someone asked for help, not that a crime happened. Proactive policing fell by half after 2020 and is climbing back.',
        status: 'investigation',
        href: '/calls',
        datasets: ['911 Call Data (33kz-ixgy)'],
      },
      {
        title: 'Fire and medic calls',
        blurb: 'Most fire department calls are medical, and the actual fires moved outdoors: rubbish fires ran six times their 2019 level at the 2024 peak while building fires barely moved.',
        status: 'investigation',
        href: '/fire',
        datasets: ['Real-Time Fire 911 Calls (kzjm-xkqj)'],
      },
      {
        title: 'Reported crime',
        blurb: 'Crimes reported to police, by type and place. Reports just hit their lowest full year since at least 2012, and car theft and gunfire are coming down off their pandemic-era peaks.',
        status: 'investigation',
        href: '/crime',
        datasets: ['SPD Crime Data (tazs-3rd5)'],
      },
      {
        title: 'When police use force',
        blurb: 'Officers file a report each time they use force. Reports fell 63% from the 2018 peak to a record low in 2025, but a third involve Black subjects in a city that is about 7% Black. A report is not a ruling on whether it was justified.',
        status: 'investigation',
        href: '/force',
        datasets: ['Use of Force (ppi5-g2bj)'],
      },
      {
        title: 'Police complaints and oversight',
        blurb: 'Who complains determines what sticks: complaints SPD files against its own officers are sustained at nearly three times the community rate, and most sustained findings end in a reprimand, not a firing.',
        status: 'investigation',
        href: '/oversight',
        datasets: ['Office of Police Accountability Complaints (hyay-5x7b)'],
      },
    ],
  },
  {
    slug: 'housing',
    name: 'Housing',
    tagline: 'Rentals, new homes, and the street',
    accent: '#e69f00',
    intro:
      "Building permits show what is being added. These pages show how the homes already here get used. You can see where registered rentals are, when new buildings are cleared for people to move in, and where people report encampments. Housing is where a lot of Seattle's biggest fights start.",
    entries: [
      {
        title: 'Where the rentals are',
        blurb: 'Landlords must register their rentals with the city. By count the registry is mostly single homes; by units it is big buildings. About 6% of properties hold roughly 72% of the registered units.',
        status: 'investigation',
        href: '/rentals',
        datasets: ['Rental Registration (j2xh-c7vt)'],
      },
      {
        title: 'When new homes open',
        blurb: 'Certificates of occupancy are the finish line of construction, and the finish line got quieter: Seattle now clears about 200 buildings a year, down a third from the late 2010s, with the apartment share off its 2021 peak.',
        status: 'investigation',
        href: '/occupancy',
        datasets: ['Certificates of Occupancy (axkr-2p68)'],
      },
      {
        title: 'Encampment reports',
        blurb: 'Reports of tents and vehicle camps are up sixfold since 2018, and four in five arrive through the Find It Fix It app. Each is a report someone filed, not a headcount of people.',
        status: 'investigation',
        href: '/encampments',
        datasets: ['Unauthorized Encampment Reports (k7ra-jqqe)'],
      },
    ],
  },
];

export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function allEntries(): Entry[] {
  return CATEGORIES.flatMap((c) => c.entries);
}

// Look up an entry by its href (an internal route like /crime, or a DASH key).
export function entryByHref(href: string): Entry | undefined {
  return allEntries().find((e) => e.href === href);
}

// The narrative investigations and the standalone apps, for the homepage.
const STORY_HREFS = ['/permits', '/street-use', '/parking', '/pets', '/library', '/wages'];
export const STORIES: Entry[] = STORY_HREFS.map((h) => entryByHref(h)).filter((e): e is Entry => !!e);
export const APPS: Entry[] = allEntries().filter((e) => e.status === 'live');

export function resolveHref(e: Entry): string {
  return e.status === 'live' ? DASHBOARDS[e.href] ?? e.href : e.href;
}

export function isExternal(e: Entry): boolean {
  return e.status === 'live';
}

export function builtCount(c: Category): number {
  return c.entries.filter((e) => e.status !== 'planned').length;
}
