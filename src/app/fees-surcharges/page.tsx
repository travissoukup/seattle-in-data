import Link from 'next/link';
import data from '@/lib/generated/fees-surcharges.json';
import { ChartCard } from '@/components/ChartCard';
import { BarsChart, RankedBars, TrendChart } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { fmt1, fmtInt, fmtMoneyCompact, fmtPct } from '@/lib/format';

export const metadata = {
  title: 'The fee on your fees',
  description: `Seattle's 5% Technology Fee is the most invoiced line in the permit system: ${fmtInt(data.techLines)} lines since ${data.techFirstDate.slice(0, 4)}, median $${data.techMedianLine.toFixed(2)}, plus the admin fee staircase and the junk drawer of odd charges.`,
};

/** Dollars with cents, for lines where the cents are the point. */
const cents = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** ISO date (yyyy-mm-dd) to long form, computed from the JSON, never typed. */
const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const RES = 'https://data.seattle.gov/resource/k8z7-3feg.json';
const q = (params: Record<string, string>) => `${RES}?${new URLSearchParams(params).toString()}`;
const OVERHEAD_IN = `('5% Technology Fee','Administrative Fee','Administrative Post-Issuance Change')`;

const METHOD = `Data from the Permit Fees open dataset (k8z7-3feg on data.seattle.gov), refreshed weekly. SDCI published it in September 2026 after this site asked for the billing data, which was first analyzed here from a June 2026 public records request. This page covers invoices from ${fmtDate(data.windowStart)} through ${fmtDate(data.windowEnd)}; analysis code is in scripts/fees/ in this site's public repo.`;

