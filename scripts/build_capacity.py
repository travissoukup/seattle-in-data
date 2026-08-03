#!/usr/bin/env python3
"""Builds src/lib/generated/capacity.json: every computed fact for the
/capacity development-capacity page (3066 63rd Ave SW, PIN 6373000105).

Facts come from queries, not typing: King County assessor extracts
(.targets-data/), Seattle GIS (zoning, ECA, transit layers), our permit-fee
records-request data, and recorded sales. Zoning standards themselves live in
src/lib/capacity-standards.ts with per-value citations; this script only
gathers parcel facts. Run: python3 scripts/build_capacity.py"""
import csv, json, ssl, urllib.request, os, datetime

import certifi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, '.targets-data')
OUT = os.path.join(ROOT, 'src', 'lib', 'generated', 'capacity.json')
CTX = ssl.create_default_context(cafile=certifi.where())

PIN = '6373000105'
LAT, LNG = 47.57641687, -122.41301437
GIS = 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services'

def gis_count(service, layer, dist=None):
    url = (f'{GIS}/{service}/FeatureServer/{layer}/query?geometry={LNG},{LAT}'
           f'&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects'
           + (f'&distance={dist}&units=esriSRUnit_Meter' if dist else '')
           + '&returnCountOnly=true&f=json')
    with urllib.request.urlopen(url, timeout=30, context=CTX) as r:
        return json.load(r)['count']

def gis_attrs(service, layer, fields):
    url = (f'{GIS}/{service}/FeatureServer/{layer}/query?geometry={LNG},{LAT}'
           f'&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects'
           f'&outFields={fields}&returnGeometry=false&f=json')
    with urllib.request.urlopen(url, timeout=30, context=CTX) as r:
        f = json.load(r)['features']
        return f[0]['attributes'] if f else None

# ---- parcel + building + values from assessor extracts ----
parcel = building = None
with open(os.path.join(DATA, 'EXTR_Parcel.csv'), encoding='cp1252') as f:
    for row in csv.DictReader(f):
        if row['Major'] + row['Minor'] == PIN:
            parcel = {'zone': row['CurrentZoning'].strip(), 'lotSf': int(row['SqFtLot']),
                      'unbuildable': row['Unbuildable'].strip(), 'district': row['DistrictName'].strip()}
            break
with open(os.path.join(DATA, 'EXTR_ResBldg.csv'), encoding='cp1252') as f:
    for row in csv.DictReader(f):
        if row['Major'] + row['Minor'] == PIN:
            building = {'units': int(row['NbrLivingUnits']), 'sqft': int(row['SqFtTotLiving']),
                        'yrBuilt': int(row['YrBuilt']), 'beds': int(row['Bedrooms']),
                        'bathsFull': int(row['BathFullCount']), 'condition': int(row['Condition']),
                        'grade': int(row['BldgGrade'])}
            break
values = None
with open(os.path.join(DATA, 'EXTR_RPAcct_NoName.csv'), encoding='cp1252') as f:
    best = None
    for row in csv.DictReader(f):
        if row['Major'] + row['Minor'] == PIN:
            if not best or int(row['BillYr']) > int(best['BillYr']):
                best = row
    values = {'billYr': int(best['BillYr']), 'land': int(best['ApprLandVal']), 'imps': int(best['ApprImpsVal'])}

sales = []
with open(os.path.join(DATA, 'EXTR_RPSale.csv'), encoding='cp1252') as f:
    for row in csv.DictReader(f):
        if row['Major'] + row['Minor'] == PIN and int(row['SalePrice'] or 0) > 0:
            sales.append({'date': row['DocumentDate'], 'price': int(row['SalePrice'])})

