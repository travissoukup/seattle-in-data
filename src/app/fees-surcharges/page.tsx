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

const METHOD =
  'Data from a public records request to the City of Seattle: an SDCI invoice extract covering January 1, 2020 through June 23, 2026. Analysis code is in scripts/fees/ in this site’s public repo.';

const csvOf = (headers: string[], rows: (string | number)[][]) =>
  [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');

export default function FeesSurchargesPage() {
  const j = data.junk;
  const first = data.overheadFirstFullYear;
  const last = data.overheadLastFullYear;
  const techYear0 = Number(data.techFirstDate.slice(0, 4));

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
      `${fmtInt(j.misc.lines)} lines are labeled Miscellaneous or AR Miscellaneous, with no other explanation in the extract. The biggest single one is ${cents(j.misc.maxPaid)}, paid on phased permit ${j.misc.maxRecord} in ${j.misc.maxYear}.`,
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
      `${fmtInt(j.dups.extraLines)} paid lines repeat an identical charge on the same permit, same day, and same amount, on separate invoices. The biggest is a ${cents(j.dups.maxPaid)} ${j.dups.maxDesc} line billed twice to ${j.dups.maxRecord} in ${j.dups.maxYear}.`,
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
      'The EV line rename',
      fmtInt(j.ev.succKinds),
      `The "Vehicle Charging Stations" fee, billed ${fmtInt(j.ev.lines)} times since 2020, was last invoiced ${j.ev.lastDate}. In 2026 it came back split into ${fmtInt(j.ev.succKinds)} tiered "Car Chargers" lines by level and amperage, part of ${fmtInt(data.junk.new2026Descs)} fee descriptions new that year.`,
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
          On {data.techFirstDate}, a {fmt1(data.ratioMedian)}% Technology Fee started riding along on SDCI invoices.
          Three and a half years later it is the most invoiced line in the system: {fmtInt(data.techLines)} lines,
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
        footnote={`${METHOD} Overhead counts lines labeled 5% Technology Fee, Administrative Fee, and Administrative Post-Issuance Change; the denominator is all dollars paid that year. 2026* covers January through June 23 only; shares are comparable across a partial year but the underlying dollars are not.`}
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
        title="Five percent of what, exactly"
        desc={`The math checks out, mostly. Grouping lines into invoices by permit and timestamp, ${fmtInt(data.invoicesWithTech)} invoices since ${techYear0} carry a Technology Fee line. The median ratio to the rest of the invoice is exactly ${fmt1(data.ratioMedian)}%, ${fmtPct(data.pctInBand)} sit between 4.5% and 5.5%, and ${fmtPct(data.pctExactFive)} match 5% to the penny. It also does not compound on pass-throughs: it is never charged on the state surcharge or on green-building penalties.`}
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
        title="Small permits pay the biggest overhead share"
        desc={`Median share of a permit's total that went to overhead fees, by permit size, for the ${fmtInt(data.eraPermits)} permits first invoiced after the fee launched. The typical permit under $500 sends ${fmtPct(data.smallMedianShare)} of its money to overhead, and ${fmtInt(data.permitsOver20)} permits paid more than 20%. The ${data.burdenPeak.label.toLowerCase()} bucket is the worst, at ${fmtPct(data.burdenPeak.medianShare)}: big enough to owe the flat administrative fee, too small to dilute it.`}
        csv={{
          filename: 'overhead-share-by-permit-size.csv',
          data: csvOf(
            ['permit_total_paid', 'permits', 'median_overhead_pct'],
            data.burdenBuckets.map((b) => [b.label, b.n, b.medianShare]),
          ),
        }}
        footnote={`${METHOD} Covers permits whose first invoice lands on or after ${data.techFirstDate} and that paid anything at all; the median permit in that group paid $${data.eraMedianPaid.toFixed(2)} total. Overhead is the Technology Fee plus administrative fee lines. Shares use dollars actually paid.`}
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
        footnote={`${METHOD} Same-day repeats exclude Technology Fee lines, since one of those legitimately appears on every invoice and a permit can get several invoices in a day. Repeats are candidates for double billing, not proof; two identical jobs billed the same day would look the same.`}
      >
        <DataTable
          headers={['Item', 'The number', 'The story']}
          wrapCols={[2]}
          rows={junkRows.map((r) => [r[0], r[1], r[2]])}
          caption="Odd lines from the invoice extract, in one stat and two sentences each."
        />
      </ChartCard>

      <div className="caveat">
        <strong>What this extract can and cannot say.</strong> These are invoice lines from a public records request,
        not an open dataset. Amounts due are a balance snapshot at extract time, not a payment history, so this page
        counts dollars paid. The extract contains no refund lines, and a charge that was later reversed can look like
        an unpaid one. And 2026 stops at June 23, so nothing here compares a partial 2026 to a full year.
      </div>

      <RelatedLinks slug="/fees-surcharges" />
    </>
  );
}
