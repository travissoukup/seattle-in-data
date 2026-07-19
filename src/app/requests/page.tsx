import Link from 'next/link';
import data from '@/lib/generated/requests.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';

export const metadata = { title: 'What people report to the city | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function RequestsPage() {
  const top5 = data.topTypes.slice(0, 5).map((t) => t.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.t}</strong><br/>${p.d}`,
  }));
  const legend = [...top5.map((t, i) => ({ label: t, color: PALETTE[i] })), { label: 'Everything else', color: GRAY }];

  const typeRows = data.topTypes.map((t) => ({ label: t.key, value: t.n }));
  const deptRows = data.byDept.map((d) => ({ label: d.key, value: d.n }));
  const monthly = data.monthly;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/getting-around">Getting Around</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Getting Around</p>
        <h1>What people report to the city</h1>
        <p>
          Potholes, graffiti, dumped trash, abandoned cars, dead streetlights. People report all of it through the
          Find It Fix It app and the city call center. The city has logged {fmtInt(data.total)} of these requests, and
          about {fmtInt(data.last30)} came in over the last month alone.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Requests on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">In the last 30 days</div>
          <div className="value">{fmtInt(data.last30)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Most common report</div>
          <div className="value" style={{ fontSize: 20 }}>{data.topTypes[0]?.key}</div>
        </div>
      </div>

      <ChartCard
        title="The 6,000 most recent reports, mapped"
        desc="Each dot is one report. Color shows the five most common kinds. Click a dot to see what it was and when."
        footnote="Source: Customer Service Requests (5ngg-rpne) on data.seattle.gov. The map shows recent reports that came with map coordinates."
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="What people report most"
        desc="Counts cover every request on record."
        csv={{ filename: 'requests-by-type.csv', data: toCsv(['type', 'count'], data.topTypes.map((t) => [t.key, t.n])) }}
        footnote="Source: Customer Service Requests (5ngg-rpne)."
      >
        <RankedBars rows={typeRows} valueName="Requests" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Which department handles them"
        desc="Police, utilities, and transportation field the most."
      >
        <RankedBars rows={deptRows} valueName="Requests" valueFormat="compact" height={300} />
      </ChartCard>

      <ChartCard
        title="Reports per month"
        desc="How the volume of reports has moved since 2021."
        footnote="Source: Customer Service Requests (5ngg-rpne). The newest weeks may be partial."
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
      <AreaCompare data={data.areaByZip} unit="311 requests" />

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> Every dot is a report someone made. It is not proof
        the city agreed, fixed the problem, or that the problem was even real. Busy, well-connected neighborhoods tend
        to report more, so more dots can mean more reporters as much as more problems.
      </div>

      <RelatedLinks slug="/requests" />
    </>
  );
}
