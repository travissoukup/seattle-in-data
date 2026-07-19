import Link from 'next/link';
import data from '@/lib/generated/calls.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmt1, fmtInt, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';
import { CallTypePicker } from './CallTypePicker';

const S = data.stats;

export const metadata = {
  title: '911 calls and proactive policing',
  description: `Officer-initiated police work in Seattle fell from ${fmtInt(S.officer.anchorN)} events in ${fmtYear(S.officer.anchorYear)} to ${fmtInt(S.officer.floorN)} in ${fmtYear(S.officer.floorYear)}, and its ${fmtInt(S.officer.lastN)} events in ${fmtYear(S.officer.lastYear)} were the most since ${fmtYear(S.officer.sinceYear)}.`,
};

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';
const RES = 'https://data.seattle.gov/resource/33kz-ixgy.json';
const q = (params: Record<string, string>) => `${RES}?${new URLSearchParams(params).toString()}`;
const COMMUNITY = "call_type_received_classification='COMMUNITY_GENERATED'";

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function CallsPage() {
  const top5 = data.topTypes.slice(0, 5).map((t) => t.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${titleCase(p.t)}</strong><br/>${p.d}`,
  }));
  const legend = [
    ...top5.map((t, i) => ({ label: titleCase(t), color: PALETTE[i] })),
    { label: 'Everything else', color: GRAY },
  ];

  const typeRows = data.topTypes.map((t) => ({ label: titleCase(t.key), value: t.n }));
  const busiest = data.topTypes[0]?.key ? titleCase(data.topTypes[0].key) : '';

  const yearlyCsv = toCsv(
    ['year', 'community_calls', 'officer_initiated'],
    data.yearly.map((r) => [r.y, r.community, r.officer]),
  );
  const respCsv = toCsv(
    ['year', 'avg_first_response_seconds', 'avg_minutes', 'priority1_events'],
    data.respYearly.map((r) => [r.y, r.sec, r.min, r.n]),
  );
  const monthlyCsv = toCsv(
    ['month', 'community_calls', 'officer_initiated'],
    data.monthly.map((r) => [r.ym, r.community, r.officer]),
  );
  const pickerCsv = toCsv(
    ['month', ...data.typeTrend.series.map((s) => s.key)],
    data.typeTrend.months.map((m, i) => [m, ...data.typeTrend.series.map((s) => s.values[i])]),
  );
  const inList = data.topTypes.map((t) => `'${t.key.replace(/'/g, "''")}'`).join(',');

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>Proactive policing fell by half, then started coming back</h1>
        <p>
          People asked Seattle police for help about {fmtInt(S.community12)} times over the last year.{' '}
          {S.share911Pct}% of those requests came in through 911; the rest arrived by the non-emergency line,
          alarm companies, and text. Officers started another {fmtInt(S.officer12)} events on their own, mostly
          traffic stops, premise checks, and directed patrols. That officer-initiated work is the story here: it
          went from {fmtInt(S.officer.anchorN)} events in {fmtYear(S.officer.anchorYear)} down to{' '}
          {fmtInt(S.officer.floorN)} in {fmtYear(S.officer.floorYear)}, then back up to {fmtInt(S.officer.lastN)}{' '}
          in {fmtYear(S.officer.lastYear)}, the most since {fmtYear(S.officer.sinceYear)}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Community calls, last 12 months</div>
          <div className="value">{fmtInt(S.community12)}</div>
          <div className="sub">Someone asked for help: 911, the non-emergency line, an alarm, a text.</div>
        </div>
        <div className="stat-card">
          <div className="label">Came through 911</div>
          <div className="value">{fmtInt(S.calls911_12)}</div>
          <div className="sub">{S.share911Pct}% of community calls. The rest were requests, not emergencies on the 911 line.</div>
        </div>
        <div className="stat-card">
          <div className="label">Officer-initiated events</div>
          <div className="value">{fmtInt(S.officer12)}</div>
          <div className="sub">Traffic stops, premise checks, patrols. Nobody called.</div>
        </div>
        <div className="stat-card">
          <div className="label">Priority 1 wait, {fmtYear(S.resp.lastYear)}</div>
          <div className="value">{fmt1(S.resp.lastMin)} min</div>
          <div className="sub">
            Average first response for the most urgent community calls, down from {fmt1(S.resp.worstMin)} minutes
            in {fmtYear(S.resp.worstYear)}.
          </div>
        </div>
      </div>

      <ChartCard
        title="The two streams of police work"
        desc={`Every dispatch event starts one of two ways: the community asks, or an officer acts. Community calls dipped in the pandemic and mostly held. Officer-initiated events fell ${S.officer.dropPct}% between ${fmtYear(S.officer.anchorYear)} and ${fmtYear(S.officer.floorYear)} as the department shrank, and ${fmtYear(S.officer.lastYear)} was the busiest proactive year since ${fmtYear(S.officer.sinceYear)}.`}
        csv={{ filename: 'calls-community-vs-officer-yearly.csv', data: yearlyCsv }}
        footnote={`Complete calendar years only (${fmtYear(data.meta.firstFullYear)} to ${fmtYear(data.meta.lastFullYear)}). Community means SPD classified the event as community generated; officer means officer generated.`}
        source={{
          id: '33kz-ixgy',
          query: q({
            $select: 'date_extract_y(cad_event_original_time_queued) as year, call_type_received_classification, count(*) as n',
            $where: `cad_event_original_time_queued < '${data.meta.curYearStart}'`,
            $group: 'year, call_type_received_classification',
            $order: 'year',
            $limit: '200',
          }),
        }}
      >
        <TrendChart
          data={data.yearly}
          xKey="y"
          series={[
            { key: 'community', name: 'Community calls' },
            { key: 'officer', name: 'Officer-initiated' },
          ]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="Help is arriving faster again"
        desc={`Average minutes from a priority 1 community call entering the queue to the first response arriving. The wait was ${fmt1(S.resp.anchorMin)} minutes in ${fmtYear(S.resp.anchorYear)}, peaked at ${fmt1(S.resp.worstMin)} in ${fmtYear(S.resp.worstYear)}, and eased to ${fmt1(S.resp.lastMin)} in ${fmtYear(S.resp.lastYear)}.`}
        csv={{ filename: 'calls-priority1-response-time.csv', data: respCsv }}
        footnote="Average of cad_event_first_response_time_s_ for priority 1 community-generated events, complete years only. Events with no recorded response time are excluded. Averages hide the tail: a few very long waits pull the number up."
        source={{
          id: '33kz-ixgy',
          query: q({
            $select: 'date_extract_y(cad_event_original_time_queued) as year, avg(cad_event_first_response_time_s_) as avg_seconds, count(*) as n',
            $where: `priority='1' AND ${COMMUNITY} AND cad_event_first_response_time_s_ IS NOT NULL AND cad_event_original_time_queued < '${data.meta.curYearStart}'`,
            $group: 'year',
            $order: 'year',
          }),
        }}
      >
        <TrendChart
          data={data.respYearly}
          xKey="y"
          series={[{ key: 'min', name: 'Minutes to first response' }]}
          valueFormat="plain"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="What people call about most"
        desc={`Top community-generated call types over the last 12 months. Officer-initiated work like traffic stops and premise checks is excluded, so every bar is something a person reported. The most common reason: a ${busiest.toLowerCase()}.`}
        csv={{ filename: 'calls-by-type.csv', data: toCsv(['call_type', 'count'], data.topTypes.map((t) => [t.key, t.n])) }}
        footnote="Counts cover the last 12 months and only events SPD classified as community generated."
        source={{
          id: '33kz-ixgy',
          query: q({
            $select: 'initial_call_type, count(*) as n',
            $where: `cad_event_original_time_queued > '${data.meta.yearAgo}' AND ${COMMUNITY}`,
            $group: 'initial_call_type',
            $order: 'n DESC',
            $limit: '12',
          }),
        }}
      >
        <RankedBars rows={typeRows} valueName="Calls" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Calls per month, both streams"
        desc="Complete months over the last three years. Community volume follows the seasons and peaks in summer; the officer-initiated line moves with staffing and policy."
        csv={{ filename: 'calls-per-month.csv', data: monthlyCsv }}
        footnote="Complete months only; the current month is left out until it ends."
        source={{
          id: '33kz-ixgy',
          query: q({
            $select: 'date_trunc_ym(cad_event_original_time_queued) as month, call_type_received_classification, count(*) as n',
            $where: `cad_event_original_time_queued >= '${data.meta.monthlyStart}' AND cad_event_original_time_queued < '${data.meta.firstOfCurrentMonth}'`,
            $group: 'month, call_type_received_classification',
            $order: 'month',
            $limit: '500',
          }),
        }}
      >
        <TrendChart
          data={data.monthly}
          xKey="ym"
          series={[
            { key: 'community', name: 'Community calls' },
            { key: 'officer', name: 'Officer-initiated' },
          ]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Track one call type"
        desc={`Monthly volume for the biggest community call types since ${fmtYear(data.meta.preStart.slice(0, 4))}. Welfare checks set a record in ${fmtYear(S.welfare.peakYear)} with ${fmtInt(S.welfare.peakN)} calls, above the prior high of ${fmtInt(S.welfare.priorN)} in ${fmtYear(S.welfare.priorYear)}.`}
        csv={{ filename: 'calls-type-monthly.csv', data: pickerCsv }}
        footnote="Complete months only, community-generated events only. Types are the 12 most common over the last 12 months, so a type that was big years ago but rare now will not appear."
        source={{
          id: '33kz-ixgy',
          query: q({
            $select: 'date_trunc_ym(cad_event_original_time_queued) as month, initial_call_type, count(*) as n',
            $where: `${COMMUNITY} AND initial_call_type in (${inList}) AND cad_event_original_time_queued >= '${data.meta.preStart}' AND cad_event_original_time_queued < '${data.meta.firstOfCurrentMonth}'`,
            $group: 'month, initial_call_type',
            $order: 'month',
            $limit: '10000',
          }),
        }}
      >
        <CallTypePicker months={data.typeTrend.months} series={data.typeTrend.series} />
      </ChartCard>

      <ChartCard
        title={`The ${fmtInt(data.points.length)} most recent community calls, mapped`}
        desc="Each dot is one community-generated call. Color shows the five most common kinds. Click a dot to see what it was and when."
        footnote="The map shows the most recent community calls that came with coordinates inside the city. Officer-initiated events are not shown."
        source={{
          id: '33kz-ixgy',
          query: q({
            $select: 'dispatch_latitude,dispatch_longitude,initial_call_type,cad_event_original_time_queued',
            $where: `dispatch_latitude IS NOT NULL AND ${COMMUNITY}`,
            $order: 'cad_event_original_time_queued DESC',
            $limit: '6000',
          }),
        }}
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">
          Community calls over the last 12 months, binned by ZIP. Type your ZIP or neighborhood to see how it
          stacks up, by count and per resident.
        </p>
      </div>
      <AreaCompare data={data.areaByZip} unit="community calls" />

      <div className="caveat">
        <strong>Calls measure asking, not what happened.</strong> A community call is a request for help. Plenty
        turn out to be nothing, get logged twice, or have no crime behind them at all (a welfare check, a noise
        gripe, a false alarm). The community and officer split relies on SPD&apos;s own classification of how each
        event started. And the officer-initiated line tracks what the department chooses to do and can staff, so
        it moves with policy and hiring as much as with conditions on the street.
      </div>

      <RelatedLinks slug="/calls" />
    </>
  );
}
