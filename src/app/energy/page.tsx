import Link from 'next/link';
import data from '@/lib/generated/energy.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmt1, fmtInt, fmtPct, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = {
  title: 'Big buildings use less energy per foot, but gas keeps climbing',
  description: `Seattle's median large building used ${Math.abs(Math.round(data.euiChangePct))}% less energy per square foot in ${fmtYear(data.year)} than in ${fmtYear(data.firstYear)}, yet building natural gas use rose ${Math.round(data.gasChangePct)}%.`,
};

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';
const RES = 'https://data.seattle.gov/resource/teqw-tu6e.json';
const q = (params: Record<string, string>) => `${RES}?${new URLSearchParams(params).toString()}`;

/** Compact chart labels for the long official compliance-issue strings. */
const shortIssue = (s: string) =>
  s === 'Portfolio Manager Not Connected to the City of Seattle' ? 'Portfolio Manager not connected' : s;

export default function EnergyPage() {
  const top5 = data.byType.slice(0, 5).map((t) => t.key);
  const colorFor = (t: string) => {
    const i = top5.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.name}</strong><br/>${p.t}<br/>Site EUI: ${p.eui} kBtu/sf`,
  }));
  const legend = [...top5.map((t, i) => ({ label: t, color: PALETTE[i] })), { label: 'Everything else', color: GRAY }];

  const euiTrend = data.yearly.map((r) => ({ y: r.year, eui: r.medEui }));
  const fuelTrend = data.fuel.map((r) => ({ y: r.year, elec: r.elecB, gas: r.gasB }));
  const ghgTrend = data.yearly.map((r) => ({ y: r.year, ghg: r.ghgKtons }));
  const epaRows = data.euiByEpa.map((t) => ({ label: t.key, value: t.eui }));
  const issueRows = data.complianceIssues.map((r) => ({ label: shortIssue(r.key), value: r.n }));
  const countRows = data.byType.map((t) => ({ label: t.key, value: t.n }));
  const labVsApt = Math.round(data.topEpa.eui / data.lowRise.eui);
  const priorSteam = data.steamOutliers.filter((o) => o.name !== data.topGhg.name);
  const priorSteamYears = priorSteam.map((o) => fmtYear(o.year)).sort().join(' and ');

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/getting-around">Getting Around</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Getting Around</p>
        <h1>Big buildings use less energy per foot, but gas keeps climbing</h1>
        <p>
          Seattle makes its larger buildings report their energy use every year. The typical one got leaner: median
          energy use per square foot fell from {fmt1(data.euiFirst)} to {fmt1(data.euiLast)} kBtu between{' '}
          {fmtYear(data.firstYear)} and {fmtYear(data.year)}, even as the number of buildings reporting grew from{' '}
          {fmtInt(data.reportersFirst)} to {fmtInt(data.total)}. The catch is the fuel mix. Natural gas burned in these
          buildings is up {Math.round(data.gasChangePct)}% over the same stretch, while electricity grew{' '}
          {Math.round(data.elecChangePct)}%. And {fmtInt(data.notCompliant)} buildings did not properly report at all
          in {fmtYear(data.year)}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Buildings reporting in {fmtYear(data.year)}</div>
          <div className="value">{fmtInt(data.total)}</div>
          <div className="sub">
            Up from {fmtInt(data.reportersFirst)} in {fmtYear(data.firstYear)}. About {Math.round(data.scorePct)}% have
            an Energy Star score.
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Median energy per square foot</div>
          <div className="value">{fmt1(data.euiLast)} kBtu</div>
          <div className="sub">
            Down {Math.abs(Math.round(data.euiChangePct))}% from {fmt1(data.euiFirst)} in {fmtYear(data.firstYear)}.
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Not compliant in {fmtYear(data.year)}</div>
          <div className="value">{fmtInt(data.notCompliant)}</div>
          <div className="sub">{fmtPct(data.notCompliantPct)} of buildings that were supposed to report.</div>
        </div>
      </div>

      <ChartCard
        title="The typical big building runs leaner than a decade ago"
        desc={`Median site EUI, the energy a building uses per square foot per year. It fell from ${fmt1(data.euiFirst)} kBtu in ${fmtYear(data.firstYear)} to ${fmt1(data.euiLast)} in ${fmtYear(data.year)}. The median dodges the reporting errors that wreck this dataset's totals.`}
        csv={{
          filename: 'energy-median-eui-by-year.csv',
          data: toCsv(
            ['year', 'buildings_reporting', 'median_site_eui_kbtu_sf', 'median_ghg_intensity_kg_sf'],
            data.yearly.map((r) => [r.year, r.n, r.medEui, r.medGhgI]),
          ),
        }}
        footnote={`Median of siteeui_kbtu_sf across all buildings reporting each year. Each datayear is a complete annual compliance cycle. The CSV also carries median GHG intensity, which has stayed between ${data.ghgIMin} and ${data.ghgIMax} kg per square foot the whole time.`}
        source={{
          id: 'teqw-tu6e',
          query: q({
            $select: 'datayear, count(*) as buildings, median(siteeui_kbtu_sf) as median_eui',
            $group: 'datayear',
            $order: 'datayear',
          }),
        }}
      >
        <TrendChart
          data={euiTrend}
          xKey="y"
          series={[{ key: 'eui', name: 'Median site EUI (kBtu/sf)' }]}
          valueFormat="plain"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Gas keeps growing while electricity flattens"
        desc={`Total fuel burned by reporting buildings, in billions of kBtu. Natural gas rose from ${fmt1(data.gasFirstB)} billion kBtu in ${fmtYear(data.firstYear)} to ${fmt1(data.gasLastB)} billion in ${fmtYear(data.year)}, up ${Math.round(data.gasChangePct)}%. Electricity grew ${Math.round(data.elecChangePct)}%, and it has barely moved since the late 2010s. For a city with climate targets, the gas line points the wrong way.`}
        csv={{
          filename: 'energy-fuel-by-year.csv',
          data: toCsv(
            ['year', 'electricity_billion_kbtu', 'natural_gas_billion_kbtu'],
            data.fuel.map((r) => [r.year, r.elecB, r.gasB]),
          ),
        }}
        footnote={`Sums of electricity_kbtu and naturalgas_kbtu by year. ${data.gasOutliers.length === 1 ? 'One record is' : `${data.gasOutliers.length} records are`} excluded as a data-entry error: a nursing home logged ${fmt1(data.gasOutliers[0]?.gasB)} billion kBtu of gas in ${fmtYear(data.gasOutliers[0]?.year)}, hundreds of times a plausible figure and enough to bend the citywide line on its own.`}
        source={{
          id: 'teqw-tu6e',
          query: q({
            $select: 'datayear, sum(electricity_kbtu) as electricity_kbtu, sum(naturalgas_kbtu) as natural_gas_kbtu',
            $where: `naturalgas_kbtu IS NULL OR naturalgas_kbtu < ${data.gasErrorKbtu}`,
            $group: 'datayear',
            $order: 'datayear',
          }),
        }}
      >
        <TrendChart
          data={fuelTrend}
          xKey="y"
          series={[
            { key: 'elec', name: 'Electricity (billion kBtu)' },
            { key: 'gas', name: 'Natural gas (billion kBtu)' },
          ]}
          valueFormat="plain"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="Labs and grocery stores run hot, apartments run cool"
        desc={`Median site EUI by EPA property type in ${fmtYear(data.year)}, the labels readers actually recognize. A lab runs at ${fmt1(data.topEpa.eui)} kBtu per square foot, about ${labVsApt} times the ${fmt1(data.lowRise.eui)} of a low-rise apartment building. High use here is mostly the job, not the waste: refrigeration, ventilation, and round-the-clock equipment.`}
        csv={{
          filename: 'energy-eui-by-property-type.csv',
          data: toCsv(
            ['epa_property_type', 'median_site_eui_kbtu_sf', 'buildings'],
            data.euiByEpa.map((t) => [t.key, t.eui, t.n]),
          ),
        }}
        footnote={`Median siteeui_kbtu_sf by epapropertytype, ${fmtYear(data.year)}, types with at least 10 buildings. Data centers median higher still but only 4 report, so they are dropped.`}
        source={{
          id: 'teqw-tu6e',
          query: q({
            $select: 'epapropertytype, median(siteeui_kbtu_sf) as median_eui, count(*) as buildings',
            $where: `datayear='${data.year}' AND siteeui_kbtu_sf > 0`,
            $group: 'epapropertytype',
            $order: 'median_eui DESC',
          }),
        }}
      >
        <RankedBars rows={epaRows} valueName="Site EUI (kBtu/sf)" valueFormat="int" height={360} />
      </ChartCard>

      <ChartCard
        title="The emissions total we will not headline"
        desc={`Summing every building's reported greenhouse gas gives ${fmtInt(data.ghg)} metric tons for ${fmtYear(data.year)}. Don't trust it. A single row, the UW campus master record, carries ${fmtInt(data.topGhg.ghg)} tons, ${Math.round(data.topGhg.sharePct)}% of the citywide sum, on a steam entry of ${fmt1(data.topGhg.steamKbtu / 1e9)} billion kBtu. Past years double or halve on similar entries: one downtown office logged ${fmt1(priorSteam[0]?.steamB)} billion kBtu of steam in ${priorSteamYears}. The chart shows how wildly the raw sum swings.`}
        csv={{
          filename: 'energy-reported-ghg-by-year.csv',
          data: toCsv(
            ['year', 'reported_ghg_thousand_tons'],
            data.yearly.map((r) => [r.year, r.ghgKtons]),
          ),
        }}
        footnote={`Raw sum of totalghgemissions by year, in thousands of metric tons, shown as reported with no cleaning. A stable alternative: the median building's GHG intensity has sat between ${data.ghgIMin} and ${data.ghgIMax} kg per square foot across every year in the data.`}
        source={{
          id: 'teqw-tu6e',
          query: q({
            $select: 'datayear, sum(totalghgemissions) as ghg_tons',
            $group: 'datayear',
            $order: 'datayear',
          }),
        }}
      >
        <TrendChart
          data={ghgTrend}
          xKey="y"
          series={[{ key: 'ghg', name: 'Reported GHG (thousand metric tons)' }]}
          valueFormat="int"
          height={280}
        />
      </ChartCard>

      <ChartCard
        title={`Why ${fmtInt(data.notCompliant)} buildings were not compliant`}
        desc={`Reporting is mandatory, but ${fmtPct(data.notCompliantPct)} of buildings missed the bar in ${fmtYear(data.year)}. The city logs a reason for each one.`}
        csv={{
          filename: 'energy-compliance-issues.csv',
          data: toCsv(['compliance_issue', 'buildings'], data.complianceIssues.map((r) => [r.key, r.n])),
        }}
        footnote={`Buildings with compliancestatus of Not Compliant in ${fmtYear(data.year)}, grouped by complianceissue. Default Data means the report leaned on placeholder values instead of real meter readings.`}
        source={{
          id: 'teqw-tu6e',
          query: q({
            $select: 'complianceissue, count(*) as buildings',
            $where: `datayear='${data.year}' AND compliancestatus='Not Compliant'`,
            $group: 'complianceissue',
            $order: 'buildings DESC',
          }),
        }}
      >
        <RankedBars rows={issueRows} valueName="Buildings" valueFormat="int" height={220} />
      </ChartCard>

      <ChartCard
        title={`Reporting buildings in ${fmtYear(data.year)}, mapped`}
        desc="Each dot is one building that filed a report. Color shows the five most common building types. Click a dot for its name and energy use."
        footnote="The map shows the most recent reporting buildings that had coordinates, not the full history."
        source={{ id: 'teqw-tu6e' }}
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="How many buildings of each type report"
        desc="Counts cover every building that filed for the latest year, using the city's coarse building-type labels."
        csv={{
          filename: 'energy-buildings-by-type.csv',
          data: toCsv(['building_type', 'buildings'], data.byType.map((t) => [t.key, t.n])),
        }}
        footnote={`Count of reporting buildings by buildingtype, ${fmtYear(data.year)}.`}
        source={{
          id: 'teqw-tu6e',
          query: q({
            $select: 'buildingtype, count(*) as buildings',
            $where: `datayear='${data.year}'`,
            $group: 'buildingtype',
            $order: 'buildings DESC',
          }),
        }}
      >
        <RankedBars rows={countRows} valueName="Buildings" valueFormat="int" height={320} />
      </ChartCard>

      <div className="caveat">
        <strong>These numbers are self-reported, and it shows.</strong> Only larger buildings have to file, so small
        homes and shops are not here. A high number per square foot is not the same as wasting energy; hospitals and
        labs need a lot of power to do their job. And because buildings type in their own figures, one bad entry can
        move a citywide total by half. We flag the worst of those above rather than pretend the totals are clean.
      </div>

      <RelatedLinks slug="/energy" />
    </>
  );
}
