#!/usr/bin/env python3
"""Build src/lib/generated/fees-hours.json for the /fees-hours page.

Input 1: .targets-data/permit_fees_all.csv, an SDCI invoice-line extract obtained
by public records request (Jan 2020 through Jun 23, 2026).
Input 2: Seattle's plan-review dataset tqk8-y2z5 (cos-data.seattle.gov), which
names the assigned reviewer per review type on ~6,200 completed permits. It is
downloaded to .targets-data/plan_review_tqk8.csv on first run.

What this script does:
- keeps every metered hourly invoice line ("... - Additional Hours" / "Hourly"),
- reverse-engineers the hourly rate card per year for the three rate families
  (land use, engineering, SDOT) and converts each line to implied hours via the
  quarter-hour lattice (amount must be a multiple of rate/4),
- builds weekly/monthly implied-hours series per discipline,
- runs the overbilling checks: discipline hours vs 40h x named reviewers,
  geotech-specific tells, per-reviewer attributed weekly hours (anonymized in
  the output), and invoice dates vs reviewer assignment windows.

Reviewer names never enter the JSON; reviewers are ranked and labeled R1, R2, ...
"""
import json
import os
import urllib.request
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FEES_CSV = os.path.join(ROOT, '.targets-data', 'permit_fees_all.csv')
PR_CSV = os.path.join(ROOT, '.targets-data', 'plan_review_tqk8.csv')
OUT = os.path.join(ROOT, 'src', 'lib', 'generated', 'fees-hours.json')
DATA_END = pd.Timestamp('2026-06-23')

# Hourly rate card, reverse-engineered from the invoice amounts themselves:
# for each family and year, the amounts sit on a lattice of multiples of rate/4
# (97% of lines land exactly on the current-year lattice; see fit stats below).
RATES = {
    'LU':   {2020: 394, 2021: 394, 2022: 394, 2023: 430, 2024: 439, 2025: 467, 2026: 551},
    'ENG':  {2020: 231, 2021: 231, 2022: 231, 2023: 252, 2024: 257, 2025: 274, 2026: 292},
    'SDOT': {2020: 278, 2021: 278, 2022: 305, 2023: 332, 2024: 350, 2025: 358, 2026: 367},
}
# Pre-2020 rates still showing up on stragglers billed after Jan 2020 for work
# done earlier (amounts on 386/324 lattices for land use, 222/216 for engineering,
# 260 for SDOT).
LEGACY = {'LU': [386, 324], 'ENG': [222, 216], 'SDOT': [260]}

FAMILY = {
    'Land Use Review - Additional Hours': ('LU', 'Land use'),
    'Land Use Inspection - Hourly': ('LU', 'Land use'),
    'Pre-Sub Conference - Additional Hours': ('LU', 'Land use'),
    'ECA LU Review - Additional Hours': ('LU', 'Land use'),
    'Drainage Review - Additional Hours': ('ENG', 'Drainage'),
    'ECA GeoTech Review - Additional Hours': ('ENG', 'Geotech'),
    'Geo Soils Review - Additional Hours': ('ENG', 'Geotech'),
    'Geotech Review Post Issue - Additional Hours': ('ENG', 'Geotech'),
    'Geotech ECA Review - Additional Hours': ('ENG', 'Geotech'),
    'Zoning Review - Additional Hours': ('ENG', 'Zoning'),
    'Mechanical Review - Additional Hours': ('ENG', 'Mechanical'),
    'Energy Review - Additional Hours': ('ENG', 'Energy'),
    'Ordinance/Structural Review - Additional Hours': ('ENG', 'Ordinance/Structural'),
    'Building Code Platting Review - Additional Hours': ('ENG', 'Other hourly'),
    'Flood Plain Review - Additional Hours': ('ENG', 'Other hourly'),
    'Noise Review - Additional Hours': ('ENG', 'Other hourly'),
    'Hourly Review': ('ENG', 'Other hourly'),
    'Hourly Inspection': ('ENG', 'Other hourly'),
    'Site Inspection Post Issue - Additional Hours': ('ENG', 'Other hourly'),
    'Site Inspection Pre Issue - Additional Hours': ('ENG', 'Other hourly'),
    'Site Review Post Issue - Additional Hours': ('ENG', 'Other hourly'),
    'Shoring Private Property Review - Additional Hours': ('ENG', 'Other hourly'),
    'ECA Exemption Review - Additional Hours': ('ENG', 'Other hourly'),
    'Grading Review - Additional Hours': ('ENG', 'Other hourly'),
    'Building Hourly': ('ENG', 'Other hourly'),
    'Pre-Application Site Visit - Additional Hours': ('ENG', 'Other hourly'),
    'LU Zoning Coaching - Additional Hours': ('ENG', 'Other hourly'),
    'Code Alternate Request - Additional Hours': ('ENG', 'Other hourly'),
    'Noise Survey Review, Inspection, Monitor - Hourly': ('ENG', 'Other hourly'),
    'SDOT Hourly Review and Inspection': ('SDOT', 'SDOT'),
    'SDOT Hourly Review and Inspection - Overtime': ('SDOT', 'SDOT'),
}

