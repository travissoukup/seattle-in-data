import Link from 'next/link';
import data from '@/lib/generated/fees-housing.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { fmt1, fmtInt, fmtMoney, fmtMoneyCompact, fmtPct, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2020-01-01' -> 'January 2020'. */
const monthYear = (iso: string) => {
  const [y, m] = iso.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
/** '2026-06-23' -> 'June 23, 2026'. */
const monthDayYear = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
};

/** Lowercase only the first character, so '$50K' stays '$50K'. */
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const WINDOW = `${monthYear(data.windowStart)} to ${monthDayYear(data.windowEnd)}`;
const SRC = `Fee data comes from a public records request to the City of Seattle (SDCI invoice extract, ${WINDOW}); the analysis code is in scripts/fees/ in this site's public repo. Each permit's fees are all invoice lines on its record: dollars paid plus any unpaid balance as of the extract date.`;

const bandLo = data.curve.bands[0];
const bandHi = data.curve.bands[data.curve.bands.length - 1];
const tierLo = data.perUnit.tiers[0];
const tierHi = data.perUnit.tiers[data.perUnit.tiers.length - 1];

export const metadata = {
  title: 'Permit fees fall hardest on the smallest projects',
  description: `Seattle projects ${lcFirst(bandLo.label)} in value pay a median ${fmtPct(bandLo.medianPct)} of that value in permit fees; projects ${lcFirst(bandHi.label)} pay ${fmtPct(bandHi.medianPct)}. Plus ${fmtMoneyCompact(data.neverBuilt.paid)} paid in fees on buildings that were never built.`,
};

