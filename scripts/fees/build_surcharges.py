#!/usr/bin/env python3
"""Build fees-surcharges.json: the 5% Technology Fee, the admin fee staircase,
and the junk drawer of odd lines in SDCI's permit-fee extract.

Input: .targets-data/permit_fees_all.csv (public records request, invoices
Jan 2020 to Jun 23 2026). Output: src/lib/generated/fees-surcharges.json.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / ".targets-data" / "permit_fees_all.csv"
OUT = ROOT / "src" / "lib" / "generated" / "fees-surcharges.json"

TECH = "5% Technology Fee"
ADMIN_DESCS = ["Administrative Fee", "Administrative Post-Issuance Change"]
OVERHEAD = [TECH] + ADMIN_DESCS

df = pd.read_csv(SRC)
df["amount_paid"] = pd.to_numeric(df["amount_paid"], errors="coerce").fillna(0)
df["amount_due"] = pd.to_numeric(df["amount_due"], errors="coerce").fillna(0)
df["billed"] = df["amount_paid"] + df["amount_due"]
df["dt"] = pd.to_datetime(df["date_invoiced"], errors="coerce")
df["year"] = df["dt"].dt.year
df["day"] = df["dt"].dt.date
# One description carries a trailing space in the extract; strip for matching.
df["desc"] = df["description"].str.strip()

out = {"generatedAt": datetime.now(timezone.utc).isoformat()}
out["windowStart"] = str(df["dt"].min().date())
out["windowEnd"] = str(df["dt"].max().date())
out["totalLines"] = int(len(df))
out["totalPaid"] = float(df["amount_paid"].sum())

# ---------------------------------------------------------------- tech fee ---
tech = df[df["desc"] == TECH]
out["techLines"] = int(len(tech))
out["techPaid"] = float(tech["amount_paid"].sum())
out["techFirstDate"] = str(tech["dt"].min().date())
out["techMedianLine"] = float(tech["billed"].median())
out["techMinPaid"] = float(tech.loc[tech["amount_paid"] > 0, "amount_paid"].min())
out["adminLines"] = int((df["desc"] == "Administrative Fee").sum())

# Overhead share of each paid dollar, by year (tech + admin over all paid).
oh_mask = df["desc"].isin(OVERHEAD)
yr = df.groupby("year")["amount_paid"].sum()
yr_tech = df[df["desc"] == TECH].groupby("year")["amount_paid"].sum()
yr_admin = df[df["desc"].isin(ADMIN_DESCS)].groupby("year")["amount_paid"].sum()
share_rows = []
for y in sorted(yr.index):
    t = float(yr_tech.get(y, 0.0))
    a = float(yr_admin.get(y, 0.0))
    p = float(yr[y])
    share_rows.append(
        {
            "y": int(y),
            "tech": round(t / p * 100, 2),
            "admin": round(a / p * 100, 2),
            "overhead": round((t + a) / p * 100, 2),
        }
    )
out["overheadByYear"] = share_rows
out["overheadFirstFullYear"] = share_rows[0]
out["overheadLastFullYear"] = next(r for r in reversed(share_rows) if r["y"] < 2026)

# ------------------------------------------------- 5%-of-what verification ---
# An invoice = every line sharing a record_id and an exact timestamp.
sub = df[df["year"] >= 2023].copy()
is_tech = sub["desc"] == TECH
is_surch = sub["desc"].str.startswith("State Surcharge")
sub["t_amt"] = np.where(is_tech, sub["billed"], 0.0)
sub["b_amt"] = np.where(~is_tech, sub["billed"], 0.0)
sub["s_amt"] = np.where(is_surch, sub["billed"], 0.0)
inv = sub.groupby(["record_id", "date_invoiced"]).agg(
    t=("t_amt", "sum"), b=("b_amt", "sum"), s=("s_amt", "sum")
)
has = inv[(inv["t"] > 0) & (inv["b"] > 0)]
ratio = has["t"] / has["b"] * 100
out["invoicesWithTech"] = int(len(has))
out["ratioMedian"] = float(ratio.median())
out["pctInBand"] = float(((ratio >= 4.5) & (ratio <= 5.5)).mean() * 100)
out["pctExactFive"] = float(
    ((has["t"] - (has["b"] * 0.05).round(2)).abs() <= 0.01).mean() * 100
)
# Compounding test 1: state surcharge on the same invoice.
w = has[has["s"] > 0]
out["surchInvoices"] = int(len(w))
out["surchExactIncl"] = float(
    ((w["t"] - (w["b"] * 0.05).round(2)).abs() <= 0.01).mean() * 100
)
out["surchExactExcl"] = float(
    ((w["t"] - ((w["b"] - w["s"]) * 0.05).round(2)).abs() <= 0.01).mean() * 100
)
# Compounding test 2: Green Building Penalty invoices carrying a tech line.
gbp = df[df["desc"] == "Green Building Penalty"]
gbp_inv = set(zip(gbp["record_id"], gbp["date_invoiced"]))
gbp_with_tech = has.index.isin(gbp_inv).sum()
out["gbpInvoices"] = int(len(gbp_inv))
out["gbpInvoicesWithTech"] = int(gbp_with_tech)

# ------------------------------------------------------ small-permit burden ---
oh_per = df[oh_mask].groupby("record_id")["amount_paid"].sum()
per = df.groupby("record_id").agg(paid=("amount_paid", "sum"), first=("dt", "min"))
per["oh"] = oh_per
per["oh"] = per["oh"].fillna(0)
era = per[(per["first"] >= "2023-01-02") & (per["paid"] > 0)].copy()
era["share"] = era["oh"] / era["paid"] * 100
out["eraPermits"] = int(len(era))
small = era[era["paid"] < 500]
out["smallPermits"] = int(len(small))
out["smallMedianShare"] = float(small["share"].median())
out["permitsOver20"] = int((era["share"] > 20).sum())
out["eraMedianPaid"] = float(era["paid"].median())
buckets = [
    (0, 100, "Under $100"),
    (100, 250, "$100 to $250"),
    (250, 500, "$250 to $500"),
    (500, 1000, "$500 to $1,000"),
    (1000, 5000, "$1,000 to $5,000"),
    (5000, 25000, "$5,000 to $25,000"),
    (25000, float("inf"), "Over $25,000"),
]
brows = []
for lo, hi, label in buckets:
    s = era[(era["paid"] >= lo) & (era["paid"] < hi)]
    brows.append(
        {"label": label, "n": int(len(s)), "medianShare": round(float(s["share"].median()), 1)}
    )
out["burdenBuckets"] = brows
out["burdenPeak"] = max(brows, key=lambda r: r["medianShare"])

# ----------------------------------------------------- admin fee staircase ---
adm_el = df[(df["desc"] == "Administrative Fee") & df["record_id"].str.endswith("-EL")]
stair = []
for y, s in adm_el.groupby("year")["billed"]:
    mode = float(s.mode().iloc[0])
    stair.append(
        {
            "y": int(y),
            "fee": mode,
            "n": int(len(s)),
            "modeShare": round(float((s == mode).mean() * 100), 1),
        }
    )
out["adminStaircase"] = stair

# ---------------------------------------------------------------- junk drawer ---
junk = {}

misc = df[df["desc"].isin(["Miscellaneous", "AR Miscellaneous"])]
big = misc.loc[misc["amount_paid"].idxmax()]
junk["misc"] = {
    "lines": int(len(misc)),
    "paid": float(misc["amount_paid"].sum()),
    "maxPaid": float(big["amount_paid"]),
    "maxRecord": str(big["record_id"]),
    "maxYear": int(big["year"]),
}

typo = df[df["desc"] == "State Surcharge Commerical"]
okd = df[df["desc"] == "State Surcharge Commercial"]
junk["typo"] = {
    "typoLines": int(len(typo)),
    "typoPaid": float(typo["amount_paid"].sum()),
    "okLines": int(len(okd)),
    "okPaid": float(okd["amount_paid"].sum()),
    "lineRatio": round(len(typo) / len(okd), 1),
    "typo2026": int((typo["year"] == 2026).sum()),
}

lines = df[df["billed"] > 0]
tiny = lines[lines["billed"] < 5]
junk["tiny"] = {
    "pctLines": float(len(tiny) / len(lines) * 100),
    "pctRevenue": float(tiny["amount_paid"].sum() / lines["amount_paid"].sum() * 100),
    "n": int(len(tiny)),
    "paid": float(tiny["amount_paid"].sum()),
    "pctTech": float((tiny["desc"] == TECH).mean() * 100),
}

# Same-day repeats: same permit, same day, same description, same paid amount,
# on separate invoices. Tech-fee lines excluded (one legitimately appears per
# invoice, and one permit can get several invoices in a day).
d = df[(df["amount_paid"] > 0) & (df["desc"] != TECH)]
gp = d.groupby(["record_id", "day", "desc", "amount_paid"]).size()
dups = gp[gp > 1].reset_index(name="n")
dups["extra"] = dups["amount_paid"] * (dups["n"] - 1)
top_dup = dups.loc[dups["extra"].idxmax()]
junk["dups"] = {
    "extraLines": int((dups["n"] - 1).sum()),
    "extraPaid": float(dups["extra"].sum()),
    "maxPaid": float(top_dup["extra"]),
    "maxDesc": str(top_dup["desc"]),
    "maxRecord": str(top_dup["record_id"]),
    "maxYear": int(pd.Timestamp(top_dup["day"]).year),
}

nsf = df[df["desc"] == "NSF Check Receivable"]
junk["nsf"] = {
    "lines": int(len(nsf)),
    "paid": float(nsf["amount_paid"].sum()),
    "avg": float(nsf["billed"].mean()),
    "max": float(nsf["billed"].max()),
    "feeLines": int((df["desc"] == "NSF Check Fee").sum()),
    "feePaid": float(df.loc[df["desc"] == "NSF Check Fee", "amount_paid"].sum()),
}

gbp_first = int(gbp["year"].min())
junk["gbp"] = {
    "lines": int(len(gbp)),
    "paid": float(gbp["amount_paid"].sum()),
    "firstYear": gbp_first,
    "maxLine": float(gbp["billed"].max()),
}

ev = df[df["desc"] == "Vehicle Charging Stations"]
succ = df[df["desc"].str.contains("Car Chargers", na=False)]
junk["ev"] = {
    "lines": int(len(ev)),
    "paid": float(ev["amount_paid"].sum()),
    "lastDate": str(ev["dt"].max().date()),
    "succLines": int(len(succ)),
    "succPaid": float(succ["amount_paid"].sum()),
    "succKinds": int(succ["desc"].nunique()),
    "succFirstDate": str(succ["dt"].min().date()),
    "peakYear": int(ev.groupby("year").size().idxmax()),
    "peakLines": int(ev.groupby("year").size().max()),
}

# How many descriptions appeared for the first time in 2026 (fee schedule churn).
d26 = set(df.loc[df["year"] == 2026, "desc"].unique())
dpre = set(df.loc[df["year"] < 2026, "desc"].unique())
junk["new2026Descs"] = len(d26 - dpre)

out["junk"] = junk

OUT.write_text(json.dumps(out, indent=1))
print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
print(json.dumps(out, indent=2, default=str)[:4000])
