import Link from 'next/link';
import data from '@/lib/generated/budget.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtMoney, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'Where the money goes | Seattle in Data' };

export default function BudgetPage() {
  const deptRows = data.topDepts.map((d) => ({ label: d.key, value: d.total }));
  const yearRows = data.byYear.map((r) => ({ y: r.y, total: r.total }));
  const biggest = data.topDepts[0];

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/city-money">City Money</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">City Money</p>
        <h1>Where the money goes</h1>
        <p>
          The city of Seattle adopted a {fmtMoney(data.total)} operating budget for {data.year}. That money is split
          across {fmtInt(data.deptCount)} departments. The single biggest slice goes to {biggest?.key}, at{' '}
          {fmtMoney(biggest?.total)}, mostly because it runs the electric utility.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total budget, {data.year}</div>
          <div className="value">{fmtMoney(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Departments</div>
          <div className="value">{fmtInt(data.deptCount)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Biggest department</div>
          <div className="value" style={{ fontSize: 20 }}>{biggest?.key}</div>
        </div>
      </div>

      <ChartCard
        title={`Top departments by budget, ${data.year}`}
        desc="The twelve departments with the most money allocated. The two utilities top the list because residents pay them through bills, not just taxes."
        csv={{
          filename: 'budget-by-department.csv',
          data: toCsv(['department', 'approved_amount'], data.byDept.map((d) => [d.key, d.total])),
        }}
        footnote="Source: City of Seattle Operating Budget (8u2j-imqx) on data.seattle.gov. Amounts are the approved dollars for each department."
      >
        <RankedBars rows={deptRows} valueName="Approved budget" valueFormat="money" height={420} />
      </ChartCard>

      <ChartCard
        title="Total budget by year"
        desc="The adopted operating budget has climbed every year on record."
        footnote="Source: City of Seattle Operating Budget (8u2j-imqx). Each point sums every department's approved amount for that year."
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
        <strong>What this shows, and what it does not.</strong> These are adopted numbers, the dollars the city set
        aside when it passed the budget. They are not actual spending. Departments can come in over or under, and the
        council can change the plan partway through the year. So treat this as the plan, not the receipt.
      </div>

      <RelatedLinks slug="/budget" />
    </>
  );
}
