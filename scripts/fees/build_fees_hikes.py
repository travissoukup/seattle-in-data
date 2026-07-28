#!/usr/bin/env python3
"""Build src/lib/generated/fees-hikes.json for the /fees-hikes page.

Source: .targets-data/permit_fees_all.csv, an SDCI invoice extract obtained by
public records request (Jan 2020 through Jun 23 2026).

Method notes:
- "Price" of a fee label = the modal (most common) invoiced amount for that
  description + permit-type suffix in a calendar year. Hourly fees have no
  stable modal price and are excluded from modal tracking; the land use hourly
  rate is instead derived from the quarter-hour lattice and the 10-hour minimum.
- Amount basis: amount_paid when paid, else amount_due (so unpaid invoices
  still carry their listed price). The 5% Technology Fee rows are excluded
  everywhere (line-count and modal noise, not a price of anything).
"""
import json
import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / '.targets-data' / 'permit_fees_all.csv'
OUT = ROOT / 'src' / 'lib' / 'generated' / 'fees-hikes.json'

# Only the record-number suffixes with confirmed meanings get names; the rest
# display as their raw code.
SUFFIX_NAMES = {
    'EL': 'Electrical', 'CN': 'Construction', 'PH': 'Phased', 'RF': 'Refrigeration',
    'FR': 'Fire', 'LU': 'Land use', 'ME': 'Mechanical', 'DM': 'Demolition',
}

YEARS = list(range(2020, 2027))

df = pd.read_csv(CSV)
df['dt'] = pd.to_datetime(df['date_invoiced'])
df['year'] = df['dt'].dt.year
df['suffix'] = df['record_id'].str.extract(r'-([A-Z]+)$')[0].fillna('OTHER')
df['amt'] = df['amount_paid'].where(df['amount_paid'] > 0, df['amount_due'])
df = df[(df['amt'] > 0) & (df['description'] != '5% Technology Fee')].copy()
df['amt'] = df['amt'].round(2)

print(f'rows used: {len(df):,}; span {df.dt.min()} .. {df.dt.max()}')

# ---------------------------------------------------------------- base unit
# The SDCI hourly-fee base unit. Verified against two independent 2-unit
# tracers (Drainage Review - Minimum on CN, Geotech Review Post Issue -
# Minimum on CN): modal amount is exactly 2x the unit in every year.
def modal(desc, suf, y):
    s = df[(df.description == desc) & (df.suffix == suf) & (df.year == y)]['amt']
    if len(s) == 0:
        return None, 0, 0.0
    m = float(s.mode().iloc[0])
    return m, int(len(s)), float((s == m).mean())

unit_by_year = {}
for y in YEARS:
    a, na, sa = modal('Drainage Review - Minimum', 'CN', y)
    b, nb, sb = modal('Geotech Review Post Issue - Minimum', 'CN', y)
    assert a == b, f'{y}: tracers disagree {a} vs {b}'
    assert sa >= 0.6 and sb >= 0.6, f'{y}: tracer modal not dominant'
    unit_by_year[y] = round(a / 2, 2)
print('base unit by year:', unit_by_year)
assert unit_by_year[2020] == 115.5 and unit_by_year[2026] == 146.0

staircase = [
    {
        'y': y,
        'unit': unit_by_year[y],
        'pct': round((unit_by_year[y] / unit_by_year[y - 1] - 1) * 100, 1) if y > 2020 else None,
    }
    for y in YEARS
]
unitRise = round((unit_by_year[2026] / unit_by_year[2022] - 1) * 100, 1)
print('unit rise 2022->2026: %.1f%%' % unitRise)

# ------------------------------------------------------- land use hourly rate
# Derived from the LU-permit "Land Use Review - Minimum": modal invoice is
# exactly 10x the hourly rate every year 2020-2025. Cross-checked against the
# quarter-hour lattice of "Land Use Review - Additional Hours".
lu_rate = {}
lu_min_detail = []
lu_min = df[(df.description == 'Land Use Review - Minimum') & (df.suffix == 'LU')]
for y in YEARS:
    s = lu_min[lu_min.year == y]['amt']
    vc = s.value_counts()
    ten_hour = float(s.mode().iloc[0]) if y < 2026 else 5510.0
    rate = round(ten_hour / 10, 2)
    lu_rate[y] = rate
    tiers = {round(v / rate, 2): int(c) for v, c in vc.head(6).items()}
    lu_min_detail.append({'y': y, 'rate': rate, 'n': int(len(s)), 'tiers': tiers})
    print(y, 'rate', rate, 'n', len(s), 'tiers(hours:count)', tiers)

# lattice check for the hourly label
lu_hr = df[(df.description == 'Land Use Review - Additional Hours') & (df.suffix == 'LU')]
for y in YEARS:
    s = lu_hr[lu_hr.year == y]['amt'] / lu_rate[y]
    q = (s * 4).round(4)
    on = float((q == q.round(0)).mean())
    assert on > 0.9, f'{y}: lattice check failed ({on:.2f})'
print('quarter-hour lattice holds (>90% of hourly invoices) every year')

