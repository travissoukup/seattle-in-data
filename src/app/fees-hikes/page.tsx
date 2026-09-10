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
  title: `Seattle permit fees change once a year, ${data.nOutsideJan === 0 ? 'in January' : 'almost always in January'}`,
  description: `${data.nOutsideJan === 0 ? 'Every price change' : `All but ${fmtInt(data.nOutsideJan)} of the ${fmtInt(data.nChanges)} price changes`} on Seattle's ${fmtInt(data.nTracked)} highest-revenue permit fees since 2020 landed in January. The base fee unit froze at $${data.unit2020.toFixed(2)} for ${data.unitHikes[0].y - data.years[0]} years, then rose ${data.unitHikes.length} Januaries straight to $${fmtInt(data.unitLast)}.`,
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

const fmtDate = (iso: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const dataEndFmt = fmtDate(data.dataEnd);
const dataEndYear = new Date(`${data.dataEnd}T12:00:00`).getFullYear();
const fullHistoryYear = new Date(`${data.fullHistoryStart}T12:00:00`).getFullYear();

const FEES_DS = 'k8z7-3feg';
const soql = (params: Record<string, string>): string =>
  `https://data.seattle.gov/resource/${FEES_DS}.json?` +
  Object.entries(params)
    .map(([k, v]) => `%24${k}=${encodeURIComponent(v)}`)
    .join('&');

const SOURCE_NOTE = `Data from the Permit Fees open dataset (${FEES_DS} on data.seattle.gov), refreshed weekly: ${fmtInt(data.rowsUsed)} fee line items invoiced from Jan 2020 through ${dataEndFmt}. SDCI published the dataset in September 2026 after this site requested the underlying billing data; the analysis was first built from a records request extract, and the two match to the cent on paid amounts. ${dataEndYear} is a partial year but January, when prices change, is complete. Analysis code lives in scripts/fees/ in this site's public repo.`;

const PRICE_HISTOGRAM_QUERY = soql({
  select: 'feedescription,date_extract_y(invoicedate) AS year,feeamountpaid,count(*) AS n',
  where: "invoicedate >= '2020-01-01' AND feeamountpaid > 0",
  group: 'feedescription,year,feeamountpaid',
  having: 'n >= 20',
  order: 'feedescription,year,n DESC',
  limit: '50000',
});

export default function FeesHikesPage() {
  const y0 = data.years[0];
  const yLast = data.years[data.years.length - 1];
  const firstHikeYear = data.unitHikes[0].y;
  const risers = data.risers as Mover[];
  const cuts = data.cuts as Mover[];
  const moverRows = [...risers, ...cuts];
  const perYear = data.perYear;
  const lm = data.luMin;
  const cutYears = perYear.filter((p) => p.cut > 0).map((p) => p.y);
  const lastCutYear = cutYears.length > 0 ? Math.max(...cutYears) : null;
  const preHike = perYear.filter((p) => p.y < firstHikeYear);
  const hikeEra = perYear.filter((p) => p.y >= firstHikeYear);
  const preRaised = preHike.reduce((a, p) => a + p.raised, 0);
  const preCut = preHike.reduce((a, p) => a + p.cut, 0);
  const oj = data.outsideJan as { label: string; suffix: string; y: number; first: string }[];
  const ojLabels = [...new Set(oj.map((o) => o.label))];
  const ojDays = [
    ...new Set(oj.map((o) => new Date(`${o.first}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }))),
  ];

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permit Fees</p>
        <h1>
          Seattle changes permit prices once a year, {data.nOutsideJan === 0 ? 'in January' : 'almost always in January'}.
          After {lastCutYear ?? y0}, the only direction is up.
        </h1>
        <p>
          We tracked the {fmtInt(data.nTracked)} highest-revenue fee labels in SDCI&apos;s billing data, the ones with
          one listed price at a time. Those fees changed price {fmtInt(data.nChanges)} times between {y0} and {yLast}.
          {data.nOutsideJan === 0
            ? ' Every single change first shows up in January.'
            : ` ${fmtInt(data.nChanges - data.nOutsideJan)} of those changes first show up in January; the other ${fmtInt(data.nOutsideJan)}, every one on ${ojLabels.join(' and ')}, land on ${ojDays.join(' and ')} of their year.`}{' '}
          {fmtInt(data.nJan13)} ({fmtPct(data.pctJan13)}) land on January 1, 2, or 3. In {preHike.map((p) => p.y).join(' and ')}{' '}
          {preRaised === 0 ? 'no tracked fee went up' : `only ${fmtInt(preRaised)} tracked ${preRaised === 1 ? 'fee' : 'fees'} went up`} while{' '}
          {fmtInt(preCut)} went down. Then the pattern flipped:{' '}
          {hikeEra
            .map((p, i) => {
              const n = fmtInt(p.raised);
              if (i === hikeEra.length - 1) return `and ${n} ${p.y === yLast ? 'this January' : `in ${p.y}`}`;
              return i === 0 ? `${n} fees raised in ${p.y}` : `${n} in ${p.y}`;
            })
            .join(', ')}
          . Not one was cut after {lastCutYear ?? y0}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Base fee unit, {yLast}</div>
          <div className="value">{fmtPrice(data.unitLast)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Unit rise since {firstHikeYear - 1}</div>
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
        desc={`Most SDCI review fees are priced in multiples of one base unit. It sat at ${fmtPrice(data.unit2020)} for ${fmtInt(firstHikeYear - y0)} years, then climbed every January: ${data.unitHikes.map((h) => `+${h.pct}% in ${h.y}`).join(', ')}. That is +${fmtPct(data.unitRisePct)} in ${fmtInt(data.unitHikes.length)} steps.`}
        csv={{
          filename: 'base-fee-unit-by-year.csv',
          data: toCsv(['year', 'base_unit', 'pct_change'], data.staircase.map((s) => [s.y, s.unit, s.pct ?? ''])),
        }}
        footnote={`The unit is derived from two independent tracer fees (Drainage Review Minimum and Geotech Review Post Issue Minimum on construction permits), both invoiced at exactly 2 units in every year; they agree in all ${fmtInt(data.years.length)} years. ${SOURCE_NOTE}`}
        source={{
          id: FEES_DS,
          query: soql({
            select: 'date_extract_y(invoicedate) AS year,feeamountpaid,count(*) AS n',
            where: "feedescription = 'Drainage Review - Minimum' AND permitnum LIKE '%-CN' AND feeamountpaid > 0 AND invoicedate >= '2020-01-01'",
            group: 'year,feeamountpaid',
            order: 'year,n DESC',
          }),
        }}
      >
        <StaircaseChart data={data.staircase.map((s) => ({ y: s.y, unit: s.unit }))} height={300} />
      </ChartCard>

      <ChartCard
        title="What each January did to the price list"
        desc={`Among the ${fmtInt(data.nTracked)} tracked fees: cuts outnumbered raises in ${preHike.map((p) => p.y).join(' and ')}, then ${fmtInt(hikeEra.length)} straight Januaries of broad increases with no cut after ${lastCutYear ?? y0}. ${data.midYear.changed === 0 ? `The new months past June change nothing mid-year: among the ${fmtInt(data.midYear.checked)} tracked fees busy enough to compare on both sides of July 1, ${data.midYear.y}, every modal price matches.` : `${fmtInt(data.midYear.changed)} of ${fmtInt(data.midYear.checked)} comparable tracked fees changed price mid-${data.midYear.y}, a first for this data: ${(data.midYear.examples as { label: string }[]).map((e) => e.label).join(', ')}.`}`}
        csv={{
          filename: 'fee-changes-per-january.csv',
          data: toCsv(['year', 'fees_raised', 'fees_cut', 'fees_tracked'], perYear.map((p) => [p.y, p.raised, p.cut, p.tracked])),
        }}
        footnote={`A fee counts as changed in a year when its modal invoiced amount differs from the prior year (modal price must cover at least half of the fee's invoices in both years, minimum 20 invoices). ${data.nOutsideJan === 0 ? `Every one of the ${fmtInt(data.nChanges)} changes first appears on a January invoice.` : `All but ${fmtInt(data.nOutsideJan)} of the ${fmtInt(data.nChanges)} changes first appear on a January invoice; the exceptions, every one on ${ojLabels.join(' and ')} (a record class the original extract lacked), first appear on ${ojDays.join(' and ')}.`} ${SOURCE_NOTE}`}
        source={{ id: FEES_DS, query: PRICE_HISTOGRAM_QUERY }}
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
        source={{ id: FEES_DS, query: PRICE_HISTOGRAM_QUERY }}
      >
        <DataTable
          headers={['Fee', 'Permit type', `${y0} price`, `${yLast} price`, 'Net change']}
          rows={moverRows.map((m) => [m.label, m.type, fmtPrice(m.firstP), fmtPrice(m.lastP), signedPct(m.pct)])}
          wrapCols={[0]}
        />
      </ChartCard>

      <ChartCard
        title="The land use minimum: 10 hours, until this year"
        desc={`A land use application starts with a minimum charge of exactly 10 hours at the review rate: ${fmtPrice(lm.rows[0].minimum)} when the rate was ${fmtPrice(lm.rate2020)}, ${fmtPrice(lm.tenHourPricePrev)} at ${fmtPrice(lm.ratePrev)} in ${lm.prevYear}, ${fmtPrice(lm.tenHourPriceLast)} at ${fmtPrice(lm.rateLast)} now. The rate itself is up ${fmtPct(lm.ratePct)} since ${y0}. In ${yLast} a new small tier appeared: ${fmtInt(lm.nLastOneHour)} invoices for exactly 1 hour (${fmtPrice(lm.oneHourPrice)}), almost all on construction (${fmtInt(lm.nLastOneHourCN)}) and demolition (${fmtInt(lm.nLastOneHourDM)}) permits, plus ${fmtInt(lm.nLastHalfHour)} half-hour charges. The 1-hour charge now outnumbers the classic 10-hour minimum (${fmtInt(lm.nLastTenHour)} so far this year).`}
        csv={{
          filename: 'land-use-minimum-by-year.csv',
          data: toCsv(
            ['year', 'hourly_rate', 'ten_hour_minimum', 'invoices_at_10h', 'invoices_at_5h', 'total_minimum_invoices'],
            lm.rows.map((r) => [r.y, r.rate, r.minimum, r.nMin, r.nHalf, r.n]),
          ),
        }}
        footnote={`Rows cover the "Land Use Review - Minimum" fee on land use permit records; hourly rates are the minimum divided by 10 and match the quarter-hour lattice of "Land Use Review - Additional Hours" invoices (over 90% of paid hourly invoices sit on exact quarter hours of the rate every year). A note on a long-running confusion: the standard minimum is 10 hours, but Design Review has its own minimum at 20 hours (${fmtPrice(lm.designReviewMin2020)} in ${y0}, exactly 20 x ${fmtPrice(lm.rate2020)}), which is easy to mistake for the general one. Only ${fmtInt(lm.nLastTwoHour)} invoices in ${yLast} sit at 2 hours, so the new tier is 1 hour, not 2. ${yLast} counts run through ${dataEndFmt}. ${SOURCE_NOTE}`}
        source={{
          id: FEES_DS,
          query: soql({
            select: 'date_extract_y(invoicedate) AS year,feeamountpaid,count(*) AS n',
            where: "feedescription = 'Land Use Review - Minimum' AND feeamountpaid > 0 AND invoicedate >= '2020-01-01'",
            group: 'year,feeamountpaid',
            order: 'year,n DESC',
          }),
        }}
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
        footnote={`For each fee (description plus permit-type code) the listed price in a year is the modal invoiced amount, shown only when it covers at least half of that year's invoices (minimum 20). Two-letter permit types without a confirmed meaning are shown as their raw record-number code. The dataset reaches back to ${fullHistoryYear}; extending this explorer to the pre-2020 price history is a planned follow-up. ${SOURCE_NOTE}`}
        source={{ id: FEES_DS, query: PRICE_HISTOGRAM_QUERY }}
      >
        <PriceExplorer labels={data.explorer as ExplorerLabel[]} years={data.years} />
      </ChartCard>

      <div className="caveat">
        <strong>Prices here are what got invoiced, not the published fee ordinance.</strong> A fee&apos;s listed price
        is inferred from the most common invoiced amount, so a fee billed in varying quantities can hide a change, and
        a handful of stragglers get billed at the old price after a January switch (projects vested under the prior
        schedule). The analysis window starts in {y0}; the dataset itself reaches back to {fullHistoryYear}, and
        extending the price history earlier is a planned follow-up. {yLast} runs through {dataEndFmt} and refreshes
        weekly. The 5% Technology Fee lines are excluded throughout.
      </div>

      <RelatedLinks slug="/fees-hikes" />
    </>
  );
}
