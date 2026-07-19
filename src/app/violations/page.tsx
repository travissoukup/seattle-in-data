import Link from 'next/link';
import data from '@/lib/generated/violations.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart, BarsChart } from '@/components/charts';
import { fmtInt, fmtPct, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';

export const metadata = {
  title: 'Code complaints and violations',
  description: `Seattle opened ${fmtInt(data.em.lastN)} emergency code enforcement cases in ${data.em.lastYear}, about ${data.em.factor} times as many as in ${data.em.baseYear}.`,
};

const DS = 'ez4a-iug7';
const soqlUrl = (params: Record<string, string>) =>
  `https://data.seattle.gov/resource/${DS}.json?${new URLSearchParams(params).toString()}`;

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function ViolationsPage() {
  const top5 = data.byDesc.slice(0, 5).map((t) => t.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.t}</strong><br/>Opened ${p.d}`,
  }));
  const legend = [...top5.map((t, i) => ({ label: t, color: PALETTE[i] })), { label: 'Everything else', color: GRAY }];

  const descRows = data.byDesc.map((d) => ({ label: d.key, value: d.n }));
  const notClass = data.byDesc.find((d) => d.key === 'Not classified');
  const peakYear = data.yearly.reduce((a, b) => (b.n > a.n ? b : a));
  const fullYearsWhere = `opendate >= '${data.firstFullYear}-01-01' AND opendate < '${data.currentYear}-01-01'`;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permits and Construction</p>
        <h1>
          Emergency code complaints are up {fmtInt(data.em.factor)}x since {data.em.baseYear}
        </h1>
        <p>
          For two decades, SDCI opened between {fmtInt(data.em.plateauMin)} and {fmtInt(data.em.plateauMax)} emergency
          code cases a year. In {data.em.lastYear} it opened {fmtInt(data.em.lastN)}, roughly {fmtInt(data.em.factor)}{' '}
          times the {data.em.baseYear} count, and {fmtInt(data.em.ytd)} more have already come in this year. The rest of
          the pile is big too: {fmtInt(data.total)} cases on record, and of the {fmtInt(data.openedLastYear)} opened in
          the last 12 months, about {fmtPct(data.recentOpenShare * 100)} are still open.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Cases on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Opened in the last 12 months</div>
          <div className="value">{fmtInt(data.openedLastYear)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Of those, still open</div>
          <div className="value">{fmtPct(data.recentOpenShare * 100)}</div>
        </div>
      </div>

      <ChartCard
        title="Emergency cases per year"
        desc={
          <>
            The line barely moved from {data.firstFullYear} through {data.em.baseYear}, never topping{' '}
            {fmtInt(data.em.plateauMax)}. Then it broke: {fmtInt(data.em.lastN)} cases in {data.em.lastYear}.
          </>
        }
        csv={{
          filename: 'emergency-cases-per-year.csv',
          data: toCsv(['year', 'cases'], data.em.yearly.map((r) => [r.y, r.n])),
        }}
        footnote={
          <>
            Counts cover cases whose type starts with Emergency, like &quot;Emergency , LandLord/Tenant&quot;. Whether
            the jump reflects a change in how SDCI files cases or a real rise in urgent conditions, the data alone
            cannot say. The partial current year is left off the chart.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'date_extract_y(opendate) as y, count(*) as n',
            $group: 'y',
            $order: 'y',
            $where: `recordtypedesc LIKE 'Emergency%' AND ${fullYearsWhere}`,
          }),
        }}
      >
        <TrendChart data={data.em.yearly} xKey="y" series={[{ key: 'n', name: 'Emergency cases' }]} valueFormat="compact" height={300} />
      </ChartCard>

      <ChartCard
        title="Cases opened per year, by type"
        desc={
          <>
            Landlord and tenant cases barely existed as a category before {data.llFirstBigYear}. They ran{' '}
            {fmtInt(data.llLastN)} in {data.lastFullYear}, in the same league as weeds and construction.
          </>
        }
        csv={{
          filename: 'violations-by-type-per-year.csv',
          data: toCsv(['year', ...data.typeKeys], data.typeYearly.map((r) => [r.y, ...data.typeKeys.map((k) => (r as Record<string, string | number>)[k])])),
        }}
        footnote={
          <>
            Top five types by all-time count. Blank types are charted as Not classified, and &quot;Emergency , X&quot;
            variants count toward X here. Full years only.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'date_extract_y(opendate) as y, recordtypedesc, count(*) as n',
            $group: 'y,recordtypedesc',
            $where: fullYearsWhere,
            $limit: '5000',
          }),
        }}
      >
        <TrendChart
          data={data.typeYearly}
          xKey="y"
          series={data.typeKeys.map((k) => ({ key: k, name: k }))}
          valueFormat="compact"
          height={340}
        />
      </ChartCard>

      <ChartCard
        title="The 6,000 most recent cases, mapped"
        desc="Each dot is one case. Color shows the five most common kinds. Click a dot to see what it was and when it opened."
        footnote="The map shows recent cases that came with map coordinates."
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'latitude,longitude,recordtypedesc,opendate',
            $where: 'latitude IS NOT NULL',
            $order: 'opendate DESC',
            $limit: '6000',
          }),
        }}
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="What gets reported"
        desc={
          <>
            Land use, weeds, and construction lead the list. {notClass ? fmtInt(notClass.n) : 'n/a'} cases, about{' '}
            {notClass ? fmtPct((notClass.n / data.total) * 100) : 'n/a'} of everything on record, were filed with no
            type at all. Every case is counted somewhere on this chart.
          </>
        }
        csv={{ filename: 'violations-by-type.csv', data: toCsv(['type', 'count'], data.byDesc.map((d) => [d.key, d.n])) }}
        footnote={
          <>
            Blank types appear as Not classified. Types starting &quot;Emergency , &quot; are folded into their base
            type; the emergency chart above counts them on their own. Rarer combination types are grouped as Everything
            else.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'recordtypedesc, count(*) as n',
            $group: 'recordtypedesc',
            $order: 'n DESC',
            $limit: '100',
          }),
        }}
      >
        <RankedBars rows={descRows} valueName="Cases" valueFormat="compact" height={380} />
      </ChartCard>

      <ChartCard
        title="Cases opened per year"
        desc={
          <>
            How many new cases the city took in each year. {peakYear.y} was the busiest year on record, with{' '}
            {fmtInt(peakYear.n)} cases.
          </>
        }
        csv={{ filename: 'violations-per-year.csv', data: toCsv(['year', 'cases'], data.yearly.map((r) => [r.y, r.n])) }}
        footnote={
          <>
            Records begin {data.dataStart}, so the chart starts with {data.firstFullYear}, the first full calendar
            year. The partial current year is left off too.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'date_extract_y(opendate) as y, count(*) as n',
            $group: 'y',
            $order: 'y',
            $where: fullYearsWhere,
          }),
        }}
      >
        <TrendChart data={data.yearly} xKey="y" series={[{ key: 'n', name: 'Cases' }]} valueFormat="compact" height={300} />
      </ChartCard>

      <ChartCard
        title={`Weeds complaints spike ${data.weeds.ratio}x every summer`}
        desc={
          <>
            All-time counts by month opened. {data.weeds.peakMonth} has logged {fmtInt(data.weeds.peakN)} weeds cases;{' '}
            {data.weeds.lowMonth} just {fmtInt(data.weeds.lowN)}.
          </>
        }
        csv={{ filename: 'weeds-by-month.csv', data: toCsv(['month', 'cases'], data.weeds.monthly.map((r) => [r.m, r.n])) }}
        footnote={
          <>
            Cases with type Weeds, all years combined, grouped by the month the case opened.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'date_extract_m(opendate) as m, count(*) as n',
            $group: 'm',
            $order: 'm',
            $where: "recordtypedesc = 'Weeds'",
          }),
        }}
      >
        <BarsChart data={data.weeds.monthly} xKey="m" series={[{ key: 'n', name: 'Weeds cases' }]} valueFormat="compact" height={280} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">Type your ZIP or neighborhood to see how it stacks up, by count and per resident.</p>
      </div>
      <AreaCompare data={data.areaByZip} unit="code cases" />

      <div className="caveat">
        <strong>Complaint counts track reporting, not conditions.</strong> Every dot is a complaint someone made to the
        city. A complaint is a report, not a confirmed violation. The city still has to inspect and decide, and many
        cases close with no action. Blocks with more reporters can look worse than blocks with more problems. And open shares shrink as cases age:
        about {fmtPct(data.recentOpenShare * 100)} of the last 12 months&apos; cases are open, but only{' '}
        {fmtPct(data.priorOpenShare * 100)} of the cohort a year older, and {fmtPct(data.openShare * 100)} of all{' '}
        {fmtInt(data.total)} cases ever filed. Most of the recent figure is cases still working through the pipeline.
      </div>

      <RelatedLinks slug="/violations" />
    </>
  );
}
