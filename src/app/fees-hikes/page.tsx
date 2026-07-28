import Link from 'next/link';
import data from '@/lib/generated/fees-hikes.json';
import { ChartCard } from '@/components/ChartCard';
import { BarsChart } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { fmtInt, fmtPct, toCsv } from '@/lib/format';
import { PriceExplorer, StaircaseChart, type ExplorerLabel } from './PriceExplorer';

export const metadata = {
  title: 'Seattle permit fees change once a year, in January',
  description: `Every price change on Seattle's ${fmtInt(data.nTracked)} highest-revenue permit fees since 2020 landed in January. The base fee unit froze at $${data.unit2020.toFixed(2)} for three years, then rose four Januaries straight to $${fmtInt(data.unit2026)}.`,
};

/** Exact-cents money for schedule prices like $115.50. */
const fmtPrice = (v: number): string =>
  `$${v.toLocaleString('en-US', v % 1 === 0 ? undefined : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signedPct = (v: number): string => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;

interface Mover {
  label: string;
  type: string;
  firstY: number;
  firstP: number;
  lastY: number;
  lastP: number;
  pct: number;
}

const SOURCE_NOTE = `Data from a public records request to the City of Seattle: an SDCI invoice extract covering ${fmtInt(data.rowsUsed)} fee line items from Jan 2020 through Jun 23, 2026. 2026 is a partial year but January, when prices change, is complete. Analysis code lives in scripts/fees/ in this site's public repo.`;

