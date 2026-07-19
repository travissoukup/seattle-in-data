import Link from 'next/link';
import data from '@/lib/generated/requests.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmt1, fmtInt, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';
import { TypeTrendPicker } from './TypeTrendPicker';

// "twice" reads better than "2.1 times" while the ratio stays near 2.
const times = data.growthX != null && data.growthX >= 1.85 && data.growthX <= 2.15 ? 'twice' : `${fmt1(data.growthX)} times`;

export const metadata = {
  title: `Seattle files ${times} the 311 reports it did in ${fmtYear(data.baseYear)}`,
  description: `Seattle logged ${fmtInt(data.lastTotal)} 311 requests in ${fmtYear(data.lastFullYear)}, about ${times} its ${fmtYear(data.baseYear)} total, and encampment reports supplied the largest share of the growth.`,
};

const DATASET = '5ngg-rpne';
const RESOURCE = `https://data.seattle.gov/resource/${DATASET}.json`;
const q = (params: Record<string, string>) => `${RESOURCE}?${new URLSearchParams(params).toString()}`;

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function RequestsPage() {
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
  const deptRows = data.byDept.map((d) => ({ label: d.key, value: d.n }));
  const monthly = data.monthly;

  const seriesFor = (key: string) => data.typeSeries.find((s) => s.key === key)?.values ?? [];
  const encVals = seriesFor('Unauthorized Encampment');
  const dumpVals = seriesFor('Illegal Dumping / Needles');
  const grafVals = seriesFor('Graffiti');
  const encRows = data.typeYears.map((y, i) => ({
    y: String(y),
    enc: encVals[i] ?? null,
    graffiti: grafVals[i] ?? null,
    dumping: dumpVals[i] ?? null,
  }));
  const preIdx = data.typeYears.indexOf(data.prePandemicYear);
  const lastIdx = data.typeYears.indexOf(data.lastFullYear);
  const grafPre = grafVals[preIdx] ?? null;
  const grafLast = grafVals[lastIdx] ?? null;

  const methodRows = data.methodYearly.map((m) => ({
    y: String(m.y),
    total: m.total,
    fifi: m.fifi,
    web: m.web,
    phone: m.phone,
  }));

  // Rebuild the monthly window's end bound from the last complete month shown.
  const lastYm = monthly[monthly.length - 1]?.ym ?? '';
  const [ly, lm] = lastYm.split('-').map(Number);
  const monthlyEnd = lm === 12 ? `${ly + 1}-01-01` : `${ly}-${String(lm + 1).padStart(2, '0')}-01`;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/getting-around">Getting Around</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Getting Around</p>
        <h1>Seattle files {times} the 311 reports it did in {fmtYear(data.baseYear)}</h1>
        <p>
          The city logged {fmtInt(data.lastTotal)} requests in {fmtYear(data.lastFullYear)}, up from{' '}
          {fmtInt(data.baseTotal)} in {fmtYear(data.baseYear)} and {data.vsPrePandemicPct}% above the pre-COVID pace.
          The climb has two engines. Encampment reports reached {fmtInt(data.enc.lastN)} a year and supplied{' '}
          {data.enc.shareOfGrowth}% of the growth since that category appeared in {fmtYear(data.enc.startYear)}. And
          the Find It Fix It app now carries {data.fifiShare}% of everything: potholes, graffiti, dumped trash,
          abandoned cars, dead streetlights. In all, {fmtInt(data.total)} requests since {fmtYear(data.firstYear)},
          with {fmtInt(data.last30)} in the last 30 days.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Requests on record</div>
          <div className="value">{fmtInt(data.total)}</div>
          <div className="sub">since {fmtYear(data.firstYear)}</div>
        </div>
        <div className="stat-card">
          <div className="label">In the last 30 days</div>
          <div className="value">{fmtInt(data.last30)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Most common report</div>
          <div className="value" style={{ fontSize: 20 }}>{data.topTypes[0]?.key}</div>
          <div className="sub">{fmtInt(data.topTypes[0]?.n)} all time, counting a 2021 rename as one category</div>
        </div>
        <div className="stat-card">
          <div className="label">Arrived through the app</div>
          <div className="value">{data.fifiShare}%</div>
          <div className="sub">of {fmtYear(data.lastFullYear)} requests came via Find It Fix It</div>
        </div>
      </div>

      <ChartCard
        title="The 311 boom arrived through an app"
        desc={`Find It Fix It carried ${fmtInt(data.fifiLast)} of ${fmtYear(data.lastFullYear)}'s ${fmtInt(data.lastTotal)} requests, up from ${fmtInt(data.fifiBase)} in ${fmtYear(data.baseYear)}. Phone and voicemail together took ${fmtInt(data.phoneLast)}, about ${data.phoneShare}%.`}
        csv={{
          filename: 'requests-by-method-year.csv',
          data: toCsv(
            ['year', 'find_it_fix_it', 'web', 'phone_and_voicemail', 'other', 'total'],
            data.methodYearly.map((m) => [m.y, m.fifi, m.web, m.phone, m.other, m.total]),
          ),
        }}
        footnote="Complete calendar years only. Web combines the citizen web portals and web forms; phone includes voicemail. Smaller channels (email, staff mobile entry, mass entry) count toward the total and sit in the CSV."
        source={{
          id: DATASET,
          query: q({
            $select: 'date_extract_y(createddate) as year, methodreceivedname, count(*) as n',
            $group: 'year, methodreceivedname',
            $order: 'year',
            $limit: '2000',
          }),
        }}
      >
        <TrendChart
          data={methodRows}
          xKey="y"
          series={[
            { key: 'total', name: 'All requests' },
            { key: 'fifi', name: 'Find It Fix It app' },
            { key: 'web', name: 'City website' },
            { key: 'phone', name: 'Phone and voicemail' },
          ]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="Encampment reports drove the growth"
        desc={`Unauthorized Encampment reports went from ${fmtInt(data.enc.startN)} in ${fmtYear(data.enc.startYear)} to ${fmtInt(data.enc.lastN)} in ${fmtYear(data.lastFullYear)}, which is ${data.enc.shareOfGrowth}% of the citywide increase over that span and ${data.enc.shareLast}% of all ${fmtYear(data.lastFullYear)} requests. Illegal dumping barely moved: ${fmtInt(data.enc.dumpStart)} then, ${fmtInt(data.enc.dumpLast)} now.`}
        csv={{
          filename: 'requests-key-types-by-year.csv',
          data: toCsv(
            ['year', 'unauthorized_encampment', 'graffiti', 'illegal_dumping_needles'],
            encRows.map((r) => [r.y, r.enc, r.graffiti, r.dumping]),
          ),
        }}
        footnote={`The Unauthorized Encampment category first appears in this dataset in ${fmtYear(data.enc.startYear)}; earlier encampment complaints went through other channels, so its line starts there. Complete calendar years only.`}
        source={{
          id: DATASET,
          query: q({
            $select: 'date_extract_y(createddate) as year, webintakeservicerequests, count(*) as n',
            $group: 'year, webintakeservicerequests',
            $where: "webintakeservicerequests in ('Unauthorized Encampment','Graffiti','Illegal Dumping / Needles')",
            $order: 'year',
            $limit: '100',
          }),
        }}
      >
        <TrendChart
          data={encRows}
          xKey="y"
          series={[
            { key: 'enc', name: 'Unauthorized Encampment' },
            { key: 'graffiti', name: 'Graffiti' },
            { key: 'dumping', name: 'Illegal Dumping / Needles' },
          ]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title={`The ${fmtInt(data.points.length)} most recent reports, mapped`}
        desc="Each dot is one report. Color shows the five most common kinds. Click a dot to see what it was and when."
        footnote="The map shows the most recent reports that came with map coordinates."
        source={{
          id: DATASET,
          query: q({
            $select: 'latitude,longitude,webintakeservicerequests,createddate',
            $where: 'latitude IS NOT NULL',
            $order: 'createddate DESC',
            $limit: '6000',
          }),
        }}
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="What people report most"
        desc="Counts cover every request on record, with renamed categories merged."
        csv={{ filename: 'requests-by-type.csv', data: toCsv(['type', 'count'], data.topTypes.map((t) => [t.key, t.n])) }}
        footnote="The city renamed Abandoned Vehicle to Abandoned Vehicle/72hr Parking Ordinance in 2021 and split Street Sign and Traffic Signal Maintenance in two in 2023. Both streams are merged here so a rename does not split one complaint across two bars."
        source={{
          id: DATASET,
          query: q({
            $select: 'webintakeservicerequests, count(*) as n',
            $group: 'webintakeservicerequests',
            $order: 'n DESC',
            $limit: '60',
          }),
        }}
      >
        <RankedBars rows={typeRows} valueName="Requests" valueFormat="compact" height={360} />
      </ChartCard>

      <ChartCard
        title="Which department handles them"
        desc="Police, utilities, and transportation field the most."
        footnote="Department is the one the request was routed to, not necessarily the one that resolved it."
        source={{
          id: DATASET,
          query: q({
            $select: 'departmentname, count(*) as n',
            $group: 'departmentname',
            $order: 'n DESC',
            $limit: '10',
          }),
        }}
      >
        <RankedBars rows={deptRows} valueName="Requests" valueFormat="compact" height={300} />
      </ChartCard>

      <ChartCard
        title="Reports per month"
        desc={`Monthly volume since ${fmtYear(data.prePandemicYear)}: the COVID dip, then the climb.`}
        csv={{ filename: 'requests-per-month.csv', data: toCsv(['month', 'requests'], monthly.map((m) => [m.ym, m.n])) }}
        footnote="Complete months only; the month in progress is excluded."
        source={{
          id: DATASET,
          query: q({
            $select: 'date_trunc_ym(createddate) as month, count(*) as n',
            $group: 'month',
            $order: 'month',
            $where: `createddate >= '${data.prePandemicYear}-01-01' AND createddate < '${monthlyEnd}'`,
          }),
        }}
      >
        <TrendChart
          data={monthly}
          xKey="ym"
          series={[{ key: 'n', name: 'Reports' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Pick a problem, see its trend"
        desc={`Yearly counts for the ${data.typeSeries.length} most-reported categories. Some problems really are rising: graffiti reports hit ${fmtInt(grafLast)} in ${fmtYear(data.lastFullYear)}, up from ${fmtInt(grafPre)} in ${fmtYear(data.prePandemicYear)}. Others, like illegal dumping, mostly hold steady while total volume booms.`}
        csv={{
          filename: 'requests-by-type-year.csv',
          data: toCsv(
            ['type', ...data.typeYears.map(String)],
            data.typeSeries.map((s) => [s.key, ...s.values]),
          ),
        }}
        footnote="Complete calendar years only, renamed categories merged. A line that starts late or stops early follows the years the category existed."
        source={{
          id: DATASET,
          query: q({
            $select: 'date_extract_y(createddate) as year, webintakeservicerequests, count(*) as n',
            $group: 'year, webintakeservicerequests',
            $order: 'year',
            $limit: '20000',
          }),
        }}
      >
        <TypeTrendPicker years={data.typeYears} series={data.typeSeries} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">Type your ZIP or neighborhood to see how it stacks up, by count and per resident.</p>
      </div>
      <AreaCompare data={data.areaByZip} unit="311 requests" />

      <div className="caveat">
        <strong>A report is a claim, not a verdict.</strong> Every count on this page is someone telling the city
        about a problem. It is not proof the city agreed, fixed anything, or that the problem was even real. Busy,
        well-connected neighborhoods tend to report more, so more reports can mean more reporters as much as more
        problems. And when reporting gets easier, as it did once the app took over, counts can rise even where
        problems do not.
      </div>

      <RelatedLinks slug="/requests" />
    </>
  );
}
