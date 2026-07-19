import Link from 'next/link';
import data from '@/lib/generated/encampments.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';
import { AreaTrend } from './AreaTrend';

export const metadata = {
  title: 'Encampment reports',
  description: `Seattle logged ${fmtInt(data.peakN)} encampment reports in ${data.peakYear}, ${data.surgeMultiple} times the ${data.baseYear} count, and ${data.fifiPct}% of all reports arrive through the Find It Fix It app.`,
};

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];

const DATASET = 'k7ra-jqqe';
const API = `https://data.seattle.gov/resource/${DATASET}.json`;
const q = (params: Record<string, string>) =>
  `${API}?${Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')}`;

const yearlyQuery = q({
  $select: 'date_extract_y(createddate) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
});
const methodQuery = q({
  $select: 'methodreceivedname, count(*) as n',
  $group: 'methodreceivedname',
  $order: 'n DESC',
});
const mapQuery = q({
  $select: 'latitude,longitude,servicerequeststatusname,createddate',
  $where: 'latitude IS NOT NULL',
  $order: 'createddate DESC',
  $limit: '6000',
});
const areaQuery = q({
  $select: 'community_reporting_area, count(*) as n',
  $group: 'community_reporting_area',
  $order: 'n DESC',
});
const areaYearQuery = q({
  $select: 'community_reporting_area as area, date_extract_y(createddate) as y, count(*) as n',
  $where: 'community_reporting_area IS NOT NULL',
  $group: 'area, y',
  $order: 'area, y',
});
const statusQuery = q({
  $select: 'servicerequeststatusname, count(*) as n',
  $group: 'servicerequeststatusname',
  $order: 'n DESC',
});
const monthlyQuery = q({
  $select: 'date_trunc_ym(createddate) as ym, count(*) as n',
  $group: 'ym',
  $order: 'ym',
});

