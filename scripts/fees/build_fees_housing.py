# Builds src/lib/generated/fees-housing.json for the /fees-housing page.
#
# Inputs:
#   .targets-data/permit_fees_all.csv   Permit Fees open dataset (k8z7-3feg),
#                                       rebuilt by scripts/fetch-permit-fees.mjs.
#                                       Reaches back to 2005; refreshed weekly.
#   .targets-data/permits_76t5_join.csv Full Building Permits dataset
#                                       (76t5-zqzr); this script re-fetches it
#                                       paged whenever it is older than the
#                                       fees CSV, keeping the same columns.
#   src/lib/generated/zip-meta.json     Neighborhood labels per ZIP (read only)
#
# The analysis window starts 2020-01-01 (the page's convention from the
# original records-request extract) and ends at the latest invoice date in
# the CSV, computed here, never typed.
#
# Semantics note: k8z7-3feg has no balance snapshot and no void flag, so
# amount_due is computed (fee amount minus paid) and includes voided or
# reissued invoice lines. Before aggregating we drop unpaid lines that look
# like exact reissues (same permit, same fee description, same amount, where
# a paid twin exists on the same permit), the same dedupe
# build_fees_revenue.py uses. We also drop unpaid lines larger than the
# largest single line ever actually paid in the dataset (a computed
# threshold): the dataset carries a handful of never-paid duplicate-pair
# lines up to tens of billions of dollars (e.g. two $39.46B "Pre Submittal
# Conference" lines on 6878457-PH) that are plainly entry errors the old
# records-request extract never surfaced. Remaining "due" is
# invoiced-and-unpaid as computed from the dataset, not a balance the city
# snapshotted.
#
# Method: sum invoices per record_id (invoiced = amount_paid + amount_due
# after the reissue dedupe). Join CN, PH and DM records to Building Permits
# on the full record id; the join matches essentially all of them. Four
# analyses:
#   1. Median fee as % of declared project value, by value band (CN permits).
#   2. Fees per net new housing unit, by project size and class (CN+PH only;
#      DM records sometimes carry housingunitsadded, so they are excluded).
#   3. Fees invoiced to permits that ended Canceled or Withdrawn, plus the
#      all-or-nothing pattern in demolition-fee nonpayment.
#   4. Per-ZIP totals from the permit addresses.
#
# Run: python3 scripts/fees/build_fees_housing.py

import json
import os
import ssl
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import certifi
import numpy as np
import pandas as pd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DATA = os.path.join(ROOT, ".targets-data")
OUT = os.path.join(ROOT, "src", "lib", "generated", "fees-housing.json")

FEES_CSV = os.path.join(DATA, "permit_fees_all.csv")
JOIN_CSV = os.path.join(DATA, "permits_76t5_join.csv")

ANALYSIS_START = "2020-01-01"
# Demo permits whose first invoice landed this many years before the window
# end count as mature (they have had years to pay).
DM_MATURE_YEARS = 3

JOIN_COLS = [
    "permitnum", "permitclass", "permitclassmapped", "permittypemapped",
    "permittypedesc", "statuscurrent", "estprojectcost", "housingunitsadded",
    "housingunitsremoved", "originalzip", "applieddate", "issueddate",
    "completeddate",
]

r2 = lambda x: round(float(x), 2)


def refresh_join_cache():
    """Re-fetch permits_76t5_join.csv when it is older than the fees CSV."""
    if os.path.exists(JOIN_CSV) and os.path.getmtime(JOIN_CSV) >= os.path.getmtime(FEES_CSV):
        return
    print("permits_76t5_join.csv older than fees CSV; re-fetching 76t5-zqzr...")
    ctx = ssl.create_default_context(cafile=certifi.where())
    frames = []
    offset, page = 0, 50000
    while True:
        q = urllib.parse.urlencode({
            "$select": ",".join(JOIN_COLS),
            "$order": ":id",
            "$limit": str(page),
            "$offset": str(offset),
        })
        with urllib.request.urlopen(
            f"https://data.seattle.gov/resource/76t5-zqzr.json?{q}", timeout=120, context=ctx
        ) as r:
            batch = json.load(r)
        if not batch:
            break
        frames.append(pd.DataFrame(batch))
        offset += page
        if len(batch) < page:
            break
    perm = pd.concat(frames, ignore_index=True)
    for c in JOIN_COLS:
        if c not in perm.columns:
            perm[c] = pd.NA
    perm = perm[JOIN_COLS]
    tmp = JOIN_CSV + ".tmp"
    perm.to_csv(tmp, index=False, quoting=1)
    os.replace(tmp, JOIN_CSV)
    print(f"  refreshed: {len(perm)} permits")


