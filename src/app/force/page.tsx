import Link from 'next/link';
import data from '@/lib/generated/force.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'When police use force | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function ForcePage() {
  const typeRows = data.byType.map((t) => ({ label: t.key, value: t.n }));
  const precinctRows = data.byPrecinct.map((p) => ({ label: p.key, value: p.n }));
  const yearly = data.yearly;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>When police use force</h1>
        <p>
          Seattle police log every time an officer uses force on someone. The city has {fmtInt(data.total)} of these
          reports on record going back to 2014. In {data.latestFullYear}, the last full year, officers filed{' '}
          {fmtInt(data.latestYearCount)} of them. Most are the lowest level on the scale.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Reports on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Reports in {data.latestFullYear}</div>
          <div className="value">{fmtInt(data.latestYearCount)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Most common level</div>
          <div className="value" style={{ fontSize: 20 }}>{data.mostCommon}</div>
        </div>
      </div>

      <ChartCard
        title="Reports by force level"
        desc="The city sorts force into levels. Level 1 is the lightest. OIS means an officer-involved shooting."
        csv={{ filename: 'force-by-level.csv', data: toCsv(['level', 'count'], data.byType.map((t) => [t.key, t.n])) }}
        footnote="Source: Use of Force (ppi5-g2bj) on data.seattle.gov. Counts cover every report on record."
      >
        <RankedBars rows={typeRows} valueName="Reports" valueFormat="compact" height={240} />
      </ChartCard>

      <ChartCard
        title="Reports by precinct"
        desc="Where the force happened, by police precinct. Reports with no clear precinct are left out."
        footnote="Source: Use of Force (ppi5-g2bj)."
      >
        <RankedBars rows={precinctRows} valueName="Reports" valueFormat="compact" height={260} />
      </ChartCard>

      <ChartCard
        title="Reports per year"
        desc="How the count has moved since 2014. The current year is still partial."
        footnote="Source: Use of Force (ppi5-g2bj). The newest year is incomplete, so its bar runs low."
      >
        <TrendChart
          data={yearly}
          xKey="y"
          series={[{ key: 'n', name: 'Reports' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> A use-of-force report is a record that force was used.
        It is not a ruling on whether the force was justified. The levels differ a lot in how severe they are, so a
        Level 1 report and an officer-involved shooting both count as one here even though they are nothing alike.
      </div>

      <RelatedLinks slug="/force" />
    </>
  );
}
