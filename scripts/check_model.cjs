// Run the dashboard's decision model under node and print every finding.
// node scripts/check_model.cjs
const fs = require("fs");
const path = require("path");
const M = require("../assets/js/model.js");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "dashboard.json"), "utf8"));
const t = M.prepare(data);
const r = M.insights(t);
console.log("TOTAL impact bn:", r.total.toFixed(1), "=", M.money(r.total));
for (const x of r.list) {
  console.log(`\n${x.id} [${x.severity}] impact ${x.impact.toFixed(1)} bn (${(x.share * 100).toFixed(0)}%) - ${x.title}`);
  console.log("  " + x.finding);
  console.log("  >> " + x.impactNote);
}
