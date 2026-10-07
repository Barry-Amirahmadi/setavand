-- mart: projects
-- grain: one row per project, as of 1404/12/29
-- feeds: Projects page (CPI/SPI quadrant, project sheet), insight S3 (margin erosion),
--        margin bridge (variance decomposition), insight S7 (concrete supplier exposure)
-- EAC = actual cost to date + remaining work at today's cost index / cost efficiency (CPI).
-- Forecast margin = (contracted sales + unsold units at today's list price - land - EAC) / revenue.
WITH idx AS (
    SELECT construction_cost_index AS ci_now, housing_price_index AS hp_now
    FROM ref_price_index ORDER BY period DESC LIMIT 1
),
evm AS (
    SELECT project_id,
           SUM(pv) AS pv_cum, SUM(ev) AS ev_cum, SUM(ac) AS ac_cum,
           MAX(CASE WHEN period = (SELECT MAX(period) FROM fact_project_month) THEN planned_pct END) AS planned_pct,
           MAX(actual_pct) AS actual_pct
    FROM fact_project_month
    GROUP BY project_id
),
spi_prev AS (
    SELECT project_id, actual_pct / NULLIF(planned_pct, 0) AS spi_1403
    FROM fact_project_month WHERE period = 140312
),
sales AS (
    SELECT project_id, COUNT(*) AS units_sold, SUM(contract_value) AS sold_value,
           SUM(CASE WHEN is_indexed = 1 THEN contract_value ELSE 0 END) AS indexed_value
    FROM fact_unit_sale GROUP BY project_id
),
concrete AS (
    SELECT po.project_id,
           SUM(CASE WHEN po.supplier_id = 2 THEN po.qty ELSE 0 END) / SUM(po.qty) AS s7_share_1404,
           SUM(CASE WHEN po.supplier_id = 1 THEN po.qty ELSE 0 END) / SUM(po.qty) AS internal_share_1404,
           SUM(CASE WHEN po.supplier_id = 2 THEN po.qty ELSE 0 END)              AS s7_qty_1404
    FROM fact_purchase_order po
    WHERE po.material_id = 4 AND po.order_date_key >= 20250321
    GROUP BY po.project_id
),
base AS (
    SELECT p.project_id, p.code, p.name_fa, p.sub_id, c.name_fa AS city_fa, p.type_fa, p.kind,
           p.units_for_sale, p.avg_unit_m2, p.start_period, p.duration_months,
           p.bac_bn_1402, p.land_cost_bn, p.plan_margin, p.revenue_plan_bn, p.cost_plan_bn,
           p.is_indexed_pilot, p.list_price_m2_1402_mtoman,
           e.pv_cum, e.ev_cum, e.ac_cum, e.planned_pct, e.actual_pct,
           e.actual_pct / NULLIF(e.planned_pct, 0) AS spi,
           e.ev_cum / NULLIF(e.ac_cum, 0)          AS cpi,
           sp.spi_1403,
           COALESCE(s.units_sold, 0) AS units_sold, COALESCE(s.sold_value, 0) AS sold_value,
           COALESCE(s.indexed_value, 0) AS indexed_value,
           cc.s7_share_1404, cc.internal_share_1404, cc.s7_qty_1404,
           idx.ci_now, idx.hp_now
    FROM dim_project p
    JOIN dim_city c ON c.city_id = p.city_id
    JOIN evm e      ON e.project_id = p.project_id
    LEFT JOIN spi_prev sp ON sp.project_id = p.project_id
    LEFT JOIN sales s     ON s.project_id = p.project_id
    LEFT JOIN concrete cc ON cc.project_id = p.project_id
    CROSS JOIN idx
),
scored AS (
SELECT project_id, code, name_fa, sub_id, city_fa, type_fa, kind, start_period, duration_months,
       units_for_sale, units_sold, is_indexed_pilot,
       bac_bn_1402, planned_pct, actual_pct, spi, spi_1403, cpi,
       pv_cum, ev_cum, ac_cum,
       -- estimate at completion, two ways: as executed, and at 100% cost efficiency
       ac_cum + (1 - actual_pct) * bac_bn_1402 * 1e9 * ci_now / cpi AS eac,
       ev_cum + (1 - actual_pct) * bac_bn_1402 * 1e9 * ci_now       AS eac_at_plan_efficiency,
       land_cost_bn * 1e9 AS land_cost,
       sold_value, indexed_value,
       (units_for_sale - units_sold) * avg_unit_m2
           * list_price_m2_1402_mtoman
           * 1e6 * hp_now AS unsold_value,
       revenue_plan_bn * 1e9 AS revenue_plan,
       cost_plan_bn * 1e9    AS cost_plan,
       plan_margin,
       s7_share_1404, internal_share_1404, s7_qty_1404
FROM base
)
SELECT scored.*,
       CASE WHEN kind = 'building' THEN sold_value + unsold_value END AS revenue_forecast,
       CASE WHEN kind = 'building'
            THEN (sold_value + unsold_value - land_cost - eac) / (sold_value + unsold_value) END AS margin_forecast
FROM scored
ORDER BY project_id;
