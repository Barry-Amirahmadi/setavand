-- mart: installments_monthly
-- grain: Jalali month the installment fell due x subsidiary x indexed-contract flag
-- feeds: insight S1 - a late fee below inflation turns late payment into cheap credit
-- "late30" = paid more than 30 days late, or still unpaid on 1404/12/29.
SELECT d.period, p.sub_id, s.is_indexed,
       COUNT(*)                                                         AS installments,
       SUM(i.amount_due)                                                AS amount_due,
       SUM(CASE WHEN i.days_late > 30 OR i.status = 'معوق' THEN 1 ELSE 0 END)            AS late30_count,
       SUM(CASE WHEN i.days_late > 30 OR i.status = 'معوق' THEN i.amount_due ELSE 0 END) AS late30_amount,
       SUM(CASE WHEN i.status = 'معوق' THEN i.amount_due ELSE 0 END)                    AS overdue_amount,
       -- value lost while the money is late: amount x months late x (inflation - monthly late fee)
       SUM(i.amount_due * COALESCE(i.days_late, 0) / 30.0
           * MAX(r.cpi_monthly_growth - s.late_fee_annual / 12.0, 0))   AS inflation_loss,
       MAX(r.cpi_monthly_growth)                                        AS cpi_monthly_growth,
       MAX(s.late_fee_annual / 12.0)                                    AS late_fee_monthly
FROM fact_installment i
JOIN fact_unit_sale s  ON s.sale_id = i.sale_id
JOIN dim_project p     ON p.project_id = s.project_id
JOIN dim_date d        ON d.date_key = i.due_date_key
JOIN ref_price_index r ON r.period = d.period
WHERE i.status != 'آتی' AND d.in_window = 1
GROUP BY d.period, p.sub_id, s.is_indexed
ORDER BY d.period, p.sub_id, s.is_indexed;
