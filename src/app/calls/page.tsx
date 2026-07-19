import Link from 'next/link';
import data from '@/lib/generated/calls.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';

export const metadata = { title: 'Where 911 calls come from | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function CallsPage() {
  const top5 = data.topTypes.slice(0, 5).map((t) => t.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${titleCase(p.t)}</strong><br/>${p.d}`,
  }));
  const legend = [
    ...top5.map((t, i) => ({ label: titleCase(t), color: PALETTE[i] })),
    { label: 'Everything else', color: GRAY },
  ];

  const typeRows = data.topTypes.map((t) => ({ label: titleCase(t.key), value: t.n }));
  const monthly = data.monthly;
  const busiest = data.topTypes[0]?.key ? titleCase(data.topTypes[0].key) : '';

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>Where 911 calls come from</h1>
        <p>
          Seattle handled about {fmtInt(data.last12)} police 911 calls over the last year, and roughly{' '}
          {fmtInt(data.last30)} in just the last month. The most common reason people called was a{' '}
          {busiest.toLowerCase()}. The map and charts below show where the calls land and what they are about.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Calls in the last 12 months</div>
          <div className="value">{fmtInt(data.last12)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Calls in the last 30 days</div>
          <div className="value">{fmtInt(data.last30)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Busiest call type</div>
          <div className="value" style={{ fontSize: 18 }}>{busiest}</div>
        </div>
      </div>

      <ChartCard
        title="The 6,000 most recent calls, mapped"
        desc="Each dot is one 911 call. Color shows the five most common kinds. Click a dot to see what it was and when."
        footnote="Source: 911 Call Data (33kz-ixgy) on data.seattle.gov. The map shows recent calls that came with map coordinates inside the city."
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="What people call about most"
        desc="Top call types over the last 12 months."
        csv={{ filename: 'calls-by-type.csv', data: toCsv(['call_type', 'count'], data.topTypes.map((t) => [t.key, t.n])) }}
        footnote="Source: 911 Call Data (33kz-ixgy). Counts cover the last 12 months only."
      >
        <RankedBars rows={typeRows} valueName="Calls" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Calls per month"
        desc="How call volume has moved over the last three years."
        footnote="Source: 911 Call Data (33kz-ixgy). The newest month may be partial."
      >
        <TrendChart
          data={monthly}
          xKey="ym"
          series={[{ key: 'n', name: 'Calls' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">Type your ZIP or neighborhood to see how it stacks up, by count and per resident.</p>
      </div>
      <AreaCompare data={data.areaByZip} unit="911 calls" />

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> A 911 call is a request for help, not proof that a
        crime happened. Lots of calls turn out to be nothing, get logged twice, or have nothing to do with crime at
        all (a welfare check, a noise gripe, a false alarm). More dots in a spot can mean more people calling as much
        as more trouble.
      </div>

      <RelatedLinks slug="/calls" />
    </>
  );
}
