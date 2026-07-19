import Link from 'next/link';
import data from '@/lib/generated/parks.json';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { FilterableParkMap } from './FilterableParkMap';

export const metadata = {
  title: 'Every park in Seattle',
  description: `Seattle lists ${data.totalRows} parks, but only ${data.scarcity.firePits} have a fire pit, ${data.scarcity.swimBeaches} have a swimming beach, and ${data.scarcity.offLeash} have an off-leash area.`,
};

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];

const FEAT_QUERY =
  'https://data.seattle.gov/resource/xrnu-8eiq.json?%24select=feature_desc,count(*)%20as%20n&%24group=feature_desc&%24order=n%20DESC&%24limit=50';
const PARK_QUERY =
  'https://data.seattle.gov/resource/xrnu-8eiq.json?%24select=pmaid,count(*)%20as%20n&%24group=pmaid&%24order=n%20DESC&%24limit=12';
const MAP_QUERY =
  'https://data.seattle.gov/resource/v5tj-kqhc.json?%24select=pmaid,name,address,x_coord,y_coord&%24limit=6000';

export default function ParksPage() {
  const featureRows = data.features.map((f) => ({ label: f.key, value: f.n }));
  const topFeature = data.features[0];
  const topPark = data.topParks[0];
  const secondPark = data.topParks[1];

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/books-pets-parks">Books, Pets, and Parks</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Books, Pets, and Parks</p>
        <h1>
          Seattle has {fmtInt(data.totalRows)} parks. Only {data.scarcity.firePits} have a fire pit.
        </h1>
        <p>
          The city's feature list tags {fmtInt(data.totalFeatures)} things inside its parks, and the rare stuff is the
          story. Out of {fmtInt(data.totalRows)} parks, {data.scarcity.firePits} have fire pits,{' '}
          {data.scarcity.swimBeaches} have swimming beaches, and {data.scarcity.offLeash} have off-leash areas. At the
          other end, {topPark.name} packs in {fmtInt(topPark.n)} of the {fmtInt(data.featureTypes)} feature types the
          city tracks, more than any other park. The most common feature of all is a {topFeature.key.toLowerCase()},
          in {fmtInt(topFeature.n)} parks.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Parks mapped</div>
          <div className="value">{fmtInt(data.mapped)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Best-stocked park</div>
          <div className="value" style={{ fontSize: 20 }}>
            {topPark.name.replace('Warren G. ', '')} ({fmtInt(topPark.n)} features)
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Parks with a fire pit</div>
          <div className="value">{fmtInt(data.scarcity.firePits)}</div>
        </div>
      </div>

      <ChartCard
        title="The best-stocked parks"
        desc={`Parks ranked by how many of the ${fmtInt(data.featureTypes)} feature types they hold. ${topPark.name} leads with ${fmtInt(topPark.n)}; ${secondPark.name} is next with ${fmtInt(secondPark.n)}.`}
        csv={{
          filename: 'best-stocked-parks.csv',
          data: toCsv(['park', 'feature_count'], data.topParks.map((p) => [p.name, p.n])),
        }}
        footnote="Feature rows are grouped by park id (pmaid) and joined to the address list for names. Each feature type counts once per park, so this measures variety, not quantity."
        source={{ id: 'xrnu-8eiq', query: PARK_QUERY }}
      >
        <RankedBars rows={data.topParks.map((p) => ({ label: p.name, value: p.n }))} valueName="Feature types" valueFormat="int" height={360} />
      </ChartCard>

      <ChartCard
        title="What parks have inside them, common to rare"
        desc={`All ${fmtInt(data.featureTypes)} feature types the city tags. Play areas top the list; fire pits sit at the bottom with ${fmtInt(data.scarcity.firePits)} parks.`}
        csv={{ filename: 'park-features.csv', data: toCsv(['feature', 'count'], data.features.map((f) => [f.key, f.n])) }}
        footnote="Each bar counts how many parks list that feature at least once. A park with two play areas still counts once."
        source={{ id: 'xrnu-8eiq', query: FEAT_QUERY }}
      >
        <RankedBars rows={featureRows} valueName="Parks" valueFormat="int" height={640} />
      </ChartCard>

      <ChartCard
        title="Every park, mapped. Filter by what you need."
        desc="Each dot is one park address. Pick a feature to see only the parks that list it, and click a dot for the park's name, street, and tagged features."
        csv={{
          filename: 'park-addresses.csv',
          data: toCsv(
            ['park', 'address', 'features'],
            data.points.map((p) => [p.name, p.addr, p.features.join('; ')]),
          ),
        }}
        footnote="Points come from each park's listed location in the address dataset. The feature filter uses the separate feature list, joined by park id."
        source={{ id: 'v5tj-kqhc', query: MAP_QUERY }}
      >
        <FilterableParkMap parks={data.points} featureOptions={data.features} color={PALETTE[0]} />
      </ChartCard>

      <div className="caveat">
        <strong>A park can be real and still show zero features here.</strong> The feature list covers{' '}
        {fmtInt(data.coveredParks)} of the {fmtInt(data.totalRows)} parks on the address list, so{' '}
        {fmtInt(data.unlistedParks)} parks carry no tags at all. That usually means nobody entered them, not that the
        park is empty. The same goes the other way: a park can have a restroom or play area that never made it onto
        the list. And the map drops any park without a clean coordinate, though right now every address maps.
      </div>

      <RelatedLinks slug="/parks" />
    </>
  );
}