def main():
    fees = pd.read_csv(FEES_CSV)
    for c in ("amount_due", "amount_paid"):
        fees[c] = pd.to_numeric(fees[c], errors="coerce").fillna(0)
    fees["date"] = fees["date_invoiced"].str[:10]
    dataset_start = str(fees["date"].min())
    window_end = str(fees["date"].max())
    window_end_year = int(window_end[:4])
    dm_mature_last_year = window_end_year - DM_MATURE_YEARS

    # Outlier guard: no unpaid line can plausibly exceed the largest fee the
    # city ever actually collected on a single line. The lines this drops are
    # never-paid duplicate pairs reaching tens of billions of dollars.
    max_paid_line = float(fees["amount_paid"].max())
    absurd = (fees["amount_paid"] == 0) & (fees["amount_due"] > max_paid_line)
    print(f"outlier guard (unpaid line > ${max_paid_line:,.0f} max-ever-paid): "
          f"dropped {int(absurd.sum())} lines, ${fees.loc[absurd, 'amount_due'].sum():,.0f}")
    fees = fees[~absurd]

    fees = fees[fees["date"] >= ANALYSIS_START].copy()
    fees["year"] = fees["date"].str[:4].astype(int)

    # Reissue dedupe (same semantics as build_fees_revenue.py): an unpaid
    # line whose (permit, description, amount) also appears as a paid line on
    # the same permit is a voided or superseded invoice attempt, not money
    # owed. Vectorized via an index join on the key triple.
    paid_keys = pd.MultiIndex.from_frame(
        fees.loc[fees["amount_paid"] > 0, ["record_id", "description"]].assign(
            amt=fees.loc[fees["amount_paid"] > 0, "amount_paid"]
        )
    )
    unpaid_mask = (fees["amount_due"] > 0) & (fees["amount_paid"] == 0)
    unpaid_keys = pd.MultiIndex.from_frame(
        fees.loc[unpaid_mask, ["record_id", "description"]].assign(
            amt=fees.loc[unpaid_mask, "amount_due"]
        )
    )
    reissue_idx = fees.index[unpaid_mask][unpaid_keys.isin(paid_keys)]
    dropped = float(fees.loc[reissue_idx, "amount_due"].sum())
    fees = fees.drop(index=reissue_idx)
    print(f"reissue dedupe dropped {len(reissue_idx)} lines, ${dropped:,.0f} of suspect unpaid amounts")

    per = (
        fees.groupby("record_id")
        .agg(paid=("amount_paid", "sum"), due=("amount_due", "sum"), first_year=("year", "min"))
        .reset_index()
    )
    per["invoiced"] = per["paid"] + per["due"]
    per["suffix"] = per["record_id"].str.extract(r"-([A-Z]+)$")
    all_invoiced = float(per["invoiced"].sum())

    refresh_join_cache()
    perm = pd.read_csv(JOIN_CSV, low_memory=False)
    permits_fetched = datetime.fromtimestamp(os.path.getmtime(JOIN_CSV), tz=timezone.utc).isoformat()
    m = per[per["suffix"].isin(["CN", "PH", "DM"])].merge(
        perm, left_on="record_id", right_on="permitnum", how="left", indicator=True
    )
    join_rate = float((m["_merge"] == "both").mean())
    assert join_rate > 0.999, f"join rate fell to {join_rate}"
    m = m[m["_merge"] == "both"].copy()
    m["estprojectcost"] = pd.to_numeric(m["estprojectcost"], errors="coerce")
    m["units"] = pd.to_numeric(m["housingunitsadded"], errors="coerce").fillna(0)

    # ---- 1. Regressive curve: fee as % of declared project value (CN) ----
    cn_all = m[m["suffix"] == "CN"]
    cn = cn_all[(cn_all["estprojectcost"] > 0) & (cn_all["invoiced"] > 0)].copy()
    cn["pct"] = cn["invoiced"] / cn["estprojectcost"] * 100
    bands_def = [
        (0, 50e3, "Under $50K"),
        (50e3, 100e3, "$50K to $100K"),
        (100e3, 250e3, "$100K to $250K"),
        (250e3, 500e3, "$250K to $500K"),
        (500e3, 1e6, "$500K to $1M"),
        (1e6, 5e6, "$1M to $5M"),
        (5e6, 10e6, "$5M to $10M"),
        (10e6, np.inf, "Over $10M"),
    ]
    bands = []
    for lo, hi, label in bands_def:
        b = cn[(cn["estprojectcost"] >= lo) & (cn["estprojectcost"] < hi)]
        bands.append(
            {
                "label": label,
                "n": int(len(b)),
                "medianPct": r2(b["pct"].median()),
                "medianFee": r2(b["invoiced"].median()),
                "medianValue": r2(b["estprojectcost"].median()),
            }
        )
    lo_pct, hi_pct = bands[0]["medianPct"], bands[-1]["medianPct"]

    # ---- 2. Fees per new housing unit (CN + PH; DM excluded) ----
    h = m[(m["suffix"].isin(["CN", "PH"])) & (m["units"] > 0) & (m["invoiced"] > 0)].copy()
    h["per_unit"] = h["invoiced"] / h["units"]
    tiers_def = [
        (1, 2, "1 to 2 units"),
        (3, 9, "3 to 9 units"),
        (10, 49, "10 to 49 units"),
        (50, 99, "50 to 99 units"),
        (100, 249, "100 to 249 units"),
        (250, np.inf, "250+ units"),
    ]
    tiers = []
    for lo, hi, label in tiers_def:
        g = h[(h["units"] >= lo) & (h["units"] <= hi)]
        tiers.append(
            {
                "label": label,
                "n": int(len(g)),
                "units": int(g["units"].sum()),
                "medianPerUnit": r2(g["per_unit"].median()),
                "aggPerUnit": r2(g["invoiced"].sum() / g["units"].sum()),
            }
        )

    def class_stats(g):
        return {
            "n": int(len(g)),
            "units": int(g["units"].sum()),
            "medianPerUnit": r2(g["per_unit"].median()),
            "aggPerUnit": r2(g["invoiced"].sum() / g["units"].sum()),
        }

    sfd = class_stats(h[h["permitclass"] == "Single Family/Duplex"])
    mf = class_stats(h[h["permitclass"] == "Multifamily"])
    mf_big = class_stats(h[(h["permitclass"] == "Multifamily") & (h["units"] >= 100)])

    # ---- 3. Fees on permits that never happened ----
    nb = m[(m["suffix"].isin(["CN", "PH"])) & (m["statuscurrent"].isin(["Canceled", "Withdrawn"]))]
    nb_rows = [
        {
            "status": s,
            "n": int(len(g)),
            "invoiced": r2(g["invoiced"].sum()),
            "paid": r2(g["paid"].sum()),
            "units": int(g["units"].sum()),
        }
        for s, g in nb.groupby("statuscurrent")
    ]
    never_built = {
        "rows": nb_rows,
        "n": int(len(nb)),
        "invoiced": r2(nb["invoiced"].sum()),
        "paid": r2(nb["paid"].sum()),
        "unitsPlanned": int(nb["units"].sum()),
        "medianFee": r2(nb["invoiced"].median()),
        "paidSharePct": r2(nb["paid"].sum() / nb["invoiced"].sum() * 100),
    }

    dm = m[m["suffix"] == "DM"]
    dmm = dm[(dm["first_year"] <= dm_mature_last_year) & (dm["invoiced"] > 0)]
    zero = dmm["paid"] == 0
    full = dmm["due"] <= 0.005
    demo = {
        "matureLastYear": dm_mature_last_year,
        "matureN": int(len(dmm)),
        "zeroPaidN": int(zero.sum()),
        "zeroPaidPct": r2(zero.mean() * 100),
        "fullPaidN": int(full.sum()),
        "partialN": int(len(dmm) - zero.sum() - full.sum()),
        "unpaid": r2(dmm["due"].sum()),
        "invoiced": r2(dmm["invoiced"].sum()),
        "unpaidPct": r2(dmm["due"].sum() / dmm["invoiced"].sum() * 100),
        "allN": int(len(dm)),
        "allInvoiced": r2(dm["invoiced"].sum()),
    }

    # ---- 4. Per-ZIP table ----
    with open(os.path.join(ROOT, "src", "lib", "generated", "zip-meta.json")) as f:
        zip_meta = json.load(f)["zips"]
    mz = m[m["invoiced"] > 0].copy()
    mz["zip"] = mz["originalzip"].astype(str).str[:5]
    mz = mz[mz["zip"].str.match(r"981\d\d")]
    z = (
        mz.groupby("zip")
        .agg(fees=("invoiced", "sum"), n=("record_id", "count"), units=("units", "sum"))
        .reset_index()
        .sort_values("fees", ascending=False)
    )
    zips = [
        {
            "zip": row["zip"],
            "label": (zip_meta.get(row["zip"]) or {}).get("label", ""),
            "fees": r2(row["fees"]),
            "n": int(row["n"]),
            "units": int(row["units"]),
            "perUnit": r2(row["fees"] / row["units"]) if row["units"] > 0 else None,
        }
        for _, row in z.head(20).iterrows()
    ]

    joined_invoiced = float(m["invoiced"].sum())
    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "windowStart": ANALYSIS_START,
        "windowEnd": window_end,
        "datasetStart": dataset_start,
        "permitsFetchedAt": permits_fetched,
        "reissueDropped": r2(dropped),
        "joined": {
            "records": int(len(m)),
            "invoiced": r2(joined_invoiced),
            "paid": r2(m["paid"].sum()),
            "shareOfAllInvoicedPct": r2(joined_invoiced / all_invoiced * 100),
        },
        "curve": {
            "bands": bands,
            "loPct": lo_pct,
            "hiPct": hi_pct,
            "ratio": r2(lo_pct / hi_pct),
            "n": int(len(cn)),
            "valueSharePct": r2(len(cn) / max((cn_all["invoiced"] > 0).sum(), 1) * 100),
        },
        "perUnit": {
            "tiers": tiers,
            "sfd": sfd,
            "mf": mf,
            "mfBig": mf_big,
            "permits": int(len(h)),
            "units": int(h["units"].sum()),
            "fees": r2(h["invoiced"].sum()),
            "aggPerUnit": r2(h["invoiced"].sum() / h["units"].sum()),
        },
        "neverBuilt": never_built,
        "demo": demo,
        "zips": zips,
        "zipCount": int(len(z)),
    }

    with open(OUT, "w") as f:
        json.dump(out, f)
    kb = os.path.getsize(OUT) / 1024

    print(f"wrote {OUT} ({kb:.1f} KB)")
    print(f"window {ANALYSIS_START} to {window_end} (dataset back to {dataset_start})")
    print(f"join rate CN/PH/DM: {join_rate:.4f}, records {len(m)}")
    print(f"joined invoiced ${joined_invoiced/1e6:.1f}M = {out['joined']['shareOfAllInvoicedPct']}% of all invoiced")
    print(f"curve: {lo_pct}% under $50K vs {hi_pct}% over $10M, ratio {out['curve']['ratio']}x, n={len(cn)}")
    print(f"per-unit: SFD median ${sfd['medianPerUnit']}, MF median ${mf['medianPerUnit']}, "
          f"MF 100+ median ${mf_big['medianPerUnit']}, citywide agg ${out['perUnit']['aggPerUnit']}")
    print(f"never built: {never_built['n']} permits, ${never_built['invoiced']/1e6:.2f}M invoiced, "
          f"${never_built['paid']/1e6:.2f}M paid, {never_built['unitsPlanned']} units planned")
    print(f"demo mature (first invoiced by {dm_mature_last_year}): {demo['matureN']} permits, "
          f"{demo['zeroPaidPct']}% paid nothing, {demo['fullPaidN']} paid in full, {demo['partialN']} partial")
    print(f"zips: {len(zips)} shown of {out['zipCount']}, top {zips[0]['zip']} ${zips[0]['fees']/1e6:.1f}M")


if __name__ == "__main__":
    main()
