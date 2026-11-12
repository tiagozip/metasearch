import { TextMorph } from "/s/torph.js";

const W = 1000;
const H = 220;
const PAD = { top: 14, bottom: 14 };
const VOL_H = 40;
const SAMPLES = 256;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const RANGES = [
  ["1d", "1D"],
  ["5d", "5D"],
  ["1mo", "1M"],
  ["6mo", "6M"],
  ["ytd", "YTD"],
  ["1y", "1Y"],
  ["5y", "5Y"],
  ["max", "Max"],
];
const SPAN_LABEL = {
  "5d": "past 5 days",
  "1mo": "past month",
  "6mo": "past 6 months",
  ytd: "year to date",
  "1y": "past year",
  "5y": "past 5 years",
  max: "all time",
};
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const cssD = CSS.supports?.("d", 'path("M0 0")');

const h = (tag, attrs, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...kids.flat().filter((k) => k != null && k !== false));
  return el;
};

const svg = (tag, attrs = {}) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const setD = (path, d) => {
  if (cssD) path.style.d = `path("${d}")`;
  else path.setAttribute("d", d);
};

const morph = (el) =>
  new TextMorph({
    element: el,
    duration: 320,
    ease: EASE,
    scale: false,
    numbers: true,
  });

export function fillQuote(section, today, { source, sourceLabel } = {}) {
  const isFx = today.type === "CURRENCY";
  const isCoin = today.type === "CRYPTOCURRENCY";
  const tz = today.rolling ? undefined : today.tz;
  const money = new Intl.NumberFormat(undefined, {
    style: isFx ? "decimal" : "currency",
    currency: today.currency || "USD",
    minimumFractionDigits: today.decimals,
    maximumFractionDigits: today.decimals,
  });
  const pct = new Intl.NumberFormat(undefined, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const compact = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 2,
  });
  const compactMoney = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: today.currency || "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  });
  const fmt = (v) => money.format(v);
  const at = (t, opts) =>
    new Date(t * 1000).toLocaleString(undefined, { timeZone: tz, ...opts });
  const clockOpts = { hour: "numeric", minute: "2-digit" };

  const cache = new Map([["1d", today]]);
  let range = "1d";
  let model = null;
  let scrubIndex = -1;
  let anchor = -1;
  let pending = null;

  const logo = (() => {
    const fallback = () =>
      h(
        "span",
        { class: "qt-logo qt-mono", "aria-hidden": "true" },
        (today.name.match(/[A-Za-z0-9]/)?.[0] || "?").toUpperCase(),
      );
    if (isFx) return fallback();
    const img = h("img", {
      class: "qt-logo",
      src: `/ql?s=${encodeURIComponent(today.symbol)}`,
      alt: "",
      width: "40",
      height: "40",
      decoding: "async",
    });
    img.onerror = () => img.replaceWith(fallback());
    return img;
  })();

  const statusDot = h("span", {
    class: "qt-status-dot",
    "aria-hidden": "true",
  });
  const statusText = h("span", {});
  const status = h("p", { class: "qt-status" }, statusDot, statusText);

  const subEl = h("p", { class: "qt-sub" });
  const renderSub = () => {
    const text = [
      today.symbol.replace(/=X$/, ""),
      isFx || isCoin ? null : today.exchange,
      today.extra?.industry || today.extra?.sector,
      isCoin && today.extra?.rank ? `#${today.extra.rank} by market cap` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    subEl.textContent = text;
    subEl.title = text;
  };

  const top = h(
    "div",
    { class: "qt-top" },
    h(
      "div",
      { class: "qt-brand" },
      logo,
      h(
        "div",
        { class: "qt-id" },
        h("h2", { class: "qt-name", title: today.name }, today.name),
        subEl,
      ),
    ),
    status,
  );

  const price = h("span", { class: "qt-price" });
  const arrow = h("span", { class: "qt-arrow", "aria-hidden": "true" });
  arrow.innerHTML =
    '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const delta = h("span", { class: "qt-delta" });
  const when = h("span", { class: "qt-when" });
  const change = h("p", { class: "qt-change" }, arrow, delta, when);
  const ext = h("p", { class: "qt-ext", hidden: true });
  const priceMorph = morph(price);
  const deltaMorph = morph(delta);
  const reading = h(
    "div",
    { class: "qt-reading", "aria-live": "polite" },
    price,
    change,
    ext,
  );

  const uid = Math.random().toString(36).slice(2, 8);
  const clipRect = svg("rect", { x: 0, y: 0, width: W, height: H });
  const grad = svg("linearGradient", {
    id: `qt-fade-${uid}`,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1,
  });
  grad.append(
    svg("stop", { offset: "0", class: "qt-fade-top" }),
    svg("stop", { offset: "1", class: "qt-fade-bottom" }),
  );
  const clip = svg("clipPath", { id: `qt-clip-${uid}` });
  clip.append(clipRect);
  const defs = svg("defs");
  defs.append(grad, clip);
  const grid = svg("g", { class: "qt-grid" });
  const volume = svg("path", { class: "qt-volume" });
  const base = svg("line", { class: "qt-base", x1: 0, x2: W });
  const area = svg("path", { class: "qt-area", fill: `url(#qt-fade-${uid})` });
  const dim = svg("path", { class: "qt-line qt-dim" });
  const line = svg("path", {
    class: "qt-line",
    "clip-path": `url(#qt-clip-${uid})`,
  });
  const chart = svg("svg", {
    class: "qt-chart",
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });
  chart.append(defs, grid, volume, base, area, dim, line);

  const band = h("div", { class: "qt-band", "aria-hidden": "true" });
  const cursor = h("div", { class: "qt-cursor", "aria-hidden": "true" });
  const tip = h("span", { class: "qt-tip", "aria-hidden": "true" });
  const dot = h("div", { class: "qt-dot", "aria-hidden": "true" });
  const pulse = h("div", { class: "qt-pulse", "aria-hidden": "true" });
  const stage = h(
    "div",
    {
      class: "qt-stage",
      tabindex: "0",
      role: "group",
      "aria-label": `${today.name} price chart. Use the arrow keys to read values.`,
    },
    chart,
    band,
    cursor,
    tip,
    pulse,
    dot,
  );
  const yaxis = h("div", { class: "qt-yaxis", "aria-hidden": "true" });
  const xaxis = h("div", { class: "qt-xaxis", "aria-hidden": "true" });
  const plot = h("div", { class: "qt-plot" }, stage, yaxis, xaxis);

  const bar = h("span", { class: "qt-tab-bar", "aria-hidden": "true" });
  const tabs = RANGES.map(([key, label]) =>
    h(
      "button",
      {
        class: "qt-tab",
        type: "button",
        role: "tab",
        "aria-selected": String(key === range),
        onclick: () => pick(key),
      },
      label,
    ),
  );
  const tablist = h(
    "div",
    { class: "qt-tabs", role: "tablist", "aria-label": "Chart range" },
    ...tabs,
    bar,
  );

  const stats = h("dl", { class: "qt-stats" });
  const updated = h("span", {});
  const foot = h(
    "div",
    { class: "qt-foot" },
    source
      ? h(
          "a",
          {
            class: "qt-source",
            href: source,
            rel: "noopener",
            target: "_blank",
          },
          `View on ${sourceLabel || new URL(source).hostname.replace(/^www\./, "")}`,
        )
      : h("span", {}),
    updated,
  );

  section.replaceChildren(top, reading, plot, tablist, stats, foot);

  const renderStats = () => {
    const x = today.extra || {};
    const ath = x.ath ? fmt(x.ath) : null;
    const coinBase = today.symbol.split("-")[0];
    const pts = today.points.map((p) => p[1]);
    const span = (lo, hi) => {
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
      const f =
        Math.max(Math.abs(lo), Math.abs(hi)) >= 10000
          ? (v) => compactMoney.format(v)
          : fmt;
      return `${f(lo)} to ${f(hi)}`;
    };
    const dayRange = today.rolling
      ? span(Math.min(...pts), Math.max(...pts))
      : span(today.dayLow, today.dayHigh);
    const yearRange = span(today.yearLow, today.yearHigh);
    const rows = isCoin
      ? [
          ["24h range", dayRange],
          ["52-week range", yearRange],
          ["Market cap", x.marketCap && compactMoney.format(x.marketCap)],
          ["Volume 24h", today.volume && compactMoney.format(today.volume)],
          ["Supply", x.supply && `${compact.format(x.supply)} ${coinBase}`],
          ["All-time high", ath],
        ]
      : [
          ["Open", today.open != null && fmt(today.open)],
          ["Prev close", today.prevClose != null && fmt(today.prevClose)],
          [today.rolling ? "24h range" : "Day range", dayRange],
          ["52-week range", yearRange],
          [
            "Volume",
            today.volume
              ? `${compact.format(today.volume)}${x.avgVolume ? ` / ${compact.format(x.avgVolume)} avg` : ""}`
              : null,
          ],
          ["Market cap", x.marketCap && compactMoney.format(x.marketCap)],
          [
            "Dividend yield",
            x.yield ? pct.format(x.yield / 100) : x.marketCap ? "None" : null,
          ],
          ["Next earnings", x.earnings],
        ];
    stats.replaceChildren(
      ...rows
        .filter(([, v]) => v)
        .map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))),
    );
    stats.hidden = !stats.childElementCount;
  };

  const marketState = () => {
    const now = Date.now() / 1000;
    const s = today.session;
    const last = today.points.at(-1)?.[0] ?? today.time;
    if (today.rolling)
      return now - last < 1800
        ? ["live", isCoin ? "Live, trades 24/7" : "Market open"]
        : ["closed", "Market closed"];
    if (!s || now > s.end || now < s.start) return ["closed", "Market closed"];
    if (now < s.open) return ["ext", "Pre-market"];
    if (now < s.close)
      return ["live", `Market open, closes ${at(s.close, clockOpts)}`];
    return ["ext", "After hours"];
  };

  const renderStatus = () => {
    const [state, text] = marketState();
    status.dataset.state = state;
    statusText.textContent = text;
    updated.textContent = `Updated ${at(today.time, {
      ...clockOpts,
      timeZoneName: tz ? "short" : undefined,
    })}`;
  };

  const niceStep = (span, count) => {
    const raw = span / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const n = raw / mag;
    return (
      mag * (n < 1.5 ? 1 : n < 2.25 ? 2 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10)
    );
  };

  const timeTicks = (m) => {
    const s = range === "1d" ? m.data.session : null;
    if (s) {
      const minute = Number(at(s.start, { minute: "numeric" }));
      const first = s.start + ((60 - minute) % 60) * 60;
      const hours = [];
      for (let t = first; t <= s.end; t += 3600) hours.push(t);
      const step = Math.ceil(hours.length / 5);
      return hours
        .filter((_, i) => i % step === 0)
        .map((t) => [
          (t - s.start) / (s.end - s.start),
          at(t, { hour: "numeric" }),
        ]);
    }
    const key = (t) =>
      range === "1d"
        ? at(t, { hour: "numeric" })
        : range === "5d" || range === "1mo"
          ? at(t, { day: "numeric", month: "numeric" })
          : range === "5y" || range === "max"
            ? at(t, { year: "numeric" })
            : at(t, { month: "numeric", year: "numeric" });
    const label = (t) =>
      range === "1d"
        ? at(t, { hour: "numeric" })
        : range === "5d"
          ? at(t, { weekday: "short" })
          : range === "1mo"
            ? at(t, { month: "short", day: "numeric" })
            : range === "5y" || range === "max"
              ? at(t, { year: "numeric" })
              : at(t, { month: "short" });
    const marks = [];
    let prev = null;
    for (const [i, [t]] of m.points.entries()) {
      const k = key(t);
      if (k !== prev && i > 0) marks.push(i);
      prev = k;
    }
    const step = Math.max(
      1,
      Math.ceil(marks.length / (range === "1d" ? 4 : 5)),
    );
    return marks
      .filter((_, i) => i % step === 0)
      .map((i) => [m.xs[i], label(m.points[i][0])]);
  };

  const build = (data) => {
    const points = data.points;
    const s = range === "1d" ? data.session : null;
    const reference =
      range === "1d" ? data.prevClose : (points[0]?.[1] ?? data.price);
    const xs = s
      ? points.map(([t]) =>
          Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start))),
        )
      : points.map((_, i) => i / Math.max(1, points.length - 1));
    const values = points.map((p) => p[1]);
    const withRef = range === "1d" ? [...values, reference] : values;
    let lo = Math.min(...withRef);
    let hi = Math.max(...withRef);
    if (hi - lo < 1e-9) {
      lo -= Math.abs(lo) * 0.01 || 1;
      hi += Math.abs(hi) * 0.01 || 1;
    }
    const y = (v) =>
      PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const x0 = xs[0] ?? 0;
    const x1 = xs.at(-1) ?? 1;
    let j = 0;
    const samples = Array.from({ length: SAMPLES }, (_, k) => {
      const fx = x0 + ((x1 - x0) * k) / (SAMPLES - 1);
      while (j < xs.length - 2 && xs[j + 1] < fx) j++;
      const a = xs[j];
      const b = xs[j + 1] ?? a;
      const t = b > a ? Math.min(1, Math.max(0, (fx - a) / (b - a))) : 0;
      const v = values[j] + ((values[j + 1] ?? values[j]) - values[j]) * t;
      return [fx * W, y(v)];
    });
    const d = samples
      .map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`)
      .join(" ");
    const regular = s
      ? [
          (s.open - s.start) / (s.end - s.start),
          (s.close - s.start) / (s.end - s.start),
        ]
      : [0, 1];
    const maxVol = Math.max(0, ...points.map((p) => p[2] || 0));
    const slot = s
      ? (W * (points[1]?.[0] - points[0]?.[0] || 300)) / (s.end - s.start)
      : W / Math.max(1, points.length);
    const barW = Math.max(1, slot * 0.62);
    const vol =
      maxVol > 0 && range !== "5y" && range !== "max"
        ? points
            .map(([, , v], i) => {
              if (!v) return "";
              const bh = Math.max(1, (v / maxVol) * VOL_H);
              const vx = xs[i] * W - barW / 2;
              return `M${vx.toFixed(1)} ${H}v${(-bh).toFixed(1)}h${barW.toFixed(1)}v${bh.toFixed(1)}Z`;
            })
            .join("")
        : "";
    const step = niceStep(hi - lo, 4);
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step)
      ticks.push(v);
    return {
      data,
      points,
      xs,
      values,
      y,
      step,
      ticks,
      reference,
      last: range === "1d" && s ? data.price : (values.at(-1) ?? data.price),
      line: d,
      area: `${d} L${(x1 * W).toFixed(1)} ${H} L${(x0 * W).toFixed(1)} ${H} Z`,
      regular,
      vol,
      showBase: range === "1d",
    };
  };

  const setReading = (value, ref, label) => {
    const diff = value - ref;
    const up = diff >= 0;
    const rel = pct.format(Math.abs(ref ? diff / ref : 0));
    priceMorph.update(fmt(value));
    deltaMorph.update(`${fmt(Math.abs(diff))} (${rel})`);
    when.textContent = label;
    change.dataset.dir = up ? "up" : "down";
    change.setAttribute(
      "aria-label",
      `${up ? "up" : "down"} ${fmt(Math.abs(diff))}, ${rel}${label ? `, ${label}` : ""}`,
    );
  };

  const restLabel = () =>
    range === "1d" ? (today.rolling ? "past 24h" : "today") : SPAN_LABEL[range];

  const renderExt = () => {
    const s = today.session;
    const lastPoint = today.points.at(-1);
    if (!s || !lastPoint) {
      ext.hidden = true;
      return;
    }
    const [t, v] = lastPoint;
    const label =
      t >= s.close ? "After hours" : t < s.open ? "Pre-market" : null;
    if (!label || Math.abs(v - today.price) < 1e-9) {
      ext.hidden = true;
      return;
    }
    const diff = (v - today.price) / today.price;
    ext.hidden = false;
    ext.dataset.dir = diff >= 0 ? "up" : "down";
    ext.replaceChildren(
      h("span", { class: "qt-ext-label" }, label),
      h("span", {}, fmt(v)),
      h(
        "span",
        { class: "qt-ext-delta" },
        `${diff >= 0 ? "+" : "−"}${pct.format(Math.abs(diff))}`,
      ),
    );
  };

  const renderAxes = () => {
    const digits = Math.max(0, -Math.floor(Math.log10(model.step)));
    const f = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    grid.replaceChildren(
      ...model.ticks.map((v) => {
        const gy = model.y(v).toFixed(1);
        return svg("line", { x1: 0, x2: W, y1: gy, y2: gy });
      }),
    );
    yaxis.replaceChildren(
      ...model.ticks.map((v) =>
        h(
          "span",
          { style: `top: ${((model.y(v) / H) * 100).toFixed(2)}%` },
          f.format(v),
        ),
      ),
    );
    xaxis.replaceChildren(
      ...timeTicks(model).map(([fx, label]) =>
        h(
          "span",
          {
            style: `left: ${(fx * 100).toFixed(2)}%`,
            class: fx < 0.05 ? "start" : fx > 0.95 ? "end" : null,
          },
          label,
        ),
      ),
    );
  };

  const placeLive = () => {
    const on =
      range === "1d" && marketState()[0] !== "closed" && model.points.length;
    pulse.hidden = !on;
    if (!on) return;
    const i = model.points.length - 1;
    pulse.style.left = `${(model.xs[i] * 100).toFixed(3)}%`;
    pulse.style.top = `${((model.y(model.values[i]) / H) * 100).toFixed(3)}%`;
  };

  const draw = (data) => {
    model = build(data);
    section.dataset.dir = model.last >= model.reference ? "up" : "down";
    setD(line, model.line);
    setD(dim, model.line);
    setD(area, model.area);
    volume.setAttribute("d", model.vol);
    const [r0, r1] = model.regular;
    clipRect.setAttribute("x", (r0 * W).toFixed(1));
    clipRect.setAttribute("width", (Math.max(0, r1 - r0) * W).toFixed(1));
    const by = model.y(model.reference).toFixed(1);
    base.setAttribute("y1", by);
    base.setAttribute("y2", by);
    base.classList.toggle("on", model.showBase);
    renderAxes();
    placeLive();
    if (scrubIndex < 0) setReading(model.last, model.reference, restLabel());
    renderExt();
  };

  const xPct = (i) => `${(model.xs[i] * 100).toFixed(3)}%`;

  const stampOf = (t) =>
    range === "1d"
      ? at(t, clockOpts)
      : range === "5d" || range === "1mo"
        ? at(t, { month: "short", day: "numeric", ...clockOpts })
        : range === "5y" || range === "max"
          ? at(t, { month: "short", year: "numeric" })
          : at(t, { month: "short", day: "numeric", year: "numeric" });

  const shortStamp = (t) =>
    range === "1d"
      ? at(t, clockOpts)
      : range === "5d"
        ? at(t, { weekday: "short", ...clockOpts })
        : range === "5y" || range === "max"
          ? at(t, { month: "short", year: "numeric" })
          : at(t, { month: "short", day: "numeric" });

  const scrubTo = (i) => {
    if (!model?.points.length) return;
    scrubIndex = Math.max(0, Math.min(model.points.length - 1, i));
    const [t, v] = model.points[scrubIndex];
    const fx = model.xs[scrubIndex];
    section.classList.add("qt-scrubbing");
    cursor.style.left = xPct(scrubIndex);
    dot.style.left = xPct(scrubIndex);
    dot.style.top = `${((model.y(v) / H) * 100).toFixed(3)}%`;
    tip.style.left = xPct(scrubIndex);
    tip.dataset.edge = fx < 0.12 ? "start" : fx > 0.88 ? "end" : "";
    if (anchor >= 0 && anchor !== scrubIndex) {
      const a = Math.min(anchor, scrubIndex);
      const b = Math.max(anchor, scrubIndex);
      band.style.left = xPct(a);
      band.style.width = `${((model.xs[b] - model.xs[a]) * 100).toFixed(3)}%`;
      section.classList.add("qt-measuring");
      setReading(model.points[b][1], model.points[a][1], "");
      tip.textContent = `${shortStamp(model.points[a][0])} to ${shortStamp(model.points[b][0])}`;
      return;
    }
    section.classList.remove("qt-measuring");
    tip.textContent = stampOf(t);
    setReading(v, model.reference, "");
  };

  const endScrub = () => {
    anchor = -1;
    section.classList.remove("qt-measuring");
    if (scrubIndex < 0) return;
    scrubIndex = -1;
    section.classList.remove("qt-scrubbing");
    if (model) setReading(model.last, model.reference, restLabel());
  };

  const nearest = (fx) => {
    const xs = model.xs;
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < fx) lo = mid;
      else hi = mid;
    }
    return fx - xs[lo] <= xs[hi] - fx ? lo : hi;
  };

  const indexAt = (e) => {
    const r = stage.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    if (fx > model.xs.at(-1) + 0.04 && anchor < 0) return -1;
    return nearest(Math.max(0, Math.min(1, fx)));
  };

  stage.addEventListener("pointerdown", (e) => {
    if (!model?.points.length || e.pointerType === "touch" || e.button) return;
    const i = indexAt(e);
    if (i < 0) return;
    anchor = i;
    stage.setPointerCapture(e.pointerId);
    scrubTo(i);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!model?.points.length) return;
    const i = indexAt(e);
    if (i < 0) return endScrub();
    scrubTo(i);
  });
  stage.addEventListener("pointerup", () => {
    if (anchor < 0) return;
    anchor = -1;
    section.classList.remove("qt-measuring");
    if (scrubIndex >= 0) scrubTo(scrubIndex);
  });
  stage.addEventListener("pointerleave", () => anchor < 0 && endScrub());
  stage.addEventListener("pointercancel", endScrub);
  stage.addEventListener("blur", endScrub);
  stage.addEventListener("keydown", (e) => {
    if (!model?.points.length) return;
    const step = e.shiftKey ? 10 : 1;
    const from = scrubIndex < 0 ? model.points.length - 1 : scrubIndex;
    if (e.key === "ArrowLeft") scrubTo(from - step);
    else if (e.key === "ArrowRight") scrubTo(from + step);
    else if (e.key === "Home") scrubTo(0);
    else if (e.key === "End") scrubTo(model.points.length - 1);
    else if (e.key === "Escape") endScrub();
    else return;
    e.preventDefault();
  });

  const moveBar = (instant) => {
    const on = tabs[RANGES.findIndex(([k]) => k === range)];
    if (!on?.offsetWidth) return;
    bar.style.transition = instant ? "none" : "";
    bar.style.width = `${on.offsetWidth}px`;
    bar.style.translate = `${on.offsetLeft}px 0`;
  };

  const pick = async (key) => {
    if (key === range && !pending) return;
    range = key;
    for (const [i, t] of tabs.entries())
      t.setAttribute("aria-selected", String(RANGES[i][0] === key));
    moveBar();
    endScrub();
    pending?.abort();
    if (cache.has(key)) {
      pending = null;
      section.removeAttribute("aria-busy");
      return draw(cache.get(key));
    }
    const ctrl = new AbortController();
    pending = ctrl;
    section.setAttribute("aria-busy", "true");
    try {
      const r = await fetch(
        `/q?s=${encodeURIComponent(today.symbol)}&r=${key}`,
        { signal: ctrl.signal },
      );
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (!data.points?.length) throw new Error();
      cache.set(key, data);
      if (range === key) draw(data);
    } catch {
    } finally {
      if (pending === ctrl) {
        pending = null;
        section.removeAttribute("aria-busy");
      }
    }
  };

  renderSub();
  renderStatus();
  renderStats();
  draw(today);
  if (!isFx)
    fetch(`/qx?s=${encodeURIComponent(today.symbol)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => {
        if (!x || !Object.values(x).some((v) => v != null)) return;
        today.extra = x;
        renderSub();
        stats.animate([{ opacity: 0.4 }, { opacity: 1 }], {
          duration: 240,
          easing: EASE,
        });
        renderStats();
      })
      .catch(() => {});
  requestAnimationFrame(() => moveBar(true));
  new ResizeObserver(() => moveBar(true)).observe(tablist);

  if (!still()) {
    chart.animate(
      [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
      { duration: 900, easing: EASE },
    );
    const groups = [
      [top, reading],
      [xaxis, yaxis, tablist],
      [stats, foot],
    ];
    for (const [g, els] of groups.entries())
      for (const el of els)
        el.animate(
          [
            { opacity: 0, transform: "translateY(6px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 420, delay: g * 70, easing: EASE, fill: "backwards" },
        );
  }

  const timer = setInterval(async () => {
    if (!section.isConnected) return clearInterval(timer);
    renderStatus();
    placeLive();
    if (document.visibilityState !== "visible") return;
    if (marketState()[0] === "closed") return;
    try {
      const r = await fetch(`/q?s=${encodeURIComponent(today.symbol)}&r=1d`);
      if (!r.ok) return;
      const data = await r.json();
      if (!data.points?.length) return;
      Object.assign(today, data, { extra: data.extra || today.extra });
      cache.set("1d", today);
      renderStatus();
      renderStats();
      if (range === "1d") draw(today);
    } catch {}
  }, 30000);
}
