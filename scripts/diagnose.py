# -*- coding: utf-8 -*-
"""Print the seven planted-story metrics straight from the SQLite file."""
import os
import sqlite3

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
con = sqlite3.connect(os.path.join(ROOT, "db", "setavand.sqlite"))
pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 30)


def q(sql):
    return pd.read_sql_query(sql, con)


print("\n== S1 overdue presale installments")
print(q("""
SELECT p.code, s.is_indexed,
       ROUND(SUM(CASE WHEN i.status='معوق' THEN i.amount_due END)/1e9,1) AS overdue_bn,
       ROUND(AVG(CASE WHEN i.status!='آتی' THEN (i.days_late>0 OR i.status='معوق') END),3) AS late_rate,
       ROUND(AVG(CASE WHEN i.days_late>0 THEN i.days_late END),1) AS avg_days_late
FROM fact_installment i JOIN fact_unit_sale s USING(sale_id) JOIN dim_project p USING(project_id)
GROUP BY p.code, s.is_indexed HAVING overdue_bn > 0 ORDER BY overdue_bn DESC LIMIT 8"""))
print(q("""
SELECT s.is_indexed, ROUND(AVG(CASE WHEN i.status!='آتی' THEN (i.days_late>30 OR i.status='معوق') END),3) AS late30_rate,
       COUNT(*) n FROM fact_installment i JOIN fact_unit_sale s USING(sale_id) GROUP BY s.is_indexed"""))
print(q("""
SELECT d.j_year, ROUND(AVG(CASE WHEN i.days_late>30 OR i.status='معوق' THEN 1.0 ELSE 0 END),3) AS late30_rate
FROM fact_installment i JOIN dim_date d ON d.date_key=i.due_date_key
WHERE i.status!='آتی' AND d.in_window=1 GROUP BY d.j_year"""))

print("\n== S2 steel price premium over market benchmark")
print(q("""
WITH b AS (
  SELECT po.sub_id, po.channel_fa, po.material_id, po.amount, po.qty,
         m.base_price_1402 * CASE m.family WHEN 'steel' THEN r.steel_index WHEN 'cement' THEN r.cement_index
                                            ELSE r.construction_cost_index END AS bench,
         po.unit_price / (1 + po.credit_premium_pct/100.0) AS cash_price
  FROM fact_purchase_order po JOIN dim_material m USING(material_id)
  JOIN dim_date d ON d.date_key = po.order_date_key JOIN ref_price_index r ON r.period = d.period
  WHERE po.material_id IN (1,2))
SELECT sub_id, channel_fa, COUNT(*) n, ROUND(SUM(amount)/1e9) amount_bn,
       ROUND(SUM(cash_price*qty)/SUM(bench*qty)-1,4) premium
FROM b GROUP BY sub_id, channel_fa ORDER BY sub_id, channel_fa"""))

print("\n== S3 margin forecast at 1404/12 (sold value + unsold at list - land - EAC)")
proj = q("SELECT * FROM dim_project WHERE kind='building'")
idx_now = q("SELECT construction_cost_index ci, housing_price_index hp FROM ref_price_index ORDER BY period DESC LIMIT 1").iloc[0]
pm = q("""SELECT project_id, SUM(ev) ev, SUM(ac) ac, MAX(actual_pct) pct FROM fact_project_month GROUP BY project_id""")
sold = q("""SELECT project_id, SUM(contract_value) sold_value, COUNT(*) units_sold FROM fact_unit_sale GROUP BY project_id""")
df = proj.merge(pm, on="project_id").merge(sold, on="project_id", how="left").fillna({"sold_value": 0, "units_sold": 0})
df["cpi"] = df.ev / df.ac
df["eac"] = df.ac + (1 - df.pct) * df.bac_bn_1402 * 1e9 * idx_now.ci / df.cpi
df["unsold_value"] = (df.units_for_sale - df.units_sold) * df.avg_unit_m2 * df.list_price_m2_1402_mtoman * 1e6 * idx_now.hp
df["revenue"] = df.sold_value + df.unsold_value
df["margin_fc"] = (df.revenue - df.land_cost_bn * 1e9 - df.eac) / df.revenue
print(df.sort_values("margin_fc")[["code", "plan_margin", "margin_fc", "pct", "cpi", "units_sold", "units_for_sale"]].head(12).round(3).to_string())
print("building-portfolio margin plan vs forecast:", round(df.plan_margin.mean(), 3), round(df.margin_fc.median(), 3))

