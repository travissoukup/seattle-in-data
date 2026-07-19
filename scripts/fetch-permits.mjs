// Generates src/lib/generated/permits.json from SDCI Building Permits (76t5-zqzr).
// Three analyses share the dataset:
//  1. The fast-lane test: plan-reviewed permits applied in the last six full
//     years, bucketed by the lifetime permit volume of the contractor named on
//     the permit. The contractor field is blank on ~95% of permits, so the big
//     bucket is "no contractor recorded", not "owner-filed".
//  2. The housing pipeline: sum(housingunitsadded/removed) by issued year.
//  3. The ADU arc: permits with an Accessory dwellingunittype by issued year.
//     SDCI stopped filling dwellingunittype mid-2025, so the series is trimmed
//     to the last calendar year the field covers in full, and the partial tail
//     is reported as a same-months comparison instead.
// Run: SOCRATA_APP_TOKEN=xxx node scripts/fetch-permits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, num } from './lib/socrata.mjs';

const ID = '76t5-zqzr';
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'permits.json');

// Rolling window: the last six full calendar years plus the current one.
const NOW_YEAR = new Date().getFullYear();
const START_YEAR = NOW_YEAR - 6;
const START = `${START_YEAR}-01-01`;

const median = (arr) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function page(params, pageSize = 50000) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const batch = soql(ID, { ...params, $limit: String(pageSize), $offset: String(offset) });
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}

function summarize(rows) {
  return {
    n: rows.length,
    med_issue_days: Math.round(median(rows.map((r) => r.issueDays))),
    med_city_days: Math.round(median(rows.map((r) => r.cityDays))),
    med_cycles: Math.round(median(rows.map((r) => r.cycles))),
  };
}