export default function EncampmentsPage() {
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: PALETTE[0],
    label: `<strong>${p.s}</strong><br/>${p.d}`,
  }));
  const legend = [{ label: 'Encampment report', color: PALETTE[0] }];

  const statusRows = data.byStatus.map((s) => ({ label: s.key, value: s.n }));
  const areaRows = data.byArea.map((a) => ({ label: a.key, value: a.n }));
  const methodRows = data.byMethod.map((m) => ({ label: m.key, value: m.n }));
  const monthly = data.monthly;
  const ex = data.examplePassed;

  const firstYearRow = data.yearly[0];
  const peakRow = data.yearly.find((y) => y.year === String(data.peakYear));
  const appShareFirst = firstYearRow ? Math.round((firstYearRow.app / firstYearRow.n) * 100) : 0;
  const appSharePeak = peakRow ? Math.round((peakRow.app / peakRow.n) * 100) : 0;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/housing">Housing</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Housing</p>
        <h1>
          Encampment reports are up {data.surgeMultiple}x since {data.baseYear}
        </h1>
        <p>
          When someone spots a tent or a vehicle they think people are living in, they can ask the city to come look.
          Seattle logged {fmtInt(data.peakN)} of those reports in {data.peakYear}, {data.surgeMultiple} times
          the {fmtInt(data.baseN)} it logged in {data.baseYear}. Most arrive one way: {data.fifiPct}% of
          all {fmtInt(data.total)} reports on record came through the Find It Fix It phone app. The pace is holding,
          with {fmtInt(data.ytdN)} reports already this year.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Reports in {data.peakYear}</div>
          <div className="value">{fmtInt(data.peakN)}</div>
          <div className="sub">The busiest full year on record.</div>
        </div>
        <div className="stat-card">
          <div className="label">Reports in {data.baseYear}</div>
          <div className="value">{fmtInt(data.baseN)}</div>
          <div className="sub">The first year in the dataset.</div>
        </div>
        <div className="stat-card">
          <div className="label">Through the Find It Fix It app</div>
          <div className="value">{data.fifiPct}%</div>
          <div className="sub">
            {fmtInt(data.fifiN)} reports, against {fmtInt(data.phoneN)} by phone.
          </div>
        </div>
        <div className="stat-card">
          <div className="label">So far in {data.currentYear}</div>
          <div className="value">{fmtInt(data.ytdN)}</div>
          <div className="sub">Through {data.asOfLabel}.</div>
        </div>
      </div>

      <ChartCard
        title="The surge, year by year"
        desc={
          <>
            Each point is a year of reports, and the app line moves with the total. Find It Fix It
            carried {appShareFirst}% of reports in {data.baseYear} and {appSharePeak}% in {data.peakYear}, so the
            surge and the app are hard to separate.
          </>
        }
        csv={{
          filename: 'encampment-reports-by-year.csv',
          data: toCsv(
            ['year', 'reports', 'via_find_it_fix_it'],
            data.yearly.map((y) => [y.year, y.n, y.app]),
          ),
        }}
        footnote={
          <>
            Grouped by the year the report came in. The dataset begins in {data.firstMonthLabel}, so the first year is
            missing its opening months and the rise since then is understated. The {data.currentYear} point covers
            January through {data.asOfLabel} only.
          </>
        }
        source={{ id: DATASET, query: yearlyQuery }}
      >
        <TrendChart
          data={data.yearly}
          xKey="year"
          series={[
            { key: 'n', name: 'All reports' },
            { key: 'app', name: 'Via Find It Fix It app' },
          ]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="One app produces almost all of it"
        desc={
          <>
            The Find It Fix It app outnumbers phone calls {data.appPhoneRatio} to 1. Reporting a tent takes a few taps,
            and that ease is part of why the report count grew the way it did.
          </>
        }
        csv={{
          filename: 'encampment-reports-by-method.csv',
          data: toCsv(['method', 'reports'], data.byMethod.map((m) => [m.key, m.n])),
        }}
        footnote="Every report on record, grouped by the channel the city logged it under. Small channels (walk-ins, letters, and similar) are rolled into one bar."
        source={{ id: DATASET, query: methodQuery }}
      >
        <RankedBars rows={methodRows} valueName="Reports" valueFormat="compact" height={300} />
      </ChartCard>

      <ChartCard
        title="The 6,000 most recent reports, mapped"
        desc="Each dot is one report someone filed. Click a dot to see its status and the day it came in."
        footnote="The map shows the most recent reports that came with map coordinates."
        source={{ id: DATASET, query: mapQuery }}
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="Which neighborhoods get reported most"
        desc={
          <>
            The {data.byArea.length} busiest of the city&apos;s community reporting areas. One gap to know
            about: {fmtInt(data.noArea)} reports ({data.noAreaPct}% of everything on record) carry no neighborhood tag
            and are not counted here. Nearly all of them predate {data.areaTagYear}, when the city started tagging in
            earnest, so this chart is really a picture of reports since then.
          </>
        }
        csv={{ filename: 'encampment-reports-by-area.csv', data: toCsv(['area', 'reports'], data.byArea.map((a) => [a.key, a.n])) }}
        footnote="Grouped by community reporting area, untagged reports excluded."
        source={{ id: DATASET, query: areaQuery }}
      >
        <RankedBars rows={areaRows} valueName="Reports" valueFormat="compact" height={340} />
      </ChartCard>

      <ChartCard
        title="Pick a neighborhood, see its trend"
        desc={
          <>
            Reports per year for the {data.topAreaCount} busiest areas, starting in {data.areaTagYear} when
            neighborhood tags begin.
            {ex ? (
              <>
                {' '}
                {ex.area} stands out: its {fmtInt(ex.ytd)} reports so far in {data.currentYear} already top its
                full {data.prevYear} count of {fmtInt(ex.prev)}, with months still to go.
              </>
            ) : null}
          </>
        }
        csv={{
          filename: 'encampment-reports-area-by-year.csv',
          data: toCsv(
            ['area', 'year', 'reports'],
            data.areaYearly.flatMap((a) => a.years.map((y) => [a.area, y.year, y.n])),
          ),
        }}
        footnote={
          <>
            Grouped by area and year. The {data.currentYear} point covers January through {data.asOfLabel} only, so a
            flat or rising final segment means the area is running ahead of last year&apos;s pace.
          </>
        }
        source={{ id: DATASET, query: areaYearQuery }}
      >
        <AreaTrend areas={data.areaYearly} />
      </ChartCard>

      <ChartCard
        title="Where reports stand"
        desc={
          <>
            Most reports get marked closed. A report can close because the city looked, because it was a duplicate, or
            for other reasons. At least {data.dupPct}% of all reports ({fmtInt(data.dupN)}) are flagged as duplicates
            of another report, and plain &quot;Closed&quot; absorbs duplicates too, so that share is a floor.
          </>
        }
        csv={{ filename: 'encampment-reports-by-status.csv', data: toCsv(['status', 'reports'], data.byStatus.map((s) => [s.key, s.n])) }}
        footnote={
          <>
            Grouped by service request status. The dataset uses two duplicate labels, &quot;Duplicate (Closed)&quot;
            and &quot;Closed as Duplicate&quot;; they are merged into one bar here.
          </>
        }
        source={{ id: DATASET, query: statusQuery }}
      >
        <RankedBars rows={statusRows} valueName="Reports" valueFormat="compact" height={260} />
      </ChartCard>

      <ChartCard
        title="Reports per month"
        desc={
          <>
            The same surge at monthly grain, from the start of the dataset. Summers run hot and winters run cold, so
            compare a month to the same month a year earlier, not to the one before it.
          </>
        }
        csv={{ filename: 'encampment-reports-by-month.csv', data: toCsv(['month', 'reports'], monthly.map((m) => [m.ym, m.n])) }}
        footnote={
          <>
            Grouped by month. Partial months at both ends are trimmed: the count starts with the first full month
            after the dataset opens in {data.firstMonthLabel} and stops before the current month.
          </>
        }
        source={{ id: DATASET, query: monthlyQuery }}
      >
        <TrendChart
          data={monthly}
          xKey="ym"
          series={[{ key: 'n', name: 'Reports' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">Type your ZIP or neighborhood to see how it stacks up, by count and per resident.</p>
      </div>
      <AreaCompare data={data.areaByZip} unit="encampment reports" />

      <div className="caveat">
        <strong>A report is a complaint, not a headcount.</strong> Each row is a request asking the city to respond. It
        is not a confirmed encampment, and it is not a count of people living outside. The same spot can be reported
        many times by many people, so more dots can mean more reporters as much as more camps. That matters most for
        the surge chart: the Find It Fix It app made filing a report far easier over these same years, so part of
        the {data.surgeMultiple}x rise is a lower barrier to reporting and part is conditions on the ground. This
        dataset cannot split the two.
      </div>

      <RelatedLinks slug="/encampments" />
    </>
  );
}
