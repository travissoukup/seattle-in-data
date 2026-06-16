import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { TrendChart, RankedBars } from '@/components/charts';
import { TopBooksTimeSeries } from '@/components/TopBooksTimeSeries';
import { library, digitalSurge, topBooksMerged } from '@/lib/data';
import { fmtInt, num, toCsv } from '@/lib/format';

export const metadata = { title: 'What Seattle Reads · Exploring Seattle with Data' };

export default function LibraryPage() {
  const surge = digitalSurge().filter((r) => Number(r.year) >= 2010 && Number(r.year) < 2026);
  const surgeChart = surge.map((r) => ({ year: r.year, physical: num(r.physical), digital: num(r.digital) }));
  const surgeCsv = toCsv(
    ['year', 'physical_checkouts', 'digital_checkouts'],
    digitalSurge().map((r) => [r.year, r.physical, r.digital]),
  );

  const matBars = library.materialTypes.map((m) => ({ label: m.label, value: num(m.checkouts) }));
  const matCsv = toCsv(['material_type', 'label', 'checkouts'], library.materialTypes.map((m) => [m.type, m.label, m.checkouts]));

  const books = topBooksMerged(12);
  const booksCsv = toCsv(['rank', 'title', 'checkouts_2023_plus'], books.map((b, i) => [i + 1, b.title, b.checkouts]));

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Culture</p>
        <h1>What Seattle reads</h1>
        <p>
          Every month the Seattle Public Library publishes what got checked out, title by title, physical and
          digital, going back to 2005: more than fifty million checkouts in all. A circulation report to most
          people; a cultural seismograph if you look closely. Here is what it shows, with one honest caveat up
          front: the public data has no branch and no hold-queue figures, so the neighborhood-divergence and
          waitlist angles are not possible. What remains is still plenty.
        </p>
      </div>

      <ChartCard
        title="The pandemic flipped Seattle from print to digital, for good"
        desc="Physical vs digital checkouts per year. When branches closed in 2020, physical checkouts collapsed and digital overtook them in a single year, and it never went back."
        csv={{ filename: 'seattle-library-physical-vs-digital.csv', data: surgeCsv }}
        footnote="Digital is e-books, downloadable audiobooks, and streaming; physical is everything checked out in a branch. The current partial year is excluded. Source: Seattle Public Library, Checkouts by Title (tmmm-ytt6)."
      >
        <TrendChart
          data={surgeChart}
          xKey="year"
          series={[
            { key: 'physical', name: 'Physical' },
            { key: 'digital', name: 'Digital' },
          ]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="A media library, not just a book library"
        desc="Total checkouts since 2005 by material type. Books lead, but the library moves enormous volumes of DVDs, CDs, e-books, and audiobooks, and it also lends Wi-Fi hotspots and laptops (not shown here)."
        csv={{ filename: 'seattle-library-material-types.csv', data: matCsv }}
        footnote="Checkouts summed across all years; case variants merged. Source: Seattle Public Library, Checkouts by Title (tmmm-ytt6)."
      >
        <RankedBars rows={matBars} valueName="Checkouts (all time)" valueFormat="compact" height={320} />
      </ChartCard>

      <ChartCard
        title="What Seattle actually reads"
        desc="The most-checked-out books since 2023 (print, e-book, and audiobook merged). Quiet word-of-mouth phenomena, not just the bestseller list."
        csv={{ filename: 'seattle-top-books.csv', data: booksCsv }}
        footnote="Books, e-books, and audiobooks only; device and processing items excluded; format variants of a title merged. Source: Seattle Public Library, Checkouts by Title (tmmm-ytt6)."
      >
        <DataTable
          headers={['#', 'Title', 'Checkouts (2023+)']}
          wrapCols={[1]}
          rows={books.map((b, i) => [i + 1, b.title, fmtInt(b.checkouts)])}
        />
      </ChartCard>

      <ChartCard
        title="The constant churn at the top, month by month"
        desc="The fifty most-checked-out books of the last four years, each as a line of monthly checkouts. The tangle is the point: hits arrive, spike, and fade, and the leaderboard never sits still. Click any title below (or its line) to follow just that book; hover to see the month's top titles."
        footnote="The 50 books with the most total checkouts since January 2022, print, e-book, and audiobook merged per title; monthly checkouts. Device and processing items excluded. Source: Seattle Public Library, Checkouts by Title (tmmm-ytt6)."
      >
        <TopBooksTimeSeries books={library.topBooksMonthly} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>The cultural seismograph</h2>
        <p className="desc">
          Each title has a shape, and the shape is the story: a news event, a streaming adaptation, a
          book-club pick, a backlash. Monthly checkouts for four titles that each rose for a different reason.
        </p>
      </div>

      {library.seismograph.map((t) => (
        <ChartCard
          key={t.label}
          title={t.label}
          desc={t.note}
          footnote="Monthly checkouts across all formats, 2019 onward. Source: Seattle Public Library, Checkouts by Title (tmmm-ytt6)."
        >
          <TrendChart
            data={t.series.map((p) => ({ ym: p.ym, checkouts: num(p.checkouts) }))}
            xKey="ym"
            series={[{ key: 'checkouts', name: 'Monthly checkouts' }]}
            valueFormat="int"
            height={240}
          />
        </ChartCard>
      ))}
    </>
  );
}
