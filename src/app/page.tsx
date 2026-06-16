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
    href: '/permits',
    eyebrow: 'Accountability',
    title: 'The Permit Fast Lane (that isn’t)',
    blurb:
      'Everyone "knows" that hiring a pro gets your permit through faster. We tested it against every plan-reviewed building permit: bucket filers by how many permits they pull, and compare review times. The uncomfortable answer is that the variance tracks what you build, not who you hire: a quantified debunking, not a gripe.',
    stat: 'no pay-to-play edge',
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
