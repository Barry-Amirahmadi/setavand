-- mart: data_quality
-- grain: one row per ETL rule
-- feeds: the data-quality panel - what the load checked, and how many rows failed
-- Failed rows are kept, not dropped silently: see etl_rejected_row for each one and its action.
SELECT c.table_name, c.rule_fa, c.rows_checked, c.rows_failed,
       ROUND(100.0 * (c.rows_checked - c.rows_failed) / c.rows_checked, 3) AS pass_pct
FROM etl_check c
ORDER BY c.table_name, c.rule_fa;
