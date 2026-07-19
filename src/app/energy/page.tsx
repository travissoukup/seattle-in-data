import Link from 'next/link';
import data from '@/lib/generated/energy.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'How much energy buildings use | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

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

  const euiRows = data.euiByType.map((t) => ({ label: t.key, value: Math.round(t.eui) }));
  const countRows = data.byType.map((t) => ({ label: t.key, value: t.n }));

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/getting-around">Getting Around</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Getting Around</p>
        <h1>How much energy buildings use</h1>
        <p>
          Seattle makes its larger buildings report how much energy they burn each year. In {data.year},{' '}
          {fmtInt(data.total)} buildings filed a report. About {Math.round(data.scorePct)}% of them came with an Energy
          Star score, the 1-to-100 grade that says how a building stacks up against similar ones. Together these
          buildings put out roughly {fmtInt(data.ghg)} metric tons of greenhouse gas that year.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Buildings reporting in {data.year}</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Have an Energy Star score</div>
          <div className="value">{Math.round(data.scorePct)}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Greenhouse gas (metric tons)</div>
          <div className="value">{fmtInt(data.ghg)}</div>
        </div>
      </div>

      <ChartCard
        title={`Reporting buildings in ${data.year}, mapped`}
        desc="Each dot is one building that filed a report. Color shows the five most common building types. Click a dot for its name and energy use."
        footnote="Source: Building Energy Benchmarking (teqw-tu6e) on data.seattle.gov. The map shows the most recent reporting buildings that had coordinates, not the full history."
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="Energy used per square foot, by building type"
        desc="Median site EUI, the energy a building uses for each square foot of space. Higher means more energy per foot. Hospitals and labs run hot, apartments run cool."
        csv={{
          filename: 'energy-eui-by-type.csv',
          data: toCsv(['building_type', 'median_site_eui_kbtu_sf', 'buildings'], data.euiByType.map((t) => [t.key, t.eui, t.n])),
        }}
        footnote={`Source: Building Energy Benchmarking (teqw-tu6e), ${data.year}. Site EUI is kBtu per square foot per year. Types with fewer than 5 buildings are dropped.`}
      >
        <RankedBars rows={euiRows} valueName="Site EUI (kBtu/sf)" valueFormat="int" height={320} />
      </ChartCard>

      <ChartCard
        title="How many buildings of each type report"
        desc="Counts cover every building that filed for the latest year."
      >
        <RankedBars rows={countRows} valueName="Buildings" valueFormat="int" height={320} />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> Only larger buildings have to report, so this is not
        every building in Seattle. Small homes, small shops, and most single houses are not here. A high number per
        square foot is not the same as wasting energy. Some uses, like hospitals and labs, just need a lot of power to
        do their job.
      </div>

      <RelatedLinks slug="/energy" />
    </>
  );
}
