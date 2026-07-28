# Builds src/lib/generated/fees-housing.json for the /fees-housing page.
#
# Inputs:
#   .targets-data/permit_fees_all.csv   SDCI invoice extract from a public
#                                       records request, Jan 2020 to Jun 23 2026
#   .targets-data/permits_76t5_join.csv Full Building Permits dataset
#                                       (76t5-zqzr), fetched paged via curl
#   src/lib/generated/zip-meta.json     Neighborhood labels per ZIP (read only)
#
# Method: sum invoices per record_id (invoiced = amount_paid + amount_due,
# where amount_due is the unpaid balance as of the extract date). Join CN, PH
# and DM records to Building Permits on the full record id; the join matches
# 100% of those records. Four analyses:
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
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DATA = os.path.join(ROOT, ".targets-data")
OUT = os.path.join(ROOT, "src", "lib", "generated", "fees-housing.json")

DM_MATURE_LAST_YEAR = 2023  # demo permits first invoiced by this year count as mature

r2 = lambda x: round(float(x), 2)


def main():
    fees = pd.read_csv(os.path.join(DATA, "permit_fees_all.csv"))
    for c in ("amount_due", "amount_paid"):
        fees[c] = pd.to_numeric(fees[c], errors="coerce").fillna(0)
    fees["year"] = fees["date_invoiced"].str[:4].astype(int)

    per = (
        fees.groupby("record_id")
        .agg(paid=("amount_paid", "sum"), due=("amount_due", "sum"), first_year=("year", "min"))
        .reset_index()
    )
    per["invoiced"] = per["paid"] + per["due"]
    per["suffix"] = per["record_id"].str.extract(r"-([A-Z]+)$")
    all_invoiced = float(per["invoiced"].sum())

    perm = pd.read_csv(os.path.join(DATA, "permits_76t5_join.csv"))
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
    dmm = dm[(dm["first_year"] <= DM_MATURE_LAST_YEAR) & (dm["invoiced"] > 0)]
    zero = dmm["paid"] == 0
    full = dmm["due"] <= 0.005
    demo = {
        "matureLastYear": DM_MATURE_LAST_YEAR,
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
        "windowStart": "2020-01-01",
        "windowEnd": "2026-06-23",
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
    print(f"join rate CN/PH/DM: {join_rate:.4f}, records {len(m)}")
    print(f"joined invoiced ${joined_invoiced/1e6:.1f}M = {out['joined']['shareOfAllInvoicedPct']}% of all invoiced")
    print(f"curve: {lo_pct}% under $50K vs {hi_pct}% over $10M, ratio {out['curve']['ratio']}x, n={len(cn)}")
    print(f"per-unit: SFD median ${sfd['medianPerUnit']}, MF median ${mf['medianPerUnit']}, "
          f"MF 100+ median ${mf_big['medianPerUnit']}, citywide agg ${out['perUnit']['aggPerUnit']}")
    print(f"never built: {never_built['n']} permits, ${never_built['invoiced']/1e6:.2f}M invoiced, "
          f"${never_built['paid']/1e6:.2f}M paid, {never_built['unitsPlanned']} units planned")
    print(f"demo mature: {demo['matureN']} permits, {demo['zeroPaidPct']}% paid nothing, "
          f"{demo['fullPaidN']} paid in full, {demo['partialN']} partial")
    print(f"zips: {len(zips)} shown of {out['zipCount']}, top {zips[0]['zip']} ${zips[0]['fees']/1e6:.1f}M")


if __name__ == "__main__":
    main()