print("\n== S4 e-invoice registration lag")
print(q("""
SELECT sub_id, invoice_type_fa, COUNT(*) n, ROUND(AVG(registration_lag_days),1) avg_lag,
       ROUND(AVG(registration_lag_days>7),3) share_over7, ROUND(SUM(CASE WHEN registration_lag_days>7 THEN amount END)/1e9) late_bn,
       ROUND(AVG(status_fa='ثبت‌نشده'),3) unreg
FROM fact_invoice GROUP BY sub_id, invoice_type_fa"""))

print("\n== S5 opportunity funnel")
print(q("""SELECT has_intake_flag, COUNT(*) n, ROUND(AVG(analyst_hours),1) hrs, ROUND(SUM(analyst_hours)) total_hrs,
       ROUND(AVG(max_stage),2) avg_stage FROM fact_opportunity GROUP BY has_intake_flag"""))
print(q("SELECT outcome, COUNT(*) n, ROUND(AVG(intake_score),1) score FROM fact_opportunity GROUP BY outcome ORDER BY n DESC"))
print(q("""SELECT ROUND(AVG(julianday(substr(decision_date_key,1,4)||'-'||substr(decision_date_key,5,2)||'-'||substr(decision_date_key,7,2))
              - julianday(substr(received_date_key,1,4)||'-'||substr(received_date_key,5,2)||'-'||substr(received_date_key,7,2))),1) days_to_decision,
              COUNT(*) n FROM fact_opportunity WHERE decision_date_key IS NOT NULL"""))

print("\n== S6 idle cash & credit premium")
print(q("""SELECT b.sub_id, ROUND(AVG(b.closing_balance)/1e9) avg_bal, ROUND(AVG(b.idle_cash)/1e9) avg_idle,
       ROUND(MIN(b.closing_balance)/1e9) min_bal FROM fact_cash_balance_daily b GROUP BY b.sub_id"""))
print(q("""SELECT sub_id, ROUND(SUM(amount - amount/(1+credit_premium_pct/100.0))/1e9,1) premium_bn,
       ROUND(AVG(credit_months>0),3) credit_share FROM fact_purchase_order GROUP BY sub_id"""))
print(q("SELECT sub_id, COUNT(*) n, ROUND(SUM(amount)/1e9) bn FROM aux_injection GROUP BY sub_id"))

print("\n== S7 concrete supplier OTIF and project SPI")
print(q("""SELECT po.supplier_id = 2 AS is_s7, d.j_year, COUNT(*) n, ROUND(AVG(on_time*in_full),3) otif
FROM fact_purchase_order po JOIN dim_date d ON d.date_key=po.order_date_key
WHERE material_id=4 AND po.status_fa='تحویل‌شده' GROUP BY 1,2"""))
print(q("""SELECT p.code, MAX(CASE WHEN f.period=140312 THEN ROUND(f.actual_pct/f.planned_pct,3) END) spi_cum_1403,
       MAX(CASE WHEN f.period=140412 THEN ROUND(f.actual_pct/f.planned_pct,3) END) spi_cum_1404,
       MAX(CASE WHEN f.period=140412 THEN f.actual_pct END) pct
FROM fact_project_month f JOIN dim_project p USING(project_id) WHERE p.code IN ('MSK-03','TJR-01','TJR-02','MSK-04','MSK-05','MSK-06')
GROUP BY p.code"""))
print(q("""SELECT p.code, ROUND(SUM(CASE WHEN f.period>=140401 THEN f.ev END)/SUM(CASE WHEN f.period>=140401 THEN f.pv END),3) spi_1404,
       ROUND(SUM(CASE WHEN f.period<140401 THEN f.ev END)/SUM(CASE WHEN f.period<140401 THEN f.pv END),3) spi_before
FROM fact_project_month f JOIN dim_project p USING(project_id) WHERE p.code IN ('MSK-03','TJR-01','TJR-02','MSK-04','MSK-05')
GROUP BY p.code"""))
