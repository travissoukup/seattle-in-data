import Link from 'next/link';
import data from '@/lib/generated/occupancy.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'When new buildings open | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function OccupancyPage() {
  const typeRows = data.topTypes.map((t) => ({ label: t.key, value: t.n }));
  const trend = data.trend;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/housing">Housing</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Housing</p>
        <h1>When new buildings open</h1>
        <p>
          Before people can move into a new building, the city issues a certificate of occupancy saying it is safe to
          use. This covers all kinds of buildings, not just homes. Shops, offices, and parking garages are in here
          too. Seattle has {fmtInt(data.total)} of these on record. It is a partial list and the early years are thin,
          so read it as a rough shape, not a full count.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Certificates on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Issued in {data.latest.y}</div>
          <div className="value">{fmtInt(data.latest.n)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Busiest year ({data.busiest.y})</div>
          <div className="value">{fmtInt(data.busiest.n)}</div>
        </div>
      </div>

      <ChartCard
        title="Certificates issued per year"
        desc="Each one means a building got cleared for people to use it. The most recent year is still in progress."
        csv={{ filename: 'occupancy-by-year.csv', data: toCsv(['year', 'certificates'], trend.map((t) => [t.y, t.n])) }}
        footnote="Source: Certificates of Occupancy (axkr-2p68) on data.seattle.gov. The year comes from the certificate date, parsed in code. The newest year is partial."
      >
        <TrendChart
          data={trend}
          xKey="y"
          series={[{ key: 'n', name: 'Certificates' }]}
          valueFormat="int"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="What kind of space got cleared"
        desc="One certificate can list more than one use, so the counts add up to more than the number of buildings. Apartments and condos top the list."
        csv={{ filename: 'occupancy-by-type.csv', data: toCsv(['type', 'count'], data.topTypes.map((t) => [t.key, t.n])) }}
        footnote="Source: Certificates of Occupancy (axkr-2p68). The occupancy type field is comma-separated, so each listed use is counted on its own."
      >
        <RankedBars rows={typeRows} valueName="Certificates" valueFormat="int" height={380} />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> A certificate of occupancy covers many kinds of
        buildings, not only homes. Retail, parking garages, and offices show up here too. So this is a count of spaces
        cleared for use, not a clean count of new housing. A handful of records have no readable date and drop out of
        the yearly chart.
      </div>

      <RelatedLinks slug="/occupancy" />
    </>
  );
}
