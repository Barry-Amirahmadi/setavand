-- mart: project_month
-- grain: project x Jalali month
-- feeds: project sheet S-curve (planned vs. actual progress), cumulative SPI / CPI trend
SELECT f.project_id, f.period,
       ROUND(f.planned_pct, 4) AS planned_pct,
       ROUND(f.actual_pct, 4)  AS actual_pct,
       SUM(f.pv) OVER w AS pv_cum,
       SUM(f.ev) OVER w AS ev_cum,
       SUM(f.ac) OVER w AS ac_cum
FROM fact_project_month f
WINDOW w AS (PARTITION BY f.project_id ORDER BY f.period ROWS UNBOUNDED PRECEDING)
ORDER BY f.project_id, f.period;
