import Link from 'next/link';
import data from '@/lib/generated/fire.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { BarsChart, RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';
import { TypeTrendPicker } from './TypeTrendPicker';

const { story, shares, overdose, windows } = data;

export const metadata = {
  title: 'Fire and medic calls',
  description: `Seattle logged ${fmtInt(story.rubbishPeakN)} rubbish fires in ${fmtYear(story.rubbishPeakYear)}, ${fmtInt(story.rubbishFactor)} times the ${fmtYear(story.baseYear)} count, while encampment fires fell ${fmtInt(story.encampDropPct)}% from their ${fmtYear(story.encampPeakYear)} peak.`,
};

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

const RES = 'https://data.seattle.gov/resource/kzjm-xkqj.json';
const q = (params: Record<string, string>) => `${RES}?${new URLSearchParams(params).toString()}`;

export default function FirePage() {
  const top5 = data.topTypes.slice(0, 5).map((t) => t.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.t}</strong><br/>${p.d}`,
  }));
  const legend = [...top5.map((t, i) => ({ label: t, color: PALETTE[i] })), { label: 'Everything else', color: GRAY }];

  const typeRows = data.topTypes.map((t) => ({ label: t.key, value: t.n }));
  const monthly = data.monthly;

  const outdoorCsv = toCsv(
    ['year', 'rubbish_fires', 'encampment_fires', 'dumpster_fires', 'brush_fires', 'bark_fires', 'building_fires', 'outdoor_total'],
    data.fireYearly.map((r) => [r.y, r.rubbish, r.encampment, r.dumpster, r.brush, r.bark, r.building, r.outdoor]),
  );
  const shareCsv = toCsv(
    ['category', 'calls', 'share_pct'],
    [
      ['Medical', shares.medical, shares.medicalPct],
      ['Actual fires', shares.fire, shares.firePct],
      ['Everything else', shares.other, shares.otherPct],
    ],
  );
  const odCsv = toCsv(['year', 'overdose_responses'], data.odYearly.map((r) => [r.y, r.n]));
  const pickerCsv = toCsv(
    ['month', ...data.picker.series.map((s) => s.key)],
    data.picker.months.map((m, i) => [m, ...data.picker.series.map((s) => s.values[i])]),
  );

  const shareSegs = [
    { label: 'Medical', pct: shares.medicalPct, n: shares.medical, color: PALETTE[0] },
    { label: 'Actual fires', pct: shares.firePct, n: shares.fire, color: PALETTE[1] },
    { label: 'Everything else', pct: shares.otherPct, n: shares.other, color: GRAY },
  ];

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/safety-and-911">Safety and 911</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Safety and 911</p>
        <h1>Seattle&apos;s fire problem moved outdoors</h1>
        <p>
          The Seattle Fire Department answered {fmtInt(data.last12)} calls over the last year, and{' '}
          {fmtInt(shares.medicalPct)}% of them were medical, not fire. But inside the roughly {fmtInt(shares.firePct)}%
          that are actual fires, the ground shifted. Crews fought {fmtInt(story.rubbishPeakN)} rubbish fires in{' '}
          {fmtYear(story.rubbishPeakYear)}, about {fmtInt(story.rubbishFactor)} times as many as in{' '}
          {fmtYear(story.baseYear)}. Encampment fires peaked at {fmtInt(story.encampPeakN)} in{' '}
          {fmtYear(story.encampPeakYear)} and have since fallen {fmtInt(story.encampDropPct)}%. Building fires barely
          moved the whole time.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Calls in the last 12 months</div>
          <div className="value">{fmtInt(data.last12)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Share that is medical</div>
          <div className="value">{fmtInt(shares.medicalPct)}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Rubbish fires in {fmtYear(story.rubbishPeakYear)}</div>
          <div className="value">{fmtInt(story.rubbishPeakN)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Encampment fires since {fmtYear(story.encampPeakYear)}</div>
          <div className="value" style={{ fontSize: 22 }}>down {fmtInt(story.encampDropPct)}%</div>
        </div>
      </div>

      <ChartCard
        title="The fires moved to the street"
        desc={`Rubbish fires climbed from ${fmtInt(story.rubbishBase)} in ${fmtYear(story.baseYear)} to ${fmtInt(
          story.rubbishPeakN,
        )} in ${fmtYear(story.rubbishPeakYear)}. Encampment fires got their own label in ${fmtYear(
          story.encampFirstYear,
        )}, peaked at ${fmtInt(story.encampPeakN)} in ${fmtYear(story.encampPeakYear)}, and fell to ${fmtInt(
          story.encampLast,
        )} by ${fmtYear(story.lastYear)}. Building fires stayed in a narrow band. Counting every outdoor type together (rubbish, encampment, dumpster, brush, bark), outdoor fires went from ${fmtInt(
          story.outdoorBase,
        )} in ${fmtYear(story.baseYear)} to a peak of ${fmtInt(story.outdoorPeakN)} in ${fmtYear(
          story.outdoorPeakYear,
        )}, and still ran ${fmtInt(story.outdoorLast)} in ${fmtYear(story.lastYear)}.`}
        csv={{ filename: 'fire-outdoor-vs-building-by-year.csv', data: outdoorCsv }}
        footnote={`Complete calendar years ${fmtYear(windows.yearStart)} to ${fmtYear(
          windows.lastFullYear,
        )}. Building fires sum the labels Fire in Building, Fire in Single Family Res (retired in 2020), and Fire In A Highrise. Encampment Fire shows nothing before ${fmtYear(
          story.encampFirstYear,
        )} because the label did not exist; those fires were coded under other types.`}
        source={{
          id: 'kzjm-xkqj',
          query: q({
            $select: 'date_extract_y(datetime) as y, type, count(*) as n',
            $group: 'y, type',
            $order: 'y',
            $where: `date_extract_y(datetime) >= ${windows.yearStart} AND date_extract_y(datetime) <= ${windows.lastFullYear} AND type in ('Rubbish Fire','Encampment Fire','Dumpster Fire','Brush Fire','Bark Fire','Fire in Building','Fire in Single Family Res','Fire In A Highrise')`,
          }),
        }}
      >
        <TrendChart
          data={data.fireYearly}
          xKey="y"
          series={[
            { key: 'rubbish', name: 'Rubbish fires' },
            { key: 'encampment', name: 'Encampment fires' },
            { key: 'building', name: 'Building fires' },
          ]}
          valueFormat="int"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="Most calls are not fires at all"
        desc={`Of ${fmtInt(shares.total)} calls in the last 12 months, ${fmtInt(shares.medicalPct)}% were medical responses and about ${fmtInt(
          shares.firePct,
        )}% were actual fires. The rest is alarms, car crashes, stuck elevators, and other odd jobs.`}
        csv={{ filename: 'fire-calls-medical-vs-fire.csv', data: shareCsv }}
        footnote="Call types from the last 12 months, classified by name: medical covers aid, medic, triage, nurseline, and transfer responses; actual fires are types named for a burning thing, excluding alarms."
        source={{
          id: 'kzjm-xkqj',
          query: q({
            $select: 'type, count(*) as n',
            $group: 'type',
            $order: 'n DESC',
            $where: `datetime > '${windows.yearAgo}'`,
            $limit: '400',
          }),
        }}
      >
        <div>
          <div style={{ display: 'flex', height: 30, borderRadius: 6, overflow: 'hidden' }}>
            {shareSegs.map((s) => (
              <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.label}: ${s.pct}%`} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 10, fontSize: 13 }}>
            {shareSegs.map((s) => (
              <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                {s.label}: {fmtInt(s.pct)}% ({fmtInt(s.n)} calls)
              </span>
            ))}
          </div>
        </div>
      </ChartCard>

      <ChartCard
        title={`Overdose runs got their own label in ${fmtYear(overdose.firstYear)}`}
        desc={`The department started coding overdose medic responses separately in ${fmtYear(
          overdose.firstYear,
        )}. They jumped to ${fmtInt(overdose.peakN)} in ${fmtYear(overdose.peakYear)} and ran ${fmtInt(
          overdose.lastN,
        )} in ${fmtYear(overdose.lastYear)}.`}
        csv={{ filename: 'fire-overdose-responses-by-year.csv', data: odCsv }}
        footnote={`Calls typed Medic Response- Overdose, complete years only. Overdoses before ${fmtYear(
          overdose.firstYear,
        )} were coded as ordinary medic responses, so this series starts where the label starts.`}
        source={{
          id: 'kzjm-xkqj',
          query: q({
            $select: 'date_extract_y(datetime) as y, count(*) as n',
            $group: 'y',
            $order: 'y',
            $where: `type = 'Medic Response- Overdose' AND date_extract_y(datetime) <= ${windows.lastFullYear}`,
          }),
        }}
      >
        <BarsChart data={data.odYearly} xKey="y" series={[{ key: 'n', name: 'Overdose responses' }]} valueFormat="int" height={260} />
      </ChartCard>

      <ChartCard
        title={`The ${fmtInt(data.points.length)} most recent calls, mapped`}
        desc="Each dot is one 911 call. Color shows the five most common kinds. Click a dot to see what it was and when."
        footnote="The map shows the most recent calls that came with map coordinates."
        source={{ id: 'kzjm-xkqj' }}
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="What they get called for"
        desc="The most common call types over the last 12 months."
        csv={{ filename: 'fire-calls-by-type.csv', data: toCsv(['type', 'count'], data.topTypes.map((t) => [t.key, t.n])) }}
        footnote="Counts cover the last 12 months."
        source={{
          id: 'kzjm-xkqj',
          query: q({
            $select: 'type, count(*) as n',
            $group: 'type',
            $order: 'n DESC',
            $where: `datetime > '${windows.yearAgo}'`,
            $limit: '12',
          }),
        }}
      >
        <RankedBars rows={typeRows} valueName="Calls" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Calls per month"
        desc={`Total call volume by month since ${fmtYear(Number(windows.monthStart.slice(0, 4)))}.`}
        csv={{ filename: 'fire-calls-per-month.csv', data: toCsv(['month', 'calls'], monthly.map((m) => [m.ym, m.n])) }}
        footnote="Partial months are trimmed from both ends, so every point is a complete month."
        source={{
          id: 'kzjm-xkqj',
          query: q({
            $select: 'date_trunc_ym(datetime) as ym, count(*) as n',
            $group: 'ym',
            $order: 'ym',
            $where: `datetime >= '${windows.monthStart}' AND datetime < '${windows.monthEnd}'`,
          }),
        }}
      >
        <TrendChart
          data={monthly}
          xKey="ym"
          series={[{ key: 'n', name: 'Calls' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Chart any call type yourself"
        desc={`Pick a type to see its monthly trend since ${fmtYear(windows.yearStart)}. Try Brush Fire or Illegal Burn for summer seasonality, or Encampment Fire for the rise and fall.`}
        csv={{ filename: 'fire-calls-monthly-by-type.csv', data: pickerCsv }}
        footnote="Monthly counts for the highest-volume call types plus the fire types charted above. A series starts when its label first appears in the data."
        source={{
          id: 'kzjm-xkqj',
          query: q({
            $select: 'date_trunc_ym(datetime) as ym, type, count(*) as n',
            $group: 'ym, type',
            $order: 'ym',
            $where: `datetime >= '${windows.pickerStart}' AND datetime < '${windows.monthEnd}'`,
            $limit: '10000',
          }),
        }}
      >
        <TypeTrendPicker months={data.picker.months} series={data.picker.series} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">Type your ZIP or neighborhood to see how it stacks up, by count and per resident.</p>
      </div>
      <AreaCompare data={data.areaByZip} unit="fire and medic calls" />

      <div className="caveat">
        <strong>Call types are dispatch codes, not fire marshal findings.</strong> A call is what the dispatcher coded
        when someone dialed 911, not what crews found on arrival. One emergency can trigger several calls, so counts run
        higher than the number of actual events. The department also adds and retires labels: Encampment Fire only
        became a category in {fmtYear(story.encampFirstYear)}, and overdose runs got a dedicated code in{' '}
        {fmtYear(overdose.firstYear)}, so earlier incidents hide inside broader types. Trends can follow the labels as
        much as the fires.
      </div>

      <RelatedLinks slug="/fire" />
    </>
  );
}
