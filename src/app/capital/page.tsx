import Link from 'next/link';
import data from '@/lib/generated/capital.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars } from '@/components/charts';
import { fmtInt, fmtMoney, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'What the city is building | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function CapitalPage() {
  const top5 = data.byType.slice(0, 5).map((t) => t.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.d}</strong><br/>${p.t}`,
  }));
  const legend = [
    ...top5.map((t, i) => ({ label: t, color: PALETTE[i] })),
    { label: 'Everything else', color: GRAY },
  ];

  const typeRows = data.byType.map((t) => ({ label: t.key, value: t.n }));
  const budRows = data.budget.byDept.map((d) => ({ label: d.key, value: d.n }));

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/city-money">City Money</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">City Money</p>
        <h1>What the city is building</h1>
        <p>
          Seattle keeps a list of its capital projects, the bricks-and-mortar work like new parks, fire stations, and
          rebuilt utilities. There are {fmtInt(data.total)} projects on the list, and the city&apos;s capital budget for{' '}
          {data.budget.year} runs to {fmtMoney(data.budget.total)}. The map shows the {fmtInt(data.mapped)} projects
          that come with a location. The chart below shows where the dollars go.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Projects on the list</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Projects with a location</div>
          <div className="value">{fmtInt(data.mapped)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Capital budget, {data.budget.year}</div>
          <div className="value">{fmtMoney(data.budget.total)}</div>
        </div>
      </div>

      <ChartCard
        title="Where the building is happening"
        desc="Each dot is one capital project that came with a location. Color shows the kind of work. Click a dot for the project name."
        footnote="Source: Open Budget Capital Projects (bsgq-948x) on data.seattle.gov. Only the projects that carry a map point are shown. The map shows the most recent records that had coordinates, not the full history."
      >
        <PointMap points={points} legend={legend} height={520} radius={5} />
      </ChartCard>

      <ChartCard
        title="What kind of work it is"
        desc="Counts cover the projects that have a work type filled in. Most are fixing or improving things the city already owns, not building new."
        csv={{ filename: 'capital-by-type.csv', data: toCsv(['work_type', 'projects'], data.byType.map((t) => [t.key, t.n])) }}
        footnote="Source: Open Budget Capital Projects (bsgq-948x)."
      >
        <RankedBars rows={typeRows} valueName="Projects" valueFormat="int" height={260} />
      </ChartCard>

      <ChartCard
        title="Where the capital dollars go"
        desc={`The ${data.budget.year} capital budget, by department. Utilities and City Light run the biggest capital programs, mostly pipes, power, and roads.`}
        csv={{ filename: 'capital-budget-by-dept.csv', data: toCsv(['department', 'amount'], data.budget.byDept.map((d) => [d.key, d.n])) }}
        footnote="Source: Capital Budget (m6va-m4qe) on data.seattle.gov. Latest fiscal year, summed by department."
      >
        <RankedBars rows={budRows} valueName="Capital budget" valueFormat="money" height={300} />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> Two separate datasets sit side by side here. The map is a
        list of project locations with no dollar amounts, and most of the {fmtInt(data.total)} projects (citywide programs
        and ones with no single address) have no dot. The chart is the separate capital budget, summed by department, so
        you cannot trace one dot on the map to one dollar figure.
      </div>

      <RelatedLinks slug="/capital" />
    </>
  );
}
