// Generates src/lib/generated/pets.json from Seattle Pet Licenses (jguv-t9rb).
// Run: SOCRATA_APP_TOKEN=xxx node scripts/fetch-pets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, rows, num } from './lib/socrata.mjs';

const ID = 'jguv-t9rb';
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'pets.json');

const grp = (sel, where, field, limit = 20) =>
  group(ID, sel, { where, limit }).map((r) => ({ key: r[field], n: r.n })).filter((r) => r.key);

async function main() {
  const species = grp('species', null, 'species', 10);
  const topDogBreeds = grp('primary_breed', "species='Dog'", 'primary_breed', 15);
  const topCatBreeds = grp('primary_breed', "species='Cat'", 'primary_breed', 10);
  const topNames = grp('animal_s_name', 'animal_s_name IS NOT NULL', 'animal_s_name', 25);
  const topDogNames = grp('animal_s_name', "species='Dog' AND animal_s_name IS NOT NULL", 'animal_s_name', 12);
  const topCatNames = grp('animal_s_name', "species='Cat' AND animal_s_name IS NOT NULL", 'animal_s_name', 12);

  // Frenchies vs pit bulls by ZIP (the gentrification proxy). Exact breed match
  // for French Bulldogs: like '%French%' also catches French Brittanys and Spaniels.
  const FRENCH = "primary_breed='Bulldog, French'";
  const frenchByZip = grp('zip_code', FRENCH, 'zip_code', 60);
  const pitByZip = grp('zip_code', "primary_breed like '%Pit Bull%'", 'zip_code', 60);
  const dogsByZip = grp('zip_code', "species='Dog'", 'zip_code', 60);

  const dogTotal = count(ID, "species='Dog'");
  const catTotal = count(ID, "species='Cat'");
  const goatTotal = count(ID, "species='Goat'");
  const totalPets = count(ID);
  const frenchTotal = count(ID, FRENCH);
  const pitTotal = count(ID, "primary_breed like '%Pit Bull%'");

  // Per Seattle ZIP: Frenchie and pit-bull share of that ZIP's dogs.
  const byZip = new Map(dogsByZip.filter((z) => /^98\d{3}$/.test(z.key)).map((z) => [z.key, { zip: z.key, dogs: z.n, french: 0, pit: 0 }]));
  for (const z of frenchByZip) if (byZip.has(z.key)) byZip.get(z.key).french = z.n;
  for (const z of pitByZip) if (byZip.has(z.key)) byZip.get(z.key).pit = z.n;
  const zipBreed = [...byZip.values()]
    .filter((z) => z.dogs >= 150)
    .map((z) => ({ ...z, frenchPer100: Math.round((1000 * z.french) / z.dogs) / 10, pitPer100: Math.round((1000 * z.pit) / z.dogs) / 10 }));

  // Cat share by ZIP: how cat-heavy each neighborhood's licensed pets are.
  // One grouped query with case sums; keep Seattle ZIPs with at least 400 pets.
  const CAT_MIN = 400;
  const catZips = soql(ID, {
    $select: `zip_code, sum(case(species='Cat',1,true,0)) as cats, sum(case(species='Dog',1,true,0)) as dogs, count(*) as total`,
    $group: 'zip_code',
    $order: 'total DESC',
    $limit: '80',
  })
    .filter((r) => /^981\d{2}$/.test(r.zip_code ?? '') && num(r.total) >= CAT_MIN)
    .map((r) => ({
      zip: r.zip_code,
      cats: num(r.cats),
      dogs: num(r.dogs),
      total: num(r.total),
      catPct: Math.round((1000 * num(r.cats)) / num(r.total)) / 10,
    }))
    .sort((a, b) => b.catPct - a.catPct);

  // The goats. All of them.
  const goats = rows(ID, {
    select: 'animal_s_name, zip_code, primary_breed',
    where: "species='Goat'",
    order: 'zip_code',
    limit: 100,
  }).map((g) => ({ name: g.animal_s_name ?? 'Unnamed', zip: g.zip_code ?? '', breed: g.primary_breed ?? '' }));

  // Licensing window: this dataset is active licenses, not a pet census.
  // Compute what share was issued in the current or previous calendar year.
  const thisYear = new Date().getFullYear();
  const recentCount = count(ID, `date_extract_y(license_issue_date) >= ${thisYear - 1}`);
  const recentSharePct = Math.round((1000 * recentCount) / totalPets) / 10;

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    species, topDogBreeds, topCatBreeds, topNames, topDogNames, topCatNames,
    zipBreed, catZips, catZipMin: CAT_MIN, goats,
    totals: { dogTotal, catTotal, goatTotal, totalPets, frenchTotal, pitTotal, recentSharePct, recentSinceYear: thisYear - 1 },
  }, null, 2));
  console.log(`Wrote pets.json: ${species.length} species, ${topDogBreeds.length} dog breeds, ${topNames.length} names, ${zipBreed.length} breed zips, ${catZips.length} cat zips, ${goats.length} goats`);
  console.log(`Totals: ${totalPets} pets (${dogTotal} dogs, ${catTotal} cats, ${goatTotal} goats), ${frenchTotal} French Bulldogs, ${pitTotal} pit bulls, ${recentSharePct}% issued since ${thisYear - 1}`);
  console.log(`Cat share: high ${catZips[0]?.zip} ${catZips[0]?.catPct}%, low ${catZips.at(-1)?.zip} ${catZips.at(-1)?.catPct}%`);
}
main().catch((e) => { console.error(e); process.exit(1); });
