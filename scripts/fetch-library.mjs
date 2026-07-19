// Generates src/lib/generated/library.json from the Seattle Public Library
// "Checkouts by Title" dataset (tmmm-ytt6, ~51M title-month rows) via
// server-side SoQL aggregation, so nothing large is downloaded. Run:
//   SOCRATA_APP_TOKEN=xxx node scripts/fetch-library.mjs
// Preserves the topBooksMonthly section written by fetch-top-books-monthly.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, num } from './lib/socrata.mjs';

const ID = 'tmmm-ytt6';
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated');
const FILE = path.join(DIR, 'library.json');

const NOW_YEAR = new Date().getFullYear();
// Rolling windows, computed from the run date rather than hardcoded.
const TOP_BOOKS_SINCE = NOW_YEAR - 3;
const SEISMO_SINCE = NOW_YEAR - 7;
// Fixed historical event, not a moving cutoff: the ransomware attack that took
// SPL's catalog and checkout systems down at the end of May 2024.
const RANSOM = { year: 2024, month: 5 };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Material-type normalization (case variants collapse; friendly labels).
const MAT_LABEL = {
  BOOK: 'Print book', EBOOK: 'E-book', AUDIOBOOK: 'Audiobook (digital)',
  SOUNDDISC: 'CD / audio disc', VIDEODISC: 'DVD / Blu-ray', VIDEOCASS: 'VHS',
  SONG: 'Song (streaming)', MUSIC: 'Music', MAGAZINE: 'Magazine', MIXED: 'Mixed / kit',
  REGPRINT: 'Print (other)', VIDEO: 'Video (streaming)', ER: 'Electronic resource',
};
const JUNK = /HotSpot|Headphones|Laptop|FlexTech|Uncataloged|Unknown Title|Chromebook|--DWN|--BAL|--GWD/i;

// Titles to trace as the "cultural seismograph" (no apostrophes, to keep SoQL simple).
const SEISMO = [
  { match: 'Lessons in Chemistry', label: 'Lessons in Chemistry', note: 'A book-club juggernaut that surged again when the Apple TV+ series landed in late 2023.' },
  { match: 'Gender Queer', label: 'Gender Queer', note: 'The most-challenged book in America in 2021-2022; bans tend to drive demand, not suppress it.' },
  { match: 'Braiding Sweetgrass', label: 'Braiding Sweetgrass', note: 'No movie, no marketing push: a slow, word-of-mouth phenomenon that kept climbing for years.' },
  { match: 'Fourth Wing', label: 'Fourth Wing', note: 'The 2023 romantasy explosion, almost entirely driven by social media.' },
];

