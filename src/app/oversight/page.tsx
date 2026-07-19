import Link from 'next/link';
import data from '@/lib/generated/oversight.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtPct, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'Police complaints and oversight | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function OversightPage() {
  const findingRows = data.byFinding.map((f) => ({ label: f.key, value: f.n }));
  const allegationRows = data.byAllegation.map((a) => ({ label: a.key, value: a.n }));
  const yearly = data.yearly;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>Police complaints and oversight</h1>
        <p>
          When someone has a problem with a Seattle police officer, the Office of Police Accountability looks into it.
          This file holds {fmtInt(data.total)} allegations going back to the 1990s. The office reached a finding on{' '}
          {fmtInt(data.withFinding)} of them, and marked about {fmtPct(data.sustainedPct)} as sustained, meaning it
          decided the officer broke a rule.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Allegations on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Logged in {data.latestFullYear.y}</div>
          <div className="value">{fmtInt(data.latestFullYear.n)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Share sustained (of decided)</div>
          <div className="value">{fmtPct(data.sustainedPct)}</div>
        </div>
      </div>

      <ChartCard
        title="How the cases ended"
        desc="The finding is the oversight office's own call on each allegation. Sustained means it decided a rule was broken."
        csv={{ filename: 'opa-by-finding.csv', data: toCsv(['finding', 'count'], data.byFinding.map((f) => [f.key, f.n])) }}
        footnote="Source: OPA Complaints (hyay-5x7b) on data.seattle.gov. Rows with no finding logged are left out."
      >
        <RankedBars rows={findingRows} valueName="Allegations" valueFormat="compact" height={340} />
      </ChartCard>

      <ChartCard
        title="What people complain about"
        desc="Each allegation gets a type. Professionalism and use of force lead the list."
        csv={{ filename: 'opa-by-allegation.csv', data: toCsv(['allegation', 'count'], data.byAllegation.map((a) => [a.key, a.n])) }}
        footnote="Source: OPA Complaints (hyay-5x7b). One complaint can carry several allegations."
      >
        <RankedBars rows={allegationRows} valueName="Allegations" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Allegations logged per year"
        desc="Counts are by the date the office received the complaint. The 2020 spike lines up with that summer's protests."
        footnote="Source: OPA Complaints (hyay-5x7b). 2026 is still in progress and is left off."
      >
        <TrendChart
          data={yearly}
          xKey="y"
          series={[{ key: 'n', name: 'Allegations' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> A complaint is an allegation, not a verdict. A finding
        is the oversight office's own conclusion about whether a rule was broken. Neither one is a court ruling, and a
        sustained finding can still be changed later in the discipline process.
      </div>

      <RelatedLinks slug="/oversight" />
    </>
  );
}
