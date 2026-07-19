import Link from 'next/link';
import data from '@/lib/generated/violations.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtPct, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';

export const metadata = { title: 'Code complaints and violations | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function ViolationsPage() {
  const top5 = data.byDesc.slice(0, 5).map((t) => t.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.t}</strong><br/>Opened ${p.d}`,
  }));
  const legend = [...top5.map((t, i) => ({ label: t, color: PALETTE[i] })), { label: 'Everything else', color: GRAY }];

  const descRows = data.byDesc.map((d) => ({ label: d.key, value: d.n }));
  const yearly = data.yearly;
  const openPct = data.openShare * 100;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permits and Construction</p>
        <h1>Code complaints and violations</h1>
        <p>
          When a building looks unsafe, the weeds take over a lot, or a landlord ignores a problem, people call the
          city. SDCI has logged {fmtInt(data.total)} of these code enforcement cases, and about{' '}
          {fmtInt(data.openedLastYear)} came in over the last year. Most get resolved. Around {fmtPct(openPct)} are
          still open lately.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Cases on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Opened in the last year</div>
          <div className="value">{fmtInt(data.openedLastYear)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Share still open</div>
          <div className="value">{fmtPct(openPct)}</div>
        </div>
      </div>

      <ChartCard
        title="The 6,000 most recent cases, mapped"
        desc="Each dot is one case. Color shows the five most common kinds. Click a dot to see what it was and when it opened."
        footnote="Source: Code Enforcement (ez4a-iug7) on data.seattle.gov. The map shows recent cases that came with map coordinates."
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="What gets reported"
        desc="Land use, weeds, and construction lead the list. Counts cover every case on record."
        csv={{ filename: 'violations-by-type.csv', data: toCsv(['type', 'count'], data.byDesc.map((d) => [d.key, d.n])) }}
        footnote="Source: Code Enforcement (ez4a-iug7)."
      >
        <RankedBars rows={descRows} valueName="Cases" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Cases opened per year"
        desc="How many new cases the city took in each year. The count has crept up since 2020."
        footnote="Source: Code Enforcement (ez4a-iug7). 2026 is left off because the year is not done."
      >
        <TrendChart
          data={yearly}
          xKey="y"
          series={[{ key: 'n', name: 'Cases' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">Type your ZIP or neighborhood to see how it stacks up, by count and per resident.</p>
      </div>
      <AreaCompare data={data.areaByZip} unit="code cases" />

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> Every dot is a complaint someone made to the city. A
        complaint is a report, not a confirmed violation. The city still has to inspect and decide, and many cases close
        with no action. Blocks with more reporters can look worse than blocks with more problems.
      </div>

      <RelatedLinks slug="/violations" />
    </>
  );
}
