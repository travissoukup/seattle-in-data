import Link from 'next/link';
import stats from '@/lib/generated/leads.json';
import { LeadsExplorer } from './LeadsExplorer';
import { ChartCard } from '@/components/ChartCard';
import { TrendChart, RankedBars } from '@/components/charts';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { fmtInt, fmtYear, toCsv } from '@/lib/format';

export const metadata = {
  title: 'Seattle properties with open code cases, mapped and scored',
  description: `Seattle has ${fmtInt(stats.openCases)} open code enforcement cases, ${fmtInt(
    stats.underInvestigation,
  )} of them waiting at Under Investigation and the oldest dating to ${fmtYear(stats.oldest.year)}.`,
};

const DS = 'ez4a-iug7';
const soqlUrl = (params: Record<string, string>) =>
  `https://data.seattle.gov/resource/${DS}.json?${new URLSearchParams(params).toString()}`;
// The same open-case definition the fetch script uses: not resolved, not a
// duplicate report, and opened by the snapshot date.
const OPEN_WHERE = `opendate <= '${stats.todayStr}' AND statuscurrent NOT IN ('Completed','Closed','Withdrawn','Compliance Achieved','Application Completed','Reviews Completed','Open Duplicate')`;

export default function LeadsPage() {
  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permits and Construction</p>
        <h1>
          Seattle has {fmtInt(stats.openCases)} open code cases, and the oldest dates to {fmtYear(stats.oldest.year)}
        </h1>
        <p>
          When someone reports a problem with a property, the city opens a case. Most get resolved. These have not:{' '}
          {fmtInt(stats.underInvestigation)} sit at Under Investigation, {fmtInt(stats.escalatedCases)} have escalated
          to a notice of violation, a citation, an emergency order, or the law department, and{' '}
          {fmtInt(stats.stuckDecadeN)} were opened more than ten years ago. This tool turns that pile into a searchable
          list: {fmtInt(stats.properties)} properties, each scored 0 to 10 for how strong the distress signal is.
          These are signals in a public enforcement record. A report is not a verdict on a property or its owner.
        </p>
      </div>

      <DataFreshness date={stats.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Properties with open cases</div>
          <div className="value">{fmtInt(stats.properties)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Open cases</div>
          <div className="value">{fmtInt(stats.openCases)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Escalated cases</div>
          <div className="value">{fmtInt(stats.escalatedCases)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Oldest open case</div>
          <div className="value">{fmtYear(stats.oldest.year)}</div>
        </div>
      </div>

      <ChartCard
        title="The open pile, by the year each case was opened"
        desc={
          <>
            A snapshot of what is open today. Most open cases are young: {fmtInt(stats.openedThisYear)} were opened
            this year. But the tail is long. {fmtInt(stats.stuckDecadeN)} open cases predate {fmtYear(stats.decadeYear)},
            and one has waited since {fmtYear(stats.oldest.year)}.
          </>
        }
        csv={{
          filename: 'open-cases-by-year-opened.csv',
          data: toCsv(['year_opened', 'still_open'], stats.byYearOpened.map((r) => [r.y, r.n])),
        }}
        footnote={
          <>
            Counts every case in an unresolved status as of the snapshot date, grouped by the year it was opened.
            Duplicate reports (status Open Duplicate) are excluded. The current year keeps adding cases, and older
            years shrink as cases close, so this is a portrait of the backlog, not a trend.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'date_extract_y(opendate) as y, count(*) as n',
            $group: 'y',
            $order: 'y',
            $where: OPEN_WHERE,
          }),
        }}
      >
        <TrendChart data={stats.byYearOpened} xKey="y" series={[{ key: 'n', name: 'Still-open cases' }]} valueFormat="compact" height={280} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>Search the list</h2>
        <p className="desc">
          Filter by type, ZIP, score, and recency, click any property for its case history, and download the result as
          a CSV. Filters land in the page address, so a filtered view can be shared or bookmarked.
        </p>
      </div>

      <LeadsExplorer />

      <ChartCard
        title="Where open cases sit in the process"
        desc={
          <>
            Enforcement is a funnel, and most cases wait near the top: {fmtInt(stats.underInvestigation)} at Under
            Investigation. Further down, {fmtInt(stats.novIssued)} carry a notice of violation,{' '}
            {fmtInt(stats.citationIssued)} a citation, and {fmtInt(stats.referredToLaw)} sit with the law department.
          </>
        }
        csv={{
          filename: 'open-cases-by-status.csv',
          data: toCsv(['status', 'open_cases'], stats.funnel.map((f) => [f.status, f.n])),
        }}
        footnote={
          <>
            Current status of every open case in the snapshot, duplicate reports excluded. The escalated count above
            sums NOV, citation, hazard correction, emergency orders, stop work, and referral to law.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'statuscurrent, count(*) as n',
            $group: 'statuscurrent',
            $order: 'n DESC',
            $where: OPEN_WHERE,
          }),
        }}
      >
        <RankedBars rows={stats.funnel.map((f) => ({ label: f.status, value: f.n }))} valueName="Open cases" valueFormat="compact" height={400} />
      </ChartCard>

      <ChartCard
        title={`Vacant-building complaints rose ${fmtInt(stats.vacant.upPct)}% from their ${fmtYear(stats.vacant.troughYear)} low`}
        desc={
          <>
            New vacant-building complaints fell to {fmtInt(stats.vacant.troughN)} in {fmtYear(stats.vacant.troughYear)},
            then climbed to {fmtInt(stats.vacant.reboundN)} in {fmtYear(stats.vacant.reboundYear)}, close to the{' '}
            {fmtYear(stats.vacant.peakYear)} record of {fmtInt(stats.vacant.peakN)}. {fmtYear(stats.vacant.lastFullYear)}{' '}
            eased to {fmtInt(stats.vacant.lastFullN)}, still well above the low.
          </>
        }
        csv={{
          filename: 'vacant-building-complaints-per-year.csv',
          data: toCsv(['year', 'complaints'], stats.vacant.yearly.map((r) => [r.y, r.n])),
        }}
        footnote={
          <>
            All cases whose type mentions a vacant building, open or resolved, by the year opened. Full calendar years
            only ({fmtYear(stats.vacant.firstFullYear)} to {fmtYear(stats.vacant.lastFullYear)}); records begin{' '}
            {stats.dataStart}.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'date_extract_y(opendate) as y, count(*) as n',
            $group: 'y',
            $order: 'y',
            $where: `upper(recordtypedesc) LIKE '%VACANT%' AND date_extract_y(opendate) >= ${stats.vacant.firstFullYear} AND date_extract_y(opendate) <= ${stats.vacant.lastFullYear}`,
          }),
        }}
      >
        <TrendChart data={stats.vacant.yearly} xKey="y" series={[{ key: 'n', name: 'Vacant-building complaints' }]} valueFormat="compact" height={280} />
      </ChartCard>

      <ChartCard
        title="Vacant-building distress has its own geography"
        desc={
          <>
            ZIP {stats.vacantTopZip.zip} tops the list for open vacant-building cases with{' '}
            {fmtInt(stats.vacantTopZip.n)}, yet it ranks #{fmtInt(stats.vacantTopZipOverallRank)} for open cases of any
            kind. Overall, ZIP {stats.leadTopZip.zip} leads with {fmtInt(stats.leadTopZip.n)} open cases. The vacancy
            map and the complaint map are not the same map.
          </>
        }
        csv={{
          filename: 'open-vacant-cases-by-zip.csv',
          data: toCsv(['zip', 'open_cases'], stats.vacantOpenByZip.map((z) => [z.zip, z.n])),
        }}
        footnote={
          <>
            The {fmtInt(stats.vacantOpenCases)} open vacant-building cases, counted by ZIP; cases without a Seattle
            98xxx ZIP are left out. Top eight shown.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'originalzip, count(*) as n',
            $group: 'originalzip',
            $order: 'n DESC',
            $limit: '50',
            $where: `${OPEN_WHERE} AND upper(recordtypedesc) LIKE '%VACANT%'`,
          }),
        }}
      >
        <RankedBars rows={stats.vacantOpenByZip.map((z) => ({ label: z.zip, value: z.n }))} valueName="Open vacant-building cases" valueFormat="int" height={300} />
      </ChartCard>

      <div className="caveat">
        <strong>A high score means worth a look, nothing more.</strong> The 0 to 10 score is a plain heuristic built
        from three things the data supports: how serious the case types are (a vacant building or an emergency scores
        higher than weeds or noise, and an escalated case higher still), how recently the newest open case was opened,
        and how many open cases the property has. Every number here is a distress signal in a public enforcement
        record. An open case is a report the city has not closed, not proof of a violation, and the data says nothing
        about who owns a property or why a case is still open.
      </div>

      <p className="foot">
        Source: Code Complaints and Violations on data.seattle.gov, linked with the exact query under each chart. A
        property counts as a lead if it has at least one case in a status other than Completed, Closed, Withdrawn,
        Compliance Achieved, Application Completed, or Reviews Completed. The {fmtInt(stats.dupExcluded)} cases marked
        Open Duplicate are excluded everywhere on this page, since a duplicate report of the same problem is not a
        second problem. There is no date cutoff: the oldest open cases are in. {fmtInt(stats.noCoordProps)} properties
        lack usable map coordinates and appear in the list but not on the map, and {fmtInt(stats.noAddrCases)} open
        cases with no street address are in the case totals but cannot be listed as properties. Owner and absentee
        status are not in this dataset; they would come from King County assessor records.
      </p>

      <RelatedLinks slug="/leads" />
    </>
  );
}