# ---- GIS checks (live) ----
zoning = gis_attrs('Current_Land_Use_Zoning_Detail_2', 0, 'ZONING,MHA,MHA_VALUE,OVERLAY,SHORELINE,PEDESTRIAN')
eca_layers = [
    ('Steep slope', 'Environmentally_Critical_Areas_Steep_Slope', 9),
    ('Known slide (affected)', 'Environmentally_Critical_Areas_Known_Slides', 1),
    ('Known slide (initiation)', 'Environmentally_Critical_Areas_Known_Slides', 2),
    ('Potential slide area', 'Environmentally_Critical_Areas_Potential_Slide_Areas', 7),
    ('Liquefaction prone', 'ECA_Liquefaction_Prone_Areas', 5),
    ('Flood prone', 'ECA_Flood_Prone_Areas', 0),
    ('Wetland', 'Environmentally_Critical_Areas_Wetlands', 10),
    ('Riparian corridor', 'Environmentally_Critical_Areas_Riparian_Corridors', 8),
    ('Peat settlement', 'ECA_Peat_Settlement_Prone_Areas', 6),
    ('Fish and wildlife habitat', 'ECA_Fish_and_Wildlife_Habitat_Conservation_Area', 11),
]
eca = [{'name': n, 'atPoint': gis_count(s, l) > 0, 'within60m': gis_count(s, l, 60) > 0} for n, s, l in eca_layers]
transit = {
    'frequentTransitArea': gis_count('Frequent_Transit_Service_Area', 0) > 0,
    'hb1110MajorTransitHalfMile': gis_count('HB_1110_major_transit_half_mile', 0) > 0,
}

# ---- comps: 98116 new-build (2019+) sales since 2024 ----
bldg98116 = {}
with open(os.path.join(DATA, 'EXTR_ResBldg.csv'), encoding='cp1252') as f:
    for row in csv.DictReader(f):
        if row['ZipCode'].strip().startswith('98116') and int(row['YrBuilt'] or 0) >= 2019:
            p = row['Major'] + row['Minor']
            b = bldg98116.setdefault(p, {'units': 0, 'sqft': 0})
            b['units'] += int(row['NbrLivingUnits'] or 0)
            b['sqft'] += int(row['SqFtTotLiving'] or 0)
comp_sales = []
with open(os.path.join(DATA, 'EXTR_RPSale.csv'), encoding='cp1252') as f:
    for row in csv.DictReader(f):
        p = row['Major'] + row['Minor']
        if p in bldg98116 and row['PrincipalUse'].strip() == '6':
            y, price = int(row['DocumentDate'][-4:] or 0), int(row['SalePrice'] or 0)
            b = bldg98116[p]
            if y >= 2024 and price >= 400000 and b['sqft'] > 0 and b['units'] <= 2:
                comp_sales.append(price / b['sqft'])
comp_sales.sort()
n = len(comp_sales)
comps = {'n': n, 'medPerSf': round(comp_sales[n // 2]) if n else None,
         'p25PerSf': round(comp_sales[n // 4]) if n else None,
         'p75PerSf': round(comp_sales[3 * n // 4]) if n else None,
         'window': 'sales 2024 to mid 2026 of homes built 2019 or later in 98116'}

# ---- permit-fee benchmarks from the records-request data ----
import pandas as pd
d = pd.read_csv(os.path.join(DATA, 'permit_fees_all.csv'))
j = pd.read_csv(os.path.join(DATA, 'permits_76t5_join.csv'), low_memory=False)
new34 = j[(j.housingunitsadded >= 2) & (j.housingunitsadded <= 4) &
          (j.permitclassmapped == 'Residential') & (j.permittypedesc.str.contains('New', na=False))]
tot = d[d.record_id.isin(set(new34.permitnum))].groupby('record_id').amount_paid.sum()
g = d[d.description.str.contains('GeoTech', na=False, case=False)].groupby('record_id').amount_paid.sum()
fees = {
    'newBuild24Units': {'n': int(len(tot)), 'median': round(tot.median()), 'p25': round(tot.quantile(.25)), 'p75': round(tot.quantile(.75))},
    'geotechReview': {'n': int(len(g)), 'median': round(g.median()), 'p90': round(g.quantile(.9))},
}

out = {
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'address': '3066 63rd Ave SW, Seattle, WA 98116',
    'pin': PIN, 'lat': LAT, 'lng': LNG,
    'parcel': parcel, 'building': building, 'values': values, 'sales': sales,
    'zoningGis': zoning, 'eca': eca, 'transit': transit,
    'comps': comps, 'fees': fees,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(out, f, indent=1)
print(json.dumps({k: out[k] for k in ['parcel', 'values', 'transit']}, indent=1))
print('ECA hits:', [e['name'] for e in eca if e['atPoint']])
print('comps:', comps, '\nfees:', fees)
print('wrote', OUT)
