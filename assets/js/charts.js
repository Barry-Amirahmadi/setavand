/*
 * A small SVG chart kit for the Setavand dashboard.
 * Every chart: thin marks, hairline grid, one y-axis, crosshair or per-mark tooltip,
 * colours from CSS tokens (so the theme switch needs no re-render), and a table view.
 */
(function (root) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const col = (c) => (c && c.startsWith("--") ? `var(${c})` : c);

  // ---------------------------------------------------------------- tooltip
  let tipEl;
  function tip(html, x, y) {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "tip";
      tipEl.setAttribute("role", "status");
      document.body.appendChild(tipEl);
    }
    if (html == null) return tipEl.classList.remove("on");
    tipEl.innerHTML = html;
    tipEl.classList.add("on");
    const r = tipEl.getBoundingClientRect();
    let left = x + 16, top = y - r.height - 12;
    if (left + r.width > innerWidth - 8) left = x - r.width - 16;
    if (left < 8) left = 8;
    if (top < 8) top = y + 18;
    tipEl.style.left = left + "px";
    tipEl.style.top = top + "px";
  }
  const tipRow = (color, name, value) =>
    `<div class="t-row"><i style="background:${col(color)}"></i><span>${name}</span><b>${value}</b></div>`;
  const tipHead = (t) => `<div class="t-head">${t}</div>`;

  // ---------------------------------------------------------------- scales
  function niceStep(span, count) {
    const raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  function niceDomain(min, max, count) {
    if (min === max) { max = min + 1; }
    const step = niceStep(max - min, count || 4);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
    return { lo, hi, ticks };
  }
  const linear = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

  function roundedBar(x, y, w, h, r, end) {
    // rounded corners only at the data end: "top", "bottom", "left" or "right"
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    if (h <= 0 || w <= 0) return "";
    if (end === "top")
      return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    if (end === "bottom")
      return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    if (end === "left")
      return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }

  function measure(container) {
    return Math.max(260, Math.floor(container.clientWidth || container.getBoundingClientRect().width || 600));
  }

  function svgRoot(container, w, h, label) {
    container.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: "img", "aria-label": label || "", direction: "ltr" }, container);
    return svg;
  }

  function animOnce(container) {
    if (reduced) return false;
    if (container.dataset.drawn) return false;
    container.dataset.drawn = "1";
    return true;
  }

  // ---------------------------------------------------------------- line / area
  // cfg: { x: [..], xTick(v,i) -> label|null, xTip(v), series:[{name,color,values,area,dash,width}],
  //        yFmt, tipFmt, yMin, yMax, height, refs:[{y,label}], endLabel: index of series to label }
  function line(container, cfg) {
    const W = measure(container), H = cfg.height || 260;
    const m = { t: 14, r: cfg.endLabel != null ? 70 : 16, b: 30, l: cfg.left || 58 };
    const svg = svgRoot(container, W, H, cfg.label);
    const all = cfg.series.flatMap((s) => s.values.filter((v) => v != null));
    (cfg.refs || []).forEach((r) => all.push(r.y));
    let lo = cfg.yMin != null ? cfg.yMin : Math.min(0, ...all);
    let hi = cfg.yMax != null ? cfg.yMax : Math.max(...all);
    const dom = niceDomain(lo, hi, cfg.ticks || 4);
    const x = linear(0, cfg.x.length - 1, m.l, W - m.r);
    const y = linear(dom.lo, dom.hi, H - m.b, m.t);
    const g = el("g", { class: "axis" }, svg);
    dom.ticks.forEach((t) => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? "zero" : "gridline" }, g);
      const tx = el("text", { x: m.l - 10, y: y(t) + 4, "text-anchor": "end" }, g);
      tx.textContent = cfg.yFmt(t);
    });
    cfg.x.forEach((v, i) => {
      const lab = cfg.xTick ? cfg.xTick(v, i) : null;
      if (!lab) return;
      const tx = el("text", { x: x(i), y: H - 8, "text-anchor": "middle" }, g);
      tx.textContent = lab;
    });
    (cfg.refs || []).forEach((r) => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(r.y), y2: y(r.y), class: "ref-line" }, svg);
      const t = el("text", { x: m.l + 6, y: y(r.y) - 6, class: "ref-label", "text-anchor": "start" }, svg);
      t.textContent = r.label;
    });
    const anim = animOnce(container);
    const plot = el("g", {}, svg);
    cfg.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)]));
      const segs = [];
      let cur = [];
      pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
      if (cur.length) segs.push(cur);
      segs.forEach((seg) => {
        const d = seg.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
        if (s.area) {
          const base = y(Math.max(dom.lo, 0));
          el("path", { d: d + `L${seg[seg.length - 1][0]},${base}L${seg[0][0]},${base}Z`, class: "area-path" + (anim ? " fade-in" : ""), style: `fill:${col(s.color)}` }, plot);
        }
        const p = el("path", { d, class: "line-path mark" + (s.dash ? " dashed" : ""), style: `stroke:${col(s.color)};stroke-width:${s.width || 2}px` }, plot);
        if (anim && !s.dash) {
          const len = p.getTotalLength ? p.getTotalLength() : 1000;
          p.style.setProperty("--len", len);
          p.classList.add("draw");
          p.style.animationDelay = si * 0.12 + "s";
        }
      });
      if (cfg.endLabel === si) {
        let li = s.values.length - 1;
        while (li > 0 && s.values[li] == null) li--;
        if (s.values[li] != null) {
          el("circle", { cx: x(li), cy: y(s.values[li]), r: 4, style: `fill:${col(s.color)};stroke:var(--card);stroke-width:2px` }, plot);
          const t = el("text", { x: x(li) + 9, y: y(s.values[li]) + 4, class: "data-label strong", "text-anchor": "start" }, plot);
          t.textContent = (cfg.labelFmt || cfg.yFmt)(s.values[li]);
        }
      }
    });
    // crosshair
    const hair = el("line", { y1: m.t, y2: H - m.b, class: "crosshair", visibility: "hidden" }, svg);
    const dots = cfg.series.map((s) => el("circle", { r: 4.5, visibility: "hidden", style: `fill:${col(s.color)};stroke:var(--card);stroke-width:2px;pointer-events:none` }, svg));
    const hit = el("rect", { x: m.l, y: m.t, width: Math.max(0, W - m.l - m.r), height: H - m.t - m.b, class: "hit" }, svg);
    const move = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(cfg.x.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (cfg.x.length - 1))));
      hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i)); hair.setAttribute("visibility", "visible");
      let html = tipHead(cfg.xTip ? cfg.xTip(cfg.x[i]) : cfg.x[i]);
      cfg.series.forEach((s, si) => {
        const v = s.values[i];
        if (v == null) { dots[si].setAttribute("visibility", "hidden"); return; }
        dots[si].setAttribute("cx", x(i)); dots[si].setAttribute("cy", y(v)); dots[si].setAttribute("visibility", "visible");
        html += tipRow(s.color, s.name, (cfg.tipFmt || cfg.yFmt)(v));
      });
      tip(html, ev.clientX, ev.clientY);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { hair.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); tip(null); });
  }

  // ---------------------------------------------------------------- vertical bars
  // cfg: { cats:[..], catTick(v,i), catTip(v), series:[{name,color,values}], stacked, yFmt, tipFmt,
  //        height, refs:[{y,label}], labels: bool (value on each bar - for few bars only) }
  function bars(container, cfg) {
    const W = measure(container), H = cfg.height || 260;
    const m = { t: 18, r: 16, b: cfg.bottom || 30, l: cfg.left || 58 };
    const svg = svgRoot(container, W, H, cfg.label);
    const n = cfg.cats.length;
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      if (cfg.stacked) {
        let p = 0, q = 0;
        cfg.series.forEach((s) => { const v = s.values[i] || 0; if (v >= 0) p += v; else q += v; });
        hi = Math.max(hi, p); lo = Math.min(lo, q);
      } else cfg.series.forEach((s) => { const v = s.values[i] || 0; hi = Math.max(hi, v); lo = Math.min(lo, v); });
    }
    (cfg.refs || []).forEach((r) => { hi = Math.max(hi, r.y); });
    if (cfg.yMax != null) hi = Math.max(hi, cfg.yMax);
    const dom = niceDomain(lo, hi, cfg.ticks || 4);
    const y = linear(dom.lo, dom.hi, H - m.b, m.t);
    const band = (W - m.l - m.r) / n;
    const groups = cfg.stacked ? 1 : cfg.series.length;
    const gap = 2;
    const bw = Math.min(24, Math.max(2, (band * 0.72 - gap * (groups - 1)) / groups));
    const g = el("g", { class: "axis" }, svg);
    dom.ticks.forEach((t) => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? "zero" : "gridline" }, g);
      const tx = el("text", { x: m.l - 10, y: y(t) + 4, "text-anchor": "end" }, g);
      tx.textContent = cfg.yFmt(t);
    });
    cfg.cats.forEach((c, i) => {
      const lab = cfg.catTick ? cfg.catTick(c, i) : c;
      if (lab == null) return;
      const tx = el("text", { x: m.l + band * (i + 0.5), y: H - (cfg.bottom ? cfg.bottom - 18 : 8), "text-anchor": "middle" }, g);
      tx.textContent = lab;
    });
    const anim = animOnce(container);
    const plot = el("g", {}, svg);
    for (let i = 0; i < n; i++) {
      const cx = m.l + band * (i + 0.5);
      const totalW = groups * bw + (groups - 1) * gap;
      let pos = 0, neg = 0;
      const top = cfg.stacked ? cfg.series.reduce((k, s, si) => ((s.values[i] || 0) > 0 ? si : k), -1) : -1;
      cfg.series.forEach((s, si) => {
        const v = s.values[i];
        if (!v) return;
        let x0, y0, y1;
        if (cfg.stacked) {
          x0 = cx - bw / 2;
          if (v >= 0) { y0 = y(pos + v); y1 = y(pos); pos += v; } else { y0 = y(neg); y1 = y(neg + v); neg += v; }
        } else {
          x0 = cx - totalW / 2 + si * (bw + gap);
          y0 = v >= 0 ? y(v) : y(0); y1 = v >= 0 ? y(0) : y(v);
        }
        const h = Math.max(0, y1 - y0 - (cfg.stacked && pos !== v && v > 0 ? gap : 0));
        const end = v >= 0 ? (!cfg.stacked || si === top ? "top" : "none") : "bottom";
        const d = end === "none" ? `M${x0},${y0}h${bw}v${h}h${-bw}Z` : roundedBar(x0, y0, bw, h, 4, end);
        const p = el("path", { d, class: "mark" + (anim ? " grow-y" + (v < 0 ? " neg" : "") : ""), style: `fill:${col(s.color)}` }, plot);
        if (anim) p.style.animationDelay = Math.min(i * 0.015, 0.5) + "s";
        if (cfg.labels && (!cfg.stacked || si === top)) {
          const t = el("text", { x: x0 + bw / 2, y: v >= 0 ? y0 - 6 : y1 + 14, "text-anchor": "middle", class: "data-label" }, plot);
          t.textContent = (cfg.labelFmt || cfg.yFmt)(cfg.stacked ? pos : v);
        }
      });
    }
    (cfg.refs || []).forEach((r) => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(r.y), y2: y(r.y), class: "ref-line" }, svg);
      const t = el("text", { x: m.l + 6, y: y(r.y) - 6, class: "ref-label", "text-anchor": "start" }, svg);
      t.textContent = r.label;
    });
    // per-column hit targets (bigger than the marks)
    for (let i = 0; i < n; i++) {
      const hit = el("rect", { x: m.l + band * i, y: m.t, width: band, height: H - m.t - m.b, class: "hit", style: "cursor:pointer" }, svg);
      const show = (ev) => {
        let html = tipHead(cfg.catTip ? cfg.catTip(cfg.cats[i]) : cfg.cats[i]);
        cfg.series.forEach((s) => { if (s.values[i] != null) html += tipRow(s.color, s.name, (cfg.tipFmt || cfg.yFmt)(s.values[i])); });
        if (cfg.stacked && cfg.series.length > 1) html += tipRow("transparent", "جمع", (cfg.tipFmt || cfg.yFmt)(cfg.series.reduce((a, s) => a + (s.values[i] || 0), 0)));
        tip(html, ev.clientX, ev.clientY);
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => tip(null));
    }
  }

  // ---------------------------------------------------------------- horizontal bars (RTL)
  // Labels on the right, bars grow leftwards from the label column.
  // cfg: { rows:[{label, values:[..], sub?}], series:[{name,color}], stacked, fmt, tipFmt, barH, labelW, valueLabel: bool }
  function hbars(container, cfg) {
    const W = measure(container);
    const bh = cfg.barH || 18, rowGap = cfg.rowGap || 14;
    const labelW = Math.min(cfg.labelW || 150, W * 0.42);
    const valW = cfg.valueLabel === false ? 8 : 74;
    const rows = cfg.rows;
    const H = rows.length * (bh + rowGap) + 6;
    const svg = svgRoot(container, W, H, cfg.label);
    const max = Math.max(1e-9, ...rows.map((r) => (cfg.stacked ? r.values.reduce((a, v) => a + Math.max(0, v || 0), 0) : Math.max(...r.values.map((v) => v || 0)))));
    const x0 = W - labelW - 12, span = x0 - valW;
    const sx = (v) => (v / max) * span;
    const anim = animOnce(container);
    rows.forEach((r, i) => {
      const yy = i * (bh + rowGap) + 3;
      const lab = el("text", { x: W, y: yy + bh / 2 + 4.5, "text-anchor": "start", class: "cat-label", direction: "rtl" }, svg);
      lab.textContent = r.label;
      el("rect", { x: x0 - span, y: yy, width: span, height: bh, rx: 4, style: "fill:var(--sunken)" }, svg);
      let acc = 0;
      const last = r.values.reduce((k, v, si) => (v > 0 ? si : k), -1);
      r.values.forEach((v, si) => {
        if (!v || v <= 0) return;
        const w = sx(v);
        const xr = x0 - acc;
        const isLast = !cfg.stacked || si === last;
        const wDraw = Math.max(0, w - (cfg.stacked && !isLast ? 2 : 0));
        const d = isLast ? roundedBar(xr - wDraw, yy, wDraw, bh, 4, "left") : `M${xr - wDraw},${yy}h${wDraw}v${bh}h${-wDraw}Z`;
        const color = (cfg.series[si] && cfg.series[si].color) || r.color || "--c1";
        const p = el("path", { d, class: "mark" + (anim ? " grow-x" : ""), style: `fill:${col(r.colors ? r.colors[si] : color)}` }, svg);
        if (anim) p.style.animationDelay = Math.min(i * 0.04, 0.5) + "s";
        acc += w;
      });
      if (cfg.valueLabel !== false) {
        const t = el("text", { x: x0 - acc - 8, y: yy + bh / 2 + 4.5, "text-anchor": "end", class: "data-label" + (r.strong ? " strong" : "") }, svg);
        t.textContent = r.valueText != null ? r.valueText : cfg.fmt(cfg.stacked ? r.values.reduce((a, v) => a + (v || 0), 0) : r.values[0]);
      }
      const hit = el("rect", { x: 0, y: yy - rowGap / 2, width: W, height: bh + rowGap, class: "hit", style: "cursor:pointer" }, svg);
      const show = (ev) => {
        let html = tipHead(r.label + (r.sub ? ` <span style="color:var(--ink-3);font-weight:500">· ${r.sub}</span>` : ""));
        r.values.forEach((v, si) => { if (v != null) html += tipRow((r.colors && r.colors[si]) || (cfg.series[si] && cfg.series[si].color) || "--c1", (cfg.series[si] && cfg.series[si].name) || "", (cfg.tipFmt || cfg.fmt)(v)); });
        if (r.extra) html += r.extra;
        tip(html, ev.clientX, ev.clientY);
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => tip(null));
      if (cfg.onClick) hit.addEventListener("click", () => cfg.onClick(r));
    });
  }

  // ---------------------------------------------------------------- scatter / bubble
  // cfg: { points:[{x,y,r,label,color,tip,strong}], xFmt, yFmt, xRef, yRef, xLabel, yLabel, height, quadrantLabels }
  function scatter(container, cfg) {
    const W = measure(container), H = cfg.height || 340;
    const m = { t: 18, r: 20, b: 44, l: 58 };
    const svg = svgRoot(container, W, H, cfg.label);
    const xs = cfg.points.map((p) => p.x).concat(cfg.xRef != null ? [cfg.xRef] : []);
    const ys = cfg.points.map((p) => p.y).concat(cfg.yRef != null ? [cfg.yRef] : []);
    const dx = niceDomain(Math.min(...xs), Math.max(...xs), 5), dy = niceDomain(Math.min(...ys), Math.max(...ys), 4);
    const x = linear(dx.lo, dx.hi, m.l, W - m.r), y = linear(dy.lo, dy.hi, H - m.b, m.t);
    const g = el("g", { class: "axis" }, svg);
    dy.ticks.forEach((t) => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: "gridline" }, g);
      el("text", { x: m.l - 10, y: y(t) + 4, "text-anchor": "end" }, g).textContent = cfg.yFmt(t);
    });
    dx.ticks.forEach((t) => {
      el("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, class: "gridline" }, g);
      el("text", { x: x(t), y: H - m.b + 18, "text-anchor": "middle" }, g).textContent = cfg.xFmt(t);
    });
    if (cfg.xLabel) el("text", { x: (m.l + W - m.r) / 2, y: H - 4, "text-anchor": "middle", class: "ref-label", direction: "rtl" }, svg).textContent = cfg.xLabel;
    if (cfg.yLabel) el("text", { x: m.l, y: m.t - 6, "text-anchor": "end", class: "ref-label", direction: "rtl" }, svg).textContent = cfg.yLabel;
    if (cfg.xRef != null) el("line", { x1: x(cfg.xRef), x2: x(cfg.xRef), y1: m.t, y2: H - m.b, class: "ref-line" }, svg);
    if (cfg.yRef != null) el("line", { x1: m.l, x2: W - m.r, y1: y(cfg.yRef), y2: y(cfg.yRef), class: "ref-line" }, svg);
    (cfg.quadrantLabels || []).forEach((q) => {
      const t = el("text", { x: q.side === "left" ? m.l + 8 : W - m.r - 8, y: q.pos === "top" ? m.t + 14 : H - m.b - 8, "text-anchor": q.side === "left" ? "end" : "start", class: "ref-label", direction: "rtl" }, svg);
      t.textContent = q.text;
    });
    const anim = animOnce(container);
    const sorted = cfg.points.slice().sort((a, b) => (b.r || 5) - (a.r || 5));
    sorted.forEach((p, i) => {
      const c = el("circle", { cx: x(p.x), cy: y(p.y), r: p.r || 5, class: "mark" + (anim ? " fade-in" : ""), style: `fill:${col(p.color || "--c1")};fill-opacity:${p.strong ? 0.9 : 0.55};stroke:var(--card);stroke-width:2px;cursor:pointer` }, svg);
      if (anim) c.style.animationDelay = Math.min(i * 0.012, 0.6) + "s";
      const show = (ev) => tip(p.tip, ev.clientX, ev.clientY);
      c.addEventListener("pointermove", show);
      c.addEventListener("pointerdown", show);
      c.addEventListener("pointerleave", () => tip(null));
      if (cfg.onClick) c.addEventListener("click", () => cfg.onClick(p));
    });
    cfg.points.filter((p) => p.labelText).forEach((p) => {
      const t = el("text", { x: x(p.x) + (p.r || 5) + 5, y: y(p.y) + 4, "text-anchor": "end", class: "data-label strong", direction: "rtl" }, svg);
      t.textContent = p.labelText;
    });
  }

  // ---------------------------------------------------------------- dumbbell (plan vs forecast)
  // cfg: { rows:[{label, a, b, tip}], aName, bName, fmt, labelW, aColor, bColor }
  function dumbbell(container, cfg) {
    const W = measure(container);
    const rh = 30, labelW = Math.min(cfg.labelW || 150, W * 0.4);
    const H = cfg.rows.length * rh + 34;
    const svg = svgRoot(container, W, H, cfg.label);
    const vals = cfg.rows.flatMap((r) => [r.a, r.b]).concat([0]);
    const d = niceDomain(Math.min(...vals), Math.max(...vals), 5);
    const left = 52, right = W - labelW - 16;
    const x = linear(d.lo, d.hi, left, right);
    const g = el("g", { class: "axis" }, svg);
    d.ticks.forEach((t) => {
      el("line", { x1: x(t), x2: x(t), y1: 0, y2: H - 26, class: t === 0 ? "zero" : "gridline" }, g);
      el("text", { x: x(t), y: H - 8, "text-anchor": "middle" }, g).textContent = cfg.fmt(t);
    });
    const anim = animOnce(container);
    cfg.rows.forEach((r, i) => {
      const yy = i * rh + rh / 2 + 2;
      el("text", { x: W, y: yy + 4.5, "text-anchor": "start", class: "cat-label", direction: "rtl" }, svg).textContent = r.label;
      el("line", { x1: x(r.a), x2: x(r.b), y1: yy, y2: yy, style: "stroke:var(--axis);stroke-width:2px", class: anim ? "fade-in" : "" }, svg);
      el("circle", { cx: x(r.a), cy: yy, r: 5, style: `fill:var(--card);stroke:${col(cfg.aColor || "--plan")};stroke-width:2px` }, svg);
      el("circle", { cx: x(r.b), cy: yy, r: 5.5, class: anim ? "fade-in" : "", style: `fill:${col(r.bColor || cfg.bColor || "--c1")};stroke:var(--card);stroke-width:2px` }, svg);
      const t = el("text", { x: r.b < r.a ? x(r.b) - 10 : x(r.b) + 10, y: yy + 4, "text-anchor": r.b < r.a ? "end" : "start", class: "data-label" }, svg);
      t.textContent = cfg.fmt(r.b);
      const hit = el("rect", { x: 0, y: yy - rh / 2, width: W, height: rh, class: "hit", style: "cursor:pointer" }, svg);
      const show = (ev) => tip(tipHead(r.label) + tipRow(cfg.aColor || "--plan", cfg.aName, cfg.fmt(r.a)) + tipRow(r.bColor || cfg.bColor || "--c1", cfg.bName, cfg.fmt(r.b)) + (r.extra || ""), ev.clientX, ev.clientY);
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => tip(null));
      if (cfg.onClick) hit.addEventListener("click", () => cfg.onClick(r));
    });
  }

  // ---------------------------------------------------------------- waterfall (variance bridge)
  // cfg: { steps:[{label, value, total:bool}], fmt, height, upColor, downColor, totalColor }
  function waterfall(container, cfg) {
    const W = measure(container), H = cfg.height || 280;
    const m = { t: 26, r: 16, b: 44, l: 58 };
    const svg = svgRoot(container, W, H, cfg.label);
    let run = 0;
    const bars_ = cfg.steps.map((s) => {
      if (s.total) { const b = { ...s, from: 0, to: s.value }; run = s.value; return b; }
      const b = { ...s, from: run, to: run + s.value }; run += s.value; return b;
    });
    const vals = bars_.flatMap((b) => [b.from, b.to]).concat([0]);
    const dom = niceDomain(Math.min(...vals), Math.max(...vals), 4);
    const y = linear(dom.lo, dom.hi, H - m.b, m.t);
    const band = (W - m.l - m.r) / bars_.length;
    const bw = Math.min(64, band * 0.56);
    const g = el("g", { class: "axis" }, svg);
    dom.ticks.forEach((t) => {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? "zero" : "gridline" }, g);
      el("text", { x: m.l - 10, y: y(t) + 4, "text-anchor": "end" }, g).textContent = cfg.fmt(t);
    });
    const anim = animOnce(container);
    // RTL reading order: first step on the right
    bars_.forEach((b, k) => {
      const i = bars_.length - 1 - k;
      const cx = m.l + band * (i + 0.5);
      const y0 = y(Math.max(b.from, b.to)), y1 = y(Math.min(b.from, b.to));
      const color = b.total ? cfg.totalColor || "--total" : b.value >= 0 ? cfg.upColor || "--c4" : cfg.downColor || "--c2";
      const up = b.total ? b.to >= 0 : b.value >= 0;
      const d = roundedBar(cx - bw / 2, y0, bw, Math.max(1, y1 - y0), 4, up ? "top" : "bottom");
      const p = el("path", { d, class: "mark" + (anim ? " grow-y" + (up ? "" : " neg") : ""), style: `fill:${col(color)}` }, svg);
      if (anim) p.style.animationDelay = k * 0.12 + "s";
      if (k < bars_.length - 1) {
        const nx = m.l + band * (i - 1 + 0.5);
        el("line", { x1: cx - bw / 2, x2: nx + bw / 2, y1: y(b.to), y2: y(b.to), style: "stroke:var(--ink-4);stroke-width:1px;stroke-dasharray:2 3" }, svg);
      }
      const lt = el("text", { x: cx, y: up ? y0 - 8 : y1 + 16, "text-anchor": "middle", class: "data-label" + (b.total ? " strong" : "") }, svg);
      lt.textContent = (b.total || b.value < 0 ? "" : "+") + cfg.fmt(b.total ? b.to : b.value);
      const lab = el("text", { x: cx, y: H - 22, "text-anchor": "middle", class: "cat-label", direction: "rtl" }, svg);
      lab.textContent = b.label;
      if (b.label2) { const l2 = el("text", { x: cx, y: H - 6, "text-anchor": "middle", class: "ref-label", direction: "rtl" }, svg); l2.textContent = b.label2; }
      const hit = el("rect", { x: cx - band / 2, y: m.t, width: band, height: H - m.t - m.b, class: "hit", style: "cursor:pointer" }, svg);
      const show = (ev) => tip(tipHead(b.label) + tipRow(color, b.total ? "مقدار" : "اثر", cfg.fmt(b.total ? b.to : b.value)) + (b.note ? `<div style="color:var(--ink-3);margin-top:4px">${b.note}</div>` : ""), ev.clientX, ev.clientY);
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => tip(null));
    });
  }

  // ---------------------------------------------------------------- activity rings
  // rings: [{label, value (0..1), color}]
  function rings(container, list) {
    const S = 190, c = S / 2, w = 17, gap = 4;
    container.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${S} ${S}`, class: "rings", role: "img", "aria-label": list.map((r) => r.label + " " + Math.round(r.value * 100) + "%").join("، ") }, container);
    const anim = !reduced;
    list.forEach((r, i) => {
      const rad = c - w / 2 - i * (w + gap) - 2;
      const len = 2 * Math.PI * rad;
      el("circle", { cx: c, cy: c, r: rad, style: `fill:none;stroke:${col(r.color)};stroke-opacity:.16;stroke-width:${w}px` }, svg);
      const a = el("circle", { cx: c, cy: c, r: rad, class: "ring-arc", transform: `rotate(-90 ${c} ${c})`, style: `fill:none;stroke:${col(r.color)};stroke-width:${w}px;stroke-linecap:round;stroke-dasharray:${len};stroke-dashoffset:${anim ? len : len * (1 - Math.min(r.value, 1))}` }, svg);
      if (anim) requestAnimationFrame(() => requestAnimationFrame(() => { a.style.strokeDashoffset = len * (1 - Math.min(r.value, 0.999)); }));
    });
    return svg;
  }

  // ---------------------------------------------------------------- sparkline
  function spark(container, values, color) {
    const W = Math.max(60, Math.floor(container.clientWidth || 200)), H = 44;
    const svg = svgRoot(container, W, H, "");
    const v = values.filter((x) => x != null);
    if (!v.length) return;
    const lo = Math.min(...v), hi = Math.max(...v);
    const x = linear(0, values.length - 1, 2, W - 6), y = linear(lo, hi === lo ? lo + 1 : hi, H - 4, 6);
    const d = values.map((val, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(val).toFixed(1)).join("");
    el("path", { d: d + `L${x(values.length - 1)},${H}L${x(0)},${H}Z`, class: "area-path", style: `fill:${col(color)}` }, svg);
    const p = el("path", { d, class: "line-path", style: `stroke:${col(color)}` }, svg);
    if (animOnce(container)) { const len = p.getTotalLength(); p.style.setProperty("--len", len); p.classList.add("draw"); }
    el("circle", { cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 3.5, style: `fill:${col(color)};stroke:var(--card);stroke-width:2px` }, svg);
  }

  root.Charts = { line, bars, hbars, scatter, dumbbell, waterfall, rings, spark, tip, tipRow, tipHead, niceDomain };
})(window);
