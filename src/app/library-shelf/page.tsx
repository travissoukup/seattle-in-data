import Link from 'next/link';
import data from '@/lib/generated/library-shelf.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'What the library owns | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];

export default function LibraryShelfPage() {
  const formatRows = data.byFormat.map((f) => ({ label: f.key, value: f.n }));
  const typeRows = data.topTypes.map((t) => ({ label: t.key, value: t.n }));

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/books-pets-parks">Books, Pets, and Parks</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Books, Pets, and Parks</p>
        <h1>What the library owns</h1>
        <p>
          The Seattle Public Library keeps a running list of everything on its shelves. The latest
          monthly count, from {data.snapshot}, holds {fmtInt(data.totalItems)} items spread across{' '}
          {fmtInt(data.branches)} branches. Those items cover {fmtInt(data.distinctTitles)} different
          titles, and most of them are still plain old books.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Items on the shelves</div>
          <div className="value">{fmtInt(data.totalItems)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Different titles</div>
          <div className="value">{fmtInt(data.distinctTitles)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Branches counted</div>
          <div className="value">{fmtInt(data.branches)}</div>
        </div>
      </div>

      <ChartCard
        title="Books still rule the shelves"
        desc="Every item in the latest count, sorted into plain formats. Books are most of it."
        csv={{ filename: 'library-by-format.csv', data: toCsv(['format', 'items'], data.byFormat.map((f) => [f.key, f.n])) }}
        footnote="Source: Library Collection Inventory (6vkj-f5xf) on data.seattle.gov. Formats are rolled up from the library's own item-type codes. Counts sum copies, not just listings."
      >
        <RankedBars rows={formatRows} valueName="Items" valueFormat="compact" height={300} />
      </ChartCard>

      <ChartCard
        title="The most common item types, by the library's own codes"
        desc="The catalog tags each item with a short code. acbk is an adult book, jcbk a kids book, arbk a reference book, and so on."
        footnote="Source: Library Collection Inventory (6vkj-f5xf). Codes are the library's internal labels, kept as-is."
      >
        <RankedBars rows={typeRows} valueName="Items" valueFormat="compact" height={360} />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> This is a single monthly snapshot of
        what was catalogued on {data.snapshot}, not a tally of what gets checked out or read. It counts
        digital and reference items right alongside books you can take home, and the numbers shift a
        little every month as the library buys, weeds, and moves things around.
      </div>

      <RelatedLinks slug="/library-shelf" />
    </>
  );
}
