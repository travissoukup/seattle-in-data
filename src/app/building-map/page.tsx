import Link from 'next/link';
import data from '@/lib/generated/building-map.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtMoneyCompact, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { AreaCompare } from '@/components/AreaCompare';

export const metadata = {
  title: 'Where Seattle is building',
  description: `Seattle permitted ${fmtInt(data.units.lastN)} new housing units in ${data.units.lastY}, ${fmtInt(data.units.dropPct)} percent below the ${data.units.peakY} peak.`,
};

const DS = '76t5-zqzr';
const soqlUrl = (params: Record<string, string>) =>
  `https://data.seattle.gov/resource/${DS}.json?${new URLSearchParams(params).toString()}`;

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function BuildingMapPage() {
  const classColors: Record<string, string> = {
    Residential: PALETTE[0],
    'Non-Residential': PALETTE[1],
  };
  const colorFor = (t: string) => classColors[t] || GRAY;

  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.t}</strong><br/>${p.a}<br/>Issued ${p.d}`,
  }));
  const legend = [
    { label: 'Residential', color: PALETTE[0] },
    { label: 'Non-Residential', color: PALETTE[1] },
    { label: 'Other', color: GRAY },
  ];

  const typeRows = data.byType.map((t) => ({ label: t.key, value: t.n }));
  const yearly = data.yearly;
  const fullYearsWhere = `issueddate >= '${data.firstChartYear}-01-01' AND issueddate < '${data.currentYear}-01-01'`;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permits and Construction</p>
        <h1>
          Seattle permits {fmtInt(data.units.dropPct)}% fewer new homes than it did in {data.units.peakY}
        </h1>
        <p>
          In {data.units.peakY}, the city issued permits for {fmtInt(data.units.peakN)} new housing units. In{' '}
          {data.units.lastY} it was {fmtInt(data.units.lastN)}, and the pipeline has run at roughly half the peak every
          year since {data.units.streakStartY}. The money went the other way: {data.valuePeak.y} set the record for declared
          construction value at {fmtMoneyCompact(data.valuePeak.val)}, on {fmtInt(data.valuePeak.n)} issued permits,{' '}
          {fmtInt(data.countBelowPeakPct)}% below the {data.countPeak.y} count peak. The dataset behind this page holds{' '}
          {fmtInt(data.total)} permit applications worth about {fmtMoneyCompact(data.totalValue)} in declared work, but
          only {fmtInt(data.issued)} of them ever got issued. About {fmtInt(data.neverIssuedPct)}% never did.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">New homes permitted in {data.units.lastY}</div>
          <div className="value">{fmtInt(data.units.lastN)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Below the {data.units.peakY} peak</div>
          <div className="value">{fmtInt(data.units.dropPct)}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Declared value, all applications</div>
          <div className="value">{fmtMoneyCompact(data.totalValue)}</div>
        </div>
      </div>

      <ChartCard
        title="New housing units permitted per year"
        desc={
          <>
            Homes the city cleared for construction, by the year the permit was issued. The {data.units.peakY} peak hit{' '}
            {fmtInt(data.units.peakN)} units; {data.units.lastY} closed at {fmtInt(data.units.lastN)}.
          </>
        }
        csv={{
          filename: 'housing-units-per-year.csv',
          data: toCsv(['year', 'housing_units'], yearly.map((r) => [r.y, r.units])),
        }}
        footnote={
          <>
            Sum of the housingunits field on permits issued each full calendar year, {data.firstChartYear} through{' '}
            {data.lastFullYear}. Units count when the permit is issued, not when anyone moves in, and one big apartment
            project can drop hundreds of units into a single year.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'date_extract_y(issueddate) as y, sum(housingunits) as units',
            $group: 'y',
            $order: 'y',
            $where: fullYearsWhere,
          }),
        }}
      >
        <TrendChart
          data={yearly}
          xKey="y"
          series={[{ key: 'units', name: 'Housing units' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Permits issued per year, residential vs non-residential"
        desc={
          <>
            Homes and everything else move together here. In {data.units.lastY} the city issued{' '}
            {fmtInt(data.lastYearRes)} residential permits and {fmtInt(data.lastYearNonres)} non-residential ones, both
            well under their late-2010s levels.
          </>
        }
        csv={{
          filename: 'permits-per-year-by-class.csv',
          data: toCsv(['year', 'residential', 'non_residential', 'total'], yearly.map((r) => [r.y, r.res, r.nonres, r.n])),
        }}
        footnote={
          <>
            Issued permits grouped by the permitclassmapped field. Full calendar years only; a small number of permits
            carry no class and are counted in the total but neither line.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'date_extract_y(issueddate) as y, permitclassmapped, count(*) as n',
            $group: 'y,permitclassmapped',
            $order: 'y',
            $where: fullYearsWhere,
          }),
        }}
      >
        <TrendChart
          data={yearly}
          xKey="y"
          series={[
            { key: 'res', name: 'Residential' },
            { key: 'nonres', name: 'Non-Residential' },
          ]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Record dollars on fewer permits"
        desc={
          <>
            Declared construction value per year. {data.valuePeak.y} is the biggest year on record at{' '}
            {fmtMoneyCompact(data.valuePeak.val)}, even though the permit count sits {fmtInt(data.countBelowPeakPct)}%
            below its {data.countPeak.y} peak. Fewer, bigger, pricier projects.
          </>
        }
        csv={{
          filename: 'declared-value-per-year.csv',
          data: toCsv(['year', 'declared_value', 'permits'], yearly.map((r) => [r.y, r.val, r.n])),
        }}
        footnote={
          <>
            Sum of estprojectcost on permits issued each full calendar year. Values are what applicants declared at
            filing, in the dollars of that year; no inflation adjustment is applied, which flatters recent years.
          </>
        }
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'date_extract_y(issueddate) as y, sum(estprojectcost) as val, count(*) as n',
            $group: 'y',
            $order: 'y',
            $where: fullYearsWhere,
          }),
        }}
      >
        <TrendChart
          data={yearly}
          xKey="y"
          series={[{ key: 'val', name: 'Declared value' }]}
          valueFormat="money"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title={`The ${fmtInt(data.points.length)} most recent permits, mapped`}
        desc="Each dot is one issued permit. Blue is residential, orange is everything not residential. Click a dot for the address and date."
        footnote="The map shows the most recent issued permits that came with map coordinates."
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'latitude,longitude,permitclassmapped,issueddate,originaladdress1',
            $where: 'issueddate IS NOT NULL AND latitude IS NOT NULL',
            $order: 'issueddate DESC',
            $limit: '6000',
          }),
        }}
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="What kind of permits these are"
        desc="Counts cover every application on record, grouped by type."
        csv={{ filename: 'permits-by-type.csv', data: toCsv(['type', 'count'], data.byType.map((t) => [t.key, t.n])) }}
        footnote="All applications, issued or not, grouped by the permittypemapped field."
        source={{
          id: DS,
          query: soqlUrl({
            $select: 'permittypemapped, count(*) as n',
            $group: 'permittypemapped',
            $order: 'n DESC',
            $limit: '12',
          }),
        }}
      >
        <RankedBars rows={typeRows} valueName="Permits" valueFormat="compact" height={300} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: 22 }}>How does your area compare?</h2>
        <p className="desc">
          Permits issued in the last 12 months, by ZIP. Type yours to see how it stacks up, by count and per resident.
        </p>
      </div>
      <AreaCompare data={data.areaByZip} unit="issued permits" />

      <div className="caveat">
        <strong>A permit is a plan, not a building.</strong> Some issued permits never turn into construction, and about{' '}
        {fmtInt(data.neverIssuedPct)}% of the applications in this dataset never got issued at all. The construction
        value is what the applicant declared when they filed, not the final cost, and it leaves out city fees. Housing
        units are counted the year the permit is issued, so a single tower can spike one year and leave the next looking
        thin. The dot on the map just marks where the paperwork pointed.
      </div>

      <RelatedLinks slug="/building-map" />
    </>
  );
}
