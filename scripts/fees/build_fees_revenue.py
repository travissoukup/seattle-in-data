#!/usr/bin/env python3
"""Build src/lib/generated/fees-revenue.json for the /fees-revenue page.

Source: .targets-data/permit_fees_all.csv, an SDCI invoice extract obtained by
public records request (Jan 2020 through Jun 23, 2026). Every number on the
page is computed here.

Notes on the data:
- amount_due is a balance snapshot as of the extract, not payment history.
- The 5% Technology Fee (from 2023-01-02) adds an extra line to most invoices,
  so line counts are not comparable across 2022/2023. All charts here count
  distinct permits or dollars, and the whale count excludes tech-fee lines.
- 2026 is partial (through Jun 23). Trends annualize it and label it as pace.
"""

import json
import re
import ssl
import urllib.parse
import urllib.request

import certifi
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / ".targets-data" / "permit_fees_all.csv"
OUT = ROOT / "src" / "lib" / "generated" / "fees-revenue.json"

DATA_THROUGH = "2026-06-23"
# Jun 23 is day 174 of a 365-day year.
ANNUALIZE = 365 / 174

df = pd.read_csv(SRC)
df["dt"] = pd.to_datetime(df["date_invoiced"])
df["year"] = df["dt"].dt.year
df["suffix"] = df["record_id"].str.extract(r"-([A-Z]+)$")
# Billed = what was invoiced. amount_due is the unpaid remainder snapshot.
df["billed"] = df["amount_due"] + df["amount_paid"]

years_full = list(range(2020, 2026))

# ---- headline totals -------------------------------------------------------
by_year = df.groupby("year").agg(
    billed=("billed", "sum"),
    paid=("amount_paid", "sum"),
    due=("amount_due", "sum"),
    permits=("record_id", "nunique"),
)
b26 = float(by_year.loc[2026, "billed"])
p26 = int(by_year.loc[2026, "permits"])

billed_trend = []
for y in years_full:
    billed_trend.append({"y": str(y), "billed": round(float(by_year.loc[y, "billed"])), "pace": None})
# Dashed pace segment: anchor at 2025 actual, end at 2026 annualized.
billed_trend[-1]["pace"] = billed_trend[-1]["billed"]
billed_trend.append({"y": "2026", "billed": None, "pace": round(b26 * ANNUALIZE)})

# ---- core chart: permits up, per-permit down (indexed, 2020 = 100) ---------
pp = {}
for y in years_full + [2026]:
    pp[y] = float(by_year.loc[y, "billed"]) / int(by_year.loc[y, "permits"])
permits_2026_pace = p26 * ANNUALIZE
core = []
base_perm = int(by_year.loc[2020, "permits"])
for y in years_full:
    core.append({
        "y": str(y),
        "permitsIdx": round(int(by_year.loc[y, "permits"]) / base_perm * 100, 1),
        "perPermitIdx": round(pp[y] / pp[2020] * 100, 1),
        "permitsPace": None,
        "perPermitPace": None,
    })
core[-1]["permitsPace"] = core[-1]["permitsIdx"]
core[-1]["perPermitPace"] = core[-1]["perPermitIdx"]
core.append({
    "y": "2026",
    "permitsIdx": None,
    "perPermitIdx": None,
    # Permit count needs annualizing; billed per permit is a ratio, so the
    # partial-year value is used directly.
    "permitsPace": round(permits_2026_pace / base_perm * 100, 1),
    "perPermitPace": round(pp[2026] / pp[2020] * 100, 1),
})

# ---- whales ----------------------------------------------------------------
not_tech = ~df["description"].str.contains("Technology Fee", case=False, na=False)
wh = df[(df["billed"] >= 100000) & not_tech]
whales = [{"y": str(y), "n": int((wh["year"] == y).sum())} for y in years_full]
whales.append({"y": "2026*", "n": int((wh["year"] == 2026).sum())})
whale_total = float(wh["billed"].sum())

ph = df[df["suffix"] == "PH"]
ph_permits = int(ph["record_id"].nunique())
ph_billed = float(ph["billed"].sum())

top20 = (
    df.groupby(["record_id", "suffix"])["billed"].sum().sort_values(ascending=False).head(20).reset_index()
)

# Address + project lookup on Socrata (76t5-zqzr joins on full record_id).
meta = {}
try:
    ids = ",".join(f"'{r}'" for r in top20["record_id"])
    q = urllib.parse.urlencode({
        "$select": "permitnum,originaladdress1,description,estprojectcost",
        "$where": f"permitnum in({ids})",
    })
    ctx = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(
        f"https://data.seattle.gov/resource/76t5-zqzr.json?{q}", timeout=30, context=ctx
    ) as r:
        for row in json.load(r):
            desc = re.sub(r"^phased (permit|project)\s*:\s*", "", row.get("description", ""), flags=re.I).strip()
            desc = re.sub(r"\s+", " ", desc)
            if len(desc) > 110:
                desc = desc[:107].rstrip() + "..."
            addr = (row.get("originaladdress1") or "").title()
            addr = re.sub(r"\b(\d+)(St|Nd|Rd|Th)\b", lambda m: m.group(1) + m.group(2).lower(), addr)
            addr = re.sub(r"\b(Ne|Nw|Se|Sw)\b", lambda m: m.group(1).upper(), addr)
            meta[row["permitnum"]] = {
                "address": addr,
                "project": desc,
            }
