import Link from 'next/link';
import data from '@/lib/generated/fees.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { fmtInt, fmtMoney, fmtMoneyCompact, fmtPct } from '@/lib/format';
import { FeeEstimator } from './FeeEstimator';

export const metadata = {
  title: 'What a Seattle permit actually costs',
  description: `The median Seattle permit paid ${fmtMoney(data.dist.median)} in city fees, but the top 1% of permits covered ${fmtPct(data.dist.top1SharePct)} of the ${fmtMoneyCompact(data.totalPaid)} collected. Fee distribution, fee families, and a lookup for what your permit type typically pays.`,
};

const startYear = data.windowStart.slice(0, 4);
const endYear = data.windowEnd.slice(0, 4);

const fmtMonthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtFullDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const endMonthYear = fmtMonthYear(data.windowEnd);
const throughDate = fmtFullDate(data.windowEnd);
const publishedMonth = fmtMonthYear(data.provenance.published);
const datasetStartYear = data.provenance.datasetStart.slice(0, 4);
const requestThroughMonth = fmtMonthYear(data.provenance.recordsRequestThrough);

const RES = `https://data.seattle.gov/resource/${data.provenance.datasetId}.json`;
const q = (params: Record<string, string>) => `${RES}?${new URLSearchParams(params).toString()}`;
const WIN = `invoicedate >= '${data.windowStart}'`;

const toCsv = (headers: string[], rows: (string | number)[][]) =>
  [headers.join(','), ...rows.map((r) => r.map((c) => (typeof c === 'string' && c.includes(',') ? `"${c}"` : c)).join(','))].join('\n');

const SOURCE_NOTE = `Data comes from the Permit Fees open dataset (${data.provenance.datasetId}): every SDCI permit fee line billed since ${datasetStartYear}, refreshed weekly. SDCI published it in ${publishedMonth} after this site requested the data; the page was first built from a records-request extract running through ${requestThroughMonth}, and the two agree to the cent on fees paid. This page uses invoices from January ${startYear} through ${throughDate}. Analysis code lives in scripts/fees/ in this site's public repo.`;

