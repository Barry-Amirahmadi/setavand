# -*- coding: utf-8 -*-
"""
Run every sql/marts/*.sql against db/setavand.sqlite and write data/dashboard.json.

The dashboard reads nothing else. Each mart keeps its file name, so every chart and
every recommendation on the page can point at the exact query behind it.

Money columns are exported in billion Toman ("bn"); everything else as-is.

    python scripts/build_dashboard_data.py
"""
import glob
import json
import math
import os
import sqlite3
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "db", "setavand.sqlite")
OUT = os.path.join(ROOT, "data", "dashboard.json")

MONEY = {
    "inflow", "outflow", "inflow_intragroup", "outflow_intragroup", "injection_in", "end_balance",
    "avg_balance", "min_balance", "avg_idle", "credit_premium", "credit_purchases", "purchases",
    "amount", "amount_due", "late30_amount", "overdue_amount", "inflation_loss", "cash_amount",
    "benchmark_amount", "vat", "late_amount", "unregistered_amount", "pv_cum", "ev_cum", "ac_cum",
    "eac", "eac_at_plan_efficiency", "land_cost", "sold_value", "indexed_value", "unsold_value",
    "revenue_plan", "cost_plan", "revenue_forecast",
}


def tidy(col, v):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if col in MONEY:
        return round(v / 1e9, 3)
    if isinstance(v, float):
        return round(v, 5)
    return v


def main():
    t0 = time.time()
    con = sqlite3.connect(DB)
    marts = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "sql", "marts", "*.sql"))):
        fname = os.path.basename(path)
        name = fname.split("_", 1)[1].rsplit(".", 1)[0]
        sql = open(path, encoding="utf-8").read()
        cur = con.execute(sql)
        cols = [d[0] for d in cur.description]
        rows = [[tidy(c, v) for c, v in zip(cols, r)] for r in cur.fetchall()]
        marts[name] = {"file": f"sql/marts/{fname}", "cols": cols, "rows": rows}
        print(f"{fname:34s} {len(rows):6d} rows")

    def table(sql):
        cur = con.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    meta = {r["key"]: json.loads(r["value"]) for r in table("SELECT key, value FROM ref_meta")}
    counts = {r["name"]: con.execute(f'SELECT COUNT(*) FROM "{r["name"]}"').fetchone()[0]
              for r in table("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'aux_%' ORDER BY name")}
    out = {
        "meta": {**meta, "money_unit": "bn_toman", "built": time.strftime("%Y-%m-%d %H:%M"),
                 "row_counts": counts, "total_rows": sum(counts.values())},
        "dims": {
            "subsidiary": table("SELECT sub_id, code, name_fa, business_line FROM dim_subsidiary ORDER BY sub_id"),
            "material": table("SELECT material_id, name_fa, unit_fa, family FROM dim_material ORDER BY material_id"),
        },
        "marts": marts,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {OUT}  {os.path.getsize(OUT) / 1e3:.0f} KB  in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
