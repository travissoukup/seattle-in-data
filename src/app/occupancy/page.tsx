import Link from 'next/link';
import data from '@/lib/generated/occupancy.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtPct, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = {
  title: 'Fewer new buildings are opening',
  description: `Seattle cleared about ${data.recentAvg} new buildings a year from ${data.recentStartY} through ${data.recentEndY}, down ${data.dropPct}% from the late 2010s pace.`,
};

const RAW_QUERY =
  'https://data.seattle.gov/resource/axkr-2p68.json?$select=certificate_of_occupancy_date,occupancy_type_s&$order=:id&$limit=10000';

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
        <h1>Fewer new buildings are opening</h1>
        <p>
          Before people can move into a new building, the city issues a certificate of occupancy saying it is safe to
          use. Count those certificates and you get the finish line of construction. Seattle cleared about{' '}
          {fmtInt(data.recentAvg)} buildings a year from {data.recentStartY} through {data.recentEndY}, down{' '}
          {data.dropPct}% from the {fmtInt(data.baseAvg)} a year it averaged from {data.baseStartY} to {data.baseEndY}.
          Certificates land years after permits, so this is the construction slowdown of the early 2020s showing up at
          the front door.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Certificates on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Yearly average, {data.recentStartY} to {data.recentEndY}</div>
          <div className="value">{fmtInt(data.recentAvg)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Busiest year ({data.busiest.y})</div>
          <div className="value">{fmtInt(data.busiest.n)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Issued in {data.partial.y} so far</div>
          <div className="value">{fmtInt(data.partial.n)}</div>
        </div>
      </div>

      <ChartCard
        title="Certificates issued per year"
        desc={`Each one means a building got cleared for people to use it. The pace peaked at ${fmtInt(
          data.busiest.n,
        )} in ${data.busiest.y} and has run near ${fmtInt(data.recentAvg)} a year since ${data.recentStartY}.`}
        csv={{ filename: 'occupancy-by-year.csv', data: toCsv(['year', 'certificates'], trend.map((t) => [t.y, t.n])) }}
        footnote={`The year comes from the certificate date, a text field parsed in code. ${data.partial.y} is in progress (${fmtInt(
          data.partial.n,
        )} so far) and is left off the chart. Years before ${data.coverageStart} are also trimmed: the record is thin there, with only ${fmtInt(
          data.earlyTrimmedN,
        )} certificates across all of them.`}
        source={{ id: 'axkr-2p68', query: RAW_QUERY }}
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
        title="The apartment share of what opens"
        desc={`Share of each year's certificates that list apartment or condo use (building code R-2). It climbed from ${fmtPct(
          data.aptFirst.share,
        )} in ${data.aptFirst.y} to a peak of ${fmtPct(data.aptPeak.share)} in ${data.aptPeak.y}, then eased to ${fmtPct(
          data.aptLatest.share,
        )} in ${data.aptLatest.y}. Watch this line to see the apartment boom arrive, crest, and cool.`}
        csv={{
          filename: 'occupancy-apartment-share.csv',
          data: toCsv(
            ['year', 'apartment_certificates', 'all_certificates', 'apartment_share_pct'],
            data.aptTrend.map((t) => [t.y, t.apt, t.total, t.share]),
          ),
        }}
        footnote={`A certificate counts as apartment or condo if its occupancy type field mentions R-2 Apartment. One certificate can list several uses, so the share reads as "at least partly residential multifamily." Partial and thin years are trimmed the same way as the chart above.`}
        source={{ id: 'axkr-2p68', query: RAW_QUERY }}
      >
        <TrendChart
          data={data.aptTrend}
          xKey="y"
          series={[{ key: 'share', name: 'Apartment share' }]}
          valueFormat="pct"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="What kind of space got cleared"
        desc="One certificate can list more than one use, so the counts add up to more than the number of buildings. Apartments and condos top the list."
        csv={{ filename: 'occupancy-by-type.csv', data: toCsv(['type', 'count'], data.topTypes.map((t) => [t.key, t.n])) }}
        footnote="The occupancy type field is comma-separated, so each listed use is counted on its own. All years are included here, including partial ones."
        source={{ id: 'axkr-2p68', query: RAW_QUERY }}
      >
        <RankedBars rows={typeRows} valueName="Certificates" valueFormat="int" height={380} />
      </ChartCard>

      <div className="caveat">
        <strong>A certificate is not a home.</strong> It covers many kinds of buildings, not only housing. Retail,
        parking garages, and offices show up here too. So this is a count of spaces cleared for use, not a clean count
        of new homes, and one certificate for a big apartment tower weighs the same as one for a corner shop. A handful
        of records have no readable date and drop out of the yearly charts, and the record before{' '}
        {data.coverageStart} is too thin to trust.
      </div>

      <RelatedLinks slug="/occupancy" />
    </>
  );
}