export default function FeesHikesPage() {
  const y0 = data.years[0];
  const yLast = data.years[data.years.length - 1];
  const firstHikeYear = data.unitHikes[0].y;
  const risers = data.risers as Mover[];
  const cuts = data.cuts as Mover[];
  const moverRows = [...risers, ...cuts];
  const perYear = data.perYear;
  const lm = data.luMin;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permit Fees</p>
        <h1>Seattle changes permit prices once a year, in January. Since {firstHikeYear}, the only direction is up.</h1>
        <p>
          We tracked the {fmtInt(data.nTracked)} highest-revenue fee labels in SDCI&apos;s invoice extract, the ones
          with one listed price at a time. Those fees changed price {fmtInt(data.nChanges)} times between {y0} and{' '}
          {yLast}, and every single change first shows up in January. {fmtInt(data.nJan13)} of them ({fmtPct(data.pctJan13)})
          land on January 1, 2, or 3. In {perYear[0].y} and {perYear[1].y} no tracked fee went up and a few went down.
          Then the pattern flipped: {fmtInt(perYear[2].raised)} fees raised in {perYear[2].y},{' '}
          {fmtInt(perYear[3].raised)} in {perYear[3].y}, {fmtInt(perYear[4].raised)} in {perYear[4].y}, and{' '}
          {fmtInt(perYear[5].raised)} this January. Not one was cut after {perYear[2].y}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Base fee unit, {yLast}</div>
          <div className="value">{fmtPrice(data.unit2026)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Unit rise since 2022</div>
          <div className="value">+{fmtPct(data.unitRisePct)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Price changes tracked</div>
          <div className="value">{fmtInt(data.nChanges)}</div>
        </div>
        <div className="stat-card">
          <div className="label">First seen outside January</div>
          <div className="value">{fmtInt(data.nOutsideJan)}</div>
        </div>
      </div>

      <ChartCard
        title="The base fee unit staircase"
        desc={`Most SDCI review fees are priced in multiples of one base unit. It sat at ${fmtPrice(data.unit2020)} for three years, then climbed every January: ${data.unitHikes.map((h) => `+${h.pct}% in ${h.y}`).join(', ')}. That is +${fmtPct(data.unitRisePct)} in four steps.`}
        csv={{
          filename: 'base-fee-unit-by-year.csv',
          data: toCsv(['year', 'base_unit', 'pct_change'], data.staircase.map((s) => [s.y, s.unit, s.pct ?? ''])),
        }}
        footnote={`The unit is derived from two independent tracer fees (Drainage Review Minimum and Geotech Review Post Issue Minimum on construction permits), both invoiced at exactly 2 units in every year; they agree in all seven years. ${SOURCE_NOTE}`}
      >
        <StaircaseChart data={data.staircase.map((s) => ({ y: s.y, unit: s.unit }))} height={300} />
      </ChartCard>

      <ChartCard
        title="What each January did to the price list"
        desc={`Among the ${fmtInt(data.nTracked)} tracked fees: cuts only in ${perYear[0].y} and ${perYear[1].y}, then four Januaries of broad increases with ${fmtInt(perYear[3].cut + perYear[4].cut + perYear[5].cut)} cuts total since ${perYear[3].y}.`}
        csv={{
          filename: 'fee-changes-per-january.csv',
          data: toCsv(['year', 'fees_raised', 'fees_cut', 'fees_tracked'], perYear.map((p) => [p.y, p.raised, p.cut, p.tracked])),
        }}
        footnote={`A fee counts as changed in a year when its modal invoiced amount differs from the prior year (modal price must cover at least half of the fee's invoices in both years, minimum 20 invoices). Every one of the ${fmtInt(data.nChanges)} changes first appears on a January invoice. ${SOURCE_NOTE}`}
      >
        <BarsChart
          data={perYear.map((p) => ({ y: p.y, raised: p.raised, cut: p.cut }))}
          xKey="y"
          series={[
            { key: 'raised', name: 'Fees raised' },
            { key: 'cut', name: 'Fees cut' },
          ]}
          valueFormat="int"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Biggest risers, and the cuts nobody talks about"
        desc={`Net change from ${y0} to ${yLast} for the tracked fees that moved most. Single-family plan review is up ${fmtPct(data.sfd.pct)}, with a +${fmtPct(data.sfd.stepPct)} jump in one step (${fmtPrice(data.sfd.p2024)} to ${fmtPrice(data.sfd.p2025)} in 2025). Meanwhile fire and refrigeration unit fees fell hard early: the fire Appliance fee bottomed out ${fmtPct(data.frAppliance.pct)} below its ${y0} price by ${data.frAppliance.lowY} (${fmtPrice(data.frAppliance.first)} to ${fmtPrice(data.frAppliance.low)}), and the refrigeration Basic Fee hit ${fmtPct(data.rfBasic.pct)} (${fmtPrice(data.rfBasic.first)} to ${fmtPrice(data.rfBasic.low)}) by ${data.rfBasic.lowY} before creeping back.`}
        csv={{
          filename: 'fee-risers-and-cuts.csv',
          data: toCsv(
            ['fee', 'permit_type', `price_${y0}`, `price_${yLast}`, 'net_pct'],
            moverRows.map((m) => [m.label, m.type, m.firstP, m.lastP, m.pct]),
          ),
        }}
        footnote={`Fees shown are the largest net movers among the ${fmtInt(data.nTracked)} tracked labels with a stable listed price in both ${y0} and ${yLast}. Prices are modal invoiced amounts. Hourly review fees are excluded here because they have no single price; the land use hourly rate appears via its minimum charge. ${SOURCE_NOTE}`}
      >
        <DataTable
          headers={['Fee', 'Permit type', `${y0} price`, `${yLast} price`, 'Net change']}
          rows={moverRows.map((m) => [m.label, m.type, fmtPrice(m.firstP), fmtPrice(m.lastP), signedPct(m.pct)])}
          wrapCols={[0]}
        />
      </ChartCard>

      <ChartCard
        title="The land use minimum: 10 hours, until this year"
        desc={`A land use application starts with a minimum charge of exactly 10 hours at the review rate: ${fmtPrice(lm.rows[0].minimum)} when the rate was ${fmtPrice(lm.rate2020)}, ${fmtPrice(lm.tenHourPrice2025)} at ${fmtPrice(lm.rate2025)} in 2025, ${fmtPrice(lm.tenHourPrice2026)} at ${fmtPrice(lm.rate2026)} now. The rate itself is up ${fmtPct(lm.ratePct)} since ${y0}. In ${yLast} a new small tier appeared: ${fmtInt(lm.n26OneHour)} invoices for exactly 1 hour (${fmtPrice(lm.oneHourPrice)}), almost all on construction (${fmtInt(lm.n26OneHourCN)}) and demolition (${fmtInt(lm.n26OneHourDM)}) permits, plus ${fmtInt(lm.n26HalfHour)} half-hour charges. The 1-hour charge now outnumbers the classic 10-hour minimum (${fmtInt(lm.n26TenHour)} so far this year).`}
        csv={{
          filename: 'land-use-minimum-by-year.csv',
          data: toCsv(
            ['year', 'hourly_rate', 'ten_hour_minimum', 'invoices_at_10h', 'invoices_at_5h', 'total_minimum_invoices'],
            lm.rows.map((r) => [r.y, r.rate, r.minimum, r.nMin, r.nHalf, r.n]),
          ),
        }}
        footnote={`Rows cover the "Land Use Review - Minimum" fee on land use permit records; hourly rates are the minimum divided by 10 and match the quarter-hour lattice of "Land Use Review - Additional Hours" invoices (over 90% of them sit on exact quarter hours of the rate every year). A note on a long-running confusion: the standard minimum is 10 hours, but Design Review has its own minimum at 20 hours (${fmtPrice(lm.designReviewMin2020)} in ${y0}, exactly 20 x ${fmtPrice(lm.rate2020)}), which is easy to mistake for the general one. Only ${fmtInt(lm.n26TwoHour)} invoices in ${yLast} sit at 2 hours, so the new tier is 1 hour, not 2. ${yLast} counts run through Jun 23 only. ${SOURCE_NOTE}`}
      >
        <DataTable
          headers={['Year', 'Hourly rate', '10-hour minimum', 'Invoices at 10h', 'Invoices at 5h', 'All minimum invoices']}
          rows={lm.rows.map((r) => [
            r.y === yLast ? `${r.y} (partial)` : String(r.y),
            fmtPrice(r.rate),
            fmtPrice(r.minimum),
            fmtInt(r.nMin),
            fmtInt(r.nHalf),
            fmtInt(r.n),
          ])}
        />
      </ChartCard>

      <ChartCard
        title="Look up any big fee's price history"
        desc={`The ${fmtInt(data.nTracked)} highest-revenue fees with a stable listed price, and what they cost each year.`}
        footnote={`For each fee (description plus permit-type code) the listed price in a year is the modal invoiced amount, shown only when it covers at least half of that year's invoices (minimum 20). Two-letter permit types without a confirmed meaning are shown as their raw record-number code. ${SOURCE_NOTE}`}
      >
        <PriceExplorer labels={data.explorer as ExplorerLabel[]} years={data.years} />
      </ChartCard>

      <div className="caveat">
        <strong>Prices here are what got invoiced, not the published fee ordinance.</strong> A fee&apos;s listed price
        is inferred from the most common invoiced amount, so a fee billed in varying quantities can hide a change, and
        a handful of stragglers get billed at the old price after a January switch (projects vested under the prior
        schedule). The extract starts in {y0}, so nothing can be said about earlier years, and {yLast} runs only
        through June 23. The 5% Technology Fee lines are excluded throughout.
      </div>

      <RelatedLinks slug="/fees-hikes" />
    </>
  );
}
