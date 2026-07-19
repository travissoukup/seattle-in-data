import Link from 'next/link';
import data from '@/lib/generated/trades.json';
import { PointMap } from '@/components/PointMap';
import { ChartCard } from '@/components/ChartCard';
import { RankedBars, TrendChart } from '@/components/charts';
import { fmt1, fmtInt, fmtPct, toCsv } from '@/lib/format';
import { DataFreshness } from '@/components/DataFreshness';
import { RelatedLinks } from '@/components/RelatedLinks';

export const metadata = {
  title: 'Heat pumps took over trade permits',
  description: `Heat pump permits in Seattle went from ${fmtInt(data.hpDecadeAgo)} in ${data.hpDecadeYear} to a peak of ${fmtInt(data.hpPeakN)} in ${data.hpPeakYear}, while gas furnace permits stayed flat.`,
};

const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#56b4e9', '#e69f00'];
const GRAY = '#9aa3ad';

/** Full Socrata resource URL reproducing a chart's aggregate query. */
const soqlUrl = (id: string, params: Record<string, string>) =>
  `https://data.seattle.gov/resource/${id}.json?${new URLSearchParams(params).toString()}`;

const TRADE = 'c87v-5hwh';
const ELEC = 'c4tj-daue';

export default function TradesPage() {
  const colorFor = (t: string) => (t === 'Trade' ? PALETTE[0] : t === 'Electrical' ? PALETTE[1] : GRAY);
  const points = data.points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p.t),
    label: `<strong>${p.sub}</strong><br/>Issued ${p.d}`,
  }));
  const legend = [
    { label: 'Trade permit', color: PALETTE[0] },
    { label: 'Electrical permit', color: PALETTE[1] },
  ];

  const typeRows = data.tradeTypes.map((t) => ({ label: t.key, value: t.n }));
  const contractorRows = data.contractors.map((c) => ({ label: c.key, value: c.n }));

  const yearWhere = `issueddate >= '${data.chartStart}-01-01'`;
  const yearSelect = 'substring(issueddate,1,4) as y, count(*) as n';

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span>{' '}
        <Link href="/category/permits-and-construction">Permits and Construction</Link>
      </p>

      <div className="page-head">
        <p className="eyebrow">Permits and Construction</p>
        <h1>Heat pump permits boomed. Gas furnaces never moved.</h1>
        <p>
          Seattle&apos;s switch off gas is sitting in a free-text field. Trade permits that mention a heat pump went
          from {fmtInt(data.hpDecadeAgo)} in {data.hpDecadeYear} to a peak of {fmtInt(data.hpPeakN)} in{' '}
          {data.hpPeakYear}, about {fmt1(data.hpMultiple)}x. Gas furnace permits barely budged over the same decade:{' '}
          {fmtInt(data.gasDecadeAgo)} then, {fmtInt(data.gasLastYear)} in {data.lastYear}. Heat pumps now show up in{' '}
          {fmtPct(data.hpShareLastYear)} of all trade permits. The wider picture: {fmtInt(data.totalTrade)} trade
          permits (furnaces, fire sprinklers, elevators, signs) and {fmtInt(data.totalElec)} electrical permits on
          record, {fmtInt(data.issuedLastYear)} of them issued in {data.lastYear}.
        </p>
      </div>

      <DataFreshness date={data.generatedAt} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Heat pump permits in {data.lastYear}</div>
          <div className="value">{fmtInt(data.hpLastYear)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Share of {data.lastYear} trade permits</div>
          <div className="value">{fmtPct(data.hpShareLastYear)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Trade permits on record</div>
          <div className="value">{fmtInt(data.totalTrade)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Electrical permits on record</div>
          <div className="value">{fmtInt(data.totalElec)}</div>
        </div>
      </div>

      <ChartCard
        title="Heat pumps vs gas furnaces"
        desc={`Trade permits whose description mentions a heat pump or a gas furnace, by issue year. One line climbs, the other stays put around ${fmtInt(data.gasLastYear)} a year.`}
        csv={{
          filename: 'heat-pump-vs-gas-furnace.csv',
          data: toCsv(
            ['year', 'heat_pump', 'gas_furnace'],
            data.electrify.map((r) => [r.y, r.hp, r.gas]),
          ),
        }}
        footnote={`Counts permits where the free-text description contains "heat pump" or "gas furnace" (case-insensitive). A permit can match both. Some heat pump jobs are worded differently and get missed, so treat these as a floor, not an exact count. Series start in ${data.chartStart} and the current partial year is trimmed.`}
        source={{
          id: TRADE,
          query: soqlUrl(TRADE, {
            $select: yearSelect,
            $where: `${yearWhere} AND upper(description) LIKE '%HEAT PUMP%'`,
            $group: 'y',
            $order: 'y',
          }),
        }}
      >
        <TrendChart
          data={data.electrify}
          xKey="y"
          series={[
            { key: 'hp', name: 'Heat pump' },
            { key: 'gas', name: 'Gas furnace' },
          ]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="Permits issued each year"
        desc="Trade and electrical permits the city issued, counted by year."
        csv={{
          filename: 'permits-by-year.csv',
          data: toCsv(['year', 'trade', 'electrical'], data.yearly.map((r) => [r.y, r.trade, r.elec])),
        }}
        footnote={
          <>
            Both series start in {data.chartStart}, the first full year both datasets cover; records begin mid-
            {data.chartStart - 1}, so that partial year is trimmed. The current year is left off because it is not done
            yet. The electrical series comes from{' '}
            <a href={`https://data.seattle.gov/d/${ELEC}`} target="_blank" rel="noopener noreferrer">
              dataset {ELEC}
            </a>
            .
          </>
        }
        source={{
          id: TRADE,
          query: soqlUrl(TRADE, { $select: yearSelect, $where: yearWhere, $group: 'y', $order: 'y' }),
        }}
      >
        <TrendChart
          data={data.yearly}
          xKey="y"
          series={[
            { key: 'trade', name: 'Trade' },
            { key: 'elec', name: 'Electrical' },
          ]}
          valueFormat="compact"
          height={320}
        />
      </ChartCard>

      <ChartCard
        title="What trade permits cover"
        desc="The kinds of trade work people pull permits for. Furnaces and refrigeration lead by a lot."
        csv={{ filename: 'trade-permit-types.csv', data: toCsv(['type', 'count'], data.tradeTypes.map((t) => [t.key, t.n])) }}
        footnote="Counts cover every trade permit on record. Electrical permits do not carry this breakdown."
        source={{
          id: TRADE,
          query: soqlUrl(TRADE, {
            $select: 'permittype, count(*) as n',
            $group: 'permittype',
            $order: 'n DESC',
            $limit: '12',
          }),
        }}
      >
        <RankedBars rows={typeRows} valueName="Permits" valueFormat="compact" height={340} />
      </ChartCard>

      <ChartCard
        title="Who pulls electrical permits"
        desc={`The busiest electrical contractors over the last 12 months. Another ${fmtInt(data.noContractorN)} recent permits, ${fmtPct(data.noContractorPct)} of the total, list no contractor at all. Most of those are owners doing their own wiring.`}
        csv={{
          filename: 'electrical-contractors.csv',
          data: toCsv(['contractor', 'permits'], data.contractors.map((c) => [c.key, c.n])),
        }}
        footnote={`Electrical permits issued on or after ${data.contractorSince}, grouped by the contractor name on the permit (${fmtInt(data.recentElec)} permits total). Company names are as filed, so one firm can appear under spelling variants.`}
        source={{
          id: ELEC,
          query: soqlUrl(ELEC, {
            $select: 'contractorcompanyname, count(*) as n',
            $where: `issueddate >= '${data.contractorSince}'`,
            $group: 'contractorcompanyname',
            $order: 'n DESC',
            $limit: '13',
          }),
        }}
      >
        <RankedBars rows={contractorRows} valueName="Permits" valueFormat="compact" height={340} />
      </ChartCard>

      <ChartCard
        title="Recent permits, mapped"
        desc="Each dot is one recently issued permit. Blue is trade work, orange is electrical. Click a dot to see what it was and when."
        footnote={
          <>
            The map samples the most recent issued permits that came with map coordinates. Electrical points come from{' '}
            <a href={`https://data.seattle.gov/d/${ELEC}`} target="_blank" rel="noopener noreferrer">
              dataset {ELEC}
            </a>
            .
          </>
        }
        source={{ id: TRADE }}
      >
        <PointMap points={points} legend={legend} height={520} radius={3} />
      </ChartCard>

      <div className="caveat">
        <strong>A permit is a plan, not a finished job.</strong> These are permits pulled, not jobs finished. A permit
        means someone asked the city for the OK to do the work. It does not tell you the work got done, passed
        inspection, or happened on time. Some small jobs never need a permit at all, so they never show up here. The
        heat pump and gas furnace counts lean on how installers word their descriptions, so the split between them is
        approximate.
      </div>

      <RelatedLinks slug="/trades" />
    </>
  );
}