# Minimum-charge line items per discipline (flat first charges that also sit on
# the same lattice: e.g. ECA GeoTech minimum = half an hour, land use minimum =
# ten hours). Excluded from metered hours; counted for the minimum-share tell.
MIN_DESCS = {
    'Geotech': ['ECA GeoTech Review - Minimum', 'Geo Soils Review - Minimum', 'Geotech Review Post Issue - Minimum'],
    'Drainage': ['Drainage Review - Minimum'],
    'Land use': ['Land Use Review - Minimum', 'ECA LU Review - Minimum', 'Pre-Sub Conference - Minimum'],
    'Mechanical': ['Mechanical Review - Minimum'],
    'Energy': ['Energy Review - Minimum'],
    'Ordinance/Structural': ['Ordinance/Structural Review - Minimum'],
}

# Fee discipline -> plan-review reviewtype values in tqk8-y2z5.
REVIEWTYPES = {
    'Drainage': ['Drainage', 'Side Sewer Conflict', 'Conveyance'],
    'Geotech': ['ECA GeoTech', 'Geo Soils', 'Shoring - Right of Way', 'Shoring - Private Property'],
    'Zoning': ['Zoning'],
    'Energy': ['Energy'],
    'Mechanical': ['Mechanical'],
    'Ordinance/Structural': ['Ordinance/Structural', 'Ordinance', 'Structural Engineer'],
    'Land use': ['Land Use'],
}

WEEKS_FULL_YEAR = 52.18
WEEKS_2026 = (DATA_END - pd.Timestamp('2026-01-01')).days / 7  # partial year


def fetch_plan_review():
    if os.path.exists(PR_CSV):
        return
    url = ('https://cos-data.seattle.gov/resource/tqk8-y2z5.csv?'
           '$select=permitnum,reviewcycle,reviewtype,reviewer,reviewerassigndate,reviewerfinishdate'
           '&$limit=300000')
    print('downloading tqk8-y2z5 ...')
    urllib.request.urlretrieve(url, PR_CSV)


def r1(x):
    return round(float(x), 1)


def r2(x):
    return round(float(x), 2)


