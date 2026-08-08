import Link from 'next/link';
import data from '@/lib/generated/i90.json';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';
import { fmtInt } from '@/lib/format';
import { Sim } from './Sim';

export const metadata = {
  title: 'The I-90 simulator: move the HOV lane yourself',
  description:
    'A calibrated traffic simulation of the I-90 floating bridge corridor. Real hourly counts, real lane geometry. Close the HOV lane, hand cars the 2 Line right of way, and watch what happens.',
};

export default function I90Page() {
  const p25 = data.profiles['2025'];
  const p19 = data.profiles['2019'];
  const wbPeak = Math.max(...p25.WB.gp);
  const hovDrop = Math.round((1 - (p25.EB.hovDaily + p25.WB.hovDaily) / (p19.EB.hovDaily + p19.WB.hovDaily)) * 100);

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/getting-around">Getting Around</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Getting Around</p>
        <h1>Rebuild I-90 yourself and see what breaks</h1>
        <p>
          This is a working traffic model of I-90 between Seattle and Bellevue, calibrated with the highway&apos;s own
          numbers: hourly, lane-by-lane counts from the permanent recorder at the Mt Baker Tunnel ({fmtInt(
            p25.WB.gpDaily + p25.WB.hovDaily,
          )}{' '}
          vehicles a day westbound), lane geometry from WSDOT&apos;s highway log, and interchange flows from published
          section counts. Close the HOV lane. Convert it. Give cars back the center roadway the 2 Line took. The
          physics is a standard planning model, so the answers are estimates, but they are computed, not vibes.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <Sim />

      <div className="card">
        <h2 className="section-title">What the real data already says</h2>
        <ul className="notes-list">
          <li>
            The westbound GP lanes peak at {fmtInt(wbPeak)} vehicles an hour across three lanes, right at the edge of
            what three freeway lanes can move. That is why small demand changes swing the morning so hard.
          </li>
          <li>
            The HOV lane carried {fmtInt(p19.EB.hovDaily + p19.WB.hovDaily)} vehicles a day in May 2019 and{' '}
            {fmtInt(p25.EB.hovDaily + p25.WB.hovDaily)} in May 2025, a {hovDrop}% drop. The 2 Line opened across the
            bridge in between and took buses and some carpools with it.
          </li>
          <li>
            When WSDOT moved the HOV lanes to the outer roadways in 2017, its Corridor Capacity Report measured GP
            delay falling 29% and found the bridge HOV lane moving 114% more people per lane than a GP lane. Try the
            pre-2017 scenario and see which way the model swings.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2 className="section-title">How the model works, and where it bends</h2>
        <p className="muted">
          It is a Cell Transmission Model, the standard first-order traffic flow model used in planning practice: the
          road becomes 81 cells of a tenth of a mile, each with a capacity set by its real lane count (2,000 vehicles
          per lane-hour, trimmed 7% on the bridge and tunnel for missing shoulders), and traffic moves like a
          compressible fluid with a 60 mph free-flow speed and queues that spill backward at about 16 mph. Demand
          enters on real hourly counts from station {p25.station}: pick any single day, lane by lane, from two
          windows. Summer 2026 days (through early August) come straight from WSDOT&apos;s count database; most had
          not yet been through the state&apos;s formal acceptance review when we pulled them, so treat them as raw
          recorder data. Winter 2025 days are fully accepted federal submissions. The May 2025 weekday average and
          the pre-R8A scenario ({p19.station}, May 2019) round out the options. Demand splits between HOV-eligible
          and general traffic by the observed lane-4 share, and interchanges add or remove flow per WSDOT&apos;s
          published section counts. Speeds sag as flow nears capacity (about 47 mph at full utilization) the way
          real freeways do, so the map shows busy-but-moving as yellow, not just jammed or free.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          Why the busiest real day still is not jammed: its peak hour ran at about 90% of capacity, heavy but moving,
          and the recorder&apos;s own numbers show no breakdown that morning (throughput never sagged mid peak). Real
          jams on a corridor running at 90% come from things going wrong, which is what the crash toggle simulates: one
          blocked lane at the bridge turns the same morning into stop and go. One honest limit: on days that truly
          broke down, a detector records what got through the queue, not what wanted to come, so true demand on jam
          days cannot be reconstructed from a single station.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          What it cannot do: model lane-changing friction, weaving at the ramps, or where drivers reroute
          when you change the road (demand is fixed unless you move the slider). One direction runs at a time. The
          center-roadway scenarios assume its 2 lanes fully serve the simulated direction during its peak, which
          flatters the car option. Treat differences between scenarios as directionally meaningful, not the decimals.
        </p>
      </div>

      <div className="footnote">
        <strong>Sources.</strong> WSDOT Traffic Count Database (station R017, hourly by-lane volumes, June 30 to
        August 5, 2026, harvested August 2026); FHWA Travel Monitoring Analysis System monthly volume files (May
        2019, May 2025 averages; November and December 2025 daily), stations R117AA and R017AA; WSDOT State Highway
        Log 2024 (lane counts); WSDOT Shared/TrafficData ArcGIS service (AADT and interchange flows); WSDOT Corridor
        Capacity Report 2018 (the R8A natural experiment). Pipeline: scripts/build_i90.py in the public repo; the
        harvested summer file is checked in at scripts/data/.
      </div>

      <RelatedLinks slug="/i90" />
    </>
  );
}
