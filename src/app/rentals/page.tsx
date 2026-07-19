import Link from 'next/link';
import data from '@/lib/generated/rentals.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, StackedRankedBars } from '@/components/charts';
import { fmtInt, fmtPct, fmtYear, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = {
  title: 'Two rental markets, one registry',
  description: `On Seattle's rental registry, ${data.big.propShare.toFixed(0)}% of properties hold ${data.big.unitShare.toFixed(0)}% of the units: ${fmtInt(data.big.props)} big buildings account for ${fmtInt(data.big.units)} of ${fmtInt(data.totalUnits)} registered rental units.`,
};

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

// Fixed bucket order so the color for each size stays the same.
const BUCKETS = ['1 unit', '2 to 4', '5 to 19', '20 or more'];

const RES = 'https://data.seattle.gov/resource/j2xh-c7vt.json';
const q = (params: Record<string, string>) => `${RES}?${new URLSearchParams(params).toString()}`;
const BUCKET_CASE =
  'case(rentalhousingunits <= 1, "1 unit", rentalhousingunits <= 4, "2 to 4", rentalhousingunits <= 19, "5 to 19", rentalhousingunits >= 20, "20 or more")';

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

  // Two stacked bars: how properties split by size, and how units split by size.
  const shareRows = [
    Object.fromEntries([
      ['label', 'Share of properties'],
      ...data.sizeBuckets.map((b) => [b.label, Number(b.propShare.toFixed(1))]),
    ]),
    Object.fromEntries([
      ['label', 'Share of units'],
      ...data.sizeBuckets.map((b) => [b.label, Number(b.unitShare.toFixed(1))]),
    ]),
  ] as Array<{ label: string; [key: string]: number | string }>;
  const shareSeries = BUCKETS.map((b) => ({ key: b, name: b }));

  const managerRows = data.topManagers.map((m) => ({ label: m.name, value: m.units }));

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/housing">Housing</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Housing</p>
        <h1>
          {fmtPct(data.big.propShare)} of rental properties hold {fmtPct(data.big.unitShare)} of the units
        </h1>
        <p>
          Seattle makes landlords register their rentals. The registry reads like two markets wearing one name. By
          count it is mostly single homes: {fmtInt(data.single.props)} of {fmtInt(data.totalProps)} registered
          properties are one unit, yet together they hold just {fmtPct(data.single.unitShare)} of the units. By
          units it is big buildings: {fmtInt(data.big.props)} properties with 20 or more units hold{' '}
          {fmtInt(data.big.units)} of the {fmtInt(data.totalUnits)} registered rental units. One more thing to know
          up front: registrations expire after two years, so the list is a current roster that only spans{' '}
          {fmtYear(data.minRegYear)} to {fmtYear(data.maxRegYear)}, not a history.
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
        <div className="stat-card">
          <div className="label">Units in 20-plus buildings</div>
          <div className="value">{fmtPct(data.big.unitShare)}</div>
        </div>
      </div>

      <ChartCard
        title="Most properties are small. Most units are not."
        desc={`The same registry, split two ways. The top bar splits the ${fmtInt(data.totalProps)} properties by size; the bottom bar splits the ${fmtInt(data.totalUnits)} units. Single homes dominate the first and nearly vanish in the second.`}
        csv={{
          filename: 'rental-size-buckets.csv',
          data: toCsv(
            ['size_bucket', 'properties', 'units', 'pct_of_properties', 'pct_of_units'],
            data.sizeBuckets.map((b) => [b.label, b.props, b.units, b.propShare.toFixed(1), b.unitShare.toFixed(1)]),
          ),
        }}
        footnote="Properties are grouped by their reported unit count, then shares are computed against the registry's totals."
        source={{
          id: 'j2xh-c7vt',
          query: q({
            $select: `${BUCKET_CASE} as size_bucket, count(*) as properties, sum(rentalhousingunits) as units`,
            $group: 'size_bucket',
          }),
        }}
      >
        <StackedRankedBars rows={shareRows} series={shareSeries} valueFormat="pct" height={200} />
      </ChartCard>

      <ChartCard
        title="The biggest managers on the registry"
        desc={`Registered units summed by the property contact each landlord listed. ${data.topManagers[0]?.name ?? ''} tops the list with ${fmtInt(data.topManagers[0]?.units)} units across ${fmtInt(data.topManagers[0]?.props)} properties.`}
        csv={{
          filename: 'rental-top-managers.csv',
          data: toCsv(
            ['contact', 'properties', 'units'],
            data.topManagers.map((m) => [m.name, m.props, m.units]),
          ),
        }}
        footnote={`The contact field names a manager or agent, not always the owner, and the raw data often repeats the name twice in one cell, which we collapse. Generic entries like "Property Manager" are dropped, and ${fmtInt(data.blankContacts)} registrations list no contact at all, so real portfolios can be undercounted.`}
        source={{
          id: 'j2xh-c7vt',
          query: q({
            $select: 'propertycontactname, count(*) as properties, sum(rentalhousingunits) as units',
            $group: 'propertycontactname',
            $order: 'units DESC',
            $limit: '25',
          }),
        }}
      >
        <RankedBars rows={managerRows} valueName="Registered units" valueFormat="int" height={400} />
      </ChartCard>

      <ChartCard
        title={`The ${fmtInt(data.points.length)} newest registrations, mapped`}
        desc={`Each dot is one registered property, colored by unit count. Every dot here was filed in ${fmtYear(data.mapMinYear)}, since the newest slice of a rolling registry is always recent renewals. Click a dot for the count and date.`}
        footnote={`The map samples the most recent registrations that came with coordinates; the oldest dot shown was filed ${data.mapMinDate}. Big buildings look underrepresented here because one dot can stand for hundreds of units.`}
        source={{
          id: 'j2xh-c7vt',
          query: q({
            $select: 'latitude,longitude,rentalhousingunits,registereddate,propertyname',
            $where: 'latitude IS NOT NULL',
            $order: 'registereddate DESC',
            $limit: '6000',
          }),
        }}
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
        footnote="Units are summed from each property's reported unit count, grouped by the ZIP on the registration."
        source={{
          id: 'j2xh-c7vt',
          query: q({
            $select: 'originalzip, sum(rentalhousingunits) as units',
            $group: 'originalzip',
            $order: 'units DESC',
            $limit: '12',
          }),
        }}
      >
        <RankedBars rows={zipRows} valueName="Registered units" valueFormat="compact" height={360} />
      </ChartCard>

      <div className="caveat">
        <strong>A roster, not a census.</strong> Registrations last two years and expired ones drop out, so this
        list can never show history, only who is registered right now. It also misses real rentals whose owners
        never filed or filed late, and registration lags what is actually rented out on the ground. A property
        dropping off the list does not always mean it stopped being a rental.
      </div>

      <RelatedLinks slug="/rentals" />
    </>
  );
}
