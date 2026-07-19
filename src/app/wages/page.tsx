import Link from 'next/link';
import { ChartCard } from '@/components/ChartCard';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { DataTable } from '@/components/DataTable';
import { BarsChart, RankedBars } from '@/components/charts';
import { wages } from '@/lib/data';
import { fmtInt, num, toCsv } from '@/lib/format';

const money = (v: number | null | undefined): string => {
  const x = num(v);
  return x === null ? 'n/a' : `$${x.toFixed(2)}`;
};
const annual = (hourly: number): string => `$${Math.round((hourly * 2080) / 1000)}k/yr`;

const DATASET = '2khk-5ukd';
const soqlUrl = (params: Record<string, string>): string =>
  `https://data.seattle.gov/resource/${DATASET}.json?${new URLSearchParams(params).toString()}`;

const shortDept = (d: string): string =>
  d
    .replace(/^Seattle Department of /, '')
    .replace(/^Seattle /, '')
    .replace(/ Department$/, '')
    .replace('Parks and Recreation', 'Parks & Rec')
    .replace('Finance and Administrative Service', 'Finance & Admin')
    .replace('Information Technology', 'IT')
    .replace('Construction and Inspections', 'Construction & Insp.');

const lifeguard = wages.commonTitles[0];
const patrol = wages.commonTitles.find((t) => t.title.startsWith('Police Officer-Patrol')) ?? wages.commonTitles[1];
const parks = wages.bigDepts[0];
const cityLight = wages.bigDepts.find((d) => d.department.includes('City Light')) ?? wages.bigDepts[1];
const firefighter = wages.commonTitles.find((t) => t.title.includes('90.46'));

export const metadata = {
  title: 'What Seattle Pays · Exploring Seattle with Data',
  description: `The most common job on Seattle's city payroll is ${lifeguard.title.toLowerCase()} (${lifeguard.n} people at $${lifeguard.avg.toFixed(2)}/hr), just ahead of patrol officers at $${patrol.avg.toFixed(2)}/hr.`,
};

