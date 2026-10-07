-- mart: supplier_otif
-- grain: supplier x Jalali year (delivered orders only)
-- feeds: Procurement page supplier table, insight S7 - one concrete supplier's delivery collapse
-- OTIF = first delivery on or before the promised date AND the full quantity received.
SELECT po.supplier_id, s.name_fa AS supplier_fa, po.material_id, s.is_internal, s.is_framework, d.j_year,
       COUNT(*)                          AS orders,
       SUM(po.on_time)                   AS on_time,
       SUM(po.in_full)                   AS in_full,
       SUM(po.on_time * po.in_full)      AS otif,
       SUM(po.qty)                       AS qty,
       SUM(po.amount)                    AS amount,
       COUNT(DISTINCT po.project_id)     AS projects_served
FROM fact_purchase_order po
JOIN dim_supplier s ON s.supplier_id = po.supplier_id
JOIN dim_date d     ON d.date_key = po.order_date_key
WHERE po.status_fa = 'تحویل‌شده'
GROUP BY po.supplier_id, d.j_year
ORDER BY po.supplier_id, d.j_year;
