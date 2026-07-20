import Link from 'next/link';
import { TargetsExplorer } from './TargetsExplorer';

// A personal screening tool. Unlisted: not in the catalog, not in the sitemap,
// and marked noindex so it does not travel on its own.
export const metadata = {
  title: 'Small multifamily targets',
  description: 'A private screening tool for 2 to 4 unit acquisition candidates in Seattle.',
  robots: { index: false, follow: false },
};

export default function TargetsPage() {
  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> Targets
      </p>

      <div className="page-head">
        <p className="eyebrow">Screening tool</p>
        <h1>Small multifamily targets</h1>
        <p>
          Every Seattle parcel that either holds 2 to 4 homes today, or holds one home on land zoned for more. Each
          gets a score from six public signals: assessed value per unit against what small buildings actually sell
          for nearby, how much of the value sits in the land, how many units the zone allows beyond what stands
          there, open code cases, building age and condition, and how long the owner has held it. Click any row or
          dot for the full breakdown and links to the county record.
        </p>
      </div>

      <TargetsExplorer />

      <div className="caveat">
        <strong>Read this before acting on anything here.</strong> This is a screening tool built from public
        records, and every input has limits. Assessed value is not market price. The units a zone
        &quot;allows&quot; is a rough reading of Seattle&apos;s middle housing rules, before lot coverage, setbacks,
        trees, critical areas, and design review have their say; only SDCI can tell you what a lot can really hold.
        An open code case describes a report, not the owner. Sale-price comps pool whole ZIP codes and small
        buildings vary wildly inside one. Nothing here says a property is for sale, and none of it is financial
        advice. Treat the score as a reason to look closer, then verify everything against the{' '}
        <a href="https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx" target="_blank" rel="noopener noreferrer">
          county record
        </a>{' '}
        and a professional before any real step.
      </div>

      <div className="footnote">
        <strong>Sources.</strong> King County Assessor extracts (parcel, residential building, account, sales),
        parcel coordinates from King County GIS, zoning from the assessor&apos;s current-zoning field, open code
        cases from Seattle dataset ez4a-iug7, registered rentals from RRIO (j2xh-c7vt). Rebuilt from fresh extracts
        with scripts/build-targets.mjs. Comps are arm&apos;s-length sales ($100K+) of 2 to 4 unit parcels in the
        last three years.
      </div>
    </>
  );
}