def main():
    fetch_plan_review()
    df = pd.read_csv(FEES_CSV)
    df['billed'] = df.amount_due + df.amount_paid
    df['dt'] = pd.to_datetime(df.date_invoiced)
    df['year'] = df.dt.dt.year

    h = df[df.description.isin(FAMILY) & (df.billed > 0)].copy()
    h['family'] = h.description.map(lambda d: FAMILY[d][0])
    h['discipline'] = h.description.map(lambda d: FAMILY[d][1])
    cents = (h.billed * 100).round().astype('int64').values

    # Fit each line to a rate lattice: current year, prior year, next year, legacy.
    hours = np.full(len(h), np.nan)
    fit = np.array(['off'] * len(h), dtype=object)
    rate_used = np.zeros(len(h))
    for tag, yoff in [('current', 0), ('prior', -1), ('next', 1)]:
        rate = np.array([RATES[f].get(y + yoff, 0) for f, y in zip(h.family, h.year)])
        q = rate * 25
        ok = (q > 0) & (fit == 'off') & (cents % np.where(q == 0, 1, q) == 0)
        hours[ok] = cents[ok] / (rate[ok] * 100.0)
        rate_used[ok] = rate[ok]
        fit[ok] = tag
    for fam, legacy_rates in LEGACY.items():
        for lr in legacy_rates:
            ok = (fit == 'off') & (h.family == fam).values & (cents % (lr * 25) == 0)
            hours[ok] = cents[ok] / (lr * 100.0)
            rate_used[ok] = lr
            fit[ok] = 'legacy'
    off = fit == 'off'
    rate0 = np.array([RATES[f][y] for f, y in zip(h.family, h.year)])
    hours[off] = cents[off] / (rate0[off] * 100.0)  # approximation, flagged
    rate_used[off] = rate0[off]
    h['hours'] = hours
    h['fit'] = fit
    h['week'] = h.dt.dt.to_period('W-SUN').dt.start_time

    fit_n = h.fit.value_counts()
    fit_d = h.groupby('fit').billed.sum()
    on_lattice_lines = int(len(h) - fit_n.get('off', 0))
    totals = {
        'lines': int(len(h)),
        'dollars': r2(h.billed.sum()),
        'hours': r1(h.hours.sum()),
        'records': int(h.record_id.nunique()),
        'currentFitPct': r1(100 * fit_n.get('current', 0) / len(h)),
        'priorFitLines': int(fit_n.get('prior', 0) + fit_n.get('legacy', 0)),
        'onLatticePct': r1(100 * on_lattice_lines / len(h)),
        'offLines': int(fit_n.get('off', 0)),
        'offDollars': r2(fit_d.get('off', 0.0)),
        'offSharePct': r1(100 * fit_d.get('off', 0.0) / h.billed.sum()),
        'allLines': int(len(df)),
        'allDollarsPaid': r2(df.amount_paid.sum()),
        'hourlyShareOfPaidPct': r1(100 * h.amount_paid.sum() / df.amount_paid.sum()),
    }

    # Rate card with lattice evidence: lines landing exactly on that year's lattice.
    rate_card = []
    for y in range(2020, 2027):
        n_on = int(((h.year == y) & (h.fit == 'current')).sum())
        n_all = int((h.year == y).sum())
        rate_card.append({'year': y, 'lu': RATES['LU'][y], 'eng': RATES['ENG'][y], 'sdot': RATES['SDOT'][y],
                          'quarterLu': r2(RATES['LU'][y] / 4), 'nOn': n_on, 'pctOn': r1(100 * n_on / max(n_all, 1))})
    rate_rise = {
        'luPct': r1(100 * (RATES['LU'][2026] / RATES['LU'][2020] - 1)),
        'engPct': r1(100 * (RATES['ENG'][2026] / RATES['ENG'][2020] - 1)),
        'sdotPct': r1(100 * (RATES['SDOT'][2026] / RATES['SDOT'][2020] - 1)),
    }

    # Weekly hours per discipline; yearly average weekly level.
    weeks_per_year = {y: WEEKS_FULL_YEAR for y in range(2020, 2026)}
    weeks_per_year[2026] = WEEKS_2026
    ytab = h.groupby(['discipline', 'year']).hours.sum().unstack(0).fillna(0)
    avg_weekly = ytab.div(pd.Series(weeks_per_year), axis=0)
    tot_weekly = {int(y): r1(v) for y, v in (ytab.sum(axis=1) / pd.Series(weeks_per_year)).items()}

    # Monthly series (average hours billed per week within each month) for the chart.
    hm = h.copy()
    hm['g'] = hm.discipline.map({'Land use': 'lu', 'Drainage': 'drain', 'Geotech': 'geo', 'SDOT': 'sdot'}).fillna('other')
    hm['month'] = hm.dt.dt.to_period('M')
    mm = hm.groupby(['month', 'g']).hours.sum().unstack(fill_value=0)
    monthly = []
    for m, row in mm.iterrows():
        month_end = min(m.to_timestamp(how='end').normalize(), DATA_END)
        days = (month_end - m.to_timestamp(how='start')).days + 1
        rec = {'m': str(m)}
        for k in ['lu', 'drain', 'geo', 'sdot', 'other']:
            rec[k] = r1(row.get(k, 0) / (days / 7))
        monthly.append(rec)

    lu_collapse = {'w2020': r1(avg_weekly.loc[2020, 'Land use']), 'w2023': r1(avg_weekly.loc[2023, 'Land use']),
                   'w2025': r1(avg_weekly.loc[2025, 'Land use']), 'w2026': r1(avg_weekly.loc[2026, 'Land use']),
                   'dropPct': r1(100 * (1 - avg_weekly.loc[2026, 'Land use'] / avg_weekly.loc[2020, 'Land use']))}
    total_drop = {'w2020': tot_weekly[2020], 'w2026': tot_weekly[2026],
                  'dropPct': r1(100 * (1 - tot_weekly[2026] / tot_weekly[2020]))}

    # Mega invoices: single lines of 40+ implied hours.
    mega = h[h.hours >= 40].sort_values('hours', ascending=False)
    mega_top = [{'id': r.record_id, 'd': r.dt.strftime('%Y-%m-%d'), 'desc': r.description,
                 'hours': r2(r.hours), 'amt': r2(r.billed)} for r in mega.head(10).itertuples()]
    # biggest single record+day for one discipline
    hd = h.copy()
    hd['date'] = hd.dt.dt.date
    dsum = hd.groupby(['record_id', 'date', 'discipline']).agg(hours=('hours', 'sum'), amt=('billed', 'sum'), lines=('hours', 'size')).reset_index()
    top_day = dsum.sort_values('hours', ascending=False).iloc[0]
    rec = h[h.record_id == top_day.record_id]
    weekend18 = h[(h.dt.dt.dayofweek >= 5) & (h.dt.dt.hour == 18)]
    wk_series = h.groupby(['discipline', 'week']).hours.sum().reset_index()
    lu_batch = wk_series[(wk_series.discipline == 'Land use')].sort_values('hours', ascending=False).iloc[0]
    lu_batch_records = int(h[(h.discipline == 'Land use') & (h.week == lu_batch.week)].record_id.nunique())
    mega_out = {
        'count40': int(len(mega)),
        'top': mega_top,
        'day': {'id': top_day.record_id, 'date': str(top_day.date), 'hours': r2(top_day.hours),
                'lines': int(top_day.lines), 'amt': r2(top_day.amt), 'disc': top_day.discipline},
        'record': {'id': top_day.record_id, 'hours': r1(rec.hours.sum()), 'amt': r2(rec.billed.sum()),
                   'lines': int(len(rec)), 'from': rec.dt.min().strftime('%Y-%m-%d'), 'to': rec.dt.max().strftime('%Y-%m-%d')},
        'weekend18Lines': int(len(weekend18)),
        'weekend18Hours': r1(weekend18.hours.sum()),
        'weekendHoursPct': r1(100 * h[h.dt.dt.dayofweek >= 5].hours.sum() / h.hours.sum()),
        'batchWeek': {'disc': 'Land use', 'week': lu_batch.week.strftime('%Y-%m-%d'), 'hours': r1(lu_batch.hours),
                      'records': lu_batch_records},
    }

    # Plan-review staffing floors and capacity test.
    pr = pd.read_csv(PR_CSV, parse_dates=['reviewerassigndate', 'reviewerfinishdate'])
    pr = pr[pr.reviewer.notna()].copy()
    t2d = {t: d for d, ts in REVIEWTYPES.items() for t in ts}
    pr['discipline'] = pr.reviewtype.map(t2d)
    prd = pr[pr.discipline.notna()].copy()

    floors = {}
    for disc, types in REVIEWTYPES.items():
        sub = pr[pr.reviewtype.isin(types)]
        row = {}
        for y in range(2020, 2025):
            y0, y1 = pd.Timestamp(f'{y}-01-01'), pd.Timestamp(f'{y}-12-31')
            m = (sub.reviewerassigndate <= y1) & (sub.reviewerfinishdate.fillna(pd.Timestamp('2026-12-31')) >= y0)
            row[y] = int(sub[m].reviewer.nunique())
        floors[disc] = row

    capacity = []
    weeks_over_all = 0
    for disc in ['Land use', 'Drainage', 'Geotech', 'Zoning', 'Mechanical', 'Energy', 'Ordinance/Structural']:
        aw24 = avg_weekly.loc[2024, disc] if disc in avg_weekly.columns else 0
        fl24 = floors[disc][2024]
        sub = wk_series[(wk_series.discipline == disc) & (wk_series.week.dt.year <= 2024)]
        over = sub[sub.apply(lambda r: r.hours > 40 * floors[disc].get(r.week.year, 10 ** 6), axis=1)]
        weeks_over_all += len(over)
        mx = sub.sort_values('hours', ascending=False).iloc[0]
        capacity.append({'disc': disc, 'avgWeekly2024': r1(aw24), 'floor2024': fl24, 'cap2024': 40 * fl24,
                         'perReviewer2024': r1(aw24 / fl24) if fl24 else None,
                         'maxWeek': r1(mx.hours), 'maxWeekDate': mx.week.strftime('%Y-%m-%d'),
                         'weeksOverCap': int(len(over))})
    cap_notes = {'weeksOverCapTotal': int(weeks_over_all), 'floorPermits': int(pr.permitnum.nunique()),
                 'floorReviewers': int(pr.reviewer.nunique()), 'capYear': 2024}

    # Geotech deep dive.
    geo = h[h.discipline == 'Geotech']
    geo_wk = geo.groupby('week').hours.sum()
    spike_week = geo_wk.idxmax()
    spike_lines = geo[geo.week == spike_week]
    top_rec_spike = spike_lines.groupby('record_id').hours.sum().max()

    on = h[h.fit != 'off']
    def whole_share(d):
        s = on[on.discipline == d].hours
        return r1(100 * (s % 1 == 0).mean())
    def quarter_share(d):
        s = on[on.discipline == d].hours
        return r1(100 * (~((s % 0.5) == 0)).mean())
    min_share = {}
    for disc, descs in MIN_DESCS.items():
        n_min = int(df.description.isin(descs).sum())
        n_met = int((h.discipline == disc).sum())
        min_share[disc] = r1(100 * n_min / (n_min + n_met))

    dupg = hd.groupby(['record_id', 'description', 'date', 'billed']).size()
    dup_groups = dupg[dupg > 1]
    hd['is_dup'] = hd.set_index(['record_id', 'description', 'date', 'billed']).index.isin(dup_groups.index)
    dup_all = hd[hd.is_dup]
    dup_geo = dup_all[dup_all.discipline == 'Geotech']

    ev = geo.groupby(['record_id', 'dt']).hours.sum().reset_index().sort_values(['record_id', 'dt'])
    ev['prev_dt'] = ev.groupby('record_id').dt.shift(1)
    ev2 = ev[ev.prev_dt.notna()].copy()
    bus = np.busday_count(ev2.prev_dt.dt.date.values.astype('datetime64[D]'), ev2.dt.dt.date.values.astype('datetime64[D]'))
    ev2['bus_hours'] = bus * 8
    tight = ev2[(ev2.bus_hours > 0) & (ev2.hours > ev2.bus_hours)]
    same_day = ev2[ev2.bus_hours == 0]

    mix = h.groupby(['discipline', h.record_id.str.extract(r'-([A-Z]+)$')[0]]).size().unstack(fill_value=0)
    cn_share = lambda d: r1(100 * mix.loc[d, 'CN'] / mix.loc[d].sum())

    # Yearly geotech rollup for the chart: minimum charges vs metered additional
    # hours, distinct permits touched, and implied hours (lattice-fit).
    geo_min_df = df[df.description.isin(MIN_DESCS['Geotech'])]
    geo_yearly = []
    for y in range(2020, 2027):
        gm = geo_min_df[geo_min_df.year == y]
        ga = geo[geo.year == y]
        permits = pd.concat([gm.record_id, ga.record_id]).nunique()
        geo_yearly.append({
            'y': y,
            'minDollars': r2(gm.billed.sum()),
            'addlDollars': r2(ga.billed.sum()),
            'hours': r1(ga.hours.sum()),
            'permits': int(permits),
            'rate': RATES['ENG'][y],
            'partial': y == 2026,
        })

    geo_out = {
        'yearly': geo_yearly,
        'dollars': r2(geo.billed.sum()), 'hours': r1(geo.hours.sum()), 'lines': int(len(geo)),
        'weeklyMedian': r1(geo_wk.median()), 'weeklyP90': r1(geo_wk.quantile(0.9)), 'weeklyMax': r1(geo_wk.max()),
        'avgWeekly2026': r1(avg_weekly.loc[2026, 'Geotech']), 'avgWeekly2020': r1(avg_weekly.loc[2020, 'Geotech']),
        'spike': {'week': spike_week.strftime('%Y-%m-%d'), 'hours': r1(geo_wk.max()),
                  'lines': int(len(spike_lines)), 'records': int(spike_lines.record_id.nunique()),
                  'topRecordHours': r1(top_rec_spike)},
        'tells': {
            'wholeGeo': whole_share('Geotech'), 'wholeDrain': whole_share('Drainage'), 'wholeSdot': whole_share('SDOT'),
            'quarterGeo': quarter_share('Geotech'), 'quarterDrain': quarter_share('Drainage'), 'quarterSdot': quarter_share('SDOT'),
            'minGeo': min_share['Geotech'], 'minDrain': min_share['Drainage'], 'minMech': min_share['Mechanical'],
            'dupGroupsAll': int(len(dup_groups)), 'dupLinesAll': int(len(dup_all)), 'dupDollarsAll': r2(dup_all.billed.sum()),
            'dupLinesGeo': int(len(dup_geo)), 'dupDollarsGeo': r2(dup_geo.billed.sum()),
            'cadencePairs': int(len(ev2)), 'cadenceViolations': int(len(tight)),
            'sameDayPairs': int(len(same_day)), 'sameDayMaxHours': r2(same_day.hours.max()),
            'cnGeo': cn_share('Geotech'), 'cnDrain': cn_share('Drainage'),
        },
    }

    # Reviewer-level attribution (anonymized in output).
    pgrp = prd.groupby(['permitnum', 'discipline']).agg(
        n_reviewers=('reviewer', 'nunique'), reviewers=('reviewer', lambda s: sorted(set(s))),
        first_assign=('reviewerassigndate', 'min'), last_finish=('reviewerfinishdate', 'max')).reset_index()
    hj = h.merge(pgrp, left_on=['record_id', 'discipline'], right_on=['permitnum', 'discipline'], how='inner')

    uniq = hj[hj.n_reviewers == 1].copy()
    uniq['reviewer'] = uniq.reviewers.str[0]
    amb = hj[hj.n_reviewers > 1]
    rw = uniq.groupby(['reviewer', 'discipline', 'week']).agg(hours=('hours', 'sum'), records=('record_id', 'nunique')).reset_index()
    over40 = rw[rw.hours > 40]
    expl = hj.explode('reviewers')
    rw_ub = expl.groupby(['reviewers', 'discipline', 'week']).hours.sum().reset_index()
    over40_ub = rw_ub[rw_ub.hours > 40]

    per_rev = uniq.groupby(['reviewer', 'discipline']).agg(hours=('hours', 'sum'), records=('record_id', 'nunique')).reset_index()
    peak = rw.groupby(['reviewer', 'discipline']).hours.max().rename('peak').reset_index()
    per_rev = per_rev.merge(peak, on=['reviewer', 'discipline']).sort_values('hours', ascending=False)
    dist = [{'r': f'R{i + 1}', 'disc': row.discipline, 'hours': r1(row.hours), 'records': int(row.records),
             'peakWeek': r1(row.peak)} for i, row in enumerate(per_rev.head(12).itertuples())]

    pos = np.where(hj.dt < hj.first_assign, 'before',
                   np.where(hj.last_finish.notna() & (hj.dt <= hj.last_finish), 'inside', 'after'))
    hj['pos'] = pos
    before = hj[hj.pos == 'before']
    geo_peak = rw[rw.discipline == 'Geotech'].hours.max()
    reviewers_out = {
        'matchedLines': int(len(hj)), 'matchedDollars': r2(hj.billed.sum()),
        'matchedDollarsPct': r1(100 * hj.billed.sum() / h.billed.sum()),
        'uniqLines': int(len(uniq)), 'uniqHours': r1(uniq.hours.sum()),
        'ambLines': int(len(amb)), 'ambHours': r1(amb.hours.sum()),
        'reviewerWeeks': int(len(rw)), 'over40Weeks': int(len(over40)), 'over40WeeksUpperBound': int(len(over40_ub)),
        'ubMaxHours': r1(rw_ub.hours.max()),
        'geoPeakWeek': r1(geo_peak), 'anyPeakWeek': r1(rw.hours.max()),
        'dist': dist,
        'window': {
            'beforeLines': int(len(before)), 'beforeHours': r1(before.hours.sum()), 'beforeDollars': r2(before.billed.sum()),
            'beforeMedianDaysEarly': r1((before.first_assign - before.dt).dt.days.median()) if len(before) else 0,
            'beforePctHours': r1(100 * before.hours.sum() / hj.hours.sum()),
            'afterPctHours': r1(100 * hj.loc[hj.pos == 'after', 'hours'].sum() / hj.hours.sum()),
            'insidePctHours': r1(100 * hj.loc[hj.pos == 'inside', 'hours'].sum() / hj.hours.sum()),
            'geoBeforeLines': int((before.discipline == 'Geotech').sum()),
            'geoBeforeHours': r1(before.loc[before.discipline == 'Geotech', 'hours'].sum()),
        },
    }

    out = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'windowStart': '2020-01-01', 'windowEnd': '2026-06-23',
        'totals': totals, 'rateCard': rate_card, 'rateRise': rate_rise,
        'monthly': monthly, 'luCollapse': lu_collapse, 'totalDrop': total_drop,
        'avgWeeklyByYear': {d: {int(y): r1(v) for y, v in avg_weekly[d].items()} for d in avg_weekly.columns},
        'mega': mega_out, 'capacity': capacity, 'capNotes': cap_notes,
        'geo': geo_out, 'reviewers': reviewers_out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f)
    print('wrote', OUT, f'{os.path.getsize(OUT) / 1024:.0f} KB')
    print(json.dumps({k: out[k] for k in ['totals', 'rateRise', 'luCollapse', 'totalDrop', 'capNotes']}, indent=1))
    print('mega:', json.dumps({k: v for k, v in mega_out.items() if k != 'top'}, indent=1))
    print('geo tells:', json.dumps(geo_out['tells'], indent=1))
    print('reviewers:', json.dumps({k: v for k, v in reviewers_out.items() if k != 'dist'}, indent=1))
    print('dist:', json.dumps(dist))
    print('capacity:', json.dumps(capacity, indent=1))


if __name__ == '__main__':
    main()
