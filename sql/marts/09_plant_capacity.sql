-- mart: plant_capacity
-- grain: Jalali month x dispatch channel
-- feeds: insight S7 remedy - can the group's own plant absorb the failing supplier's volume?
-- Capacity comes from ref_meta (plant_capacity_m3_month).
SELECT d.period, x.channel_fa,
       SUM(x.qty_m3)  AS qty_m3,
       SUM(x.amount)  AS amount,
       COUNT(*)       AS dispatches,
       (SELECT CAST(value AS REAL) FROM ref_meta WHERE key = 'plant_capacity_m3_month') AS capacity_m3
FROM fact_plant_dispatch x
JOIN dim_date d ON d.date_key = x.date_key
GROUP BY d.period, x.channel_fa
ORDER BY d.period, x.channel_fa;
