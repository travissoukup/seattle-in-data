import Link from 'next/link';
import data from '@/lib/generated/crime.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtPct, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';
import { NeighborhoodPicker } from './NeighborhoodPicker';

export const metadata = {
  title: 'Reported crime',
  description: `Seattle logged ${fmtInt(data.lowest.reports)} police reports in ${fmtYear(data.lowest.y)}, the fewest of any full year since at least ${fmtYear(data.seriesStartYear)}.`,
};

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

const DATASET = 'tazs-3rd5';
const soqlUrl = (params: Record<string, string>) =>
  `https://data.seattle.gov/resource/${DATASET}.json?${new URLSearchParams(params).toString()}`;

/** '2026-06' -> '2026-07-01' (exclusive end for a month window). */
const nextMonthStart = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};

export default function CrimePage() {
  const top5 = data.byCategory.slice(0, 5).map((c) => c.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.o}</strong><br/>${p.t} crime<br/>${p.d}`,
  }));
  const legend = [
    ...top5.map((t, i) => ({ label: t, color: PALETTE[i] })),
    { label: 'Other', color: GRAY },
  ];

  const offenseRows = data.topOffenses.map((o) => ({ label: o.key, value: o.n }));
  const yearEndCutoff = `${Number(data.latestYear.y) + 1}-01-01`;
  const yearWhere = `report_date_time >= '${data.seriesStartYear}-01-01' AND report_date_time < '${yearEndCutoff}'`;
  const lastMonth = data.hoodMonthly.months[data.hoodMonthly.months.length - 1];

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>
          {data.lowIsLatest
            ? `${fmtYear(data.lowest.y)} was Seattle's quietest year for police reports since at least ${fmtYear(data.seriesStartYear)}`
            : 'Reported crime'}
        </h1>
        <p>
          People filed {fmtInt(data.lowest.reports)} police reports in {fmtYear(data.lowest.y)}. That is fewer
          than any full year since at least {fmtYear(data.seriesStartYear)}, and {fmtPct(data.dropPct)} below{' '}
          {fmtYear(data.prevYear.y)}. It is not a paperwork lag either: late-filed reports barely move a closed
          year, so the dip is real. Over the last 12 months, {fmtInt(data.last12.reports)} reports came in across{' '}
          {fmtInt(data.neighborhoods)} neighborhoods, and most of them describe property crime, like theft and
          break-ins, not crime against a person.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Police reports, last 12 months</div>
          <div className="value">{fmtInt(data.last12.reports)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Offenses inside those reports</div>
          <div className="value">{fmtInt(data.last12.offenses)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Most common kind</div>
          <div className="value" style={{ fontSize: 20 }}>{data.topCategory} crime</div>
        </div>
      </div>

      <ChartCard
        title="Reports per year, and the offenses inside them"
        desc={`One police report can list several offenses, about ${data.last12.perReport} on average, so the two lines track together but never touch. Both hit their ${fmtYear(data.seriesStartYear)} through ${fmtYear(data.latestYear.y)} low in ${fmtYear(data.lowest.y)}.`}
        csv={{
          filename: 'crime-per-year.csv',
          data: toCsv(
            ['year', 'police_reports', 'offense_records'],
            data.yearly.map((r) => [r.y, r.reports, r.offenses]),
          ),
        }}
        footnote={`Years run ${fmtYear(data.seriesStartYear)} through ${fmtYear(data.latestYear.y)}; the current partial year is left off. SPD moved to a new records system and the federal NIBRS reporting standard in 2019 and converted older records, so the 2019 dip partly reflects that switch. A report can also be filed long after the crime, which lets recent years grow a little after the fact.`}
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'date_extract_y(report_date_time) as y, count(distinct report_number) as reports, count(*) as offenses',
            $group: 'y',
            $order: 'y',
            $where: yearWhere,
          }),
        }}
      >
        <TrendChart
          data={data.yearly}
          xKey="y"
          series={[
            { key: 'reports', name: 'Police reports' },
            { key: 'offenses', name: 'Offense records' },
          ]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Car theft spiked, then fell hard"
        desc={`Motor vehicle theft peaked at ${fmtInt(data.mvt.peak.n)} reports in ${fmtYear(data.mvt.peak.y)}, the Kia and Hyundai era, after ${fmtInt(data.mvt.y2019)} in 2019. By ${fmtYear(data.mvt.latest.y)} it was down ${fmtInt(data.mvt.dropPct)}% from that peak, at ${fmtInt(data.mvt.latest.n)}.`}
        csv={{
          filename: 'crime-motor-vehicle-theft.csv',
          data: toCsv(['year', 'police_reports'], data.mvt.series.map((r) => [r.y, r.n])),
        }}
        footnote="Counts police reports whose offense is motor vehicle theft (attempts included, stolen accessories not). The 2022 and 2023 surge tracks the TikTok-spread Kia and Hyundai ignition exploit; a recall and software fix followed."
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'date_extract_y(report_date_time) as y, count(distinct report_number) as n',
            $group: 'y',
            $order: 'y',
            $where: `offense_sub_category = 'MOTOR VEHICLE THEFT' AND ${yearWhere}`,
          }),
        }}
      >
        <TrendChart
          data={data.mvt.series}
          xKey="y"
          series={[{ key: 'n', name: 'Motor vehicle theft reports' }]}
          valueFormat="compact"
          height={280}
        />
      </ChartCard>

      <ChartCard
        title="Gunfire climbed through the pandemic and is easing"
        desc={`Reports involving a shooting or shots fired roughly doubled, going from ${fmtInt(data.shootings.y2019)} in 2019 to a peak of ${fmtInt(data.shootings.peak.n)} in ${fmtYear(data.shootings.peak.y)}. The ${fmtYear(data.shootings.latest.y)} count of ${fmtInt(data.shootings.latest.n)} is the lowest since ${fmtYear(data.shootings.lowSinceYear)}.`}
        csv={{
          filename: 'crime-gunfire.csv',
          data: toCsv(['year', 'police_reports'], data.shootings.series.map((r) => [r.y, r.n])),
        }}
        footnote="Counts police reports flagged with any shooting type: shots fired (casings, eyewitness, or property damage), non-fatal injury, or fatal injury. Most of these reports are shots fired without an injury."
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'date_extract_y(report_date_time) as y, count(distinct report_number) as n',
            $group: 'y',
            $order: 'y',
            $where: `shooting_type_group != '-' AND ${yearWhere}`,
          }),
        }}
      >
        <TrendChart
          data={data.shootings.series}
          xKey="y"
          series={[{ key: 'n', name: 'Reports involving gunfire' }]}
          valueFormat="int"
          height={280}
        />
      </ChartCard>

      <ChartCard
        title="Pick a neighborhood, see its months"
        desc={`Monthly police reports for any of the ${fmtInt(data.hoodMonthly.hoods.length)} neighborhoods SPD tags. Over the last 12 months, ${data.topHoods[0].key} tops the list with ${fmtInt(data.topHoods[0].n)} reports, ahead of ${data.topHoods[1].key} (${fmtInt(data.topHoods[1].n)}) and ${data.topHoods[2].key} (${fmtInt(data.topHoods[2].n)}).`}
        footnote={`The neighborhood field is only filled in reliably from ${fmtYear(data.hoodMonthly.startYear)} on, so the series starts there. The current partial month is left off. Neighborhood boundaries are SPD's, not the city clerk's, so the names can differ from other maps.`}
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'neighborhood, date_trunc_ym(report_date_time) as m, count(distinct report_number) as n',
            $group: 'neighborhood,m',
            $order: 'neighborhood,m',
            $where: `report_date_time >= '${data.hoodMonthly.startYear}-01-01' AND report_date_time < '${nextMonthStart(lastMonth)}' AND neighborhood NOT IN ('-','UNKNOWN','OOJ') AND neighborhood IS NOT NULL`,
            $limit: '50000',
          }),
        }}
      >
        <NeighborhoodPicker data={data.hoodMonthly} />
      </ChartCard>

      <ChartCard
        title="The most recent reports, mapped"
        desc="Each dot is one police report, placed by its lead offense. Color shows whether it was against a person, property, or society (things like drugs or weapons). Click a dot for the offense and date."
        footnote="The map shows the newest reports that came with map coordinates, one dot per report even when a report lists several offenses. Some reports have no location and are left off."
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'report_number,latitude,longitude,nibrs_crime_against_category,offense_sub_category,report_date_time',
            $where: 'latitude IS NOT NULL',
            $order: 'report_date_time DESC',
            $limit: '7000',
          }),
        }}
      >
        <PointMap points={points} legend={legend} height={520} radius={3} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">Type your ZIP or neighborhood to see how it stacks up, by count and per resident.</p>
      </div>
      <AreaCompare data={data.areaByZip} unit="police reports" />

      <ChartCard
        title="What gets reported most"
        desc="The top offense groups over the last 12 months, counted as offense records. Theft leads by a wide margin."
        csv={{
          filename: 'crime-by-offense.csv',
          data: toCsv(['offense', 'offense_records_last_12_months'], data.topOffenses.map((o) => [o.key, o.n])),
        }}
        footnote="Counts offense records, not reports: a report listing a burglary and an assault adds one to each group. Covers the last 12 months. Placeholder and catch-all labels are dropped."
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'offense_sub_category, count(*) as n',
            $group: 'offense_sub_category',
            $order: 'n DESC',
            $where: `report_date_time > '${data.since}'`,
            $limit: '16',
          }),
        }}
      >
        <RankedBars rows={offenseRows} valueName="Offense records" valueFormat="compact" height={360} />
      </ChartCard>

      <div className="caveat">
        <strong>A count of police reports is a count of paperwork, not of harm.</strong> These are crimes reported
        to police, not all crime. Plenty of crime never gets reported, and what does get reported depends on who
        calls and how police record it. Where you see more dots can mean more reporting or more patrols as much as
        more crime. A report is not the same as a charge or a conviction.
      </div>

      <RelatedLinks slug="/crime" />
    </>
  );
}
