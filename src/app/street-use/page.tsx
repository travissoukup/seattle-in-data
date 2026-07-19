import Link from 'next/link';
import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { StackedRankedBars, TrendChart } from '@/components/charts';
import { sdot } from '@/lib/data';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

const overallShare = Math.round((sdot.overall.meanApp / (sdot.overall.meanApp + sdot.overall.meanCity)) * 100);

export const metadata = {
  title: 'Whose Clock Is It? · Exploring Seattle with Data',
  description: `Across ${fmtInt(sdot.overall.totalIssued)} issued Seattle street-use permits, ${overallShare}% of the average wait sits on the applicant's clock, not the city's, but the city's own review time started creeping back up in ${sdot.muTrend[sdot.muTrend.length - 1]?.year}.`,
};

const days = (v: number): string => `${v % 1 === 0 ? v : v.toFixed(1)} days`;

const DATASET = 'crg2-ssqd';
const DOMAIN = 'cos-data.seattle.gov';
const API = `https://${DOMAIN}/resource/${DATASET}.json`;
const perPermitQuery =
  `${API}?$select=${encodeURIComponent('permitnum, max(permittypedesc) AS type, max(calendardaysplanreviewcity) AS city_days, max(calendardaysinapplicantscontrol) AS applicant_days, max(totalcalendardays) AS total_days')}` +
  `&$where=${encodeURIComponent('issueddate IS NOT NULL')}&$group=permitnum&$limit=50000`;
const muTrendQuery =
  `${API}?$select=${encodeURIComponent('permitnum, max(calendardaysplanreviewcity) AS city_days, max(applieddate) AS applied')}` +
  `&$where=${encodeURIComponent("issueddate IS NOT NULL AND permittypedesc='Minor Utility Permit'")}&$group=permitnum&$limit=50000`;

