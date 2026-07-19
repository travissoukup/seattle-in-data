import Link from 'next/link';
import { ChartCard } from '@/components/ChartCard';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { DataTable } from '@/components/DataTable';
import { TrendChart, RankedBars } from '@/components/charts';
import { parking, parkingChange, parkingPath } from '@/lib/data';
import { toCsv } from '@/lib/format';

export const metadata = { title: 'The Parking Recovery · Exploring Seattle with Data' };

const pct = (r: number): string => `${Math.round(r * 100)}%`;

// Marquee areas for the recovery-path lines: the two that came back (downtown
// core) against the neighborhood districts that did not.
const PATH_AREAS = ['Commercial Core', 'Pioneer Square', 'Ballard', 'Capitol Hill', 'Uptown'];

export default function ParkingPage() {
  const change = parkingChange();
  const mean2019 = change.reduce((s, c) => s + c.rate2019, 0) / change.length;
  const mean2024 = change.reduce((s, c) => s + c.rate2024, 0) / change.length;
  const recovered = change.filter((c) => c.pctChange > 0).map((c) => c.area);
  const worst = change[0];

  const changeBars = change.map((c) => ({ label: c.area, value: Math.round(c.pctChange) }));

  const years = ['2019', '2022', '2023', '2024'];
  const pathData = years.map((y) => {
    const o: Record<string, number | string | null> = { year: y };
    for (const a of PATH_AREAS) o[a] = parkingPath(a).find((p) => p.year === y)?.rate ?? null;
    return o;
  });

  const tableRows = [...change]
    .sort((a, b) => b.rate2024 - a.rate2024)
    .map((c) => [c.area, pct(c.rate2019), pct(c.rate2024), `${c.pctChange > 0 ? '+' : ''}${Math.round(c.pctChange)}%`]);
  const csv = toCsv(
    ['area', 'occupancy_rate_2019', 'occupancy_rate_2024', 'pct_change'],
    change.map((c) => [c.area, c.rate2019.toFixed(3), c.rate2024.toFixed(3), Math.round(c.pctChange)]),
  );

  return (
    <>
      <p className="crumb"><Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> <Link href="/category/getting-around">Getting Around</Link></p>
      <div className="page-head">
        <p className="eyebrow">Recovery</p>
        <h1>The cars came back downtown. The meters didn&apos;t.</h1>
        <p>
          Seattle records every paid on-street parking transaction, millions a year, with the blockface and how
          full it was. It is the closest thing the city has to a pulse of who is driving in and paying to
          park. Comparing 2019 with 2024 turns up a result that inverts the usual story: paid parking demand is
          down almost everywhere, and the only corners that recovered to pre-pandemic levels are the dense
          downtown core.
        </p>
      </div>
      <DataFreshness date={parking.generatedAt} />

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Citywide paid occupancy</div>
          <div className="value">{pct(mean2019)} &rarr; {pct(mean2024)}</div>
          <div className="sub">Average share of paid spaces occupied, 2019 versus 2024. Down about a third.</div>
        </div>
        <div className="stat-card">
          <div className="label">Areas back above 2019</div>
          <div className="value">{recovered.length} of {change.length}</div>
          <div className="sub">Only {recovered.join(' and ')}, the downtown core, recovered their paid demand.</div>
        </div>
        <div className="stat-card">
          <div className="label">Steepest decline</div>
          <div className="value">{Math.round(worst.pctChange)}%</div>
          <div className="sub">{worst.area}: paid occupancy fell from {pct(worst.rate2019)} to {pct(worst.rate2024)}.</div>
        </div>
        <div className="stat-card">
          <div className="label">Neighborhood districts</div>
          <div className="value">Down hard</div>
          <div className="sub">Ballard, Roosevelt, Uptown, and Green Lake all lost a third or more of paid demand.</div>
        </div>
      </div>

      <ChartCard
        title="Paid parking demand fell almost everywhere"
        desc="Change in average paid-occupancy rate from 2019 to 2024, by paid-parking area. Bars to the left are declines. Eighteen of twenty areas are down; only the Commercial Core and Pioneer Square, the heart of downtown, edged back above their pre-pandemic level."
        csv={{ filename: 'seattle-parking-recovery.csv', data: csv }}
        footnote="Percent change in the mean share of paid spaces occupied, 2019 to 2024. Source: City of Seattle Paid Parking Occupancy."
      >
        <RankedBars rows={changeBars} valueName="Change in occupancy, 2019 to 2024" valueFormat="pct" height={520} />
      </ChartCard>

      <ChartCard
        title="Downtown recovered. The neighborhoods kept sliding."
        desc="Average paid-occupancy rate by year for five areas. The downtown core (Commercial Core, Pioneer Square) climbed back, while neighborhood business districts like Ballard, Capitol Hill, and Uptown kept softening through 2024. The pandemic-trough years 2020 and 2021 are not shown."
        footnote="Mean share of paid spaces occupied, by year. Source: City of Seattle Paid Parking Occupancy."
      >
        <TrendChart data={pathData} xKey="year" series={PATH_AREAS.map((a) => ({ key: a, name: a }))} valueFormat="pct" height={340} />
      </ChartCard>

      <ChartCard
        title="Every paid-parking area, 2019 to 2024"
        desc="Occupancy rate is the average share of paid spaces filled. Sorted by where paid parking is busiest today."
        footnote="Source: City of Seattle Paid Parking Occupancy, transaction-level readings aggregated by area and year."
      >
        <DataTable headers={['Area', '2019 occupancy', '2024 occupancy', 'Change']} rows={tableRows} />
      </ChartCard>

      <div className="card" style={{ borderLeft: '4px solid var(--accent-2)' }}>
        <h2 className="section-title">How to read this</h2>
        <p className="muted" style={{ margin: 0 }}>
          This is <strong>paid on-street parking only</strong>, not every car on the street. Occupancy is shaped
          partly by demand and partly by policy: Seattle adjusts meter rates by block to chase a target
          occupancy, raising prices where demand is high and cutting them where it is low, and the set of paid
          blocks changes over time. So a falling rate reflects both softer demand and deliberate pricing. The
          comparison is pre-pandemic 2019 against the recovery years; 2020 and 2021 are omitted. Even so, the
          divergence is the story: four years on, the downtown core has its paid drivers back, and the
          neighborhood districts do not.
        </p>
      </div>

      <RelatedLinks slug="/parking" />
    </>
  );
}
