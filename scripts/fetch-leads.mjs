// Builds src/lib/generated/leads.json: a property-level "distress" view of open
// code cases, scored 0 to 10. This powers the leads explorer (a free take on the
// kind of tool real-estate folks pay for). Run: node scripts/fetch-leads.mjs
//
// A property is any address with at least one code case that is NOT resolved.
// The score is a plain heuristic from three signals the city data supports:
//   severity   how serious the case types are (vacant building and emergency at
//              the top, weeds and noise at the bottom), bumped up when the case
//              has escalated (notice of violation, citation, stop work, etc.)
//   freshness  how recently the newest open case was opened
//   volume     how many open cases the property has
// It is a rough sorting aid, not a judgment about any property or owner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rows, num, inSeattle } from './lib/socrata.mjs';

const ID = 'ez4a-iug7';
// Served as a static file so the explorer fetches it at runtime (keeps it out of
// the JS bundle and the page payload).
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'leads.json');
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const cutoff = new Date(today.getTime() - 6 * 365 * 864e5).toISOString().slice(0, 10);

// Statuses that mean the case is done. Everything else counts as still open.
const RESOLVED = ['Completed', 'Closed', 'Withdrawn', 'Compliance Achieved', 'Application Completed', 'Reviews Completed'];
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
  const where = `latitude IS NOT NULL AND opendate <= '${todayStr}' AND opendate >= '${cutoff}' AND statuscurrent NOT IN (${RESOLVED.map((s) => `'${s}'`).join(',')})`;
  // Active cases are well under 50k, so one pull is enough.
  const raw = rows(ID, {
    select: 'recordnum,recordtypedesc,recordtypemapped,opendate,lastinspdate,statuscurrent,originaladdress1,originalzip,latitude,longitude',
    where,
    order: 'opendate DESC',
    limit: 50000,
  });

  const byAddr = new Map();
  for (const r of raw) {
    const lat = num(r.latitude), lng = num(r.longitude);
    const addr = (r.originaladdress1 || '').trim().toUpperCase();
    if (!addr || !inSeattle(lat, lng)) continue;
    const { cat, sev } = categorize(r.recordtypedesc);
    const opened = (r.opendate || '').slice(0, 10);
    const escalated = ESCALATED.has(r.statuscurrent);
    const caseSev = Math.min(5, sev + (escalated ? 1 : 0));
    if (!byAddr.has(addr)) byAddr.set(addr, { addr, zip: r.originalzip || '', lat, lng, cases: [] });
    const p = byAddr.get(addr);
    p.cases.push({ num: r.recordnum, cat, type: r.recordtypedesc || cat, opened, status: r.statuscurrent, sev: caseSev, escalated });
    // Use the most recent case's coordinates.
    if (opened && (!p._latest || opened > p._latest)) { p._latest = opened; p.lat = lat; p.lng = lng; }
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
      addr: p.addr, zip: p.zip, lat: r5(p.lat), lng: r5(p.lng),
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

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: today.toISOString(), todayStr, total: leads.length, types, zips, leads }));
  const escalatedN = leads.filter((l) => l.escalated).length;
  console.log(`leads.json: properties=${leads.length} escalated=${escalatedN} types=${types.length} zips=${zips.length}`);
  console.log('score buckets: 8+ =', leads.filter((l) => l.score >= 8).length, '| 6-8 =', leads.filter((l) => l.score >= 6 && l.score < 8).length, '| <6 =', leads.filter((l) => l.score < 6).length);
  console.log('top 3:', leads.slice(0, 3).map((l) => `${l.addr} score=${l.score} (${l.topCat}, ${l.openCount} open)`).join(' | '));
}

main();
