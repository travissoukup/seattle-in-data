// Builds src/lib/generated/oversight.json from Office of Police Accountability
// Complaints (hyay-5x7b). Each row is one allegation, so a single complaint can
// span several rows. Run: node scripts/fetch-oversight.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, group, count, num } from './lib/socrata.mjs';

const ID = 'hyay-5x7b';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'oversight.json');

// The finding field mixes three things: no finding yet ("-"), complaints routed
// to a supervisor without a merits decision ("Process as Supv Action"), and
// actual merits decisions. Keep the filters in one place.
const DECIDED = "finding != '-'";
const MERITS = `${DECIDED} AND finding != 'Process as Supv Action'`;
const SUSTAINED = "starts_with(finding, 'Sustained')";

// Chart period: start at a fixed year (earlier years are sparse and are counted
// separately below) and stop before the current, partial year.
const CHART_START_YEAR = 2015;
const CURRENT_YEAR = new Date().getFullYear();

// Findings (the oversight office's own conclusion). Drop the "-" placeholder and
// fold the sustained variants (e.g. "Sustained Rapid Adjudication") into one
// bucket so the chart matches the sustained stat exactly.
const findingRaw = group(ID, 'finding', { limit: 30 }).filter((r) => r.finding && r.finding !== '-');
const findingMap = new Map();
for (const r of findingRaw) {
  const key = r.finding.startsWith('Sustained') ? 'Sustained' : r.finding;
  findingMap.set(key, (findingMap.get(key) ?? 0) + r.n);
}
const byFinding = [...findingMap.entries()]
  .map(([key, n]) => ({ key, n }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 8);

// Top allegation types. Drop the "-" placeholder.
const byAllegation = group(ID, 'allegation', { limit: 14 })
  .map((r) => ({ key: r.allegation, n: r.n }))
  .filter((r) => r.key && r.key !== '-')
  .slice(0, 10);

// Allegations per year, by received date. The current year is partial, so cap
// before it; pre-chart years are counted and reported as an exclusion note.
const yearly = soql(ID, {
  $select: 'date_extract_y(received_date) as y, count(*) as n',
  $group: 'y',
  $order: 'y',
  $where: `received_date >= '${CHART_START_YEAR}-01-01' AND received_date < '${CURRENT_YEAR}-01-01'`,
}).map((r) => ({ y: String(r.y), n: num(r.n) }));
const preChart = count(ID, `received_date < '${CHART_START_YEAR}-01-01'`);
const firstYear = num(String(soql(ID, { $select: 'min(received_date) as mn' })[0]?.mn ?? '').slice(0, 4));

const total = count(ID);
const decided = count(ID, DECIDED);
const merits = count(ID, MERITS);
const supvAction = decided - merits;
const sustained = count(ID, SUSTAINED);
const sustainedPctOfDecided = decided ? (sustained / decided) * 100 : 0;
const sustainedPctOfMerits = merits ? (sustained / merits) * 100 : 0;

// Sustained rate by who filed the complaint, over merits decisions only.
// One query with conditional aggregation so numerator and denominator can't drift.
const SOURCE_MIN_MERITS = 500;
const bySourceRaw = soql(ID, {
  $select: `source, count(*) as merits, sum(case(${SUSTAINED}, 1, true, 0)) as sustained`,
  $where: MERITS,
  $group: 'source',
  $order: 'merits DESC',
  $limit: '20',
});
const bySource = bySourceRaw
  .map((r) => ({ key: r.source, merits: num(r.merits), sustained: num(r.sustained) }))
  .filter((r) => r.key && r.key !== '-' && r.merits >= SOURCE_MIN_MERITS)
  .map((r) => ({ ...r, pct: (r.sustained / r.merits) * 100 }))
  .sort((a, b) => b.pct - a.pct);
const spdInitiated = bySource.find((r) => r.key === 'SPD - Initiated');
const communityMember = bySource.find((r) => r.key === 'Community Member');
const sourceGap = spdInitiated && communityMember && communityMember.pct ? spdInitiated.pct / communityMember.pct : 0;
// How often each source's decided allegations get routed to a supervisor instead
// of a merits decision (context for the gap).
const decidedBySource = group(ID, 'source', { where: DECIDED, limit: 20 });
const communityDecided = num(decidedBySource.find((r) => r.source === 'Community Member')?.n);
const communitySupvPct =
  communityDecided && communityMember ? ((communityDecided - communityMember.merits) / communityDecided) * 100 : 0;

// Sustained rate by allegation type, over merits decisions, for types with
// enough volume that the rate means something.
const ALLEGATION_MIN_MERITS = 500;
const byAllegationRate = soql(ID, {
  $select: `allegation, count(*) as merits, sum(case(${SUSTAINED}, 1, true, 0)) as sustained`,
  $where: MERITS,
  $group: 'allegation',
  $order: 'merits DESC',
  $limit: '40',
})
  .map((r) => ({ key: r.allegation, merits: num(r.merits), sustained: num(r.sustained) }))
  .filter((r) => r.key && r.key !== '-' && r.merits >= ALLEGATION_MIN_MERITS)
  .map((r) => ({ ...r, pct: (r.sustained / r.merits) * 100 }))
  .sort((a, b) => b.pct - a.pct);
const biasRate = byAllegationRate.find((r) => r.key === 'Bias-free Policing');
const videoRate = byAllegationRate.find((r) => r.key === 'Video and Audio Recording');

// What discipline followed a sustained finding. Bucket the long tail of
// resignation/retirement variants so the chart stays readable.
function disciplineBucket(d) {
  if (!d || d === '-') return 'No outcome recorded';
  if (d === 'No Discipline') return 'No discipline';
  if (d.includes('Resigned') || d.includes('Retired')) return 'Resigned or retired instead';
  if (d === 'Termination' || d.startsWith('Terminated')) return 'Termination';
  if (d === 'Other' || d === 'Disciplinary Transfer') return 'Other';
  return d;
}
const disciplineRaw = group(ID, 'discipline', { where: SUSTAINED, limit: 40 });
const disciplineMap = new Map();
for (const r of disciplineRaw) {
  const key = disciplineBucket(r.discipline);
  disciplineMap.set(key, (disciplineMap.get(key) ?? 0) + r.n);
}
const discipline = [...disciplineMap.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
const get = (k) => num(disciplineMap.get(k));
const writtenReprimand = get('Written Reprimand');
const oralReprimand = get('Oral Reprimand');
const suspension = get('Suspension Without Pay');
const termination = get('Termination');
const leftInstead = get('Resigned or retired instead');
const noOutcome = get('No outcome recorded');
const recordedOutcomes = sustained - noOutcome;
const reprimandPctOfRecorded = recordedOutcomes ? ((writtenReprimand + oralReprimand) / recordedOutcomes) * 100 : 0;

const latestFullYear = yearly.length ? yearly[yearly.length - 1] : { y: '', n: 0 };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    decided,
    merits,
    supvAction,
    sustained,
    sustainedPctOfDecided,
    sustainedPctOfMerits,
    firstYear,
    chartStartYear: CHART_START_YEAR,
    preChart,
    latestFullYear,
    byFinding,
    byAllegation,
    yearly,
    bySource,
    sourceGap,
    spdInitiatedPct: spdInitiated?.pct ?? 0,
    spdInitiated: spdInitiated ?? { key: '', merits: 0, sustained: 0, pct: 0 },
    communityMember: communityMember ?? { key: '', merits: 0, sustained: 0, pct: 0 },
    communitySupvPct,
    byAllegationRate,
    allegationMinMerits: ALLEGATION_MIN_MERITS,
    biasRate: biasRate ?? { key: '', merits: 0, sustained: 0, pct: 0 },
    videoRate: videoRate ?? { key: '', merits: 0, sustained: 0, pct: 0 },
    discipline,
    writtenReprimand,
    oralReprimand,
    suspension,
    termination,
    leftInstead,
    noOutcome,
    recordedOutcomes,
    reprimandPctOfRecorded,
  }),
);
console.log(
  `oversight.json: total=${total} decided=${decided} merits=${merits} sustained=${sustained} ` +
    `(${sustainedPctOfDecided.toFixed(1)}% of decided, ${sustainedPctOfMerits.toFixed(1)}% of merits) ` +
    `latest=${latestFullYear.y}/${latestFullYear.n} preChart=${preChart} firstYear=${firstYear}`,
);
console.log(
  'by source:',
  bySource.map((r) => `${r.key} ${r.sustained}/${r.merits} (${r.pct.toFixed(1)}%)`).join(', '),
  `gap=${sourceGap.toFixed(2)}x communitySupvPct=${communitySupvPct.toFixed(1)}%`,
);
console.log(
  'discipline:',
  discipline.map((r) => `${r.key} (${r.n})`).join(', '),
  `reprimandPctOfRecorded=${reprimandPctOfRecorded.toFixed(1)}%`,
);
console.log(
  'allegation rates:',
  byAllegationRate.map((r) => `${r.key} ${r.pct.toFixed(1)}%`).join(', '),
);