export default function FeesPage() {
  const d = data.dist;

  const histRows = data.histogram.map((h) => ({ label: h.bucket, value: h.permitsPct }));
  const topBucket = data.histogram[data.histogram.length - 1];
  const famRows = data.families.map((f) => ({ label: f.family, value: f.paid }));
  const famTop = data.families[0];
  const famHourly = data.families.find((f) => f.family === 'Hourly review time')!;

  const typeTable = data.byType.map((t) => [
    `${t.name} (${t.suffix})`,
    fmtInt(t.n),
    fmtMoney(t.p25),
    fmtMoney(t.median),
    fmtMoney(t.p75),
  ]);

  const elMedian = data.byType.find((t) => t.suffix === 'EL')!.median;
  const phType = data.byType.find((t) => t.suffix === 'PH')!;
  const cnType = data.byType.find((t) => t.suffix === 'CN')!;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permit Fees</p>
        <h1>
          The median Seattle permit costs {fmtMoney(d.median)}. The top 1% pay {fmtPct(d.top1SharePct)} of everything.
        </h1>
        <p>
          Between January {startYear} and {endMonthYear}, Seattle collected {fmtMoneyCompact(data.totalPaid)} in
          permit fees across {fmtInt(data.nPermits)} permits. Most bills are small: {fmtPct(d.under200Pct)} of permits
          paid under {fmtMoney(200)} and {fmtPct(d.under500Pct)} paid under {fmtMoney(500)}. The money is somewhere
          else. The {fmtInt(d.top1Count)} priciest permits, the top 1%, each paid {fmtMoney(d.top1Threshold)} or more
          and together covered {fmtPct(d.top1SharePct)} of all fee dollars. The single largest bill on record is{' '}
          {fmtMoney(d.max)} on one phased construction permit. The numbers come from the city&apos;s Permit Fees open
          dataset, which SDCI published in {publishedMonth} after this site requested the data:{' '}
          {fmtInt(data.nLines)} fee lines across {fmtInt(data.nDescriptions)} distinct charges, refreshed weekly.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Median permit total</div>
          <div className="value">{fmtMoney(d.median)}</div>
          <div className="sub">fees actually paid per permit</div>
        </div>
        <div className="stat-card">
          <div className="label">90th percentile</div>
          <div className="value">{fmtMoney(d.p90)}</div>
          <div className="sub">1 in 10 permits paid more than this</div>
        </div>
        <div className="stat-card">
          <div className="label">99th percentile</div>
          <div className="value">{fmtMoney(d.p99)}</div>
          <div className="sub">the door into the top 1%</div>
        </div>
        <div className="stat-card">
          <div className="label">Collected {startYear} to {endYear}</div>
          <div className="value">{fmtMoneyCompact(data.totalPaid)}</div>
          <div className="sub">{fmtInt(data.nPermits)} permits with fees paid</div>
        </div>
      </div>

      <ChartCard
        title="Most permits are cheap. The dollars are not."
        desc={`Share of permits by total fees paid. The small slice over ${fmtMoneyCompact(20000)}, just ${fmtPct(topBucket.permitsPct)} of permits, carried ${fmtPct(topBucket.dollarsPct)} of all fee dollars.`}
        csv={{
          filename: 'fee-distribution.csv',
          data: toCsv(
            ['bucket', 'pct_of_permits', 'pct_of_dollars'],
            data.histogram.map((h) => [h.bucket, h.permitsPct, h.dollarsPct]),
          ),
        }}
        footnote={`Each permit's total is the sum of fees actually paid on its record number, all years combined. Permits with nothing paid yet (${fmtInt(data.nPermitsAll - data.nPermits)} of ${fmtInt(data.nPermitsAll)}) are left out. ${SOURCE_NOTE}`}
        source={{
          id: data.provenance.datasetId,
          query: q({
            $select: 'permitnum, sum(feeamountpaid) as paid',
            $where: WIN,
            $group: 'permitnum',
            $having: 'paid > 0',
            $limit: '500000',
          }),
        }}
      >
        <RankedBars rows={histRows} valueName="Share of permits" valueFormat="pct" height={320} />
      </ChartCard>

      <ChartCard
        title="Where the fee dollar goes"
        desc={`All ${fmtInt(data.nDescriptions)} charge types in the fee schedule, grouped into families. Charges that scale with project value took ${fmtPct(famTop.sharePct)} of every dollar. Reviewer time billed by the hour took ${fmtPct(famHourly.sharePct)}.`}
        csv={{
          filename: 'fee-families.csv',
          data: toCsv(
            ['family', 'dollars_paid', 'pct_of_dollars', 'distinct_charge_types'],
            data.families.map((f) => [f.family, f.paid, f.sharePct, f.kinds]),
          ),
        }}
        footnote={`Families are assigned by keyword rules over the charge descriptions (the classifier is in scripts/fees/build_fees.py, so every assignment is checkable). The surcharges family includes the 5% technology fee, ${fmtMoneyCompact(data.techFeePaid)} since it began in 2023. ${SOURCE_NOTE}`}
        source={{
          id: data.provenance.datasetId,
          query: q({
            $select: 'feedescription, sum(feeamountpaid) as paid, count(*) as lines',
            $where: WIN,
            $group: 'feedescription',
            $order: 'paid DESC',
            $limit: '500',
          }),
        }}
      >
        <RankedBars rows={famRows} valueName="Dollars paid" valueFormat="money" height={340} />
        <DataTable
          headers={['Family', 'What is in it']}
          rows={data.families.map((f) => [f.family, f.blurb])}
          wrapCols={[1]}
        />
      </ChartCard>

      <ChartCard
        title="The typical bill, by permit type"
        desc={`The letter code on a Seattle permit number tells you what kind of permit it is, and the kind sets the bill. A typical electrical permit paid ${fmtMoney(elMedian)}. A typical phased construction permit, the kind big towers use, paid ${fmtMoney(phType.median)}.`}
        csv={{
          filename: 'fees-by-permit-type.csv',
          data: toCsv(
            ['type', 'suffix', 'permits', 'p25', 'median', 'p75'],
            data.byType.map((t) => [t.name, t.suffix, t.n, t.p25, t.median, t.p75]),
          ),
        }}
        footnote={`Permit type comes from the letter code on the record number (6912345-CN is a construction permit). Only permits with fees paid are counted, and record classes too rare to summarize are left out of the table. Classes like pre-application site visits, noise variances, tree removal reviews and early design guidance are new here: the open dataset carries record classes the original records-request extract lacked. The middle columns are the 25th percentile, median, and 75th percentile of total fees paid per permit. ${SOURCE_NOTE}`}
        source={{
          id: data.provenance.datasetId,
          query: q({
            $select: 'permitnum, sum(feeamountpaid) as paid',
            $where: WIN,
            $group: 'permitnum',
            $having: 'paid > 0',
            $limit: '500000',
          }),
        }}
      >
        <DataTable
          headers={['Permit type', 'Permits', 'Low (P25)', 'Median', 'High (P75)']}
          rows={typeTable}
        />
      </ChartCard>

      <ChartCard
        title="Estimate your permit fees"
        desc={`Pick a permit type and, for construction permits, a project-value band. The numbers are medians and typical ranges from what ${fmtInt(data.nPermits)} real permits actually paid, not a fee-schedule calculation.`}
        footnote={`Project value bands use the estimated project cost the applicant filed, joined from the city's building permits dataset (76t5-zqzr); ${fmtPct(data.estimator.cnMatchPct)} of construction permits matched. Other permit types have no filed project value, so they show one overall range. Phased construction permits are giant projects (median filed value ${fmtMoneyCompact(data.estimator.phMedianProjectCost)}), so treat that range as trivia, not an estimate. ${SOURCE_NOTE}`}
        source={{ id: data.provenance.datasetId }}
      >
        <FeeEstimator
          types={data.estimator.types}
          cnBands={data.estimator.cnBands}
          windowLabel={`${startYear} to ${endMonthYear}`}
        />
      </ChartCard>

      <div className="caveat">
        <strong>What this can and cannot tell you.</strong> These are fees the city actually collected on each permit
        number, summed over the whole window, January {startYear} through {throughDate}. A permit that is still being
        reviewed will keep accruing charges, so recent permits read low. These figures count fees the city actually
        collected; the separate question of what got billed and never paid, which the open dataset makes messy with
        voided and rebilled lines, is worked through on the <a href="/fees-revenue">revenue page</a>. The data contains
        no refunds. Fee rates also rose over these years, so a {startYear} bill and a {endYear} bill for the same work
        are not the same
        number. None of this includes construction costs, design fees, or anything the city does not bill. A typical
        construction permit paid {fmtMoney(cnType.median)} in fees; the building itself costs a lot more.
      </div>

      <RelatedLinks slug="/fees" />
    </>
  );
}