function main() {
  console.log('1/7 grand totals...');
  const tot = soql(ID, { $select: 'sum(checkouts) as total, count(*) as n' })[0];
  const totalCheckouts = num(tot.total);
  const totalRows = num(tot.n);
  console.log(`   ${totalCheckouts.toLocaleString()} checkouts across ${totalRows.toLocaleString()} rows`);

  console.log('2/7 by-year usage...');
  const yu = soql(ID, { $select: 'checkoutyear,usageclass,sum(checkouts) as c', $group: 'checkoutyear,usageclass', $order: 'checkoutyear', $limit: '500' });
  const byYearUsage = yu
    .map((r) => ({ year: num(r.checkoutyear), usage: r.usageclass, checkouts: num(r.c) }))
    .filter((r) => r.year >= 2005);

  console.log('3/7 by-year totals + month coverage...');
  const ym = soql(ID, { $select: 'checkoutyear,checkoutmonth,sum(checkouts) as c', $group: 'checkoutyear,checkoutmonth', $order: 'checkoutyear,checkoutmonth', $limit: '600' });
  const yearMap = new Map();
  for (const r of ym) {
    const y = num(r.checkoutyear);
    if (y < 2005) continue;
    if (!yearMap.has(y)) yearMap.set(y, { year: y, checkouts: 0, months: 0 });
    const row = yearMap.get(y);
    row.checkouts += num(r.c);
    row.months += 1;
  }
  const byYear = [...yearMap.values()].sort((a, b) => a.year - b.year);
  const fullYears = byYear.filter((r) => r.months === 12);
  const record = fullYears.reduce((a, b) => (b.checkouts > a.checkouts ? b : a));
  const priorPeak = fullYears.filter((r) => r.year < record.year).reduce((a, b) => (b.checkouts > a.checkouts ? b : a));
  const last = byYear[byYear.length - 1];
  const partial = last.months < 12 ? last : null;
  const stats = {
    totalCheckouts,
    totalRows,
    firstYear: byYear[0].year,
    firstFullYear: fullYears[0].year,
    latestFullYear: fullYears[fullYears.length - 1].year,
    recordYear: record.year,
    recordCheckouts: record.checkouts,
    priorPeakYear: priorPeak.year,
    priorPeakCheckouts: priorPeak.checkouts,
    partialYear: partial ? partial.year : null,
    partialMonths: partial ? partial.months : null,
    partialThroughMonth: partial ? MONTHS[partial.months - 1] : null,
    partialCheckouts: partial ? partial.checkouts : null,
    partialPaceAnnual: partial ? Math.round((partial.checkouts / partial.months) * 12) : null,
  };
  console.log(`   record ${stats.recordYear}: ${stats.recordCheckouts.toLocaleString()} (old peak ${stats.priorPeakYear}: ${stats.priorPeakCheckouts.toLocaleString()})`);
  if (partial) console.log(`   partial ${partial.year}: ${partial.checkouts.toLocaleString()} through ${stats.partialThroughMonth}, pace ${stats.partialPaceAnnual.toLocaleString()}`);

  console.log('4/7 ransomware window, monthly physical vs digital...');
  const rw = soql(ID, {
    $select: 'checkoutyear,checkoutmonth,usageclass,sum(checkouts) as c',
    $where: `checkoutyear>=${RANSOM.year - 1} AND checkoutyear<=${RANSOM.year + 1}`,
    $group: 'checkoutyear,checkoutmonth,usageclass', $order: 'checkoutyear,checkoutmonth', $limit: '200',
  });
  const rm = new Map();
  for (const r of rw) {
    const key = `${r.checkoutyear}-${String(num(r.checkoutmonth)).padStart(2, '0')}`;
    if (!rm.has(key)) rm.set(key, { ym: key, physical: 0, digital: 0 });
    rm.get(key)[String(r.usageclass).toLowerCase() === 'digital' ? 'digital' : 'physical'] += num(r.c);
  }
  const ransomSeries = [...rm.values()].sort((a, b) => a.ym.localeCompare(b.ym));
  // Compare the last full month before the outage to the low point after it.
  const eventYearPhys = ransomSeries.filter((p) => p.ym.startsWith(`${RANSOM.year}-`));
  const pre = eventYearPhys[RANSOM.month - 2]; // month before the outage month
  const low = eventYearPhys.slice(RANSOM.month - 1).reduce((a, b) => (b.physical < a.physical ? b : a));
  const ransomware = {
    year: RANSOM.year,
    outageMonth: MONTHS[RANSOM.month - 1],
    preMonth: MONTHS[num(pre.ym.slice(5)) - 1],
    prePhysical: pre.physical,
    lowMonth: MONTHS[num(low.ym.slice(5)) - 1],
    lowPhysical: low.physical,
    dropPct: Math.round((1 - low.physical / pre.physical) * 100),
    yearCheckouts: byYear.find((r) => r.year === RANSOM.year)?.checkouts ?? 0,
    prevYearCheckouts: byYear.find((r) => r.year === RANSOM.year - 1)?.checkouts ?? 0,
    series: ransomSeries,
  };
  console.log(`   physical ${ransomware.preMonth} ${ransomware.prePhysical.toLocaleString()} -> ${ransomware.lowMonth} ${ransomware.lowPhysical.toLocaleString()} (${ransomware.dropPct}% drop)`);

  console.log('5/7 e-book vs audiobook race...');
  const fr = soql(ID, {
    $select: 'checkoutyear,upper(materialtype) as mt,sum(checkouts) as c',
    $where: "upper(materialtype) in ('EBOOK','AUDIOBOOK')",
    $group: 'checkoutyear,mt', $order: 'checkoutyear', $limit: '200',
  });
  const frMap = new Map();
  for (const r of fr) {
    const y = num(r.checkoutyear);
    if (!frMap.has(y)) frMap.set(y, { year: y, ebook: 0, audiobook: 0, months: yearMap.get(y)?.months ?? 12 });
    frMap.get(y)[r.mt === 'EBOOK' ? 'ebook' : 'audiobook'] = num(r.c);
  }
  // Trim leading years before the formats meant anything (under 100k combined).
  const raceAll = [...frMap.values()].sort((a, b) => a.year - b.year);
  const raceStart = raceAll.findIndex((r) => r.ebook + r.audiobook >= 100000);
  const formatRace = raceStart >= 0 ? raceAll.slice(raceStart) : [];
  // The most recent year audiobooks took the lead back from e-books (skips the
  // early-2010s blip when both formats were tiny).
  let crossover = null;
  for (let i = formatRace.length - 1; i > 0; i--) {
    if (formatRace[i].audiobook > formatRace[i].ebook && formatRace[i - 1].audiobook <= formatRace[i - 1].ebook) {
      crossover = formatRace[i];
      break;
    }
  }
  const prevLead = crossover ? [...formatRace].reverse().find((r) => r.year < crossover.year && r.audiobook > r.ebook) : null;
  const raceStats = crossover
    ? { year: crossover.year, months: crossover.months, ebook: crossover.ebook, audiobook: crossover.audiobook, prevLeadYear: prevLead ? prevLead.year : null }
    : null;
  console.log(`   ${formatRace.length} years; audiobook crossover: ${raceStats ? `${raceStats.year} (${raceStats.audiobook.toLocaleString()} vs ${raceStats.ebook.toLocaleString()}, prev lead ${raceStats.prevLeadYear})` : 'none'}`);

  console.log('6/7 material types + top books...');
  const mt = soql(ID, { $select: 'materialtype,sum(checkouts) as c', $group: 'materialtype', $order: 'c DESC', $limit: '40' });
  const mm = new Map();
  for (const r of mt) {
    const k = String(r.materialtype || '').toUpperCase();
    if (!k) continue;
    mm.set(k, (mm.get(k) || 0) + num(r.c));
  }
  const materialTypes = [...mm.entries()]
    .map(([type, checkouts]) => ({ type, label: MAT_LABEL[type] || type, checkouts }))
    .sort((a, b) => b.checkouts - a.checkouts)
    .slice(0, 10);

  const tb = soql(ID, {
    $select: 'title,sum(checkouts) as c',
    $where: `checkoutyear>=${TOP_BOOKS_SINCE} AND (materialtype='BOOK' OR upper(materialtype)='EBOOK' OR upper(materialtype)='AUDIOBOOK')`,
    $group: 'title', $order: 'c DESC', $limit: '60',
  });
  const topBooks = tb
    .map((r) => ({ title: String(r.title || '').replace(/\s*\/\s*$/, ''), checkouts: num(r.c) }))
    .filter((b) => b.title && !JUNK.test(b.title))
    .slice(0, 15);

  console.log('7/7 seismograph titles...');
  const seismograph = [];
  for (const t of SEISMO) {
    const rows = soql(ID, {
      $select: 'checkoutyear,checkoutmonth,sum(checkouts) as c',
      $where: `title like '${t.match}%' AND checkoutyear>=${SEISMO_SINCE}`,
      $group: 'checkoutyear,checkoutmonth', $order: 'checkoutyear,checkoutmonth', $limit: '200',
    });
    const series = rows.map((r) => ({
      ym: `${r.checkoutyear}-${String(num(r.checkoutmonth)).padStart(2, '0')}`,
      checkouts: num(r.c),
    }));
    seismograph.push({ label: t.label, note: t.note, series });
    console.log(`   ${t.label}: ${series.length} months`);
  }

  // Carry forward topBooksMonthly (written by fetch-top-books-monthly.mjs).
  let topBooksMonthly = [];
  try {
    topBooksMonthly = JSON.parse(fs.readFileSync(FILE, 'utf8')).topBooksMonthly ?? [];
  } catch { /* first run */ }

  fs.mkdirSync(DIR, { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(),
    stats, byYear, byYearUsage, ransomware, formatRace, raceStats, materialTypes,
    topBooksSince: TOP_BOOKS_SINCE, topBooks, seismographSince: SEISMO_SINCE, seismograph,
    topBooksMonthly,
  };
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2));
  console.log(`Wrote library.json (${byYear.length} years, ${ransomSeries.length} ransom months, ${formatRace.length} race years, ${topBooks.length} books, ${topBooksMonthly.length} monthly books)`);
}

main();
