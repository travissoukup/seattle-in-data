import Link from 'next/link';
import data from '@/lib/generated/permits.json';
import { ChartCard } from '@/components/ChartCard';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { DataTable } from '@/components/DataTable';
import { BarsChart, TrendChart } from '@/components/charts';
import { fmtInt, num, toCsv } from '@/lib/format';

const DATASET = '76t5-zqzr';
const soqlUrl = (params: Record<string, string>) =>
  `https://data.seattle.gov/resource/${DATASET}.json?${new URLSearchParams(params).toString()}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const u = data.unitsStats;
const a = data.aduStats;

export const metadata = {
  title: 'Seattle permits half the new homes it did at the peak · Exploring Seattle with Data',
  description: `Seattle building permits carried ${fmtInt(u.peakAdded)} new homes in ${u.peakYear} and ${fmtInt(u.latestAdded)} in ${u.latestYear}, a ${u.latestVsPeakPct} percent drop; the same data shows no review fast lane for frequent filers.`,
};

export default function PermitsPage() {
  const raw = data.rawByFiler;
  const rawChart = raw.map((r) => ({ bucket: r.bucket.replace(' (1 permit)', '').replace('No contractor recorded', 'No contractor listed'), days: num(r.med_issue_days) }));
  const rawCsv = toCsv(
    ['filer_bucket', 'n', 'median_days_to_issue', 'median_city_review_days', 'median_cycles'],
    raw.map((r) => [r.bucket, r.n, r.med_issue_days, r.med_city_days, r.med_cycles]),
  );
  const ctrl = data.controlledByFiler;
  const ctrlChart = ctrl.map((r) => ({ bucket: r.bucket.replace(' (1 permit)', '').replace('No contractor recorded', 'No contractor listed'), days: num(r.med_city_days) }));
  const ctrlCsv = toCsv(
    ['filer_bucket', 'n', 'median_city_review_days', 'median_cycles'],
    ctrl.map((r) => [r.bucket, r.n, r.med_city_days, r.med_cycles]),
  );

  const unitsCsv = toCsv(
    ['year', 'units_added', 'units_removed', 'net_units'],
    data.unitYears.map((r) => [r.year, r.added, r.removed, r.net]),
  );
  const aduCsv = toCsv(
    ['year', 'adu_permits_issued'],
    data.aduByYear.map((r) => [r.year, r.permits]),
  );

  const blankPct = Math.round(100 - data.contractorFillPct);
  const aduMultiple = (a.peakPermits / a.reformPermits).toFixed(1);
  const cutMonthName = MONTHS[a.partialThroughMonth - 1];

  return (
    <>
      <p className="crumb"><Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> <Link href="/category/permits-and-construction">Permits and Construction</Link></p>
      <div className="page-head">
        <p className="eyebrow">Permits and Construction</p>
        <h1>Seattle permits about half the new homes it did at the {u.peakYear} peak</h1>
        <p>
          The city&apos;s own permit ledger tells the story. Building permits issued in {u.peakYear} carried{' '}
          {fmtInt(u.peakAdded)} new housing units. In {u.lowYear} that fell to {fmtInt(u.lowAdded)}, and the
          latest full year, {u.latestYear}, came in at {fmtInt(u.latestAdded)}: {u.latestVsPeakPct} percent
          below the peak. The same dataset also settles a piece of folk wisdom. Hiring a builder who pulls
          permits all day does not get you through review faster. Both findings are below.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Units permitted, {u.peakYear} peak</div>
          <div className="value">{fmtInt(u.peakAdded)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Units permitted, {u.latestYear}</div>
          <div className="value">{fmtInt(u.latestAdded)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Below the peak</div>
          <div className="value">{u.latestVsPeakPct}%</div>
        </div>
      </div>

      <ChartCard
        title="The housing pipeline, by permit issue year"
        desc={`Housing units added and removed on Seattle building permits, summed by the year the permit was issued. The run-up through ${u.peakYear} and the drop after ${u.peakYear + 1} are both visible; removals stay small throughout.`}
        csv={{ filename: 'housing-units-by-year.csv', data: unitsCsv }}
        footnote={`Sum of the housingunitsadded and housingunitsremoved fields by issue year. The current year is left off because it is not done yet, and years before the dataset covers issuance in volume are trimmed. Units are counted when the permit is issued, not when the building opens.`}
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'date_extract_y(issueddate) as year, sum(housingunitsadded) as added, sum(housingunitsremoved) as removed',
            $where: 'issueddate IS NOT NULL',
            $group: 'year',
            $order: 'year',
          }),
        }}
      >
        <TrendChart
          data={data.unitYears}
          xKey="year"
          series={[
            { key: 'added', name: 'Units added' },
            { key: 'removed', name: 'Units removed' },
          ]}
          valueFormat="int"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title={`The ADU boom is real: ${aduMultiple}x since the ${a.reformYear} reform`}
        desc={`Permits for accessory dwelling units (backyard cottages and in-law units) by issue year. Seattle loosened its ADU rules in ${a.reformYear}, when ${fmtInt(a.reformPermits)} were issued. By ${a.peakYear} that reached ${fmtInt(a.peakPermits)}.`}
        csv={{ filename: 'adu-permits-by-year.csv', data: aduCsv }}
        footnote={`Permits where the dwelling unit type includes Accessory, by issue year. SDCI stopped filling that field after ${cutMonthName} ${a.partialYear}, so the chart ends with ${a.lastFullYear}, the last fully covered year. In the covered months of ${a.partialYear} (January through ${cutMonthName}) there were ${fmtInt(a.partialPermits)} ADU permits, against ${fmtInt(a.priorSameMonths)} in the same months of ${a.partialYear - 1}, so the pace had not slowed when the field went dark.`}
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'date_extract_y(issueddate) as year, count(*) as adu_permits',
            $where: "issueddate IS NOT NULL AND dwellingunittype LIKE '%Accessory%'",
            $group: 'year',
            $order: 'year',
          }),
        }}
      >
        <BarsChart data={data.aduByYear} xKey="year" series={[{ key: 'permits', name: 'ADU permits issued' }]} valueFormat="int" height={300} />
      </ChartCard>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ fontSize: '1.5rem' }}>The permit fast lane that isn&apos;t</h2>
        <p className="desc">
          Applicants swap the same advice: hire a pro who files permits all day and yours sails through. We
          tested it on every plan-reviewed permit applied since {data.windowStartYear}. Bucket the filers by
          how many permits their contractor has ever pulled, then compare how long review takes. If wait time
          tracked the filer, that would be a pay-to-play story. It doesn&apos;t. It tracks the project.
        </p>
      </div>

      <ChartCard
        title="More permits filed does not mean faster review"
        desc="Median calendar days from application to issuance, by the lifetime permit volume of the contractor on the permit. Permits with no contractor listed are not the slow ones; if anything, the busy mid-volume contractors run a little slower."
        csv={{ filename: 'permit-fast-lane.csv', data: rawCsv }}
        footnote={`Plan-reviewed building permits applied ${data.windowStartYear} onward with an issue date, ${fmtInt(data.fastLaneN)} in all. A caution on the biggest bucket: the contractor field is blank on about ${blankPct} percent of permits, so "No contractor recorded" mixes true owner-filers with projects whose builder simply went unrecorded. It is a data gap, not a count of DIY permits.`}
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'permitnum, contractorcompanyname, permittypemapped, applieddate, issueddate, daysplanreviewcity, numberreviewcycles',
            $where: `applieddate>='${data.windowStartYear}-01-01' AND numberreviewcycles>0 AND issueddate IS NOT NULL`,
            $limit: '50000',
          }),
        }}
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
        title="Holding the permit type constant, the fast lane still does not appear"
        desc="Median city-review days within Building-type permits only, so the buckets hold similar categories of work. One-off filers clear review about as fast as the frequent professionals. The only quicker group is a tiny set of very-high-volume filers, almost certainly standardized repeat plans."
        csv={{ filename: 'permit-fast-lane-building-only.csv', data: ctrlCsv }}
        footnote={`Same sample, restricted to permits where the mapped permit type is Building. This controls the permit category, not project scale or complexity, and most of the sample is Building-type to begin with, so it is a weak filter. The high-volume bucket is small (n=${fmtInt(ctrl[ctrl.length - 1]?.n)}).`}
        source={{
          id: DATASET,
          query: soqlUrl({
            $select: 'permitnum, contractorcompanyname, applieddate, issueddate, daysplanreviewcity, numberreviewcycles',
            $where: `applieddate>='${data.windowStartYear}-01-01' AND numberreviewcycles>0 AND issueddate IS NOT NULL AND permittypemapped='Building'`,
            $limit: '50000',
          }),
        }}
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
        <h2 className="section-title">Limits worth knowing before you quote this page</h2>
        <p className="muted" style={{ margin: '0 0 10px' }}>
          The fast-lane result is a debunking, and it survives the caveats, but state it carefully. The
          contractor field is blank on about {blankPct} percent of permits, so the big bucket means &quot;no
          contractor recorded&quot;, not &quot;homeowner&quot;. Even so, the permits that do name a frequent
          contractor take as long or longer in review, so the pay-a-pro speed advantage has nowhere to hide.
          What drives the wait is what you build and how many correction rounds it takes.
        </p>
        <p className="muted" style={{ margin: 0 }}>
          Two more limits. The data names the contractor (the builder), not a permit expediter (the consultant
          some applicants hire purely to navigate the system), so that exact mechanism cannot be measured
          directly. And the housing-pipeline chart counts units on issued permits, which is a leading
          indicator: a permitted unit can still stall before construction. For how SDCI review behaves over
          time, see the companion{' '}
          <a href="https://sdci-watch.vercel.app" target="_blank" rel="noopener noreferrer">
            Seattle Permit Watch
          </a>{' '}
          dashboard.
        </p>
      </div>

      <RelatedLinks slug="/permits" />
    </>
  );
}