const csvOf = (headers: string[], rows: (string | number)[][]) =>
  [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');

export default function FeesSurchargesPage() {
  const j = data.junk;
  const first = data.overheadFirstFullYear;
  const last = data.overheadLastFullYear;
  const techYear0 = Number(data.techFirstDate.slice(0, 4));
  const techYears =
    (Date.parse(data.windowEnd) - Date.parse(data.techFirstDate)) / (365.25 * 86400000);

  const trendRows = data.overheadByYear.map((r) => ({
    y: r.y === 2026 ? '2026*' : String(r.y),
    tech: r.tech,
    admin: r.admin,
  }));

  const bucketRows = data.burdenBuckets.map((b) => ({ label: b.label, value: b.medianShare }));

  const stairRows = data.adminStaircase.map((r) => ({
    y: r.y === 2026 ? '2026*' : String(r.y),
    fee: r.fee,
  }));

  const junkRows: [string, string, string][] = [
    [
      'Miscellaneous',
      fmtMoneyCompact(j.misc.paid),
      `${fmtInt(j.misc.lines)} lines are labeled Miscellaneous or AR Miscellaneous, with no other explanation in the dataset. The biggest single one is ${cents(j.misc.maxPaid)}, paid on phased permit ${j.misc.maxRecord} in ${j.misc.maxYear}.`,
    ],
    [
      'The Commerical typo',
      `${fmt1(j.typo.lineRatio)}:1`,
      `The line "State Surcharge Commerical" has been billed ${fmtInt(j.typo.typoLines)} times against ${fmtInt(j.typo.okLines)} for the correctly spelled version. The typo is still in service: ${fmtInt(j.typo.typo2026)} more lines in 2026.`,
    ],
    [
      'Lines under $5',
      fmtPct(j.tiny.pctLines),
      `${fmtInt(j.tiny.n)} billed lines are under five dollars, and together they carry ${fmtPct(j.tiny.pctRevenue)} of all revenue. ${fmtPct(j.tiny.pctTech)} of them are Technology Fee lines, including one for ${cents(data.techMinPaid)}.`,
    ],
    [
      'Same-day repeats',
      fmtMoneyCompact(j.dups.extraPaid),
      `${fmtInt(j.dups.extraLines)} paid lines repeat an identical charge on the same permit, same day, and same amount, on separate invoices. Unpaid twins of paid lines, which are voided or reissued invoices rather than double payments, are excluded: ${fmtInt(j.dups.voidedTwinLines)} of them. The biggest repeat is a ${cents(j.dups.maxPaid)} ${j.dups.maxDesc} line billed twice to ${j.dups.maxRecord} in ${j.dups.maxYear}.`,
    ],
    [
      'Bounced checks',
      fmtMoneyCompact(j.nsf.avg),
      `${fmtInt(j.nsf.lines)} "NSF Check Receivable" lines rebill fees whose original check bounced, averaging ${fmtMoneyCompact(j.nsf.avg)} and topping out at ${cents(j.nsf.max)}. The city adds an NSF Check Fee of a few dollars on top.`,
    ],
    [
      'Green Building Penalty',
      fmtMoneyCompact(j.gbp.paid),
      `A penalty line for projects that took a green-building incentive and missed the standard first appears in ${j.gbp.firstYear}. ${fmtInt(j.gbp.lines)} lines so far, with ${fmtMoneyCompact(j.gbp.paid)} paid.`,
    ],
    [
      'The EV fee split',
      fmtInt(j.ev.succKinds),
      `The "Vehicle Charging Stations" fee has been billed ${fmtInt(j.ev.lines)} times since 2020, ${fmtInt(j.ev.lines2026)} of them in 2026, most recently on ${j.ev.lastDate}. In 2026 it was joined by ${fmtInt(j.ev.succKinds)} tiered "Car Chargers" lines by level and amperage, part of ${fmtInt(data.junk.new2026Descs)} fee descriptions new that year.`,
    ],
  ];

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permit Fees</p>
        <h1>The most billed line in Seattle permitting is a fee on your other fees</h1>
        <p>
          On {fmtDate(data.techFirstDate)}, a {fmt1(data.ratioMedian)}% Technology Fee started riding along on SDCI
          invoices. {fmt1(techYears)} years later it is the most invoiced line in the system: {fmtInt(data.techLines)} lines,
          more than the {fmtInt(data.adminLines)} for the Administrative Fee in second place, adding up to{' '}
          {fmtMoneyCompact(data.techPaid)}. The typical line is tiny. The median is ${data.techMedianLine.toFixed(2)},
          and the smallest paid line is {cents(data.techMinPaid)}. Together with administrative fees, pure overhead
          took {fmtPct(last.overhead)} of every permit dollar in {last.y}, up from {fmtPct(first.overhead)} in{' '}
          {first.y}. This page covers the fee on your fees, then empties the junk drawer at the bottom of the invoice
          file.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Technology Fee lines since {techYear0}</div>
          <div className="value">{fmtInt(data.techLines)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Collected from it</div>
          <div className="value">{fmtMoneyCompact(data.techPaid)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Median line</div>
          <div className="value">${data.techMedianLine.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Overhead share of {last.y} fees</div>
          <div className="value">{fmtPct(last.overhead)}</div>
        </div>
      </div>

      <ChartCard
        title="Overhead's growing cut of the permit dollar"
        desc={`Technology Fee and administrative fee collections as a share of everything SDCI collected each year. Overhead took ${fmtPct(first.overhead)} of the permit dollar in ${first.y} and ${fmtPct(last.overhead)} in ${last.y}, with the ${techYear0} jump coming entirely from the new fee.`}
        csv={{
          filename: 'overhead-share-by-year.csv',
          data: csvOf(
            ['year', 'tech_fee_pct', 'admin_fee_pct', 'overhead_pct'],
            data.overheadByYear.map((r) => [r.y, r.tech, r.admin, r.overhead]),
          ),
        }}
        footnote={`${METHOD} Overhead counts lines labeled 5% Technology Fee, Administrative Fee, and Administrative Post-Issuance Change; the denominator is all dollars paid that year. 2026* covers January through ${fmtDate(data.windowEnd)} only; shares are comparable across a partial year but the underlying dollars are not.`}
        source={{
          id: 'k8z7-3feg',
          query: q({
            $select: 'date_extract_y(invoicedate) as year, feedescription, sum(feeamountpaid) as paid',
            $where: `invoicedate >= '${data.windowStart}' AND feedescription in ${OVERHEAD_IN}`,
            $group: 'year, feedescription',
            $order: 'year',
          }),
        }}
      >
        <TrendChart
          data={trendRows}
          xKey="y"
          series={[
            { key: 'tech', name: 'Technology Fee' },
            { key: 'admin', name: 'Administrative fees' },
          ]}
          valueFormat="pct"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="What the 5% technology fee is calculated on"
        desc={`Grouping lines into invoices by permit and timestamp, ${fmtInt(data.invoicesWithTech)} invoices since ${techYear0} carry a Technology Fee line. The median ratio to the rest of the invoice is exactly ${fmt1(data.ratioMedian)}%, ${fmtPct(data.pctInBand)} sit between 4.5% and 5.5%, and ${fmtPct(data.pctExactFive)} match 5% to the penny. The fee subtitle (SMC 22.900A.100) applies it to SDCI's own review and permit fees, chapters 22.900B, C, D, E, F and H, so it is not charged on the state building code surcharge, on penalties, or on fees the department collects for other agencies like SDOT and the Fire Department.`}
        csv={{
          filename: 'tech-fee-ratio-tests.csv',
          data: csvOf(
            ['test', 'result'],
            [
              ['invoices with a Technology Fee line', data.invoicesWithTech],
              ['median fee as % of rest of invoice', data.ratioMedian],
              ['% of invoices between 4.5% and 5.5%', Number(data.pctInBand.toFixed(1))],
              ['% matching 5% of invoice to the penny', Number(data.pctExactFive.toFixed(1))],
              ['invoices with a state surcharge and a tech fee', data.surchInvoices],
              ['% exactly 5% when surcharge is included in the base', Number(data.surchExactIncl.toFixed(1))],
              ['% exactly 5% when surcharge is excluded', Number(data.surchExactExcl.toFixed(1))],
              ['Green Building Penalty invoices', data.gbpInvoices],
              ['of those, invoices with a tech fee line', data.gbpInvoicesWithTech],
            ],
          ),
        }}
        footnote={`${METHOD} An invoice here is every line sharing a permit number and an exact billing timestamp. The to-the-penny tests compare the Technology Fee line to 5% of the other lines, rounded to cents, with a one-cent tolerance. Invoices that miss the band are mostly partial payments and later adjustments, not a different rate.`}
        source={{
          id: 'k8z7-3feg',
          query: q({
            $select: 'permitnum, invoicenum, invoicedate, feedescription, feeamount, feeamountpaid',
            $where: `feedescription = '5% Technology Fee'`,
            $order: 'invoicedate',
          }),
        }}
      >
        <DataTable
          headers={['Test', 'Result']}
          wrapCols={[0]}
          rows={[
            ['Invoices carrying a Technology Fee line', fmtInt(data.invoicesWithTech)],
            ['Median fee, as a share of the rest of the invoice', fmtPct(data.ratioMedian)],
            ['Share of invoices between 4.5% and 5.5%', fmtPct(data.pctInBand)],
            ['Share matching 5% of the whole invoice to the penny', fmtPct(data.pctExactFive)],
            [`Invoices with both a state surcharge and a tech fee`, fmtInt(data.surchInvoices)],
            ['...that are exactly 5% counting the surcharge in the base', fmtPct(data.surchExactIncl)],
            ['...that are exactly 5% with the surcharge excluded', fmtPct(data.surchExactExcl)],
            ['Green Building Penalty invoices', fmtInt(data.gbpInvoices)],
            ['...that carry a Technology Fee line', fmtInt(data.gbpInvoicesWithTech)],
          ]}
          caption="Where the 5% applies and where it does not."
        />
      </ChartCard>

      <ChartCard
        title="The typical permit pays the same overhead share at every size"
        desc={`Median share of a permit's total that went to overhead fees, by permit size, for the ${fmtInt(data.eraPermits)} permits first invoiced after the fee launched. Across every record class the open dataset carries, the medians come out nearly flat: the typical permit at almost every size sends about ${fmtPct(data.burdenPeak.medianShare)} to overhead, the Technology Fee's cut, because only ${fmtPct(data.eraAdminPct)} of these permits pay an administrative fee line at all. The burden lives in the tail instead: ${fmtInt(data.permitsOver20)} permits, ${fmtPct(data.eraOver20Pct)} of the group, paid more than 20%.`}
        csv={{
          filename: 'overhead-share-by-permit-size.csv',
          data: csvOf(
            ['permit_total_paid', 'permits', 'median_overhead_pct'],
            data.burdenBuckets.map((b) => [b.label, b.n, b.medianShare]),
          ),
        }}
        footnote={`${METHOD} Covers permits whose first invoice lands on or after ${fmtDate(data.techFirstDate)} and that paid anything at all; the median permit in that group paid $${data.eraMedianPaid.toFixed(2)} total. Overhead is the Technology Fee plus administrative fee lines. Shares use dollars actually paid.`}
        source={{
          id: 'k8z7-3feg',
          query: q({
            $select: 'permitnum, sum(feeamountpaid) as overhead_paid',
            $where: `invoicedate >= '${data.techFirstDate}' AND feedescription in ${OVERHEAD_IN}`,
            $group: 'permitnum',
          }),
        }}
      >
        <RankedBars rows={bucketRows} valueName="Median overhead share" valueFormat="pct" height={340} />
      </ChartCard>

      <ChartCard
        title="The administrative fee staircase"
        desc={`The flat administrative fee on an electrical permit by year: down two steps, flat for three years, then climbing again. It was ${cents(data.adminStaircase[0].fee)} in ${data.adminStaircase[0].y} and is ${cents(data.adminStaircase[data.adminStaircase.length - 1].fee)} in ${data.adminStaircase[data.adminStaircase.length - 1].y}.`}
        csv={{
          filename: 'admin-fee-staircase.csv',
          data: csvOf(
            ['year', 'fee', 'lines_billed', 'share_at_this_amount_pct'],
            data.adminStaircase.map((r) => [r.y, r.fee, r.n, r.modeShare]),
          ),
        }}
        footnote={`${METHOD} Each bar is the most common Administrative Fee amount billed on electrical permits that year; at least ${fmtPct(Math.min(...data.adminStaircase.map((r) => r.modeShare)))} of that year's ${fmtInt(Math.min(...data.adminStaircase.map((r) => r.n)))}-plus lines sit at exactly that amount. 2026* is partial, but a flat fee does not need a full year.`}
        source={{
          id: 'k8z7-3feg',
          query: q({
            $select: 'date_extract_y(invoicedate) as year, feeamount, count(*) as lines',
            $where: `feedescription = 'Administrative Fee' AND permitnum like '%-EL' AND invoicedate >= '${data.windowStart}'`,
            $group: 'year, feeamount',
            $order: 'year, lines DESC',
          }),
        }}
      >
        <BarsChart
          data={stairRows}
          xKey="y"
          series={[{ key: 'fee', name: 'Admin fee ($)' }]}
          valueFormat="plain"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="The junk drawer"
        desc="Every big billing system grows a drawer of lines that fit nowhere else. Seven of them, one number each."
        csv={{
          filename: 'junk-drawer.csv',
          data: csvOf(['item', 'stat', 'note'], junkRows),
        }}
        footnote={`${METHOD} Same-day repeats count paid lines only, on separate invoices, and exclude Technology Fee lines, since one of those legitimately appears on every invoice and a permit can get several invoices in a day. Identical lines within a single invoice are collapsed first: the dataset bills per item, so a permit for four identical signs carries four identical charges on one invoice, and those are line items, not repeats. Unpaid twins of paid lines are treated as voided or reissued attempts, not double billing. Repeats are candidates for double billing, not proof; two identical jobs billed the same day would look the same.`}
        source={{
          id: 'k8z7-3feg',
          query: q({
            $select: 'feedescription, count(*) as lines, sum(feeamountpaid) as paid',
            $where: `feedescription in ('State Surcharge Commerical','State Surcharge Commercial')`,
            $group: 'feedescription',
          }),
        }}
      >
        <DataTable
          headers={['Item', 'The number', 'The story']}
          wrapCols={[2]}
          rows={junkRows.map((r) => [r[0], r[1], r[2]])}
          caption="Odd lines from the billing data, in one stat and two sentences each."
        />
      </ChartCard>

      <div className="caveat">
        <strong>What this data can and cannot say.</strong> These are invoice lines from the Permit Fees open dataset,
        which carries no balance snapshot and no void flag. An amount due here is computed, billed minus paid, and
        includes voided or reissued invoice lines that were never expected to be paid, so every dollar figure on this
        page counts money actually paid. The dataset reaches back to {fmtDate(data.datasetFirstDate)}; this page keeps
        its original analysis window, {fmtDate(data.windowStart)} onward, and uses the longer history only to check
        which fee descriptions are genuinely new. And 2026 runs through {fmtDate(data.windowEnd)}, so nothing here
        compares a partial 2026 to a full year.
      </div>

      <RelatedLinks slug="/fees-surcharges" />
    </>
  );
}
