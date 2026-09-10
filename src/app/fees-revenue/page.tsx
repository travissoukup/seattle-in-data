import Link from 'next/link';
import data from '@/lib/generated/fees-revenue.json';
import { ChartCard } from '@/components/ChartCard';
import { BarsChart, PALETTE } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { fmtInt, fmtMoney, fmtMoneyCompact, fmtPct, toCsv } from '@/lib/format';
import { PaceTrend } from './PaceTrend';
import { QuarterlyChart } from './QuarterlyChart';

export const metadata = {
  title: 'More permits, smaller checks',
  description: `Seattle permit fee billing fell from ${fmtMoneyCompact(data.billed2020)} in 2020 to ${fmtMoneyCompact(data.billed2024)} in 2024 while permits invoiced rose. The average check shrank ${fmtPct(data.perPermitDropPct)}, and a handful of phased high-rise permits explain the swing.`,
};

const GRAY = '#9aa3ad';

const METHOD = `Data comes from the Permit Fees open dataset (k8z7-3feg on data.seattle.gov), refreshed weekly and covering January 2020 through ${data.dataThroughLabel} here. SDCI published the dataset in September 2026 after this site requested the data, which was first analyzed via a June 2026 public records request. Analysis code is in scripts/fees/ in this site's public repo.`;

const CLEANING = `The dataset keeps voided, reissued, and repeatedly rebilled invoice lines, so three computed rules drop them before any number on this page: never-paid lines larger than the largest single line ever actually paid (${fmtMoney(data.maxPaidLine)}), never-paid lines with an exact paid twin on the same permit, and repeat billings of the same never-paid fee. The linked queries return the raw aggregates before that cleaning.`;

const DATASET = 'https://data.seattle.gov/resource/k8z7-3feg.json';
const soql = (params: Record<string, string>) => `${DATASET}?${new URLSearchParams(params).toString()}`;
const GUARD = `(feeamountpaid > 0 OR feeamount <= ${data.maxPaidLine})`;
const SINCE_2020 = `invoicedate >= '2020-01-01'`;

const Q_YEARLY = soql({
  $select: 'date_extract_y(invoicedate) AS year, sum(feeamount) AS billed, sum(feeamountpaid) AS paid',
  $where: `${SINCE_2020} AND ${GUARD}`,
  $group: 'year',
  $order: 'year',
});
const Q_PERMITS = soql({
  $select: 'date_extract_y(invoicedate) AS year, count(distinct permitnum) AS permits, sum(feeamount) AS billed',
  $where: `${SINCE_2020} AND ${GUARD}`,
  $group: 'year',
  $order: 'year',
});
const Q_MONTHLY = soql({
  $select: 'date_trunc_ym(invoicedate) AS month, sum(feeamount) AS billed',
  $where: `${SINCE_2020} AND ${GUARD}`,
  $group: 'month',
  $order: 'month',
});
const Q_WHALES = soql({
  $select: 'date_extract_y(invoicedate) AS year, count(*) AS n',
  $where: `${SINCE_2020} AND feeamount >= 100000 AND ${GUARD} AND upper(feedescription) NOT LIKE '%TECHNOLOGY FEE%'`,
  $group: 'year',
  $order: 'year',
});
const Q_TOP20 = soql({
  $select: 'permitnum, sum(feeamount) AS billed',
  $where: `${SINCE_2020} AND ${GUARD}`,
  $group: 'permitnum',
  $order: 'billed DESC',
  $limit: '20',
});

