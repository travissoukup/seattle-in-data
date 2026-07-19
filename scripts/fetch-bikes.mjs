// Builds src/lib/generated/bikes.json from the Fremont Bridge bike counter (65db-xm6k),
// an hourly count of bikes crossing the Fremont Bridge. Run: node scripts/fetch-bikes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soql, count, num } from './lib/socrata.mjs';

const ID = '65db-xm6k';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'generated', 'bikes.json');

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Total crossings ever counted.
const total = num(soql(ID, { $select: 'sum(fremont_bridge) as s' })[0]?.s);

// Hours of data on record (each row is one hour).
const hoursLogged = count(ID);

// Monthly totals over time.
const monthly = soql(ID, {
  $select: 'date_trunc_ym(date) as ym, sum(fremont_bridge) as n',
  $group: 'ym',
  $order: 'ym',
  $where: 'date > "2013-01-01" AND date < "2026-06-01"',
}).map((r) => ({ ym: (r.ym || '').slice(0, 7), n: num(r.n) }));

// Average crossings per hour-of-day, using the last two years so the pattern
// reflects current riding. avg = sum / number of hours observed.
const RECENT = 'date > "2024-06-01"';
const byHour = soql(ID, {
  $select: 'date_extract_hh(date) as hh, sum(fremont_bridge) as s, count(*) as c',
  $group: 'hh',
  $order: 'hh',
  $where: RECENT,
}).map((r) => ({ hh: num(r.hh), avg: Math.round(num(r.s) / Math.max(1, num(r.c))) }));

// Average crossings per day of week (sum over a day / number of days observed).
const byDowRaw = soql(ID, {
  $select: 'date_extract_dow(date) as dow, sum(fremont_bridge) as s, count(*) as c',
  $group: 'dow',
  $order: 'dow',
  $where: RECENT,
}).map((r) => ({ dow: num(r.dow), s: num(r.s), hours: num(r.c) }));
const byDow = byDowRaw.map((r) => ({
  day: DOW[r.dow],
  avg: Math.round(r.s / Math.max(1, r.hours / 24)),
}));

// Headline figures derived from the aggregates.
const busiest = monthly.reduce((a, b) => (b.n > a.n ? b : a), monthly[0] || { ym: '', n: 0 });
// Peak weekday commute hour, from Mon-Fri only.
const weekdayHours = soql(ID, {
  $select: 'date_extract_hh(date) as hh, sum(fremont_bridge) as s, count(*) as c',
  $group: 'hh',
  $order: 'hh',
  $where: `${RECENT} AND date_extract_dow(date) IN (1,2,3,4,5)`,
}).map((r) => ({ hh: num(r.hh), avg: num(r.s) / Math.max(1, num(r.c)) }));
const peak = weekdayHours.reduce((a, b) => (b.avg > a.avg ? b : a), weekdayHours[0]);
const fmtHour = (h) => {
  const ampm = h < 12 ? 'am' : 'pm';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    hoursLogged,
    busiest: { ym: busiest.ym, n: busiest.n },
    peakHour: { hh: peak.hh, label: fmtHour(peak.hh), avg: Math.round(peak.avg) },
    monthly,
    byHour,
    byDow,
  }),
);
console.log(
  `bikes.json: total=${total} hours=${hoursLogged} months=${monthly.length} busiest=${busiest.ym}(${busiest.n}) peak=${fmtHour(peak.hh)}(${Math.round(peak.avg)})`,
);
console.log('byHour sample:', byHour.slice(7, 10).map((r) => `${r.hh}:00=${r.avg}`).join(', '));
console.log('byDow:', byDow.map((r) => `${r.day}=${r.avg}`).join(', '));
