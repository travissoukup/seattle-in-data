import Link from 'next/link';
import data from '@/lib/generated/building-map.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmtInt, fmtMoney, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'Where Seattle is building | Seattle in Data' };

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

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permits and Construction</p>
        <h1>Where Seattle is building</h1>
        <p>
          Every time someone builds, adds on, or tears down in Seattle, the city issues a building permit. There are{' '}
          {fmtInt(data.total)} of them on record, and {fmtInt(data.lastFullYear)} got issued in 2025 alone. Added up,
          applicants have declared about {fmtMoney(data.totalValue)} in construction work.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Permits on record</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Issued in 2025</div>
          <div className="value">{fmtInt(data.lastFullYear)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Declared construction value</div>
          <div className="value">{fmtMoney(data.totalValue)}</div>
        </div>
      </div>

      <ChartCard
        title="The 6,000 most recent permits, mapped"
        desc="Each dot is one issued permit. Blue is residential, orange is everything not residential. Click a dot for the address and date."
        footnote="Source: Building Permits (76t5-zqzr) on data.seattle.gov. The map shows the most recent issued permits that came with map coordinates."
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="What kind of permits these are"
        desc="Counts cover every permit on record, grouped by type."
        csv={{ filename: 'permits-by-type.csv', data: toCsv(['type', 'count'], data.byType.map((t) => [t.key, t.n])) }}
        footnote="Source: Building Permits (76t5-zqzr)."
      >
        <RankedBars rows={typeRows} valueName="Permits" valueFormat="compact" height={300} />
      </ChartCard>

      <ChartCard
        title="Permits issued per year"
        desc="How many permits the city issued each year since 2010."
        footnote="Source: Building Permits (76t5-zqzr). 2026 is left off because the year is not done."
      >
        <TrendChart
          data={yearly}
          xKey="ym"
          series={[{ key: 'n', name: 'Permits issued' }]}
          valueFormat="compact"
          height={300}
        />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> The construction value is what the applicant declared
        when they filed. It is not the final cost, and it does not include city fees. A permit also is not the same as a
        finished building. Some get issued and never built, and the dot just marks where the paperwork pointed.
      </div>

      <RelatedLinks slug="/building-map" />
    </>
  );
}
