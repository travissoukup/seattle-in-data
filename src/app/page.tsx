import Link from 'next/link';
import { library, permits } from '@/lib/data';
import { fmtInt } from '@/lib/format';

export const metadata = { title: 'Exploring Seattle with Data' };

const INVESTIGATIONS = [
  {
    href: '/library',
    eyebrow: 'Culture',
    title: 'What Seattle Reads',
    blurb:
      "A city's mind in real time. Every month the public library publishes what got checked out, by title. Most people see a circulation report; it is really a cultural seismograph: you can watch a book surge the week it hits the news, see the pandemic flip the whole system from print to digital, and read the long tail of what a city quietly loves.",
    stat: 'a city of readers',
  },
  {
    href: '/pets',
    eyebrow: 'Delight',
    title: 'Seattle by Pet',
    blurb:
      'Every licensed pet comes with a species, a breed, a name, and an owner ZIP. It is the rare civic dataset that is pure joy, and quietly a map of the city: Luna is the top name, Seattle is a Labrador town, and French Bulldogs versus pit bulls sort almost perfectly by neighborhood wealth.',
    stat: 'a breed map of class',
  },
  {
    href: '/wages',
    eyebrow: 'Accountability',
    title: 'What Seattle Pays',
    blurb:
      'The city publishes every employee’s hourly rate by name, title, and department. It is a clear look at how a public payroll is structured, the spread from bottom to top, and which departments pay near the ceiling. (The overtime-outlier story needs payroll records the open data does not have.)',
    stat: 'rates, not paychecks',
  },
  {
    href: '/parking',
    eyebrow: 'Recovery',
    title: 'The Parking Recovery',
    blurb:
      'Seattle logs every paid on-street parking transaction. Comparing 2019 with 2024 inverts the usual narrative: paid demand is down almost everywhere, and the only areas that recovered to pre-pandemic levels are the dense downtown core. The neighborhood business districts kept sliding.',
    stat: 'downtown came back',
  },
  {
    href: '/permits',
    eyebrow: 'Accountability',
    title: 'The Permit Fast Lane (that isn’t)',
    blurb:
      'Everyone "knows" that hiring a pro gets your permit through faster. We tested it against every plan-reviewed building permit: bucket filers by how many permits they pull, and compare review times. The uncomfortable answer is that the variance tracks what you build, not who you hire: a quantified debunking, not a gripe.',
    stat: 'no pay-to-play edge',
  },
  {
    href: '/street-use',
    eyebrow: 'Accountability',
    title: 'Whose Clock Is It?',
    blurb:
      'SDOT splits every street-use permit’s wait into two clocks: days in city review, and days "in the applicant’s control." Across 68,000 issued permits, the routine ones, extensions, maintenance, container and date-change requests, show almost no city review time. The published turnaround mostly measures the applicant, except where the engineering is genuinely hard.',
    stat: 'the clock is the applicant',
  },
];

export default function HomePage() {
  const totalCheckouts = library.byYearUsage.reduce((s, r) => s + r.checkouts, 0);
  const permitN = permits.rawByFiler.reduce((s, r) => s + r.n, 0);

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Investigations</p>
        <h1>Exploring Seattle with data</h1>
        <p>
          Short, rigorous investigations into how Seattle actually works, built entirely on the city&apos;s
          own open data. Not dashboards for their own sake: each one asks a real question, tests it against the
          full record rather than anecdotes, and is careful to say what the data can and cannot show.
        </p>
      </div>

      <div className="invest-grid">
        {INVESTIGATIONS.map((it) => (
          <Link key={it.href} href={it.href} className="invest-card">
            <p className="eyebrow">{it.eyebrow}</p>
            <h2>{it.title}</h2>
            <p className="blurb">{it.blurb}</p>
            <span className="invest-go">Read the investigation &rarr;</span>
          </Link>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
        Built on {fmtInt(totalCheckouts)} library checkouts since 2005 and {fmtInt(permitN)} reviewed building
        permits, among other open datasets. More investigations to come.
      </p>
    </>
  );
}
