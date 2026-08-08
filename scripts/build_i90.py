#!/usr/bin/env python3
"""Builds src/lib/generated/i90.json: calibration data for the I-90 corridor
simulation. Sources, all public and verified:

- FHWA TMAS monthly volume files (hourly, per lane, per direction) for the two
  permanent recorders on the corridor: R017AA (east end of Mt Baker Tunnel,
  MP ~4.2, 2025 data, pipe-delimited) and R117AA (west of Rainier Ave,
  MP ~3.0, 2019 data, fixed-width TMAS format).
  https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/
- WSDOT Shared/TrafficData ArcGIS service: section AADT + ramp AADT for I-90.

Downloads the TMAS zips if not cached in .targets-data/tmas/.
Run: python3 scripts/build_i90.py"""
import csv, io, json, os, ssl, urllib.request, zipfile, datetime, statistics

import certifi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.targets-data', 'tmas')
OUT = os.path.join(ROOT, 'src', 'lib', 'generated', 'i90.json')
CTX = ssl.create_default_context(cafile=certifi.where())
os.makedirs(CACHE, exist_ok=True)

TMAS_ZIPS = {
    '2025': ('https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/2025/may_2025_ccs_data.zip', 'WA_May_2025 (TMAS).VOL'),
    '2019': ('https://www.fhwa.dot.gov/policyinformation/tables/tmasdata/2019/may_2019.zip', 'WA0519.VOL'),
}
STATIONS = {'2025': 'R017AA', '2019': 'R117AA'}
DIR_CODES = {'3': 'EB', '7': 'WB'}
WEEKDAY_DOW = {'2', '3', '4', '5', '6'}  # TMAS: 1=Sun ... 7=Sat; keep Mon-Fri


def fetch_vol(year):
    url, member = TMAS_ZIPS[year]
    path = os.path.join(CACHE, member.replace(' ', '_'))
    if not os.path.exists(path):
        zpath = os.path.join(CACHE, f'tmas_{year}.zip')
        if not os.path.exists(zpath):
            print(f'downloading {url} ...')
            with urllib.request.urlopen(url, timeout=300, context=CTX) as r:
                with open(zpath, 'wb') as f:
                    f.write(r.read())
        with zipfile.ZipFile(zpath) as z:
            name = next(n for n in z.namelist() if n.endswith(member))
            with z.open(name) as src, open(path, 'wb') as dst:
                dst.write(src.read())
    return path


def parse_2025(path, station):
    """Pipe-delimited with header. One row per station/direction/lane/day."""
    rows = []
    with open(path) as f:
        rd = csv.DictReader(f, delimiter='|')
        for r in rd:
            if r['Station_Id'].strip() != station:
                continue
            if r['Travel_Dir'] not in DIR_CODES or r['Day_of_Week'] not in WEEKDAY_DOW:
                continue
            hours = [int(r[f'Hour_{h:02d}'] or 0) for h in range(24)]
            rows.append({'dir': DIR_CODES[r['Travel_Dir']], 'lane': int(r['Travel_Lane']), 'hours': hours})
    return rows


def parse_2019(path, station):
    """Fixed-width TMAS. Locate the station id in the line; fields follow it:
    +6 direction, +7 lane, +8..10 yy, +10..12 mm, +12..14 dd, +14 dow, +15.. 24x5-char volumes."""
    rows = []
    with open(path) as f:
        for line in f:
            idx = line.find(station)
            if idx < 0:
                continue
            d, lane, dow = line[idx + 6], line[idx + 7], line[idx + 14]
            if d not in DIR_CODES or dow not in WEEKDAY_DOW:
                continue
            hstr = line[idx + 15: idx + 15 + 24 * 5]
            if len(hstr) < 120:
                continue
            hours = [int(hstr[i * 5:(i + 1) * 5] or 0) for i in range(24)]
            rows.append({'dir': DIR_CODES[d], 'lane': int(lane), 'hours': hours})
    return rows


def profile(rows):
    """Average weekday hourly volumes: GP = lanes 1-3 summed, HOV = lane 4.
    TMAS lane numbering at these stations runs 1..4; the recon verified lane 4
    carries the HOV-shaped curve (moderate peak, low base)."""
    out = {}
    for dirn in ('EB', 'WB'):
        gp_days, hov_days = {}, {}
        for r in rows:
            if r['dir'] != dirn:
                continue
            bucket = hov_days if r['lane'] == 4 else gp_days
            key = (r['lane'], len(bucket.get(r['lane'], [])))
            bucket.setdefault(r['lane'], []).append(r['hours'])
        gp = [0.0] * 24
        for lane, days in gp_days.items():
            for h in range(24):
                gp[h] += statistics.mean(d[h] for d in days)
        hov = [0.0] * 24
        for lane, days in hov_days.items():
            for h in range(24):
                hov[h] += statistics.mean(d[h] for d in days)
        out[dirn] = {
            'gp': [round(x) for x in gp],
            'hov': [round(x) for x in hov],
            'gpDaily': round(sum(gp)),
            'hovDaily': round(sum(hov)),
            'laneDays': {str(l): len(d) for l, d in {**gp_days, **hov_days}.items()},
        }
    return out


