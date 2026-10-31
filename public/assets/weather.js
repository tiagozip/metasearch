import { TextMorph } from "/s/torph.js";

const h = (tag, attrs, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
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

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SPRING = `linear(${Array.from({ length: 41 }, (_, i) => {
  const t = (i / 40) * 9.23;
  return (1 - (1 + t) * Math.exp(-t)).toFixed(4);
}).join(", ")}, 1)`;
const STEP = 3;
const CHART = { width: 1000, height: 120, top: 28 };
const WIND = { top: 30, bottom: 140, height: 144 };
const METRICS = ["temperature", "precipitation", "wind"];
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const cssD = CSS.supports?.("d", 'path("M0 0")');

const setD = (path, d) => {
  if (cssD) path.style.d = `path("${d}")`;
  else path.setAttribute("d", d);
};

const morph = (el, opts) =>
  new TextMorph({
    element: el,
    duration: 320,
    ease: EASE,
    scale: false,
    ...opts,
  });

const LABELS = {
  0: "clear",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "fog",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  56: "freezing drizzle",
  57: "freezing drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  66: "freezing rain",
  67: "freezing rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  77: "snow grains",
  80: "light showers",
  81: "showers",
  82: "heavy showers",
  85: "snow showers",
  86: "snow showers",
  95: "thunderstorm",
  96: "thunderstorm with hail",
  99: "thunderstorm with hail",
};

const iconFor = (code, day = true, wind = 0) => {
  if (code <= 3 && wind >= 40) return "wind";
  if (code <= 1) return day ? "sun" : "moon";
  if (code === 2) return day ? "sun-cloud" : "moon-cloud";
  if (code === 3) return "cloud";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67 || (code >= 80 && code <= 82)) return "rain";
  if (code <= 86) return "snow";
  return "storm";
};

const labelFor = (code, day = true) =>
  code <= 1 && day ? "sunny" : LABELS[code] || "";

const fromOwm = (id = 800) => {
  if (id < 300) return 95;
  if (id < 400) return 53;
  if (id === 500) return 61;
  if (id === 501) return 63;
  if (id < 520) return 65;
  if (id < 600) return 81;
  if (id < 700) return 73;
  if (id < 800) return 45;
  if (id === 800) return 0;
  if (id <= 802) return 2;
  return 3;
};

const readUnit = () => {
  try {
    const saved = localStorage.getItem("ms-wunit");
    if (saved === "F" || saved === "C") return saved;
  } catch {}
  return /^en-(us|lr)$|^my\b/i.test(navigator.language || "") ? "F" : "C";
};

const toTemp = (c, unit) => Math.round(unit === "F" ? (c * 9) / 5 + 32 : c);
const toSpeed = (kmh, unit) => Math.round(unit === "F" ? kmh / 1.609 : kmh);
const speedUnit = (unit) => (unit === "F" ? "mph" : "km/h");

const hourCycle = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
}).resolvedOptions().hourCycle;
const at = (t, opts) =>
  new Intl.DateTimeFormat("en", { ...opts, hourCycle, timeZone: "UTC" })
    .format(new Date(`${t.length > 10 ? t : `${t}T12:00`}:00Z`))
    .toLowerCase();
const hourLabel = (t) => at(t, { hour: "numeric" });

const smooth = (points) => {
  if (!points.length) return "";
  let path = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const before = points[i - 1] ?? points[i];
    const [fx, fy] = points[i];
    const [tx, ty] = points[i + 1];
    const after = points[i + 2] ?? points[i + 1];
    path += `C${fx + (tx - before[0]) / 6} ${fy + (ty - before[1]) / 6} ${tx - (after[0] - fx) / 6} ${ty - (after[1] - fy) / 6} ${tx} ${ty}`;
  }
  return path;
};

