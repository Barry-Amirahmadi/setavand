# Setavand — CEO decision dashboard

**Live:** https://barry-amirahmadi.github.io/setavand/ · **BA pack:** https://barry-amirahmadi.github.io/setavand/docs/

A Persian-language executive dashboard for a **fictional** Iranian investment and construction holding: seven subsidiaries, 60 projects, 36 months of activity on the Jalali calendar from Farvardin 1402 to Esfand 1404, and about 1.19 million rows in SQLite.

The dashboard does more than report. It finds seven problems in the data, puts a 12-month money value on each one, and turns them into a board memo. You can change every assumption in the decision room, and every number traces back to the SQL query behind it.

> **All names, companies, projects, suppliers and figures are synthetic.** They were generated to demonstrate an analysis method. Any resemblance to a real organisation is coincidental.

## What it shows

| Page | Question it answers |
|---|---|
| Overview | What are the biggest problems, what is each worth, and who owns the fix? |
| Liquidity | Where is cash sitting idle while subsidiaries pay hidden credit premiums? |
| Projects | Which projects drifted from plan on schedule, cost and margin, and why? It has a four-part profit bridge. |
| Supply | Are we paying market prices? Is a key supplier about to delay projects? |
| Investments | Why do good deals go to competitors, and where do analyst hours go? |
| Risk & compliance | How bad are presale collections, are e-invoices filed on time, and how clean is the data? |
| Decision room | A what-if model with 11 levers and a printable board memo. |

Every chart has a table view and a **SQL** button that opens the exact query that produced it.

## How it is built

```
scripts/generate_data.py        synthetic data generator, seed 1404, numpy + pandas -> db/setavand.sqlite
sql/marts/*.sql                 16 analytical queries, one per evidence chart
scripts/build_dashboard_data.py runs the marts -> data/dashboard.json, 1.1 MB
assets/js/model.js              findings, impact estimates and what-if levers, pure functions
assets/js/charts.js             small SVG chart kit, no dependencies
assets/js/app.js                pages, filters, decision room
docs/index.html                 BA pack: BRD, stakeholder map, 10 user stories, BPMN to-be process, KPI dictionary, traceability matrix
```

The site is static: plain HTML, CSS and vanilla JavaScript, with no framework and no build step.

### Rebuild the data

The SQLite file is about 120 MB, so it is not committed. It rebuilds with the same rows from the fixed seed:

```bash
pip install -r requirements.txt
python scripts/generate_data.py          # ~4 minutes, writes db/setavand.sqlite
python scripts/build_dashboard_data.py   # writes data/dashboard.json
node scripts/check_model.cjs             # prints the seven findings and their impact
```

Then serve the folder with any static server, for example `python -m http.server`.

### Quality checks

The checks are numeric. `scripts/qa_dashboard.cjs` walks every page at desktop and phone widths in light and dark mode. It fails on:

- JavaScript errors or failed requests;
- horizontal overflow;
- chart labels that spill outside their chart;
- `NaN` text.

`scripts/qa_interact.cjs` covers the interactive parts: the SQL sheet, jumping to evidence, table toggles, tooltips, URL filters, the decision-room levers, print layout and text contrast. Both scripts need `playwright-core`.

## Credits

Designed and directed by Barry Amirahmadi, with AI assistance for the implementation. The problem framing, user stories, KPI definitions, decision logic and number review are the designer's.

Typeface: [Vazirmatn](https://github.com/rastikerdar/vazirmatn), SIL Open Font License, licence included in `assets/fonts/`.
