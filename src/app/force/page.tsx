import Link from 'next/link';
import data from '@/lib/generated/force.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = {
  title: 'When police use force',
  description: `Seattle police force reports fell ${data.declinePct}% from a ${data.peakYear} peak of ${fmtInt(data.peakCount)} to ${fmtInt(data.latestYearCount)} in ${data.latestFullYear}, the lowest full year on record.`,
};

const RES = 'https://data.seattle.gov/resource/ppi5-g2bj.json';
const q = (params: Record<string, string>) => `${RES}?${new URLSearchParams(params).toString()}`;

export default function ForcePage() {
  const typeRows = data.byType.map((t) => ({ label: t.key, value: t.n }));
  const precinctRows = data.byPrecinct.map((p) => ({ label: p.key, value: p.n }));
  const raceRows = data.race.rows.map((r) => ({ label: r.key, value: r.n }));
  const officerRows = data.officers.top.map((o) => ({ label: o.key, value: o.n }));
  const oisLatestRow = data.ois[data.ois.length - 1];

  const monthlyCsv = toCsv(
    ['month', 'level1', 'level2', 'level3', 'ois'],
    data.monthly.map((r) => [r.m, r.level1, r.level2, r.level3, r.ois]),
  );

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>
          Police use of force is down {data.declinePct}% from its {fmtYear(data.peakYear)} peak
        </h1>
        <p>
          Seattle officers filed {fmtInt(data.latestYearCount)} force reports in {data.latestFullYear}.
          {data.isRecordLow ? ' That is the lowest full year on record,' : ' That is'} down from{' '}
          {fmtInt(data.peakCount)} at the {fmtYear(data.peakYear)} peak. The city has logged{' '}
          {fmtInt(data.total)} of these reports since {fmtYear(data.meta.firstYear)}, and the record shows
          more than a decline. Black subjects appear in {data.race.blackSharePct}% of all reports, in a city
          that is about {data.race.blackPopSharePct}% Black. And the filing is top-heavy: the busiest tenth of
          officers accounts for {data.officers.topTenthSharePct}% of all reports.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Reports in {data.latestFullYear}</div>
          <div className="value">{fmtInt(data.latestYearCount)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Peak year, {fmtYear(data.peakYear)}</div>
          <div className="value">{fmtInt(data.peakCount)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Reports on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
      </div>

      <ChartCard
        title="Reports per year"
        desc={`Complete years only, ${fmtYear(data.meta.firstYear)} through ${data.latestFullYear}. The count has fallen in fits and starts since ${fmtYear(data.peakYear)}.`}
        csv={{ filename: 'force-monthly-by-level.csv', data: monthlyCsv }}
        footnote={`The current year is left off because it is not finished. ${fmtYear(data.meta.firstYear)} starts in late January, so it misses a few weeks. The CSV goes finer than the chart: complete months, split by force level.`}
        source={{
          id: 'ppi5-g2bj',
          query: q({
            $select: 'date_extract_y(occured_date_time) as y, count(*) as n',
            $where: `occured_date_time < '${data.meta.curYearStart}'`,
            $group: 'y',
            $order: 'y',
          }),
        }}
      >
        <TrendChart
          data={data.yearly}
          xKey="y"
          series={[{ key: 'n', name: 'Reports' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Reports by force level"
        desc="The city sorts force into levels. Level 1 is the lightest. OIS means an officer-involved shooting."
        csv={{ filename: 'force-by-level.csv', data: toCsv(['level', 'count'], data.byType.map((t) => [t.key, t.n])) }}
        footnote="Counts cover every report on record. Level 1 is things like pointing a firearm or a takedown with no injury; Level 3 covers serious injury or death."
        source={{
          id: 'ppi5-g2bj',
          query: q({
            $select: 'incident_type, count(*) as n',
            $group: 'incident_type',
            $order: 'n DESC',
          }),
        }}
      >
        <RankedBars rows={typeRows} valueName="Reports" valueFormat="compact" height={240} />
      </ChartCard>

      <ChartCard
        title="Officer-involved shootings per year"
        desc={`The totals above mostly track low-level force. Shootings move on their own: ${fmtInt(data.oisPeak.n)} in ${fmtYear(data.oisPeak.y)}, ${fmtInt(data.oisLow.n)} in ${fmtYear(data.oisLow.y)}, then ${fmtInt(oisLatestRow.n)} in ${fmtYear(oisLatestRow.y)}.`}
        csv={{ filename: 'force-ois-per-year.csv', data: toCsv(['year', 'shootings'], data.ois.map((r) => [r.y, r.n])) }}
        footnote="Complete years only. Counts are reports typed as OIS in the force log; each is one report, whoever was hit and however it ended."
        source={{
          id: 'ppi5-g2bj',
          query: q({
            $select: 'date_extract_y(occured_date_time) as y, count(*) as n',
            $where: `incident_type like '%OIS%' AND occured_date_time < '${data.meta.curYearStart}'`,
            $group: 'y',
            $order: 'y',
          }),
        }}
      >
        <TrendChart
          data={data.ois}
          xKey="y"
          series={[{ key: 'n', name: 'Shootings' }]}
          valueFormat="int"
          height={260}
        />
      </ChartCard>

      <ChartCard
        title="Who the force was used on"
        desc={`Subject race as officers recorded it, all years. Black subjects account for ${data.race.blackSharePct}% of reports; the 2020 Census puts Seattle's Black population near ${data.race.blackPopSharePct}%.`}
        csv={{
          filename: 'force-by-subject-race.csv',
          data: toCsv(['subject_race', 'count', 'share_pct'], data.race.rows.map((r) => [r.key, r.n, r.sharePct])),
        }}
        footnote={`Race is what the officer recorded, not what the person said. ${fmtInt(data.race.notSpecifiedCount)} reports carry no race at all, so every share here is a floor. A raw count also cannot say why the gap exists; it does not adjust for who police stop, who calls 911, or where officers patrol. It can only show the gap is large: roughly ${fmtInt(data.race.blackVsPopRatio)} times the population share.`}
        source={{
          id: 'ppi5-g2bj',
          query: q({
            $select: 'subject_race, count(*) as n',
            $group: 'subject_race',
            $order: 'n DESC',
          }),
        }}
      >
        <RankedBars rows={raceRows} valueName="Reports" valueFormat="compact" height={300} />
      </ChartCard>

      <ChartCard
        title="A small group of officers files most reports"
        desc={`${fmtInt(data.officers.distinct)} officers appear in the log. The median officer has ${fmtInt(data.officers.median)} reports; the busiest tenth (${fmtInt(data.officers.topTenthCount)} officers) filed ${data.officers.topTenthSharePct}% of all ${fmtInt(data.officers.reportTotal)}. These are the twelve busiest.`}
        csv={{
          filename: 'force-top-100-officers.csv',
          data: toCsv(['officer_id', 'reports'], data.officers.top100.map((o) => [o.id, o.n])),
        }}
        footnote="Officer IDs are the anonymized numbers in the public dataset, not badge numbers. High counts track assignment as much as behavior: crisis, bike, and downtown patrol units meet more resistance than a desk job ever will. The CSV lists the top 100."
        source={{
          id: 'ppi5-g2bj',
          query: q({
            $select: 'officer_id, count(*) as n',
            $group: 'officer_id',
            $order: 'n DESC',
            $limit: '100',
          }),
        }}
      >
        <RankedBars rows={officerRows} valueName="Reports" valueFormat="int" height={320} />
      </ChartCard>

      <ChartCard
        title={`Reports by precinct, ${fmtYear(data.meta.firstYear)} through ${fmtYear(data.meta.precinctEndYear)}`}
        desc="Where the force happened, by police precinct, for the years the field was actually filled in."
        csv={{
          filename: 'force-by-precinct.csv',
          data: toCsv(['precinct', 'count'], data.byPrecinct.map((p) => [p.key, p.n])),
        }}
        footnote={`SPD stopped recording precincts in ${Number(data.meta.precinctEndYear) + 1}: nearly every report since carries a placeholder code. This chart stops at ${fmtYear(data.meta.precinctEndYear)}, and placeholder codes (out of jurisdiction, unknown) are left out.`}
        source={{
          id: 'ppi5-g2bj',
          query: q({
            $select: 'precinct, count(*) as n',
            $where: `occured_date_time < '${Number(data.meta.precinctEndYear) + 1}-01-01'`,
            $group: 'precinct',
            $order: 'n DESC',
          }),
        }}
      >
        <RankedBars rows={precinctRows} valueName="Reports" valueFormat="compact" height={260} />
      </ChartCard>

      <div className="caveat">
        <strong>A report is a record, not a ruling.</strong> Each row says force was used, not whether it was
        justified. The levels differ a lot in how severe they are, so a Level 1 report and an officer-involved
        shooting both count as one here even though they are nothing alike. Fewer reports can mean less force,
        fewer police contacts, or changed reporting practice; this dataset alone cannot separate the three.
      </div>

      <RelatedLinks slug="/force" />
    </>
  );
}
