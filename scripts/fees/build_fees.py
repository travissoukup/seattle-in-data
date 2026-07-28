#!/usr/bin/env python3
"""Build fees.json for the /fees page (what a Seattle permit actually costs).

Input: .targets-data/permit_fees_all.csv, an SDCI invoice extract obtained by
public records request (Jan 2020 through Jun 23 2026). Also joins estimated
project cost from Socrata dataset 76t5-zqzr, cached at
.targets-data/permit_costs_76t5.csv (refresh with the curl in the comment below).

  curl -s "https://data.seattle.gov/resource/76t5-zqzr.csv?\
$select=permitnum,permitclass,permitclassmapped,permittypedesc,estprojectcost&$limit=300000" \
    -o .targets-data/permit_costs_76t5.csv

Notes on the extract:
- amount_paid is dollars actually collected; amount_due is a balance snapshot
  at extract time, not a history. The permit totals here use amount_paid.
- The 5% Technology Fee (from 2023-01-02) doubled line counts in 2023, so any
  per-line-item counting here excludes it. Dollar totals keep it.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
FEES_CSV = ROOT / ".targets-data" / "permit_fees_all.csv"
COSTS_CSV = ROOT / ".targets-data" / "permit_costs_76t5.csv"
OUT = ROOT / "src" / "lib" / "generated" / "fees.json"

SUFFIX_NAMES = {
    "EL": "Electrical",
    "CN": "Construction",
    "PH": "Phased construction",
    "RF": "Refrigeration",
    "FR": "Fire",
    "LU": "Land use",
    "ME": "Mechanical",
    "DM": "Demolition",
    "FS": "Fire sprinkler / alarm",
    "CY": "Conveyance (elevator)",
    "SB": "Sign or billboard",
    "BP": "Boiler / pressure vessel",
    "RR": "Reroof",
    "BK": "Blanket (tenant build-out)",
    "GR": "Grading",
    "CC": "Curb cut",
}


def classify(desc: str) -> str:
    """Map one of the 323 fee descriptions to a fee family."""
    d = desc.strip().lower()

    # Surcharges and overhead riders added onto other fees.
    if d == "5% technology fee" or d.startswith("state surcharge") or d == "administrative fee":
        return "Surcharges and overhead"
    # Penalties and enforcement-flavored charges.
    if (
        "penalty" in d
        or "no show" in d
        or "nsf check" in d
        or "nov-research" in d
        or "special investigation" in d
    ):
        return "Penalties and no-shows"
    # Public notice costs on land use decisions.
    if d.startswith("notice") or "public meeting room" in d or d == "mail out" or d == "environmental review sign":
        return "Notices"
    # Time-billed lines win over the inspection keyword ("SDOT Hourly Review
    # and Inspection", "Site Inspection Post Issue - Additional Hours").
    if "additional hour" in d or "hourly" in d:
        return "Hourly review time"
    # Inspections billed as such (site visits, tests, reinspections).
    if (
        "inspection" in d
        or "ufer test" in d
        or "functional test" in d
    ):
        return "Inspections"
    # Value-based charges: scale with stated project value.
    if (
        "value based" in d
        or "value-based" in d
        or d in ("building permit: issuance", "building permit: intake")
        or d.startswith("permit fee (with plan review)")
        or d.startswith("blanket p")
    ):
        return "Value-based intake, issuance and plan review"
    # Hourly review time (billed on a quarter-hour lattice) and its minimums.
    if (
        "additional hour" in d
        or "hourly" in d
        or "- minimum" in d
        or d.endswith("review minimum")
        or d.endswith("minimum")
        and ("review" in d or "conference" in d or "coaching" in d)
        or "pre submittal conference" in d
        or "pre-sub conference" in d
        or "peer review" in d
        or ("review" in d and "plan review" not in d and "renewal" not in d)
    ):
        return "Hourly review time"
    # Flat plan review products (single family plan review and similar).
    if "plan review" in d:
        return "Flat plan review"
    # Application plumbing: get started, setup, renewals, revisions, records.
    if (
        d in ("get started", "application setup", "recording", "basic fee", "permit fee", "miscellaneous", "ar miscellaneous", "project impact")
        or "minimum permit fee" in d
        or "renewal" in d
        or "reestablish" in d
        or "revision" in d
        or "correction" in d
        or "address change" in d
        or "post-issuance change" in d
        or "post issuance change" in d
        or "intake appointment" in d
        or "records research" in d
        or "establish use for the record" in d
        or "extension" in d
        or "temporary" in d
        or "application review" in d
        or "floodplain" in d
        or "special events" in d
    ):
        return "Application and paperwork"
    # Everything else in the schedule is a per-item unit rate: circuits,
    # appliances, compressors, elevators, alarm devices, signs, demolition...
    return "Per-item unit rates"


FAMILY_BLURBS = {
    "Value-based intake, issuance and plan review": "Charges that scale with the stated project value: building permit intake, issuance and value-based plan review.",
    "Hourly review time": "Reviewer time billed by the hour: land use, drainage, geotech, zoning, energy, SDOT and the minimum charges that go with them.",
    "Per-item unit rates": "Flat rates per thing: each circuit, appliance, compressor, elevator, alarm device, sign or demolition.",
    "Flat plan review": "Fixed-price plan review products, mostly for single family homes.",
    "Inspections": "Site visits, system tests and reinspections billed as their own line.",
    "Surcharges and overhead": "The 5% technology fee, administrative fees and state surcharges riding on top of other charges.",
    "Application and paperwork": "Getting started, renewals, revisions, corrections and other counter work.",
    "Notices": "Publishing, mailing and posting public notice of land use decisions.",
    "Penalties and no-shows": "Missed inspections, bounced checks and code penalties.",
}


def q(s: pd.Series, p: float) -> float:
    return float(s.quantile(p))


def r2(x) -> float:
    return round(float(x), 2)


def main() -> None:
    fees = pd.read_csv(FEES_CSV)
    assert len(fees) == 1_416_573, len(fees)
    # A few conveyance records look like 6730679-CY-001; take the letter code.
    fees["suffix"] = fees.record_id.str.extract(r"-([A-Z]+)(?:-\d+)?$")
    assert fees.suffix.notna().all()

    dates = pd.to_datetime(fees.date_invoiced)
    start, end = dates.min(), dates.max()

    total_paid = float(fees.amount_paid.sum())
    total_due = float(fees.amount_due.sum())
    n_lines = int(len(fees))
    n_descriptions = int(fees.description.nunique())

    # ---- permit-level totals (amount actually paid per record_id) ----
    per = fees.groupby(["record_id", "suffix"], as_index=False).amount_paid.sum()
    n_permits_all = int(len(per))
    per = per[per.amount_paid > 0]
    p = per.amount_paid
    n_permits = int(len(per))

    dist = {
        "median": r2(p.median()),
        "p90": r2(q(p, 0.90)),
        "p99": r2(q(p, 0.99)),
        "max": r2(p.max()),
        "maxId": per.loc[p.idxmax(), "record_id"],
        "under200Pct": r2((p < 200).mean() * 100),
        "under500Pct": r2((p < 500).mean() * 100),
    }
    s = p.sort_values(ascending=False)
    n_top1 = int(np.ceil(n_permits * 0.01))
    dist["top1Count"] = n_top1
    dist["top1SharePct"] = r2(s.head(n_top1).sum() / s.sum() * 100)
    dist["top1Threshold"] = r2(q(p, 0.99))

    # histogram buckets for the distribution chart (share of permits)
    edges = [0, 100, 200, 500, 1000, 2000, 5000, 20000, np.inf]
    bucket_labels = [
        "under $100", "$100 to $200", "$200 to $500", "$500 to $1K",
        "$1K to $2K", "$2K to $5K", "$5K to $20K", "over $20K",
    ]
    cut = pd.cut(p, edges, labels=bucket_labels, right=False)
    counts = cut.value_counts().reindex(bucket_labels)
    dollars = p.groupby(cut, observed=False).sum().reindex(bucket_labels)
    histogram = [
        {
            "bucket": lbl,
            "permitsPct": r2(counts[lbl] / n_permits * 100),
            "dollarsPct": r2(dollars[lbl] / p.sum() * 100),
        }
        for lbl in bucket_labels
    ]

    # ---- fee families ----
    fees["family"] = fees.description.map(classify)
    fam = (
        fees.groupby("family")
        .agg(paid=("amount_paid", "sum"), n=("amount_paid", "size"), kinds=("description", "nunique"))
        .sort_values("paid", ascending=False)
    )
    families = [
        {
            "family": name,
            "paid": r2(row.paid),
            "sharePct": r2(row.paid / total_paid * 100),
            "kinds": int(row.kinds),
            "blurb": FAMILY_BLURBS[name],
        }
        for name, row in fam.iterrows()
    ]
    tech_fee_paid = float(fees.loc[fees.description == "5% Technology Fee", "amount_paid"].sum())
    hourly_paid = float(fam.loc["Hourly review time", "paid"])
    value_paid = float(fam.loc["Value-based intake, issuance and plan review", "paid"])

    # ---- typical bill by permit type ----
    by_type_raw = per.groupby("suffix").amount_paid.agg(
        n="size",
        p25=lambda x: x.quantile(0.25),
        med="median",
        p75=lambda x: x.quantile(0.75),
        total="sum",
    )
    by_type = [
        {
            "suffix": sfx,
            "name": SUFFIX_NAMES[sfx],
            "n": int(row.n),
            "p25": r2(row.p25),
            "median": r2(row.med),
            "p75": r2(row.p75),
            "total": r2(row.total),
        }
        for sfx, row in by_type_raw.sort_values("med", ascending=False).iterrows()
    ]

    # ---- estimator: CN by project-value band, everything else overall ----
    costs = pd.read_csv(COSTS_CSV)
    m = per.merge(
        costs[["permitnum", "estprojectcost"]], left_on="record_id", right_on="permitnum", how="left"
    )
    cn = m[(m.suffix == "CN") & m.estprojectcost.notna()].copy()
    cn_match_pct = r2(len(cn) / (per.suffix == "CN").sum() * 100)
    band_edges = [0, 10_000, 50_000, 100_000, 250_000, 750_000, 2_000_000, np.inf]
    band_labels = [
        "under $10K", "$10K to $50K", "$50K to $100K", "$100K to $250K",
        "$250K to $750K", "$750K to $2M", "over $2M",
    ]
    cn["band"] = pd.cut(cn.estprojectcost, band_edges, labels=band_labels, right=False)
    cn_bands = [
        {
            "band": lbl,
            "n": int(len(sub)),
            "p25": r2(sub.amount_paid.quantile(0.25)),
            "median": r2(sub.amount_paid.median()),
            "p75": r2(sub.amount_paid.quantile(0.75)),
        }
        for lbl, sub in cn.groupby("band", observed=False)
    ]

    ph = m[(m.suffix == "PH") & m.estprojectcost.notna()]
    estimator = {
        "cnBands": cn_bands,
        "cnMatchPct": cn_match_pct,
        "types": [
            {
                "suffix": t["suffix"],
                "name": t["name"],
                "n": t["n"],
                "p25": t["p25"],
                "median": t["median"],
                "p75": t["p75"],
            }
            for t in by_type
        ],
        "phMedianProjectCost": r2(ph.estprojectcost.median()),
    }

    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "windowStart": str(start.date()),
        "windowEnd": str(end.date()),
        "nLines": n_lines,
        "nDescriptions": n_descriptions,
        "nPermitsAll": n_permits_all,
        "nPermits": n_permits,
        "totalPaid": r2(total_paid),
        "totalDue": r2(total_due),
        "techFeePaid": r2(tech_fee_paid),
        "hourlyPaid": r2(hourly_paid),
        "valuePaid": r2(value_paid),
        "dist": dist,
        "histogram": histogram,
        "families": families,
        "byType": by_type,
        "estimator": estimator,
    }
    OUT.write_text(json.dumps(out) + "\n")

    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT} ({kb:.1f} KB)")
    print(f"window {start} .. {end}")
    print(f"lines {n_lines:,}  descriptions {n_descriptions}  permits paid>0 {n_permits:,} of {n_permits_all:,}")
    print(f"paid ${total_paid:,.0f}  due snapshot ${total_due:,.0f}  tech fee ${tech_fee_paid:,.0f}")
    print("dist", dist)
    print("families:")
    for f in families:
        print(f"  {f['family']:<46} ${f['paid']:>14,.0f}  {f['sharePct']:>5.1f}%  kinds={f['kinds']}")
    print("by type:")
    for t in by_type:
        print(f"  {t['suffix']:<3} {t['name']:<28} n={t['n']:>7,}  med ${t['median']:>12,.2f}")
    print("cn bands:")
    for b in cn_bands:
        print(f"  {b['band']:<16} n={b['n']:>6,}  {b['p25']:>10,.0f} / {b['median']:>10,.0f} / {b['p75']:>10,.0f}")
    print(f"cn match {cn_match_pct}%  ph median project cost ${estimator['phMedianProjectCost']:,.0f}")


if __name__ == "__main__":
    main()
