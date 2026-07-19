import Link from 'next/link';
import { ChartCard } from '@/components/ChartCard';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { DataTable } from '@/components/DataTable';
import { TrendChart, RankedBars } from '@/components/charts';
import { TopBooksTimeSeries } from '@/components/TopBooksTimeSeries';
import { library, digitalSurge, topBooksMerged } from '@/lib/data';
import { fmt1, fmtInt, fmtYear, num, toCsv } from '@/lib/format';

const DATASET = 'tmmm-ytt6';

/** Build a data.seattle.gov resource URL that reproduces a chart's aggregate. */
function q(params: Record<string, string>): string {
  return `https://data.seattle.gov/resource/${DATASET}.json?${new URLSearchParams(params).toString()}`;
}

const s = library.stats;
const ransom = library.ransomware;
const race = library.raceStats;

export const metadata = {
  title: 'What Seattle reads',
  description: `The Seattle Public Library set an all-time record with ${fmtInt(s.recordCheckouts)} checkouts in ${fmtYear(s.recordYear)}, one year after a ransomware attack cut physical lending ${ransom.dropPct} percent.`,
};

export default function LibraryPage() {
  const fullYearSet = new Set(library.byYear.filter((r) => r.months === 12).map((r) => r.year));

  const annual = library.byYear.filter((r) => r.months === 12).map((r) => ({ year: String(r.year), checkouts: r.checkouts }));
  const annualCsv = toCsv(
    ['year', 'checkouts', 'months_reported'],
    library.byYear.map((r) => [r.year, r.checkouts, r.months]),
  );

  // Start the physical-vs-digital chart where digital is at least 2% of the total.
  const surgeAll = digitalSurge();
  const surgeStart = surgeAll.find((r) => r.digital / (r.digital + r.physical) >= 0.02)?.year ?? surgeAll[0].year;
  const surge = surgeAll.filter((r) => Number(r.year) >= Number(surgeStart) && fullYearSet.has(Number(r.year)));
  const surgeChart = surge.map((r) => ({ year: r.year, physical: num(r.physical), digital: num(r.digital) }));
  const surgeCsv = toCsv(
    ['year', 'physical_checkouts', 'digital_checkouts'],
    surgeAll.map((r) => [r.year, r.physical, r.digital]),
  );

  const ransomChart = ransom.series.map((p) => ({ ym: p.ym, physical: p.physical, digital: p.digital }));
  const ransomCsv = toCsv(['month', 'physical_checkouts', 'digital_checkouts'], ransom.series.map((p) => [p.ym, p.physical, p.digital]));
  const ransomYearDrop = ransom.prevYearCheckouts - ransom.yearCheckouts;

  const raceChart = library.formatRace.map((r) => ({
    year: r.months < 12 ? `${r.year}*` : String(r.year),
    ebook: r.ebook,
    audiobook: r.audiobook,
  }));
  const raceCsv = toCsv(
    ['year', 'ebook_checkouts', 'audiobook_checkouts', 'months_reported'],
    library.formatRace.map((r) => [r.year, r.ebook, r.audiobook, r.months]),
  );
  const raceEarly = race ? (library.formatRace.find((r) => r.year === race.year - 10) ?? library.formatRace[0]) : null;

  const matBars = library.materialTypes.map((m) => ({ label: m.label, value: num(m.checkouts) }));
  const matCsv = toCsv(['material_type', 'label', 'checkouts'], library.materialTypes.map((m) => [m.type, m.label, m.checkouts]));

  const books = topBooksMerged(12);
  const booksCsv = toCsv(['rank', 'title', `checkouts_${library.topBooksSince}_plus`], books.map((b, i) => [i + 1, b.title, b.checkouts]));

  const bookish = "(materialtype='BOOK' OR upper(materialtype)='EBOOK' OR upper(materialtype)='AUDIOBOOK')";

  return (
    <>
      <p className="crumb"><Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> <Link href="/category/books-pets-parks">Books, Pets, and Parks</Link></p>
      <div className="page-head">
        <p className="eyebrow">Culture</p>
        <h1>{fmtYear(s.recordYear)} was the library&apos;s biggest year on record</h1>
        <p>
          The Seattle Public Library checked out {fmtInt(s.recordCheckouts)} items in {fmtYear(s.recordYear)},
          more than any other year in a public log that starts in {fmtYear(s.firstYear)}. It did that one year
          after a ransomware attack knocked the catalog offline and briefly cut physical lending
          by {fmtInt(ransom.dropPct)} percent. The log behind this page lists every title checked out each
          month, physical and digital: {fmt1(s.totalCheckouts / 1e6)} million checkouts
          across {fmt1(s.totalRows / 1e6)} million monthly title records. Two limits up front: the data has no
          branch and no waitlist numbers, so we cannot map it by neighborhood or show holds.
        </p>
      </div>

      <DataFreshness date={library.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Checkouts in {fmtYear(s.recordYear)}</div>
          <div className="value">{fmtInt(s.recordCheckouts)}</div>
          <div className="sub">old record: {fmtInt(s.priorPeakCheckouts)} in {fmtYear(s.priorPeakYear)}</div>
        </div>
        {s.partialYear !== null ? (
          <div className="stat-card">
            <div className="label">{fmtYear(s.partialYear)} through {s.partialThroughMonth}</div>
            <div className="value">{fmtInt(s.partialCheckouts)}</div>
            <div className="sub">on pace for about {fmt1(num(s.partialPaceAnnual)! / 1e6)} million</div>
          </div>
        ) : null}
        <div className="stat-card">
          <div className="label">All checkouts since {fmtYear(s.firstYear)}</div>
          <div className="value">{fmt1(s.totalCheckouts / 1e6)}M</div>
          <div className="sub">across {fmt1(s.totalRows / 1e6)} million monthly title records</div>
        </div>
      </div>

      <ChartCard
        title="The record came right after the crater"
        desc={`Total checkouts per year, all formats, full years only. A plateau near ${fmt1(s.priorPeakCheckouts / 1e6)} million held for a decade, the pandemic cut it, the ${fmtYear(ransom.year)} ransomware attack cut it again, and then ${fmtYear(s.recordYear)} beat every year before it.`}
        csv={{ filename: 'seattle-library-checkouts-by-year.csv', data: annualCsv }}
        footnote={`Sum of checkouts per calendar year. ${fmtYear(s.firstYear)} and ${s.partialYear !== null ? fmtYear(s.partialYear) : 'the current year'} are partial years and are excluded from the chart (the CSV includes them, with a months column).`}
        source={{ id: DATASET, query: q({ $select: 'checkoutyear,sum(checkouts) as checkouts', $group: 'checkoutyear', $order: 'checkoutyear' }) }}
      >
        <TrendChart
          data={annual}
          xKey="year"
          series={[{ key: 'checkouts', name: 'Checkouts' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="The pandemic flipped Seattle from print to digital, for good"
        desc={`Physical vs digital checkouts per year. When branches closed in 2020, physical checkouts collapsed and digital overtook them in a single year, and it never went back. The dip in both lines in ${fmtYear(ransom.year)} is the ${ransom.outageMonth} ransomware outage, not a change in reading.`}
        csv={{ filename: 'seattle-library-physical-vs-digital.csv', data: surgeCsv }}
        footnote="Digital is e-books, downloadable audiobooks, and streaming; physical is everything checked out in a branch. Partial years are excluded."
        source={{ id: DATASET, query: q({ $select: 'checkoutyear,usageclass,sum(checkouts) as checkouts', $group: 'checkoutyear,usageclass', $order: 'checkoutyear' }) }}
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
        title="The month the catalog went down"
        desc={`Monthly checkouts around the ransomware attack that hit the library at the end of ${ransom.outageMonth} ${fmtYear(ransom.year)}. Physical checkouts fell from ${fmtInt(ransom.prePhysical)} in ${ransom.preMonth} to ${fmtInt(ransom.lowPhysical)} in ${ransom.lowMonth}, a ${fmtInt(ransom.dropPct)} percent drop, while digital lost less and bounced back faster. The system still ended ${fmtYear(ransom.year)} about ${fmt1(ransomYearDrop / 1e6)} million checkouts short of the year before.`}
        csv={{ filename: 'seattle-library-ransomware-months.csv', data: ransomCsv }}
        footnote={`Monthly checkouts by usage class, ${fmtYear(ransom.year - 1)} through ${fmtYear(ransom.year + 1)}.`}
        source={{ id: DATASET, query: q({ $select: 'checkoutyear,checkoutmonth,usageclass,sum(checkouts) as checkouts', $where: `checkoutyear>=${ransom.year - 1} AND checkoutyear<=${ransom.year + 1}`, $group: 'checkoutyear,checkoutmonth,usageclass', $order: 'checkoutyear,checkoutmonth' }) }}
      >
        <TrendChart
          data={ransomChart}
          xKey="ym"
          series={[
            { key: 'physical', name: 'Physical' },
            { key: 'digital', name: 'Digital' },
          ]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      {race && raceEarly ? (
        <ChartCard
          title="Inside digital, audiobooks are taking the lead"
          desc={`E-book vs audiobook checkouts per year. In ${fmtYear(raceEarly.year)}, Seattle checked out about ${fmt1(raceEarly.ebook / raceEarly.audiobook)} e-books for every audiobook. The gap has narrowed nearly every year since, and in ${fmtYear(race.year)}, through ${s.partialThroughMonth}, audiobooks lead for the first time: ${fmtInt(race.audiobook)} to ${fmtInt(race.ebook)}.`}
          csv={{ filename: 'seattle-library-ebook-vs-audiobook.csv', data: raceCsv }}
          footnote={
            <>
              * {fmtYear(race.year)} is a partial year, through {s.partialThroughMonth}. Downloadable e-books and audiobooks
              only; streaming video and music not included.
              {race.prevLeadYear !== null
                ? ` Audiobooks also led briefly in ${fmtYear(race.prevLeadYear)}, back when both formats were tiny.`
                : ''}
            </>
          }
          source={{ id: DATASET, query: q({ $select: 'checkoutyear,upper(materialtype) as format,sum(checkouts) as checkouts', $where: "upper(materialtype) in ('EBOOK','AUDIOBOOK')", $group: 'checkoutyear,format', $order: 'checkoutyear' }) }}
        >
          <TrendChart
            data={raceChart}
            xKey="year"
            series={[
              { key: 'ebook', name: 'E-book' },
              { key: 'audiobook', name: 'Audiobook' },
            ]}
            valueFormat="compact"
            height={300}
          />
        </ChartCard>
      ) : null}

      <ChartCard
        title="A media library, not just a book library"
        desc="Total checkouts since 2005 by material type. Books lead, but the library moves enormous volumes of DVDs, CDs, e-books, and audiobooks, and it also lends Wi-Fi hotspots and laptops (not shown here)."
        csv={{ filename: 'seattle-library-material-types.csv', data: matCsv }}
        footnote="Checkouts summed across all years; case variants merged."
        source={{ id: DATASET, query: q({ $select: 'materialtype,sum(checkouts) as checkouts', $group: 'materialtype', $order: 'checkouts DESC' }) }}
      >
        <RankedBars rows={matBars} valueName="Checkouts (all time)" valueFormat="compact" height={320} />
      </ChartCard>

      <ChartCard
        title="What Seattle actually reads"
        desc={`The most-checked-out books since ${fmtYear(library.topBooksSince)} (print, e-book, and audiobook merged). Quiet word-of-mouth phenomena, not just the bestseller list.`}
        csv={{ filename: 'seattle-top-books.csv', data: booksCsv }}
        footnote="Books, e-books, and audiobooks only; device and processing items excluded; format variants of a title merged."
        source={{ id: DATASET, query: q({ $select: 'title,sum(checkouts) as checkouts', $where: `checkoutyear>=${library.topBooksSince} AND ${bookish}`, $group: 'title', $order: 'checkouts DESC', $limit: '60' }) }}
      >
        <DataTable
          headers={['#', 'Title', `Checkouts (${fmtYear(library.topBooksSince)}+)`]}
          wrapCols={[1]}
          rows={books.map((b, i) => [i + 1, b.title, fmtInt(b.checkouts)])}
        />
      </ChartCard>

      <ChartCard
        title="The constant churn at the top, month by month"
        desc="The fifty most-checked-out books of the last four years, each as a line of monthly checkouts. The tangle is the point: hits arrive, spike, and fade, and the leaderboard never sits still. Click any title below (or its line) to follow just that book; hover to see the month's top titles."
        footnote="The 50 books with the most total checkouts since January 2022, print, e-book, and audiobook merged per title; monthly checkouts. Device and processing items excluded."
        source={{ id: DATASET, query: q({ $select: 'title,sum(checkouts) as checkouts', $where: `checkoutyear>=2022 AND ${bookish}`, $group: 'title', $order: 'checkouts DESC', $limit: '150' }) }}
      >
        <TopBooksTimeSeries books={library.topBooksMonthly} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>Why a book suddenly spikes</h2>
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
          footnote={`Monthly checkouts across all formats, ${fmtYear(library.seismographSince)} onward.`}
          source={{ id: DATASET, query: q({ $select: 'checkoutyear,checkoutmonth,sum(checkouts) as checkouts', $where: `title like '${t.label}%' AND checkoutyear>=${library.seismographSince}`, $group: 'checkoutyear,checkoutmonth', $order: 'checkoutyear,checkoutmonth' }) }}
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

      <RelatedLinks slug="/library" />
    </>
  );
}
