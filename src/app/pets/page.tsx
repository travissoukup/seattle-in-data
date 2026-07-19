import Link from 'next/link';
import { ChartCard } from '@/components/ChartCard';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { DataTable } from '@/components/DataTable';
import { BarsChart, RankedBars } from '@/components/charts';
import { pets } from '@/lib/data';
import { fmtInt, num, toCsv } from '@/lib/format';

const HOOD: Record<string, string> = {
  '98199': 'Magnolia', '98102': 'Eastlake', '98112': 'Madison Park', '98119': 'Queen Anne',
  '98109': 'South Lake Union', '98105': 'U-District', '98103': 'Wallingford', '98107': 'Ballard',
  '98117': 'Loyal Heights', '98115': 'Ravenna', '98125': 'Lake City', '98116': 'Alki',
  '98136': 'West Seattle', '98106': 'South Park', '98108': 'Beacon Hill', '98118': 'Columbia City',
  '98144': 'Mount Baker', '98122': 'Central District', '98104': 'Pioneer Square', '98121': 'Belltown',
  '98178': 'Rainier Beach', '98126': 'Delridge', '98133': 'Bitter Lake', '98146': 'White Center',
  '98101': 'Downtown', '98177': 'Broadview',
};
const hood = (z: string): string => (HOOD[z] ? `${HOOD[z]} (${z})` : z);

const catHi = pets.catZips[0];
const catLo = pets.catZips[pets.catZips.length - 1];

export const metadata = {
  title: 'Seattle by pet · Exploring Seattle with Data',
  description: `Cats are ${catHi?.catPct}% of licensed pets in ${HOOD[catHi?.zip ?? ''] ?? catHi?.zip} but only ${catLo?.catPct}% in ${HOOD[catLo?.zip ?? ''] ?? catLo?.zip}: Seattle's pet licenses double as a housing-density map.`,
};

const RES = 'https://data.seattle.gov/resource/jguv-t9rb.json';
const q = (params: Record<string, string>) => `${RES}?${new URLSearchParams(params).toString()}`;

