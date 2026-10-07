-- mart: price_index
-- grain: Jalali month
-- feeds: context lines (cost vs. selling-price indices, inflation vs. the 18% late fee)
SELECT r.period, r.month_index,
       r.construction_cost_index, r.steel_index, r.cement_index,
       r.cpi_index, r.cpi_monthly_growth, r.housing_price_index,
       0.18 / 12 AS late_fee_monthly
FROM ref_price_index r
WHERE r.period >= 140201
ORDER BY r.period;
