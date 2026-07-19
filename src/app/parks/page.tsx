import Link from 'next/link';
import data from '@/lib/generated/parks.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'Every park in Seattle | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

export default function ParksPage() {
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: PALETTE[0],
    label: `<strong>${p.name}</strong><br/>${p.addr}`,
  }));
  const legend = [{ label: 'Park', color: PALETTE[0] }];

  const featureRows = data.features.map((f) => ({ label: f.key, value: f.n }));
  const topFeature = data.features[0]?.key;

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/books-pets-parks">Books, Pets, and Parks</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Books, Pets, and Parks</p>
        <h1>Every park in Seattle</h1>
        <p>
          The city keeps an address for {fmtInt(data.totalRows)} parks, and all {fmtInt(data.mapped)} of them landed on
          the map below. A second city list tracks {fmtInt(data.totalFeatures)} features inside those parks. The most
          common one is a {topFeature?.toLowerCase()}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Parks mapped</div>
          <div className="value">{fmtInt(data.mapped)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Features on record</div>
          <div className="value">{fmtInt(data.totalFeatures)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Most common feature</div>
          <div className="value" style={{ fontSize: 20 }}>{topFeature}</div>
        </div>
      </div>

      <ChartCard
        title="Every park, mapped"
        desc="Each dot is one park address. Click a dot to see the park name and street."
        footnote="Source: Park Addresses (v5tj-kqhc) on data.seattle.gov. Points come from each park's listed location."
      >
        <PointMap points={points} legend={legend} height={520} radius={4} />
      </ChartCard>

      <ChartCard
        title="What parks have inside them"
        desc="The most common feature types across all parks. One park can hold several."
        csv={{ filename: 'park-features.csv', data: toCsv(['feature', 'count'], data.features.map((f) => [f.key, f.n])) }}
        footnote="Source: Park Features (xrnu-8eiq). Each row counts how many parks list that feature."
      >
        <RankedBars rows={featureRows} valueName="Parks" valueFormat="int" height={360} />
      </ChartCard>

      <div className="caveat">
        <strong>What this shows, and what it does not.</strong> This is the city's address list for parks, so a park
        without a clean map point gets dropped from the map. The feature list is what the city has tagged, not a full
        inventory, so a park can have a play area or restroom that never made it onto the list.
      </div>

      <RelatedLinks slug="/parks" />
    </>
  );
}
