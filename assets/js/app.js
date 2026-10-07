/* Setavand executive dashboard - pages, filters, decision room. */
(function () {
  "use strict";
  const M = window.SetavandModel, C = window.Charts;
  const { num, pct, money, periodLabel, sum, yearOf, by } = M;
  const $ = (s, r) => (r || document).querySelector(s);
  const h = (tag, attrs, html) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "class") n.className = attrs[k];
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (html != null) n.innerHTML = html;
    return n;
  };

  let T = null, INS = null, DATA = null;
  const state = { page: "overview", year: "all", sub: "all", project: 1, levers: { ...M.DEFAULT_LEVERS } };
  const YEARS = ["all", 1402, 1403, 1404];
  const MONTHS = M.MONTHS;
  const SEASONS = { 1: "بهار", 4: "تابستان", 7: "پاییز", 10: "زمستان" };

  const ICONS = {
    overview: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
    cash: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16.5 14.5h1.5"/></svg>',
    projects: '<svg viewBox="0 0 24 24"><path d="M4 20V9l6-4v15M10 20V3l10 5v12M2.5 20h19M13.5 10.5h3M13.5 14h3"/></svg>',
    supply: '<svg viewBox="0 0 24 24"><path d="M3 7.5l9-4.5 9 4.5-9 4.5-9-4.5zM3 7.5V16.5l9 4.5 9-4.5V7.5M12 12v9"/></svg>',
    invest: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/></svg>',
    risk: '<svg viewBox="0 0 24 24"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z"/><path d="M9 12l2 2 4-4"/></svg>',
    decide: '<svg viewBox="0 0 24 24"><path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2.2"/><circle cx="12" cy="15" r="2.2"/><circle cx="19" cy="7" r="2.2"/></svg>',
  };
  const SEV = {
    critical: { label: "فوری", icon: '<svg viewBox="0 0 24 24"><path d="M12 3l9.5 17h-19L12 3z"/><path d="M12 10v4.5M12 17.6v.1"/></svg>' },
    serious: { label: "مهم", icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.1"/></svg>' },
    warning: { label: "قابل توجه", icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>' },
    good: { label: "سالم", icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>' },
  };
  const PAGES = [
    { id: "overview", title: "نمای کلی", lede: "هفت مشکل در دادهٔ ۳۶ ماه، با اثر مالی و اقدام پیشنهادی هر کدام." },
    { id: "cash", title: "نقدینگی و منابع", lede: "پول گروه کجاست، کجا بیکار مانده و کجا با بهرهٔ پنهان خرید نسیه جبران شده است." },
    { id: "projects", title: "پروژه‌ها", lede: "وضعیت زمان و هزینهٔ ۶۰ پروژه، و این‌که سود برنامه‌ریزی‌شده کجا از دست رفته است." },
    { id: "supply", title: "تأمین و بهای تمام‌شده", lede: "قیمت خرید در برابر بازار، کانال خرید و عملکرد تحویل تأمین‌کنندگان." },
    { id: "invest", title: "فرصت‌های سرمایه‌گذاری", lede: "فرصت‌هایی که به ستاوند سرمایه رسیدند، کجا وقت تیم صرف شد و کدام فرصت‌های خوب به رقیب رسیدند." },
    { id: "risk", title: "ریسک و انطباق", lede: "وصول اقساط پیش‌فروش، ثبت صورتحساب در سامانهٔ مودیان، و کیفیت داده‌ای که این گزارش روی آن ساخته شده است." },
    { id: "decide", title: "اتاق تصمیم", lede: "فرض‌ها را تغییر دهید و ببینید اثر هر اقدام چقدر جابه‌جا می‌شود. یادداشت تصمیم پایین صفحه با همین اعداد به‌روز می‌شود." },
  ];

  // ---------------------------------------------------------------- formatting
  const fm = (v) => money(v, { short: true });
  const axisMoney = (t) => (Math.abs(t) >= 1000 ? num(t / 1000, Math.abs(t) % 1000 ? 1 : 0) + " همت" : num(t));
  const fa = (v) => num(v);
  const shortYear = (y) => num(y % 100).padStart(2, "۰");
  const monthTick = (p, i, n) => {
    const mo = p % 100;
    if (n <= 12) return mo % 3 === 1 ? MONTHS[mo - 1] : null;
    return SEASONS[mo] ? SEASONS[mo] + " " + shortYear(yearOf(p)) : null;
  };
  const subName = (id) => M.subName(T, id);
  const subCode = (id) => (T.subs.find((s) => s.sub_id === id) || {}).code;

  // ---------------------------------------------------------------- filters
  const allPeriods = () => T.price_index.map((r) => r.period);
  const periods = () => allPeriods().filter(inYear);
  const inYear = (p) => state.year === "all" || yearOf(p) === +state.year;
  const inSub = (s) => state.sub === "all" || s === +state.sub;
  const yearText = () => (state.year === "all" ? "۱۴۰۲ تا ۱۴۰۴" : "سال " + num(+state.year).replace(/٬/g, ""));
  const subText = () => (state.sub === "all" ? "کل گروه" : subName(+state.sub));
  function seriesBy(rows, valueFn, filterFn) {
    const ps = periods();
    const m = new Map(ps.map((p) => [p, 0]));
    rows.forEach((r) => { if (m.has(r.period) && (!filterFn || filterFn(r))) m.set(r.period, m.get(r.period) + valueFn(r)); });
    return ps.map((p) => m.get(p));
  }

  // ---------------------------------------------------------------- cards
  const registry = new Map();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver((entries) => {
    for (const e of entries) {
      const fn = registry.get(e.target);
      const w = Math.round(e.contentRect.width);
      if (fn && e.target.dataset.w && +e.target.dataset.w !== w) { e.target.dataset.w = w; fn(e.target); }
    }
  }) : null;

  function card(parent, o) {
    const c = h("article", { class: "card " + (o.span || "span-12") + (o.cls ? " " + o.cls : ""), id: o.id || null });
    const head = h("div", { class: "card-head" });
    const titles = h("div", { class: "card-titles" }, `<h3 class="card-title">${o.title}</h3>${o.sub ? `<p class="card-sub">${o.sub}</p>` : ""}`);
    head.appendChild(titles);
    const tools = h("div", { class: "card-tools no-print" });
    let tableOn = false;
    const body = h("div", { class: "chart" });
    if (o.table) {
      const b = h("button", { class: "btn", type: "button", "aria-pressed": "false" }, "جدول");
      b.addEventListener("click", () => {
        tableOn = !tableOn;
        b.setAttribute("aria-pressed", tableOn);
        b.textContent = tableOn ? "نمودار" : "جدول";
        draw();
      });
      tools.appendChild(b);
    }
    if (o.sql) tools.appendChild(h("button", { class: "btn", type: "button", onclick: () => openSql(o.sql) }, "SQL"));
    head.appendChild(tools);
    c.appendChild(head);
    if (o.legend && o.legend.length) {
      const lg = h("ul", { class: "legend" });
      o.legend.forEach((l) => lg.appendChild(h("li", {}, `<i class="${l.type || ""}" style="${l.type === "dash" ? "" : `background:var(${l.color})`}"></i>${l.name}`)));
      c.appendChild(lg);
    }
    if (o.before) c.appendChild(o.before);
    c.appendChild(body);
    if (o.foot) c.appendChild(h("div", { class: "card-foot" }, o.foot));
    parent.appendChild(c);
    function draw() {
      if (o.isEmpty && o.isEmpty()) { body.innerHTML = `<p class="empty">${o.emptyText || "برای " + subText() + " در این بخش داده‌ای ثبت نشده است."}</p>`; return; }
      if (tableOn) { body.innerHTML = ""; body.appendChild(renderTable(o.table())); return; }
      o.render(body);
    }
    requestAnimationFrame(() => {
      draw();
      if (!tableOn && ro) { body.dataset.w = Math.round(body.clientWidth); registry.set(body, () => { if (!tableOn) draw(); }); ro.observe(body); }
    });
    return c;
  }

  function renderTable(t) {
    const wrap = h("div", { class: "table-wrap" + (t.rows.length > 14 ? " scroll-y" : "") });
    const num_ = t.numeric || [];
    let html = "<table class='data'><thead><tr>" + t.head.map((x, i) => `<th class="${num_[i] ? "n" : ""}">${x}</th>`).join("") + "</tr></thead><tbody>";
    t.rows.forEach((r, ri) => {
      html += `<tr${t.rowAttr ? " " + t.rowAttr(ri) : ""}>` + r.map((x, i) => `<td class="${num_[i] ? "n" : ""}">${x == null ? "—" : x}</td>`).join("") + "</tr>";
    });
    wrap.innerHTML = html + "</tbody></table>";
    if (t.onRow) wrap.querySelectorAll("tbody tr").forEach((tr, i) => tr.addEventListener("click", () => t.onRow(i)));
    return wrap;
  }

  function statStrip(items) {
    const s = h("div", { class: "stats" });
    items.forEach((it) => s.appendChild(h("div", { class: "stat" }, `<span>${it.label}</span><b>${it.value}</b>${it.note ? `<em>${it.note}</em>` : ""}`)));
    return s;
  }
  const pill = (sev) => `<span class="pill ${sev}">${SEV[sev].icon}${SEV[sev].label}</span>`;
  const statusDot = (sev, text) => `<span class="status-dot ${sev}">${SEV[sev].icon}${text}</span>`;

  function countUp(node, to, fmt, ms) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { node.innerHTML = fmt(to); return; }
    const t0 = performance.now(), d = ms || 1100;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      node.innerHTML = fmt(to * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- SQL / info sheet
  const sheet = () => $("#sheet");
  function openSheet(title, bodyNode, copyText) {
    const s = sheet();
    $("#sheet-title").textContent = title;
    const b = $("#sheet-body");
    b.innerHTML = "";
    b.appendChild(bodyNode);
    const cp = $("#sheet-copy");
    cp.hidden = !copyText;
    cp.onclick = () => { try { navigator.clipboard.writeText(copyText); cp.textContent = "رونوشت شد"; setTimeout(() => (cp.textContent = "رونوشت"), 1400); } catch (e) {} };
    s.hidden = false;
    requestAnimationFrame(() => { s.classList.add("on"); $("#sheet-backdrop").classList.add("on"); });
    $("#sheet-close").focus();
  }
  function closeSheet() {
    const s = sheet();
    s.classList.remove("on");
    $("#sheet-backdrop").classList.remove("on");
    setTimeout(() => { if (!s.classList.contains("on")) s.hidden = true; }, 450);
  }
  function highlightSql(src) {
    const esc = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc.split("\n").map((line) => {
      const ci = line.indexOf("--");
      let code = ci >= 0 ? line.slice(0, ci) : line, comment = ci >= 0 ? line.slice(ci) : "";
      code = code
        .replace(/'([^']*)'/g, "<span class='s'>'$1'</span>")
        .replace(/\b(WITH|AS|SELECT|FROM|JOIN|LEFT|ON|WHERE|GROUP BY|ORDER BY|CASE|WHEN|THEN|ELSE|END|AND|OR|IN|IS|NOT|NULL|SUM|AVG|COUNT|MAX|MIN|DISTINCT|COALESCE|ROUND|CROSS|LIMIT|DESC|BETWEEN|OVER|PARTITION BY|WINDOW|ROWS|UNBOUNDED|PRECEDING|CAST|REAL|NULLIF|HAVING)\b/g, "<span class='k'>$1</span>")
        .replace(/(?<![\w#])(\d+(?:\.\d+)?(?:e\d+)?)(?![\w])/g, "<span class='n'>$1</span>");
      return code + (comment ? `<span class='c'>${comment}</span>` : "");
    }).join("\n");
  }
  function openSql(mart) {
    const file = T.files[mart];
    const rows = DATA.marts[mart].rows.length;
    fetch(file).then((r) => r.text()).then((src) => {
      const wrap = h("div");
      wrap.appendChild(h("p", { class: "sheet-note" }, `این کوئری روی پایگاه دادهٔ <span class="chip ltr">db/setavand.sqlite</span> اجرا شده و ${num(rows)} ردیف خروجی آن در <span class="chip ltr">data/dashboard.json</span> به این نمودار رسیده است. اسکریپت ساخت: <span class="chip ltr">scripts/build_dashboard_data.py</span>`));
      const pre = h("pre", { class: "sql" });
      pre.innerHTML = highlightSql(src);
      wrap.appendChild(pre);
      openSheet(file, wrap, src);
    }).catch(() => openSheet(file, h("p", { class: "sheet-note" }, "فایل کوئری بارگذاری نشد.")));
  }
  function openMethod() {
    const w = h("div");
    w.innerHTML = `
      <p class="sheet-note">هر اثر، یک برآورد دوازده‌ماهه است که از دادهٔ ۱۴۰۴ و یک فرض صریح ساخته شده. فرض‌ها در اتاق تصمیم قابل تغییرند.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>اقدام</th><th>روش برآورد</th><th class="n">اثر</th></tr></thead><tbody>
      ${INS.list.map((x) => `<tr><td style="white-space:normal;min-width:180px"><b>${x.title}</b></td><td style="white-space:normal;line-height:1.9">${x.impactNote}</td><td class="n">${fm(x.impact)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="sheet-note" style="margin-top:14px">مجموع: ${money(INS.total)}. همت یعنی هزار میلیارد تومان. این برآوردها برای اولویت‌بندی‌اند، نه بودجه.</p>`;
    openSheet("روش محاسبهٔ اثر", w);
  }

  // ---------------------------------------------------------------- overview
  function pageOverview(v) {
    const g = h("div", { class: "grid" });
    v.appendChild(g);
    const top3 = INS.list.filter((x) => x.severity === "critical");
    const hero = h("article", { class: "card hero span-12" });
    const ringsData = ringValues();
    hero.innerHTML = `
      <div class="hero-grid">
        <div>
          <p class="hero-eyebrow">اثر برآوردی هفت اقدام پیشنهادی در ۱۲ ماه آینده</p>
          <div class="hero-number" id="hero-num"></div>
          <div class="hero-meta"><span class="chip">${num(T.meta.total_rows / 1e6, 2)} میلیون ردیف داده</span><span class="chip">۳۶ ماه</span><span class="pill critical">${SEV.critical.icon}${num(top3.length)} مورد فوری</span></div>
          <div class="hero-actions no-print">
            <a class="btn primary" href="#/decide">اتاق تصمیم</a>
            <button class="btn" type="button" id="method-btn">روش محاسبه</button>
          </div>
        </div>
        <div>
          <div class="rings-wrap"><div id="rings"></div>
            <ul class="ring-legend">${ringsData.map((r) => `<li><i style="background:var(${r.color})"></i><span class="rl-label">${r.label}</span><span class="rl-value">${pct(r.value)}<span>هدف ${pct(r.target)}</span></span></li>`).join("")}</ul>
          </div>
          <p class="hero-caption">سلامت عملیات در ۱۴۰۴ · هر حلقه، درصدِ رسیدن به هدف</p>
        </div>
      </div>`;
    g.appendChild(hero);
    $("#method-btn", hero).addEventListener("click", openMethod);
    countUp($("#hero-num", hero), INS.total, (x) => num(x / 1000, 1) + "<small>هزار میلیارد تومان</small>");
    C.rings($("#rings", hero), ringsData.map((r) => ({ label: r.label, value: r.value / r.target, color: "--" + r.color.slice(2) })));

    // KPI tiles
    const k = h("div", { class: "kpis" });
    g.appendChild(k);
    kpiTiles().forEach((t) => {
      const c = h("article", { class: "card kpi" });
      c.innerHTML = `<span class="kpi-label">${t.label}</span><span class="kpi-value"></span><span class="kpi-delta">${t.delta || "&nbsp;"}</span><div class="kpi-spark"></div>`;
      k.appendChild(c);
      countUp($(".kpi-value", c), t.value, t.fmt, 900);
      requestAnimationFrame(() => C.spark($(".kpi-spark", c), t.spark, t.color));
    });

    g.appendChild(h("div", { class: "section-title" }, `<h2>هفت یافته، به ترتیب اثر</h2><p>هر کارت با نمودار شاهد و کوئری SQL</p>`));
    const list = h("div", { class: "insights" });
    g.appendChild(list);
    INS.list.forEach((x, i) => list.appendChild(insightCard(x, i)));
  }

  function insightCard(x, i) {
    const c = h("article", { class: "card insight", id: "insight-" + x.id });
    const mini = miniSpec(x);
    const shortAction = x.action.split(/[.:]/)[0];
    c.innerHTML = `
      <div class="insight-top">
        <span class="rank">${num(i + 1)}</span>${pill(x.severity)}
        <div class="insight-impact"><b>${fm(x.impact)}</b><span>اثر ۱۲ ماهه · ${pct(x.share)} از کل</span></div>
      </div>
      <div class="share-bar" aria-hidden="true"><i style="width:${Math.max(3, x.share * 100)}%"></i></div>
      <h3>${x.title}</h3>
      <div class="mini-head"><span>${mini.cap}</span>${mini.legend && mini.legend.length ? `<ul class="legend">${mini.legend.map((l) => `<li><i class="${l.type || ""}" style="background:var(${l.color})"></i>${l.name}</li>`).join("")}</ul>` : ""}</div>
      <div class="chart mini"></div>
      <div class="action"><b>اقدام</b><span class="txt">${shortAction}</span></div>
      <div class="detail">
        <p>${x.finding}</p>
        <p><b>پیشنهاد کامل:</b> ${x.action}</p>
        <p class="meta">مسئول: ${x.owner} · شاخص پیگیری: ${x.kpi}</p>
      </div>
      <div class="insight-foot">
        <button class="btn more" type="button" aria-expanded="false">جزئیات</button>
        <button class="btn" type="button" data-go="${x.page}" data-anchor="${x.anchor}">شواهد</button>
        <button class="btn" type="button" data-sql="${x.mart}">SQL</button>
      </div>`;
    $(".more", c).addEventListener("click", (e) => {
      const open = c.classList.toggle("open");
      e.target.textContent = open ? "بستن" : "جزئیات";
      e.target.setAttribute("aria-expanded", String(open));
    });
    $("[data-go]", c).addEventListener("click", () => goEvidence(x.page, x.anchor));
    $("[data-sql]", c).addEventListener("click", () => openSql(x.mart));
    mount($(".mini", c), mini.render);
    return c;
  }

  // draw once the card is laid out, then redraw on width change
  function mount(el, fn) {
    requestAnimationFrame(() => {
      fn(el);
      if (ro) { el.dataset.w = Math.round(el.clientWidth); registry.set(el, fn); ro.observe(el); }
    });
  }

  // one small evidence chart per finding, always over the full 36 months
  const yearTick = (p) => (p % 100 === 1 ? num(yearOf(p)).replace(/٬/g, "") : null);
  function miniSpec(x) {
    const ps = allPeriods();
    const n = x.numbers;
    const lineCfg = (series, extra) => Object.assign({ x: ps, xTick: yearTick, xTip: periodLabel, height: 140, ticks: 3, series }, extra);
    switch (x.id) {
      case "S3": {
        const r = T.projects.find((p) => p.code === "MSK-01");
        const b = M.projectBridge(r);
        return {
          cap: "پل سود برج سپهر · میلیارد تومان",
          legend: [{ name: "کاهش", color: "--c2" }, { name: "جمع", color: "--total" }],
          render: (el) => C.waterfall(el, { fmt: fm, height: 170, steps: [
            { label: "برنامه", value: b.plan, total: true }, { label: "قیمت", value: b.price },
            { label: "تورم", value: b.inflation }, { label: "بهره‌وری", value: b.efficiency },
            { label: "پیش‌بینی", value: b.forecast, total: true }] }),
        };
      }
      case "S7": {
        const s = (src) => ps.map((p) => { const r = T.concrete_otif_monthly.find((q) => q.period === p && q.source === src); return r ? r.otif / r.orders : null; });
        return {
          cap: "تحویل کامل و به‌موقع بتن",
          legend: [{ name: "آبان‌سازه", color: "--c2", type: "line" }, { name: "سایر", color: "--c4", type: "line" }],
          render: (el) => C.line(el, lineCfg([{ name: "آبان‌سازه", color: "--c2", values: s("flagged") }, { name: "سایر تأمین‌کنندگان", color: "--c4", values: s("others") }], { yMin: 0.4, yMax: 1, yFmt: (t) => pct(t) })),
        };
      }
      case "S6":
        return {
          cap: "نقد بیکار گروه، میانگین ماه",
          render: (el) => C.line(el, lineCfg([{ name: "نقد بیکار", color: "--c4", area: true, values: seriesAll(T.cash_monthly, (r) => r.avg_idle) }], { yFmt: axisMoney, tipFmt: fm })),
        };
      case "S1": {
        const rate = (idx) => ps.map((p) => { const rr = T.installments_monthly.filter((r) => r.period === p && r.is_indexed === idx); const k = sum(rr, (r) => r.installments); return k > 20 ? sum(rr, (r) => r.late30_count) / k : null; });
        return {
          cap: "اقساط با تأخیر بالای ۳۰ روز",
          legend: [{ name: "قیمت ثابت", color: "--c2", type: "line" }, { name: "شاخص‌دار", color: "--c1", type: "line" }],
          render: (el) => C.line(el, lineCfg([{ name: "قیمت ثابت", color: "--c2", values: rate(0) }, { name: "شاخص‌دار", color: "--c1", values: rate(1) }], { yMin: 0, yFmt: (t) => pct(t) })),
        };
      }
      case "S5": {
        const rows = Object.values(by(T.opportunity_funnel.filter((r) => r.j_year === M.LAST_YEAR), (r) => r.stage_no)).sort((a, b) => a[0].stage_no - b[0].stage_no);
        return {
          cap: "قیف فرصت‌های ۱۴۰۴",
          legend: [{ name: "سالم", color: "--c1" }, { name: "با ایراد روز اول", color: "--c2" }],
          render: (el) => C.hbars(el, { stacked: true, barH: 12, rowGap: 9, labelW: 120, fmt: fa,
            rows: rows.map((rr) => ({ label: rr[0].stage_fa, values: [sum(rr.filter((r) => !r.has_intake_flag), (r) => r.entered), sum(rr.filter((r) => r.has_intake_flag), (r) => r.entered)] })),
            series: [{ name: "سالم", color: "--c1" }, { name: "با ایراد روز اول", color: "--c2" }] }),
        };
      }
      case "S2":
        return {
          cap: "قیمت آهن‌آلات نسبت به بازار، ۱۴۰۴",
          render: (el) => C.bars(el, { cats: ["موردی عمران", "موردی بقیه", "قرارداد چارچوب"], series: [{ name: "فاصله از قیمت مرجع", color: "--c2", values: [n.premSpot, n.premOtherSpot, n.premFw] }], yFmt: (t) => pct(t), labels: true, labelFmt: (t) => pct(t, 1), height: 150, ticks: 3 }),
        };
      case "S4": {
        const late = (type) => ps.map((p) => { const rr = T.einvoice_lag.filter((r) => r.period === p && r.invoice_type_fa === type); const k = sum(rr, (r) => r.invoices); return k ? sum(rr, (r) => r.late_count) / k : null; });
        return {
          cap: "صورتحساب‌های دیرثبت‌شده",
          legend: [{ name: "اجاره و شارژ", color: "--c2", type: "line" }, { name: "فروش بتن", color: "--c3", type: "line" }],
          render: (el) => C.line(el, lineCfg([{ name: "اجاره و شارژ", color: "--c2", values: late("اجاره و شارژ") }, { name: "فروش بتن", color: "--c3", values: late("فروش بتن") }], { yMin: 0, yMax: 1, yFmt: (t) => pct(t) })),
        };
      }
    }
    return { cap: "", render: () => {} };
  }
  function seriesAll(rows, valueFn) {
    const m = new Map(allPeriods().map((p) => [p, 0]));
    rows.forEach((r) => { if (m.has(r.period)) m.set(r.period, m.get(r.period) + valueFn(r)); });
    return [...m.values()];
  }

  function goEvidence(page, anchor) {
    location.hash = "#/" + page + query();
    setTimeout(() => {
      const n = document.getElementById(anchor);
      if (!n) return;
      n.scrollIntoView({ behavior: "smooth", block: "center" });
      n.classList.remove("flash");
      void n.offsetWidth;
      n.classList.add("flash");
    }, 380);
  }

  function ringValues() {
    const inst = T.installments_monthly.filter((r) => yearOf(r.period) === 1404);
    const onTimeCollect = 1 - sum(inst, (r) => r.late30_count) / Math.max(1, sum(inst, (r) => r.installments));
    const co = T.concrete_otif_monthly.filter((r) => yearOf(r.period) === 1404);
    const otif = sum(co, (r) => r.otif) / Math.max(1, sum(co, (r) => r.orders));
    const ei = T.einvoice_lag.filter((r) => yearOf(r.period) === 1404);
    const onTimeInv = 1 - sum(ei, (r) => r.late_count) / Math.max(1, sum(ei, (r) => r.invoices));
    return [
      { label: "وصول به‌موقع اقساط", value: onTimeCollect, target: 0.95, color: "--c1" },
      { label: "تحویل کامل و به‌موقع بتن", value: otif, target: 0.95, color: "--c4" },
      { label: "ثبت به‌موقع صورتحساب", value: onTimeInv, target: 0.98, color: "--c3" },
    ];
  }

  function kpiTiles() {
    const cm = T.cash_monthly.filter((r) => inSub(r.sub_id));
    const ps = periods();
    const last = ps[ps.length - 1];
    const endBal = (p) => sum(cm.filter((r) => r.period === p), (r) => r.end_balance);
    const yearVal = (yr, f) => sum(cm.filter((r) => yearOf(r.period) === yr), f);
    const prevYear = state.year === "all" ? null : +state.year - 1;
    const delta = (cur, prev, label) => {
      if (prev == null || !isFinite(prev) || prev === 0) return state.year === "all" ? "۳۶ ماه، ۱۴۰۲ تا ۱۴۰۴" : "&nbsp;";
      const d = cur / prev - 1;
      return `<b>${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))}</b> نسبت به ${label}`;
    };
    const balSeries = ps.map(endBal);
    const idleSeries = seriesBy(cm, (r) => r.avg_idle);
    const premSeries = seriesBy(cm, (r) => r.credit_premium);
    const inst = T.installments_monthly.filter((r) => inSub(r.sub_id));
    const lateSeries = seriesBy(inst, (r) => r.late30_amount);
    const prevEnd = prevYear && prevYear >= 1402 ? endBal(prevYear * 100 + 12) : null;
    const avg = (a) => sum(a) / Math.max(1, a.length);
    const prevIdle = prevYear >= 1402 ? yearVal(prevYear, (r) => r.avg_idle) / 12 : null;
    const prevPrem = prevYear >= 1402 ? yearVal(prevYear, (r) => r.credit_premium) : null;
    const prevLate = prevYear >= 1402 ? sum(inst.filter((r) => yearOf(r.period) === prevYear), (r) => r.late30_amount) : null;
    const y = num(prevYear || 0).replace(/٬/g, "");
    return [
      { label: "موجودی نقد پایان دوره · " + subText(), value: endBal(last), fmt: (x) => moneyHtml(x), spark: balSeries, color: "--c1", delta: delta(endBal(last), prevEnd, "پایان " + y) },
      { label: "میانگین نقد بیکار", value: avg(idleSeries), fmt: (x) => moneyHtml(x), spark: idleSeries, color: "--c4", delta: delta(avg(idleSeries), prevIdle, y) },
      { label: "بهرهٔ پنهان خرید نسیه", value: sum(premSeries), fmt: (x) => moneyHtml(x), spark: premSeries, color: "--c2", delta: delta(sum(premSeries), prevPrem, y) },
      { label: "اقساط با تأخیر بالای ۳۰ روز", value: sum(lateSeries), fmt: (x) => moneyHtml(x), spark: lateSeries, color: "--c3", delta: delta(sum(lateSeries), prevLate, y) },
    ];
  }
  function moneyHtml(bn) {
    const a = Math.abs(bn);
    if (a >= 1000) return num(bn / 1000, 1) + "<small>همت</small>";
    return num(bn) + "<small>میلیارد</small>";
  }

  // ---------------------------------------------------------------- cash
  function pageCash(v) {
    const g = h("div", { class: "grid" });
    v.appendChild(g);
    const cm = T.cash_monthly;
    const ps = periods();
    const s6 = INS.list.find((x) => x.id === "S6");
    card(g, {
      id: "chart-balance", span: "span-8", title: "موجودی نقد و نقد بیکار، پایان هر ماه", sub: `${subText()} · میلیارد تومان · نقد بیکار یعنی موجودی بیش از نیاز ۳۰ روزهٔ پرداخت‌ها`, sql: "cash_monthly",
      legend: [{ name: "موجودی پایان ماه", color: "--c1", type: "line" }, { name: "نقد بیکار، میانگین ماه", color: "--c4", type: "line" }],
      render: (el) => C.line(el, {
        x: ps, xTick: (p, i) => monthTick(p, i, ps.length), xTip: periodLabel, yFmt: axisMoney, tipFmt: fm, height: 300, endLabel: 0, labelFmt: fm,
        series: [
          { name: "موجودی پایان ماه", color: "--c1", area: true, values: seriesBy(cm, (r) => r.end_balance, (r) => inSub(r.sub_id)) },
          { name: "نقد بیکار", color: "--c4", values: seriesBy(cm, (r) => r.avg_idle, (r) => inSub(r.sub_id)) },
        ],
      }),
      table: () => ({ head: ["ماه", "موجودی پایان ماه", "نقد بیکار", "تزریق ستاد"], numeric: [0, 1, 1, 1], rows: ps.map((p) => { const rr = cm.filter((r) => r.period === p && inSub(r.sub_id)); return [periodLabel(p), fm(sum(rr, (r) => r.end_balance)), fm(sum(rr, (r) => r.avg_idle)), fm(sum(rr, (r) => r.injection_in))]; }) }),
    });
    const idleBySub = () => T.subs.map((s) => ({ s, v: sum(cm.filter((r) => r.sub_id === s.sub_id && inYear(r.period)), (r) => r.avg_idle) / Math.max(1, ps.length) })).sort((a, b) => b.v - a.v);
    card(g, {
      id: "chart-idle", span: "span-4", title: "نقد بیکار به تفکیک شرکت", sub: `میانگین ${yearText()} · میلیارد تومان`, sql: "cash_monthly",
      render: (el) => C.hbars(el, { rows: idleBySub().map((x) => ({ label: x.s.name_fa.replace("ستاوند ", ""), values: [x.v], strong: inSub(x.s.sub_id) && state.sub !== "all" })), series: [{ name: "نقد بیکار", color: "--c4" }], fmt: fm, labelW: 120 }),
      table: () => ({ head: ["شرکت", "میانگین نقد بیکار"], numeric: [0, 1], rows: idleBySub().map((x) => [x.s.name_fa, fm(x.v)]) }),
      foot: `در ۱۴۰۴ مجموع نقد بیکار گروه ${fm(s6.numbers.idleTotal)} بود.`,
    });
    const premSubs = [1, 2, 3];
    const premSeries = () => premSubs.map((sid, i) => ({ name: subName(sid).replace("ستاوند ", ""), color: ["--c1", "--c2", "--c3"][i], values: seriesBy(cm, (r) => r.credit_premium, (r) => r.sub_id === sid) }))
      .concat([{ name: "سایر", color: "--c4", values: seriesBy(cm, (r) => r.credit_premium, (r) => !premSubs.includes(r.sub_id)) }]);
    card(g, {
      id: "chart-premium", span: "span-6", title: "بهرهٔ پنهان خرید نسیه، ماهانه", sub: "فروشنده برای هر ماه نسیه ۳٫۵٪ به قیمت اضافه می‌کند · میلیارد تومان", sql: "cash_monthly",
      legend: premSeries().map((s) => ({ name: s.name, color: s.color })),
      render: (el) => C.bars(el, { cats: ps, catTick: (p, i) => monthTick(p, i, ps.length), catTip: periodLabel, series: premSeries(), stacked: true, yFmt: axisMoney, tipFmt: fm, height: 250 }),
      table: () => ({ head: ["ماه"].concat(premSeries().map((s) => s.name)), numeric: [0, 1, 1, 1, 1], rows: ps.map((p, i) => [periodLabel(p)].concat(premSeries().map((s) => fm(s.values[i])))) }),
    });
    const injSubs = [1, 2, 3, 6];
    const injSeries = () => injSubs.map((sid, i) => ({ name: subName(sid).replace("ستاوند ", ""), color: ["--c1", "--c2", "--c3", "--c4"][i], values: seriesBy(cm, (r) => r.injection_in, (r) => r.sub_id === sid) }));
    card(g, {
      id: "chart-injection", span: "span-6", title: "تزریق پول ستاد به شرکت‌ها", sub: "ستاد هر بار بعد از رسیدن موجودی به کف ۶۰ میلیارد تومان وارد شده است · میلیارد تومان", sql: "cash_monthly",
      legend: injSeries().map((s) => ({ name: s.name, color: s.color })),
      render: (el) => C.bars(el, { cats: ps, catTick: (p, i) => monthTick(p, i, ps.length), catTip: periodLabel, series: injSeries(), stacked: true, yFmt: axisMoney, tipFmt: fm, height: 250 }),
      table: () => ({ head: ["ماه"].concat(injSeries().map((s) => s.name)), numeric: [0, 1, 1, 1, 1], rows: ps.map((p, i) => [periodLabel(p)].concat(injSeries().map((s) => fm(s.values[i])))) }),
    });
    const cats = () => {
      const rows = T.cash_by_category.filter((r) => (state.year === "all" || r.j_year === +state.year) && inSub(r.sub_id));
      const m = by(rows, (r) => r.direction + "|" + r.category_fa);
      return Object.entries(m).map(([k, rr]) => ({ dir: +k.split("|")[0], cat: k.split("|")[1], amount: sum(rr, (r) => r.amount), n: sum(rr, (r) => r.txn_count) })).sort((a, b) => b.dir - a.dir || b.amount - a.amount);
    };
    card(g, {
      id: "chart-categories", span: "span-12", title: "منابع و مصارف نقد", sub: `${subText()} · ${yearText()} · ردیف‌های درون‌گروهی جدا علامت خورده‌اند`, sql: "cash_by_category",
      render: (el) => {
        const list = cats();
        const max = Math.max(...list.map((x) => x.amount));
        const intra = ["تزریق منابع از ستاد", "تزریق منابع به شرکت‌ها", "پرداخت سود سهام به ستاد", "دریافت سود سهام از شرکت‌ها", "فروش بتن درون‌گروهی", "خرید بتن از کارخانهٔ گروه"];
        el.innerHTML = "";
        el.appendChild(renderTable({
          head: ["جهت", "دسته", "تعداد تراکنش", "مبلغ", ""], numeric: [0, 0, 1, 1, 0],
          rows: list.map((x) => [x.dir > 0 ? "ورودی" : "خروجی", x.cat + (intra.includes(x.cat) ? ' <span class="chip">درون‌گروهی</span>' : ""), num(x.n), fm(x.amount), `<span class="bar-cell" style="width:${Math.max(2, (x.amount / max) * 160)}px;background:var(${x.dir > 0 ? "--c1" : "--c2"})"></span>`]),
        }));
      },
    });
  }

  // ---------------------------------------------------------------- projects
  function pageProjects(v) {
    const g = h("div", { class: "grid" });
    v.appendChild(g);
    const s3 = INS.list.find((x) => x.id === "S3"), s7 = INS.list.find((x) => x.id === "S7");
    const losers = new Set(s3.numbers.losers.map((r) => r.project_id));
    const s7ids = new Set(s7.numbers.hit.map((r) => r.project_id));
    const proj = () => T.projects.filter((r) => inSub(r.sub_id));
    const maxBac = Math.max(...T.projects.map((r) => r.bac_bn_1402));
    const colorOf = (r) => (losers.has(r.project_id) ? "--c5" : s7ids.has(r.project_id) ? "--c2" : "--c1");
    const pTip = (r) => C.tipHead(`${r.name_fa} <span style="color:var(--ink-3);font-weight:500">· ${r.code}</span>`) +
      C.tipRow("--c1", "شاخص زمان‌بندی", num(r.spi, 2)) + C.tipRow("--c1", "شاخص هزینه", num(r.cpi, 2)) +
      C.tipRow("--c1", "پیشرفت واقعی", pct(r.actual_pct)) + (r.margin_forecast != null ? C.tipRow("--c1", "حاشیهٔ سود پیش‌بینی", pct(r.margin_forecast)) : "");
    card(g, {
      id: "chart-quadrant", span: "span-7", isEmpty: () => !proj().length, title: "ماتریس زمان و هزینهٔ پروژه‌ها", sub: "محور افقی شاخص زمان‌بندی، محور عمودی شاخص هزینه، اندازهٔ دایره بودجهٔ پروژه · عدد ۱ یعنی مطابق برنامه · روی هر دایره بزنید", sql: "projects",
      legend: [{ name: "زیان‌ده در پیش‌بینی", color: "--c5" }, { name: "وابسته به بتن آبان‌سازه", color: "--c2" }, { name: "سایر پروژه‌ها", color: "--c1" }],
      render: (el) => C.scatter(el, {
        height: 360, xFmt: (t) => num(t, 2), yFmt: (t) => num(t, 2), xRef: 1, yRef: 1, xLabel: "شاخص زمان‌بندی", yLabel: "شاخص هزینه",
        quadrantLabels: [{ side: "left", pos: "bottom", text: "عقب از برنامه و پرهزینه" }, { side: "right", pos: "top", text: "جلوتر از برنامه و کم‌هزینه" }],
        points: proj().map((r) => ({ x: r.spi, y: r.cpi, r: 4 + 14 * Math.sqrt(r.bac_bn_1402 / maxBac), color: colorOf(r), strong: colorOf(r) !== "--c1", tip: pTip(r), id: r.project_id, labelText: losers.has(r.project_id) || s7ids.has(r.project_id) ? r.name_fa : null })),
        onClick: (p) => selectProject(p.id),
      }),
      table: () => ({ head: ["کد", "پروژه", "شاخص زمان‌بندی", "شاخص هزینه", "پیشرفت"], numeric: [0, 0, 1, 1, 1], rows: proj().map((r) => [r.code, r.name_fa, num(r.spi, 2), num(r.cpi, 2), pct(r.actual_pct)]) }),
    });
    const erosion = () => proj().filter((r) => r.kind === "building").map((r) => ({ r, d: r.margin_forecast - r.plan_margin })).sort((a, b) => a.d - b.d).slice(0, 12);
    card(g, {
      id: "chart-margin", span: "span-5", isEmpty: () => !erosion().length, title: "حاشیهٔ سود، برنامه در برابر پیش‌بینی", sub: "۱۲ پروژهٔ ساختمانی با بیشترین افت", sql: "projects",
      legend: [{ name: "برنامه", color: "--plan" }, { name: "پیش‌بینی امروز", color: "--c1" }],
      render: (el) => C.dumbbell(el, { rows: erosion().map(({ r }) => ({ label: r.name_fa, a: r.plan_margin, b: r.margin_forecast, id: r.project_id, bColor: r.margin_forecast < 0 ? "--c5" : "--c1" })), aName: "برنامه", bName: "پیش‌بینی", fmt: (t) => pct(t), labelW: 130, onClick: (r) => selectProject(r.id) }),
      table: () => ({ head: ["پروژه", "برنامه", "پیش‌بینی", "تغییر"], numeric: [0, 1, 1, 1], rows: erosion().map(({ r, d }) => [r.name_fa, pct(r.plan_margin), pct(r.margin_forecast), pct(d)]) }),
    });

    // project sheet
    const sheetCard = h("article", { class: "card span-12", id: "chart-bridge" });
    g.appendChild(sheetCard);
    renderProjectSheet(sheetCard);

    const port = () => {
      const b = proj().filter((r) => r.kind === "building");
      const br = b.map(M.projectBridge);
      return { plan: sum(br, (x) => x.plan), price: sum(br, (x) => x.price), inflation: sum(br, (x) => x.inflation), efficiency: sum(br, (x) => x.efficiency), forecast: sum(br, (x) => x.forecast), n: b.length };
    };
    card(g, {
      id: "chart-portfolio", span: "span-5", isEmpty: () => !port().n, title: "پل سود پرتفوی ساختمانی", sub: `${num(port().n)} پروژه · ${subText()} · سود برنامه تا سود پیش‌بینی`, sql: "projects",
      legend: [{ name: "افزایش", color: "--c4" }, { name: "کاهش", color: "--c2" }, { name: "جمع", color: "--total" }],
      render: (el) => { const p = port(); C.waterfall(el, { fmt: fm, height: 300, steps: bridgeSteps(p) }); },
      table: () => { const p = port(); return { head: ["جزء", "مبلغ"], numeric: [0, 1], rows: bridgeSteps(p).map((s) => [s.label + (s.label2 ? " " + s.label2 : ""), fm(s.value)]) }; },
    });
    const sortedProj = () => proj().slice().sort((a, b) => (a.margin_forecast ?? 9) - (b.margin_forecast ?? 9));
    card(g, {
      id: "chart-projects-table", span: "span-7", isEmpty: () => !proj().length, title: "همهٔ پروژه‌ها", sub: "به ترتیب حاشیهٔ سود پیش‌بینی · روی هر ردیف بزنید", sql: "projects",
      render: (el) => {
        el.innerHTML = "";
        const list = sortedProj();
        el.appendChild(renderTable({
          head: ["کد", "پروژه", "شهر", "پیشرفت", "زمان‌بندی", "هزینه", "حاشیهٔ پیش‌بینی"], numeric: [0, 0, 0, 1, 1, 1, 1],
          rows: list.map((r) => [r.code, r.name_fa, r.city_fa, pct(r.actual_pct), statusNum(r.spi), statusNum(r.cpi), r.margin_forecast != null ? (r.margin_forecast < 0 ? statusDot("critical", pct(r.margin_forecast)) : pct(r.margin_forecast)) : "—"]),
          rowAttr: (i) => `class="clickable${list[i].project_id === state.project ? " sel" : ""}"`,
          onRow: (i) => selectProject(list[i].project_id),
        }));
      },
    });
  }
  const statusNum = (v) => (v < 0.85 ? statusDot("critical", num(v, 2)) : v < 0.95 ? statusDot("warning", num(v, 2)) : num(v, 2));
  function bridgeSteps(b) {
    return [
      { label: "سود برنامه", value: b.plan, total: true, note: "درآمد برنامه منهای زمین و هزینهٔ برنامه" },
      { label: "قیمت فروش", value: b.price, note: "فروش قطعی به‌اضافهٔ واحدهای فروش‌نرفته به قیمت امروز، در برابر درآمد برنامه" },
      { label: "تورم هزینه", value: b.inflation, note: "هزینهٔ تکمیل با بهره‌وری برنامه، به قیمت امروز، در برابر هزینهٔ برنامه" },
      { label: "بهره‌وری اجرا", value: b.efficiency, note: "اثر شاخص هزینهٔ پروژه بر کار انجام‌شده و باقی‌مانده" },
      { label: "سود پیش‌بینی", value: b.forecast, total: true },
    ];
  }
  function selectProject(id) {
    state.project = id;
    const c = $("#chart-bridge");
    if (c) { renderProjectSheet(c); c.scrollIntoView({ behavior: "smooth", block: "start" }); }
    const t = $("#chart-projects-table .chart");
    if (t) t.querySelectorAll("tbody tr").forEach((tr) => tr.classList.remove("sel"));
  }
  function renderProjectSheet(c) {
    const r = T.projects.find((x) => x.project_id === state.project) || T.projects[0];
    c.innerHTML = "";
    const head = h("div", { class: "card-head" });
    const sel = h("select", { class: "select", "aria-label": "انتخاب پروژه" });
    T.projects.forEach((p) => sel.appendChild(h("option", { value: p.project_id }, `${p.code} · ${p.name_fa}`)));
    sel.value = r.project_id;
    sel.addEventListener("change", () => selectProject(+sel.value));
    head.appendChild(h("div", { class: "card-titles" }, `<h3 class="card-title">${r.name_fa}</h3><p class="card-sub">${subName(r.sub_id)} · ${r.city_fa} · ${r.type_fa} · شروع ${periodLabel(r.start_period > 140000 ? r.start_period : 140201)} · ${num(r.duration_months)} ماه</p>`));
    const tools = h("div", { class: "card-tools no-print" });
    tools.appendChild(sel);
    tools.appendChild(h("button", { class: "btn", type: "button", onclick: () => openSql("projects") }, "SQL"));
    head.appendChild(tools);
    c.appendChild(head);
    const building = r.kind === "building";
    c.appendChild(statStrip([
      { label: "پیشرفت واقعی در برابر برنامه", value: `${pct(r.actual_pct)} <em>از ${pct(r.planned_pct)}</em>` },
      { label: "شاخص زمان‌بندی", value: num(r.spi, 2), note: r.spi_1403 ? `پایان ۱۴۰۳: ${num(r.spi_1403, 2)}` : "" },
      { label: "شاخص هزینه", value: num(r.cpi, 2) },
      building ? { label: "حاشیهٔ سود، برنامه ← پیش‌بینی", value: `${pct(r.plan_margin)} ← ${pct(r.margin_forecast)}` } : { label: "بودجه به قیمت ۱۴۰۲", value: fm(r.bac_bn_1402) },
      building ? { label: "واحدهای فروخته‌شده", value: `${num(r.units_sold)} <em>از ${num(r.units_for_sale)}</em>` } : { label: "بتن از آبان‌سازه در ۱۴۰۴", value: pct(r.s7_share_1404 || 0) },
    ]));
    const row = h("div", { class: "grid" });
    c.appendChild(row);
    const left = h("div", { class: "span-6" }), right = h("div", { class: "span-6" });
    row.appendChild(left); row.appendChild(right);
    left.innerHTML = `<h4 class="card-title" style="font-size:15px">منحنی پیشرفت</h4><ul class="legend"><li><i class="dash"></i>برنامه</li><li><i class="line" style="background:var(--c1)"></i>واقعی</li></ul>`;
    const sc = h("div", { class: "chart" });
    left.appendChild(sc);
    const pm = T.project_month.filter((x) => x.project_id === r.project_id);
    requestAnimationFrame(() => C.line(sc, {
      x: pm.map((x) => x.period), xTick: (p, i) => monthTick(p, i, pm.length), xTip: periodLabel, yFmt: (t) => pct(t), yMin: 0, yMax: 1, height: 240, endLabel: 1,
      series: [{ name: "برنامه", color: "--plan", dash: true, values: pm.map((x) => x.planned_pct) }, { name: "واقعی", color: "--c1", area: true, values: pm.map((x) => x.actual_pct) }],
    }));
    if (building) {
      right.innerHTML = `<h4 class="card-title" style="font-size:15px">پل سود: برنامه تا پیش‌بینی</h4><ul class="legend"><li><i style="background:var(--c4)"></i>افزایش</li><li><i style="background:var(--c2)"></i>کاهش</li><li><i style="background:var(--total)"></i>جمع</li></ul>`;
      const wc = h("div", { class: "chart" });
      right.appendChild(wc);
      requestAnimationFrame(() => C.waterfall(wc, { fmt: fm, height: 240, steps: bridgeSteps(M.projectBridge(r)) }));
    } else {
      right.innerHTML = `<h4 class="card-title" style="font-size:15px">هزینهٔ تجمعی</h4><ul class="legend"><li><i class="line" style="background:var(--c1)"></i>ارزش کار انجام‌شده</li><li><i class="line" style="background:var(--c2)"></i>هزینهٔ واقعی</li></ul>`;
      const wc = h("div", { class: "chart" });
      right.appendChild(wc);
      requestAnimationFrame(() => C.line(wc, { x: pm.map((x) => x.period), xTick: (p, i) => monthTick(p, i, pm.length), xTip: periodLabel, yFmt: axisMoney, tipFmt: fm, height: 240, series: [{ name: "ارزش کار انجام‌شده", color: "--c1", values: pm.map((x) => x.ev_cum) }, { name: "هزینهٔ واقعی", color: "--c2", values: pm.map((x) => x.ac_cum) }] }));
    }
  }

  // ---------------------------------------------------------------- supply
  function pageSupply(v) {
    const g = h("div", { class: "grid" });
    v.appendChild(g);
    const pp = T.procurement_price;
    const steel = (f) => pp.filter((r) => (r.material_id === 1 || r.material_id === 2) && inYear(r.period) && (!f || f(r)));
    const prem = (rows) => sum(rows, (r) => r.cash_amount) / Math.max(1e-9, sum(rows, (r) => r.benchmark_amount)) - 1;
    const subsS = [1, 2, 3, 6];
    const steelSeries = () => [
      { name: "خرید موردی", color: "--c2", values: subsS.map((s) => prem(steel((r) => r.sub_id === s && r.channel_fa === "خرید موردی"))) },
      { name: "قرارداد چارچوب", color: "--c1", values: subsS.map((s) => prem(steel((r) => r.sub_id === s && r.channel_fa === "قرارداد چارچوب"))) },
    ];
    card(g, {
      id: "chart-steel", span: "span-7", title: "قیمت خرید آهن‌آلات نسبت به قیمت مرجع بازار", sub: `${yearText()} · میلگرد و تیرآهن · بهرهٔ خرید نسیه جدا شده است`, sql: "procurement_price",
      legend: [{ name: "خرید موردی", color: "--c2" }, { name: "قرارداد چارچوب", color: "--c1" }],
      render: (el) => C.bars(el, { cats: subsS.map((s) => subName(s).replace("ستاوند ", "")), series: steelSeries(), yFmt: (t) => pct(t), labels: true, labelFmt: (t) => pct(t, 1), height: 270 }),
      table: () => ({ head: ["شرکت", "خرید موردی", "قرارداد چارچوب"], numeric: [0, 1, 1], rows: subsS.map((s, i) => [subName(s), pct(steelSeries()[0].values[i], 1), pct(steelSeries()[1].values[i], 1)]) }),
    });
    const ps = periods();
    const spotShare = (f) => ps.map((p) => { const rr = pp.filter((r) => r.period === p && (r.material_id === 1 || r.material_id === 2) && f(r)); return sum(rr.filter((r) => r.channel_fa === "خرید موردی"), (r) => r.cash_amount) / Math.max(1e-9, sum(rr, (r) => r.cash_amount)); });
    card(g, {
      id: "chart-spot", span: "span-5", title: "سهم خرید موردی آهن‌آلات", sub: "سهم مبلغ، ماهانه", sql: "procurement_price",
      legend: [{ name: "ستاوند عمران", color: "--c2", type: "line" }, { name: "بقیهٔ گروه", color: "--c1", type: "line" }],
      render: (el) => C.line(el, { x: ps, xTick: (p, i) => monthTick(p, i, ps.length), xTip: periodLabel, yFmt: (t) => pct(t), yMin: 0, yMax: 1, height: 270, series: [{ name: "ستاوند عمران", color: "--c2", values: spotShare((r) => r.sub_id === 3) }, { name: "بقیهٔ گروه", color: "--c1", values: spotShare((r) => r.sub_id !== 3) }] }),
    });
    const co = T.concrete_otif_monthly;
    const otifS = (src) => ps.map((p) => { const r = co.find((x) => x.period === p && x.source === src); return r ? r.otif / r.orders : null; });
    const s7 = INS.list.find((x) => x.id === "S7");
    card(g, {
      id: "chart-otif", span: "span-7", title: "تحویل کامل و به‌موقع بتن آماده", sub: "سهم سفارش‌هایی که سر موعد و با مقدار کامل رسیدند · هدف ۹۰٪", sql: "concrete_otif_monthly",
      legend: [{ name: "بتن آبان‌سازه", color: "--c2", type: "line" }, { name: "کارخانهٔ بتن گروه", color: "--c1", type: "line" }, { name: "سایر تأمین‌کنندگان", color: "--c4", type: "line" }],
      render: (el) => C.line(el, { x: ps, xTick: (p, i) => monthTick(p, i, ps.length), xTip: periodLabel, yFmt: (t) => pct(t), yMin: 0.4, yMax: 1, height: 280, endLabel: 0, refs: [{ y: 0.9, label: "هدف ۹۰٪" }], series: [{ name: "آبان‌سازه", color: "--c2", values: otifS("flagged") }, { name: "کارخانهٔ گروه", color: "--c1", values: otifS("internal") }, { name: "سایر", color: "--c4", values: otifS("others") }] }),
      table: () => ({ head: ["ماه", "آبان‌سازه", "کارخانهٔ گروه", "سایر"], numeric: [0, 1, 1, 1], rows: ps.map((p, i) => [periodLabel(p), pct(otifS("flagged")[i]), pct(otifS("internal")[i]), pct(otifS("others")[i])]) }),
    });
    const pc = T.plant_capacity;
    const plantS = (ch) => ps.map((p) => sum(pc.filter((r) => r.period === p && r.channel_fa === ch), (r) => r.qty_m3));
    const cap = pc.length ? pc[0].capacity_m3 : 0;
    card(g, {
      id: "chart-plant", span: "span-5", title: "ظرفیت کارخانهٔ بتن گروه", sub: "مترمکعب در ماه · خط چین ظرفیت اسمی", sql: "plant_capacity",
      legend: [{ name: "پروژه‌های گروه", color: "--c1" }, { name: "مشتری بیرونی", color: "--c3" }],
      before: statStrip([{ label: "ظرفیت خالی ماهانه در ۱۴۰۴", value: num(s7.numbers.spare) + " <em>مترمکعب</em>" }, { label: "حجم ماهانهٔ آبان‌سازه", value: num(s7.numbers.flaggedVol) + " <em>مترمکعب</em>" }]),
      render: (el) => C.bars(el, { cats: ps, catTick: (p, i) => monthTick(p, i, ps.length), catTip: periodLabel, stacked: true, yFmt: (t) => num(t / 1000) + " هزار", tipFmt: (t) => num(t) + " مترمکعب", height: 220, refs: [{ y: cap, label: "ظرفیت " + num(cap) }], series: [{ name: "پروژه‌های گروه", color: "--c1", values: plantS("پروژه‌های گروه") }, { name: "مشتری بیرونی", color: "--c3", values: plantS("مشتری بیرونی") }] }),
    });
    const sup = () => {
      const rows = T.supplier_otif.filter((r) => state.year === "all" || r.j_year === +state.year);
      return Object.values(by(rows, (r) => r.supplier_id)).map((rr) => ({ name: rr[0].supplier_fa, mat: rr[0].material_id, internal: rr[0].is_internal, fw: rr[0].is_framework, orders: sum(rr, (r) => r.orders), otif: sum(rr, (r) => r.otif) / Math.max(1, sum(rr, (r) => r.orders)), amount: sum(rr, (r) => r.amount), id: rr[0].supplier_id }))
        .sort((a, b) => b.amount - a.amount).slice(0, 15);
    };
    const matName = (id) => (DATA.dims.material.find((m) => m.material_id === id) || {}).name_fa;
    card(g, {
      id: "chart-suppliers", span: "span-12", title: "پانزده تأمین‌کنندهٔ بزرگ", sub: `${yearText()} · به ترتیب مبلغ خرید`, sql: "supplier_otif",
      render: (el) => {
        el.innerHTML = "";
        el.appendChild(renderTable({
          head: ["تأمین‌کننده", "کالا", "نوع رابطه", "تعداد سفارش", "تحویل کامل و به‌موقع", "مبلغ خرید"], numeric: [0, 0, 0, 1, 1, 1],
          rows: sup().map((s) => [s.name, matName(s.mat), s.internal ? "درون‌گروهی" : s.fw ? "قرارداد چارچوب" : "موردی", num(s.orders), s.otif < 0.7 ? statusDot("critical", pct(s.otif)) : s.otif < 0.85 ? statusDot("warning", pct(s.otif)) : statusDot("good", pct(s.otif)), fm(s.amount)]),
        }));
      },
    });
  }

  // ---------------------------------------------------------------- invest
  function pageInvest(v) {
    const g = h("div", { class: "grid" });
    v.appendChild(g);
    const opp = () => T.opportunities.filter((r) => state.year === "all" || r.j_year === +state.year);
    const s5 = INS.list.find((x) => x.id === "S5");
    const o = opp();
    const flagged = o.filter((r) => r.has_intake_flag);
    const clean = o.filter((r) => !r.has_intake_flag && r.days_to_decision != null);
    const lost = o.filter((r) => r.outcome && r.outcome.startsWith("ازدست"));
    const top = h("article", { class: "card span-12" });
    top.appendChild(statStrip([
      { label: "فرصت‌های دریافتی", value: num(o.length), note: yearText() },
      { label: "با ایراد روشن از روز اول", value: pct(flagged.length / Math.max(1, o.length)), note: num(flagged.length) + " فرصت" },
      { label: "ساعت کارشناسی صرف آن‌ها", value: num(sum(flagged, (r) => Math.max(0, r.analyst_hours - 0.3))) },
      { label: "روز تا تصمیم، فرصت‌های سالم", value: num(sum(clean, (r) => r.days_to_decision) / Math.max(1, clean.length), 0) },
      { label: "فرصت خوبِ ازدست‌رفته به رقیب", value: num(lost.length), note: "میانگین امتیاز " + num(sum(lost, (r) => r.intake_score) / Math.max(1, lost.length), 0) },
    ]));
    top.lastChild.style.marginBottom = "0";
    g.appendChild(top);
    const fun = () => {
      const rows = T.opportunity_funnel.filter((r) => state.year === "all" || r.j_year === +state.year);
      return Object.values(by(rows, (r) => r.stage_no)).map((rr) => ({ stage: rr[0].stage_fa, no: rr[0].stage_no, clean: sum(rr.filter((r) => !r.has_intake_flag), (r) => r.entered), flag: sum(rr.filter((r) => r.has_intake_flag), (r) => r.entered), hc: sum(rr.filter((r) => !r.has_intake_flag), (r) => r.analyst_hours), hf: sum(rr.filter((r) => r.has_intake_flag), (r) => r.analyst_hours) })).sort((a, b) => a.no - b.no);
    };
    card(g, {
      id: "chart-funnel", span: "span-7", title: "قیف بررسی فرصت‌ها", sub: "تعداد فرصتی که به هر مرحله رسید", sql: "opportunity_funnel",
      legend: [{ name: "سالم", color: "--c1" }, { name: "با ایراد روز اول", color: "--c2" }],
      render: (el) => C.hbars(el, { stacked: true, rows: fun().map((f) => ({ label: f.stage, values: [f.clean, f.flag] })), series: [{ name: "سالم", color: "--c1" }, { name: "با ایراد روز اول", color: "--c2" }], fmt: fa, barH: 22, labelW: 150 }),
      table: () => ({ head: ["مرحله", "سالم", "با ایراد", "ساعت سالم", "ساعت با ایراد"], numeric: [0, 1, 1, 1, 1], rows: fun().map((f) => [f.stage, num(f.clean), num(f.flag), num(f.hc), num(f.hf)]) }),
    });
    card(g, {
      id: "chart-hours", span: "span-5", title: "ساعت کار کارشناسی در هر مرحله", sub: "بیشتر ساعت‌های صرف‌شده روی فرصت‌های معیوب، در بازدید و ارزیابی مالی رفته است", sql: "opportunity_funnel",
      legend: [{ name: "سالم", color: "--c1" }, { name: "با ایراد روز اول", color: "--c2" }],
      render: (el) => C.hbars(el, { stacked: true, rows: fun().filter((f) => f.no > 0).map((f) => ({ label: f.stage, values: [f.hc, f.hf] })), series: [{ name: "سالم", color: "--c1" }, { name: "با ایراد روز اول", color: "--c2" }], fmt: fa, barH: 22, labelW: 150 }),
    });
    const bins = [];
    for (let b = 20; b < 100; b += 5) bins.push(b);
    const groupOf = (r) => (r.outcome === "قرارداد بسته شد" ? 0 : r.outcome && r.outcome.startsWith("ازدست") ? 1 : r.has_intake_flag ? 3 : 2);
    const hist = () => [0, 1, 2, 3].map((gi) => bins.map((b) => opp().filter((r) => groupOf(r) === gi && r.intake_score >= b && r.intake_score < b + 5).length));
    const names = ["قرارداد بسته شد", "ازدست‌رفته به رقیب", "رد یا در جریان، سالم", "رد شده، با ایراد روز اول"];
    card(g, {
      id: "chart-score", span: "span-7", title: "امتیاز ورودی پیشنهادی و نتیجهٔ واقعی", sub: `تعداد فرصت در هر بازهٔ امتیاز · آستانهٔ پیشنهادی مسیر سریع: ${num(state.levers.s5_threshold)}`, sql: "opportunities",
      legend: names.map((n, i) => ({ name: n, color: ["--c1", "--c2", "--c4", "--c3"][i] })),
      render: (el) => { const hh = hist(); C.bars(el, { cats: bins, catTick: (b) => (b % 10 === 0 ? num(b) : null), catTip: (b) => `امتیاز ${num(b)} تا ${num(b + 5)}`, stacked: true, yFmt: fa, height: 260, series: names.map((n, i) => ({ name: n, color: ["--c1", "--c2", "--c4", "--c3"][i], values: hh[i] })) }); },
      table: () => { const hh = hist(); return { head: ["بازهٔ امتیاز"].concat(names), numeric: [0, 1, 1, 1, 1], rows: bins.map((b, j) => [`${num(b)}–${num(b + 5)}`].concat(hh.map((x) => num(x[j])))) }; },
    });
    const W = [["موقعیت", 25, "s_location"], ["وضعیت حقوقی", 20, "s_legal"], ["قیمت در برابر کارشناسی", 20, "s_price"], ["بازده مورد انتظار", 20, "s_irr"], ["متراژ", 10, "s_size"], ["سرعت شروع", 5, "s_speed"]];
    card(g, {
      id: "chart-weights", span: "span-5", title: "امتیاز ورودی چطور ساخته می‌شود", sub: "شش معیار با وزن ثابت، هر امتیاز با اجزایش قابل توضیح است", sql: "opportunities",
      render: (el) => C.hbars(el, { rows: W.map((w) => ({ label: w[0], values: [w[1]] })), series: [{ name: "وزن", color: "--c3" }], fmt: (x) => num(x) + "٪", labelW: 160, barH: 18 }),
      foot: `با این امتیاز و قاعدهٔ رد خودکار، ${num(s5.numbers.fastTrack)} فرصت سالم ۱۴۰۴ به مسیر سریع می‌رفتند و ${num(s5.numbers.falseRejects)} قرارداد بسته‌شده به اشتباه رد نمی‌شد.`,
    });
    const lostList = () => opp().filter((r) => r.outcome && r.outcome.startsWith("ازدست")).sort((a, b) => b.intake_score - a.intake_score);
    card(g, {
      id: "chart-lost", span: "span-12", title: "فرصت‌هایی که به رقیب رسیدند", sub: "سالم، با امتیاز بالا، اما تصمیم آن‌قدر طول کشید که رقیب زودتر خرید", sql: "opportunities",
      render: (el) => {
        el.innerHTML = "";
        el.appendChild(renderTable({
          head: ["کد", "نوع", "شهر", "متراژ", "قیمت پیشنهادی", "بازده مورد انتظار", "امتیاز ورودی", "روز تا تصمیم"], numeric: [0, 0, 0, 1, 1, 1, 1, 1],
          rows: lostList().map((r) => ["OP-" + r.opportunity_id, r.type_fa, r.city_fa, num(r.area_m2), fm(r.ask_price_bn), pct(r.expected_irr), `<b>${num(r.intake_score, 0)}</b><span class="bar-cell" style="width:${r.intake_score * 0.7}px;background:var(--c3)"></span>`, num(r.days_to_decision, 0)]),
        }));
      },
    });
  }

  // ---------------------------------------------------------------- risk
  function pageRisk(v) {
    const g = h("div", { class: "grid" });
    v.appendChild(g);
    const ps = periods();
    const inst = T.installments_monthly.filter((r) => inSub(r.sub_id));
    const rate = (idx) => ps.map((p) => { const rr = inst.filter((r) => r.period === p && r.is_indexed === idx); const n = sum(rr, (r) => r.installments); return n > 20 ? sum(rr, (r) => r.late30_count) / n : null; });
    card(g, {
      id: "chart-late30", span: "span-7", isEmpty: () => !sum(inst, (r) => r.installments), title: "اقساط پیش‌فروش با تأخیر بیش از ۳۰ روز", sub: `${subText()} · سهم اقساط سررسیدشده در هر ماه`, sql: "installments_monthly",
      legend: [{ name: "قرارداد قیمت ثابت", color: "--c2", type: "line" }, { name: "قرارداد شاخص‌دار", color: "--c1", type: "line" }],
      render: (el) => C.line(el, { x: ps, xTick: (p, i) => monthTick(p, i, ps.length), xTip: periodLabel, yFmt: (t) => pct(t), yMin: 0, height: 280, endLabel: 0, series: [{ name: "قیمت ثابت", color: "--c2", values: rate(0) }, { name: "شاخص‌دار", color: "--c1", values: rate(1) }] }),
      table: () => ({ head: ["ماه", "قیمت ثابت", "شاخص‌دار"], numeric: [0, 1, 1], rows: ps.map((p, i) => [periodLabel(p), pct(rate(0)[i]), pct(rate(1)[i])]) }),
    });
    const pi = T.price_index.filter((r) => inYear(r.period));
    card(g, {
      id: "chart-inflation", span: "span-5", title: "تورم ماهانه در برابر جریمهٔ دیرکرد", sub: "وقتی خط تورم بالای جریمه است، دیر پرداختن برای خریدار سود دارد", sql: "price_index",
      legend: [{ name: "تورم ماهانه", color: "--c3", type: "line" }, { name: "جریمهٔ دیرکرد ماهانه", type: "dash" }],
      render: (el) => C.line(el, { x: ps, xTick: (p, i) => monthTick(p, i, ps.length), xTip: periodLabel, yFmt: (t) => pct(t, 1), yMin: 0, height: 280, series: [{ name: "تورم ماهانه", color: "--c3", values: pi.map((r) => r.cpi_monthly_growth) }, { name: "جریمهٔ دیرکرد", color: "--plan", dash: true, values: pi.map((r) => r.late_fee_monthly) }] }),
    });
    const od = () => T.overdue_by_project.filter((r) => inSub(r.sub_id)).slice(0, 10);
    card(g, {
      id: "chart-overdue", span: "span-6", isEmpty: () => !od().length, title: "معوقات باز پیش‌فروش، ده پروژهٔ اول", sub: "اقساط سررسیدشده و پرداخت‌نشده در ۲۹ اسفند ۱۴۰۴ · میلیارد تومان", sql: "overdue_by_project",
      render: (el) => C.hbars(el, { rows: od().map((r) => ({ label: r.name_fa, values: [r.overdue_amount], extra: C.tipRow("--c1", "تأخیر بالای ۳۰ روز، سرمایه‌گذاران", pct(r.late30_rate_investors)) + C.tipRow("--c1", "تأخیر بالای ۳۰ روز، مصرف‌کنندگان", pct(r.late30_rate_end_users)) })), series: [{ name: "معوقات", color: "--c2" }], fmt: fm, labelW: 140 }),
      table: () => ({ head: ["پروژه", "معوقات", "تأخیر بالای ۳۰ روز", "سهم خریدار سرمایه‌گذار"], numeric: [0, 1, 1, 1], rows: od().map((r) => [r.name_fa, fm(r.overdue_amount), pct(r.late30_rate), pct(r.investor_share)]) }),
    });
    card(g, {
      id: "chart-loss", span: "span-6", isEmpty: () => !sum(inst, (r) => r.installments), title: "زیان تورمی اقساط دیرکرد", sub: "مبلغ قسط × ماه‌های تأخیر × فاصلهٔ تورم تا جریمه · میلیارد تومان", sql: "installments_monthly",
      render: (el) => C.bars(el, { cats: ps, catTick: (p, i) => monthTick(p, i, ps.length), catTip: periodLabel, series: [{ name: "زیان تورمی", color: "--c3", values: seriesBy(inst, (r) => r.inflation_loss) }], yFmt: axisMoney, tipFmt: fm, height: 250 }),
    });
    const ei = () => T.einvoice_lag.filter((r) => inYear(r.period) && inSub(r.sub_id));
    const buckets = [["lag_0_3", "۰ تا ۳ روز", "--q1"], ["lag_4_7", "۴ تا ۷ روز", "--q2"], ["lag_8_14", "۸ تا ۱۴ روز", "--q3"], ["lag_15_30", "۱۵ تا ۳۰ روز", "--q4"], ["lag_30_plus", "بیش از ۳۰ روز", "--q5"]];
    const eiRows = () => Object.values(by(ei(), (r) => r.sub_id + "|" + r.invoice_type_fa)).map((rr) => ({ label: rr[0].invoice_type_fa, sub: subName(rr[0].sub_id), n: sum(rr, (r) => r.invoices), parts: buckets.map((b) => sum(rr, (r) => r[b[0]])) })).filter((x) => x.n > 100).sort((a, b) => (b.parts[2] + b.parts[3] + b.parts[4]) / b.n - (a.parts[2] + a.parts[3] + a.parts[4]) / a.n);
    card(g, {
      id: "chart-einvoice", span: "span-7", isEmpty: () => !eiRows().length, title: "فاصلهٔ صدور تا ثبت صورتحساب در سامانهٔ مودیان", sub: `${yearText()} · سهم صورتحساب‌ها در هر بازهٔ تأخیر · مهلت ۷ روز`, sql: "einvoice_lag",
      legend: buckets.map((b) => ({ name: b[1], color: b[2] })),
      render: (el) => C.hbars(el, { stacked: true, rows: eiRows().map((x) => ({ label: x.label, sub: x.sub, values: x.parts.map((p) => p / x.n) })), series: buckets.map((b) => ({ name: b[1], color: b[2] })), fmt: (t) => pct(t), valueLabel: false, labelW: 150, barH: 20 }),
      table: () => ({ head: ["نوع صورتحساب", "شرکت", "تعداد"].concat(buckets.map((b) => b[1])), numeric: [0, 0, 1, 1, 1, 1, 1, 1], rows: eiRows().map((x) => [x.label, x.sub, num(x.n)].concat(x.parts.map((p) => pct(p / x.n)))) }),
    });
    const lateShare = (f) => ps.map((p) => { const rr = T.einvoice_lag.filter((r) => r.period === p && f(r)); const n = sum(rr, (r) => r.invoices); return n ? sum(rr, (r) => r.late_count) / n : null; });
    card(g, {
      id: "chart-einvoice-trend", span: "span-5", title: "سهم ثبت با تأخیر، ماهانه", sub: "صورتحساب‌هایی که بعد از ۷ روز ثبت شدند", sql: "einvoice_lag",
      legend: [{ name: "اجاره و شارژ", color: "--c2", type: "line" }, { name: "فروش بیرونی بتن", color: "--c3", type: "line" }, { name: "سایر", color: "--c1", type: "line" }],
      render: (el) => C.line(el, { x: ps, xTick: (p, i) => monthTick(p, i, ps.length), xTip: periodLabel, yFmt: (t) => pct(t), yMin: 0, yMax: 1, height: 250, series: [{ name: "اجاره و شارژ", color: "--c2", values: lateShare((r) => r.invoice_type_fa === "اجاره و شارژ") }, { name: "فروش بیرونی بتن", color: "--c3", values: lateShare((r) => r.invoice_type_fa === "فروش بتن") }, { name: "سایر", color: "--c1", values: lateShare((r) => r.invoice_type_fa !== "اجاره و شارژ" && r.invoice_type_fa !== "فروش بتن") }] }),
    });
    card(g, {
      id: "chart-quality", span: "span-12", title: "کیفیت داده", sub: `این گزارش روی ${num(T.meta.total_rows)} ردیف در ${num(Object.keys(T.meta.row_counts).length)} جدول ساخته شده است. ردیف‌های رد شده حذف بی‌صدا نشده‌اند و هر کدام با دلیلش در جدول etl_rejected_row ثبت است.`, sql: "data_quality",
      render: (el) => {
        el.innerHTML = "";
        el.appendChild(renderTable({ head: ["جدول", "قاعده", "ردیف بررسی‌شده", "ردیف ناموفق", "نرخ قبولی"], numeric: [0, 0, 1, 1, 1], rows: T.data_quality.map((r) => [`<span class="chip ltr">${r.table_name}</span>`, r.rule_fa, num(r.rows_checked), num(r.rows_failed), r.rows_failed ? statusDot("warning", num(r.pass_pct, 2) + "٪") : statusDot("good", "۱۰۰٪")]) }));
      },
    });
  }

  // ---------------------------------------------------------------- decision room
  const LEVERS = [
    { group: "فروش و وصول", items: [
      { key: "s3_indexed", label: "سهم پیش‌فروش شاخص‌دار در سال آینده", min: 0, max: 1, step: 0.05, fmt: (v) => pct(v), help: "سهمی از پیش‌فروش‌های جدید که اقساطش به شاخص هزینهٔ ساخت گره می‌خورد." },
      { key: "s1_adoption", label: "سهم قراردادهایی که جریمهٔ شاخص‌دار می‌گیرند", min: 0, max: 1, step: 0.05, fmt: (v) => pct(v), help: "با الحاقیه برای قراردادهای فعلی و پیش‌فرض برای قراردادهای جدید." },
    ] },
    { group: "تأمین", items: [
      { key: "s7_shift", label: "انتقال بتن آبان‌سازه به کارخانهٔ گروه", min: 0, max: 1, step: 0.05, fmt: (v) => pct(v), help: "سقف واقعی را ظرفیت خالی کارخانه تعیین می‌کند، حدود ۸۰٪ حجم این تأمین‌کننده." },
      { key: "s2_shift", label: "انتقال آهن‌آلات موردی عمران به قرارداد چارچوب", min: 0, max: 1, step: 0.05, fmt: (v) => pct(v), help: "خرید متمرکز ستاد با همان قیمت قراردادهای چارچوب مسکن." },
    ] },
    { group: "خزانه‌داری", items: [
      { key: "s6_pool", label: "سهم خرید نسیه‌ای که با پول تجمیع‌شده نقد می‌شود", min: 0, max: 1, step: 0.05, fmt: (v) => pct(v), help: "بهرهٔ پنهان ۳٫۵٪ ماهانه به همین نسبت حذف می‌شود." },
      { key: "s6_place", label: "سهم نقد بیکار که سپرده‌گذاری کوتاه‌مدت می‌شود", min: 0, max: 0.8, step: 0.05, fmt: (v) => pct(v), help: "باقی‌مانده برای نیاز ۳۰ روزه و احتیاط نگه داشته می‌شود." },
      { key: "s6_yield", label: "سود ماهانهٔ سپرده", min: 0.005, max: 0.025, step: 0.001, fmt: (v) => pct(v, 1), help: "فرض بازار پول؛ با نرخ واقعی بانک‌ها جایگزین کنید." },
    ] },
    { group: "سرمایه‌گذاری و انطباق", items: [
      { key: "s5_threshold", label: "آستانهٔ امتیاز برای مسیر سریع", min: 30, max: 90, step: 1, fmt: (v) => num(v), help: "فرصت‌های سالم با امتیاز بالاتر، ظرف ۱۴ روز به کمیته می‌رسند." },
      { key: "s5_recover", label: "سهم فرصت‌های ازدست‌رفته که با تصمیم سریع برمی‌گردند", min: 0, max: 0.8, step: 0.05, fmt: (v) => pct(v), help: "فرض محتاطانه؛ با سابقهٔ واقعی تیم تنظیم شود." },
      { key: "s4_penalty", label: "نرخ فرضی جریمه و هزینهٔ ثبت دیرهنگام", min: 0, max: 0.1, step: 0.005, fmt: (v) => pct(v, 1), help: "این یک فرض است، نه نرخ قانونی؛ با مشاور مالیاتی تأیید شود." },
      { key: "s4_automate", label: "ثبت خودکار روزانهٔ صورتحساب", type: "switch", fmt: (v) => (v ? "روشن" : "خاموش"), help: "اتصال مستقیم نرم‌افزار مالی به سامانهٔ مودیان با هشدار روز پنجم." },
    ] },
  ];

  function pageDecide(v) {
    const g = h("div", { class: "grid" });
    v.appendChild(g);
    const lev = h("article", { class: "card span-5 no-print" });
    const leversWrap = h("div", { class: "sticky-col" });
    lev.innerHTML = `<div class="card-head"><div class="card-titles"><h3 class="card-title">فرض‌ها و اهرم‌ها</h3><p class="card-sub">هر تغییر، اثر و یادداشت تصمیم را فوری به‌روز می‌کند</p></div><div class="card-tools"><button class="btn" type="button" id="reset-levers">بازگشت به پیش‌فرض</button></div></div>`;
    const list = h("div", { class: "levers" });
    LEVERS.forEach((grp) => {
      list.appendChild(h("p", { class: "lever-group" }, grp.group));
      grp.items.forEach((it) => {
        const row = h("div", { class: "lever" });
        const id = "lv-" + it.key;
        const val = state.levers[it.key];
        if (it.type === "switch") {
          row.innerHTML = `<label for="${id}">${it.label}</label><span class="switch"><input type="checkbox" id="${id}" ${val ? "checked" : ""}><span></span></span><span class="lv-help">${it.help}</span>`;
          $("input", row).addEventListener("change", (e) => { state.levers[it.key] = e.target.checked ? 1 : 0; recompute(); });
        } else {
          row.innerHTML = `<label for="${id}">${it.label}</label><span class="lv-value">${it.fmt(val)}</span><input type="range" id="${id}" min="${it.min}" max="${it.max}" step="${it.step}" value="${val}"><span class="lv-help">${it.help}</span>`;
          const inp = $("input", row), out = $(".lv-value", row);
          const fill = () => inp.style.setProperty("--fill", ((inp.value - it.min) / (it.max - it.min)) * 100 + "%");
          fill();
          inp.addEventListener("input", () => { state.levers[it.key] = +inp.value; out.textContent = it.fmt(+inp.value); fill(); recompute(); });
        }
        list.appendChild(row);
      });
    });
    lev.appendChild(list);
    leversWrap.appendChild(lev);
    const levCol = h("div", { class: "span-5 no-print" });
    lev.classList.remove("span-5");
    levCol.appendChild(leversWrap);
    g.appendChild(levCol);
    $("#reset-levers", lev).addEventListener("click", () => { state.levers = { ...M.DEFAULT_LEVERS }; INS = M.insights(T, state.levers); render(); });

    const res = h("div", { class: "span-7", style: "display:flex;flex-direction:column;gap:20px" });
    g.appendChild(res);
    const tot = h("article", { class: "card hero" });
    tot.innerHTML = `<p class="hero-eyebrow">اثر برآوردی ۱۲ ماهه با این فرض‌ها</p><div class="hero-number" id="dr-total"></div><p class="hero-text" id="dr-note"></p>`;
    res.appendChild(tot);
    const bars_ = h("article", { class: "card" });
    bars_.innerHTML = `<div class="card-head"><div class="card-titles"><h3 class="card-title">سهم هر اقدام</h3><p class="card-sub">میلیارد تومان · به ترتیب اثر</p></div></div>`;
    const bc = h("div", { class: "chart", id: "dr-bars" });
    bars_.appendChild(bc);
    res.appendChild(bars_);

    const memo = h("article", { class: "card memo span-12 print-keep", id: "memo" });
    g.appendChild(memo);
    drawDecision();
    if (ro) { bc.dataset.w = Math.round(bc.clientWidth); registry.set(bc, () => drawBars()); ro.observe(bc); }
  }
  let rcTimer;
  function recompute() {
    clearTimeout(rcTimer);
    rcTimer = setTimeout(() => { INS = M.insights(T, state.levers); drawDecision(); }, 50);
  }
  function drawBars() {
    const bc = $("#dr-bars");
    if (!bc) return;
    C.hbars(bc, { rows: INS.list.map((x) => ({ label: x.title.length > 34 ? x.title.slice(0, 33) + "…" : x.title, values: [x.impact], extra: `<div style="color:var(--ink-3);margin-top:4px;max-width:260px;white-space:normal">${x.impactNote}</div>` })), series: [{ name: "اثر ۱۲ ماهه", color: "--c1" }], fmt: fm, labelW: 230, barH: 20 });
  }
  function drawDecision() {
    const t = $("#dr-total");
    if (!t) return;
    t.innerHTML = num(INS.total / 1000, 2) + "<small>هزار میلیارد تومان</small>";
    $("#dr-note").textContent = `فاصله تا برآورد پیش‌فرض: ${INS.total >= BASE_TOTAL ? "+" : "−"}${fm(Math.abs(INS.total - BASE_TOTAL))}. بزرگ‌ترین اثر: ${INS.list[0].title}.`;
    drawBars();
    drawMemo($("#memo"));
  }
  let BASE_TOTAL = 0;

  function drawMemo(m) {
    const L = INS.list;
    const crit = L.filter((x) => x.severity === "critical");
    m.innerHTML = `
      <div class="card-head"><div class="card-titles"><h3 class="card-title" style="font-size:22px">یادداشت تصمیم برای هیئت‌مدیره</h3><p class="card-sub">پیش‌نویس خودکار از همین داده‌ها و فرض‌های بالا</p></div>
      <div class="card-tools no-print"><button class="btn" type="button" id="memo-print"><svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>چاپ</button></div></div>
      <dl class="memo-head">
        <dt>به</dt><dd>مدیرعامل و سهامدار اصلی، اعضای هیئت‌مدیره</dd>
        <dt>از</dt><dd>واحد تحلیل داده و کسب‌وکار</dd>
        <dt>تاریخ</dt><dd>۲۹ اسفند ۱۴۰۴</dd>
        <dt>موضوع</dt><dd>هفت اقدام با اثر برآوردی ${money(INS.total)} در ۱۲ ماه آینده</dd>
      </dl>
      <h3>خلاصه</h3>
      <p>بررسی ${num(T.meta.total_rows)} ردیف دادهٔ مالی، فروش، تأمین و پروژه در ۳۶ ماه گذشته هفت مشکل را نشان می‌دهد که روی هم حدود ${money(INS.total)} اثر دوازده‌ماهه دارند. ${num(crit.length)} مورد فوری است و تصمیمش در جلسهٔ همین ماه پیشنهاد می‌شود: ${crit.map((x) => x.title).join("؛ ")}. هیچ‌کدام از این اقدام‌ها به سرمایهٔ تازه نیاز ندارد؛ همه تغییر سیاست، قرارداد یا فرایند است.</p>
      <h3>درخواست از هیئت‌مدیره</h3>
      <ol>${L.map((x) => `<li>${x.action.split(".")[0]}.</li>`).join("")}</ol>
      ${L.map((x, i) => `
        <h3><span class="rank">${num(i + 1)}</span>${x.title} ${pill(x.severity)}</h3>
        <dl class="decision">
          <dt>یافته</dt><dd>${x.finding}</dd>
          <dt>پیشنهاد</dt><dd>${x.action}</dd>
          <dt>مسئول</dt><dd>${x.owner}</dd>
          <dt>شاخص پیگیری</dt><dd>${x.kpi}</dd>
          <dt>اثر برآوردی</dt><dd><b>${money(x.impact)}</b> در ۱۲ ماه. ${x.impactNote}.</dd>
          <dt>شواهد</dt><dd><a href="#/${x.page}" data-go="${x.page}" data-anchor="${x.anchor}">نمودار در صفحهٔ ${PAGES.find((p) => p.id === x.page).title}</a> · <a href="${T.files[x.mart]}" data-sql="${x.mart}"><span class="chip ltr">${T.files[x.mart]}</span></a></dd>
        </dl>`).join("")}
      <p class="sign">این یادداشت از دادهٔ ساختگی یک هلدینگ ساختمانی فرضی ساخته شده و برای نمایش روش تحلیل است. هر عدد از کوئری‌های پوشهٔ sql/marts آمده و با اسکریپت‌های پوشهٔ scripts دوباره قابل ساخت است.</p>`;
    $("#memo-print", m).addEventListener("click", () => window.print());
    m.querySelectorAll("[data-go]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); goEvidence(a.dataset.go, a.dataset.anchor); }));
    m.querySelectorAll("[data-sql]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openSql(a.dataset.sql); }));
  }

  // ---------------------------------------------------------------- shell
  const RENDER = { overview: pageOverview, cash: pageCash, projects: pageProjects, supply: pageSupply, invest: pageInvest, risk: pageRisk, decide: pageDecide };
  function query() {
    const q = [];
    if (state.year !== "all") q.push("y=" + state.year);
    if (state.sub !== "all") q.push("s=" + state.sub);
    return q.length ? "?" + q.join("&") : "";
  }
  function parseHash() {
    const m = location.hash.match(/^#\/(\w+)(?:\?(.*))?$/);
    const page = m && RENDER[m[1]] ? m[1] : "overview";
    const params = new URLSearchParams(m && m[2] ? m[2] : "");
    state.page = page;
    state.year = YEARS.includes(+params.get("y")) ? +params.get("y") : "all";
    state.sub = params.has("s") && T.subs.some((s) => s.sub_id === +params.get("s")) ? +params.get("s") : "all";
  }
  function buildNav() {
    const nav = $("#nav"), mob = $("#mobile-nav");
    nav.innerHTML = ""; mob.innerHTML = "";
    const critical = INS.list.filter((x) => x.severity === "critical").length;
    PAGES.forEach((p) => {
      const li = h("li");
      li.innerHTML = `<a href="#/${p.id}" data-page="${p.id}">${ICONS[p.id]}<span>${p.title}</span>${p.id === "overview" && critical ? `<span class="badge" aria-label="${num(critical)} مورد فوری">${num(critical)}</span>` : ""}</a>`;
      nav.appendChild(li);
      mob.appendChild(h("a", { href: "#/" + p.id, "data-page": p.id }, p.title));
    });
  }
  function buildFilters() {
    const ys = $("#year-seg");
    ys.innerHTML = "";
    YEARS.forEach((y) => {
      const b = h("button", { type: "button", "data-year": y }, y === "all" ? "۳۶ ماه" : num(y).replace(/٬/g, ""));
      b.addEventListener("click", () => { state.year = y; location.hash = "#/" + state.page + query(); });
      ys.appendChild(b);
    });
    const sel = $("#sub-select");
    sel.innerHTML = `<option value="all">کل گروه</option>` + T.subs.map((s) => `<option value="${s.sub_id}">${s.name_fa}</option>`).join("");
    sel.addEventListener("change", () => { state.sub = sel.value === "all" ? "all" : +sel.value; location.hash = "#/" + state.page + query(); });
  }
  function syncChrome() {
    const p = PAGES.find((x) => x.id === state.page);
    $("#page-title").textContent = p.title;
    document.title = p.title + " · داشبورد مدیرعامل ستاوند";
    document.querySelectorAll("[data-page]").forEach((a) => (a.dataset.page === state.page ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    document.querySelectorAll("#year-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.year === String(state.year))));
    $("#sub-select").value = String(state.sub);
    const filtersUsed = !["overview", "decide"].includes(state.page) || state.page === "overview";
    $("#filters").style.visibility = state.page === "decide" ? "hidden" : "visible";
    const cur = $("#mobile-nav [aria-current]");
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: "center", block: "nearest" });
    return filtersUsed;
  }
  function render() {
    registry.clear();
    if (ro) ro.disconnect();
    C.tip(null);
    const v = $("#view");
    v.innerHTML = "";
    const page = h("div", { class: "page" });
    const p = PAGES.find((x) => x.id === state.page);
    page.appendChild(h("p", { class: "lede" }, p.lede));
    v.appendChild(page);
    RENDER[state.page](page);
    syncChrome();
  }
  function footer() {
    const rc = T.meta.row_counts;
    $("#footer").innerHTML = `
      <span>${num(T.meta.total_rows)} ردیف در ${num(Object.keys(rc).length)} جدول · ${num(Object.keys(DATA.marts).length)} کوئری SQL · ساخت ${T.meta.built.split(" ")[0]}</span>
      <span>دورهٔ داده: ۱ فروردین ۱۴۰۲ تا ۲۹ اسفند ۱۴۰۴ · مبالغ به تومان · همت یعنی هزار میلیارد تومان</span>
      <span>همهٔ نام‌ها، اعداد و رویدادها ساختگی‌اند.</span>
      <span><a href="docs/" >مستندات تحلیل کسب‌وکار</a></span>`;
  }
  function theme() {
    const root = document.documentElement;
    const get = () => root.getAttribute("data-theme") || "auto";
    const set = (m) => {
      if (m === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", m);
      try { localStorage.setItem("setavand-theme", m); } catch (e) {}
      document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === m)));
    };
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => set(b.dataset.themeSet)));
    $("#theme-mobile").addEventListener("click", () => {
      const dark = get() === "dark" || (get() === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
      set(dark ? "light" : "dark");
    });
    set(get());
  }

  function boot(data) {
    DATA = data;
    T = M.prepare(data);
    INS = M.insights(T, state.levers);
    BASE_TOTAL = INS.total;
    parseHash();
    buildNav();
    buildFilters();
    footer();
    theme();
    render();
    addEventListener("hashchange", () => {
      const before = state.page;
      parseHash();
      render();
      if (before !== state.page) { scrollTo({ top: 0 }); $("#view").focus({ preventScroll: true }); }
    });
    addEventListener("scroll", () => $("#topbar").classList.toggle("scrolled", scrollY > 4), { passive: true });
    $("#sheet-close").addEventListener("click", closeSheet);
    $("#sheet-backdrop").addEventListener("click", closeSheet);
    addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
    window.__setavand = { state, insights: () => INS, tables: () => T };
    document.documentElement.dataset.ready = "1";
  }

  fetch("data/dashboard.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(boot)
    .catch((e) => { $("#view").innerHTML = `<p class="lede">داده بارگذاری نشد. ${String(e)}</p>`; });
})();