export default function PetsPage() {
  const dogs = num(pets.species.find((s) => s.key === 'Dog')?.n) ?? 0;
  const cats = num(pets.species.find((s) => s.key === 'Cat')?.n) ?? 0;
  const topName = pets.topNames[0]?.key ?? 'n/a';

  const breedBars = pets.topDogBreeds.map((b) => ({ label: b.key, value: b.n }));
  const nameBars = pets.topNames.slice(0, 15).map((b) => ({ label: b.key, value: b.n }));
  const breedCsv = toCsv(['breed', 'licensed_dogs'], pets.topDogBreeds.map((b) => [b.key, b.n]));
  const nameCsv = toCsv(['name', 'pets'], pets.topNames.map((b) => [b.key, b.n]));

  // Cat share of licensed pets by ZIP, sorted most cat-heavy first.
  const catBars = pets.catZips.map((z) => ({ label: hood(z.zip), value: z.catPct }));
  const catCsv = toCsv(
    ['zip', 'neighborhood', 'cats', 'dogs', 'total_pets', 'cat_pct'],
    pets.catZips.map((z) => [z.zip, HOOD[z.zip] ?? '', z.cats, z.dogs, z.total, z.catPct]),
  );

  // Frenchies vs pit bulls per 100 dogs, for the ZIPs with the most dogs.
  const zipChart = [...pets.zipBreed]
    .sort((a, b) => b.dogs - a.dogs)
    .slice(0, 14)
    .map((z) => ({ hood: hood(z.zip), french: z.frenchPer100, pit: z.pitPer100 }));
  const zipCsv = toCsv(
    ['zip', 'neighborhood', 'dogs', 'french_bulldogs', 'french_per_100', 'pit_bulls', 'pit_per_100'],
    pets.zipBreed.map((z) => [z.zip, HOOD[z.zip] ?? '', z.dogs, z.french, z.frenchPer100, z.pit, z.pitPer100]),
  );

  const goatCsv = toCsv(['name', 'zip', 'neighborhood', 'breed'], pets.goats.map((g) => [g.name, g.zip, HOOD[g.zip] ?? '', g.breed]));

  return (
    <>
      <p className="crumb"><Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> <Link href="/category/books-pets-parks">Books, Pets, and Parks</Link></p>
      <div className="page-head">
        <p className="eyebrow">Delight</p>
        <h1>Cats follow the apartments, Frenchies follow the money</h1>
        <p>
          Seattle&apos;s pet licenses double as a housing map. Cats are {catHi?.catPct}% of licensed pets in{' '}
          {hood(catHi?.zip ?? '')} but only {catLo?.catPct}% out in {hood(catLo?.zip ?? '')}, roughly doubling as
          you move from the single-family edges to the dense core. Dog breeds sort the city a different way:
          French Bulldogs cluster in the wealthier north and central ZIPs, pit bulls in the south and southeast.
          Every licensed pet comes with a species, a breed, a name, and an owner ZIP. Also, yes, there are{' '}
          {fmtInt(pets.totals.goatTotal)} goats, and we list every one of them below.
        </p>
      </div>

      <DataFreshness date={pets.generatedAt} />

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Licensed dogs</div>
          <div className="value">{fmtInt(dogs)}</div>
          <div className="sub">versus {fmtInt(cats)} cats. Dogs run the town about {(dogs / Math.max(cats, 1)).toFixed(1)} to 1.</div>
        </div>
        <div className="stat-card">
          <div className="label">Seattle&apos;s top pet name</div>
          <div className="value">{topName}</div>
          <div className="sub">{fmtInt(pets.topNames[0]?.n)} of them, edging out {pets.topNames[1]?.key} and {pets.topNames[2]?.key}.</div>
        </div>
        <div className="stat-card">
          <div className="label">French Bulldogs</div>
          <div className="value">{fmtInt(pets.totals.frenchTotal)}</div>
          <div className="sub">The status dog, clustered in the wealthier north and central ZIPs.</div>
        </div>
        <div className="stat-card">
          <div className="label">Pit Bulls</div>
          <div className="value">{fmtInt(pets.totals.pitTotal)}</div>
          <div className="sub">More common, and concentrated in the south and southeast.</div>
        </div>
      </div>

      <ChartCard
        title="Cat country is downtown"
        desc={`Cat share of licensed pets by ZIP. The most cat-heavy ZIPs are the apartment-dense core (${HOOD[catHi?.zip ?? ''] ?? ''}, Belltown, Eastlake); the least cat-heavy are single-family edges like ${HOOD[catLo?.zip ?? ''] ?? ''} and West Seattle. Cats live where the apartments are, which makes this a housing-density map told through pets.`}
        csv={{ filename: 'seattle-cat-share-by-zip.csv', data: catCsv }}
        footnote={`Cats as a share of all licensed pets, for Seattle ZIPs with at least ${fmtInt(pets.catZipMin)} licensed pets. ZIP is the owner's mailing ZIP.`}
        source={{
          id: 'jguv-t9rb',
          query: q({
            $select: "zip_code, sum(case(species='Cat',1,true,0)) as cats, count(*) as total_pets",
            $group: 'zip_code',
            $order: 'total_pets DESC',
            $limit: '40',
          }),
        }}
      >
        <RankedBars rows={catBars} valueName="Cat share of licensed pets" valueFormat="pct" height={520} />
      </ChartCard>

      <ChartCard
        title="Seattle is a Labrador town"
        desc="The most common dog breeds among licensed dogs. Labradors and golden retrievers dominate; the small-dog contingent (chihuahuas, miniature poodles) is close behind."
        csv={{ filename: 'seattle-top-dog-breeds.csv', data: breedCsv }}
        footnote="Primary breed of licensed dogs."
        source={{
          id: 'jguv-t9rb',
          query: q({
            $select: 'primary_breed, count(*) as n',
            $where: "species='Dog'",
            $group: 'primary_breed',
            $order: 'n DESC',
            $limit: '15',
          }),
        }}
      >
        <RankedBars rows={breedBars} valueName="Licensed dogs" valueFormat="int" height={360} />
      </ChartCard>

      <ChartCard
        title="What Seattle names its pets"
        desc="The most popular pet names across all species. Luna reigns; the rest is a roll call of celestial bodies, comfort foods, and good boys."
        csv={{ filename: 'seattle-top-pet-names.csv', data: nameCsv }}
        footnote="Most common animal names across dogs, cats, and the occasional goat."
        source={{
          id: 'jguv-t9rb',
          query: q({
            $select: 'animal_s_name, count(*) as n',
            $where: 'animal_s_name IS NOT NULL',
            $group: 'animal_s_name',
            $order: 'n DESC',
            $limit: '25',
          }),
        }}
      >
        <RankedBars rows={nameBars} valueName="Pets with this name" valueFormat="int" height={360} />
        <div style={{ marginTop: 16 }}>
          <DataTable
            headers={['Rank', 'Top dog names', 'Top cat names']}
            rows={pets.topDogNames.slice(0, 10).map((d, i) => [i + 1, d.key, pets.topCatNames[i]?.key ?? 'n/a'])}
          />
        </div>
      </ChartCard>

      <ChartCard
        title="Frenchies vs pit bulls: a breed map of class"
        desc="French Bulldogs and pit bulls per 100 licensed dogs, by neighborhood. The two breeds sort almost perfectly by geography: Frenchies in the wealthier north and central ZIPs, pit bulls in the south and southeast. A dog-breed map turns out to be a quiet map of money."
        csv={{ filename: 'seattle-pet-breeds-by-zip.csv', data: zipCsv }}
        footnote="Per-100-dogs rates for ZIPs with at least 150 licensed dogs. French Bulldogs are the exact breed 'Bulldog, French'; pit bulls are any breed containing 'Pit Bull'. ZIP is the owner's, so this maps where owners live, and small downtown ZIPs with few dogs are noisy."
        source={{
          id: 'jguv-t9rb',
          query: q({
            $select: "zip_code, count(*) as dogs, sum(case(primary_breed='Bulldog, French',1,true,0)) as french, sum(case(primary_breed like '%Pit Bull%',1,true,0)) as pit",
            $where: "species='Dog'",
            $group: 'zip_code',
            $order: 'dogs DESC',
            $limit: '40',
          }),
        }}
      >
        <BarsChart
          data={zipChart}
          xKey="hood"
          series={[
            { key: 'french', name: 'French Bulldogs / 100 dogs' },
            { key: 'pit', name: 'Pit Bulls / 100 dogs' },
          ]}
          valueFormat="plain"
          height={340}
        />
      </ChartCard>

      <ChartCard
        title="The goats, as promised"
        desc={`Seattle licenses goats too. All ${fmtInt(pets.totals.goatTotal)} of them are miniature goats, and they skew hard toward the south end.`}
        csv={{ filename: 'seattle-licensed-goats.csv', data: goatCsv }}
        footnote="Every licensed goat in the dataset, with the owner's ZIP."
        source={{
          id: 'jguv-t9rb',
          query: q({
            $select: 'animal_s_name, zip_code, primary_breed',
            $where: "species='Goat'",
            $order: 'zip_code',
          }),
        }}
      >
        <DataTable
          headers={['Name', 'Neighborhood']}
          rows={pets.goats.map((g) => [g.name, hood(g.zip)])}
        />
      </ChartCard>

      <div className="caveat">
        <strong>A license list, not a pet census.</strong> Licensing is voluntary in practice and many pets go
        unlicensed, so these {fmtInt(pets.totals.totalPets)} animals are the licensed slice of the city, not all of
        it. The dataset is also a rolling window of active licenses: {pets.totals.recentSharePct}% were issued
        in {pets.totals.recentSinceYear} or later, and older licenses drop out as they expire. If licensing rates
        differ by neighborhood, the geographic patterns above would shift some, so read the maps as strong
        tendencies rather than exact counts.
      </div>

      <RelatedLinks slug="/pets" />
    </>
  );
}