# 2026 tier facts. The new small charges land on construction/demolition
# records, not on LU-suffix permits, so count across all suffixes.
all_min = df[df.description == 'Land Use Review - Minimum']
s26 = all_min[all_min.year == 2026]['amt']
vc26 = s26.value_counts()
by_suf_26 = all_min[(all_min.year == 2026) & (all_min.amt == 551.0)]['suffix'].value_counts()
print('2026 one-hour (551) charges by permit type:', dict(by_suf_26))
luMin = {
    'rows': [
        {'y': d['y'], 'rate': d['rate'], 'minimum': round(d['rate'] * 10, 2),
         'nMin': d['tiers'].get(10.0, 0), 'nHalf': d['tiers'].get(5.0, 0), 'n': d['n']}
        for d in lu_min_detail
    ],
    'n26OneHour': int(vc26.get(551.0, 0)),
    'n26HalfHour': int(vc26.get(275.5, 0)),
    'n26TenHour': int(vc26.get(5510.0, 0)),
    'n26TwoHour': int(vc26.get(1102.0, 0)),
    'n26': int(len(s26)),
    'n26OneHourCN': int(by_suf_26.get('CN', 0)),
    'n26OneHourDM': int(by_suf_26.get('DM', 0)),
    'oneHourPrice': 551.0,
    'tenHourPrice2026': 5510.0,
    'tenHourPrice2025': 4670.0,
    'designReviewMin2020': 7880.0,  # = 20 x 394, the source of the 10-vs-20 confusion
    'rate2025': lu_rate[2025], 'rate2026': lu_rate[2026], 'rate2020': lu_rate[2020],
    'ratePct': round((lu_rate[2026] / lu_rate[2020] - 1) * 100, 1),
}
# verify design review minimum = 20 hours in 2020
dr, _, drshare = modal('Design Review - Minimum', 'LU', 2020)
assert dr == 7880.0 and abs(dr / lu_rate[2020] - 20) < 0.01, dr
print('Design Review - Minimum 2020 modal:', dr, '= 20 x', lu_rate[2020])
print('2026 LU minimum: 1h n=%d, 10h n=%d, 0.5h n=%d, 2h n=%d of %d' % (
    luMin['n26OneHour'], luMin['n26TenHour'], luMin['n26HalfHour'], luMin['n26TwoHour'], luMin['n26']))

# ------------------------------------------------------------ tracked labels
# Universe: description+suffix pairs, ranked by total revenue. A label-year has
# a "listed price" when the modal amount covers at least half of its invoices
# (min 20 invoices). Track labels with 5+ priced years spanning the start and
# end of the extract.
grp = df.groupby(['description', 'suffix'])
rev = grp['amt'].sum().sort_values(ascending=False)

tracked = []
for (desc, suf), revenue in rev.head(150).items():
    sub = df[(df.description == desc) & (df.suffix == suf)]
    prices = {}
    for y in YEARS:
        s = sub[sub.year == y]['amt']
        if len(s) < 20:
            continue
        m = float(s.mode().iloc[0])
        share = float((s == m).mean())
        if share >= 0.5:
            prices[y] = {'p': m, 'n': int(len(s)), 'share': round(share, 2)}
    if len(prices) < 5:
        continue
    if not ({2020, 2021} & set(prices)) or not ({2025, 2026} & set(prices)):
        continue
    first_y = min(prices); last_y = max(prices)
    tracked.append({
        'label': desc, 'suffix': suf,
        'type': SUFFIX_NAMES.get(suf, suf),
        'revenue': round(float(revenue)),
        'prices': {str(y): prices[y]['p'] for y in prices},
        'ns': {str(y): prices[y]['n'] for y in prices},
        'firstY': first_y, 'lastY': last_y,
        'firstP': prices[first_y]['p'], 'lastP': prices[last_y]['p'],
        'pct': round((prices[last_y]['p'] / prices[first_y]['p'] - 1) * 100, 1),
    })

tracked.sort(key=lambda t: -t['revenue'])
tracked = tracked[:50]
print(f'\ntracked labels: {len(tracked)}')

# risers / cutters, requiring a 2020-or-2021 start and 2025-or-2026 end
movers = [t for t in tracked if t['firstY'] <= 2021 and t['lastY'] >= 2025]
risers = sorted([t for t in movers if t['pct'] > 0], key=lambda t: -t['pct'])[:8]
cuts = sorted([t for t in movers if t['pct'] < 0], key=lambda t: t['pct'])[:8]
print('\nTop risers:')
for t in risers:
    print('  %-52s %-14s %8.2f -> %8.2f  %+6.1f%%' % (t['label'][:52], t['type'], t['firstP'], t['lastP'], t['pct']))
print('Cuts:')
for t in cuts:
    print('  %-52s %-14s %8.2f -> %8.2f  %+6.1f%%' % (t['label'][:52], t['type'], t['firstP'], t['lastP'], t['pct']))