export default function FeesRevenuePage() {
  const ptt = data.permitTypeTrend;
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
          <div className="label">Invoiced, never paid</div>
          <div className="value">{fmtMoneyCompact(data.totalDue)}</div>
        </div>
      </div>

      <ChartCard
        title="What SDCI billed each year"
        desc={`Total fees invoiced by year. ${fmtMoneyCompact(data.billed2020)} in 2020, a trough of ${fmtMoneyCompact(data.billed2024)} in 2024, then a climb. The dashed segment is 2026 annualized: ${fmtMoneyCompact(data.billed2026Actual)} billed through ${data.dataThroughLabel} works out to a ${fmtMoneyCompact(data.billed2026Pace)} pace.`}
        csv={{
          filename: 'fees-billed-by-year.csv',
          data: toCsv(
            ['year', 'billed', 'annualized_pace'],
            data.billedTrend.map((r) => [r.y, r.billed, r.pace]),
          ),
        }}
        footnote={`${METHOD} Billed = amount paid plus the computed unpaid remainder on each invoice line. ${CLEANING} 2026 covers January 1 to ${data.dataThroughLabel} and is shown annualized (multiplied by ${data.annualizeFactor}) as a dashed estimate, never mixed into the solid line.`}
        source={{ id: 'k8z7-3feg', query: Q_YEARLY }}
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
        source={{ id: 'k8z7-3feg', query: Q_PERMITS }}
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
        title="But the typical construction permit is paying more"
        desc={`The smaller-checks story is a mix effect, and it hides the opposite move underneath. The median simple permit (issued over the counter or subject to field inspection, no plan review) got ${fmtPct(Math.abs(ptt.simpleDropPct))} cheaper, ${fmtMoney(ptt.simpleFirst)} to ${fmtMoney(ptt.simpleLast)}. But the median construction permit, the kind that goes through real plan review, rose ${fmtPct(ptt.cnRisePct)}, ${fmtMoney(ptt.cnFirst)} to ${fmtMoney(ptt.cnLast)}, climbing almost every year. The typical builder is paying more; the overall average only fell because the giant tower projects thinned out.`}
        csv={{
          filename: 'per-permit-fee-by-type.csv',
          data: toCsv(
            ['year', 'construction_median', 'simple_median', 'all_median'],
            ptt.years.map((y, i) => [y, ptt.construction[i], ptt.simple[i], ptt.all[i]]),
          ),
        }}
        footnote={`Median fees paid per permit, permit number normalized so sub-permits do not split. Construction is the -CN record class; simple is every permit with no value-based, plan-review, intake, or hourly-review line, which is the over-the-counter and field-inspection work. Complete calendar years only, ${ptt.years[0]} to ${ptt.years[ptt.years.length - 1]}. ${METHOD}`}
        source={{ id: 'k8z7-3feg' }}
      >
        <PaceTrend
          data={ptt.years.map((y, i) => ({ y: String(y), construction: ptt.construction[i], simple: ptt.simple[i], all: ptt.all[i] }))}
          xKey="y"
          series={[
            { key: 'construction', name: 'Construction permit (median)', color: PALETTE[1] },
            { key: 'all', name: 'All permits (median)', color: '#9aa3ad' },
            { key: 'simple', name: 'Simple / over-the-counter (median)', color: PALETTE[0] },
          ]}
          valueFormat="money"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="Fees billed vs permits issued, by quarter"
        desc={`The same scissors at quarterly grain. Fee dollars (bars, left axis) peaked at $${(Math.max(...data.quarters.map((q) => q.billed)) / 1e6).toFixed(0)}M in ${data.quarters.reduce((a, b) => (b.billed > a.billed ? b : a)).q} while issuance sat near its low; permits issued (line, right axis) peaked at ${fmtInt(Math.max(...data.quarters.map((q) => q.issued)))} in ${data.quarters.reduce((a, b) => (b.issued > a.issued ? b : a)).q} while dollars slid. Complete quarters only, through ${data.quarters[data.quarters.length - 1].q}.`}
        csv={{
          filename: 'fees-vs-issued-quarterly.csv',
          data: toCsv(['quarter', 'fees_billed', 'permits_issued'], data.quarters.map((q) => [q.q, q.billed, q.issued])),
        }}
        footnote={`${METHOD} Issued counts span all four permit systems the fees cover: building (76t5-zqzr), electrical (c4tj-daue), trade (c87v-5hwh), and land use (ht3q-kdvx), by issue date. Fees are billed by invoice date, and invoices land throughout a permit's life, including on applications never issued, so the two series describe the same world but not the same permits in the same quarter. Only quarters the data fully covers are shown, so the series ends at ${data.lastCompleteQuarter} with data through ${data.dataThroughLabel}. The linked query returns billed dollars by month; the chart rolls them up to quarters.`}
        source={{ id: 'k8z7-3feg', query: Q_MONTHLY }}
      >
        <QuarterlyChart rows={data.quarters} />
      </ChartCard>

      <ChartCard
        title="The vanishing whales"
        desc={`Single invoices of ${fmtMoneyCompact(100000)} or more, by year. There were ${fmtInt(data.whales2020)} in 2020 and ${fmtInt(data.whales2025)} in all of 2025. 2026 has produced ${fmtInt(data.whales2026Actual)} so far. Together these ${fmtMoneyCompact(data.whaleTotal)} in whale invoices are ${fmtPct(data.whaleSharePct)} of every dollar billed since 2020.`}
        csv={{
          filename: 'invoices-over-100k-by-year.csv',
          data: toCsv(['year', 'invoices_100k_plus'], data.whales.map((r) => [r.y, r.n])),
        }}
        footnote={`${METHOD} Counts invoice lines where the billed amount (paid plus the computed unpaid remainder) is at least ${fmtMoney(100000)}, after the voided-line cleaning described above. Technology Fee lines are excluded so post-2023 counts stay comparable. 2026* is partial, through ${data.dataThroughLabel}, and is not annualized here.`}
        source={{ id: 'k8z7-3feg', query: Q_WHALES }}
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
        desc={`${data.top20AllPh ? 'Every one of the top 20' : 'Most of the top 20'} permits by total fees billed is a phased (PH) permit, the structure used for towers that get reviewed and built in stages. Just ${fmtInt(data.phPermits)} phased permits carry ${fmtMoneyCompact(data.phBilled)} in fees, ${fmtPct(data.phSharePct)} of all dollars billed. The biggest, at ${data.top1Address}, was billed ${fmtMoneyCompact(data.top1Billed)} on its own.`}
        csv={{
          filename: 'top-20-permits-by-fees.csv',
          data: toCsv(
            ['permit', 'address', 'project', 'total_billed'],
            data.top20.map((r) => [r.id, r.address, r.project, r.billed]),
          ),
        }}
        footnote={`${METHOD} Fees are summed per permit number across all its invoice lines, January 2020 to ${data.dataThroughLabel}, after the voided-line cleaning described above. Addresses and project descriptions come from joining the permit number to the city's building permits dataset (76t5-zqzr).`}
        source={{ id: 'k8z7-3feg', query: Q_TOP20 }}
      >
        <DataTable
          headers={['Permit', 'Address', 'Project', 'Fees billed']}
          rows={data.top20.map((r) => [r.id, r.address, r.project, fmtMoney(r.billed)])}
          wrapCols={[2]}
        />
      </ChartCard>

      <ChartCard
        title={`The ${fmtMoneyCompact(data.totalDue)} nobody paid`}
        desc={`Share of each year's billed dollars showing no payment: computed from fee amount minus amount paid, with voided and rebilled lines removed, not a balance snapshot. In the mature years 2020 to 2024 it runs ${fmtPct(data.leakMatureMin)} to ${fmtPct(data.leakMatureMax)}, and ${fmtPct(data.oldSharePct)} of the unpaid total sits on invoices more than a year old.`}
        csv={{
          filename: 'unpaid-share-by-year.csv',
          data: toCsv(['year', 'unpaid_pct_of_billed'], data.leak.map((r) => [r.y, r.pct])),
        }}
        footnote={`${METHOD} The dataset has no balance snapshot, so unpaid here is computed: fee amount minus amount paid on each line, after the reissue dedupe and rebill collapse described above. It still counts fees that were later waived, reduced, or written off in ways the data does not record, so read it as invoiced-and-never-paid, not money currently owed or a final write-off rate. Recent invoices (especially in the partial 2026*) will also still be paid.`}
        source={{ id: 'k8z7-3feg', query: Q_YEARLY }}
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
        <strong>Where the leakage concentrates.</strong> Demolition (DM) fees stand out: {fmtPct(data.dmMatureUnpaidPct)}{' '}
        of demo dollars billed in the mature years 2020 to 2024 show no payment, against {fmtPct(data.leakMatureMin)} to{' '}
        {fmtPct(data.leakMatureMax)} for fees overall. And demo invoices go unpaid all or nothing:{' '}
        {fmtPct(data.dmFullyUnpaidPct)} of them are fully unpaid while only {data.dmPartialPct}% are partially paid.
        Among the worst-collected charges is the inspection no-show fee: {fmtPct(data.nsUnpaidPct)} of the{' '}
        {fmtMoneyCompact(data.nsBilled)} billed across {fmtInt(data.nsLines)} no-show invoices was never paid.
      </div>

      <div className="caveat">
        <strong>Construction itself is fine. The mix changed.</strong> Ordinary construction (CN) permits billed{' '}
        {fmtMoneyCompact(data.cn2025)} in 2025, {data.cn2025IsRecord ? 'their best year since 2020' : 'near their best year since 2020'},
        and 2026 is pacing to {fmtMoneyCompact(data.cn2026Pace)}. The revenue decline lives almost entirely in the big-project
        tier: phased tower permits and other six-figure invoices that arrived steadily in 2020 and mostly stopped. Whether that
        gap closes depends on a handful of projects a year, not on thousands of kitchen remodels.
      </div>

      <RelatedLinks slug="/fees-revenue" />
    </>
  );
}
