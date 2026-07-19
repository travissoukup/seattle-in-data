import Link from 'next/link';
import data from '@/lib/generated/bikes.json';
import { ChartCard } from '@/components/ChartCard';
import { TrendChart, BarsChart } from '@/components/charts';
import { fmtInt, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = { title: 'Bike counts on the Fremont Bridge | Seattle in Data' };

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
function prettyMonth(ym: string) {
  const [y, m] = ym.split('-');
  const i = Number(m) - 1;
  return `${MONTH_NAMES[i] ?? m} ${y}`;
}

export default function BikesPage() {
  const monthly = data.monthly;
  const hourRows = data.byHour.map((h) => ({
    hour: h.hh === 0 ? '12a' : h.hh < 12 ? `${h.hh}a` : h.hh === 12 ? '12p' : `${h.hh - 12}p`,
    avg: h.avg,
  }));
  const dowRows = data.byDow.map((d) => ({ day: d.day.slice(0, 3), avg: d.avg }));

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/getting-around">Getting Around</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Getting Around</p>
        <h1>Bike counts on the Fremont Bridge</h1>
        <p>
          The city put a counter on the Fremont Bridge in 2012. It tallies every bike that rolls across, one hour at a
          time. Since then it has counted {fmtInt(data.total)} crossings. The busiest single month was{' '}
          {prettyMonth(data.busiest.ym)}, when {fmtInt(data.busiest.n)} bikes crossed.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Crossings counted</div>
          <div className="value">{fmtInt(data.total)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Busiest month</div>
          <div className="value" style={{ fontSize: 20 }}>{prettyMonth(data.busiest.ym)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Weekday rush peaks at</div>
          <div className="value">{data.peakHour.label}</div>
        </div>
      </div>

      <ChartCard
        title="Bikes across the Fremont Bridge each month"
        desc="Total crossings counted per month. The number climbs in summer and drops in winter, every year."
        csv={{ filename: 'fremont-bridge-monthly.csv', data: toCsv(['month', 'crossings'], monthly.map((m) => [m.ym, m.n])) }}
        footnote="Source: Fremont Bridge bike counter (65db-xm6k) on data.seattle.gov. The newest month may be partial."
      >
        <TrendChart
          data={monthly}
          xKey="ym"
          series={[{ key: 'n', name: 'Crossings' }]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="When riders cross, hour by hour"
        desc={`Average bikes per hour, by time of day, over the last two years. Two clear humps: the morning commute and the bigger ${data.peakHour.label} ride home.`}
        footnote="Source: Fremont Bridge bike counter (65db-xm6k). Average is the sum of crossings divided by the hours observed since mid-2024."
      >
        <BarsChart
          data={hourRows}
          xKey="hour"
          series={[{ key: 'avg', name: 'Avg bikes/hour' }]}
          valueFormat="int"
          height={300}
        />
      </ChartCard>

      <ChartCard
        title="Weekdays beat weekends"
        desc="Average bikes per day, by day of week, over the last two years. Commuters fill the weekdays. Tuesday through Thursday run highest."
        footnote="Source: Fremont Bridge bike counter (65db-xm6k). Average daily crossings since mid-2024."
      >
        <BarsChart
          data={dowRows}
          xKey="day"
          series={[{ key: 'avg', name: 'Avg bikes/day' }]}
          valueFormat="int"
          height={280}
        />
      </ChartCard>

      <div className="caveat" style={{ borderLeftColor: PALETTE[0] }}>
        <strong>What this shows, and what it does not.</strong> This is one counter at one spot, the Fremont Bridge. It
        is not a count of all biking in Seattle. Riders who cross other bridges or take other routes never show up here.
        A few hours over the years have gaps or counter glitches too, so treat the long trend as the real story, not any
        single hour.
      </div>

      <RelatedLinks slug="/bikes" />
    </>
  );
}