export default function WagesPage() {
  const s = wages.summary;
  const deptBars = wages.byDept.slice(0, 16).map((d) => ({ label: shortDept(d.department), value: d.median }));
  const bigDeptBars = wages.bigDepts.map((d) => ({ label: `${shortDept(d.department)} (${fmtInt(d.n)})`, value: d.avg }));
  const distBars = wages.dist.map((d) => ({ label: d.label, value: d.n }));
  const deptCsv = toCsv(
    ['department', 'employees', 'median_hourly', 'p90_hourly'],
    wages.byDept.map((d) => [d.department, d.n, d.median, d.p90]),
  );
  const bigDeptCsv = toCsv(
    ['department', 'employees', 'avg_hourly'],
    wages.bigDepts.map((d) => [d.department, d.n, d.avg]),
  );
  const titleCsv = toCsv(
    ['job_title', 'employees', 'median_hourly'],
    wages.topTitles.map((t) => [t.title, t.n, t.median]),
  );
  const allTitlesCsv = toCsv(
    ['job_title', 'employees', 'avg_hourly', 'median_hourly'],
    wages.allTitles.map((t) => [t.title, t.n, t.avg, t.median]),
  );
  const bottomCsv = toCsv(
    ['job_title', 'employees', 'avg_hourly'],
    wages.bottomTitles.map((t) => [t.title, t.n, t.avg]),
  );
  const distCsv = toCsv(['hourly_rate_band', 'employees'], wages.dist.map((d) => [d.label, d.n]));

  return (
    <>
      <p className="crumb"><Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> <Link href="/category/city-money">City Money</Link></p>
      <div className="page-head">
        <p className="eyebrow">Accountability</p>
        <h1>Seattle&apos;s most common city job is {lifeguard.title.toLowerCase()}, at {money(lifeguard.avg)} an hour</h1>
        <p>
          The city publishes the hourly pay rate of every employee, by name, title, and department. Count
          heads and the picture is surprising: {fmtInt(lifeguard.n)} lifeguards edge out {fmtInt(patrol.n)} patrol
          officers as the single biggest job, and the officers are paid {(patrol.avg / lifeguard.avg).toFixed(1)}x
          as much per hour. The same split runs through whole departments. Parks and Recreation is the
          city&apos;s largest employer at {fmtInt(parks.n)} people, and its average rate of {money(parks.avg)} is
          barely more than half of City Light&apos;s {money(cityLight.avg)}. One thing to know up front, because
          it changes how you should read every number here.
        </p>
      </div>

      <DataFreshness date={wages.generatedAt} />

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
          <div className="label">Paid below minimum wage</div>
          <div className="value">{fmtInt(s.belowMinWage)}</div>
          <div className="sub">
            Employees below Seattle&apos;s {money(s.minWage)} minimum wage. The lowest rate on the books is {money(s.min)}.
          </div>
        </div>
      </div>

      <ChartCard
        title="The jobs the city actually runs on"
        desc={
          <>
            The ten most common job titles. {lifeguard.title} is #1 by headcount at an
            average {money(lifeguard.avg)}, one rung above patrol officers at {money(patrol.avg)}. The
            download has all {fmtInt(wages.allTitles.length)} titles.
          </>
        }
        csv={{ filename: 'seattle-all-job-titles.csv', data: allTitlesCsv }}
        footnote={
          <>
            Headcount and average hourly rate by exact job title. Fire titles encode their schedule in the
            name{firefighter ? <> ({firefighter.title} works a 90.46-hour biweekly cycle, not 80)</> : null}, so
            hourly rates across titles are not directly comparable as annual pay. The CSV includes every
            distinct title with headcount, average, and median.
          </>
        }
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'job_title, count(*) as employees, avg(hourly_rate) as avg_hourly',
            $group: 'job_title',
            $order: 'employees desc',
            $limit: '10',
          }),
        }}
      >
        <DataTable
          headers={['Job title', 'Employees', 'Avg hourly']}
          rows={wages.commonTitles.map((t) => [t.title, fmtInt(t.n), money(t.avg)])}
        />
      </ChartCard>

      <ChartCard
        title="The biggest departments are not the best paid"
        desc={
          <>
            Average hourly rate for every department with 400 or more employees, ordered by headcount
            (in parentheses). Parks &amp; Rec is the largest at {fmtInt(parks.n)} people and the cheapest big
            department at {money(parks.avg)}; City Light averages {money(cityLight.avg)} with a workforce
            nearly as large.
          </>
        }
        csv={{ filename: 'seattle-big-departments-pay.csv', data: bigDeptCsv }}
        footnote="Average hourly rate among all employees in each department with at least 400 people; bars are ordered by headcount, not pay."
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'department, count(*) as employees, avg(hourly_rate) as avg_hourly',
            $group: 'department',
            $having: 'count(*) >= 400',
            $order: 'employees desc',
          }),
        }}
      >
        <RankedBars rows={bigDeptBars} valueName="Average hourly rate" valueFormat="money" height={400} />
      </ChartCard>

      <ChartCard
        title="Which departments pay near the top"
        desc={
          <>
            Median hourly rate by department. {wages.byDept[0].department} leads,
            with {wages.byDept[1].department} second; police and the utilities sit close behind, ahead of
            parks and library staff.
          </>
        }
        csv={{ filename: 'seattle-wages-by-department.csv', data: deptCsv }}
        footnote="Median hourly rate among employees in each department (departments with at least 25 employees). Medians are computed from the full row-level export; Socrata's query language has no median aggregate, so there is no one-click query for this chart."
        source={{ id: DATASET }}
      >
        <RankedBars rows={deptBars} valueName="Median hourly rate" valueFormat="money" height={400} />
      </ChartCard>

      <ChartCard
        title="The best-paid roles"
        desc="Job titles with the highest median hourly rate (at least ten people in the title). Executives and senior legal, medical, and engineering staff top the scale."
        csv={{ filename: 'seattle-top-paid-titles.csv', data: titleCsv }}
        footnote="Median hourly rate by job title, titles with 10 or more employees. The annual column assumes a 2,080-hour year; uniformed schedules differ, so treat it as a rough full-time equivalent."
        source={{ id: DATASET }}
      >
        <DataTable
          headers={['Job title', 'Employees', 'Median hourly', 'Approx. annual']}
          rows={wages.topTitles.map((t) => [t.title, fmtInt(t.n), money(t.median), annual(t.median)])}
        />
      </ChartCard>

      <ChartCard
        title="The bottom of the ladder"
        desc={
          <>
            The lowest-paid titles with ten or more people. Interns and work-training enrollees sit at the
            floor of {money(wages.bottomTitles[0].avg)}, and nobody in the dataset is below the
            city&apos;s {money(s.minWage)} minimum wage. The wage floor holds.
          </>
        }
        csv={{ filename: 'seattle-lowest-paid-titles.csv', data: bottomCsv }}
        footnote="Average hourly rate by job title, titles with 10 or more employees, lowest first. The minimum-wage check counts rows with a rate below Seattle's citywide minimum; it returns zero."
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'job_title, count(*) as employees, avg(hourly_rate) as avg_hourly',
            $group: 'job_title',
            $having: 'count(*) >= 10',
            $order: 'avg_hourly asc',
            $limit: '10',
          }),
        }}
      >
        <DataTable
          headers={['Job title', 'Employees', 'Avg hourly']}
          rows={wages.bottomTitles.map((t) => [t.title, fmtInt(t.n), money(t.avg)])}
        />
      </ChartCard>

      <ChartCard
        title="How the payroll is distributed"
        desc="City employees by hourly-rate band. Most of the workforce sits in the $40 to $70 range; the long tail above $90 is the professional and executive core."
        csv={{ filename: 'seattle-wage-distribution.csv', data: distCsv }}
        footnote="Count of employees in each hourly-rate band, from the full row-level export."
        source={{ id: DATASET }}
      >
        <BarsChart data={distBars} xKey="label" series={[{ key: 'value', name: 'Employees' }]} valueFormat="int" height={300} />
      </ChartCard>

      <RelatedLinks slug="/wages" />
    </>
  );
}
