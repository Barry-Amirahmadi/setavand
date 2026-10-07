/*
 * Setavand decision model.
 * Turns the SQL marts in data/dashboard.json into findings, recommendations and
 * 12-month impact estimates. Pure functions - no DOM - so the same file runs in
 * the browser and under node for verification (scripts/check_model.mjs).
 * Money is in billion Toman throughout.
 */
(function (root) {
  "use strict";

  const LAST_YEAR = 1404;
  const SUB_CODES = { 0: "HQ", 1: "MSK", 2: "TJR", 3: "OMR", 4: "BTN", 5: "AML", 6: "SRM" };

  // Every lever the decision room exposes. Defaults are deliberately conservative.
  const DEFAULT_LEVERS = {
    s1_adoption: 0.6,      // share of presale contracts moved to a CPI-linked late fee
    s2_shift: 0.8,         // share of civil-arm spot steel moved to framework contracts
    s3_indexed: 0.3,       // share of next year's presales signed with indexed installments
    s4_automate: 1,        // daily automated e-invoice registration on/off
    s4_penalty: 0.02,      // assumed penalty / friction cost on late-registered amounts
    s5_threshold: 45,      // intake-score cut-off for day-one screening
    s5_hour_cost: 0.002,   // loaded analyst cost, bn Toman per hour (2M Toman)
    s5_recover: 0.3,       // share of deals lost to competitors that faster decisions win back
    s5_value_rate: 0.08,   // value created per won deal, share of asking price
    s6_pool: 0.8,          // share of credit purchases funded from the pool instead
    s6_place: 0.3,         // share of idle balances placed in short-term deposits
    s6_yield: 0.015,       // monthly deposit yield on placed cash
    s7_shift: 0.8,         // share of the flagged supplier's volume moved to the group plant
  };

  function rowsOf(data, name) {
    const m = data.marts[name];
    return m.rows.map((r) => Object.fromEntries(m.cols.map((c, i) => [c, r[i]])));
  }
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x || 0), 0);
  const yearOf = (period) => Math.floor(period / 100);
  const by = (a, f) => a.reduce((m, x) => ((m[f(x)] = m[f(x)] || []).push(x), m), {});

  function prepare(data) {
    const t = {};
    for (const name of Object.keys(data.marts)) t[name] = rowsOf(data, name);
    t.subs = data.dims.subsidiary;
    t.meta = data.meta;
    t.files = Object.fromEntries(Object.entries(data.marts).map(([k, v]) => [k, v.file]));
    return t;
  }

  // ------------------------------------------------------------------ findings
  function s1(t, L) {
    const inst = t.installments_monthly;
    const y = inst.filter((r) => yearOf(r.period) === LAST_YEAR);
    const rate = (rows) => sum(rows, (r) => r.late30_count) / Math.max(1, sum(rows, (r) => r.installments));
    const lateFixed = rate(y.filter((r) => r.is_indexed === 0));
    const lateIndexed = rate(y.filter((r) => r.is_indexed === 1));
    const overdue = sum(inst, (r) => r.overdue_amount);
    const loss = sum(y, (r) => r.inflation_loss);
    const byYear = [1402, 1403, 1404].map((yr) => {
      const rr = inst.filter((r) => yearOf(r.period) === yr && r.is_indexed === 0);
      const gap = sum(rr, (r) => r.cpi_monthly_growth - r.late_fee_monthly) / Math.max(1, rr.length);
      return { year: yr, late30: rate(rr), gap };
    });
    const top = t.overdue_by_project.slice(0, 4);
    const topShare = sum(top, (r) => r.overdue_amount) / Math.max(1e-9, sum(t.overdue_by_project, (r) => r.overdue_amount));
    return {
      id: "S1", page: "risk", anchor: "chart-late30", mart: "installments_monthly",
      severity: "serious",
      title: "جریمهٔ دیرکرد از تورم ارزان‌تر است",
      finding: `جریمهٔ دیرکرد اقساط پیش‌فروش ۱۸٪ سالانه است، یعنی ۱٫۵٪ در ماه، اما تورم ماهانهٔ ۱۴۰۴ به‌طور میانگین ${pct(byYear[2].gap + 0.015)} بوده است. برای خریدار، دیر پرداختن یعنی وام ارزان. سهم اقساطی که بیش از ۳۰ روز دیر پرداخت شده‌اند در قراردادهای قیمت ثابت ${pct(lateFixed)} است و در قراردادهای شاخص‌دار ${pct(lateIndexed)}. معوقات باز امروز ${money(overdue)} است و ${pct(topShare)} آن در چهار پروژه جمع شده است.`,
      action: "جریمهٔ دیرکرد را به شاخص تورم به‌اضافهٔ ۲ واحد گره بزنید، برای پرداخت زودهنگام ۲٪ تخفیف بگذارید، و به خریداران فعلی برای الحاقیهٔ قرارداد مشوق بدهید.",
      owner: "مدیر فروش و وصول ستاوند مسکن",
      kpi: "سهم اقساط با تأخیر بالای ۳۰ روز، هدف زیر ۸٪",
      impact: loss * L.s1_adoption,
      impactNote: `زیان تورمی اقساط دیرکرد در ۱۴۰۴، ${money(loss)}، ضرب در سهم قراردادهایی که الحاقیه می‌گیرند، ${pct(L.s1_adoption)}`,
      numbers: { lateFixed, lateIndexed, overdue, loss, byYear, topShare },
    };
  }

  function s2(t, L) {
    const p = t.procurement_price.filter((r) => yearOf(r.period) === LAST_YEAR && (r.material_id === 1 || r.material_id === 2));
    const prem = (rows) => sum(rows, (r) => r.cash_amount) / Math.max(1e-9, sum(rows, (r) => r.benchmark_amount)) - 1;
    const omr = p.filter((r) => r.sub_id === 3);
    const rest = p.filter((r) => r.sub_id !== 3);
    const spot = omr.filter((r) => r.channel_fa === "خرید موردی");
    const fw = omr.filter((r) => r.channel_fa !== "خرید موردی");
    const spotAmt = sum(spot, (r) => r.cash_amount);
    const premSpot = prem(spot), premFw = prem(fw);
    const premOtherSpot = prem(rest.filter((r) => r.channel_fa === "خرید موردی"));
    const spotShare = spotAmt / Math.max(1e-9, sum(omr, (r) => r.cash_amount));
    const otherSpotShare = sum(rest.filter((r) => r.channel_fa === "خرید موردی"), (r) => r.cash_amount) / Math.max(1e-9, sum(rest, (r) => r.cash_amount));
    const impact = (spotAmt * (premSpot - premFw)) / (1 + premSpot) * L.s2_shift;
    return {
      id: "S2", page: "supply", anchor: "chart-steel", mart: "procurement_price",
      severity: premSpot > 0.1 ? "serious" : "warning",
      title: "ستاوند عمران آهن‌آلات را گران و موردی می‌خرد",
      finding: `در ۱۴۰۴، ${pct(spotShare)} از خرید میلگرد و تیرآهن ستاوند عمران موردی بوده است، در حالی که این سهم در بقیهٔ گروه ${pct(otherSpotShare)} است. خرید موردی عمران ${pct(premSpot)} بالاتر از قیمت مرجع بازار تمام شده، خرید موردی بقیهٔ شرکت‌ها ${pct(premOtherSpot)} و خرید با قرارداد چارچوب ${pct(premFw)}.`,
      action: "خرید آهن‌آلات را در ستاد متمرکز کنید و برای عمران هم از همان قراردادهای چارچوب سالانهٔ مسکن استفاده کنید. خرید موردی فقط با تأیید مدیر تأمین مجاز باشد.",
      owner: "مدیر تأمین گروه",
      kpi: "سهم خرید موردی آهن‌آلات عمران، هدف زیر ۲۰٪",
      impact,
      impactNote: `خرید موردی عمران در ۱۴۰۴، ${money(spotAmt)}، ضرب در فاصلهٔ قیمت موردی تا چارچوبی، ضرب در سهم انتقال، ${pct(L.s2_shift)}`,
      numbers: { spotShare, otherSpotShare, premSpot, premFw, premOtherSpot, spotAmt },
    };
  }

  function projectBridge(r) {
    const plan = r.revenue_plan - r.land_cost - r.cost_plan;
    const price = r.revenue_forecast - r.revenue_plan;
    const inflation = -(r.eac_at_plan_efficiency - r.cost_plan);
    const efficiency = -(r.eac - r.eac_at_plan_efficiency);
    return { plan, price, inflation, efficiency, forecast: plan + price + inflation + efficiency };
  }

  function priceGap(t) {
    const pi = t.price_index;
    const a = pi.find((r) => r.period === 140312), b = pi.find((r) => r.period === 140412);
    return {
      ci: b.construction_cost_index / a.construction_cost_index - 1,
      hp: b.housing_price_index / a.housing_price_index - 1,
      ciMonthly: Math.pow(b.construction_cost_index / a.construction_cost_index, 1 / 12) - 1,
    };
  }

  function s3(t, L) {
    const b = t.projects.filter((r) => r.kind === "building");
    const flag = b.find((r) => r.code === "MSK-01");
    const losers = b.filter((r) => r.margin_forecast < 0).sort((x, y) => x.margin_forecast - y.margin_forecast);
    const br = projectBridge(flag);
    const ps = t.presales_monthly.filter((r) => yearOf(r.period) === LAST_YEAR);
    const fixed = sum(ps.filter((r) => r.is_indexed === 0), (r) => r.amount);
    const all = sum(ps, (r) => r.amount);
    const g = priceGap(t);
    const impact = fixed * Math.max(g.ci - g.hp, 0) * 0.5 * L.s3_indexed;
    return {
      id: "S3", page: "projects", anchor: "chart-bridge", mart: "projects",
      severity: losers.length ? "critical" : "serious",
      title: "پیش‌فروش زودهنگام با قیمت قفل‌شده، سود برج سپهر را خورد",
      finding: `${pct(0.84)} واحدهای برج سپهر در ماه‌های اول با قیمت ثابت و بدون تعدیل پیش‌فروش شد. حاشیهٔ سود برنامه ${pct(flag.plan_margin)} بود و پیش‌بینی امروز ${pct(flag.margin_forecast)} است. از ${money(br.plan)} سود برنامه، ${money(-br.price)} را قیمت قفل‌شده برد، ${money(-br.inflation)} را تورم هزینه و ${money(-br.efficiency)} را بهره‌وری اجرا. ${num(losers.length)} پروژه اکنون زیان‌ده پیش‌بینی می‌شوند. در ۱۴۰۴ هم ${pct(fixed / Math.max(1e-9, all))} پیش‌فروش‌های گروه هنوز قیمت ثابت است، در حالی که شاخص هزینهٔ ساخت ${pct(g.ci)} و قیمت فروش ${pct(g.hp)} رشد کرد.`,
      action: "پیش‌فروش با قیمت ثابت را به ۴۰٪ واحدهای هر پروژه محدود کنید، باقی اقساط را به شاخص هزینهٔ ساخت گره بزنید و فهرست قیمت را ماهانه به‌روز کنید، نه فصلی. برای برج سپهر، بستهٔ ارتقای مشاعات و پارکینگ به خریداران فعلی بفروشید.",
      owner: "مدیرعامل ستاوند مسکن و کمیتهٔ قیمت‌گذاری",
      kpi: "سهم پیش‌فروش شاخص‌دار، هدف بالای ۶۰٪ · حاشیهٔ سود پیش‌بینی هر پروژه",
      impact,
      impactNote: `پیش‌فروش قیمت ثابت ۱۴۰۴، ${money(fixed)}، ضرب در نصف فاصلهٔ رشد هزینه و قیمت، ضرب در سهم شاخص‌دار، ${pct(L.s3_indexed)}`,
      numbers: { flag, bridge: br, losers, fixedShare: fixed / Math.max(1e-9, all), gap: g },
    };
  }

  function s4(t, L) {
    const e = t.einvoice_lag.filter((r) => yearOf(r.period) === LAST_YEAR);
    const bySub = Object.entries(by(e, (r) => r.sub_id + "|" + r.invoice_type_fa)).map(([key, rr]) => ({
      sub: +key.split("|")[0], type: key.split("|")[1], invoices: sum(rr, (r) => r.invoices),
      share: sum(rr, (r) => r.late_count) / Math.max(1, sum(rr, (r) => r.invoices)),
      avgLag: sum(rr, (r) => r.avg_lag_days * r.invoices) / Math.max(1, sum(rr, (r) => r.invoices)),
      late: sum(rr, (r) => r.late_amount),
    })).filter((x) => x.invoices > 500).sort((a, b) => b.share - a.share);
    const late = sum(e, (r) => r.late_amount);
    const worst = bySub.slice(0, 2);
    return {
      id: "S4", page: "risk", anchor: "chart-einvoice", mart: "einvoice_lag",
      severity: "warning",
      title: "صورتحساب‌های املاک و بتن دیر در سامانهٔ مودیان ثبت می‌شوند",
      finding: `در ۱۴۰۴، ${pct(worst[0].share)} صورتحساب‌های ${worst[0].type} در ${subName(t, worst[0].sub)} و ${pct(worst[1].share)} صورتحساب‌های ${worst[1].type} در ${subName(t, worst[1].sub)} بعد از مهلت ۷ روزه ثبت شده‌اند، با میانگین تأخیر ${num(worst[0].avgLag, 1)} و ${num(worst[1].avgLag, 1)} روز. مبلغ صورتحساب‌های دیرثبت‌شدهٔ گروه در این سال ${money(late)} است.`,
      action: "ثبت صورتحساب را روزانه و خودکار از نرم‌افزار مالی به سامانه وصل کنید و برای هر صورتحسابی که به روز پنجم رسید هشدار بفرستید.",
      owner: "مدیر مالی گروه",
      kpi: "سهم صورتحساب‌های ثبت‌شده در ۳ روز، هدف ۹۸٪",
      impact: late * L.s4_penalty * L.s4_automate,
      impactNote: `مبلغ دیرثبت‌شده در ۱۴۰۴، ${money(late)}، ضرب در نرخ فرضی جریمه و هزینهٔ اصطکاک، ${pct(L.s4_penalty)}. نرخ یک فرض است و در اتاق تصمیم قابل تغییر است`,
      numbers: { bySub, late },
    };
  }

  function s5(t, L) {
    const o = t.opportunities.filter((r) => r.j_year === LAST_YEAR);
    const flagged = o.filter((r) => r.has_intake_flag === 1);
    const wasted = sum(flagged, (r) => Math.max(r.analyst_hours - 0.3, 0));
    const lost = o.filter((r) => r.outcome && r.outcome.startsWith("ازدست"));
    const avgAsk = sum(lost, (r) => r.ask_price_bn) / Math.max(1, lost.length);
    const clean = o.filter((r) => r.has_intake_flag === 0 && r.days_to_decision != null);
    const days = sum(clean, (r) => r.days_to_decision) / Math.max(1, clean.length);
    // to-be: the four day-one flags become knock-out rules; clean deals scoring at or
    // above the threshold go to a fast track with a 14-day decision target
    const closed = o.filter((r) => r.outcome === "قرارداد بسته شد");
    const falseRejects = closed.filter((r) => r.has_intake_flag === 1).length;
    const hoursSaved = wasted;
    const fastLost = lost.filter((r) => r.intake_score >= L.s5_threshold);
    const fastTrack = o.filter((r) => r.has_intake_flag === 0 && r.intake_score >= L.s5_threshold).length;
    const coInvest = t.meta.srm_co_invest || 0.55;
    const impact = hoursSaved * L.s5_hour_cost + sum(fastLost, (r) => r.ask_price_bn) * coInvest * L.s5_value_rate * L.s5_recover;
    return {
      id: "S5", page: "invest", anchor: "chart-funnel", mart: "opportunities",
      severity: "warning",
      title: "فرصت‌های سرمایه‌گذاری دیر غربال می‌شوند",
      finding: `در ۱۴۰۴، ${num(o.length)} فرصت سرمایه‌گذاری رسید. ${pct(flagged.length / Math.max(1, o.length))} آن‌ها از روز اول یک ایراد روشن داشتند، مثل سند مشکل‌دار، منطقهٔ خارج از هدف یا قیمت بالاتر از ارزش کارشناسی، اما ${num(wasted)} ساعت کار کارشناسی صرفشان شد. تصمیم دربارهٔ فرصت‌های سالم به‌طور میانگین ${num(days, 0)} روز طول کشید و ${num(lost.length)} فرصت خوب به رقیب رسید.`,
      action: `چهار ایراد روز اول را قاعدهٔ رد خودکار کنید. فرصت‌های سالم را با امتیاز شفاف شش‌معیاره رتبه بدهید و آن‌هایی که امتیاز ${num(L.s5_threshold)} یا بیشتر دارند، در ۱۴ روز به کمیتهٔ هفتگی برسند.`,
      owner: "مدیرعامل ستاوند سرمایه",
      kpi: "روز تا تصمیم برای فرصت‌های سالم، هدف زیر ۱۴ روز",
      impact,
      impactNote: `ساعت‌های آزادشده، ${num(hoursSaved)} ساعت، ضرب در هزینهٔ ساعتی، به‌اضافهٔ ${pct(L.s5_recover)} از ${num(fastLost.length)} فرصت ازدست‌رفتهٔ بالای آستانه، ضرب در سهم ستاوند سرمایه و ${pct(L.s5_value_rate)} ارزش‌آفرینی`,
      numbers: { total: o.length, flagged: flagged.length, wasted, lost: lost.length, avgAsk, days, falseRejects, hoursSaved, fastLost: fastLost.length, fastTrack },
    };
  }

  function s6(t, L) {
    const c = t.cash_monthly.filter((r) => yearOf(r.period) === LAST_YEAR);
    const idle = {}, prem = {};
    for (const r of c) {
      idle[r.sub_id] = (idle[r.sub_id] || 0) + r.avg_idle / 12;
      prem[r.sub_id] = (prem[r.sub_id] || 0) + r.credit_premium;
    }
    const idleTotal = sum(Object.values(idle));
    const premTotal = sum(Object.values(prem));
    const surplus = Object.entries(idle).filter(([s]) => +s !== 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const payers = Object.entries(prem).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const inj = t.cash_monthly.filter((r) => r.injection_in > 0);
    const impact = premTotal * L.s6_pool + idleTotal * L.s6_place * L.s6_yield * 12;
    return {
      id: "S6", page: "cash", anchor: "chart-idle", mart: "cash_monthly",
      severity: "serious",
      title: "پول گروه یک‌جا بیکار است و جای دیگر با بهرهٔ پنهان قرض گرفته می‌شود",
      finding: `در ۱۴۰۴ به‌طور میانگین ${money(idleTotal)} نقد بیش از نیاز ۳۰ روزه در حساب‌های گروه بیکار ماند، که ${money(idle[0] || 0)} آن در ستاد و بقیه بیشتر در ${surplus.map(([s]) => subName(t, +s)).join("، ")} بود. هم‌زمان ${payers.map(([s]) => subName(t, +s)).join("، ")} مصالح را نسیه خریدند و ${money(premTotal)} بهرهٔ پنهان ۳٫۵٪ ماهانه پرداختند. ستاد در سه سال ${num(inj.length)} بار، همیشه بعد از کسری، به شرکت‌ها پول تزریق کرد.`,
      action: "خزانه‌داری متمرکز راه بیندازید: مازاد شرکت‌ها هر روز به حساب تجمیع برود و خریدهای نسیه با پول همان حساب نقد شوند. سود سالانه یک‌باره در تیر جای خود را به جاروب روزانه بدهد.",
      owner: "مدیر مالی گروه و خزانه‌دار",
      kpi: "بهرهٔ پنهان خرید نسیه، هدف زیر ۲۰٪ سطح ۱۴۰۴ · نقد بیکار",
      impact,
      impactNote: `${pct(L.s6_pool)} از بهرهٔ پنهان ۱۴۰۴، ${money(premTotal)}، به‌اضافهٔ سود سپردهٔ ${pct(L.s6_yield)} ماهانه روی ${pct(L.s6_place)} از نقد بیکار`,
      numbers: { idle, prem, idleTotal, premTotal, injections: inj.length },
    };
  }

  function s7(t, L) {
    const co = t.concrete_otif_monthly;
    const otif = (src, yr) => {
      const rr = co.filter((r) => r.source === src && yearOf(r.period) === yr);
      return sum(rr, (r) => r.otif) / Math.max(1, sum(rr, (r) => r.orders));
    };
    const f = [1402, 1403, 1404].map((y) => otif("flagged", y));
    const others = otif("others", LAST_YEAR);
    const internal = otif("internal", LAST_YEAR);
    const flaggedVol = sum(co.filter((r) => r.source === "flagged" && yearOf(r.period) === LAST_YEAR), (r) => r.qty_m3) / 12;
    const plant = t.plant_capacity.filter((r) => yearOf(r.period) === LAST_YEAR);
    const cap = plant.length ? plant[0].capacity_m3 : 0;
    const used = sum(plant, (r) => r.qty_m3) / 12;
    const spare = Math.max(cap - used, 0);
    const absorb = Math.min(1, spare / Math.max(1, flaggedVol));
    const g = priceGap(t);
    const pm = t.project_month;
    const hit = t.projects.filter((r) => r.kind === "building" && (r.s7_share_1404 || 0) > 0.5 && (r.s7_qty_1404 || 0) > 2000).map((r) => {
      const a = pm.find((x) => x.project_id === r.project_id && x.period === 140312);
      const b = pm.find((x) => x.project_id === r.project_id && x.period === 140412);
      const gapA = a ? a.planned_pct - a.actual_pct : 0;
      const gapB = b ? b.planned_pct - b.actual_pct : 0;
      const slip = Math.max(gapB - gapA, 0) * r.duration_months;
      const remaining = (1 - r.actual_pct) * r.bac_bn_1402 * t.price_index[t.price_index.length - 1].construction_cost_index;
      return { ...r, slip, remaining, cost: remaining * g.ciMonthly * slip };
    });
    const shift = Math.min(L.s7_shift, absorb);
    const impact = sum(hit, (r) => r.cost) * shift;
    return {
      id: "S7", page: "supply", anchor: "chart-otif", mart: "concrete_otif_monthly",
      severity: f[2] < 0.7 ? "critical" : "serious",
      title: "تأمین‌کنندهٔ بتن آبان‌سازه سه پروژه را عقب انداخت",
      finding: `تحویل کامل و به‌موقع بتن آبان‌سازه از ${pct(f[0])} در ۱۴۰۲ به ${pct(f[2])} در ۱۴۰۴ رسید، در حالی که بقیهٔ تأمین‌کنندگان ${pct(others)} ماندند. ${num(hit.length)} پروژه‌ای که بیشتر بتنشان را از او می‌گیرند، ${hit.map((r) => r.name_fa).join("، ")}، در ۱۴۰۴ روی هم حدود ${num(sum(hit, (r) => r.slip), 0)} ماه از برنامه عقب افتادند. کارخانهٔ بتن خود گروه ماهانه ${num(spare)} مترمکعب ظرفیت خالی دارد، یعنی ${pct(absorb)} حجم این تأمین‌کننده.`,
      action: "از ماه آینده بتن این سه پروژه را از کارخانهٔ گروه تأمین کنید، برای باقی‌مانده یک تأمین‌کنندهٔ دوم قرارداد ببندید و در قرارداد آبان‌سازه جریمهٔ تأخیر و سقف حجم بگذارید.",
      owner: "مدیر تأمین گروه و مدیرعامل ستاوند بتن",
      kpi: "تحویل کامل و به‌موقع بتن، هدف بالای ۹۰٪ · شاخص زمان‌بندی پروژه‌ها",
      impact,
      impactNote: `هزینهٔ هر ماه تأخیر برابر کار باقی‌مانده ضرب در تورم ماهانهٔ هزینهٔ ساخت، ${pct(g.ciMonthly)}، ضرب در ماه‌های تأخیر ۱۴۰۴، ضرب در سهم قابل انتقال، ${pct(shift)}`,
      numbers: { otifByYear: f, others, internal, flaggedVol, spare, absorb, hit, cap, used },
    };
  }

  function insights(t, levers) {
    const L = { ...DEFAULT_LEVERS, ...(levers || {}) };
    const list = [s1, s2, s3, s4, s5, s6, s7].map((f) => f(t, L));
    const total = sum(list, (x) => x.impact);
    list.forEach((x) => (x.share = x.impact / Math.max(1e-9, total)));
    return { list: list.slice().sort((a, b) => b.impact - a.impact), total, levers: L };
  }

  // ------------------------------------------------------------------ formatting
  const faNum = (d) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const F0 = faNum(0), F1 = faNum(1);
  function num(v, d) {
    if (v == null || isNaN(v)) return "—";
    return (d === 1 ? F1 : d > 1 ? faNum(d) : F0).format(v);
  }
  function pct(v, d) {
    if (v == null || isNaN(v)) return "—";
    const x = v * 100;
    const digits = d != null ? d : Math.abs(x) < 10 && x % 1 !== 0 ? 1 : 0;
    return faNum(digits).format(x) + "٪";
  }
  // bn Toman -> "۸۵۰ میلیارد تومان" or "۴٫۳ همت"
  function money(bn, opts) {
    if (bn == null || isNaN(bn)) return "—";
    const o = opts || {};
    const a = Math.abs(bn);
    if (a >= 1000) return faNum(a >= 10000 ? 0 : 1).format(bn / 1000) + (o.short ? " همت" : " هزار میلیارد تومان");
    if (a >= 1) return F0.format(bn) + (o.short ? " میلیارد" : " میلیارد تومان");
    return F0.format(bn * 1000) + (o.short ? " میلیون" : " میلیون تومان");
  }
  function subName(t, id) {
    const s = t.subs.find((x) => x.sub_id === id);
    return s ? s.name_fa : String(id);
  }
  const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  function periodLabel(p) {
    return MONTHS[(p % 100) - 1] + " " + F0.format(Math.floor(p / 100)).replace(/٬/g, "");
  }

  const api = { DEFAULT_LEVERS, LAST_YEAR, SUB_CODES, prepare, insights, projectBridge, priceGap, num, pct, money, subName, periodLabel, MONTHS, sum, by, yearOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SetavandModel = api;
})(typeof window !== "undefined" ? window : globalThis);
