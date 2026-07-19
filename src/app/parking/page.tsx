import Link from 'next/link';
import { ChartCard } from '@/components/ChartCard';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { DataTable } from '@/components/DataTable';
import { TrendChart, RankedBars } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import {
  pk,
  baseYear,
  latestYear,
  latestId,
  baseId,
  areaChange,
  weightedRate,
  totalReadings,
  dataYears,
  areaPath,
  hourRows,
  hourlyPivot,
  hourlyDeclineRange,
  hourRate,
  hourChangePct,
  soqlUrl,
  AREA_SELECT,
} from './parking-data';

const pct = (r: number): string => `${Math.round(r * 100)}%`;
const signed = (v: number): string => `${v > 0 ? '+' : ''}${Math.round(v)}%`;
const listJoin = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const change = areaChange();
const commonAreas = new Set(change.map((c) => c.area));
const recovered = change.filter((c) => c.pctChange > 0).map((c) => c.area);
const declined = change.length - recovered.length;
const w2019 = weightedRate(baseYear, commonAreas);
const wLatest = weightedRate(latestYear, commonAreas);

export const metadata = {
  title: 'The Parking Recovery · Exploring Seattle with Data',
  description: `Seattle's paid-parking occupancy fell from ${pct(w2019)} in ${baseYear} to ${pct(wLatest)} in ${latestYear}, and only ${recovered.length} of ${change.length} areas, ${recovered.join(' and ')}, are back above pre-pandemic demand.`,
};

// Marquee areas for the recovery-path lines: the two that came back (downtown
// core) against the neighborhood districts that did not.
const PATH_AREAS = ['Commercial Core', 'Pioneer Square', 'Ballard', 'Capitol Hill', 'Uptown'];

