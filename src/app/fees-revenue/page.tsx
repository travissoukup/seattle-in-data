import Link from 'next/link';
import data from '@/lib/generated/fees-revenue.json';
import { ChartCard } from '@/components/ChartCard';
import { BarsChart, PALETTE } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { fmtInt, fmtMoney, fmtMoneyCompact, fmtPct, toCsv } from '@/lib/format';
import { PaceTrend } from './PaceTrend';

export const metadata = {
  title: 'More permits, smaller checks',
  description: `Seattle permit fee billing fell from ${fmtMoneyCompact(data.billed2020)} in 2020 to ${fmtMoneyCompact(data.billed2024)} in 2024 while permits invoiced rose. The average check shrank ${fmtPct(data.perPermitDropPct)}, and a handful of phased high-rise permits explain the swing.`,
};

const GRAY = '#9aa3ad';

const METHOD = `Data comes from a public records request to the City of Seattle (SDCI invoice extract, January 2020 to June 23, 2026). Analysis code is in scripts/fees/ in this site's public repo.`;

export default function FeesRevenuePage() {
  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permit Fees</p>
        <h1>More permits, smaller checks: SDCI bills {fmtPct(data.perPermitDropPct)} less per permit than in 2020</h1>
        <p>
          Since January 2020, Seattle&apos;s permitting arm has billed {fmtMoneyCompact(data.totalBilled)} in fees
          across {fmtInt(data.totalPermits)} permits and collected {fmtMoneyCompact(data.totalPaid)} of it. The
          yearly total peaked at {fmtMoneyCompact(data.billed2020)} in 2020, bottomed out at{' '}
          {fmtMoneyCompact(data.billed2024)} in 2024, and is now recovering. But the recovery hides a shift: the
          city is invoicing more permits than it did in 2020 ({fmtInt(data.permits2020)} then,{' '}
          {fmtInt(data.permits2026Pace)} at the current pace) while the average bill per permit fell from{' '}
          {fmtMoney(data.perPermit2020)} to {fmtMoney(data.perPermit2026)}. Small jobs kept coming. The giant
          checks from downtown towers mostly stopped.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Billed since 2020</div>
          <div className="value">{fmtMoneyCompact(data.totalBilled)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Billed per permit, 2026</div>
          <div className="value">{fmtMoney(data.perPermit2026)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Billed per permit, 2020</div>
          <div className="value">{fmtMoney(data.perPermit2020)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Unpaid balance</div>
          <div className="value">{fmtMoneyCompact(data.totalDue)}</div>
        </div>
      </div>

      <ChartCard
        title="What SDCI billed each year"
        desc={`Total fees invoiced by year. ${fmtMoneyCompact(data.billed2020)} in 2020, a trough of ${fmtMoneyCompact(data.billed2024)} in 2024, then a climb. The dashed segment is 2026 annualized: ${fmtMoneyCompact(data.billed2026Actual)} billed through June 23 works out to a ${fmtMoneyCompact(data.billed2026Pace)} pace.`}
        csv={{
          filename: 'fees-billed-by-year.csv',
          data: toCsv(
            ['year', 'billed', 'annualized_pace'],
            data.billedTrend.map((r) => [r.y, r.billed, r.pace]),
          ),
        }}
        footnote={`${METHOD} Billed = amount paid plus the unpaid balance on each invoice line. 2026 covers January 1 to June 23 and is shown annualized (multiplied by ${data.annualizeFactor}) as a dashed estimate, never mixed into the solid line.`}
      >
        <PaceTrend
          data={data.billedTrend}
          xKey="y"
          series={[
            { key: 'billed', name: 'Billed', color: PALETTE[0] },
            { key: 'pace', name: '2026 pace (annualized)', color: PALETTE[0], dashed: true },
          ]}
          valueFormat="money"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="More permits, smaller checks"
        desc={`Both lines indexed to 2020 = 100. Permits invoiced per year climbed from ${fmtInt(data.permits2020)} to a ${fmtInt(data.permits2026Pace)} pace, up ${fmtPct(data.permitsUpPct)}. The fee billed per permit went the other way, from ${fmtMoney(data.perPermit2020)} to ${fmtMoney(data.perPermit2026)}, down ${fmtPct(data.perPermitDropPct)}.`}
        csv={{
          filename: 'permits-vs-per-permit-indexed.csv',
          data: toCsv(
            ['year', 'permits_index', 'per_permit_index', 'permits_pace_index', 'per_permit_pace_index'],
            data.core.map((r) => [r.y, r.permitsIdx, r.perPermitIdx, r.permitsPace, r.perPermitPace]),
          ),
        }}
        footnote={`${METHOD} Permits are counted as distinct permit numbers invoiced in each year, so the 5% Technology Fee line added to most invoices from 2023 does not inflate the count. Dashed 2026 segments are estimates: the permit count is annualized, and billed per permit is the partial-year ratio, which needs no annualizing.`}
      >
        <PaceTrend
          data={data.core}
          xKey="y"
          series={[
            { key: 'permitsIdx', name: 'Permits invoiced', color: PALETTE[0] },
            { key: 'permitsPace', name: '2026 pace', color: PALETTE[0], dashed: true, noLegend: true },
            { key: 'perPermitIdx', name: 'Billed per permit', color: PALETTE[1] },
            { key: 'perPermitPace', name: '2026 (dashed = estimate)', color: PALETTE[1], dashed: true },
          ]}
          valueFormat="index"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="The vanishing whales"
        desc={`Single invoices of ${fmtMoneyCompact(100000)} or more, by year. There were ${fmtInt(data.whales2020)} in 2020 and ${fmtInt(data.whales2025)} in all of 2025. 2026 has produced ${fmtInt(data.whales2026Actual)} so far. Together these ${fmtMoneyCompact(data.whaleTotal)} in whale invoices are ${fmtPct(data.whaleSharePct)} of every dollar billed since 2020.`}
        csv={{
          filename: 'invoices-over-100k-by-year.csv',
          data: toCsv(['year', 'invoices_100k_plus'], data.whales.map((r) => [r.y, r.n])),
        }}
        footnote={`${METHOD} Counts invoice lines where the billed amount (paid plus balance) is at least ${fmtMoney(100000)}. Technology Fee lines are excluded so post-2023 counts stay comparable. 2026* is partial, through June 23, and is not annualized here.`}
      >
        <BarsChart
          data={data.whales}
          xKey="y"
          series={[{ key: 'n', name: 'Invoices of $100K or more' }]}
          valueFormat="int"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="The 20 biggest fee payers"
        desc={`${data.top20AllPh ? 'Every one of the top 20' : 'Most of the top 20'} permits by total fees billed is a phased (PH) permit, the structure used for towers that get reviewed and built in stages. Just ${fmtInt(data.phPermits)} phased permits carry ${fmtMoneyCompact(data.phBilled)} in fees, ${fmtPct(data.phSharePct)} of all dollars billed. The biggest, the two-tower project at ${data.top1Address}, was billed ${fmtMoneyCompact(data.top1Billed)} on its own.`}
        csv={{
          filename: 'top-20-permits-by-fees.csv',
          data: toCsv(
            ['permit', 'address', 'project', 'total_billed'],
            data.top20.map((r) => [r.id, r.address, r.project, r.billed]),
          ),
        }}
        footnote={`${METHOD} Fees are summed per permit number across all its invoice lines, 2020 to June 23, 2026. Addresses and project descriptions come from joining the permit number to the city's building permits dataset (76t5-zqzr).`}
      >
        <DataTable
          headers={['Permit', 'Address', 'Project', 'Fees billed']}
          rows={data.top20.map((r) => [r.id, r.address, r.project, fmtMoney(r.billed)])}
          wrapCols={[2]}
        />
      </ChartCard>

      <ChartCard
        title={`The ${fmtMoneyCompact(data.totalDue)} nobody paid`}
        desc={`Share of each year's billed dollars still unpaid at extract time. In mature years the leakage runs ${fmtPct(data.leakMatureMin)} to ${fmtPct(data.leakMatureMax)}. Recent years look worse mostly because their invoices are still fresh. Even so, ${fmtPct(data.oldSharePct)} of the unpaid balance is on invoices more than a year old.`}
        csv={{
          filename: 'unpaid-share-by-year.csv',
          data: toCsv(['year', 'unpaid_pct_of_billed'], data.leak.map((r) => [r.y, r.pct])),
        }}
        footnote={`${METHOD} The unpaid balance is a snapshot as of the extract date, so recent years (2025, and especially the partial 2026*) include invoices that will still be paid. The extract records no refunds, so unpaid shares are a floor on eventual collection, not a final write-off rate.`}
      >
        <BarsChart
          data={data.leak}
          xKey="y"
          series={[{ key: 'pct', name: 'Unpaid share of billed' }]}
          valueFormat="pct"
          height={300}
        />
      </ChartCard>

      <div className="caveat">
        <strong>Where the leakage concentrates.</strong> Demolition (DM) fees are the standout: {fmtPct(data.dmMatureUnpaidPct)}{' '}
        of demo dollars billed in the mature years 2020 to 2024 remain unpaid, against {fmtPct(data.leakMatureMin)} to{' '}
        {fmtPct(data.leakMatureMax)} for fees overall. And demo invoices go unpaid all or nothing:{' '}
        {fmtPct(data.dmFullyUnpaidPct)} of them are fully unpaid while only {data.dmPartialPct}% are partially paid.
        The single worst-collected fee is the inspection no-show charge: {fmtPct(data.nsUnpaidPct)} of the{' '}
        {fmtMoneyCompact(data.nsBilled)} billed across {fmtInt(data.nsLines)} no-show invoices was never paid.
      </div>

      <div className="caveat">
        <strong>Construction itself is fine. The mix changed.</strong> Ordinary construction (CN) permits billed{' '}
        {fmtMoneyCompact(data.cn2025)} in 2025, {data.cn2025IsRecord ? 'their best year in this extract' : 'near their best year in this extract'},
        and 2026 is pacing to {fmtMoneyCompact(data.cn2026Pace)}. The revenue decline lives almost entirely in the big-project
        tier: phased tower permits and other six-figure invoices that arrived steadily in 2020 and mostly stopped. Whether that
        gap closes depends on a handful of projects a year, not on thousands of kitchen remodels.
      </div>

      <RelatedLinks slug="/fees-revenue" />
    </>
  );
}
