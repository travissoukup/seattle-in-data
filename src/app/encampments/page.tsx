import Link from 'next/link';
import data from '@/lib/generated/encampments.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';

export const metadata = { title: 'Encampment reports | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

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
  const monthly = data.monthly;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/housing">Housing</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Housing</p>
        <h1>Encampment reports</h1>
        <p>
          When someone spots a tent or a vehicle they think people are living in, they can report it to the city. Each
          report is a request to come take a look. The city has logged {fmtInt(data.total)} of these reports, with about{' '}
          {fmtInt(data.last12)} in the last year and {fmtInt(data.last30)} in just the last month.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Reports on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">In the last 12 months</div>
          <div className="value">{fmtInt(data.last12)}</div>
        </div>
        <div className="stat-card">
          <div className="label">In the last 30 days</div>
          <div className="value">{fmtInt(data.last30)}</div>
        </div>
      </div>

      <ChartCard
        title="The 6,000 most recent reports, mapped"
        desc="Each dot is one report someone filed. Click a dot to see its status and the day it came in."
        footnote="Source: Unauthorized Encampment Reports (k7ra-jqqe) on data.seattle.gov. The map shows recent reports that came with map coordinates."
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="Which neighborhoods get reported most"
        desc="Counts cover every report on record, grouped by the city's community reporting area."
        csv={{ filename: 'encampment-reports-by-area.csv', data: toCsv(['area', 'reports'], data.byArea.map((a) => [a.key, a.n])) }}
        footnote="Source: Unauthorized Encampment Reports (k7ra-jqqe)."
      >
        <RankedBars rows={areaRows} valueName="Reports" valueFormat="compact" height={340} />
      </ChartCard>

      <ChartCard
        title="Where reports stand"
        desc="Most reports get marked closed. A report can close because the city looked, because it was a duplicate, or for other reasons."
      >
        <RankedBars rows={statusRows} valueName="Reports" valueFormat="compact" height={260} />
      </ChartCard>

      <ChartCard
        title="Reports per month"
        desc="How the volume of reports has moved since 2022."
        footnote="Source: Unauthorized Encampment Reports (k7ra-jqqe). The newest weeks may be partial."
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
        <strong>What this shows, and what it does not.</strong> Each row is a report asking the city to respond. It is
        not a confirmed encampment, and it is not a count of people living outside. The same spot can be reported many
        times by many people, so more dots can mean more reporters as much as more camps.
      </div>

      <RelatedLinks slug="/encampments" />
    </>
  );
}
