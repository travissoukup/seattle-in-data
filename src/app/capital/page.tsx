import Link from 'next/link';
import data from '@/lib/generated/capital.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtMoney, fmtMoneyCompact, fmtPct, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

const ID = 'bsgq-948x';
const BUDGET_ID = 'm6va-m4qe';

export const metadata = {
  title: 'Capital budget: two thirds is pipes and power',
  description: `Seattle Public Utilities and City Light take ${fmtPct(data.budget.utilSharePct)} of the city's ${fmtMoneyCompact(data.budget.total)} capital budget for ${data.budget.year}, a year that jumped ${fmtPct(data.budget.jumpPct)} after a two-year dip.`,
};

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
  const trendData = data.trend.map((t) => ({ year: String(t.year), amt: t.amt }));

  const t = data.trend;
  const yr = (back: number) => t[t.length - 1 - back];
  const firstYear = t[0].year;
  const topProject = data.topProjects[0];

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/city-money">City Money</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">City Money</p>
        <h1>Most of Seattle&apos;s building budget is pipes and power</h1>
        <p>
          Seattle Public Utilities and City Light take {fmtPct(data.budget.utilSharePct)} of the city&apos;s{' '}
          {fmtMoneyCompact(data.budget.total)} capital budget for {data.budget.year}, which means most of what the city
          builds is buried under streets or strung overhead, not parks and fire stations. And {data.budget.year} is a big
          year: after slipping to {fmtMoneyCompact(yr(2).amt)} in {yr(2).year} and {fmtMoneyCompact(yr(1).amt)} in{' '}
          {yr(1).year}, the budget jumped {fmtPct(data.budget.jumpPct)}. The single biggest line is the{' '}
          {topProject.title.replace(/Proj\.$/, 'Project')} at {fmtMoneyCompact(topProject.amt)}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Capital budget, {data.budget.year}</div>
          <div className="value">{fmtMoneyCompact(data.budget.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Utilities&apos; share (SPU + City Light)</div>
          <div className="value">{fmtPct(data.budget.utilSharePct)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Jump from {data.budget.prevYear}</div>
          <div className="value">+{fmtPct(data.budget.jumpPct)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Projects on the list</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
      </div>

      <ChartCard
        title={`The capital budget, ${firstYear} to ${data.budget.year}`}
        desc={`Total capital dollars budgeted each fiscal year. The line dipped in ${yr(2).year} and ${yr(1).year}, then jumped ${fmtPct(data.budget.jumpPct)} to ${fmtMoneyCompact(data.budget.total)} for ${data.budget.year}.`}
        csv={{
          filename: 'capital-budget-by-year.csv',
          data: toCsv(['fiscal_year', 'amount', 'budget_lines'], data.trend.map((r) => [r.year, r.amt, r.lines])),
        }}
        footnote={`Each point is a whole adopted budget year, so there are no partial periods to trim. One wrinkle: through ${data.granularityBreak - 1} the dataset itemized thousands of budget lines a year, and from ${data.granularityBreak} on it holds a few hundred consolidated lines. The yearly totals stay continuous; the line-item detail does not.`}
        source={{ id: BUDGET_ID, query: data.queries.trend }}
      >
        <TrendChart
          data={trendData}
          xKey="year"
          series={[{ key: 'amt', name: 'Capital budget' }]}
          valueFormat="money"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title={`The biggest project lines of ${data.budget.year}`}
        desc={`The ten largest budget lines this year. Utility work dominates: ${topProject.title} alone gets ${fmtMoneyCompact(topProject.amt)}, more than most departments' entire capital programs.`}
        csv={{
          filename: 'capital-top-projects.csv',
          data: toCsv(['project', 'department', 'amount'], data.topProjects.map((p) => [p.title, p.dept, p.amt])),
        }}
        footnote="Budget lines summed by project title. Some lines are umbrella programs (a citywide program or an equipment pool) rather than a single build site."
        source={{ id: BUDGET_ID, query: data.queries.topProjects }}
      >
        <DataTable
          headers={['Project', 'Department', `${data.budget.year} budget`]}
          rows={data.topProjects.map((p) => [p.title, p.dept, fmtMoney(p.amt)])}
          wrapCols={[0]}
        />
      </ChartCard>

      <ChartCard
        title="Where the capital dollars go"
        desc={`The ${data.budget.year} capital budget by department. Public Utilities and City Light together hold ${fmtMoneyCompact(data.budget.utilSum)} of the ${fmtMoneyCompact(data.budget.total)} total.`}
        csv={{
          filename: 'capital-budget-by-dept.csv',
          data: toCsv(['department', 'amount'], data.budget.byDept.map((d) => [d.key, d.n])),
        }}
        footnote={`Latest fiscal year, summed by department. Department names are shortened for the axis (Seattle Center keeps its full name).`}
        source={{ id: BUDGET_ID, query: data.queries.byDept }}
      >
        <RankedBars rows={budRows} valueName="Capital budget" valueFormat="money" height={300} />
      </ChartCard>

      <ChartCard
        title="Where the building is happening"
        desc={`Each dot is one capital project from the city's project list that came with a location. Color shows the kind of work. Click a dot for the project name.`}
        footnote={`Only the ${fmtInt(data.mapped)} of ${fmtInt(data.total)} listed projects that carry a map point are shown; citywide programs and multi-site work have no dot. This is the city's current project list, not a history.`}
        source={{ id: ID, query: data.queries.map }}
      >
        <PointMap points={points} legend={legend} height={520} radius={5} />
      </ChartCard>

      <ChartCard
        title="What kind of work it is"
        desc={`Counts cover the ${fmtInt(data.typedCount)} projects (${fmtPct((data.typedCount / data.total) * 100)} of the list) that have a work type filled in. Within that subset, fixing and improving what the city already owns outnumbers new construction. The other ${fmtInt(data.total - data.typedCount)} projects leave the field blank, so the full list could tilt differently.`}
        csv={{ filename: 'capital-by-type.csv', data: toCsv(['work_type', 'projects'], data.byType.map((r) => [r.key, r.n])) }}
        footnote="Grouped by current_phase_type; blank values are excluded from the chart but counted in the totals above."
        source={{ id: ID, query: data.queries.byType }}
      >
        <RankedBars rows={typeRows} valueName="Projects" valueFormat="int" height={260} />
      </ChartCard>

      <div className="caveat">
        <strong>Two datasets sit side by side here, and they don&apos;t join.</strong> The map comes from a list of
        project locations with no dollar amounts, and most of the {fmtInt(data.total)} projects (citywide programs and
        ones with no single address) have no dot. The dollar charts come from the separate capital budget, so you cannot
        trace one dot on the map to one dollar figure. Budget figures are adopted budgets, not actual spending.
      </div>

      <RelatedLinks slug="/capital" />
    </>
  );
}
