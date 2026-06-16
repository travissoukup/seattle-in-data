import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { BarsChart, RankedBars } from '@/components/charts';
import { pets } from '@/lib/data';
import { fmtInt, num, toCsv } from '@/lib/format';

export const metadata = { title: 'Seattle by Pet · Exploring Seattle with Data' };

const HOOD: Record<string, string> = {
  '98199': 'Magnolia', '98102': 'Eastlake', '98112': 'Madison Park', '98119': 'Queen Anne',
  '98109': 'South Lake Union', '98105': 'U-District', '98103': 'Wallingford', '98107': 'Ballard',
  '98117': 'Loyal Heights', '98115': 'Ravenna', '98125': 'Lake City', '98116': 'Alki',
  '98136': 'West Seattle', '98106': 'South Park', '98108': 'Beacon Hill', '98118': 'Columbia City',
  '98144': 'Mount Baker', '98122': 'Central District', '98104': 'Pioneer Square', '98121': 'Belltown',
  '98178': 'Rainier Beach', '98126': 'Delridge', '98133': 'Bitter Lake', '98146': 'White Center',
};
const hood = (z: string): string => (HOOD[z] ? `${HOOD[z]} (${z})` : z);

export default function PetsPage() {
  const dogs = num(pets.species.find((s) => s.key === 'Dog')?.n) ?? 0;
  const cats = num(pets.species.find((s) => s.key === 'Cat')?.n) ?? 0;
  const topName = pets.topNames[0]?.key ?? '–';

  const breedBars = pets.topDogBreeds.map((b) => ({ label: b.key, value: b.n }));
  const nameBars = pets.topNames.slice(0, 15).map((b) => ({ label: b.key, value: b.n }));

  // Frenchies vs pit bulls per 100 dogs, for the ZIPs with the most dogs.
  const zipChart = [...pets.zipBreed]
    .sort((a, b) => b.dogs - a.dogs)
    .slice(0, 14)
    .map((z) => ({ hood: hood(z.zip), french: z.frenchPer100, pit: z.pitPer100 }));
  const zipCsv = toCsv(
    ['zip', 'neighborhood', 'dogs', 'french_bulldogs', 'french_per_100', 'pit_bulls', 'pit_per_100'],
    pets.zipBreed.map((z) => [z.zip, HOOD[z.zip] ?? '', z.dogs, z.french, z.frenchPer100, z.pit, z.pitPer100]),
  );

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Delight</p>
        <h1>Seattle by pet</h1>
        <p>
          Every licensed pet in Seattle comes with a species, a breed, a name, and an owner ZIP. It is the
          rare civic dataset that is pure joy, and quietly it is also a map of the city: what people name their
          animals, which breeds they keep, and where. Also, yes, there are goats.
        </p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Licensed dogs</div>
          <div className="value">{fmtInt(dogs)}</div>
          <div className="sub">versus {fmtInt(cats)} cats. Dogs run the town about two to one.</div>
        </div>
        <div className="stat-card">
          <div className="label">Seattle&apos;s top pet name</div>
          <div className="value">{topName}</div>
          <div className="sub">{fmtInt(pets.topNames[0]?.n)} of them, edging out Charlie and Lucy.</div>
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
        title="Seattle is a Labrador town"
        desc="The most common dog breeds among licensed dogs. Labradors and golden retrievers dominate; the small-dog contingent (chihuahuas, miniature poodles) is close behind."
        footnote="Primary breed of licensed dogs. Source: Seattle Pet Licenses (jguv-t9rb)."
      >
        <RankedBars rows={breedBars} valueName="Licensed dogs" valueFormat="int" height={360} />
      </ChartCard>

      <ChartCard
        title="What Seattle names its pets"
        desc="The most popular pet names across all species. Luna reigns; the rest is a roll call of celestial bodies, comfort foods, and good boys."
        footnote="Most common animal names across dogs, cats, and the occasional goat. Source: Seattle Pet Licenses (jguv-t9rb)."
      >
        <RankedBars rows={nameBars} valueName="Pets with this name" valueFormat="int" height={360} />
        <div style={{ marginTop: 16 }}>
          <DataTable
            headers={['Rank', 'Top dog names', 'Top cat names']}
            rows={pets.topDogNames.slice(0, 10).map((d, i) => [i + 1, d.key, pets.topCatNames[i]?.key ?? '–'])}
          />
        </div>
      </ChartCard>

      <ChartCard
        title="Frenchies vs pit bulls: a breed map of class"
        desc="French Bulldogs and pit bulls per 100 licensed dogs, by neighborhood. The two breeds sort almost perfectly by geography: Frenchies in the wealthier north and central ZIPs, pit bulls in the south and southeast. A dog-breed map turns out to be a quiet map of money."
        csv={{ filename: 'seattle-pet-breeds-by-zip.csv', data: zipCsv }}
        footnote="Per-100-dogs rates for ZIPs with at least 150 licensed dogs. ZIP is the owner's, so this maps where owners live, and small downtown ZIPs with few dogs are noisy. Source: Seattle Pet Licenses (jguv-t9rb)."
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
    </>
  );
}
