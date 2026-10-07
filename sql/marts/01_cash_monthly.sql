-- mart: cash_monthly
-- grain: Jalali month x subsidiary
-- feeds: Overview KPIs, Liquidity page, insight S6 (idle cash vs. credit premium)
-- Intra-group flows (HQ injections, dividends, plant sales to group projects)
-- are split out so the group view is not double-counted.
WITH last_day AS (
    SELECT period, MAX(date_key) AS date_key FROM dim_date GROUP BY period
),
flow AS (
    SELECT d.period, t.sub_id,
           SUM(CASE WHEN t.direction = 1 THEN t.amount ELSE 0 END) AS inflow,
           SUM(CASE WHEN t.direction = -1 THEN t.amount ELSE 0 END) AS outflow,
           SUM(CASE WHEN t.direction = 1 AND t.category_fa IN
                    ('تزریق منابع از ستاد', 'دریافت سود سهام از شرکت‌ها', 'فروش بتن درون‌گروهی')
                    THEN t.amount ELSE 0 END) AS inflow_intragroup,
           SUM(CASE WHEN t.direction = -1 AND t.category_fa IN
                    ('تزریق منابع به شرکت‌ها', 'پرداخت سود سهام به ستاد', 'خرید بتن از کارخانهٔ گروه')
                    THEN t.amount ELSE 0 END) AS outflow_intragroup,
           SUM(CASE WHEN t.category_fa = 'تزریق منابع از ستاد' THEN t.amount ELSE 0 END) AS injection_in
    FROM fact_cash_txn t
    JOIN dim_date d ON d.date_key = t.date_key
    GROUP BY d.period, t.sub_id
),
bal AS (
    SELECT d.period, b.sub_id,
           AVG(b.closing_balance) AS avg_balance,
           MIN(b.closing_balance) AS min_balance,
           AVG(b.idle_cash)       AS avg_idle
    FROM fact_cash_balance_daily b
    JOIN dim_date d ON d.date_key = b.date_key
    GROUP BY d.period, b.sub_id
),
end_bal AS (
    SELECT l.period, b.sub_id, b.closing_balance AS end_balance
    FROM last_day l
    JOIN fact_cash_balance_daily b ON b.date_key = l.date_key
),
credit AS (
    SELECT d.period, po.sub_id,
           SUM(po.amount - po.amount / (1 + po.credit_premium_pct / 100.0)) AS credit_premium,
           SUM(CASE WHEN po.credit_months > 0 THEN po.amount ELSE 0 END)     AS credit_purchases,
           SUM(po.amount)                                                   AS purchases
    FROM fact_purchase_order po
    JOIN dim_date d ON d.date_key = po.order_date_key
    GROUP BY d.period, po.sub_id
)
SELECT bal.period, bal.sub_id,
       COALESCE(flow.inflow, 0)             AS inflow,
       COALESCE(flow.outflow, 0)            AS outflow,
       COALESCE(flow.inflow_intragroup, 0)  AS inflow_intragroup,
       COALESCE(flow.outflow_intragroup, 0) AS outflow_intragroup,
       COALESCE(flow.injection_in, 0)       AS injection_in,
       end_bal.end_balance, bal.avg_balance, bal.min_balance, bal.avg_idle,
       COALESCE(credit.credit_premium, 0)   AS credit_premium,
       COALESCE(credit.credit_purchases, 0) AS credit_purchases,
       COALESCE(credit.purchases, 0)        AS purchases
FROM bal
LEFT JOIN flow    ON flow.period = bal.period AND flow.sub_id = bal.sub_id
LEFT JOIN end_bal ON end_bal.period = bal.period AND end_bal.sub_id = bal.sub_id
LEFT JOIN credit  ON credit.period = bal.period AND credit.sub_id = bal.sub_id
ORDER BY bal.period, bal.sub_id;
