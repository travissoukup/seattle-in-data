import Link from 'next/link';
import data from '@/lib/generated/trades.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'Trade and electrical work | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function TradesPage() {
  const colorFor = (t: string) => (t === 'Trade' ? PALETTE[0] : t === 'Electrical' ? PALETTE[1] : GRAY);
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.sub}</strong><br/>Issued ${p.d}`,
  }));
  const legend = [
    { label: 'Trade permit', color: PALETTE[0] },
    { label: 'Electrical permit', color: PALETTE[1] },
  ];

  const typeRows = data.tradeTypes.map((t) => ({ label: t.key, value: t.n }));

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permits and Construction</p>
        <h1>Trade and electrical work</h1>
        <p>
          Most building work needs a permit before anyone turns a wrench. The city has pulled {fmtInt(data.totalTrade)}{' '}
          trade permits (furnaces, fire sprinklers, elevators, signs) and {fmtInt(data.totalElec)} electrical permits
          over the years. In {data.lastYear} alone, contractors and owners pulled {fmtInt(data.issuedLastYear)} of these
          two kinds combined.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Trade permits on record</div>
          <div className="value">{fmtInt(data.totalTrade)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Electrical permits on record</div>
          <div className="value">{fmtInt(data.totalElec)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Issued in {data.lastYear}</div>
          <div className="value">{fmtInt(data.issuedLastYear)}</div>
        </div>
      </div>

      <ChartCard
        title="Recent permits, mapped"
        desc="Each dot is one recently issued permit. Blue is trade work, orange is electrical. Click a dot to see what it was and when."
        footnote="Source: Trade Permits (c87v-5hwh) and Electrical Permits (c4tj-daue) on data.seattle.gov. The map samples the most recent issued permits that came with map coordinates."
      >
        <PointMap points={points} legend={legend} height={520} radius={3} />
      </ChartCard>

      <ChartCard
        title="Permits issued each year"
        desc="Trade and electrical permits the city issued, counted by year."
        csv={{
          filename: 'permits-by-year.csv',
          data: toCsv(['year', 'trade', 'electrical'], data.yearly.map((r) => [r.y, r.trade, r.elec])),
        }}
        footnote="Source: Trade Permits (c87v-5hwh) and Electrical Permits (c4tj-daue). The current year is left off because it is not done yet."
      >
        <TrendChart
          data={data.yearly}
          xKey="y"
          series={[
            { key: 'trade', name: 'Trade' },
            { key: 'elec', name: 'Electrical' },
          ]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="What trade permits cover"
        desc="The kinds of trade work people pull permits for. Furnaces and refrigeration lead by a lot."
        csv={{ filename: 'trade-permit-types.csv', data: toCsv(['type', 'count'], data.tradeTypes.map((t) => [t.key, t.n])) }}
        footnote="Source: Trade Permits (c87v-5hwh). Counts cover every trade permit on record. Electrical permits do not carry this breakdown."
      >
        <RankedBars rows={typeRows} valueName="Permits" valueFormat="compact" height={340} />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> These are permits pulled, not jobs finished. A permit
        means someone asked the city for the OK to do the work. It does not tell you the work got done, passed
        inspection, or happened on time. Some small jobs never need a permit at all, so they never show up here.
      </div>

      <RelatedLinks slug="/trades" />
    </>
  );
}
