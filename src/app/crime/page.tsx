import Link from 'next/link';
import data from '@/lib/generated/crime.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';

export const metadata = { title: 'Reported crime | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function CrimePage() {
  const top5 = data.byCategory.slice(0, 5).map((c) => c.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.o}</strong><br/>${p.t} crime<br/>${p.d}`,
  }));
  const legend = [
    ...top5.map((t, i) => ({ label: t, color: PALETTE[i] })),
    { label: 'Other', color: GRAY },
  ];

  const offenseRows = data.topOffenses.map((o) => ({ label: o.key, value: o.n }));
  const yearly = data.yearly;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>Reported crime</h1>
        <p>
          Seattle police log every crime report into one big file. It goes back years and holds{' '}
          {fmtInt(data.total)} records. Over the last 12 months people reported about {fmtInt(data.last12)} crimes
          across {fmtInt(data.neighborhoods)} neighborhoods. Most of it is property crime, like theft and break-ins,
          not crime against a person.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Reports in the last 12 months</div>
          <div className="value">{fmtInt(data.last12)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Most common kind</div>
          <div className="value" style={{ fontSize: 20 }}>{data.topCategory} crime</div>
        </div>
        <div className="stat-card">
          <div className="label">Neighborhoods covered</div>
          <div className="value">{fmtInt(data.neighborhoods)}</div>
        </div>
      </div>

      <ChartCard
        title="The most recent reports, mapped"
        desc="Each dot is one crime report. Color shows whether it was against a person, property, or society (things like drugs or weapons). Click a dot for the offense and date."
        footnote="Source: SPD Crime Data (tazs-3rd5) on data.seattle.gov. The map shows the newest reports that came with map coordinates. Some reports have no location and are left off."
      >
        <PointMap points={points} legend={legend} height={520} radius={3} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">Type your ZIP or neighborhood to see how it stacks up, by count and per resident.</p>
      </div>
      <AreaCompare data={data.areaByZip} unit="crime reports" />

      <ChartCard
        title="What gets reported most"
        desc="The top offense groups over the last 12 months. Theft leads by a wide margin."
        csv={{
          filename: 'crime-by-offense.csv',
          data: toCsv(['offense', 'reports_last_12_months'], data.topOffenses.map((o) => [o.key, o.n])),
        }}
        footnote="Source: SPD Crime Data (tazs-3rd5). Counts cover reports from the last 12 months. Placeholder and catch-all labels are dropped."
      >
        <RankedBars rows={offenseRows} valueName="Reports" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Reports per year"
        desc="How many crimes got reported each year. 2026 is left off because the year is not done."
        footnote="Source: SPD Crime Data (tazs-3rd5). Years run 2012 through 2025. A report can be filed long after the crime happened, so older years can keep growing a little."
      >
        <TrendChart
          data={yearly}
          xKey="y"
          series={[{ key: 'n', name: 'Reports' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> These are crimes reported to police, not all crime.
        Plenty of crime never gets reported, and what does get reported depends on who calls and how police record it.
        Where you see more dots can mean more reporting or more patrols as much as more crime. A report is not the same
        as a charge or a conviction.
      </div>

      <RelatedLinks slug="/crime" />
    </>
  );
}
