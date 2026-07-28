import Link from 'next/link';
import data from '@/lib/generated/fees-hours.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { fmt1, fmtInt, fmtMoney, fmtMoneyCompact, fmtPct, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = {
  title: 'Permit review by the quarter hour',
  description: `SDCI prices hourly permit review on a quarter hour lattice. Rebuilt from ${fmtInt(
    data.totals.lines,
  )} invoice lines: rates rose up to ${fmtPct(data.rateRise.luPct)} while billed hours fell ${fmtPct(
    data.totalDrop.dropPct,
  )}. An overbilling audit of geotech and individual reviewers came back clean.`,
};

/** Hours with up to two decimals, e.g. 170.25. */
const fmtH = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'n/a';
};

const monthLabel = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const endDay = `${MONTHS_FULL[Number(data.windowEnd.slice(5, 7)) - 1]} ${fmtInt(Number(data.windowEnd.slice(8, 10)))}, ${fmtYear(data.windowEnd.slice(0, 4))}`;

const PROVENANCE = `The data is an SDCI invoice line extract obtained by public records request, covering ${monthLabel(
  data.windowStart.slice(0, 7),
)} through ${endDay}. It is not a Socrata dataset. Analysis code lives in scripts/fees in this site's public repo.`;

export default function FeesHoursPage() {
  const y0 = fmtYear(data.rateCard[0].year);
  const y6 = fmtYear(data.rateCard[data.rateCard.length - 1].year);
  const sdotStart = data.monthly.find((r) => r.sdot > 0)?.m ?? '';
  const geo = data.geo;
  const rev = data.reviewers;

  const capRows = data.capacity.map((c) => ({ label: c.disc, value: c.perReviewer2024 ?? 0 }));

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permit Fees</p>
        <h1>
          Billed review hours fell by almost half. Hourly rates rose up to {fmtInt(data.rateRise.luPct)} percent.
        </h1>
        <p>
          Seattle meters part of its permit review by the clock. The invoice extract we obtained by public records
          request shows how: {fmtInt(data.totals.lines)} hourly line items, {fmtMoneyCompact(data.totals.dollars)}{' '}
          billed, {fmtInt(data.totals.hours)} implied hours of review work since {y0}. The amounts are so regular that
          the fee schedule falls out of the data. {fmtPct(data.totals.onLatticePct)} of lines are exact multiples of a
          quarter hour at a knowable rate. Hours and rates moved in opposite directions: the city billed{' '}
          {fmt1(data.totalDrop.w2020)} metered hours a week in {y0} and {fmt1(data.totalDrop.w2026)} a week in the
          first half of {y6}, down {fmtPct(data.totalDrop.dropPct)}, while the land use rate climbed from{' '}
          {fmtMoney(data.rateCard[0].lu)} to {fmtMoney(data.rateCard[data.rateCard.length - 1].lu)} an hour. We also
          went hunting for overbilling in this data, discipline by discipline and reviewer by reviewer. We did not find
          it. The negative results are below, next to the two or three oddities that survived.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Billed at hourly rates</div>
          <div className="value">{fmtMoneyCompact(data.totals.dollars)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Implied hours of review</div>
          <div className="value">{fmtInt(data.totals.hours)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Lines on the rate lattice</div>
          <div className="value">{fmtPct(data.totals.onLatticePct)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Single lines of a work week or more</div>
          <div className="value">{fmtInt(data.mega.count40)}</div>
        </div>
      </div>

      <ChartCard
        title="The rate card, rebuilt from the invoices"
        desc={`No fee schedule came with the extract. None was needed. Within each rate family and year, almost every
          amount is a multiple of one number: the hourly rate divided by four. Land use review went from
          ${fmtMoney(data.rateCard[0].lu)} to ${fmtMoney(data.rateCard[data.rateCard.length - 1].lu)} an hour,
          engineering review (drainage, geotech, mechanical, energy, zoning) from ${fmtMoney(data.rateCard[0].eng)} to
          ${fmtMoney(data.rateCard[data.rateCard.length - 1].eng)}, and SDOT review from
          ${fmtMoney(data.rateCard[0].sdot)} to ${fmtMoney(data.rateCard[data.rateCard.length - 1].sdot)}.`}
        csv={{
          filename: 'fees-hourly-rate-card.csv',
          data: toCsv(
            ['year', 'land_use_rate', 'engineering_rate', 'sdot_rate', 'lines_on_lattice', 'share_on_lattice_pct'],
            data.rateCard.map((r) => [r.year, r.lu, r.eng, r.sdot, r.nOn, r.pctOn]),
          ),
        }}
        footnote={`Rates are reverse engineered: for each family and year we found the largest hourly rate whose quarter
          divides the observed amounts, then verified the fit line by line. The share column counts metered lines that
          land exactly on that year's lattice; most of the rest (${fmtInt(data.totals.priorFitLines)} lines) sit on an
          earlier year's lattice, which is work billed late at the old price, and ${fmtInt(data.totals.offLines)} lines
          (${fmtMoneyCompact(data.totals.offDollars)}, ${fmtPct(data.totals.offSharePct)} of hourly dollars) fit no
          known rate. ${PROVENANCE}`}
      >
        <DataTable
          headers={['Year', 'Land use / hr', 'Engineering / hr', 'SDOT / hr', 'Quarter step (land use)', 'Lines on that lattice']}
          rows={data.rateCard.map((r) => [
            fmtYear(r.year),
            fmtMoney(r.lu),
            fmtMoney(r.eng),
            fmtMoney(r.sdot),
            `$${Number(r.quarterLu).toFixed(2)}`,
            `${fmtInt(r.nOn)} (${fmtPct(r.pctOn)})`,
          ])}
          caption="Hourly rates by invoice year. The quarter step is the smallest land use charge that appears."
        />
      </ChartCard>

      <ChartCard
        title="Implied hours billed per week"
        desc={`Each point is a month, valued as average hours billed per week. Land use review collapsed: from
          ${fmt1(data.luCollapse.w2020)} hours a week in ${y0} to ${fmt1(data.luCollapse.w2025)} in
          ${fmtYear(data.rateCard[5].year)} and ${fmt1(data.luCollapse.w2026)} in early ${y6}, down
          ${fmtPct(data.luCollapse.dropPct)} while its rate rose ${fmtPct(data.rateRise.luPct)}. Drainage peaked at
          ${fmt1(data.avgWeeklyByYear['Drainage']['2022'])} hours a week in ${fmtYear(data.rateCard[2].year)}. Geotech
          slid from ${fmt1(geo.avgWeekly2020)} to ${fmt1(geo.avgWeekly2026)}.`}
        csv={{
          filename: 'fees-hours-per-week-by-discipline.csv',
          data: toCsv(
            ['month', 'land_use', 'drainage', 'geotech', 'sdot', 'other'],
            data.monthly.map((r) => [r.m, r.lu, r.drain, r.geo, r.sdot, r.other]),
          ),
        }}
        footnote={`Metered lines only: line items named Additional Hours or Hourly, converted to hours at the rate their
          amount fits. Flat minimum charges are excluded. Hours are dated by invoice date, and batches distort single
          months (see the next chart). The SDOT hourly line first appears in ${monthLabel(sdotStart)}. ${y6} is partial:
          the series ends ${monthLabel(data.monthly[data.monthly.length - 1].m)}, cut at the extract's last day, and the
          final month is scaled by its covered days. ${PROVENANCE}`}
      >
        <TrendChart
          data={data.monthly}
          xKey="m"
          series={[
            { key: 'lu', name: 'Land use' },
            { key: 'drain', name: 'Drainage' },
            { key: 'geo', name: 'Geotech' },
            { key: 'sdot', name: 'SDOT' },
            { key: 'other', name: 'All other hourly' },
          ]}
          valueFormat="int"
          height={340}
        />
      </ChartCard>

      <ChartCard
        title="The mega invoices"
        desc={`${fmtInt(data.mega.count40)} single invoice lines imply 40 hours of work or more. The largest is
          ${fmtH(data.mega.top[0].hours)} hours of land use review billed as one ${fmtMoney(data.mega.top[0].amt)} line.
          The record behind it, ${data.mega.record.id}, is the extract's whale: ${fmt1(data.mega.record.hours)} hours
          (${fmtMoneyCompact(data.mega.record.amt)}) across ${fmtInt(data.mega.record.lines)} hourly lines, including
          ${fmtH(data.mega.day.hours)} hours of land use charges posted in a single day.`}
        csv={{
          filename: 'fees-mega-invoice-lines.csv',
          data: toCsv(
            ['record_id', 'date_invoiced', 'line_item', 'implied_hours', 'amount'],
            data.mega.top.map((r) => [r.id, r.d, r.desc, r.hours, r.amt]),
          ),
        }}
        footnote={`These are almost certainly batch true ups, not single days of work: the invoice date is when SDCI
          posted the charge, not when the work happened. The system's fingerprints are all over the timestamps:
          ${fmtInt(data.mega.weekend18Lines)} hourly lines post on weekends in the six o'clock evening hour alone
          (${fmtInt(data.mega.weekend18Hours)} implied hours), and the single week of ${data.mega.batchWeek.week}
          carries ${fmtInt(data.mega.batchWeek.hours)} land use hours spread across
          ${fmtInt(data.mega.batchWeek.records)} records. ${PROVENANCE}`}
      >
        <DataTable
          headers={['Record', 'Invoiced', 'Line item', 'Hours', 'Amount']}
          rows={data.mega.top.map((r) => [r.id, r.d, r.desc, fmtH(r.hours), fmtMoney(r.amt)])}
          wrapCols={[2]}
          caption="The ten largest single hourly invoice lines in the extract."
        />
      </ChartCard>

      <ChartCard
        title="Billed hours vs the named bench"
        desc={`The overbilling test: a discipline billing more sustained weekly time than its known reviewers could
          work would be a flag. None comes close. The city's plan review dataset names the assigned reviewer on
          ${fmtInt(data.capNotes.floorPermits)} completed permits, which gives a floor on team size per discipline.
          Against a 40 hour week, geotech's ${fmtInt(data.capacity[2].floor2024)} named reviewers could log
          ${fmtInt(data.capacity[2].cap2024)} hours a week in ${fmtYear(data.capNotes.capYear)}; SDCI billed
          ${fmt1(data.capacity[2].avgWeekly2024)}, about ${fmt1(data.capacity[2].perReviewer2024)} hours per named
          reviewer. Exactly ${fmtInt(data.capNotes.weeksOverCapTotal)} calendar week anywhere tops its capacity line:
          the land use batch week charted above.`}
        csv={{
          filename: 'fees-hours-vs-staffing.csv',
          data: toCsv(
            ['discipline', 'avg_weekly_hours_2024', 'named_reviewers_2024', 'capacity_at_40h', 'hours_per_reviewer', 'max_week_hours', 'max_week', 'weeks_over_capacity'],
            data.capacity.map((c) => [c.disc, c.avgWeekly2024, c.floor2024, c.cap2024, c.perReviewer2024, c.maxWeek, c.maxWeekDate, c.weeksOverCap]),
          ),
        }}
        footnote={`Reviewer counts come from plan review dataset tqk8-y2z5 on the city's data portal
          (${fmtInt(data.capNotes.floorReviewers)} named reviewers on ${fmtInt(data.capNotes.floorPermits)} completed
          permits, a subset of all work). Counts are reviewers whose assignment windows touch the year, so they are a
          floor: real teams are at least this size, which makes the capacity line conservative. SDOT is excluded, since
          that dataset carries almost no SDOT reviews. Billed hours are dated by invoice, so batch weeks can spike past
          capacity without anyone working those hours in that week. ${PROVENANCE}`}
      >
        <RankedBars
          rows={capRows}
          valueName={`Billed hours per named reviewer per week (${fmtYear(data.capNotes.capYear)})`}
          valueFormat="plain"
          height={280}
        />
        <DataTable
          headers={[
            'Discipline',
            `Hours / week (${fmtYear(data.capNotes.capYear)})`,
            'Named reviewers',
            'Capacity at 40h',
            'Busiest week ever',
            'Weeks over capacity',
          ]}
          rows={data.capacity.map((c) => [
            c.disc,
            fmt1(c.avgWeekly2024),
            fmtInt(c.floor2024),
            fmtInt(c.cap2024),
            `${fmt1(c.maxWeek)} (${c.maxWeekDate})`,
            fmtInt(c.weeksOverCap),
          ])}
          caption={`Average billed hours in ${fmtYear(data.capNotes.capYear)} against the named reviewer floor. Busiest week spans ${y0} to ${fmtYear(data.capNotes.capYear)}.`}
        />
      </ChartCard>

      <ChartCard
        title="The geotech audit came back clean"
        desc={`This page exists partly because the site's owner suspected geotech review of padding hours. The tells we
          tested all came back negative. Geotech bills with the same quarter hour precision as drainage, not in
          suspicious whole hour blocks. Its biggest week (${fmt1(geo.weeklyMax)} hours, week of ${geo.spike.week}) is a
          system batch: ${fmtInt(geo.spike.lines)} lines across ${fmtInt(geo.spike.records)} records, no record above
          ${fmt1(geo.spike.topRecordHours)} hours. And in ${fmtInt(geo.tells.cadencePairs)} pairs of consecutive geotech
          invoices on the same record, the later invoice never bills more hours than the business hours elapsed since
          the earlier one. Zero physically impossible cases.`}
        csv={{
          filename: 'fees-geotech-audit.csv',
          data: toCsv(
            ['test', 'geotech', 'drainage_benchmark', 'note'],
            [
              ['whole hour line share pct', geo.tells.wholeGeo, geo.tells.wholeDrain, `SDOT is ${geo.tells.wholeSdot}`],
              ['quarter fraction line share pct', geo.tells.quarterGeo, geo.tells.quarterDrain, `SDOT is ${geo.tells.quarterSdot}`],
              ['minimum charge share of lines pct', geo.tells.minGeo, geo.tells.minDrain, `mechanical is ${geo.tells.minMech}`],
              ['same day identical repeat lines', geo.tells.dupLinesGeo, null, `all disciplines: ${geo.tells.dupLinesAll} lines, $${geo.tells.dupDollarsAll}`],
              ['consecutive invoices exceeding elapsed business hours', geo.tells.cadenceViolations, null, `of ${geo.tells.cadencePairs} pairs`],
              ['share billed on construction (CN) permits pct', geo.tells.cnGeo, geo.tells.cnDrain, 'same permit mix'],
            ],
          ),
        }}
        footnote={`Granularity shares cover metered lines that fit a rate lattice. The minimum share compares
          minimum charge line items with metered lines per discipline; geotech's ECA minimum is half an hour while
          drainage's is a full hour, so its higher share is a pricing artifact, not evidence. Same day repeats are
          identical record, line item, date and amount. The cadence test compares hours on each geotech invoice with
          business hours (eight per weekday) elapsed since the previous geotech invoice on the same record; same day
          follow ups top out at ${fmtH(geo.tells.sameDayMaxHours)} hours. ${PROVENANCE}`}
      >
        <DataTable
          headers={['Test', 'Geotech', 'Drainage', 'Context']}
          rows={[
            ['Lines billed in whole hours', fmtPct(geo.tells.wholeGeo), fmtPct(geo.tells.wholeDrain), `SDOT bills ${fmtPct(geo.tells.wholeSdot)} whole hours`],
            ['Lines using quarter hour fractions', fmtPct(geo.tells.quarterGeo), fmtPct(geo.tells.quarterDrain), `SDOT: ${fmtPct(geo.tells.quarterSdot)}`],
            ['Minimum charges as share of lines', fmtPct(geo.tells.minGeo), fmtPct(geo.tells.minDrain), `Mechanical: ${fmtPct(geo.tells.minMech)}`],
            ['Same day identical repeats', `${fmtInt(geo.tells.dupLinesGeo)} lines, ${fmtMoney(geo.tells.dupDollarsGeo)}`, '', `All disciplines: ${fmtInt(geo.tells.dupLinesAll)} lines, ${fmtMoney(geo.tells.dupDollarsAll)}`],
            ['Invoices outrunning elapsed business hours', fmtInt(geo.tells.cadenceViolations), '', `${fmtInt(geo.tells.cadencePairs)} consecutive pairs tested`],
            ['Share billed on construction permits', fmtPct(geo.tells.cnGeo), fmtPct(geo.tells.cnDrain), 'Same permit type mix'],
          ]}
          wrapCols={[0, 3]}
          caption="Six overbilling tells, geotech against its nearest peer discipline."
        />
      </ChartCard>

      <ChartCard
        title="No reviewer week clears 40 attributed hours"
        desc={`For permits in the plan review dataset, we attributed each hourly line to the named reviewer of that
          discipline on that permit, keeping only lines where exactly one reviewer could own them
          (${fmtInt(rev.uniqLines)} lines, ${fmtInt(rev.uniqHours)} hours). That yields ${fmtInt(rev.reviewerWeeks)}
          reviewer weeks. None reaches 40 attributed hours in a calendar week, across any number of records. The
          busiest week anywhere is ${fmt1(rev.anyPeakWeek)} hours; geotech's peak is ${fmt1(rev.geoPeakWeek)}. Even
          counting every shared permit for every co-reviewer, only ${fmtInt(rev.over40WeeksUpperBound)} weeks nose over
          the line, topping out at ${fmt1(rev.ubMaxHours)} hours, and both involve permits where several reviewers
          shared the discipline.`}
        csv={{
          filename: 'fees-reviewer-attributed-hours.csv',
          data: toCsv(
            ['reviewer', 'discipline', 'attributed_hours', 'records', 'peak_week_hours'],
            rev.dist.map((r) => [r.r, r.disc, r.hours, r.records, r.peakWeek]),
          ),
        }}
        footnote={`Reviewers are anonymized here as R1, R2, and so on, ranked by attributed hours. Coverage is thin by
          construction: the plan review dataset names reviewers on completed permits only, matching
          ${fmtPct(rev.matchedDollarsPct)} of hourly dollars (${fmtInt(rev.matchedLines)} lines);
          ${fmtInt(rev.ambLines)} lines with multiple same discipline reviewers (${fmtInt(rev.ambHours)} hours) are
          excluded from unique attribution. Timing lines up too: ${fmtPct(rev.window.insidePctHours)} of matched hours
          post inside the assignment window and ${fmtPct(rev.window.afterPctHours)} after the last review finished,
          which is billing lag. Only ${fmtPct(rev.window.beforePctHours)} of matched hours
          (${fmtInt(rev.window.beforeLines)} lines, ${fmtMoney(rev.window.beforeDollars)}) post before any same
          discipline reviewer was assigned, a median of ${fmtInt(rev.window.beforeMedianDaysEarly)} days early; worth a
          question, not a scandal. ${PROVENANCE}`}
      >
        <DataTable
          headers={['Reviewer', 'Discipline', 'Attributed hours', 'Records', 'Peak week']}
          rows={rev.dist.map((r) => [r.r, r.disc, fmt1(r.hours), fmtInt(r.records), `${fmt1(r.peakWeek)} h`])}
          caption="The twelve most billed reviewers by uniquely attributed hours, anonymized."
        />
      </ChartCard>

      <div className="caveat">
        <strong>Billed is not worked.</strong> Every hour here is dated by when SDCI posted the invoice line, not when
        a reviewer sat with the plans. The office reconciles in batches, which is what the weekend evening timestamps,
        the {fmtInt(data.mega.batchWeek.hours)} hour week and the {fmtH(data.mega.top[0].hours)} hour line are. That
        cuts both ways: batches can fake a spike, and they can hide one. The reviewer floor comes from a completed
        permits dataset that covers a slice of the work ({fmtPct(rev.matchedDollarsPct)} of hourly dollars), so
        per reviewer figures describe that slice, not whole careers. Amounts are the sum of paid and still owed on each
        line; the extract shows no refunds or write offs. Technology fee surcharge lines are separate line items and
        are not part of the hourly universe. {fmtYear(data.rateCard[6].year)} is partial, through {endDay}. And a fall
        in billed hours is not by itself proof of less
        review: work can shift to flat fee items, which this page does not count.
      </div>

      <RelatedLinks slug="/fees-hours" />
    </>
  );
}
