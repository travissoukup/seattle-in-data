import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { BarsChart } from '@/components/charts';
import { permits } from '@/lib/data';
import { fmtInt, num, toCsv } from '@/lib/format';

export const metadata = { title: 'The Permit Fast Lane · Exploring Seattle with Data' };

export default function PermitsPage() {
  const raw = permits.rawByFiler;
  const rawChart = raw.map((r) => ({ bucket: r.bucket.replace(' (1 permit)', '').replace(' (51-200)', ''), days: num(r.med_issue_days) }));
  const rawCsv = toCsv(
    ['filer_bucket', 'n', 'median_days_to_issue', 'median_city_review_days', 'median_cycles'],
    raw.map((r) => [r.bucket, r.n, r.med_issue_days, r.med_city_days, r.med_cycles]),
  );
  const ctrl = permits.controlledByFiler;
  const ctrlChart = ctrl.map((r) => ({ bucket: r.bucket, days: num(r.med_city_days) }));

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Accountability</p>
        <h1>The permit fast lane that isn&apos;t</h1>
        <p>
          Every applicant believes the same thing: hire a pro who does this all day and your permit sails
          through; do it yourself and you wait. It is the kind of folk wisdom that, if true, is a quantified
          accountability story. So we tested it. Take every plan-reviewed Seattle building permit, bucket the
          filers by how many permits they have ever pulled, and compare how long review takes. If the variance
          tracks who you hire, that is pay-to-play. If it tracks what you build, the folk wisdom is wrong.
        </p>
      </div>

      <ChartCard
        title="More permits filed does not mean faster review"
        desc="Median calendar days from application to issuance, by the lifetime permit volume of the filer. The one-off and owner-filed permits are not the slow ones; if anything, the busy mid-volume contractors run a little slower."
        csv={{ filename: 'permit-fast-lane.csv', data: rawCsv }}
        footnote="Plan-reviewed building permits applied 2020 onward. Owner / self is permits with no contractor named. Source: SDCI Building Permits (76t5-zqzr)."
      >
        <BarsChart data={rawChart} xKey="bucket" series={[{ key: 'days', name: 'Median days to issue' }]} valueFormat="days" height={300} />
        <div style={{ marginTop: 16 }}>
          <DataTable
            headers={['Filer (by lifetime permits)', 'Permits', 'Median days to issue', 'City-review days', 'Median cycles']}
            rows={raw.map((r) => [r.bucket, fmtInt(r.n), fmtInt(r.med_issue_days), fmtInt(r.med_city_days), fmtInt(r.med_cycles)])}
          />
        </div>
      </ChartCard>

      <ChartCard
        title="Holding the project type constant, the fast lane disappears"
        desc="Median city-review days within a single permit type (Building), so we are comparing similar work. Owner-filed and one-off permits clear review as fast or faster than the frequent professionals. The only quicker group is a tiny set of very-high-volume filers (about two dozen permits), almost certainly standardized repeat plans."
        footnote="Same dataset, restricted to Building-type permits to control for project type. The 50-plus bucket is small (n=23). Source: SDCI Building Permits (76t5-zqzr)."
      >
        <BarsChart data={ctrlChart} xKey="bucket" series={[{ key: 'days', name: 'Median city-review days' }]} valueFormat="days" height={280} />
        <div style={{ marginTop: 16 }}>
          <DataTable
            headers={['Filer (within Building permits)', 'Permits', 'City-review days', 'Median cycles']}
            rows={ctrl.map((r) => [r.bucket, fmtInt(r.n), fmtInt(r.med_city_days), fmtInt(r.med_cycles)])}
          />
        </div>
      </ChartCard>

      <div className="card" style={{ borderLeft: '4px solid var(--accent-2)' }}>
        <h2 className="section-title">What this does and does not show</h2>
        <p className="muted" style={{ margin: '0 0 10px' }}>
          The honest finding is a debunking: there is no pay-a-pro speed advantage in Seattle permit review.
          The variance is driven by <strong>what you build</strong> (complexity, the number of correction
          cycles), not <strong>who files</strong>. Homeowners self-permit simpler projects, which is exactly
          why we held project type constant, and even then the professional fast lane does not appear.
        </p>
        <p className="muted" style={{ margin: 0 }}>
          Two limits keep this honest. The open data names the <strong>contractor</strong> (the builder), not a{' '}
          <strong>permit expediter</strong> (the consultant some applicants hire purely to navigate the
          system), so the precise &quot;hire an expediter to jump the line&quot; mechanism cannot be measured
          directly; its closest available proxy, filing volume, shows nothing. And review time is calendar days
          a permit was in city review, not a measure of effort. For the full picture of how SDCI review behaves
          over time, see the companion{' '}
          <a href="https://sdci-watch.vercel.app" target="_blank" rel="noopener noreferrer">
            Seattle Permit Watch
          </a>{' '}
          dashboard.
        </p>
      </div>
    </>
  );
}