function main() {
  // ---- 1. Fast lane ----
  // Lifetime permit volume per contractor, across the whole dataset.
  console.log('Fetching lifetime contractor volumes...');
  const lifetime = new Map();
  for (const r of page({
    $select: 'contractorcompanyname, count(*) as n',
    $where: 'contractorcompanyname IS NOT NULL',
    $group: 'contractorcompanyname',
    $order: 'contractorcompanyname',
  })) {
    lifetime.set(r.contractorcompanyname, num(r.n));
  }
  console.log(`  ${lifetime.size} distinct contractor names`);

  // Contractor-field fill rate over the analysis window (all permits, not just plan-reviewed).
  const windowAll = num(soql(ID, { $select: 'count(*) as n', $where: `applieddate>='${START}'` })[0]?.n);
  const windowWithContractor = num(
    soql(ID, { $select: 'count(*) as n', $where: `applieddate>='${START}' AND contractorcompanyname IS NOT NULL` })[0]?.n,
  );

  // The plan-reviewed, issued permits in the window.
  console.log('Fetching plan-reviewed issued permits...');
  const raw = page({
    $select: 'permitnum, contractorcompanyname, permittypemapped, applieddate, issueddate, daysplanreviewcity, numberreviewcycles',
    $where: `applieddate>='${START}' AND numberreviewcycles>0 AND issueddate IS NOT NULL`,
    $order: 'permitnum',
  });
  console.log(`  ${raw.length} permits in the fast-lane sample`);

  const rows = raw.map((r) => ({
    contractor: r.contractorcompanyname || '',
    type: r.permittypemapped || '',
    issueDays: dayDiff(r.applieddate, r.issueddate),
    cityDays: num(r.daysplanreviewcity),
    cycles: num(r.numberreviewcycles),
  }));

  const BUCKETS = [
    { key: 'none', label: 'No contractor recorded' },
    { key: '1', label: 'One-off (1 permit)' },
    { key: '2-10', label: 'Occasional (2-10)' },
    { key: '11-50', label: 'Frequent (11-50)' },
    { key: '51+', label: 'High-volume (51+)' },
  ];
  const bucketOf = (contractor) => {
    if (!contractor) return 'none';
    const v = lifetime.get(contractor) ?? 1;
    if (v === 1) return '1';
    if (v <= 10) return '2-10';
    if (v <= 50) return '11-50';
    return '51+';
  };

  const rawByFiler = BUCKETS.map((b) => {
    const grp = rows.filter((r) => bucketOf(r.contractor) === b.key);
    return { bucket: b.label, ...summarize(grp) };
  });
  const controlledByFiler = BUCKETS.map((b) => {
    const grp = rows.filter((r) => bucketOf(r.contractor) === b.key && r.type === 'Building');
    const s = summarize(grp);
    return { bucket: b.label, n: s.n, med_city_days: s.med_city_days, med_cycles: s.med_cycles };
  });

  // ---- 2. Housing pipeline ----
  console.log('Fetching housing units by issued year...');
  const unitYears = soql(ID, {
    $select: 'date_extract_y(issueddate) as yr, sum(housingunitsadded) as added, sum(housingunitsremoved) as removed, count(*) as n',
    $where: 'issueddate IS NOT NULL',
    $group: 'yr',
    $order: 'yr',
  })
    .map((r) => ({ year: num(r.yr), added: num(r.added), removed: num(r.removed), n: num(r.n) }))
    // Trim the current partial year and the sparse early years before the
    // dataset covers issuance in earnest (a few dozen stray rows per year).
    .filter((r) => r.year < NOW_YEAR && r.n >= 1000)
    .map(({ year, added, removed }) => ({ year, added, removed, net: added - removed }));

  const peak = unitYears.reduce((a, b) => (b.added > a.added ? b : a));
  const afterPeak = unitYears.filter((r) => r.year > peak.year);
  const low = afterPeak.length ? afterPeak.reduce((a, b) => (b.added < a.added ? b : a)) : peak;
  const latest = unitYears[unitYears.length - 1];
  const unitsStats = {
    peakYear: peak.year,
    peakAdded: peak.added,
    lowYear: low.year,
    lowAdded: low.added,
    latestYear: latest.year,
    latestAdded: latest.added,
    latestVsPeakPct: Math.round((1 - latest.added / peak.added) * 100),
  };

  // ---- 3. ADU arc ----
  console.log('Fetching ADU permits by issued year...');
  const ADU_WHERE = "issueddate IS NOT NULL AND dwellingunittype LIKE '%Accessory%'";
  // The dwellingunittype field went blank partway through a year; find the last
  // date it carries any value and trim the series to full field-covered years.
  const fieldMax = soql(ID, {
    $select: 'max(issueddate) as d',
    $where: 'dwellingunittype IS NOT NULL',
  })[0]?.d;
  const fm = new Date(fieldMax);
  const lastFullAduYear = fm.getMonth() === 11 ? fm.getFullYear() : fm.getFullYear() - 1;

  const ADU_CHART_START = 2012; // presentation window: a few years of run-up before the 2019 reform
  const aduAll = soql(ID, {
    $select: 'date_extract_y(issueddate) as yr, count(*) as n',
    $where: ADU_WHERE,
    $group: 'yr',
    $order: 'yr',
  }).map((r) => ({ year: num(r.yr), permits: num(r.n) }));
  const aduByYear = aduAll.filter((r) => r.year >= ADU_CHART_START && r.year <= lastFullAduYear);

  // Same-months comparison for the censored tail (Jan through the last filled month).
  const cutMonth = fm.getMonth() + 1; // 1-12
  const cutYear = fm.getFullYear();
  const partialCount = (year) =>
    num(
      soql(ID, {
        $select: 'count(*) as n',
        $where: `${ADU_WHERE} AND date_extract_y(issueddate)=${year} AND date_extract_m(issueddate)<=${cutMonth}`,
      })[0]?.n,
    );
  const aduPeak = aduByYear.reduce((a, b) => (b.permits > a.permits ? b : a));
  const REFORM_YEAR = 2019;
  const aduReform = aduByYear.find((r) => r.year === REFORM_YEAR) ?? { year: REFORM_YEAR, permits: 0 };
  const aduStats = {
    reformYear: REFORM_YEAR,
    reformPermits: aduReform.permits,
    peakYear: aduPeak.year,
    peakPermits: aduPeak.permits,
    lastFullYear: lastFullAduYear,
    fieldLastFilled: fieldMax,
    partialThroughMonth: cutMonth,
    partialYear: cutYear,
    partialPermits: partialCount(cutYear),
    priorSameMonths: partialCount(cutYear - 1),
  };

  const out = {
    generatedAt: new Date().toISOString(),
    note: `Plan-reviewed Seattle building permits applied ${START_YEAR}+, from SDCI Building Permits (76t5-zqzr). Filers bucketed by the lifetime permit volume of the contractor named on the permit; the contractor field is blank on most permits, so the biggest bucket is 'No contractor recorded'. Days are medians.`,
    windowStartYear: START_YEAR,
    fastLaneN: rows.length,
    contractorFillPct: Math.round((windowWithContractor / windowAll) * 1000) / 10,
    windowAll,
    rawByFiler,
    controlledByFiler,
    unitYears,
    unitsStats,
    aduByYear,
    aduStats,
  };

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2));
  console.log(`Wrote permits.json`);
  console.log(`  fast lane: n=${rows.length}, contractor fill ${out.contractorFillPct}% of ${windowAll}`);
  for (const b of rawByFiler) console.log(`    ${b.bucket}: n=${b.n} issue=${b.med_issue_days} city=${b.med_city_days} cycles=${b.med_cycles}`);
  console.log(`  units: peak ${unitsStats.peakYear}=${unitsStats.peakAdded}, low ${unitsStats.lowYear}=${unitsStats.lowAdded}, latest ${unitsStats.latestYear}=${unitsStats.latestAdded} (${unitsStats.latestVsPeakPct}% below peak)`);
  console.log(`  adu: ${REFORM_YEAR}=${aduStats.reformPermits}, peak ${aduStats.peakYear}=${aduStats.peakPermits}, field filled through ${fieldMax}; partial ${aduStats.partialYear} Jan-M${cutMonth}=${aduStats.partialPermits} vs ${cutYear - 1} same months=${aduStats.priorSameMonths}`);
}

main();
