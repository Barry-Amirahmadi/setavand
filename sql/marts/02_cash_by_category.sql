-- mart: cash_by_category
-- grain: Jalali year x subsidiary x cash category
-- feeds: Liquidity page - where the money comes from and where it goes
SELECT d.j_year, t.sub_id, t.direction, t.category_fa,
       SUM(t.amount) AS amount,
       COUNT(*)      AS txn_count
FROM fact_cash_txn t
JOIN dim_date d ON d.date_key = t.date_key
GROUP BY d.j_year, t.sub_id, t.direction, t.category_fa
ORDER BY d.j_year, t.sub_id, t.direction, amount DESC;
