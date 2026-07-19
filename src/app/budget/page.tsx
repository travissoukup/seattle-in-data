import Link from 'next/link';
import data from '@/lib/generated/budget.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmt1, fmtInt, fmtMoney, fmtMoneyCompact, fmtPct, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = {
  title: 'Where the money goes',
  description: `Seattle's ${data.year} budget is ${fmtMoneyCompact(data.total)}, but only ${fmtMoneyCompact(
    data.generalFund,
  )} of it sits in the General Fund the council can freely steer; police funding is at a record and housing has grown ${fmt1(
    data.housing.times,
  )}x since ${data.firstYear}.`,
};

/** Full Socrata resource URL reproducing a chart's aggregate query. */
const soqlUrl = (id: string, params: Record<string, string>) =>
  `https://data.seattle.gov/resource/${id}.json?${new URLSearchParams(params).toString()}`;

const BUDGET = '8u2j-imqx';
const ARC_DEPTS = ['Seattle Police Department', 'Human Services Department', 'Office of Housing'];

export default function BudgetPage() {
  const deptRows = data.topDepts.map((d) => ({ label: d.key, value: d.total }));
  const fundRows = data.topFunds.map((f) => ({ label: f.key, value: f.total }));
  const yearRows = data.byYear.map((r) => ({ y: r.y, total: r.total }));
  const changeRows = data.deptChangeTop.map((d) => ({ label: d.dept, value: d.pct }));
  const biggest = data.topDepts[0];
  const span = data.year - data.firstYear;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/city-money">City Money</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">City Money</p>
        <h1>
          The council really steers {fmtMoneyCompact(data.generalFund)} of Seattle&apos;s{' '}
          {fmtMoneyCompact(data.total)} budget
        </h1>
        <p>
          Seattle adopted a {fmtMoney(data.total)} operating budget for {data.year}, about{' '}
          {fmtMoney(data.perResident)} per resident. Most of that money is spoken for before anyone votes. Only{' '}
          {fmtMoneyCompact(data.generalFund)}, {fmtPct(data.gfShare)} of the total, sits in the General Fund the
          council can move around. The rest is mostly ratepayer money for the utilities, led by {biggest?.key} at{' '}
          {fmtMoneyCompact(biggest?.total ?? 0)}, plus funds the law has already earmarked.
        </p>
        <p>
          The last {fmtInt(span)} years also tell a clear story about priorities. Police spending was cut after{' '}
          {data.spd.peakYear}, bottomed out in {data.spd.troughYear}, and now sits at{' '}
          {data.spd.isRecord ? 'a record ' : ''}
          {fmtMoneyCompact(data.spd.latest)}. The Office of Housing budget is {fmt1(data.housing.times)} times what
          it was in {data.firstYear}. Human services grew {fmtPct(data.hsd.pct)}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total budget, {data.year}</div>
          <div className="value">{fmtMoneyCompact(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">General Fund share</div>
          <div className="value">{fmtPct(data.gfShare)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Per resident</div>
          <div className="value">{fmtMoney(data.perResident)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Departments</div>
          <div className="value">{fmtInt(data.deptCount)}</div>
        </div>
      </div>

      <ChartCard
        title={`The biggest funds, ${data.year}`}
        desc={`Where the dollars legally sit. The General Fund, ${fmtMoneyCompact(
          data.generalFund,
        )}, is the flexible part. Nearly everything else is utility ratepayer money or a fund dedicated to one purpose, like the payroll tax or the housing levy.`}
        csv={{
          filename: 'budget-by-fund.csv',
          data: toCsv(['fund_type', 'approved_amount'], data.topFunds.map((f) => [f.key, f.total])),
        }}
        footnote={`Approved amounts grouped by fund type for fiscal ${data.year}; the ten largest funds are shown and funds with zero approved dollars are dropped.`}
        source={{
          id: BUDGET,
          query: soqlUrl(BUDGET, {
            $select: 'fund_type, sum(approved_amount) as total',
            $where: `fiscal_year = ${data.year}`,
            $group: 'fund_type',
            $order: 'total DESC',
          }),
        }}
      >
        <RankedBars rows={fundRows} valueName="Approved budget" valueFormat="money" height={380} />
      </ChartCard>

      <ChartCard
        title={`Top departments by budget, ${data.year}`}
        desc={`The twelve departments with the most money. The two utilities top the list because residents pay them through bills, not just taxes. And the Human Resources bar is not what it looks like: ${fmtMoneyCompact(
          data.hrHealthCare,
        )} of its ${fmtMoneyCompact(
          data.hrTotal,
        )} is the citywide employee health care fund, and another ${fmtMoneyCompact(
          data.hrIndustrial,
        )} is industrial insurance. The department's own operations fit inside the remaining ${fmtMoneyCompact(
          data.hrOther,
        )}.`}
        csv={{
          filename: 'budget-by-department.csv',
          data: toCsv(['department', 'approved_amount'], data.byDept.map((d) => [d.key, d.total])),
        }}
        footnote={`Approved dollars for each department in fiscal ${data.year}. The ${data.hrDept} figure bundles citywide benefits funds with the department's own budget; the split comes from the dataset's program column.`}
        source={{
          id: BUDGET,
          query: soqlUrl(BUDGET, {
            $select: 'department, sum(approved_amount) as total',
            $where: `fiscal_year = ${data.year}`,
            $group: 'department',
            $order: 'total DESC',
          }),
        }}
      >
        <RankedBars rows={deptRows} valueName="Approved budget" valueFormat="money" height={420} />
      </ChartCard>

      <ChartCard
        title={`Police, human services, and housing since ${data.firstYear}`}
        desc={`Three arcs. Police fell from ${fmtMoneyCompact(data.spd.peak)} in ${
          data.spd.peakYear
        } to ${fmtMoneyCompact(data.spd.trough)} in ${data.spd.troughYear}, then climbed every year to ${
          data.spd.isRecord ? 'a record ' : ''
        }${fmtMoneyCompact(data.spd.latest)}, up ${fmtPct(data.spd.reboundPct)} from the low. Human services went from ${fmtMoneyCompact(
          data.hsd.first,
        )} to ${fmtMoneyCompact(data.hsd.latest)}. Housing's line is jumpy because levy dollars land in uneven chunks, but the direction is plain: ${fmtMoneyCompact(
          data.housing.first,
        )} then, ${fmtMoneyCompact(data.housing.latest)} now.`}
        csv={{
          filename: 'budget-three-departments.csv',
          data: toCsv(
            ['fiscal_year', 'police', 'human_services', 'office_of_housing'],
            data.arcByYear.map((r) => [r.y, r.spd, r.hsd, r.housing]),
          ),
        }}
        footnote="Approved dollars per fiscal year for the three named departments."
        source={{
          id: BUDGET,
          query: soqlUrl(BUDGET, {
            $select: 'department, fiscal_year, sum(approved_amount) as total',
            $where: `department in('${ARC_DEPTS.join("','")}')`,
            $group: 'department, fiscal_year',
            $order: 'department, fiscal_year',
          }),
        }}
      >
        <TrendChart
          data={data.arcByYear}
          xKey="y"
          series={[
            { key: 'spd', name: 'Police' },
            { key: 'hsd', name: 'Human Services' },
            { key: 'housing', name: 'Office of Housing' },
          ]}
          valueFormat="money"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title={`Fastest-growing departments, ${data.firstYear} to ${data.year}`}
        desc={`Percent change in approved budget over the full span of the dataset, for departments that started at ${fmtMoneyCompact(
          data.deptChangeMinFirst,
        )} or more. ${data.deptChangeTop[0]?.dept} leads at ${fmtPct(data.deptChangeTop[0]?.pct)}.`}
        csv={{
          filename: 'budget-department-growth.csv',
          data: toCsv(
            ['department', `approved_${data.firstYear}`, `approved_${data.year}`, 'pct_change'],
            data.deptChangeTop.map((d) => [d.dept, d.first, d.latest, d.pct.toFixed(1)]),
          ),
        }}
        footnote={`Change is ${data.year} approved dollars divided by ${data.firstYear} approved dollars, minus one. Departments below ${fmtMoneyCompact(
          data.deptChangeMinFirst,
        )} in ${data.firstYear} are excluded so tiny offices don't post silly percentages. Not adjusted for inflation.`}
        source={{
          id: BUDGET,
          query: soqlUrl(BUDGET, {
            $select: 'department, fiscal_year, sum(approved_amount) as total',
            $group: 'department, fiscal_year',
            $order: 'department, fiscal_year',
            $limit: '5000',
          }),
        }}
      >
        <RankedBars rows={changeRows} valueName="Change since first year" valueFormat="pct" height={420} />
      </ChartCard>

      <ChartCard
        title="Total budget by year"
        desc="The adopted operating budget has climbed every year on record."
        csv={{
          filename: 'budget-by-year.csv',
          data: toCsv(['fiscal_year', 'approved_amount'], data.byYear.map((r) => [r.y, r.total])),
        }}
        footnote="Each point sums every department's approved amount for that fiscal year. Adopted budgets cover whole years, so there are no partial periods to trim."
        source={{
          id: BUDGET,
          query: soqlUrl(BUDGET, {
            $select: 'fiscal_year, sum(approved_amount) as total',
            $group: 'fiscal_year',
            $order: 'fiscal_year',
          }),
        }}
      >
        <TrendChart
          data={yearRows}
          xKey="y"
          series={[{ key: 'total', name: 'Approved budget' }]}
          valueFormat="money"
          height={300}
        />
      </ChartCard>

      <div className="caveat">
        <strong>A budget is a plan, not a receipt.</strong> These are adopted numbers, the dollars the city set
        aside when it passed the budget. They are not actual spending. Departments can come in over or under, and
        the council can change the plan partway through the year. Year-over-year comparisons also ignore inflation,
        so part of every increase is just costs going up. The per-resident figure uses a round 800,000 population.
      </div>

      <RelatedLinks slug="/budget" />
    </>
  );
}
