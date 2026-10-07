-- mart: overdue_by_project
-- grain: project
-- feeds: insight S1 - where the overdue presale money sits, and who the late payers are
SELECT p.project_id, p.code, p.name_fa, p.sub_id,
       COUNT(DISTINCT s.sale_id)                                              AS contracts,
       SUM(CASE WHEN i.status = 'معوق' THEN i.amount_due ELSE 0 END)          AS overdue_amount,
       AVG(CASE WHEN i.status != 'آتی'
                THEN (i.days_late > 30 OR i.status = 'معوق') END)             AS late30_rate,
       AVG(CASE WHEN i.status != 'آتی' AND s.is_investor_buyer = 1
                THEN (i.days_late > 30 OR i.status = 'معوق') END)             AS late30_rate_investors,
       AVG(CASE WHEN i.status != 'آتی' AND s.is_investor_buyer = 0
                THEN (i.days_late > 30 OR i.status = 'معوق') END)             AS late30_rate_end_users,
       AVG(s.is_investor_buyer)                                               AS investor_share,
       MAX(s.is_indexed)                                                      AS has_indexed_contracts
FROM fact_installment i
JOIN fact_unit_sale s ON s.sale_id = i.sale_id
JOIN dim_project p    ON p.project_id = s.project_id
GROUP BY p.project_id
ORDER BY overdue_amount DESC;
