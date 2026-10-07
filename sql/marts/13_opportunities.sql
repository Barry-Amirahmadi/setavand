-- mart: opportunities
-- grain: one row per investment opportunity received 1402/01 - 1404/12
-- feeds: Investment page - intake-score explorer and the "lost to a competitor" list
-- intake_score is the proposed to-be model: location 25, legal 20, price vs. appraisal 20,
-- expected IRR 20, size 10, speed to start 5. Every component is stored, so a score explains itself.
SELECT o.opportunity_id, d.period AS received_period, d.j_year,
       o.type_fa, o.source_fa, c.name_fa AS city_fa, o.area_m2,
       o.ask_price_bn, o.appraisal_bn, o.legal_status, o.expected_irr,
       o.in_target_zone, o.intake_flags, o.has_intake_flag,
       o.max_stage, o.outcome, o.reason, o.analyst_hours,
       CASE WHEN o.decision_date_key IS NOT NULL THEN
            julianday(substr(o.decision_date_key, 1, 4) || '-' || substr(o.decision_date_key, 5, 2) || '-' || substr(o.decision_date_key, 7, 2))
          - julianday(substr(o.received_date_key, 1, 4) || '-' || substr(o.received_date_key, 5, 2) || '-' || substr(o.received_date_key, 7, 2))
       END AS days_to_decision,
       o.intake_score, o.s_location, o.s_legal, o.s_price, o.s_irr, o.s_size, o.s_speed
FROM fact_opportunity o
JOIN dim_city c ON c.city_id = o.city_id
JOIN dim_date d ON d.date_key = o.received_date_key
ORDER BY o.opportunity_id;
