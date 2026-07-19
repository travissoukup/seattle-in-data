import Link from 'next/link';
import { LeadsExplorer } from '@/components/LeadsExplorer';

export const metadata = {
  title: 'Find properties with open code cases | Seattle in Data',
};

export default function LeadsPage() {
  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permits and Construction</p>
        <h1>Find properties with open code cases</h1>
        <p>
          When someone reports a problem with a property, the city opens a code case. Most get resolved. The ones that
          stay open, and pile up, often point to a building in trouble: a vacant house, an unsafe structure, an
          absent landlord. This tool maps every Seattle property with an open case, scores how strong the signal is,
          and lets you filter, sort, and download the list. It is the kind of search people pay for, built from free
          public data.
        </p>
      </div>

      <LeadsExplorer />

      <div className="caveat">
        <strong>How the score works, and what it is not.</strong> The 0 to 10 score is a plain heuristic from three
        things the city data supports: how serious the case types are (a vacant building or emergency scores higher
        than weeds or noise, and an escalated case like a notice of violation or stop-work order scores higher
        still), how recently the newest open case was opened, and how many open cases the property has. It is a
        sorting aid, not a verdict. An open case is a report the city has not closed, not proof of a violation, and
        the data has nothing about who owns a property. A high score means worth a look, nothing more.
      </div>

      <p className="foot">
        Source: Code Complaints and Violations (ez4a-iug7) on data.seattle.gov. A property counts as a lead if it has
        at least one case in a status other than Completed, Closed, Withdrawn, or Compliance Achieved. Owner and
        absentee status are not in this dataset; they would come from King County assessor records.
      </p>
    </>
  );
}
