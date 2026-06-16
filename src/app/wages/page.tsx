import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { BarsChart, RankedBars } from '@/components/charts';
import { wages } from '@/lib/data';
import { fmtInt, num, toCsv } from '@/lib/format';

export const metadata = { title: 'What Seattle Pays · Exploring Seattle with Data' };

const money = (v: number | null | undefined): string => {
  const x = num(v);
  return x === null ? '–' : `$${x.toFixed(2)}`;
};
const annual = (hourly: number): string => `$${Math.round((hourly * 2080) / 1000)}k/yr`;

export default function WagesPage() {
  const s = wages.summary;
  const deptBars = wages.byDept.slice(0, 16).map((d) => ({ label: d.department.replace(/^Seattle /, ''), value: d.median }));
  const distBars = wages.dist.map((d) => ({ label: d.label, value: d.n }));
  const deptCsv = toCsv(
    ['department', 'employees', 'median_hourly', 'p90_hourly'],
    wages.byDept.map((d) => [d.department, d.n, d.median, d.p90]),
  );
  const titleCsv = toCsv(['job_title', 'employees', 'median_hourly'], wages.topTitles.map((t) => [t.title, t.n, t.median]));

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Accountability</p>
        <h1>What Seattle pays its workforce</h1>
        <p>
          The city publishes the hourly pay rate of every employee, by name, title, and department. It is a
          rare clear look at how a public payroll is structured: the spread from the lowest to the highest
          rung, and which departments pay near the top of the scale. One honest caveat up front, because it
          reshapes the story.
        </p>
      </div>

      <div className="card" style={{ borderLeft: '4px solid var(--accent-2)' }}>
        <h2 className="section-title">Rates, not paychecks (and why that matters)</h2>
        <p className="muted" style={{ margin: 0 }}>
          This dataset is hourly <strong>rates</strong> only: it has no overtime and no actual earnings. So the
          classic story, the officer or transit worker who doubles base pay through overtime, and whether
          overtime is quietly load-bearing for staffing, <strong>cannot be told from open data</strong>. That
          requires actual payroll records, obtainable through a public-records request. What follows is the pay
          structure: the rungs, the spread, and where the high rates sit.
        </p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Median hourly rate</div>
          <div className="value">{money(s.median)}</div>
          <div className="sub">About {annual(s.median)} at full time, across {fmtInt(s.n)} employees.</div>
        </div>
        <div className="stat-card">
          <div className="label">90th percentile</div>
          <div className="value">{money(s.p90)}</div>
          <div className="sub">{annual(s.p90)}. One in ten city workers is paid at least this.</div>
        </div>
        <div className="stat-card">
          <div className="label">Top rate</div>
          <div className="value">{money(s.max)}</div>
          <div className="sub">{annual(s.max)}. The highest single rate on the payroll.</div>
        </div>
        <div className="stat-card">
          <div className="label">Top-to-median spread</div>
          <div className="value">{(s.max / s.median).toFixed(1)}x</div>
          <div className="sub">The top rate is this many times the median rate.</div>
        </div>
      </div>

      <ChartCard
        title="Which departments pay near the top"
        desc="Median hourly rate by department. The utilities and public-safety departments sit well above the parks and library staff, reflecting their mix of engineers, officers, and skilled trades."
        csv={{ filename: 'seattle-wages-by-department.csv', data: deptCsv }}
        footnote="Median hourly rate among employees in each department (departments with at least 25 employees). Source: City of Seattle Wage Data (2khk-5ukd)."
      >
        <RankedBars rows={deptBars} valueName="Median hourly rate" valueFormat="money" height={400} />
      </ChartCard>

      <ChartCard
        title="The best-paid roles"
        desc="Job titles with the highest median hourly rate (at least ten people in the title). Executives and senior legal, medical, and engineering staff top the scale."
        csv={{ filename: 'seattle-top-paid-titles.csv', data: titleCsv }}
        footnote="Median hourly rate by job title, titles with 10 or more employees. Source: City of Seattle Wage Data (2khk-5ukd)."
      >
        <DataTable
          headers={['Job title', 'Employees', 'Median hourly', 'Approx. annual']}
          rows={wages.topTitles.map((t) => [t.title, fmtInt(t.n), money(t.median), annual(t.median)])}
        />
      </ChartCard>

      <ChartCard
        title="How the payroll is distributed"
        desc="City employees by hourly-rate band. Most of the workforce sits in the $40 to $70 range; the long tail above $90 is the professional and executive core."
        footnote="Count of employees in each hourly-rate band. Source: City of Seattle Wage Data (2khk-5ukd)."
      >
        <BarsChart data={distBars} xKey="label" series={[{ key: 'value', name: 'Employees' }]} valueFormat="int" height={300} />
      </ChartCard>
    </>
  );
}
