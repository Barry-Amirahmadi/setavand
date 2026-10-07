-- mart: concrete_otif_monthly
-- grain: Jalali month x concrete source (the flagged supplier / the group's own plant / all others)
-- feeds: insight S7 trend line
SELECT d.period,
       CASE po.supplier_id WHEN 2 THEN 'flagged' WHEN 1 THEN 'internal' ELSE 'others' END AS source,
       COUNT(*)                     AS orders,
       SUM(po.on_time * po.in_full) AS otif,
       SUM(po.qty)                  AS qty_m3,
       AVG(CASE WHEN po.on_time = 0
                THEN julianday(substr(po.first_receipt_date_key, 1, 4) || '-' || substr(po.first_receipt_date_key, 5, 2) || '-' || substr(po.first_receipt_date_key, 7, 2))
                   - julianday(substr(po.promised_date_key, 1, 4) || '-' || substr(po.promised_date_key, 5, 2) || '-' || substr(po.promised_date_key, 7, 2))
           END)                     AS avg_delay_days_when_late
FROM fact_purchase_order po
JOIN dim_date d ON d.date_key = po.order_date_key
WHERE po.material_id = 4 AND po.status_fa = 'تحویل‌شده'
GROUP BY d.period, source
ORDER BY d.period, source;
