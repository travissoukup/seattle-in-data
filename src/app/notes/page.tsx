import Link from 'next/link';
import { REPO_URL } from '@/lib/site';

export const metadata = {
  title: 'Data notes',
  description:
    'How to read the numbers on Seattle in Data: reporting bias, denominators, dataset quirks, and the corrections policy.',
};

export default function NotesPage() {
  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> Data notes
      </p>

      <div className="page-head">
        <p className="eyebrow">The fine print, in plain words</p>
        <h1>Data notes</h1>
        <p>
          Every chart on this site comes from a public dataset, and every dataset has quirks. This page collects the
          ones that change how you should read the numbers. If you only read one page before arguing with someone
          online, read this one.
        </p>
      </div>

      <section className="card">
        <h2 className="section-title">Reports are not reality</h2>
        <p>
          Most of this data counts what people <em>report</em>: 911 calls, code complaints, 311 requests, encampment
          sightings. A neighborhood can rank high because more happens there, or because its residents report more, or
          because one app made reporting easier. The 311 boom is a clear example: reports doubled after the Find It Fix
          It app took over most intake, and that says as much about the app as about the streets. A call about a
          &quot;suspicious person&quot; is a claim by the caller, not a fact about the person. Treat every
          neighborhood ranking on this site as a mix of conditions and reporting habits, not a scorecard.
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">Per-person rates and who gets counted</h2>
        <p>
          The area comparison tables divide counts by residents, using the Census ACS 5-year population (2020 to 2024)
          for each ZIP code, with 2020-vintage ZIP boundaries. Residents are the wrong denominator for places where far
          more people work than live. Downtown and SODO rank high partly because thousands of people pass through areas
          where few sleep. ZIPs with almost no residents show n/a instead of a misleading rate. ZIP codes also cross
          city lines in places, so edge ZIPs include some non-Seattle territory.
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">Dataset quirks worth knowing</h2>
        <ul className="notes-list">
          <li>
            <strong>Crime reports (SPD).</strong> The dataset lists offenses, not incidents: one report can carry
            several offense rows. SPD also switched reporting standards to NIBRS around 2019, which changed how some
            offenses are counted; treat trends that cross that line with care. All records are police reports, not
            convictions.
          </li>
          <li>
            <strong>911 and dispatch (CAD).</strong> The dispatch dataset logs every police dispatch event, including
            work officers start themselves (traffic stops, premise checks). Only about half the records are actual 911
            calls. This site separates community-generated calls from officer-initiated activity wherever it counts
            them.
          </li>
          <li>
            <strong>Permits.</strong> Estimated project cost is declared by the applicant, not audited. The contractor
            field is blank on most permits, so &quot;no contractor recorded&quot; does not mean an owner did the work.
            Permit records include applications that were later withdrawn or canceled; charts say when they count only
            issued permits.
          </li>
          <li>
            <strong>Building energy.</strong> Self-reported by building owners under the benchmarking law. A few campus
            master records (the UW is the biggest) dominate raw totals, so this site prefers medians and flags
            outliers.
          </li>
          <li>
            <strong>Rental registrations.</strong> Registrations expire after two years, so the registry is a rolling
            window of active rentals, not a history. It cannot tell you how the rental stock changed over time.
          </li>
          <li>
            <strong>Code complaints.</strong> Anyone can file one, about anything. An open case is an unresolved
            report, not a finding of guilt. Some categories (landlord/tenant) only became intake channels in recent
            years, which makes long trends partly a bookkeeping story.
          </li>
          <li>
            <strong>Plan review (reviewers tool).</strong> Built from a dataset the city stopped refreshing around
            2025 and that covers mostly residential permits. Read it as a snapshot of how review worked, not a live
            scoreboard.
          </li>
          <li>
            <strong>Walkability (tool).</strong> A proxy index built from OpenStreetMap. OSM coverage varies block to
            block, so factors like mapped trees measure mapping effort as much as the thing itself.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2 className="section-title">Snapshots, not a live feed</h2>
        <p>
          Pages are rebuilt from the city APIs on a schedule, and each page shows its &quot;Data as of&quot; date.
          Between rebuilds, the city keeps adding and correcting records, so live queries will drift a little from the
          numbers here, in both directions. Charts trim partial years and months at both ends so a half-finished period
          never draws as a cliff.
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">Corrections</h2>
        <p>
          If a number here is wrong, I want to know.{' '}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
            Open an issue on GitHub
          </a>{' '}
          with the page and the number, and I will check it against the source and fix it. The full pipeline (every
          query, every script) is public in{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            the repository
          </a>
          , so you can check the work yourself. Data comes from{' '}
          <a href="https://data.seattle.gov" target="_blank" rel="noopener noreferrer">
            data.seattle.gov
          </a>{' '}
          and{' '}
          <a href="https://cos-data.seattle.gov" target="_blank" rel="noopener noreferrer">
            cos-data.seattle.gov
          </a>{' '}
          under the city&apos;s open data terms; this site is not affiliated with the City of Seattle.
        </p>
      </section>
    </>
  );
}
