import Link from 'next/link';
import data from '@/lib/generated/fire.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';

export const metadata = { title: 'Fire and medic calls | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function FirePage() {
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
  const monthly = data.monthly;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>Fire and medic calls</h1>
        <p>
          When you call 911 for a fire or a medical emergency, the Seattle Fire Department logs it. Over the last year
          they answered {fmtInt(data.last12)} calls, and about {fmtInt(data.last30)} came in over the last month. Most
          of them are not fires. The single most common call is {data.topTypes[0]?.key.toLowerCase()}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Calls in the last 12 months</div>
          <div className="value">{fmtInt(data.last12)}</div>
        </div>
        <div className="stat-card">
          <div className="label">In the last 30 days</div>
          <div className="value">{fmtInt(data.last30)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Most common call</div>
          <div className="value" style={{ fontSize: 20 }}>{data.topTypes[0]?.key}</div>
        </div>
      </div>

      <ChartCard
        title="The 6,000 most recent calls, mapped"
        desc="Each dot is one 911 call. Color shows the five most common kinds. Click a dot to see what it was and when."
        footnote="Source: Real-Time Fire 911 Calls (kzjm-xkqj) on data.seattle.gov. The map shows recent calls that came with map coordinates."
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="What they get called for"
        desc="The most common call types over the last 12 months."
        csv={{ filename: 'fire-calls-by-type.csv', data: toCsv(['type', 'count'], data.topTypes.map((t) => [t.key, t.n])) }}
        footnote="Source: Real-Time Fire 911 Calls (kzjm-xkqj). Covers the last 12 months."
      >
        <RankedBars rows={typeRows} valueName="Calls" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Calls per month"
        desc="How call volume has moved over the last few years."
        footnote="Source: Real-Time Fire 911 Calls (kzjm-xkqj). The newest weeks may be partial."
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
      <AreaCompare data={data.areaByZip} unit="fire and medic calls" />

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> Most of these calls are medical aid, not fires. A call
        is a request for help, not proof of what was found when crews arrived. One emergency can also trigger more than
        one call, so the counts run higher than the number of actual events.
      </div>

      <RelatedLinks slug="/fire" />
    </>
  );
}
