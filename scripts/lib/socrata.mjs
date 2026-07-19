// Shared Socrata helpers for the data-page fetch scripts.
// Uses curl so large responses stream fine. Sends the app token when present
// (set SOCRATA_APP_TOKEN), and works anonymously otherwise with retries.
import { execFileSync } from 'node:child_process';

const TOKEN = process.env.SOCRATA_APP_TOKEN ?? '';
const BASE = 'https://data.seattle.gov/resource';

export function soql(id, params, { tries = 6 } = {}) {
  const args = ['-s', '--max-time', '240', '-H', `X-App-Token: ${TOKEN}`, '-G', `${BASE}/${id}.json`];
  for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
  let last = '';
  for (let i = 0; i < tries; i++) {
    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
      const json = JSON.parse(out);
      if (Array.isArray(json)) return json;
      last = typeof out === 'string' ? out.slice(0, 200) : 'non-array';
    } catch (e) {
      last = String(e.message).slice(0, 200);
    }
    sleep((i + 1) * 4);
  }
  throw new Error(`soql failed for ${id}: ${last}`);
}

export function sleep(seconds) {
  try {
    execFileSync('sleep', [String(seconds)]);
  } catch {
    /* ignore */
  }
}

export const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);

export function count(id, where) {
  const p = { $select: 'count(*) as n' };
  if (where) p.$where = where;
  return num(soql(id, p)[0]?.n);
}

// Group-and-count. sel is one or more columns; returns [{...sel, n}].
export function group(id, sel, { where, order = 'n DESC', limit = 50 } = {}) {
  const p = { $select: `${sel}, count(*) as n`, $group: sel, $order: order, $limit: String(limit) };
  if (where) p.$where = where;
  return soql(id, p).map((r) => ({ ...r, n: num(r.n) }));
}

// Fetch raw rows (for point samples). Always pass a tight $select and a $limit.
export function rows(id, { select = '*', where, order, limit = 5000 } = {}) {
  const p = { $select: select, $limit: String(limit) };
  if (where) p.$where = where;
  if (order) p.$order = order;
  return soql(id, p);
}

// Helper: keep only points inside the Seattle bounding box.
export function inSeattle(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 47.4 && lat < 47.8 && lng > -122.5 && lng < -122.2;
}