# trough for the two headline cuts
def trough(desc, suf):
    t = [x for x in tracked if x['label'] == desc and x['suffix'] == suf][0]
    ys = sorted(int(y) for y in t['prices'])
    lo_y = min(ys, key=lambda y: t['prices'][str(y)])
    return t['prices'][str(ys[0])], t['prices'][str(lo_y)], lo_y

fr_first, fr_lo, fr_lo_y = trough('Appliance', 'FR')
rf_first, rf_lo, rf_lo_y = trough('Basic Fee', 'RF')
frAppliance = {'first': fr_first, 'low': fr_lo, 'lowY': fr_lo_y,
               'pct': round((fr_lo / fr_first - 1) * 100, 1)}
rfBasic = {'first': rf_first, 'low': rf_lo, 'lowY': rf_lo_y,
           'pct': round((rf_lo / rf_first - 1) * 100, 1)}
print('FR Appliance trough:', frAppliance)
print('RF Basic Fee trough:', rfBasic)

# SFD Plan Review single-step. Tracked under the fire-systems suffix; the
# construction-suffix modal is identical every year (282/305/400), it just has
# more multi-unit invoices, so its modal share dips below the tracking bar.
sfd = [t for t in tracked if t['label'] == 'SFD Plan Review' and t['suffix'] == 'FS'][0]
for y in [2020, 2023, 2024, 2025, 2026]:
    cn_m, _, _ = modal('SFD Plan Review', 'CN', y)
    assert cn_m == sfd['prices'][str(y)], f'CN/FS SFD price mismatch in {y}'
sfdStep = round((sfd['prices']['2025'] / sfd['prices']['2024'] - 1) * 100, 1)
print('SFD Plan Review 2024->2025 step: +%.1f%% (CN modal matches FS every year)' % sfdStep)

# ---------------------------------------------- January: when changes land
# For each adjacent-year modal price change among tracked labels, find the day
# of year the new price first appears.
changes = []
jan13 = 0
for t in tracked:
    ys = sorted(int(y) for y in t['prices'])
    for a, b in zip(ys, ys[1:]):
        if b - a != 1 or t['prices'][str(a)] == t['prices'][str(b)]:
            continue
        sub = df[(df.description == t['label']) & (df.suffix == t['suffix']) &
                 (df.year == b) & (df.amt == t['prices'][str(b)])]
        first = sub['dt'].min()
        doy = int(first.dayofyear)
        changes.append({'label': t['label'], 'suffix': t['suffix'], 'y': b,
                        'up': t['prices'][str(b)] > t['prices'][str(a)], 'doy': doy})
        if doy <= 3:
            jan13 += 1
nChanges = len(changes)
print(f'\nprice steps among tracked labels: {nChanges}; first seen Jan 1-3: {jan13} '
      f'({jan13/nChanges*100:.0f}%); within January: '
      f'{sum(1 for c in changes if c["doy"] <= 31)}')

perYear = []
for y in YEARS[1:]:
    ups = sum(1 for c in changes if c['y'] == y and c['up'])
    downs = sum(1 for c in changes if c['y'] == y and not c['up'])
    both = len({(t['label'], t['suffix']) for t in tracked
                if str(y) in t['prices'] and str(y - 1) in t['prices']})
    perYear.append({'y': y, 'raised': ups, 'cut': downs, 'tracked': both})
    print(y, 'raised', ups, 'cut', downs, 'of', both, 'tracked pairs')

# ------------------------------------------------------------------- explorer
explorer = [
    {'label': t['label'], 'type': t['type'], 'suffix': t['suffix'],
     'revenue': t['revenue'],
     'prices': [t['prices'].get(str(y)) for y in YEARS]}
    for t in tracked
]

out = {
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'dataStart': str(df.dt.min().date()), 'dataEnd': str(df.dt.max().date()),
    'rowsUsed': int(len(df)),
    'years': YEARS,
    'staircase': staircase,
    'unit2020': unit_by_year[2020], 'unit2026': unit_by_year[2026],
    'unitRisePct': unitRise,
    'unitHikes': [s for s in staircase if s['pct'] and s['pct'] > 0],
    'luMin': luMin,
    'risers': risers, 'cuts': cuts,
    'frAppliance': frAppliance, 'rfBasic': rfBasic,
    'sfd': {'p2020': sfd['prices']['2020'], 'p2024': sfd['prices']['2024'],
            'p2025': sfd['prices']['2025'], 'pct': sfd['pct'], 'stepPct': sfdStep},
    'luRate': {'r2020': lu_rate[2020], 'r2025': lu_rate[2025], 'r2026': lu_rate[2026],
               'pct': round((lu_rate[2026] / lu_rate[2020] - 1) * 100, 1)},
    'nTracked': len(tracked),
    'nChanges': nChanges, 'nJan13': jan13,
    'nOutsideJan': sum(1 for c in changes if c['doy'] > 31),
    'pctJan13': round(jan13 / nChanges * 100, 1),
    'perYear': perYear,
    'explorer': explorer,
}
OUT.write_text(json.dumps(out) + '\n')
print(f'\nwrote {OUT} ({OUT.stat().st_size/1024:.0f} KB)')
