import Link from 'next/link';

export const metadata = { title: 'About | Seattle in Data' };

export default function AboutPage() {
  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> About
      </p>
      <div className="page-head">
        <p className="eyebrow">About</p>
        <h1>How this was made</h1>
        <p>
          Seattle in Data turns the city&apos;s public records into plain maps and charts. The city publishes a huge
          amount about how it works, from permits to library checkouts to 911 calls, and most of it sits in databases
          that almost nobody opens. This site reads that data and shows it in a way you can actually use.
        </p>
      </div>

      <div className="card">
        <h2 className="section-title">Where the data comes from</h2>
        <p className="muted">
          Almost everything here comes from Seattle&apos;s open data portal at{' '}
          <a href="https://data.seattle.gov" target="_blank" rel="noopener noreferrer">
            data.seattle.gov
          </a>
          , pulled through its public API. The walkability map uses OpenStreetMap. Every page names the exact dataset
          it uses, with its ID, and links back to the source so you can pull the same numbers and check the work.
        </p>
      </div>

      <div className="card">
        <h2 className="section-title">How fresh the numbers are</h2>
        <p className="muted">
          The site is a snapshot, not a live feed. Each page is built from data downloaded at a point in time, and
          every page shows the date it was built. When you compare a figure here to the live portal, small drift is
          normal because the city keeps adding records. The leads tool and a few others are rebuilt more often.
        </p>
      </div>

      <div className="card">
        <h2 className="section-title">How to read it</h2>
        <p className="muted">
          A few rules run through the whole site. Counts are not the same as rates: a map with more dots can just
          mean more people live there, so where it matters we also show a rate. A report is not a ruling: a 911 call
          is a request for help, a code complaint is not a confirmed violation, a use-of-force report is not a finding
          that the force was justified. Every page has a short note spelling out what its data can and cannot tell
          you.
        </p>
      </div>

      <div className="card" style={{ borderLeft: '4px solid var(--accent-2)' }}>
        <h2 className="section-title">Who made it, and a caveat</h2>
        <p className="muted">
          This is an independent project, not affiliated with the City of Seattle or any of its departments. It is
          free, with no ads, accounts, or tracking beyond what the host needs to serve the pages. It is built and run
          by one person as a way to make public data easier to use. If a number looks wrong, it probably is worth a
          second look, so please say so.
        </p>
      </div>

      <p className="foot">
        Browse <Link href="/">the topics</Link> or see <Link href="/all">every page</Link>.
      </p>
    </>
  );
}
