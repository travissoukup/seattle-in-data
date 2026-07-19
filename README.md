# Seattle in Data

Maps and charts of Seattle, built from the city's own open data. Live at **[seattle-data.vercel.app](https://seattle-data.vercel.app)**.

The city publishes public records on almost everything it does: permits, 911 dispatches, code complaints, library checkouts, budgets, pet licenses. Most of it sits in databases few people open. This site turns that data into pages a non-expert can read, with enough depth that an analyst can check every number.

## How it works

- **Data** comes from Seattle's Socrata portals ([data.seattle.gov](https://data.seattle.gov) and [cos-data.seattle.gov](https://cos-data.seattle.gov)) through their public APIs.
- **Fetch scripts** in [`scripts/`](scripts/) run the aggregation queries (SoQL) and write JSON snapshots to `src/lib/generated/` (and `public/` for the largest files). Each script is self-contained and documents its dataset id and filters.
- **Pages** in [`src/app/`](src/app/) are Next.js server components that render the snapshots. Charts are Recharts; maps are Leaflet.
- **Freshness**: a [weekly GitHub Action](.github/workflows/refresh-data.yml) re-runs the fetch scripts, commits the refreshed snapshots, and deploys. Every page shows its "Data as of" date.
- **Geography**: `scripts/build-geo.mjs` builds the Seattle ZIP polygons (Census 2020 ZCTAs) and populations (ACS 5-year via Census Reporter) behind the per-1,000-residents comparison tables.

## Run it locally

```bash
npm install
npm run dev            # http://localhost:3200
node scripts/refresh-all.mjs   # refresh every data snapshot (optional)
```

Individual snapshots: `node scripts/fetch-<name>.mjs`. The library script needs a `SOCRATA_APP_TOKEN` (free from Socrata) because its source table has ~50M rows. The parking script re-reads annual 286M-row files and takes ~9 minutes; it is skipped by the weekly refresh (`SKIP_SLOW=0` to include it).

## Reading the numbers

Reports are not reality, counts are not rates, and every dataset has quirks (NIBRS transitions, self-reported energy figures, rolling registries). The site collects these in one place: [seattle-data.vercel.app/notes](https://seattle-data.vercel.app/notes). Every chart names its source dataset and, where possible, links the exact query behind it.

## Corrections

If a number is wrong, [open an issue](../../issues) with the page and the figure. Confirmed errors get fixed, and the commit history is the change log.

Independent project by Travis Soukup. Not affiliated with the City of Seattle or the Seattle Public Library.
