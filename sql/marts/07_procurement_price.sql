-- mart: procurement_price
-- grain: Jalali month x subsidiary x material x purchase channel
-- feeds: Procurement page, insight S2 - spot buying vs. framework contracts
-- Benchmark = the material's 1402 base price x its family index for that month
-- (steel, cement, or the general construction-cost index).
-- cash_amount strips the supplier-credit premium, so channel and credit are measured apart.
SELECT d.period, po.sub_id, po.material_id, po.channel_fa,
       COUNT(*)                                                   AS orders,
       SUM(po.qty)                                                AS qty,
       SUM(po.amount)                                             AS amount,
       SUM(po.amount / (1 + po.credit_premium_pct / 100.0))       AS cash_amount,
       SUM(po.qty * m.base_price_1402 *
           CASE m.family WHEN 'steel'  THEN r.steel_index
                         WHEN 'cement' THEN r.cement_index
                         ELSE r.construction_cost_index END)      AS benchmark_amount
FROM fact_purchase_order po
JOIN dim_material m    ON m.material_id = po.material_id
JOIN dim_date d        ON d.date_key = po.order_date_key
JOIN ref_price_index r ON r.period = d.period
GROUP BY d.period, po.sub_id, po.material_id, po.channel_fa
ORDER BY d.period, po.sub_id, po.material_id, po.channel_fa;
