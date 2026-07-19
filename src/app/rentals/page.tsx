import Link from 'next/link';
import data from '@/lib/generated/rentals.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'Where the rentals are | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

// Fixed bucket order so the color for each size stays the same.
const BUCKETS = ['1 unit', '2 to 4', '5 to 20', '20 plus'];

export default function RentalsPage() {
  const colorFor = (t: string) => {
    const i = BUCKETS.indexOf(t);
    return i >= 0 ? PALETTE[i] : GRAY;
  };
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.t}</strong><br/>${p.d}`,
  }));
  const legend = BUCKETS.map((t, i) => ({ label: t, color: PALETTE[i] }));

  const zipRows = data.byZip.map((z) => ({ label: z.key, value: z.n }));

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/housing">Housing</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Housing</p>
        <h1>Where the rentals are</h1>
        <p>
          Seattle makes landlords register their rentals with the city. The list now holds{' '}
          {fmtInt(data.totalProps)} registered properties covering {fmtInt(data.totalUnits)} rental units. Most
          registrations are a single unit, so the typical property on the list is just one home or apartment.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Registered properties</div>
          <div className="value">{fmtInt(data.totalProps)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total registered units</div>
          <div className="value">{fmtInt(data.totalUnits)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Median units per property</div>
          <div className="value">{fmtInt(data.medianUnits)}</div>
        </div>
      </div>

      <ChartCard
        title="The 6,000 most recent registrations, mapped"
        desc="Each dot is one registered property. Color shows how many rental units it has. Click a dot for the count and date."
        footnote="Source: Rental Registration (j2xh-c7vt) on data.seattle.gov. The map shows recent registrations that came with map coordinates."
      >
        <PointMap points={points} legend={legend} height={520} radius={3.5} />
      </ChartCard>

      <ChartCard
        title="Registered units by ZIP code"
        desc="Total rental units on the registry, summed by the property's ZIP. Counts cover the whole list."
        csv={{
          filename: 'rental-units-by-zip.csv',
          data: toCsv(['zip', 'registered_units'], data.byZip.map((z) => [z.key, z.n])),
        }}
        footnote="Source: Rental Registration (j2xh-c7vt). Units are summed from each property's reported unit count."
      >
        <RankedBars rows={zipRows} valueName="Registered units" valueFormat="compact" height={360} />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> Only rentals that registered with the city show up
        here. Plenty of real rentals are missing because the owner never filed or filed late, and registration lags
        what is actually rented out on the ground. A property dropping off the list does not always mean it stopped
        being a rental.
      </div>

      <RelatedLinks slug="/rentals" />
    </>
  );
}
