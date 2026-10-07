-- mart: einvoice_lag
-- grain: Jalali month of issue x subsidiary x invoice type
-- feeds: Risk & compliance page, insight S4 - invoices registered late with the tax authority
-- The legal window used here is 7 days from issue; anything later is "late".
SELECT d.period, v.sub_id, v.invoice_type_fa,
       COUNT(*)                                                             AS invoices,
       SUM(v.amount)                                                        AS amount,
       SUM(v.vat)                                                           AS vat,
       SUM(CASE WHEN v.registration_lag_days > 7 THEN 1 ELSE 0 END)         AS late_count,
       SUM(CASE WHEN v.registration_lag_days > 7 THEN v.amount ELSE 0 END)  AS late_amount,
       SUM(CASE WHEN v.registered_date_key IS NULL THEN 1 ELSE 0 END)       AS unregistered_count,
       SUM(CASE WHEN v.registered_date_key IS NULL THEN v.amount ELSE 0 END) AS unregistered_amount,
       AVG(v.registration_lag_days)                                         AS avg_lag_days,
       SUM(CASE WHEN v.registration_lag_days <= 3 THEN 1 ELSE 0 END)        AS lag_0_3,
       SUM(CASE WHEN v.registration_lag_days BETWEEN 4 AND 7 THEN 1 ELSE 0 END)   AS lag_4_7,
       SUM(CASE WHEN v.registration_lag_days BETWEEN 8 AND 14 THEN 1 ELSE 0 END)  AS lag_8_14,
       SUM(CASE WHEN v.registration_lag_days BETWEEN 15 AND 30 THEN 1 ELSE 0 END) AS lag_15_30,
       SUM(CASE WHEN v.registration_lag_days > 30 THEN 1 ELSE 0 END)        AS lag_30_plus
FROM fact_invoice v
JOIN dim_date d ON d.date_key = v.issue_date_key
GROUP BY d.period, v.sub_id, v.invoice_type_fa
ORDER BY d.period, v.sub_id, v.invoice_type_fa;
