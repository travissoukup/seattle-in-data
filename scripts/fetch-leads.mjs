// Builds two files from Code Complaints and Violations (ez4a-iug7):
//   public/leads.json               the full property list the explorer fetches
//   src/lib/generated/leads.json    page stats: stuck-case shelf, escalation
//                                   funnel, vacant-building trend and geography
// Run: node scripts/fetch-leads.mjs
//
// A property is any address with at least one code case that is NOT resolved.
// 'Open Duplicate' cases are excluded everywhere: a duplicate report of the
// same problem is not a second problem, so they do not count toward open
// counts or the score. There is NO recency cutoff: the oldest open cases are
// the stuck ones, and they are part of the story. Cases without usable
// coordinates are kept in the list (they just cannot be mapped).
//
// The 0 to 10 score is a plain heuristic from three signals the data supports:
//   severity   how serious the case types are (vacant building and emergency at
//              the top, weeds and noise at the bottom), bumped up when the case
//              has escalated (notice of violation, citation, stop work, etc.)
//   freshness  how recently the newest open case was opened
//   volume     how many open cases the property has
// It is a rough sorting aid, not a judgment about any property or owner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, rows, count, num, inSeattle } from './lib/socrata.mjs';

const ID = 'ez4a-iug7';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Served as a static file so the explorer fetches it at runtime (keeps it out of
// the JS bundle and the page payload).
const OUT = path.join(ROOT, 'public', 'leads.json');
const STATS_OUT = path.join(ROOT, 'src', 'lib', 'generated', 'leads.json');
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const currentYear = today.getUTCFullYear();

// Statuses that mean the case is done. Everything else counts as still open,
// except Open Duplicate, which is excluded outright (see header comment).
const RESOLVED = ['Completed', 'Closed', 'Withdrawn', 'Compliance Achieved', 'Application Completed', 'Reviews Completed'];
const DUPLICATE = 'Open Duplicate';
// Statuses that mean the city escalated the case (bump severity).
const ESCALATED = new Set(['NOV Issued', 'Citation Issued', 'Hazard Correction Order Issued', 'EO Vacate Close Issued', 'EO Repair Restore Issued', 'Stop Work Issued', 'Referred to Law']);

// Map the messy recordtypedesc values to a clean category plus a base severity 1 to 5.
function categorize(descRaw) {
  const d = (descRaw || '').toLowerCase();
  if (d.includes('vacant')) return { cat: 'Vacant building', sev: 5 };
  if (d.includes('emergency')) return { cat: 'Emergency', sev: 5 };
  if (d.includes('landlord') || d.includes('tenant')) return { cat: 'Landlord and tenant', sev: 4 };
  if (d.includes('construction')) return { cat: 'Construction', sev: 4 };
  if (d.includes('shoreline') || d.includes('eca')) return { cat: 'Shoreline or critical area', sev: 3 };
  if (d.includes('land use')) return { cat: 'Land use', sev: 3 };
  if (d.includes('tree')) return { cat: 'Tree', sev: 2 };
  if (d.includes('noise')) return { cat: 'Noise', sev: 2 };
  if (d.includes('weed')) return { cat: 'Weeds and overgrowth', sev: 1 };
  return { cat: 'Other', sev: 2 };
}

function daysBetween(a, b) {
  return Math.round((a - b) / 864e5);
}

async function main() {
  // A few records carry future open dates; keep the snapshot to cases opened by today.
  const openWhere = `opendate <= '${todayStr}' AND statuscurrent NOT IN (${[...RESOLVED, DUPLICATE].map((s) => `'${s}'`).join(',')})`;
  // Open cases are well under 50k, so one pull is enough. No date floor and no
  // coordinate requirement: old and unmapped cases stay in.
  const raw = rows(ID, {
    select: 'recordnum,recordtypedesc,recordtypemapped,opendate,lastinspdate,statuscurrent,originaladdress1,originalzip,latitude,longitude',
    where: openWhere,
    order: 'opendate DESC',
    limit: 50000,
  });
  if (raw.length >= 50000) throw new Error('open-case pull hit the 50k limit; page in batches');

  const byAddr = new Map();
  let noAddr = 0;
  for (const r of raw) {
    const lat0 = num(r.latitude), lng0 = num(r.longitude);
    const hasCoords = r.latitude != null && r.latitude !== '' && inSeattle(lat0, lng0);
    const addr = (r.originaladdress1 || '').trim().toUpperCase();
    if (!addr) { noAddr++; continue; }
    const { cat, sev } = categorize(r.recordtypedesc);
    const opened = (r.opendate || '').slice(0, 10);
    const escalated = ESCALATED.has(r.statuscurrent);
    const caseSev = Math.min(5, sev + (escalated ? 1 : 0));
    if (!byAddr.has(addr)) byAddr.set(addr, { addr, zip: r.originalzip || '', lat: null, lng: null, cases: [] });
    const p = byAddr.get(addr);
    p.cases.push({ num: r.recordnum, cat, type: r.recordtypedesc || cat, opened, status: r.statuscurrent, sev: caseSev, escalated });
    // Use the most recent case's coordinates (when it has usable ones).
    if (hasCoords && opened && (!p._latest || opened > p._latest)) { p._latest = opened; p.lat = lat0; p.lng = lng0; }
  }

  const yearAgo = new Date(today.getTime() - 365 * 864e5).toISOString().slice(0, 10);
  const twoYearAgo = new Date(today.getTime() - 730 * 864e5).toISOString().slice(0, 10);

  const leads = [];
  for (const p of byAddr.values()) {
    p.cases.sort((a, b) => (a.opened < b.opened ? 1 : -1));
    const openCount = p.cases.length;
    const maxSev = Math.max(...p.cases.map((c) => c.sev));
    const latest = p.cases[0].opened;
    const daysSince = daysBetween(today, new Date(latest));
    const severity01 = maxSev / 5;
    const freshness01 = Math.max(0, Math.min(1, 1 - daysSince / 730));
    const volume01 = Math.min(1, openCount / 5);
    const score = Math.round((10 * (0.45 * severity01 + 0.3 * freshness01 + 0.25 * volume01)) * 10) / 10;
    // Trend: newer cases (last year) vs the year before.
    const recent = p.cases.filter((c) => c.opened >= yearAgo).length;
    const prior = p.cases.filter((c) => c.opened < yearAgo && c.opened >= twoYearAgo).length;
    const trend = recent > prior ? 'up' : recent < prior ? 'down' : 'flat';
    const cats = [...new Set(p.cases.map((c) => c.cat))];
    const escalated = p.cases.some((c) => c.escalated);
    leads.push({
      addr: p.addr, zip: p.zip, lat: p.lat == null ? null : r5(p.lat), lng: p.lng == null ? null : r5(p.lng),
      score, openCount, daysSince, latest, trend, cats, escalated,
      topCat: p.cases[0].cat,
      cases: p.cases.slice(0, 8).map((c) => ({ cat: c.cat, opened: c.opened, status: c.status, num: c.num })),
    });
  }
  leads.sort((a, b) => b.score - a.score);

  // Filter facets for the UI.
  const catCount = {};
  for (const l of leads) for (const c of l.cats) catCount[c] = (catCount[c] || 0) + 1;
  const types = Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, n }));
  const zipCount = {};
  for (const l of leads) if (/^98\d{3}$/.test(l.zip)) zipCount[l.zip] = (zipCount[l.zip] || 0) + 1;
  const zips = Object.entries(zipCount).sort((a, b) => a[0].localeCompare(b[0])).map(([key, n]) => ({ key, n }));

  // ---- Page stats -----------------------------------------------------------

  // Open cases by the year they were opened (the stuck-case shelf).
  const yearCount = new Map();
  for (const r of raw) {
    const y = Number((r.opendate || '').slice(0, 4));
    if (y) yearCount.set(y, (yearCount.get(y) || 0) + 1);
  }
  const byYearOpened = [...yearCount.entries()].sort((a, b) => a[0] - b[0]).map(([y, n]) => ({ y, n }));
  const oldestRow = raw[raw.length - 1]; // pull is ordered opendate DESC
  const oldest = { date: (oldestRow.opendate || '').slice(0, 10), year: Number((oldestRow.opendate || '').slice(0, 4)), addr: (oldestRow.originaladdress1 || '').trim() };
  const decadeYear = currentYear - 10;
  const stuckDecadeN = byYearOpened.filter((r) => r.y < decadeYear).reduce((s, r) => s + r.n, 0);

  // Where open cases sit in the process (escalation funnel).
  const statusCount = new Map();
  for (const r of raw) statusCount.set(r.statuscurrent, (statusCount.get(r.statuscurrent) || 0) + 1);
  const funnel = [...statusCount.entries()].sort((a, b) => b[1] - a[1]).map(([status, n]) => ({ status, n }));
  const statusN = (s) => statusCount.get(s) || 0;
  const escalatedCases = funnel.filter((f) => ESCALATED.has(f.status)).reduce((s, f) => s + f.n, 0);
  const escalatedProps = leads.filter((l) => l.escalated).length;

  // How many duplicate reports the whole page excludes.
  const dupExcluded = count(ID, `statuscurrent = '${DUPLICATE}'`);

  // Vacant-building complaints opened per year (all cases, open or resolved).
  // Trim the partial first year of the dataset and the partial current year.
  const mn = soql(ID, { $select: 'min(opendate) as mn' })[0]?.mn || '';
  const dataStart = mn.slice(0, 10);
  const firstYear = Number(mn.slice(0, 4));
  const firstFullYear = mn.slice(5, 10) === '01-01' ? firstYear : firstYear + 1;
  const lastFullYear = currentYear - 1;
  const vacantWhere = `upper(recordtypedesc) LIKE '%VACANT%' AND date_extract_y(opendate) >= ${firstFullYear} AND date_extract_y(opendate) <= ${lastFullYear}`;
  const vacantYearly = soql(ID, {
    $select: 'date_extract_y(opendate) as y, count(*) as n',
    $group: 'y',
    $order: 'y',
    $where: vacantWhere,
  }).map((r) => ({ y: Number(r.y), n: num(r.n) }));
  // Recent trough and the rebound after it, within the last 6 full years.
  const recentWindow = vacantYearly.filter((r) => r.y >= lastFullYear - 5);
  const trough = recentWindow.reduce((a, b) => (b.n < a.n ? b : a));
  const afterTrough = vacantYearly.filter((r) => r.y > trough.y);
  const rebound = afterTrough.length ? afterTrough.reduce((a, b) => (b.n >= a.n ? b : a)) : trough;
  const peak = vacantYearly.reduce((a, b) => (b.n > a.n ? b : a));
  const lastFull = vacantYearly[vacantYearly.length - 1];
  const vacant = {
    yearly: vacantYearly,
    firstFullYear, lastFullYear,
    lastFullN: lastFull.n,
    troughYear: trough.y, troughN: trough.n,
    reboundYear: rebound.y, reboundN: rebound.n,
    upPct: Math.round(((rebound.n - trough.n) / trough.n) * 100),
    peakYear: peak.y, peakN: peak.n,
  };

  // Where open vacant-building cases sit, by ZIP, vs open cases overall.
  const vacantZip = new Map();
  let vacantOpenCases = 0;
  for (const r of raw) {
    if (categorize(r.recordtypedesc).cat !== 'Vacant building') continue;
    vacantOpenCases++;
    const z = r.originalzip || '';
    if (/^98\d{3}$/.test(z)) vacantZip.set(z, (vacantZip.get(z) || 0) + 1);
  }
  const allZip = new Map();
  for (const r of raw) {
    const z = r.originalzip || '';
    if (/^98\d{3}$/.test(z)) allZip.set(z, (allZip.get(z) || 0) + 1);
  }
  const vacantOpenByZip = [...vacantZip.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([zip, n]) => ({ zip, n }));
  const allZipRanked = [...allZip.entries()].sort((a, b) => b[1] - a[1]);
  const vacantTopZip = vacantOpenByZip[0];
  const vacantTopZipOverallRank = allZipRanked.findIndex(([z]) => z === vacantTopZip.zip) + 1;
  const leadTopZip = { zip: allZipRanked[0][0], n: allZipRanked[0][1] };

  const noCoordProps = leads.filter((l) => l.lat == null).length;

  const stats = {
    generatedAt: today.toISOString(), todayStr, currentYear, dataStart,
    openCases: raw.length,
    properties: leads.length,
    dupExcluded,
    noCoordProps, noAddrCases: noAddr,
    escalatedCases, escalatedProps,
    underInvestigation: statusN('Under Investigation'),
    novIssued: statusN('NOV Issued'),
    citationIssued: statusN('Citation Issued'),
    referredToLaw: statusN('Referred to Law'),
    oldest,
    decadeYear, stuckDecadeN,
    openedThisYear: yearCount.get(currentYear) || 0,
    byYearOpened,
    funnel,
    vacant,
    vacantOpenCases,
    vacantOpenByZip,
    vacantTopZip, vacantTopZipOverallRank,
    leadTopZip,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: today.toISOString(), todayStr, total: leads.length, types, zips, leads }));
  fs.mkdirSync(path.dirname(STATS_OUT), { recursive: true });
  fs.writeFileSync(STATS_OUT, JSON.stringify(stats, null, 1));

  console.log(`leads.json: properties=${leads.length} openCases=${raw.length} noAddr=${noAddr} noCoordProps=${noCoordProps} dupExcluded=${dupExcluded}`);
  console.log(`funnel: underInvestigation=${stats.underInvestigation} nov=${stats.novIssued} citation=${stats.citationIssued} law=${stats.referredToLaw} escalatedCases=${escalatedCases}`);
  console.log(`shelf: oldest=${oldest.date} (${oldest.addr}) openedBefore${decadeYear}=${stuckDecadeN} openedThisYear=${stats.openedThisYear}`);
  console.log(`vacant: trough ${vacant.troughYear}=${vacant.troughN} rebound ${vacant.reboundYear}=${vacant.reboundN} (+${vacant.upPct}%) peak ${vacant.peakYear}=${vacant.peakN} last ${vacant.lastFullYear}=${vacant.lastFullN}`);
  console.log(`zips: vacant top ${vacantTopZip.zip}=${vacantTopZip.n} (overall rank #${vacantTopZipOverallRank}) | overall top ${leadTopZip.zip}=${leadTopZip.n}`);
  console.log('score buckets: 8+ =', leads.filter((l) => l.score >= 8).length, '| 6-8 =', leads.filter((l) => l.score >= 6 && l.score < 8).length, '| <6 =', leads.filter((l) => l.score < 6).length);
  console.log('top 3:', leads.slice(0, 3).map((l) => `${l.addr} score=${l.score} (${l.topCat}, ${l.openCount} open)`).join(' | '));
}

main();