export default function StreetUsePage() {
  const t = sdot.types;
  const find = (name: string) => t.find((x) => x.type === name);
  const minorUtility = find('Minor Utility Permit');
  const extension = find('ROW Extension Request');
  const utilityMajor = find('Utility Major Permit');
  const umpRevision = find('Utility Major Permit Revision');
  const blockParty = find('Block Party');
  const playStreet = find('Block Party/Play Street');

  // Hero stacked bar: the common permits and how their wait splits. Zero-day
  // types (block parties issue on the spot) are left off; disclosed in the footnote.
  const barRows = t
    .filter((x) => x.meanTotal > 0)
    .sort((a, b) => b.permits - a.permits)
    .slice(0, 14)
    .map((x) => ({ label: x.type, city: x.meanCity, applicant: x.meanApp }));

  // The city-clock trend for the most common permit type.
  const trend = sdot.muTrend;
  const last = trend[trend.length - 1];
  const before = trend.slice(0, -1);
  const low = before.reduce((a, b) => (b.medCity <= a.medCity ? b : a), before[0]);
  const trendRows = trend.map((r) => ({ year: String(r.year), median: r.medCity, mean: r.meanCity }));
  const trendCsv = toCsv(
    ['applied_year', 'permits_issued', 'median_city_days', 'mean_city_days'],
    trend.map((r) => [r.year, r.permits, r.medCity, r.meanCity]),
  );

  const tableRows = [...t]
    .sort((a, b) => b.permits - a.permits)
    .map((x) => [
      x.type,
      fmtInt(x.permits),
      x.meanCity.toFixed(1),
      fmtInt(x.medCity),
      x.meanApp.toFixed(1),
      x.meanTotal.toFixed(1),
      fmtInt(x.medTotal),
      x.applicantShare === null ? 'n/a' : `${x.applicantShare}%`,
    ]);
  const csv = toCsv(
    ['permit_type', 'permits', 'mean_city_days', 'median_city_days', 'mean_applicant_days', 'median_applicant_days', 'mean_total_days', 'median_total_days', 'applicant_share_pct'],
    t.map((x) => [x.type, x.permits, x.meanCity, x.medCity, x.meanApp, x.medApp, x.meanTotal, x.medTotal, x.applicantShare ?? '']),
  );

  return (
    <>
      <p className="crumb"><Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> <Link href="/category/permits-and-construction">Permits and Construction</Link></p>
      <div className="page-head">
        <p className="eyebrow">Accountability</p>
        <h1>Most of the permit wait is on the applicant&apos;s clock</h1>
        <p>
          When a Seattle street-use permit takes weeks to issue, the easy assumption is that City Hall is slow.
          SDOT&apos;s own data says otherwise: across {fmtInt(sdot.overall.totalIssued)} issued permits, {overallShare}%
          of the average wait sat &quot;in the applicant&apos;s control,&quot; not in city review. The city&apos;s clock
          only runs even on heavy engineering like Utility Major Permits. But the city&apos;s half is not standing
          still: for the most common permit type, median city review time bottomed out at {fmtInt(low.medCity)} days
          for {low.year} applications and climbed to {fmtInt(last.medCity)} for {last.year}. This is the SDOT companion
          to <Link href="/permits">The Permit Fast Lane</Link>, which asked the same kind of question of SDCI building permits.
        </p>
      </div>
      <DataFreshness date={sdot.generatedAt} />

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Permits analyzed</div>
          <div className="value">{fmtInt(sdot.overall.totalIssued)}</div>
          <div className="sub">Every issued SDOT street-use permit since 2021. Median one clears in {days(sdot.overall.medTotal)}.</div>
        </div>
        <div className="stat-card">
          <div className="label">ROW Extension Request</div>
          <div className="value">0 city days</div>
          <div className="sub">
            The city does no review at all. The {days(extension?.meanApp ?? 0)} wait is entirely the
            applicant&apos;s, across {fmtInt(extension?.permits ?? 0)} of them.
          </div>
        </div>
        <div className="stat-card">
          <div className="label">The most common permit</div>
          <div className="value">{Math.round(minorUtility?.applicantShare ?? 0)}%</div>
          <div className="sub">
            Of the {days(minorUtility?.meanTotal ?? 0)} a Minor Utility Permit takes ({fmtInt(minorUtility?.permits ?? 0)} pulled),
            this share is the applicant&apos;s, not the city&apos;s.
          </div>
        </div>
        <div className="stat-card">
          <div className="label">City review, {last.year} applications</div>
          <div className="value">{fmtInt(last.medCity)} days</div>
          <div className="sub">
            Median city days for a Minor Utility Permit, up from {fmtInt(low.medCity)} for {low.year}. Pending
            permits aren&apos;t counted yet, so the real rise is larger.
          </div>
        </div>
      </div>

      <ChartCard
        title="For the routine permits, the wait is the applicant's"
        desc="Average days from application to issuance for the most common street-use permit types, split between time in city review (blue) and time in the applicant's control (orange). The high-volume routine permits, extensions, maintenance, container and date-change requests, show almost no city review time. The wait is the applicant getting their submission in order."
        csv={{ filename: 'seattle-sdot-permit-clock.csv', data: csv }}
        footnote={
          <>Mean calendar days per issued permit, deduplicated to one row per permit. City and applicant days sum to
          the total. Permit types that issue in zero days on both clocks are left off this chart because there is no
          wait to split: Block Party ({fmtInt(blockParty?.permits ?? 0)} permits) and Block Party/Play Street
          ({fmtInt(playStreet?.permits ?? 0)}). Source: Seattle Permit Review Time Data, SDOT.</>
        }
        source={{ id: DATASET, domain: DOMAIN, query: perPermitQuery }}
      >
        <StackedRankedBars
          rows={barRows}
          series={[
            { key: 'city', name: 'Days in city review' },
            { key: 'applicant', name: "Days in applicant's control" },
          ]}
          valueFormat="days"
          height={460}
        />
      </ChartCard>

      <ChartCard
        title="The city's clock is creeping back up"
        desc={
          <>City review days for a Minor Utility Permit, the most common street-use permit ({fmtInt(minorUtility?.permits ?? 0)} issued),
          grouped by the year the application came in. The median fell from {fmtInt(trend[0]?.medCity ?? 0)} days
          for {trend[0]?.year} applications to {fmtInt(low.medCity)} for {low.year}, then rose to {fmtInt(last.medCity)} for {last.year}.
          And that {last.year} number is a floor: slow {last.year} applications still pending are not in the issued
          set yet, and when they issue the line can only move up.</>
        }
        csv={{ filename: 'seattle-sdot-minor-utility-trend.csv', data: trendCsv }}
        footnote={
          <>Issued permits only, one row per permit, grouped by applied year; partial calendar years are trimmed
          from both ends. Survivorship cuts the other way from the finding: recent years exclude their slowest,
          still-pending permits, so the measured rise for {last.year} is conservative. Source: Seattle Permit Review
          Time Data, SDOT.</>
        }
        source={{ id: DATASET, domain: DOMAIN, query: muTrendQuery }}
      >
        <TrendChart
          data={trendRows}
          xKey="year"
          series={[
            { key: 'median', name: 'Median city days' },
            { key: 'mean', name: 'Mean city days' },
          ]}
          valueFormat="days"
          height={320}
        />
      </ChartCard>

      <div className="card">
        <h2 className="section-title">The exception proves the rule</h2>
        <p className="muted" style={{ margin: 0 }}>
          The two clocks only run even when the work is genuinely complex. A Utility Major Permit averages about
          {' '}{utilityMajor?.meanCity.toFixed(0)} city days and {utilityMajor?.meanApp.toFixed(0)} applicant
          days; Private Structures and Uses are similar. These are real engineering reviews, and the city earns
          its half of the wait. A few permit types even tilt the other way, where the city does most of the work:
          Minor Utility Permit Revisions and Heavy Crane Permits are city-bound. And at the easy end, block
          parties are issued on the spot, zero days on either clock. The pattern is not &quot;the city is always
          fast.&quot; It is that the published turnaround time mostly measures the applicant, except where the
          engineering is hard.
        </p>
      </div>

      <ChartCard
        title="Every street-use permit type, by volume"
        desc={
          <>The full table, means and medians side by side. Applicant share is the portion of the average wait that
          sat in the applicant&apos;s control rather than city review. Watch where mean and median split wide: a
          Utility Major Permit Revision averages {umpRevision?.meanTotal.toFixed(0)} total days but its median
          is {fmtInt(umpRevision?.medTotal ?? 0)}, so a handful of stuck revisions carry almost all of that average.</>
        }
        csv={{ filename: 'seattle-sdot-permit-types.csv', data: csv }}
        footnote="Permit types with at least 300 issued permits. Calendar days, one row per issued permit. Source: Seattle Permit Review Time Data, SDOT."
        source={{ id: DATASET, domain: DOMAIN, query: perPermitQuery }}
      >
        <DataTable
          headers={['Permit type', 'Permits', 'City days (mean)', 'City days (median)', 'Applicant days (mean)', 'Total days (mean)', 'Total days (median)', 'Applicant share']}
          rows={tableRows}
        />
      </ChartCard>

      <div className="card" style={{ borderLeft: '4px solid var(--accent-2)' }}>
        <h2 className="section-title">How to read this</h2>
        <p className="muted" style={{ margin: 0 }}>
          The table and the split-bar chart are <strong>cross-sectional</strong>: every issued permit since 2021,
          regardless of when it was filed. Issued is the key word. The dataset also holds {fmtInt(sdot.overall.neverIssued)} permits
          ({sdot.overall.neverIssuedPct}% of the total) that were never issued at all, pending, withdrawn, or abandoned,
          and none of them appear in any figure on this page. That exclusion is also why the trend chart above is
          conservative: slow recent applications are still pending, so recent years look faster than they will end up.
          &quot;In the applicant&apos;s control&quot; is SDOT&apos;s own clock-stoppage bookkeeping, not an audit
          of fault: a permit can sit there while the applicant waits on a third party, like a utility locate or a
          private easement. These are calendar days, not business days, and averages are pulled by a long tail,
          which is why the table shows medians beside the means. This is SDOT street use, a separate system
          from the SDCI building permits in The Permit Fast Lane.
        </p>
      </div>

      <RelatedLinks slug="/street-use" />
    </>
  );
}
