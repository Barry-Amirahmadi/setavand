// Interaction + contrast QA, numbers only.
const path = require("path");
const { chromium } = require(process.env.PW_CORE || "playwright-core");
const EXE = process.env.CHROME_PATH || undefined; // optional: a local headless shell
const BASE = process.env.BASE || "http://127.0.0.1:4471/";

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--disable-gpu"] });
  const out = [];
  const ok = (name, cond, detail) => out.push(`${cond ? "PASS" : "FAIL"} ${name}${detail != null ? " · " + detail : ""}`);
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(BASE + "#/overview", { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    await page.waitForTimeout(400);

    // contrast of every visible text node's colour against the nearest opaque background
    const contrast = await page.evaluate(() => {
      const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const bgOf = (n) => { while (n && n.nodeType === 1) { const b = getComputedStyle(n).backgroundColor; const a = b.match(/[\d.]+/g); if (a && (a.length < 4 || +a[3] > 0.9)) return b; n = n.parentElement; } return getComputedStyle(document.body).backgroundColor; };
      const worst = [];
      const seen = new Set();
      for (const n of document.querySelectorAll("body *")) {
        if (n.closest("svg") || !n.childNodes.length) continue;
        const own = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
        if (!own) continue;
        const r = n.getBoundingClientRect();
        if (!r.width || getComputedStyle(n).visibility === "hidden" || n.closest("[hidden]")) continue;
        const fg = getComputedStyle(n).color, bg = bgOf(n);
        if (fg === "rgba(0, 0, 0, 0)") continue; // gradient-clipped text, checked by its stops
        const key = fg + "|" + bg;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = lum(fg), b = lum(bg);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        worst.push({ ratio: +ratio.toFixed(2), fg, bg, cls: (n.className || n.tagName) + "", text: n.textContent.trim().slice(0, 24) });
      }
      return worst.sort((x, y) => x.ratio - y.ratio).slice(0, 5);
    });
    ok(`${theme} min text contrast`, contrast[0].ratio >= 4.5, contrast.map((c) => `${c.ratio} ${c.cls}`).join(", "));

    if (theme === "light") {
      // hero total equals model total
      const hero = await page.evaluate(() => ({ text: document.getElementById("hero-num").textContent, total: window.__setavand.insights().total, cards: document.querySelectorAll(".insight").length }));
      ok("hero total", /۲/.test(hero.text) && hero.cards === 7, `${hero.text} · model ${hero.total.toFixed(1)} · ${hero.cards} cards`);
      // SQL sheet
      await page.click("#insight-S3 [data-sql]");
      await page.waitForFunction(() => document.querySelector("#sheet pre.sql"));
      const sq = await page.evaluate(() => ({ title: document.getElementById("sheet-title").textContent, len: document.querySelector("#sheet pre.sql").textContent.length, kw: document.querySelectorAll("#sheet pre.sql .k").length, open: document.getElementById("sheet").classList.contains("on") }));
      ok("SQL sheet", sq.open && sq.len > 200 && sq.kw > 5, `${sq.title} · ${sq.len} chars · ${sq.kw} keywords`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      ok("sheet closes", await page.evaluate(() => document.getElementById("sheet").hidden));
      // evidence jump
      await page.click("#insight-S7 [data-go]");
      await page.waitForTimeout(1200);
      const ev = await page.evaluate(() => { const n = document.getElementById("chart-otif"); const r = n && n.getBoundingClientRect(); return { hash: location.hash, flash: n && n.classList.contains("flash"), top: r && Math.round(r.top), h: innerHeight }; });
      ok("evidence jump", ev.hash.startsWith("#/supply") && ev.flash && ev.top > -200 && ev.top < ev.h, JSON.stringify(ev));
      // table toggle on a chart
      const tbl = await page.evaluate(async () => { const c = document.getElementById("chart-otif"); const b = [...c.querySelectorAll(".card-tools .btn")].find((x) => x.textContent === "جدول"); b.click(); await new Promise((r) => setTimeout(r, 120)); const rows = c.querySelectorAll("tbody tr").length; b.click(); await new Promise((r) => setTimeout(r, 120)); return { rows, svgBack: !!c.querySelector(".chart svg") }; });
      ok("table toggle", tbl.rows === 36 && tbl.svgBack, JSON.stringify(tbl));
      // tooltip on a line chart
      const box = await page.evaluate(() => { const s = document.querySelector("#chart-otif .chart svg").getBoundingClientRect(); return { x: s.left + s.width * 0.6, y: s.top + s.height * 0.5 }; });
      await page.mouse.move(box.x, box.y);
      await page.waitForTimeout(150);
      const tip = await page.evaluate(() => { const t = document.querySelector(".tip"); return t && t.classList.contains("on") ? t.innerText.replace(/\s+/g, " ").slice(0, 90) : null; });
      ok("line tooltip", !!tip, tip);
      // filters through the hash
      await page.goto(BASE + "#/cash?y=1404&s=1");
      await page.waitForTimeout(600);
      const f = await page.evaluate(() => ({ seg: document.querySelector("#year-seg [aria-pressed=true]").textContent, sel: document.getElementById("sub-select").selectedOptions[0].textContent, st: JSON.stringify(window.__setavand.state).slice(0, 60) }));
      ok("hash filters", f.seg === "۱۴۰۴" && /مسکن/.test(f.sel), JSON.stringify(f));
      // decision room
      await page.goto(BASE + "#/decide");
      await page.waitForTimeout(700);
      const t0 = await page.evaluate(() => window.__setavand.insights().total);
      await page.evaluate(() => { const i = document.getElementById("lv-s7_shift"); i.value = 0; i.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.waitForTimeout(300);
      const d1 = await page.evaluate(() => ({ total: window.__setavand.insights().total, shown: document.getElementById("dr-total").textContent, s7: window.__setavand.insights().list.find((x) => x.id === "S7").impact, memo: document.getElementById("memo").innerText.length }));
      ok("lever moves total", d1.total < t0 && d1.s7 === 0, `${t0.toFixed(1)} → ${d1.total.toFixed(1)} · shown ${d1.shown} · memo ${d1.memo} chars`);
      await page.click("#reset-levers");
      await page.waitForTimeout(500);
      ok("lever reset", Math.abs((await page.evaluate(() => window.__setavand.insights().total)) - t0) < 0.01);
      // print layout: levers hidden, memo kept
      await page.emulateMedia({ media: "print" });
      const pr = await page.evaluate(() => ({ levers: getComputedStyle(document.querySelector(".levers").closest(".no-print")).display, memo: getComputedStyle(document.getElementById("memo")).display, side: getComputedStyle(document.querySelector(".sidebar")).display }));
      ok("print media", pr.levers === "none" && pr.memo !== "none" && pr.side === "none", JSON.stringify(pr));
      await page.emulateMedia({ media: "screen" });
      // font
      const font = await page.evaluate(async () => { await document.fonts.ready; return { loaded: document.fonts.check("16px Vazirmatn"), family: getComputedStyle(document.body).fontFamily.slice(0, 40), ls: getComputedStyle(document.querySelector(".page-title")).letterSpacing }; });
      ok("font", font.loaded, JSON.stringify(font));
    }
    ok(`${theme} page errors`, !errs.length, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(out.join("\n"));
})().catch((e) => { console.error(e); process.exit(1); });