export default function ParkingPage() {
  const worst = change[0];
  const worstStable = change.find((c) => !c.footprintChanged);
  const uptown = change.find((c) => c.area === 'Uptown');
  const expanded = change.filter((c) => c.footprintChanged && c.nRatio > 1).map((c) => c.area);

  const readingsBase = totalReadings(baseYear);
  const readingsLatest = totalReadings(latestYear);
  const readingsPct = Math.round(((readingsLatest - readingsBase) / readingsBase) * 100);
  const occDropPct = Math.round((1 - wLatest / w2019) * 100);

  const changeBars = change.map((c) => ({
    label: c.footprintChanged ? `${c.area} *` : c.area,
    value: Math.round(c.pctChange),
  }));

  const years = dataYears().map(String);
  const pathData = years.map((y) => {
    const o: Record<string, number | string | null> = { year: y };
    for (const a of PATH_AREAS) o[a] = areaPath(a).find((p) => p.year === y)?.rate ?? null;
    return o;
  });

  const hourly = hourlyPivot();
  const ballardDrop = hourlyDeclineRange('Ballard', 11);
  const ballardEveBase = hourRate('Ballard', baseYear, 19);
  const ballardEveLatest = hourRate('Ballard', latestYear, 19);
  const coreMorning = hourChangePct('Commercial Core', 8);

  const tableRows = [...change]
    .sort((a, b) => b.rateLatest - a.rateLatest)
    .map((c) => [
      c.footprintChanged ? `${c.area} *` : c.area,
      pct(c.rateBase),
      pct(c.rateLatest),
      signed(c.pctChange),
      signed((c.nRatio - 1) * 100),
    ]);

  const csv = toCsv(
    ['area', `occupancy_rate_${baseYear}`, `occupancy_rate_${latestYear}`, 'pct_change', 'readings_pct_change'],
    change.map((c) => [c.area, c.rateBase.toFixed(3), c.rateLatest.toFixed(3), Math.round(c.pctChange), Math.round((c.nRatio - 1) * 100)]),
  );
  const hourlyCsv = toCsv(
    ['area', 'year', 'hour', 'occupancy_rate'],
    hourRows().map((r) => [r.area, r.year, r.hour, r.rate.toFixed(3)]),
  );
  const readingsCsv = toCsv(
    ['area', `readings_${baseYear}`, `readings_${latestYear}`, 'pct_change'],
    change.map((c) => [c.area, c.nBase, c.nLatest, Math.round((c.nRatio - 1) * 100)]),
  );

  const areaQuery = soqlUrl(latestId, {
    $select: AREA_SELECT,
    $group: 'paidparkingarea',
    $order: 'n DESC',
    $limit: '200',
  });
  const hourlyQuery = soqlUrl(latestId, {
    $select: 'date_extract_hh(occupancydatetime) AS hh, avg(paidoccupancy) AS occ, avg(parkingspacecount) AS spaces, count(*) AS n',
    $where: "paidparkingarea='Ballard'",
    $group: 'hh',
    $order: 'hh',
    $limit: '30',
  });
  const yearLinks = Object.entries(pk.yearIds)
    .filter(([y]) => dataYears().includes(Number(y)))
    .map(([y, id]) => ({ y, id }));

  return (
    <>
      <p className="crumb"><Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> <Link href="/category/getting-around">Getting Around</Link></p>
      <div className="page-head">
        <p className="eyebrow">Recovery</p>
        <h1>Paid parking came back in {recovered.length} of {change.length} areas. Both are downtown.</h1>
        <p>
          Seattle logs a reading for nearly every metered blockface, nearly every minute: how many paid spaces
          exist and how many are filled. Weighted by those readings, paid occupancy fell from {pct(w2019)} in{' '}
          {baseYear} to {pct(wLatest)} in {latestYear}. {declined} of {change.length} paid-parking areas are
          still below their pre-pandemic level, and the {recovered.length} exceptions,{' '}
          {recovered.join(' and ')}, are the heart of downtown. Pioneer Square now runs busier at the meter than
          it did in {baseYear}.
        </p>
      </div>
      <DataFreshness date={pk.generatedAt} />

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Citywide paid occupancy</div>
          <div className="value">{pct(w2019)} &rarr; {pct(wLatest)}</div>
          <div className="sub">
            Share of paid spaces occupied, {baseYear} versus {latestYear}, weighted by meter readings. Down {occDropPct} percent.
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Areas back above {baseYear}</div>
          <div className="value">{recovered.length} of {change.length}</div>
          <div className="sub">Only {recovered.join(' and ')}, the downtown core, recovered their paid demand.</div>
        </div>
        <div className="stat-card">
          <div className="label">Steepest drop, stable footprint</div>
          <div className="value">{worstStable ? Math.round(worstStable.pctChange) : Math.round(worst.pctChange)}%</div>
          <div className="sub">
            {worstStable?.area}: paid occupancy fell from {pct(worstStable?.rateBase ?? 0)} to {pct(worstStable?.rateLatest ?? 0)} with
            little change in which blocks are metered.
          </div>
        </div>
        <div className="stat-card">
          <div className="label">More meters, fewer payers</div>
          <div className="value">{signed(readingsPct)}</div>
          <div className="sub">
            Meter readings rose from {fmtInt(Math.round(readingsBase / 1e6))}M to {fmtInt(Math.round(readingsLatest / 1e6))}M a year
            while occupancy fell. The paid footprint grew as demand shrank.
          </div>
        </div>
      </div>

      <ChartCard
        title="Paid parking demand fell almost everywhere"
        desc={`Change in average paid-occupancy rate from ${baseYear} to ${latestYear}, by paid-parking area. Bars to the left are declines. ${declined} of ${change.length} areas are down; only ${recovered.join(' and ')}, the heart of downtown, edged back above their pre-pandemic level. Starred areas changed their metered footprint by 15 percent or more, so their bars mix demand with new or removed paid blocks.`}
        csv={{ filename: 'seattle-parking-recovery.csv', data: csv }}
        footnote={
          <>
            Percent change in the mean share of paid spaces occupied, {baseYear} to {latestYear}. Areas marked * saw their
            annual reading count change 15 percent or more between the two years, which signals added or removed paid
            blocks; Uptown&apos;s readings roughly doubled ({signed(((uptown?.nRatio ?? 1) - 1) * 100)}) after new metering
            around Climate Pledge Arena, so its {Math.round(uptown?.pctChange ?? 0)}% is part demand, part footprint.
            The {baseYear} side of every comparison comes from dataset {baseId}.
          </>
        }
        source={{ id: latestId, query: areaQuery }}
      >
        <RankedBars rows={changeBars} valueName={`Change in occupancy, ${baseYear} to ${latestYear}`} valueFormat="pct" height={520} />
      </ChartCard>

      <ChartCard
        title="Downtown recovered. The neighborhoods kept sliding."
        desc={`Average paid-occupancy rate by year for five areas. The downtown core (Commercial Core, Pioneer Square) climbed back, while neighborhood business districts like Ballard, Capitol Hill, and Uptown stayed low through ${latestYear}. The pandemic-trough years 2020 and 2021 are not shown.`}
        footnote={
          <>
            Mean share of paid spaces occupied, by year. Seattle publishes one dataset per year:{' '}
            {yearLinks.map((l, i) => (
              <span key={l.id}>
                {i > 0 ? ', ' : ''}
                <a href={`https://data.seattle.gov/d/${l.id}`} target="_blank" rel="noopener noreferrer">{l.y}</a>
              </span>
            ))}
            . The {new Date(pk.generatedAt).getFullYear()} file is a partial year and is excluded.
          </>
        }
        source={{ id: latestId, query: areaQuery }}
      >
        <TrendChart data={pathData} xKey="year" series={PATH_AREAS.map((a) => ({ key: a, name: a }))} valueFormat="pct" height={340} />
      </ChartCard>

      <ChartCard
        title="Ballard is not down because the commuters left. It is down all day."
        desc={`Occupancy by hour of day, ${baseYear} against ${latestYear}, for Ballard and the Commercial Core. Ballard is down at every metered hour, and by ${Math.round(ballardDrop?.min ?? 0)} to ${Math.round(ballardDrop?.max ?? 0)} percent from 11am through the day's end: its 7pm peak fell from ${pct(ballardEveBase ?? 0)} to ${pct(ballardEveLatest ?? 0)}. A vanished office crowd would dent mornings and leave dinner alone. This decline is flat across the day, which points at habits, prices, or trips that never resumed. The Commercial Core moved the other way: its meters are ${Math.round(coreMorning ?? 0)} percent busier at 8am than they were in ${baseYear}.`}
        csv={{ filename: 'seattle-parking-hourly.csv', data: hourlyCsv }}
        footnote={
          <>
            Mean share of paid spaces occupied by hour (paid hours run 8am to 8pm), computed from every minute-level
            reading in each area and year. {baseYear} hourly figures come from dataset {baseId}.
          </>
        }
        source={{ id: latestId, query: hourlyQuery }}
      >
        <TrendChart
          data={hourly.rows}
          xKey="hour"
          series={hourly.keys.map((k) => ({ key: k, name: k }))}
          valueFormat="pct"
          height={340}
        />
      </ChartCard>

      <ChartCard
        title="The city meters more blocks than it did before the pandemic"
        desc={`Change in annual meter readings by area, ${baseYear} to ${latestYear}. Readings track how many metered spaces exist and how often they report, so big swings mean the paid footprint itself changed. Citywide readings grew ${signed(readingsPct)} while occupancy fell ${occDropPct} percent. ${listJoin(expanded)} expanded the most, which is why their occupancy declines should be read with care.`}
        csv={{ filename: 'seattle-parking-readings.csv', data: readingsCsv }}
        footnote={
          <>
            Percent change in transaction-reading counts per area between the {baseYear} and {latestYear} annual files.
            Readings scale with metered spaces and reporting frequency, not with drivers.
          </>
        }
        source={{ id: latestId, query: areaQuery }}
      >
        <RankedBars
          rows={[...change].sort((a, b) => b.nRatio - a.nRatio).map((c) => ({ label: c.area, value: Math.round((c.nRatio - 1) * 100) }))}
          valueName={`Change in meter readings, ${baseYear} to ${latestYear}`}
          valueFormat="pct"
          height={520}
        />
      </ChartCard>

      <ChartCard
        title={`Every paid-parking area, ${baseYear} to ${latestYear}`}
        desc="Occupancy rate is the average share of paid spaces filled. Sorted by where paid parking is busiest today. The last column shows how much the area's meter-reading count changed, a proxy for added or removed paid blocks; starred areas moved 15 percent or more."
        csv={{ filename: 'seattle-parking-areas.csv', data: csv }}
        footnote={
          <>
            Transaction-level readings aggregated by area and year. Areas metered in only one of the two years, like 15th
            Avenue E, are excluded from the comparison.
          </>
        }
        source={{ id: latestId, query: areaQuery }}
      >
        <DataTable
          headers={['Area', `${baseYear} occupancy`, `${latestYear} occupancy`, 'Change', 'Readings change']}
          rows={tableRows}
        />
      </ChartCard>

      <div className="card" style={{ borderLeft: '4px solid var(--accent-2)' }}>
        <h2 className="section-title">How to read this</h2>
        <p className="muted" style={{ margin: 0 }}>
          This is <strong>paid on-street parking only</strong>, not every car on the street. Occupancy is shaped
          partly by demand and partly by policy: Seattle adjusts meter rates by block to chase a target
          occupancy, and the set of paid blocks changes over time. Uptown and Green Lake gained metered blocks
          after {baseYear}, so their declines mix softer demand with a bigger denominator; the starred rows
          above flag every area like that. The comparison is pre-pandemic {baseYear} against the recovery
          years. The 2020 and 2021 trough is omitted on purpose, and the current partial year is excluded. Even
          with those caveats the divergence holds: {latestYear - baseYear} years on, the downtown core has its paid drivers back,
          and the neighborhood districts do not.
        </p>
      </div>

      <RelatedLinks slug="/parking" />
    </>
  );
}
