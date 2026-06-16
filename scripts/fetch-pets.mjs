// Generates src/lib/generated/pets.json from Seattle Pet Licenses (jguv-t9rb).
// Run: SOCRATA_APP_TOKEN=xxx node scripts/fetch-pets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const TOKEN = process.env.SOCRATA_APP_TOKEN ?? '';
const ID = 'jguv-t9rb';
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'pets.json');
const num = (v) => Number(v) || 0;

function soql(params) {
  const args = ['-s', '--max-time', '120', '-H', `X-App-Token: ${TOKEN}`, '-G', `https://data.seattle.gov/resource/${ID}.json`];
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const json = JSON.parse(out);
  if (!Array.isArray(json)) throw new Error(out.slice(0, 200));
  return json;
}
const grp = (sel, where, field, limit = 20) => {
  const p = { $select: `${sel},count(*) AS n`, $group: sel, $order: 'n DESC', $limit: String(limit) };
  if (where) p.$where = where;
  return soql(p).map((r) => ({ key: r[field], n: num(r.n) })).filter((r) => r.key);
};

async function main() {
  const species = grp('species', null, 'species', 10);
  const topDogBreeds = grp('primary_breed', "species='Dog'", 'primary_breed', 15);
  const topCatBreeds = grp('primary_breed', "species='Cat'", 'primary_breed', 10);
  const topNames = grp('animal_s_name', 'animal_s_name IS NOT NULL', 'animal_s_name', 25);
  const topDogNames = grp('animal_s_name', "species='Dog' AND animal_s_name IS NOT NULL", 'animal_s_name', 12);
  const topCatNames = grp('animal_s_name', "species='Cat' AND animal_s_name IS NOT NULL", 'animal_s_name', 12);

  // Frenchies vs pit bulls by ZIP (the gentrification proxy).
  const frenchByZip = grp('zip_code', "primary_breed like '%French%'", 'zip_code', 60);
  const pitByZip = grp('zip_code', "primary_breed like '%Pit Bull%'", 'zip_code', 60);
  const dogsByZip = grp('zip_code', "species='Dog'", 'zip_code', 60);

  const dogTotal = num((await soql({ $select: 'count(*) AS n', $where: "species='Dog'" }))[0]?.n);
  const frenchTotal = num((await soql({ $select: 'count(*) AS n', $where: "primary_breed like '%French%'" }))[0]?.n);
  const pitTotal = num((await soql({ $select: 'count(*) AS n', $where: "primary_breed like '%Pit Bull%'" }))[0]?.n);

  // Per Seattle ZIP: Frenchie and pit-bull share of that ZIP's dogs.
  const byZip = new Map(dogsByZip.filter((z) => /^98\d{3}$/.test(z.key)).map((z) => [z.key, { zip: z.key, dogs: z.n, french: 0, pit: 0 }]));
  for (const z of frenchByZip) if (byZip.has(z.key)) byZip.get(z.key).french = z.n;
  for (const z of pitByZip) if (byZip.has(z.key)) byZip.get(z.key).pit = z.n;
  const zipBreed = [...byZip.values()]
    .filter((z) => z.dogs >= 150)
    .map((z) => ({ ...z, frenchPer100: Math.round((1000 * z.french) / z.dogs) / 10, pitPer100: Math.round((1000 * z.pit) / z.dogs) / 10 }));

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    species, topDogBreeds, topCatBreeds, topNames, topDogNames, topCatNames,
    zipBreed, totals: { dogTotal, frenchTotal, pitTotal },
  }, null, 2));
  console.log(`Wrote pets.json: ${species.length} species, ${topDogBreeds.length} dog breeds, ${topNames.length} names, ${zipBreed.length} zips`);
}
main().catch((e) => { console.error(e); process.exit(1); });
