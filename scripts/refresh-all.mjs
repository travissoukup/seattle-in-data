// Re-runs every data fetch script so the site's snapshots stay fresh.
// Used by the weekly GitHub Action and runnable by hand: node scripts/refresh-all.mjs
//
// Skips:
//   fetch-parking.mjs   annual 286M-row files, ~9 minutes, data changes yearly;
//                       run by hand when a new year lands (SKIP_SLOW=0 to include)
//   fetch-library.mjs   needs SOCRATA_APP_TOKEN for the 50M-row checkouts table;
//                       runs automatically when the env var is set
//   build-geo.mjs       geography + ACS population, changes yearly; run by hand
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SLOW = new Set(['fetch-parking.mjs']);
const NEEDS_TOKEN = new Set(['fetch-library.mjs']);
const NEVER = new Set(['refresh-all.mjs', 'build-geo.mjs']);

const scripts = fs
  .readdirSync(HERE)
  .filter((f) => f.endsWith('.mjs') && !NEVER.has(f))
  .sort();

const results = [];
for (const s of scripts) {
  if (SLOW.has(s) && process.env.SKIP_SLOW !== '0') {
    results.push({ s, status: 'skipped (slow; SKIP_SLOW=0 to run)' });
    continue;
  }
  if (NEEDS_TOKEN.has(s) && !process.env.SOCRATA_APP_TOKEN) {
    results.push({ s, status: 'skipped (no SOCRATA_APP_TOKEN)' });
    continue;
  }
  const started = Date.now();
  try {
    execSync(`node ${path.join(HERE, s)}`, { stdio: 'inherit', timeout: 15 * 60 * 1000 });
    results.push({ s, status: `ok (${Math.round((Date.now() - started) / 1000)}s)` });
  } catch (e) {
    results.push({ s, status: `FAILED: ${e.message?.slice(0, 120)}` });
  }
}

console.log('\n=== refresh summary ===');
for (const r of results) console.log(`${r.status.startsWith('FAILED') ? '✗' : '✓'} ${r.s}: ${r.status}`);
const failed = results.filter((r) => r.status.startsWith('FAILED'));
if (failed.length) {
  console.error(`\n${failed.length} script(s) failed`);
  process.exit(1);
}
