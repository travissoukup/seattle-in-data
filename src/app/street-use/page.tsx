import Link from 'next/link';
import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { StackedRankedBars } from '@/components/charts';
import { sdot } from '@/lib/data';
import { fmtInt, toCsv } from '@/lib/format';

export const metadata = { title: 'Whose Clock Is It? · Exploring Seattle with Data' };

const days = (v: number): string => `${v % 1 === 0 ? v : v.toFixed(1)} days`;

export default function StreetUsePage() {
  const t = sdot.types;
  const find = (name: string) => t.find((x) => x.type === name);
  const minorUtility = find('Minor Utility Permit');
  const extension = find('ROW Extension Request');
  const utilityMajor = find('Utility Major Permit');

  // Hero stacked bar: the common permits and how their wait splits.
  const barRows = t
    .filter((x) => x.meanTotal > 0)
    .sort((a, b) => b.permits - a.permits)
    .slice(0, 14)
    .map((x) => ({ label: x.type, city: x.meanCity, applicant: x.meanApp }));

  const tableRows = [...t]
    .sort((a, b) => b.permits - a.permits)
    .map((x) => [
      x.type,
      fmtInt(x.permits),
      x.meanCity.toFixed(1),
      x.meanApp.toFixed(1),
      x.meanTotal.toFixed(1),
      x.applicantShare === null ? '–' : `${x.applicantShare}%`,
    ]);
  const csv = toCsv(
    ['permit_type', 'permits', 'mean_city_days', 'mean_applicant_days', 'mean_total_days', 'median_total_days', 'applicant_share_pct'],
    t.map((x) => [x.type, x.permits, x.meanCity, x.meanApp, x.meanTotal, x.medTotal, x.applicantShare ?? '']),
  );

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Accountability</p>
        <h1>Whose clock is it?</h1>
        <p>
          When a Seattle street-use permit takes weeks to issue, the easy assumption is that City Hall is slow.
          SDOT publishes a dataset that lets you check, because it splits every permit&apos;s wait into two
          clocks: the days the city spent reviewing, and the days the permit sat &quot;in the applicant&apos;s
          control.&quot; Across {fmtInt(sdot.overall.totalIssued)} issued permits, the split is not what you
          would guess. This is the SDOT companion to <Link href="/permits">The Permit Fast Lane</Link>, which asked the
          same kind of question of SDCI building permits.
        </p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Permits analyzed</div>
          <div className="value">{fmtInt(sdot.overall.totalIssued)}</div>
          <div className="sub">Every issued SDOT street-use permit, 2021 to 2026. Median one clears in {days(sdot.overall.medTotal)}.</div>
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
          <div className="label">The real slow lane</div>
          <div className="value">{Math.round(utilityMajor?.meanTotal ?? 0)} days</div>
          <div className="sub">
            A Utility Major Permit, split almost evenly between the two clocks. Heavy engineering is slow on both.
          </div>
        </div>
      </div>

      <ChartCard
        title="For the routine permits, the wait is the applicant's"
        desc="Average days from application to issuance for the most common street-use permit types, split between time in city review (blue) and time in the applicant's control (orange). The high-volume routine permits, extensions, maintenance, container and date-change requests, show almost no city review time. The wait is the applicant getting their submission in order."
        csv={{ filename: 'seattle-sdot-permit-clock.csv', data: csv }}
        footnote="Mean calendar days per issued permit, deduplicated to one row per permit. City and applicant days sum to the total. Source: Seattle Permit Review Time Data (crg2-ssqd), SDOT."
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
        desc="The full table. Applicant share is the portion of the average wait that sat in the applicant's control rather than city review."
        footnote="Permit types with at least 300 issued permits. Mean calendar days. Source: Seattle Permit Review Time Data (crg2-ssqd), SDOT."
      >
        <DataTable
          headers={['Permit type', 'Permits', 'City days', 'Applicant days', 'Total days', 'Applicant share']}
          rows={tableRows}
        />
      </ChartCard>

      <div className="card" style={{ borderLeft: '4px solid var(--accent-2)' }}>
        <h2 className="section-title">How to read this</h2>
        <p className="muted" style={{ margin: 0 }}>
          The figures are <strong>cross-sectional</strong>: every issued permit, regardless of when it was filed.
          The data appears to show turnaround falling sharply year over year, but that is a survivorship illusion,
          the slowest recent permits are still pending and not yet in the issued set, so we do not chart a trend.
          &quot;In the applicant&apos;s control&quot; is SDOT&apos;s own clock-stoppage bookkeeping, not an audit
          of fault: a permit can sit there while the applicant waits on a third party, like a utility locate or a
          private easement. These are calendar days, not business days, and averages are pulled by a long tail, so
          the table reports counts and you can compare the medians. This is SDOT street use, a separate system
          from the SDCI building permits in The Permit Fast Lane.
        </p>
      </div>
    </>
  );
}