except Exception as e:  # noqa: BLE001
    print(f"WARN: Socrata lookup failed ({e}); table will lack addresses")

top20_rows = []
for _, r in top20.iterrows():
    m = meta.get(r["record_id"], {})
    top20_rows.append({
        "id": r["record_id"],
        "billed": round(float(r["billed"])),
        "address": m.get("address", ""),
        "project": m.get("project", ""),
    })
top20_all_ph = bool((top20["suffix"] == "PH").all())

# ---- uncollected -----------------------------------------------------------
un = df[df["amount_due"] > 0]
due_total = float(un["amount_due"].sum())
old = un[un["dt"] < pd.Timestamp("2025-06-23")]
old_share = float(old["amount_due"].sum() / due_total)

leak = []
for y in years_full + [2026]:
    pct = float(by_year.loc[y, "due"] / by_year.loc[y, "billed"] * 100)
    leak.append({"y": f"{y}*" if y == 2026 else str(y), "pct": round(pct, 2)})

dm = df[df["suffix"] == "DM"]
dm_mature = dm[dm["year"] <= 2024]
dm_mature_unpaid_pct = float(dm_mature["amount_due"].sum() / dm_mature["billed"].sum() * 100)
dmv = dm[dm["billed"] > 0]
ratio = dmv["amount_paid"] / dmv["billed"]
dm_fully_unpaid_pct = float((ratio <= 0.001).mean() * 100)
dm_partial_pct = float(((ratio > 0.001) & (ratio < 0.999)).mean() * 100)

ns = df[df["description"].str.contains("no show", case=False, na=False)]
ns_unpaid_pct = float(ns["amount_due"].sum() / ns["billed"].sum() * 100)

# ---- CN framing ------------------------------------------------------------
cn = df[df["suffix"] == "CN"].groupby("year")["billed"].sum()
cn_2025 = float(cn.loc[2025])
cn_2025_is_record = bool(cn.loc[2025] == cn.loc[years_full].max())
cn_2026_pace = float(cn.loc[2026] * ANNUALIZE)

out = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "dataThrough": DATA_THROUGH,
    "annualizeFactor": round(ANNUALIZE, 3),
    "lines": int(len(df)),
    "totalBilled": round(float(df["billed"].sum())),
    "totalPaid": round(float(df["amount_paid"].sum())),
    "totalDue": round(due_total),
    "totalPermits": int(df["record_id"].nunique()),
    "billedTrend": billed_trend,
    "billed2020": round(float(by_year.loc[2020, "billed"])),
    "billed2024": round(float(by_year.loc[2024, "billed"])),
    "billed2025": round(float(by_year.loc[2025, "billed"])),
    "billed2026Actual": round(b26),
    "billed2026Pace": round(b26 * ANNUALIZE),
    "core": core,
    "permits2020": base_perm,
    "permits2026Pace": round(permits_2026_pace),
    "perPermit2020": round(pp[2020]),
    "perPermit2026": round(pp[2026]),
    "perPermitDropPct": round((1 - pp[2026] / pp[2020]) * 100, 1),
    "permitsUpPct": round((permits_2026_pace / base_perm - 1) * 100, 1),
    "whales": whales,
    "whales2020": whales[0]["n"],
    "whales2025": whales[-2]["n"],
    "whales2026Actual": whales[-1]["n"],
    "whaleTotal": round(whale_total),
    "whaleSharePct": round(whale_total / float(df["billed"].sum()) * 100, 1),
    "phPermits": ph_permits,
    "phBilled": round(ph_billed),
    "phSharePct": round(ph_billed / float(df["billed"].sum()) * 100, 1),
    "top20": top20_rows,
    "top20AllPh": top20_all_ph,
    "top1Billed": round(float(top20.iloc[0]["billed"])),
    "top1Address": top20_rows[0]["address"],
    "oldSharePct": round(old_share * 100, 1),
    "leak": leak,
    "leakMatureMin": min(r["pct"] for r in leak[:5]),
    "leakMatureMax": max(r["pct"] for r in leak[:5]),
    "leak2026": leak[-1]["pct"],
    "dmMatureUnpaidPct": round(dm_mature_unpaid_pct, 1),
    "dmFullyUnpaidPct": round(dm_fully_unpaid_pct, 1),
    "dmPartialPct": round(dm_partial_pct, 2),
    "nsUnpaidPct": round(ns_unpaid_pct, 1),
    "nsBilled": round(float(ns["billed"].sum())),
    "nsLines": int(len(ns)),
    "cn2025": round(cn_2025),
    "cn2025IsRecord": cn_2025_is_record,
    "cn2026Pace": round(cn_2026_pace),
}

OUT.write_text(json.dumps(out, indent=1))
print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
for k in ("totalBilled", "billed2020", "billed2024", "billed2026Pace", "permits2020",
          "permits2026Pace", "perPermit2020", "perPermit2026", "whales2020", "whales2026Actual",
          "phBilled", "phSharePct", "totalDue", "oldSharePct", "dmMatureUnpaidPct",
          "nsUnpaidPct", "cn2025", "cn2025IsRecord", "cn2026Pace", "top20AllPh", "top1Address"):
    print(f"  {k}: {out[k]}")