const RAYS = (cx, cy, r0, r1) =>
  Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const p = (r) =>
      `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
    return `M${p(r0)}L${p(r1)}`;
  }).join("");
const CLOUD =
  "M6.66 18C4.08 18 2 15.99 2 13.52s2.09-4.49 4.66-4.49c.39-1.76 1.79-3.2 3.68-3.77 1.88-.57 3.96-.19 5.44 1 1.49 1.19 2.16 3.01 1.77 4.77h.99c1.91 0 3.46 1.56 3.46 3.49S20.45 18 18.54 18z";
const MOON = "M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9z";
const parts = {
  sun: `<circle class="i-sun" cx="12" cy="12" r="4"/><path class="i-sun" d="${RAYS(12, 12, 6.5, 9)}"/>`,
  moon: `<path class="i-moon" d="${MOON}"/>`,
  smallSun: `<circle class="i-sun" cx="8.5" cy="8" r="3"/><path class="i-sun" d="${RAYS(8.5, 8, 4.8, 6.6)}"/>`,
  smallMoon: `<path class="i-moon" d="${MOON}" transform="translate(1.5 1) scale(0.55)"/>`,
  lowCloud: `<path class="i-cloud" d="${CLOUD}" transform="translate(3 3.6) scale(0.85)"/>`,
  cloud: `<path class="i-cloud" d="${CLOUD}"/>`,
  highCloud: `<path class="i-cloud" d="${CLOUD}" transform="translate(0 -3)"/>`,
};
const ICONS = {
  sun: parts.sun,
  moon: parts.moon,
  "sun-cloud": parts.smallSun + parts.lowCloud,
  "moon-cloud": parts.smallMoon + parts.lowCloud,
  cloud: parts.cloud,
  fog: `${parts.highCloud}<path class="i-fog" d="M5 18.5h14M7 21.5h10"/>`,
  drizzle: `${parts.highCloud}<path class="i-rain" d="M9 18v1M15 18v1M12 20.5v1"/>`,
  rain: `${parts.highCloud}<path class="i-rain" d="M8 17.5l-1 3.5M12.5 17.5l-1 3.5M17 17.5l-1 3.5"/>`,
  snow: `${parts.highCloud}<path class="i-snow" d="M8 18.5v.01M12 18.5v.01M16 18.5v.01M10 21.5v.01M14 21.5v.01"/>`,
  storm: `${parts.highCloud}<path class="i-bolt" d="M13 15l-2.5 3.5h3L11 22"/>`,
  wind: '<path class="i-wind" d="M5 8h8.5a2.5 2.5 0 1 0-2.5-2.5M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5M4 16h5"/>',
};

const glyph = (name, cls) =>
  h("span", {
    class: `wx-glyph ${cls}`,
    "aria-hidden": "true",
    html: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`,
  });

const ARROW = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.5v-11M4 6.5l4-4 4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const place = (loc) => {
  const region = loc?.state && loc.state !== loc.name ? loc.state : null;
  return [loc?.name, region || loc?.country].filter(Boolean).join(", ");
};

const fromBrave = (w) => {
  const cw = w.current_weather || {};
  return {
    now: {
      t: null,
      temp: cw.temp,
      hum: cw.humidity,
      code: fromOwm(cw.weather?.id),
      day: /d$/.test(cw.weather?.icon || "d"),
      wind: (cw.wind?.speed ?? 0) * 3.6,
    },
    hours: [],
    days: (w.daily || []).map((d) => ({
      t: new Date(d.ts * 1000).toISOString().slice(0, 10),
      code: fromOwm(d.weather?.id),
      hi: d.temperature?.max ?? d.temperature?.day,
      lo: d.temperature?.min ?? d.temperature?.night,
    })),
  };
};

