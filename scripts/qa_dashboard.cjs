// Numbers-only QA: walks every page at two widths and both themes, reports
// JS errors, failed requests, horizontal overflow, chart counts, NaN text and
// low-contrast text. No screenshots unless --shot is passed.
const path = require("path");
const PW = process.env.PW_CORE || "playwright-core";
const { chromium } = require(PW);
const EXE = process.env.CHROME_PATH || undefined; // optional: a local headless shell
const BASE = process.env.BASE || "http://127.0.0.1:4471/";
const PAGES = ["overview", "cash", "projects", "supply", "invest", "risk", "decide"];
const WIDTHS = (process.env.WIDTHS || "1440,390").split(",").map(Number);
const THEMES = (process.env.THEMES || "light,dark").split(",");
const QUERY = process.env.QUERY || "";

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--disable-gpu"] });
  let problems = 0;
  for (const theme of THEMES) for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror " + e.message));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + " " + m.text()); });
    page.on("requestfailed", (r) => errs.push("reqfail " + r.url()));
    page.on("response", (r) => { if (r.status() >= 400) errs.push("http " + r.status() + " " + r.url()); });
    for (const p of PAGES) {
      await page.goto(BASE + "#/" + p + QUERY, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const view = document.getElementById("view");
        const charts = [...view.querySelectorAll(".chart")];
        const empty = charts.filter((c) => !c.querySelector("svg,table,.empty")).map((c) => (c.closest(".card") || {}).id || "?");
        const text = view.innerText;
        const nan = (text.match(/NaN|undefined|Infinity|\[object/g) || []).length;
        // elements wider than viewport
        const wide = [];
        for (const n of view.querySelectorAll("*")) {
          const b = n.getBoundingClientRect();
          if (b.width && (b.right > innerWidth + 1 || b.left < -1) && !n.closest(".table-wrap,.mobile-nav")) { wide.push((n.id || n.className.baseVal || n.className || n.tagName) + ":" + Math.round(b.left) + "→" + Math.round(b.right)); if (wide.length > 4) break; }
        }
        // svg text overflowing its svg
        const clipped = [];
        for (const s of view.querySelectorAll(".chart svg")) {
          const sb = s.getBoundingClientRect();
          for (const t of s.querySelectorAll("text")) {
            const tb = t.getBoundingClientRect();
            if (tb.width && (tb.left < sb.left - 2 || tb.right > sb.right + 2)) { clipped.push(((s.closest(".card") || {}).id || "?") + ":" + t.textContent.slice(0, 18)); if (clipped.length > 6) break; }
          }
        }
        return { sw: de.scrollWidth, cw: de.clientWidth, charts: charts.length, svgs: view.querySelectorAll(".chart svg").length, empty, nan, wide, clipped, h: de.scrollHeight };
      });
      const bad = r.sw > r.cw || r.empty.length || r.nan || r.wide.length || r.clipped.length;
      if (bad) problems++;
      console.log(`${theme} ${w} ${p.padEnd(8)} sw/cw ${r.sw}/${r.cw} charts ${r.charts} svg ${r.svgs} h ${r.h}` + (r.empty.length ? " EMPTY " + r.empty.join(",") : "") + (r.nan ? " NaN×" + r.nan : "") + (r.wide.length ? " WIDE " + r.wide.join(" ") : "") + (r.clipped.length ? " CLIP " + r.clipped.join(" | ") : ""));
      if (process.argv.includes("--shot") && process.env.SHOT_PAGE === p && +process.env.SHOT_W === w && process.env.SHOT_THEME === theme) {
        await page.screenshot({ path: process.env.SHOT_OUT, fullPage: false, scale: "css" });
      }
    }
    if (errs.length) { problems++; console.log("  errors:", [...new Set(errs)].slice(0, 12).join("\n  ")); }
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `PROBLEMS ${problems}` : "CLEAN");
})().catch((e) => { console.error(e); process.exit(1); });
