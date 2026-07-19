import Link from 'next/link';
import data from '@/lib/generated/library-shelf.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtPct, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

const DATASET = '6vkj-f5xf';

/** Build a data.seattle.gov resource URL that reproduces a chart's aggregate. */
function q(params: Record<string, string>): string {
  return `https://data.seattle.gov/resource/${DATASET}.json?${new URLSearchParams(params).toString()}`;
}

export const metadata = {
  title: 'Where the library keeps its books',
  description: `One downtown building, the Central Library, holds ${Math.round(data.centralPct)} percent of everything on Seattle Public Library shelves, and the collection is down ${data.dropFromPeakPct} percent from its ${fmtYear(data.peakYear)} peak.`,
};

export default function LibraryShelfPage() {
  const locationRows = data.locations.map((l) => ({ label: l.name.replace(/ Branch$/, ''), value: l.n }));
  const formatRows = data.byFormat.map((f) => ({ label: f.key, value: f.n }));
  const typeRows = data.topTypes.map((t) => ({ label: t.key, value: t.n }));
  const trendRows = data.trend.map((r) => ({ m: r.m, central: r.central, rest: r.rest }));

  const whereSnap = `reportdate='${data.snapshot}'`;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/books-pets-parks">Books, Pets, and Parks</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Books, Pets, and Parks</p>
        <h1>One building holds {Math.round(data.centralPct)} percent of the library&apos;s books</h1>
        <p>
          The Seattle Public Library counts its shelves every month. The latest count, from{' '}
          {data.snapshot}, lists {fmtInt(data.totalItems)} items. Of those,{' '}
          {fmtInt(data.centralItems)} sit in a single building: the Central Library downtown. The{' '}
          {fmtInt(data.branchCount)} neighborhood branches hold {fmtInt(data.branchItems)} between
          them. And the whole collection is quietly getting smaller, down {data.dropFromPeakPct}{' '}
          percent from its {fmtYear(data.peakYear)} peak. Almost all of that loss came off branch
          shelves, not Central&apos;s.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Items on the shelves</div>
          <div className="value">{fmtInt(data.totalItems)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Held at Central</div>
          <div className="value">{fmtPct(data.centralPct)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Neighborhood branches</div>
          <div className="value">{fmtInt(data.branchCount)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Items that float between branches</div>
          <div className="value">{fmtInt(data.floating)}</div>
        </div>
      </div>

      <ChartCard
        title="Where the books actually live"
        desc={
          <>
            Central Library holds more than every branch put together. The biggest branch,{' '}
            {data.largestBranch.name}, has {fmtInt(data.largestBranch.n)} items. Central&apos;s edge
            is its research stacks: {fmtInt(data.centralRefBooks)} reference books,{' '}
            {fmtInt(data.centralPeriodicals)} periodicals, and {fmtInt(data.centralMicroform)}{' '}
            microform reels that never leave the building.
          </>
        }
        csv={{
          filename: 'library-items-by-location.csv',
          data: toCsv(['code', 'location', 'items'], data.locations.map((l) => [l.code, l.name, l.n])),
        }}
        footnote={
          <>
            Items in the latest snapshot, grouped by shelving location. Location codes are
            lowercased before counting (the raw data mixes cases), and named with the library&apos;s
            own ILS Data Dictionary (pbt3-ytbc). Non-public locations like mobile services, the
            tech-services department, and drop boxes hold {fmtInt(data.otherItems)} items and are
            left out of the chart.
          </>
        }
        source={{
          id: DATASET,
          query: q({
            $select: 'lower(itemlocation) as location, sum(itemcount) as items',
            $where: whereSnap,
            $group: 'lower(itemlocation)',
            $order: 'items DESC',
          }),
        }}
      >
        <RankedBars rows={locationRows} valueName="Items" valueFormat="compact" height={620} />
      </ChartCard>

      <ChartCard
        title="The shelf is shrinking, but only outside downtown"
        desc={
          <>
            Every monthly count since {fmtYear(data.firstYear)}. Branch and support shelves lost{' '}
            {data.restDropPct} percent of their items over that stretch. Central lost just{' '}
            {data.centralDropPct} percent. The collection peaked at {fmtInt(data.peakItems)} items
            in {fmtYear(data.peakYear)}.
          </>
        }
        csv={{
          filename: 'library-items-by-month.csv',
          data: toCsv(
            ['month', 'central_items', 'other_items', 'total_items'],
            data.trend.map((r) => [r.m, r.central, r.rest, r.total]),
          ),
        }}
        footnote={
          <>
            Sum of item counts per monthly snapshot, split between the Central Library and
            everywhere else, across {fmtInt(data.trendMonths)} snapshots. Each point is a full
            point-in-time inventory, so there are no partial months, but a handful of snapshots are
            missing upstream (mid 2023, mid 2024) and the line simply skips them. Counts include
            reference and other non-circulating items.
          </>
        }
        source={{
          id: DATASET,
          query: q({
            $select: "reportdate, (lower(itemlocation)='cen') as is_central, sum(itemcount) as items",
            $group: 'reportdate, is_central',
            $order: 'reportdate',
            $limit: '1000',
          }),
        }}
      >
        <TrendChart
          data={trendRows}
          xKey="m"
          series={[
            { key: 'central', name: 'Central Library' },
            { key: 'rest', name: 'Everywhere else' },
          ]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="Books still rule the shelves"
        desc="Every item in the latest count, sorted into plain formats. Books are most of it."
        csv={{ filename: 'library-by-format.csv', data: toCsv(['format', 'items'], data.byFormat.map((f) => [f.key, f.n])) }}
        footnote="Formats are rolled up from the library's own item-type codes. Counts sum copies, not just listings."
        source={{
          id: DATASET,
          query: q({
            $select: 'itemtype, sum(itemcount) as items',
            $where: whereSnap,
            $group: 'itemtype',
            $order: 'items DESC',
          }),
        }}
      >
        <RankedBars rows={formatRows} valueName="Items" valueFormat="compact" height={300} />
      </ChartCard>

      <ChartCard
        title="The most common item types, by the library's own codes"
        desc="The catalog tags each item with a short code. acbk is an adult book, jcbk a kids book, arbk a reference book, and so on."
        csv={{ filename: 'library-by-item-type.csv', data: toCsv(['item_type', 'items'], data.topTypes.map((t) => [t.key, t.n])) }}
        footnote="Codes are the library's internal labels, kept as-is. The ILS Data Dictionary (pbt3-ytbc) decodes the rest."
        source={{
          id: DATASET,
          query: q({
            $select: 'itemtype, sum(itemcount) as items',
            $where: whereSnap,
            $group: 'itemtype',
            $order: 'items DESC',
          }),
        }}
      >
        <RankedBars rows={typeRows} valueName="Items" valueFormat="compact" height={360} />
      </ChartCard>

      <div className="caveat">
        <strong>Shelf counts, not reading habits.</strong> These are monthly inventories of what was
        catalogued, not tallies of what gets checked out or read. Digital and reference items sit
        right alongside books you can take home. The {fmtInt(data.distinctTitles)} distinct titles
        in the latest count compare raw title text, so a work with two punctuation variants counts
        twice and different books that share a name count once. Numbers also shift a little every
        month as the library buys, weeds, and moves things around.
      </div>

      <RelatedLinks slug="/library-shelf" />
    </>
  );
}
