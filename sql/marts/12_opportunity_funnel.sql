-- mart: opportunity_funnel
-- grain: Jalali year received x pipeline stage x "had a red flag knowable on day one"
-- feeds: Investment page funnel, insight S5 - analyst hours spent on deals that could
--        have been screened out at intake
SELECT d.j_year, st.stage_no, st.stage_fa, o.has_intake_flag,
       COUNT(*)              AS entered,
       SUM(st.analyst_hours) AS analyst_hours,
       SUM(CASE WHEN st.result_fa = 'رد' THEN 1 ELSE 0 END)          AS rejected_here,
       SUM(CASE WHEN st.result_fa = 'ازدست‌رفته' THEN 1 ELSE 0 END)   AS lost_here
FROM fact_opportunity_stage st
JOIN fact_opportunity o ON o.opportunity_id = st.opportunity_id
JOIN dim_date d         ON d.date_key = o.received_date_key
GROUP BY d.j_year, st.stage_no, o.has_intake_flag
ORDER BY d.j_year, st.stage_no, o.has_intake_flag;
