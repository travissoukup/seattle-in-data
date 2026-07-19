import Link from 'next/link';
import data from '@/lib/generated/oversight.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmt1, fmtInt, fmtPct, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = {
  title: 'Police complaints and oversight',
  description: `Complaints SPD files against its own officers are sustained ${fmt1(data.sourceGap)}x as often as community complaints, and most sustained findings end in a reprimand.`,
};

const RES = 'https://data.seattle.gov/resource/hyay-5x7b.json';
const q = (params: Record<string, string>) => `${RES}?${new URLSearchParams(params).toString()}`;
const MERITS = "finding != '-' AND finding != 'Process as Supv Action'";
const SUSTAINED = "starts_with(finding, 'Sustained')";

/** Friendlier labels for the source field's raw values. */
const SOURCE_LABELS: Record<string, string> = {
  'SPD - Initiated': 'SPD initiated',
  'SPD - Forwarded': 'SPD forwarded',
  'Community Member': 'Community member',
  'Social Media': 'Social media',
};

export default function OversightPage() {
  const findingRows = data.byFinding.map((f) => ({ label: f.key, value: f.n }));
  const allegationRows = data.byAllegation.map((a) => ({ label: a.key, value: a.n }));
  const sourceRows = data.bySource.map((s) => ({ label: SOURCE_LABELS[s.key] ?? s.key, value: s.pct }));
  const disciplineRows = data.discipline.map((d) => ({ label: d.key, value: d.n }));
  const allegationRateRows = data.byAllegationRate.map((a) => ({ label: a.key, value: a.pct }));
  const yearly = data.yearly;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>Complaints from inside the police stick far more often</h1>
        <p>
          Who files a complaint against a Seattle police officer shapes what happens to it. When SPD reports one of
          its own, the Office of Police Accountability sustains the allegation {fmtPct(data.spdInitiated.pct)} of the
          time. When a community member complains, {fmtPct(data.communityMember.pct)}. That is a{' '}
          {fmt1(data.sourceGap)}x gap, across {fmtInt(data.total)} allegations on record since{' '}
          {fmtYear(data.firstYear)}. And a sustained finding rarely ends a career:{' '}
          {fmtPct(data.reprimandPctOfRecorded)} of recorded discipline outcomes are reprimands, while terminations
          number {fmtInt(data.termination)}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Allegations on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Sustained, of merits decisions</div>
          <div className="value">{fmtPct(data.sustainedPctOfMerits)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Sustained rate gap, SPD vs community</div>
          <div className="value">{fmt1(data.sourceGap)}x</div>
        </div>
      </div>

      <ChartCard
        title="Who complained, and how often it was sustained"
        desc={`Share of merits decisions that were sustained, by who filed the complaint. Complaints SPD initiated against its own officers stick at ${fmtPct(data.spdInitiated.pct)}; community complaints at ${fmtPct(data.communityMember.pct)}.`}
        csv={{
          filename: 'opa-sustained-by-source.csv',
          data: toCsv(
            ['source', 'merits_decisions', 'sustained', 'pct_sustained'],
            data.bySource.map((s) => [s.key, s.merits, s.sustained, s.pct.toFixed(1)]),
          ),
        }}
        footnote={`Denominator is merits decisions only: allegations with a finding, minus the ${fmtInt(data.supvAction)} routed to a supervisor as "Process as Supv Action". Community complaints are also routed that way far more often (${fmtPct(data.communitySupvPct)} of decided community allegations), so the office never rules on the merits of many of them. Sources with fewer than ${fmtInt(500)} merits decisions are left off.`}
        source={{
          id: 'hyay-5x7b',
          query: q({
            $select: `source, count(*) as merits, sum(case(${SUSTAINED}, 1, true, 0)) as sustained`,
            $where: MERITS,
            $group: 'source',
            $order: 'merits DESC',
          }),
        }}
      >
        <RankedBars rows={sourceRows} valueName="Sustained share" valueFormat="pct" height={240} />
      </ChartCard>

      <ChartCard
        title="What discipline followed a sustained finding"
        desc={`The second act the finding chart hides. Of ${fmtInt(data.sustained)} sustained allegations, the most common recorded outcomes are a written reprimand (${fmtInt(data.writtenReprimand)}) or an oral one (${fmtInt(data.oralReprimand)}). Unpaid suspensions number ${fmtInt(data.suspension)}, terminations ${fmtInt(data.termination)}, and ${fmtInt(data.leftInstead)} officers resigned or retired before discipline landed.`}
        csv={{
          filename: 'opa-discipline-after-sustained.csv',
          data: toCsv(['discipline', 'count'], data.discipline.map((d) => [d.key, d.n])),
        }}
        footnote={`Discipline as logged per allegation, for allegations with a sustained finding. "Resigned or retired instead" combines the dataset's resignation and retirement variants, including in lieu of termination; "Termination" includes officers terminated before the process finished. ${fmtInt(data.noOutcome)} sustained allegations have no outcome recorded, often because several allegations share one disciplinary action.`}
        source={{
          id: 'hyay-5x7b',
          query: q({
            $select: 'discipline, count(*) as n',
            $where: SUSTAINED,
            $group: 'discipline',
            $order: 'n DESC',
          }),
        }}
      >
        <RankedBars rows={disciplineRows} valueName="Sustained allegations" valueFormat="compact" height={320} />
      </ChartCard>

      <ChartCard
        title="How the cases ended"
        desc="The finding is the oversight office's own call on each allegation. Sustained means it decided a rule was broken. Process as Supv Action means the complaint went to a supervisor without a merits decision."
        csv={{ filename: 'opa-by-finding.csv', data: toCsv(['finding', 'count'], data.byFinding.map((f) => [f.key, f.n])) }}
        footnote={`Rows with no finding logged are left out, and sustained variants are folded into one bar. Two ways to read the sustained share: ${fmtPct(data.sustainedPctOfDecided)} of all ${fmtInt(data.decided)} closed allegations, or ${fmtPct(data.sustainedPctOfMerits)} of the ${fmtInt(data.merits)} that got a merits decision.`}
        source={{
          id: 'hyay-5x7b',
          query: q({
            $select: 'finding, count(*) as n',
            $where: "finding != '-'",
            $group: 'finding',
            $order: 'n DESC',
          }),
        }}
      >
        <RankedBars rows={findingRows} valueName="Allegations" valueFormat="compact" height={340} />
      </ChartCard>

      <ChartCard
        title="What people complain about"
        desc="Each allegation gets a type. Professionalism and use of force lead the list."
        csv={{ filename: 'opa-by-allegation.csv', data: toCsv(['allegation', 'count'], data.byAllegation.map((a) => [a.key, a.n])) }}
        footnote="One complaint can carry several allegations."
        source={{
          id: 'hyay-5x7b',
          query: q({
            $select: 'allegation, count(*) as n',
            $where: "allegation != '-'",
            $group: 'allegation',
            $order: 'n DESC',
            $limit: '10',
          }),
        }}
      >
        <RankedBars rows={allegationRows} valueName="Allegations" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Which allegations are hardest to prove"
        desc={`Sustained share of merits decisions, by allegation type. Failing to record video sticks at ${fmtPct(data.videoRate.pct)}. Biased policing, among the most serious charges, sticks at ${fmtPct(data.biasRate.pct)} (${fmtInt(data.biasRate.sustained)} of ${fmtInt(data.biasRate.merits)}).`}
        csv={{
          filename: 'opa-sustained-by-allegation.csv',
          data: toCsv(
            ['allegation', 'merits_decisions', 'sustained', 'pct_sustained'],
            data.byAllegationRate.map((a) => [a.key, a.merits, a.sustained, a.pct.toFixed(1)]),
          ),
        }}
        footnote={`Same merits denominator as the source chart. Types with fewer than ${fmtInt(data.allegationMinMerits)} merits decisions are left off so small counts don't produce noisy rates. A low rate can mean weak complaints, hard proof standards, or both; this data can't say which.`}
        source={{
          id: 'hyay-5x7b',
          query: q({
            $select: `allegation, count(*) as merits, sum(case(${SUSTAINED}, 1, true, 0)) as sustained`,
            $where: MERITS,
            $group: 'allegation',
            $order: 'merits DESC',
          }),
        }}
      >
        <RankedBars rows={allegationRateRows} valueName="Sustained share" valueFormat="pct" height={360} />
      </ChartCard>

      <ChartCard
        title="Allegations logged per year"
        desc="Counts are by the date the office received the complaint. The 2020 spike lines up with that summer's protests."
        csv={{ filename: 'opa-per-year.csv', data: toCsv(['year', 'allegations'], yearly.map((r) => [r.y, r.n])) }}
        footnote={`The current year is still in progress and is left off. So are the ${fmtInt(data.preChart)} allegations received before ${fmtYear(data.chartStartYear)}; records reach back to ${fmtYear(data.firstYear)}, but the early years are too sparse to chart alongside recent ones.`}
        source={{
          id: 'hyay-5x7b',
          query: q({
            $select: 'date_extract_y(received_date) as y, count(*) as n',
            $where: `received_date >= '${data.chartStartYear}-01-01'`,
            $group: 'y',
            $order: 'y',
          }),
        }}
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
        <strong>Read the gap with care.</strong> A complaint is an allegation, not a verdict, and a finding is the
        oversight office's own conclusion, not a court ruling. The sustained-rate gap by source has more than one
        explanation: internal complaints often come with a supervisor's evidence already attached, while community
        complaints include more cases that are hard to prove or get routed to a supervisor without a merits decision.
        A sustained finding can also be changed later in the discipline process.
      </div>

      <RelatedLinks slug="/oversight" />
    </>
  );
}