def interchange_deltas(sections):
    """Net traffic gained or lost at each interchange, from consecutive
    mainline section AADT differences. Positive = net inflow to the mainline.
    Ramp records live on their own route system with ramp-relative mileposts,
    so section deltas are the cleaner public source for node flows."""
    main = sorted([s for s in sections if s['aadt'] and s['armEnd'] > s['armBegin'] >= 0.3],
                  key=lambda s: s['armBegin'])
    deltas = []
    for a, b in zip(main, main[1:]):
        if b['armBegin'] - a['armEnd'] > 1.0:
            continue
        deltas.append({'arm': b['armBegin'], 'delta': b['aadt'] - a['aadt'],
                       'from': a['location'], 'to': b['location']})
    return deltas


def fetch_geometry():
    """I-90 centerline as [lat, lng, signedMp] points, ARM 0 to 12, built from
    the traffic-sections polylines: each section's vertices get mileposts by
    linear interpolation of cumulative length between its ARM endpoints."""
    import math
    url = ('https://data.wsdot.wa.gov/arcgis/rest/services/Shared/TrafficData/MapServer/1/query'
           '?where=' + urllib.parse.quote("StateRouteNumber='090' AND BeginAccumulatedRouteMile < 12")
           + '&outFields=BeginAccumulatedRouteMile,EndAccumulatedRouteMile&returnGeometry=true&outSR=4326&f=json')
    with urllib.request.urlopen(url, timeout=90, context=CTX) as r:
        j = json.load(r)
    pts = []
    for f in j.get('features', []):
        a0 = f['attributes'].get('BeginAccumulatedRouteMile')
        a1 = f['attributes'].get('EndAccumulatedRouteMile')
        paths = (f.get('geometry') or {}).get('paths') or []
        if a0 is None or a1 is None or not paths:
            continue
        verts = [v for path in paths for v in path]
        if len(verts) < 2:
            continue
        # cumulative planar length along the vertices
        cum = [0.0]
        for (x0, y0), (x1, y1) in zip(verts, verts[1:]):
            cum.append(cum[-1] + math.hypot(x1 - x0, (y1 - y0)))
        total = cum[-1] or 1.0
        for (x, y), c in zip(verts, cum):
            arm = a0 + (a1 - a0) * (c / total)
            pts.append((round(arm + 1.94, 3), round(y, 5), round(x, 5)))  # signed MP
    pts.sort()
    # thin to ~0.02 mi spacing
    out, last = [], -9
    for mp, lat, lng in pts:
        if mp - last >= 0.02:
            out.append([mp, lat, lng])
            last = mp
    return out


def fetch_sections():
    url = ('https://data.wsdot.wa.gov/arcgis/rest/services/Shared/TrafficData/MapServer/1/query'
           '?where=' + urllib.parse.quote("StateRouteNumber='090' AND BeginAccumulatedRouteMile < 11")
           + '&outFields=Location,AADT,BeginAccumulatedRouteMile,EndAccumulatedRouteMile&returnGeometry=false&f=json')
    with urllib.request.urlopen(url, timeout=60, context=CTX) as r:
        j = json.load(r)
    return [{'location': f['attributes'].get('Location'), 'aadt': f['attributes'].get('AADT'),
             'armBegin': round(f['attributes'].get('BeginAccumulatedRouteMile') or 0, 2),
             'armEnd': round(f['attributes'].get('EndAccumulatedRouteMile') or 0, 2)}
            for f in j.get('features', [])]


import urllib.parse

profiles = {}
for year in ('2025', '2019'):
    path = fetch_vol(year)
    rows = (parse_2025 if year == '2025' else parse_2019)(path, STATIONS[year])
    p = profile(rows)
    profiles[year] = {'station': STATIONS[year], **p}
    for dirn in ('EB', 'WB'):
        d = p[dirn]
        peak = max(d['gp'])
        base = statistics.mean(d['gp'][1:4]) or 1
        print(f"{year} {STATIONS[year]} {dirn}: GP daily {d['gpDaily']:,} peak {peak}/hr "
              f"peak/overnight {peak/base:.1f}x | HOV daily {d['hovDaily']:,} | lane-days {d['laneDays']}")
        assert 3 < peak / base < 60, 'hourly shape looks wrong; check parser'
        assert 20000 < d['gpDaily'] + d['hovDaily'] < 90000, 'daily total implausible for one direction of I-90'

deltas = interchange_deltas(sections := fetch_sections())
bridge = next((s for s in sections if 'FLOATING' in (s['location'] or '').upper() or (s['armBegin'] <= 2.6 <= s['armEnd'])), None)
both_dir_daily = sum(profiles['2025'][d]['gpDaily'] + profiles['2025'][d]['hovDaily'] for d in ('EB', 'WB'))
print(f"\ncross-check: station daily both directions {both_dir_daily:,} vs nearby section AADTs "
      f"{[ (s['location'], s['aadt']) for s in sections if s['armBegin'] < 4 ][:3]}")

out = {
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'profiles': profiles,
    'interchangeDeltas': deltas,
    'geometry': fetch_geometry(),
    'sections': sections,
    'notes': {
        'source': 'FHWA TMAS monthly continuous-count files (May 2019, May 2025), weekday averages; WSDOT Shared/TrafficData ArcGIS for AADT.',
        'lanes': 'GP = TMAS lanes 1-3 summed, HOV = lane 4, verified by curve shape at R017AA.',
        'armOffset': 'ArcGIS AccumulatedRouteMile is about 1.94 miles less than signed mileposts on this stretch.',
    },
}
with open(OUT, 'w') as f:
    json.dump(out, f, indent=1)
print(f"geometry points: {len(out['geometry'])}")
print(f"\nwrote {OUT} ({os.path.getsize(OUT)//1024}KB), deltas {len(deltas)}, sections {len(sections)}")