const load = async (loc) => {
  if (loc?.lat == null || loc?.lon == null) throw new Error("no coords");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`/wx?lat=${loc.lat}&lon=${loc.lon}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("wx failed");
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

const enter = (el, frames, duration, easing = EASE) => {
  if (!still()) el.animate(frames, { duration, easing });
};

const leave = (el, frames, duration) => {
  if (still()) return el.remove();
  el.style.pointerEvents = "none";
  el.animate(frames, {
    duration,
    easing: EASE,
    fill: "forwards",
  }).finished.then(
    () => el.remove(),
    () => el.remove(),
  );
};

export async function fillWeather(section, w) {
  const data = await load(w.location).catch((e) => {
    if (!w.current_weather) throw e;
    return fromBrave(w);
  });
  const state = {
    unit: readUnit(),
    metric: "temperature",
    day: 0,
    picked: null,
  };

  const nowIndex = data.hours.findIndex(
    (x) => x.t.slice(0, 13) === data.now.t?.slice(0, 13),
  );
  const charted = data.hours.length >= 24 && nowIndex >= 0;
  const hoursFor = (i) =>
    i === 0
      ? data.hours.slice(nowIndex, nowIndex + 24)
      : data.hours.filter((x) => x.t.startsWith(data.days[i].t));
  const shown = () => hoursFor(state.day);

  const current = () => {
    const hour = state.picked == null ? null : shown()[state.picked];
    if (hour)
      return {
        ...hour,
        time: `${at(hour.t, { weekday: "long" })} ${hourLabel(hour.t)}`,
      };
    return {
      ...data.now,
      pop: data.hours[nowIndex]?.pop,
      time: data.now.t
        ? `${at(data.now.t, { weekday: "long" })} ${at(data.now.t, { hour: "numeric", minute: "2-digit" })}`
        : "",
    };
  };

  const iconBox = h("div", { class: "wx-icon", role: "img" });
  const temp = h("span", { class: "wx-temp", dir: "ltr" });
  const tempMorph = morph(temp, { numbers: true });
  const unitBtns = ["F", "C"].map((u) => {
    const label = h("span");
    const b = h(
      "button",
      {
        type: "button",
        class: "wx-unit",
        onclick: () => {
          if (state.unit === u) return;
          state.unit = u;
          try {
            localStorage.setItem("ms-wunit", u);
          } catch {}
          update();
        },
      },
      label,
    );
    b.morph = morph(label);
    return b;
  });
  const when = h("p", { class: "wx-when" });

  const head = h(
    "div",
    { class: "wx-head" },
    h(
      "div",
      { class: "wx-now" },
      iconBox,
      h(
        "div",
        { class: "wx-reading" },
        temp,
        h(
          "div",
          { class: "wx-units", role: "group", "aria-label": "unit" },
          unitBtns[0],
          h("span", { class: "wx-unit-sep", "aria-hidden": "true" }),
          unitBtns[1],
        ),
      ),
    ),
    h(
      "div",
      { class: "wx-meta" },
      h("p", { class: "wx-place" }, place(w.location)),
      when,
    ),
  );

  const statKeys = ["precipitation", "humidity", "wind"];
  const statVals = statKeys.map(() => h("dd"));
  const statMorphs = statVals.map((el) => morph(el, { numbers: true }));
  const statRows = statKeys.map((k, i) =>
    h("div", null, h("dt", null, k), statVals[i]),
  );
  const stats = h("dl", { class: "wx-stats" }, statRows);

  const tabBar = h("span", { class: "wx-tab-bar", "aria-hidden": "true" });
  const tabs = METRICS.map((m) => {
    const active = h("span", { class: "wx-tab-on", "aria-hidden": "true" }, m);
    const b = h(
      "button",
      {
        type: "button",
        role: "tab",
        class: "wx-tab",
        onclick: () => setMetric(m),
      },
      h("span", { class: "wx-tab-label" }, h("span", null, m), active),
    );
    b.active = active;
    b.label = active.parentNode;
    if (m !== "temperature") {
      const val = h("span", { class: "wx-tab-val" });
      b.append(val);
      b.val = morph(val, { numbers: true });
    }
    return b;
  });
  const tablist = h(
    "div",
    { class: "wx-tabs", role: "tablist", "aria-label": "chart" },
    tabBar,
    tabs,
  );

  const stage = h("div", { class: "wx-stage" });
  const axis = h("div", { class: "wx-axis" });

  const dayPill = h("span", { class: "wx-day-pill", "aria-hidden": "true" });
  const dayBtns = data.days.map((d, i) => {
    const hi = h("span");
    const lo = h("span", { class: "wx-lo" });
    const b = h(
      "button",
      {
        type: "button",
        role: "radio",
        class: "wx-day",
        disabled: !charted || null,
        onclick: () => pickDay(i),
      },
      h(
        "span",
        { class: "wx-day-in" },
        h("span", null, i === 0 ? "today" : at(d.t, { weekday: "short" })),
        glyph(iconFor(d.code), "wx-day-icon"),
        h("span", { class: "wx-day-temps" }, hi, lo),
      ),
    );
    b.hi = hi;
    b.lo = lo;
    return b;
  });
  const days = h(
    "div",
    { class: "wx-days", role: "radiogroup", "aria-label": "day" },
    dayPill,
    dayBtns,
  );

  const valueChart = (metric) => {
    const el = h("div", { class: "wx-chart" });
    const area = svg("path", { class: "wx-area" });
    const line = svg("path", {
      class: "wx-line",
      "vector-effect": "non-scaling-stroke",
    });
    const plot = svg("svg", {
      viewBox: `0 0 ${CHART.width} ${CHART.height}`,
      preserveAspectRatio: "none",
      "aria-hidden": "true",
    });
    plot.append(area, line);
    el.append(plot);
    let labels = [];
    return {
      el,
      update() {
        const hours = shown();
        const temps = metric === "temperature";
        const values = hours.map((x) =>
          temps ? toTemp(x.temp, state.unit) : x.pop,
        );
        const min = temps ? Math.min(...values) - 4 : 0;
        const max = temps ? Math.max(...values) + 2 : 100;
        const xOf = (i) => (i / Math.max(1, hours.length - 1)) * CHART.width;
        const yOf = (v) =>
          CHART.top +
          (1 - (v - min) / Math.max(1, max - min)) * (CHART.height - CHART.top);
        const d = smooth(values.map((v, i) => [xOf(i), yOf(v)]));
        setD(area, `${d}L${CHART.width} ${CHART.height}L0 ${CHART.height}Z`);
        setD(line, d);

        const marks = [...hours.keys()].filter((i) => i % STEP === 0);
        if (labels.length !== marks.length) {
          for (const l of labels) l.remove();
          labels = marks.map(() => {
            const text = h("span");
            const b = h(
              "button",
              {
                type: "button",
                class: "wx-value",
                onclick: () => pick(b.index),
              },
              text,
            );
            b.morph = morph(text, { numbers: true, duration: 400 });
            el.append(b);
            return b;
          });
        }
        marks.forEach((i, n) => {
          const b = labels[n];
          const v = values[i];
          b.index = i;
          b.className = `wx-value${i === 0 ? " first" : ""}${i % 6 ? " odd" : ""}`;
          b.style.left = `${(xOf(i) / CHART.width) * 100}%`;
          b.style.top = `${yOf(v) - 22}px`;
          b.setAttribute("aria-pressed", String(i === (state.picked ?? 0)));
          b.setAttribute(
            "aria-label",
            `${hourLabel(hours[i].t)}: ${temps ? `${v}°` : `${v}% chance of rain`}`,
          );
          b.morph.update(temps ? String(v) : `${v}%`);
        });
      },
    };
  };

  const windChart = () => {
    const el = h("div", { class: "wx-chart wind" });
    const plot = h("div", { class: "wx-plot" });
    const area = svg("path", { class: "wx-area" });
    const gust = svg("path", {
      class: "wx-line gust",
      "vector-effect": "non-scaling-stroke",
    });
    const line = svg("path", {
      class: "wx-line",
      "vector-effect": "non-scaling-stroke",
    });
    const s = svg("svg", {
      viewBox: `0 0 ${CHART.width} ${WIND.height}`,
      preserveAspectRatio: "none",
      "aria-hidden": "true",
    });
    s.append(area, gust, line);
    const dot = h("span", { class: "wx-dot", "aria-hidden": "true" });
    plot.append(s, dot);
    el.append(plot);
    const ticks = new Map();
    let arrows = [];
    return {
      el,
      update() {
        const hours = shown();
        const speeds = hours.map((x) => toSpeed(x.wind, state.unit));
        const gusts = hours.map((x) => toSpeed(x.gust, state.unit));
        const peak = Math.max(1, ...speeds, ...gusts);
        const step = peak <= 20 ? 5 : peak <= 40 ? 10 : 20;
        const ceiling = Math.ceil(peak / step) * step;
        const xOf = (i) => (i / Math.max(1, hours.length - 1)) * CHART.width;
        const yOf = (v) =>
          WIND.bottom - (v / ceiling) * (WIND.bottom - WIND.top);
        const pathOf = (vals) => smooth(vals.map((v, i) => [xOf(i), yOf(v)]));
        const d = pathOf(speeds);
        setD(area, `${d}L${CHART.width} ${WIND.bottom}L0 ${WIND.bottom}Z`);
        setD(gust, pathOf(gusts));
        setD(line, d);

        const wanted = new Set();
        for (let t = 0; t <= ceiling; t += step) {
          wanted.add(t);
          const top = `${yOf(t)}px`;
          const old = ticks.get(t);
          if (old) {
            old.style.top = top;
            continue;
          }
          const tick = h(
            "div",
            { class: "wx-tick", style: `top:${top}` },
            h("span", null, String(t)),
          );
          el.prepend(tick);
          ticks.set(t, tick);
          enter(tick, [{ opacity: 0 }, { opacity: 1 }], 500, SPRING);
        }
        for (const [t, tick] of ticks) {
          if (wanted.has(t)) continue;
          ticks.delete(t);
          leave(tick, [{ opacity: 1 }, { opacity: 0 }], 300);
        }

        const sel = Math.min(state.picked ?? 0, hours.length - 1);
        dot.className = `wx-dot${sel === 0 ? " first" : sel === hours.length - 1 ? " last" : ""}`;
        dot.style.left = `${(xOf(sel) / CHART.width) * 100}%`;
        dot.style.top = `${yOf(speeds[sel] ?? 0)}px`;

        const marks = [...hours.keys()].filter((i) => i % STEP === 0);
        if (arrows.length !== marks.length) {
          for (const a of arrows) a.remove();
          arrows = marks.map(() => {
            const b = h("button", {
              type: "button",
              class: "wx-arrow",
              html: ARROW,
              onclick: () => pick(b.index),
            });
            plot.append(b);
            return b;
          });
        }
        marks.forEach((i, n) => {
          const b = arrows[n];
          const x = hours[i];
          b.index = i;
          b.className = `wx-arrow${i === 0 ? " first" : ""}${i % 6 ? " odd" : ""}`;
          b.style.left = `${(xOf(i) / CHART.width) * 100}%`;
          b.style.setProperty("--dir", `${(x.dir + 180) % 360}deg`);
          b.setAttribute("aria-pressed", String(i === (state.picked ?? 0)));
          b.setAttribute(
            "aria-label",
            `${hourLabel(x.t)}: ${speeds[i]} ${speedUnit(state.unit)}, gusts ${gusts[i]} ${speedUnit(state.unit)}`,
          );
        });
      },
    };
  };

  const charts = {};
  let shownChart = null;

  const drawChart = (dir = 0) => {
    if (!charted) return;
    charts[state.metric] ??=
      state.metric === "wind" ? windChart() : valueChart(state.metric);
    const next = charts[state.metric];
    const prev = shownChart;
    shownChart = next;
    if (prev === next) return next.update();
    for (const m of METRICS) if (m !== state.metric) delete charts[m];
    if (prev)
      leave(
        prev.el,
        [
          { translate: "0 0", opacity: 1, filter: "blur(0)" },
          { translate: `${dir * -24}px 0`, opacity: 0, filter: "blur(3px)" },
        ],
        200,
      );
    stage.append(next.el);
    next.update();
    if (prev)
      enter(
        next.el,
        [
          { translate: `${dir * 24}px 0`, opacity: 0, filter: "blur(3px)" },
          { translate: "0 0", opacity: 1, filter: "blur(0)" },
        ],
        250,
      );
  };

  const drawAxis = () => {
    const hours = shown();
    axis.classList.toggle("wind", state.metric === "wind");
    axis.replaceChildren(
      ...hours.flatMap((x, i) =>
        i % STEP
          ? []
          : [
              h(
                "span",
                {
                  class: `${i === 0 ? "first" : ""}${i % 6 ? " odd" : ""}`,
                  style: `left:${(i / Math.max(1, hours.length - 1)) * 100}%`,
                },
                hourLabel(x.t),
              ),
            ],
      ),
    );
  };

  let iconName = "";
  const drawHead = () => {
    const c = current();
    const { unit, metric } = state;
    const name = iconFor(c.code, c.day, c.wind);
    iconBox.setAttribute("aria-label", labelFor(c.code, c.day));
    iconBox.title = labelFor(c.code, c.day);
    if (name !== iconName) {
      const prev = iconBox.lastElementChild;
      const next = glyph(name, "wx-icon-glyph");
      iconBox.append(next);
      if (prev) {
        leave(
          prev,
          [
            { opacity: 1, scale: 1, filter: "blur(0)" },
            { opacity: 0, scale: 0.9, filter: "blur(4px)" },
          ],
          250,
        );
        enter(
          next,
          [
            { opacity: 0, scale: 0.9, filter: "blur(4px)" },
            { opacity: 1, scale: 1, filter: "blur(0)" },
          ],
          400,
          SPRING,
        );
      }
      iconName = name;
    }
    tempMorph.update(
      String(metric === "wind" ? toSpeed(c.wind, unit) : toTemp(c.temp, unit)),
    );
    unitBtns.forEach((b, i) => {
      const u = i ? "C" : "F";
      b.morph.update(metric === "wind" ? speedUnit(u) : `°${u}`);
      b.setAttribute("aria-pressed", String(unit === u));
    });
    const values = [
      c.pop == null ? null : `${c.pop}%`,
      c.hum == null ? null : `${Math.round(c.hum)}%`,
      `${toSpeed(c.wind, unit)} ${speedUnit(unit)}`,
    ];
    values.forEach((v, i) => {
      statRows[i].hidden = v == null || (charted && i !== 1);
      if (v != null) statMorphs[i].update(v);
    });
    if (values[0] != null) tabs[1].val.update(values[0]);
    tabs[2].val.update(values[2]);
    when.textContent = c.time;
    when.hidden = !c.time;
  };

  const drawTabs = () => {
    const i = METRICS.indexOf(state.metric);
    const b = tabs[i];
    const x = b.offsetLeft;
    const width = b.offsetWidth;
    tabBar.style.width = `${width}px`;
    tabBar.style.transform = `translateX(${x}px)`;
    for (const [n, t] of tabs.entries()) {
      t.setAttribute("aria-selected", String(n === i));
      const left = t.offsetLeft + t.label.offsetLeft;
      t.active.style.clipPath = `inset(0 ${left + t.label.offsetWidth - (x + width)}px 0 ${x - left}px)`;
    }
  };

  const drawDays = () => {
    const { unit } = state;
    dayBtns.forEach((b, i) => {
      const d = data.days[i];
      b.setAttribute("aria-checked", String(i === state.day));
      b.setAttribute(
        "aria-label",
        `${at(d.t, { weekday: "long" })}, ${labelFor(d.code)}, high ${toTemp(d.hi, unit)}°, low ${toTemp(d.lo, unit)}°`,
      );
      b.hi.textContent = `${toTemp(d.hi, unit)}°`;
      b.lo.textContent = `${toTemp(d.lo, unit)}°`;
    });
    const b = dayBtns[state.day];
    if (!b || !charted) return;
    dayPill.style.width = `${b.offsetWidth}px`;
    dayPill.style.transform = `translateX(${b.offsetLeft}px)`;
  };

  const update = () => {
    drawHead();
    drawChart();
    drawAxis();
    drawDays();
  };

  const setMetric = (m) => {
    if (m === state.metric) return;
    const dir = Math.sign(METRICS.indexOf(m) - METRICS.indexOf(state.metric));
    state.metric = m;
    drawHead();
    drawChart(dir);
    drawAxis();
    drawTabs();
  };

  const pick = (i) => {
    state.picked = i;
    drawHead();
    drawChart();
  };

  const pickDay = (i) => {
    if (i === state.day) return;
    state.day = i;
    state.picked =
      i === 0 ? null : Math.round(hoursFor(i).length / 2 / STEP) * STEP;
    update();
  };

  section.replaceChildren(head);
  const row = h("div", { class: "wx-row" }, charted && tablist, stats);
  section.append(
    charted ? h("div", { class: "wx-body" }, row, stage, axis) : row,
  );
  if (data.days.length) section.append(h("hr", { class: "wx-sep" }), days);

  if (w.alerts?.length)
    section.append(
      h(
        "div",
        { class: "rich-weather-alerts" },
        w.alerts
          .slice(0, 2)
          .map((a) =>
            h(
              "div",
              { class: "rich-weather-alert" },
              h("span", { class: "rich-weather-alert-title" }, a.event),
              h(
                "span",
                { class: "rich-weather-alert-time" },
                a.start_relative_i18n || "",
              ),
            ),
          ),
      ),
    );

  section.style.setProperty("--wx-spring", SPRING);
  section.classList.add("ready");
  update();
  const relayout = () => {
    section.classList.remove("settled");
    drawTabs();
    drawDays();
    section.offsetWidth;
    section.classList.add("settled");
  };
  relayout();
  document.fonts?.ready.then(relayout);
  let width = section.offsetWidth;
  new ResizeObserver(() => {
    if (section.offsetWidth === width) return;
    width = section.offsetWidth;
    relayout();
  }).observe(section);
}