export default function FeesHousingPage() {
  const curveRows = data.curve.bands.map((b) => ({ label: b.label, value: b.medianPct }));
  const tierRows = data.perUnit.tiers.map((t) => ({ label: t.label, value: t.medianPerUnit }));

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permit Fees</p>
        <h1>The smallest projects pay {fmt1(data.curve.ratio)} times the fee rate of the biggest</h1>
        <p>
          Seattle sets permit fees by fee schedule, not by project size, and the result is a steeply regressive
          curve. On {fmtInt(data.curve.n)} construction permits with a declared project value, the median project{' '}
          {lcFirst(bandLo.label)} in declared value paid {fmtPct(bandLo.medianPct)} of that value in fees. The median
          project {lcFirst(bandHi.label)} paid {fmtPct(bandHi.medianPct)}. That is a {fmt1(data.curve.ratio)}x gap. The
          same pattern shows up per home: houses and duplexes ran a median {fmtMoney(data.perUnit.sfd.medianPerUnit)}{' '}
          in construction fees per new unit, apartment buildings {fmtMoney(data.perUnit.mf.medianPerUnit)}, and
          projects of {tierHi.label} just {fmtMoney(tierHi.medianPerUnit)}. And some fees
          buy nothing at all: {fmtInt(data.neverBuilt.n)} construction permits that ended canceled or withdrawn,
          covering {fmtInt(data.neverBuilt.unitsPlanned)} planned homes, still paid{' '}
          {fmtMoneyCompact(data.neverBuilt.paid)} in fees.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Fee rate, projects {lcFirst(bandLo.label)}</div>
          <div className="value">{fmtPct(bandLo.medianPct)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Fee rate, projects {lcFirst(bandHi.label)}</div>
          <div className="value">{fmtPct(bandHi.medianPct)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Construction fees per new home, citywide</div>
          <div className="value">{fmtMoney(data.perUnit.aggPerUnit)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Fees paid on permits never built</div>
          <div className="value">{fmtMoneyCompact(data.neverBuilt.paid)}</div>
        </div>
      </div>

      <ChartCard
        title="The regressive curve"
        desc={`Median permit fees as a share of the project value the applicant declared, for every construction permit invoiced in the window. The median ${lcFirst(bandLo.label)} project (${fmtMoneyCompact(bandLo.medianValue)} of work) paid ${fmtMoney(bandLo.medianFee)}; the median ${lcFirst(bandHi.label)} project (${fmtMoneyCompact(bandHi.medianValue)}) paid ${fmtMoney(bandHi.medianFee)}. The rate falls at every step up.`}
        csv={{
          filename: 'fee-share-by-project-value.csv',
          data: toCsv(
            ['value_band', 'permits', 'median_fee_pct_of_value', 'median_fee', 'median_declared_value'],
            data.curve.bands.map((b) => [b.label, b.n, b.medianPct, b.medianFee, b.medianValue]),
          ),
        }}
        footnote={`${SRC} Covers CN (construction) permit records joined to the Building Permits dataset (76t5-zqzr) on the full permit number; the join matches essentially all of them. Project value is the applicant's own declared construction cost, so treat the bands as approximate. ${fmtPct(data.curve.valueSharePct)} of invoiced construction records declare a value; the rest are excluded.`}
      >
        <RankedBars rows={curveRows} valueName="Median fee, % of project value" valueFormat="pct" height={340} />
      </ChartCard>

      <ChartCard
        title="Construction fees per new home"
        desc={`Median construction-permit fees per net new housing unit, by project size. Small projects pay the most per home: ${fmtMoney(tierLo.medianPerUnit)} for projects of ${tierLo.label} against ${fmtMoney(tierHi.medianPerUnit)} for projects of ${tierHi.label}. By permit class, houses and duplexes ran ${fmtMoney(data.perUnit.sfd.medianPerUnit)} per unit and multifamily buildings ${fmtMoney(data.perUnit.mf.medianPerUnit)}; big multifamily projects of a hundred or more units ran ${fmtMoney(data.perUnit.mfBig.medianPerUnit)}. Across all ${fmtInt(data.perUnit.permits)} unit-adding permits, ${fmtMoneyCompact(data.perUnit.fees)} in fees bought ${fmtInt(data.perUnit.units)} homes: ${fmtMoney(data.perUnit.aggPerUnit)} per unit overall.`}
        csv={{
          filename: 'fees-per-new-unit.csv',
          data: toCsv(
            ['project_size', 'permits', 'units_added', 'median_fee_per_unit', 'aggregate_fee_per_unit'],
            data.perUnit.tiers.map((t) => [t.label, t.n, t.units, t.medianPerUnit, t.aggPerUnit]),
          ),
        }}
        footnote={`${SRC} Covers construction (CN) and phased (PH) permit records that added at least one housing unit, joined to the Building Permits dataset for unit counts. Fees here are only what was billed to the construction record itself; electrical, mechanical and land use review fees for the same project sit on separate records and are not included, so these are floors. Fees do not scale with unit count, which is the whole story: a tower spreads a similar review bill across hundreds of homes.`}
      >
        <RankedBars rows={tierRows} valueName="Median fee per new unit" valueFormat="money" height={320} />
      </ChartCard>

      <ChartCard
        title="Fees on buildings that never happened"
        desc={`Permit review is billed whether or not the project survives. These construction and phased permits ended in Canceled or Withdrawn status, so the buildings never went up, but ${fmtPct(data.neverBuilt.paidSharePct)} of the fees billed to them were paid anyway. The withdrawn applications alone had ${fmtInt(data.neverBuilt.rows.find((r) => r.status === 'Withdrawn')?.units)} homes planned.`}
        csv={{
          filename: 'fees-on-never-built.csv',
          data: toCsv(
            ['status', 'permits', 'fees_invoiced', 'fees_paid', 'units_planned'],
            data.neverBuilt.rows.map((r) => [r.status, r.n, r.invoiced, r.paid, r.units]),
          ),
        }}
        footnote={`${SRC} Statuses come from the Building Permits dataset at snapshot time. This undercounts dead projects: applications that simply expired, or that are still nominally open, are not included. The median dead permit was billed ${fmtMoney(data.neverBuilt.medianFee)}; a handful of large phased projects account for much of the dollar total. Review work did happen on these permits; the fee bought staff time, not a building.`}
      >
        <DataTable
          headers={['Status', 'Permits', 'Fees invoiced', 'Fees paid', 'Homes planned']}
          rows={[
            ...data.neverBuilt.rows.map((r) => [
              r.status,
              fmtInt(r.n),
              fmtMoney(r.invoiced),
              fmtMoney(r.paid),
              fmtInt(r.units),
            ]),
            [
              <strong key="t">Total</strong>,
              <strong key="n">{fmtInt(data.neverBuilt.n)}</strong>,
              <strong key="i">{fmtMoney(data.neverBuilt.invoiced)}</strong>,
              <strong key="p">{fmtMoney(data.neverBuilt.paid)}</strong>,
              <strong key="u">{fmtInt(data.neverBuilt.unitsPlanned)}</strong>,
            ],
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Demolition fees: paid in full or not at all"
        desc={`Demolition permits show the starkest nonpayment pattern in the extract. Of ${fmtInt(data.demo.matureN)} demolition permits first invoiced by ${data.demo.matureLastYear}, ${fmtInt(data.demo.fullPaidN)} paid every dollar and ${fmtInt(data.demo.zeroPaidN)} (${fmtPct(data.demo.zeroPaidPct)}) paid nothing at all. Only ${fmtInt(data.demo.partialN)} paid part of the bill. The unpaid balance is ${fmtMoney(data.demo.unpaid)}, ${fmtPct(data.demo.unpaidPct)} of what those permits were billed.`}
        csv={{
          filename: 'demo-fee-payment.csv',
          data: toCsv(
            ['payment_outcome', 'permits'],
            [
              ['Paid in full', data.demo.fullPaidN],
              ['Paid nothing', data.demo.zeroPaidN],
              ['Paid partially', data.demo.partialN],
            ],
          ),
        }}
        footnote={`${SRC} Limited to DM (demolition) records whose first invoice landed by ${data.demo.matureLastYear}, so every permit here has had years to pay; newer permits are excluded because an open balance on a recent bill is normal. The all-or-nothing split suggests the unpaid group are mostly applications that stalled before issuance, since a demolition that actually proceeds has to clear its fees.`}
      >
        <RankedBars
          rows={[
            { label: 'Paid in full', value: data.demo.fullPaidN },
            { label: 'Paid nothing', value: data.demo.zeroPaidN },
            { label: 'Paid partially', value: data.demo.partialN },
          ]}
          valueName="Demolition permits"
          valueFormat="int"
          height={220}
        />
      </ChartCard>

      <ChartCard
        title="Where the fee dollars land"
        desc={`Construction, phased and demolition fees by the permit's ZIP code, top ${fmtInt(data.zips.length)} of ${fmtInt(data.zipCount)} Seattle ZIPs. One thing this table does not show is different pricing: the fee schedule is citywide. Geography here is a map of construction activity, and of the small-project premium. ZIPs full of towers show low fees per home; ZIPs where remodels and single houses dominate show high ones.`}
        csv={{
          filename: 'fees-by-zip.csv',
          data: toCsv(
            ['zip', 'neighborhoods', 'fees_invoiced', 'permits', 'units_added', 'fees_per_unit'],
            data.zips.map((z) => [z.zip, z.label, z.fees, z.n, z.units, z.perUnit]),
          ),
        }}
        footnote={`${SRC} ZIP comes from the address on the joined Building Permits record. Fees per unit divides all construction, phased and demolition fees in the ZIP by net housing units added there, so it mixes unit-adding and non-unit work; it describes the ZIP's construction economy, not a price anyone was quoted.`}
      >
        <DataTable
          headers={['ZIP', 'Neighborhoods', 'Fees invoiced', 'Permits', 'Units added', 'Fees per unit']}
          wrapCols={[1]}
          rows={data.zips.map((z) => [
            z.zip,
            z.label,
            fmtMoneyCompact(z.fees),
            fmtInt(z.n),
            fmtInt(z.units),
            fmtMoney(z.perUnit),
          ])}
          caption={`Fees invoiced ${WINDOW}, permits joined to an address. Sorted by total fees.`}
        />
      </ChartCard>

      <div className="caveat">
        <strong>What this can and cannot say.</strong> This page covers the {fmtInt(data.joined.records)} construction,
        phased and demolition permit records in the fee extract, {fmtMoneyCompact(data.joined.invoiced)} invoiced,
        which is {fmtPct(data.joined.shareOfAllInvoicedPct)} of all fee dollars in the extract; electrical, mechanical
        and land use fees live on separate records and separate pages. Declared project value is self-reported by the
        applicant and is not audited here. The extract starts in {monthYear(data.windowStart)}, so permits whose fees
        were all billed earlier do not appear. And fees are one input to housing cost among many; this page measures
        what the city billed, not what a project ultimately cost.
      </div>

      <RelatedLinks slug="/fees-housing" />
    </>
  );
}
