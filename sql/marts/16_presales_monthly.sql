-- mart: presales_monthly
-- grain: Jalali month of contract x subsidiary x indexed-contract flag
-- feeds: Overview KPI (presales), insight S3 - how much new selling is still at a fixed price
SELECT d.period, p.sub_id, s.is_indexed,
       COUNT(*)                                AS contracts,
       SUM(s.area_m2)                          AS area_m2,
       SUM(s.contract_value)                   AS amount,
       SUM(s.contract_value * s.down_payment_pct) AS down_payment,
       SUM(s.is_investor_buyer)                AS investor_contracts
FROM fact_unit_sale s
JOIN dim_project p ON p.project_id = s.project_id
JOIN dim_date d    ON d.date_key = s.contract_date_key
WHERE d.in_window = 1
GROUP BY d.period, p.sub_id, s.is_indexed
ORDER BY d.period, p.sub_id, s.is_indexed;
