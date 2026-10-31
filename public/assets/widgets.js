import {
  convertFile,
  extOf,
  humanSize,
  kindOf,
  outExtFor,
  parseConvertQuery,
  targetsFor,
} from "./convert.js";
import { currencyLabel, parseCurrencyQuery, sortCodes } from "./currency.js";
import {
  browserTargetLang,
  codeForName,
  langByCode,
  makeLangPicker,
  requestTranslation,
  speakButton,
} from "./langs.js";

const h = (tag, props, ...kids) => {
  const el = document.createElement(tag);
  if (props)
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "style" && typeof v === "object")
        Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function")
        el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v);
    }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
};

const card = (title, sub, ...body) => {
  const head = title
    ? h(
        "div",
        { class: "w-head" },
        h("div", { class: "w-title" }, title),
        sub && h("div", { class: "w-sub" }, sub),
      )
    : null;
  return h(
    "section",
    { class: "rich-result w" },
    head,
    h("div", { class: "w-body" }, ...body),
  );
};

const CHECK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10"/></svg>`;
const COPY = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/></svg>`;

const copyBtn = (getText, title = "copy") => {
  const b = h("button", {
    type: "button",
    class: "w-copy",
    title,
    "aria-label": title,
    html: `<span class="w-copy-ic w-copy-idle">${COPY}</span><span class="w-copy-ic w-copy-ok">${CHECK}</span>`,
  });
  let t;
  b.onclick = () => {
    navigator.clipboard?.writeText(getText()).catch(() => {});
    b.classList.add("done");
    clearTimeout(t);
    t = setTimeout(() => b.classList.remove("done"), 1400);
  };
  return b;
};

const calmMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const swapIn = (el, text) => {
  if (text != null) el.textContent = text;
  if (!el.isConnected) return;
  el.classList.remove("w-swap");
  void el.offsetWidth;
  el.classList.add("w-swap");
};

const segmented = (label, opts, value, onchange) => {
  const pairs = opts.map((o) => (Array.isArray(o) ? o : [o, o]));
  const wrap = h("div", {
    class: "w-seg",
    role: "radiogroup",
    "aria-label": label,
  });
  wrap.style.setProperty("--n", pairs.length);
  const btns = pairs.map(([v, text]) =>
    h(
      "button",
      { class: "w-seg-opt", type: "button", role: "radio", value: v },
      text,
    ),
  );
  const thumb = h("span", { class: "w-seg-thumb", "aria-hidden": "true" });
  let cur = 0;
  const place = () => {
    const b = btns[cur];
    if (!b.offsetWidth) return;
    thumb.style.setProperty("--x", `${b.offsetLeft}px`);
    thumb.style.setProperty("--w", `${b.offsetWidth}px`);
    if (!wrap.dataset.ready)
      requestAnimationFrame(() => {
        wrap.dataset.ready = "";
      });
  };
  const pick = (i) => {
    cur = i;
    wrap.value = pairs[i][0];
    btns.forEach((b, j) => {
      b.setAttribute("aria-checked", String(i === j));
      b.tabIndex = i === j ? 0 : -1;
    });
    place();
  };
  new ResizeObserver(place).observe(wrap);
  btns.forEach((b, i) => {
    b.onclick = () => {
      if (wrap.value === pairs[i][0]) return;
      pick(i);
      onchange(pairs[i][0]);
    };
    b.onkeydown = (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
        e.key
      ];
      if (!step) return;
      e.preventDefault();
      const next = (i + step + btns.length) % btns.length;
      btns[next].focus();
      btns[next].click();
    };
  });
  pick(
    Math.max(
      0,
      pairs.findIndex(([v]) => v === value),
    ),
  );
  wrap.append(thumb, ...btns);
  return wrap;
};

const slider = ({ value, ...props }) => {
  const el = h("input", {
    ...props,
    type: "range",
    class: `w-range ${props.class ?? ""}`.trim(),
  });
  el.value = value;
  const set = () =>
    el.style.setProperty("--p", (el.value - el.min) / (el.max - el.min));
  set();
  el.addEventListener("input", set);
  return el;
};

const sliderField = (label, input, ...val) =>
  h(
    "label",
    { class: "w-slider-field" },
    h(
      "span",
      { class: "w-slider-head" },
      h("span", null, label),
      val.length > 0 && h("output", { class: "w-slider-val" }, ...val),
    ),
    input,
  );

const kvList = (rows, cls) =>
  h(
    "dl",
    { class: cls ? `w-kv ${cls}` : "w-kv" },
    rows.map(([label, value, { mono, copy } = {}]) =>
      h(
        "div",
        { class: "w-kv-row" },
        h("dt", null, label),
        h("dd", { class: mono ? "w-mono" : null }, value),
        copy &&
          copyBtn(
            typeof copy === "function" ? copy : () => String(value),
            `copy ${label}`,
          ),
      ),
    ),
  );

let _ac;
const audio = () => {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  if (_ac.state === "suspended") _ac.resume();
  return _ac;
};
const noteFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);

const hexToRgb = (hex) => {
  let m = hex.replace("#", "");
  if (m.length === 3) m = [...m].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(m)) return null;
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
};
const rgbToHex = (r, g, b) =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const rgbToHsl = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  let hh,
    s,
    l = (mx + mn) / 2;
  if (mx === mn) hh = s = 0;
  else {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) hh = ((b - r) / d + 2) / 6;
    else hh = ((r - g) / d + 4) / 6;
  }
  return {
    h: Math.round(hh * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};
const luminance = ({ r, g, b }) => {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};

const loadScript = (src) =>
  new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.append(s);
  });

let _hl;
const highlightInto = async (el, code) => {
  el.textContent = code;
  try {
    if (!_hl) _hl = (await import("/s/sugar-high.js")).highlight;
    if (el.isConnected) el.innerHTML = _hl(code);
  } catch {}
};

const widgets = [];
const reg = (w) => widgets.push(w);

reg({
  id: "qr",
  match: (q) => {
    const m = q.match(
      /^(?:qr(?:\s*code)?|qrcode)(?:\s+(?:for|of)\b)?\s*(.*)$/i,
    );
    if (!m) return null;
    if (/^qr$/i.test(q.trim())) return { text: "" };
    return { text: m[1].trim() };
  },
  build: ({ text }) => {
    const input = h("textarea", {
      class: "w-textarea w-qr-input",
      rows: "3",
      placeholder: "https://example.com",
      spellcheck: "false",
      value: text,
    });
    const canvas = h("canvas", {
      class: "w-qr-canvas",
      role: "img",
      "aria-label": "qr code",
    });
    const meta = h("div", { class: "w-qr-meta", role: "status" });
    const dl = h("button", {
      type: "button",
      class: "w-btn primary",
      html: "download",
    });
    const copyImg = h("button", {
      type: "button",
      class: "w-btn",
      html: "copy image",
    });
    const wrap = h("div", { class: "w-qr-wrap" }, canvas);
    let ok = false;
    const draw = async () => {
      const t = input.value.trim();
      if (!window.qrcode) await loadScript("/s/qrcode.js");
      const qr = window.qrcode(0, "M");
      try {
        qr.addData(t || " ");
        qr.make();
      } catch {
        ok = false;
        wrap.classList.add("empty");
        meta.classList.add("err");
        meta.textContent = "too long for a qr code, try under 2,000 characters";
        dl.disabled = copyImg.disabled = true;
        return;
      }
      ok = !!t;
      wrap.classList.toggle("empty", !ok);
      meta.classList.remove("err");
      dl.disabled = copyImg.disabled = !ok;
      const n = qr.getModuleCount();
      meta.textContent = ok
        ? `${t.length} ${t.length === 1 ? "character" : "characters"}, ${n}×${n} modules`
        : "type something to encode";
      const scale = 8;
      const pad = 4;
      const size = (n + pad * 2) * scale;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#11111b";
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (qr.isDark(r, c))
            ctx.fillRect((c + pad) * scale, (r + pad) * scale, scale, scale);
    };
    let t;
    input.oninput = () => {
      clearTimeout(t);
      t = setTimeout(draw, 120);
    };
    dl.onclick = () => {
      if (!ok) return;
      const a = h("a", {
        href: canvas.toDataURL("image/png"),
        download: "qrcode.png",
      });
      document.body.append(a);
      a.click();
      a.remove();
    };
    let copied;
    copyImg.onclick = () => {
      if (!ok) return;
      canvas.toBlob((blob) => {
        navigator.clipboard
          ?.write([new ClipboardItem({ "image/png": blob })])
          .then(() => {
            copyImg.textContent = "copied";
            clearTimeout(copied);
            copied = setTimeout(() => {
              copyImg.textContent = "copy image";
            }, 1400);
          })
          .catch(() => {
            copyImg.textContent = "copy failed";
          });
      });
    };
    if (!window.ClipboardItem) copyImg.hidden = true;
    draw();
    return card(
      "qr code",
      null,
      h(
        "div",
        { class: "w-qr" },
        wrap,
        h(
          "div",
          { class: "w-qr-side" },
          h(
            "label",
            { class: "w-qr-field" },
            h("span", { class: "w-qr-label" }, "text or link"),
            input,
          ),
          meta,
          h("div", { class: "w-btn-row w-qr-actions" }, dl, copyImg),
        ),
      ),
    );
  },
});

reg({
  id: "password",
  match: (q) =>
    /^(?:(?:random|secure|strong)\s+)?password(?:\s+(?:generator|gen|maker))?$|^(?:generate|create)\s+(?:a\s+)?password$|^passgen$/i.test(
      q.trim(),
    ),
  build: () => {
    const out = h("div", { class: "w-mono w-pw-out" });
    const lenVal = h("span", null, "16");
    const len = slider({
      min: "4",
      max: "64",
      value: "16",
    });
    const sets = [
      ["lower", "lowercase", "abcdefghijklmnopqrstuvwxyz"],
      ["upper", "uppercase", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
      ["digits", "numbers", "0123456789"],
      ["symbols", "symbols", "!@#$%^&*()-_=+[]{};:,.<>?"],
    ];
    const boxes = Object.fromEntries(
      sets.map(([k]) => [k, h("input", { type: "checkbox", checked: "" })]),
    );
    const plain = h("input", { type: "checkbox" });
    const ambiguous = /[Il1O0o]/g;
    const strengthBar = h("div", { class: "w-strength-bar" });
    const strengthWord = h("span", { class: "w-strength-label" });
    const strengthBits = h("span", { class: "w-strength-bits" });
    let scramble;
    let current = "";
    const gen = (animate) => {
      let pool = sets
        .filter(([k]) => boxes[k].checked)
        .map(([, , chars]) => chars)
        .join("");
      if (plain.checked) pool = pool.replace(ambiguous, "");
      const n = +len.value;
      const arr = new Uint32Array(n);
      crypto.getRandomValues(arr);
      const pw = [...arr].map((x) => pool[x % pool.length]).join("");
      cancelAnimationFrame(scramble);
      current = pw;
      out.textContent = pw;
      if (animate === true && !calmMotion()) {
        const noise = () => pool[Math.floor(Math.random() * pool.length)];
        let start;
        const step = (t) => {
          start ??= t;
          const settled = Math.floor(((t - start) / 240) * n);
          if (settled >= n || !out.isConnected) {
            out.textContent = pw;
            return;
          }
          out.textContent =
            pw.slice(0, settled) + [...pw.slice(settled)].map(noise).join("");
          scramble = requestAnimationFrame(step);
        };
        scramble = requestAnimationFrame(step);
      }
      const bits = Math.round(n * Math.log2(pool.length));
      const pct = Math.min(100, (bits / 128) * 100);
      strengthBar.style.scale = `${Math.max(pct, 4) / 100} 1`;
      const word = bits < 50 ? "weak" : bits < 90 ? "good" : "strong";
      strengthBar.dataset.level = word;
      strengthWord.dataset.level = word;
      strengthWord.textContent = word;
      strengthBits.textContent = `${bits} bits of entropy`;
    };
    len.oninput = () => {
      lenVal.textContent = len.value;
      gen();
    };
    for (const [k] of sets)
      boxes[k].onchange = () => {
        if (!sets.some(([j]) => boxes[j].checked)) boxes[k].checked = true;
        gen(true);
      };
    plain.onchange = () => gen(true);
    const regen = h("button", {
      type: "button",
      class: "w-copy w-pw-regen",
      title: "generate new password",
      "aria-label": "generate new password",
      html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/></svg>`,
      onclick: () => {
        regen.classList.remove("spun");
        void regen.offsetWidth;
        regen.classList.add("spun");
        gen(true);
      },
    });
    gen();
    const check = (box, text) =>
      h("label", { class: "w-pw-opt" }, box, h("span", null, text));
    return card(
      "password generator",
      "random, generated in your browser",
      h(
        "div",
        { class: "w-pw-card" },
        h(
          "div",
          { class: "w-pw-row" },
          out,
          h(
            "div",
            { class: "w-pw-actions" },
            regen,
            copyBtn(() => current),
          ),
        ),
        h(
          "div",
          { class: "w-pw-meter" },
          h("div", { class: "w-strength" }, strengthBar),
          h("div", { class: "w-strength-row" }, strengthWord, strengthBits),
        ),
      ),
      sliderField("length", len, lenVal),
      h(
        "fieldset",
        { class: "w-pw-sets" },
        h("legend", null, "include"),
        h(
          "div",
          { class: "w-pw-opts" },
          ...sets.map(([k, text]) => check(boxes[k], text)),
        ),
        check(plain, "avoid look-alikes like 0 and O"),
      ),
    );
  },
});

reg({
  id: "uuid",
  match: (q) =>
    /^(?:uuid|guid)(?:\s*(?:v4|generator|gen))?$|^(?:generate|random)\s+uuid$/i.test(
      q.trim(),
    ),
  build: () => {
    const list = h("div", { class: "w-uuid-list" });
    let ids = [];
    const make = () => {
      ids = Array.from({ length: 5 }, () => crypto.randomUUID());
      list.replaceChildren(
        ...ids.map((u) =>
          h(
            "div",
            { class: "w-uuid-row" },
            h(
              "span",
              { class: "w-mono w-uuid-id" },
              u.slice(0, 19),
              h("wbr"),
              u.slice(19),
            ),
            copyBtn(() => u),
          ),
        ),
      );
    };
    make();
    let copied;
    const copyAll = h("button", {
      type: "button",
      class: "w-btn",
      html: "copy all",
      onclick: () => {
        navigator.clipboard?.writeText(ids.join("\n")).catch(() => {});
        copyAll.textContent = "copied";
        clearTimeout(copied);
        copied = setTimeout(() => {
          copyAll.textContent = "copy all";
        }, 1400);
      },
    });
    return card(
      "uuid generator",
      "version 4, random",
      list,
      h(
        "div",
        { class: "w-btn-row" },
        h("button", {
          type: "button",
          class: "w-btn primary",
          html: "generate new",
          onclick: () => {
            make();
            swapIn(list);
          },
        }),
        copyAll,
      ),
    );
  },
});

reg({
  id: "lorem",
  match: (q) =>
    /^lorem(?:\s*ipsum)?(?:\s+generator)?$|^placeholder\s+text$|^dummy\s+text$/i.test(
      q.trim(),
    ),
  build: () => {
    const words =
      "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum".split(
        " ",
      );
    const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const sentence = () => {
      const n = rand(8, 16);
      const s = Array.from(
        { length: n },
        () => words[rand(0, words.length - 1)],
      );
      if (n > 11) s[rand(3, n - 5)] += ",";
      return `${s[0][0].toUpperCase() + s[0].slice(1)} ${s.slice(1).join(" ")}.`;
    };
    const para = () => Array.from({ length: rand(3, 6) }, sentence).join(" ");
    const opener = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
    const out = h("div", { class: "w-lorem-out", tabindex: "0" });
    const countVal = h("span", null, "3");
    const count = slider({
      min: "1",
      max: "10",
      value: "3",
    });
    const gen = () =>
      out.replaceChildren(
        ...Array.from({ length: +count.value }, (_, i) =>
          h("p", null, i ? para() : `${opener} ${para()}`),
        ),
      );
    count.oninput = () => {
      countVal.textContent = count.value;
      gen();
    };
    gen();
    let copied;
    const copy = h("button", {
      type: "button",
      class: "w-btn primary",
      html: "copy text",
      onclick: () => {
        navigator.clipboard
          ?.writeText([...out.children].map((p) => p.textContent).join("\n\n"))
          .catch(() => {});
        copy.textContent = "copied";
        clearTimeout(copied);
        copied = setTimeout(() => {
          copy.textContent = "copy text";
        }, 1400);
      },
    });
    return card(
      "lorem ipsum",
      "placeholder text",
      out,
      sliderField("paragraphs", count, countVal),
      h(
        "div",
        { class: "w-btn-row" },
        copy,
        h("button", {
          type: "button",
          class: "w-btn",
          html: "new text",
          onclick: gen,
        }),
      ),
    );
  },
});

reg({
  id: "not-furry",
  match: (q) => {
    const t = q.toLowerCase();
    return t.includes("tiago") && t.includes("furry") ? {} : null;
  },
  build: () => {
    const img = h("img", {
      class: "w-notfurry-img",
      src: "https://tiago.zip/assets/img/not-furry.webp",
      alt: "",
      width: "120",
      height: "120",
      loading: "lazy",
    });
    const word = h("b", null, "not");
    const text = h(
      "div",
      { class: "w-notfurry-text" },
      "Tiago is ",
      word,
      " a furry",
    );
    if (Math.random() < 0.1) {
      word.textContent = "absolutely";
      word.className = "absolutely";
      setTimeout(() => {
        word.textContent = "not";
        word.className = "";
      }, 900);
    }
    return card(null, null, h("div", { class: "w-notfurry" }, img, text));
  },
});

const quiz = ({
  id,
  match,
  title,
  sub,
  questions,
  tiers,
  value = (v) => v,
  unit,
  suffix = "%",
}) => {
  const max = questions.reduce(
    (s, q) => s + Math.max(...q.opts.map((o) => o[1])),
    0,
  );
  reg({
    id,
    match: (q) => (match.test(q.trim()) ? {} : null),
    build: () => {
      let idx = 0;
      let back = false;
      let busy = false;
      const picks = [];
      const fill = h("div", { class: "w-quiz-fill" });
      const step = h("span", { class: "w-quiz-step" });
      const prev = h("button", {
        type: "button",
        class: "w-quiz-back",
        "aria-label": "previous question",
        html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>`,
        onclick: () => {
          if (!idx || busy) return;
          idx--;
          back = true;
          picks.pop();
          show();
        },
      });
      const track = h(
        "div",
        { class: "w-quiz-bar" },
        prev,
        h("div", { class: "w-quiz-track" }, fill),
        step,
      );
      const pane = h("div", { class: "w-quiz-pane" });
      const root = h("div", { class: "w-quiz" }, track, pane);

      const restart = () => {
        idx = 0;
        back = true;
        picks.length = 0;
        show();
      };

      const showResult = () => {
        track.style.display = "none";
        const score = picks.reduce((s, p) => s + p, 0);
        const pct = Math.round((score / max) * 100);
        const tier = tiers.find((t) => pct <= t.max) ?? tiers[tiers.length - 1];
        const num = h("span", { class: "w-quiz-num" }, value(0));
        const gauge = h(
          "div",
          {
            class: "w-quiz-gauge",
            role: "img",
            "aria-label": `${unit ?? ""} ${value(pct)}${suffix ?? ""}`.trim(),
          },
          h(
            "div",
            { class: "w-quiz-pct", "aria-hidden": "true" },
            unit && h("span", { class: "w-quiz-unit" }, unit),
            h(
              "span",
              { class: "w-quiz-val" },
              num,
              suffix && h("span", { class: "w-quiz-suffix" }, suffix),
            ),
          ),
        );
        gauge.insertAdjacentHTML(
          "afterbegin",
          `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="w-quiz-ring" cx="50" cy="50" r="44" pathLength="100"/><circle class="w-quiz-ring fg" cx="50" cy="50" r="44" pathLength="100"/></svg>`,
        );
        const arc = gauge.querySelector(".fg");
        const setArc = (v) => {
          arc.style.strokeDasharray = `${v * 75} 100`;
        };
        pane.replaceChildren(
          h(
            "div",
            { class: "w-quiz-card w-quiz-result w-quiz-fwd" },
            gauge,
            h(
              "div",
              { class: "w-quiz-copy" },
              h("div", { class: "w-quiz-verdict" }, tier.title),
              tier.line && h("div", { class: "w-quiz-line" }, tier.line),
            ),
            h(
              "button",
              { type: "button", class: "w-btn w-quiz-again", onclick: restart },
              "take it again",
            ),
          ),
        );
        if (calmMotion()) {
          num.textContent = value(pct);
          return setArc(pct / 100);
        }
        let start;
        const tick = (t) => {
          start ??= t;
          const p = Math.min(1, (t - start) / 480);
          const e = 1 - (1 - p) ** 3;
          num.textContent = value(Math.round(pct * e));
          setArc((pct / 100) * e);
          if (p < 1 && num.isConnected) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(() => {
          num.textContent = value(pct);
          setArc(pct / 100);
        }, 520);
      };

      const show = () => {
        if (idx >= questions.length) return showResult();
        const dir = pane.isConnected ? (back ? "rev" : "fwd") : "still";
        back = false;
        busy = false;
        track.style.display = "";
        fill.style.transform = `scaleX(${idx / questions.length})`;
        prev.disabled = idx === 0;
        step.textContent = `${idx + 1} of ${questions.length}`;
        const { q, opts } = questions[idx];
        pane.replaceChildren(
          h(
            "div",
            { class: `w-quiz-card w-quiz-${dir}` },
            h("div", { class: "w-quiz-q" }, q),
            h(
              "div",
              { class: "w-quiz-opts" },
              opts.map(([label, pts]) =>
                h(
                  "button",
                  {
                    type: "button",
                    class: "w-quiz-opt",
                    onclick: (e) => {
                      if (busy) return;
                      busy = true;
                      picks.push(pts);
                      idx++;
                      e.currentTarget.classList.add("picked");
                      fill.style.transform = `scaleX(${idx / questions.length})`;
                      setTimeout(show, calmMotion() ? 0 : 160);
                    },
                  },
                  label,
                ),
              ),
            ),
          ),
        );
      };

      show();
      return card(title, sub, root);
    },
  });
};

quiz({
  id: "quiz-gay",
  match: /^(?:am\s+i\s+gay|how\s+gay\s+am\s+i|gay\s+(?:quiz|test))\s*\??$/i,
  title: "am i gay?",
  questions: [
    {
      q: "have you ever had feelings for a same-gender close friend?",
      opts: [
        ["i think so. that's why i'm taking this quiz", 3],
        ["wait, what's the difference between friendship and a crush?", 2],
        ["don't think so, but we're so close people joke that we're dating", 1],
        ["nope. we're just friends", 0],
      ],
    },
    {
      q: "have you ever kissed someone or wanted to kiss someone of the same gender?",
      opts: [
        ["definitely, and it was great", 3],
        ["i haven't done it, but i want to try it", 2],
        [
          "only as a joke or a dare, and i think about it more than i should",
          2,
        ],
        ["yeah, and i'm not sure how i felt about it", 1],
        ["nope. not interested", 0],
      ],
    },
    {
      q: "how do you feel about queer characters in tv shows and movies?",
      opts: [
        [
          "oh, i've totally watched shows just for the queer ships and storylines",
          3,
        ],
        ["i kind of feel like i can identify with queer characters", 2],
        ["i notice queer characters, but i don't feel strongly about them", 1],
        [
          "i like the positive representation, but they don't stand out to me",
          0,
        ],
      ],
    },
    {
      q: "when someone asks you who you're crushing on:",
      opts: [
        [
          "a name comes to mind immediately, and it's someone of the same gender",
          3,
        ],
        ["i make up a name or pick someone random", 2],
        ["i literally don't get the big deal about crushes", 1],
        [
          "i talk about someone of the opposite sex who i'm genuinely crushing on",
          0,
        ],
      ],
    },
    {
      q: "has anyone ever asked you if you were gay?",
      opts: [
        ["people pretty much assume that about me all the time", 3],
        ["i've been asked that once or twice", 2],
        [
          "no one has asked directly, but i wouldn't be surprised if they did",
          1,
        ],
        ["never. people assume i'm straight", 0],
      ],
    },
    {
      q: "when you imagine being in a relationship, what do you picture?",
      opts: [
        ["i can only see myself with someone of the same sex", 3],
        ["i'm not sure. any gender seems okay", 2],
        ["i'll probably be with someone of the opposite sex", 1],
        ["i can only see myself with someone of the opposite sex", 0],
      ],
    },
    {
      q: "how would you feel about identifying as gay?",
      opts: [
        ["yeah, that feels right", 3],
        ["it honestly makes me a little nervous, but also kinda fits", 2],
        ["i'm not sure how i feel", 1],
        ["no, i really don't think that's me", 0],
      ],
    },
    {
      q: "have you ever felt attracted to someone of the same gender?",
      opts: [
        ["yes", 3],
        ["yeah, but everyone has, right?", 2],
        ["people of the same gender are just objectively more attractive", 2],
        ["nope", 0],
      ],
    },
    {
      q: "how do you feel about dating someone of the opposite gender?",
      opts: [
        ["i'm not interested. that would feel like a chore", 3],
        ["i wouldn't mind, and i've either wanted to do it or have done it", 1],
        ["maybe, but i'm not really interested in anyone", 1],
        [
          "i'd definitely date (or have dated) someone of the opposite gender",
          0,
        ],
      ],
    },
    {
      q: "do you ever fantasize about being with someone of the same gender?",
      opts: [
        ["yeah. pretty often", 3],
        ["sometimes", 2],
        [
          "yes, but i'm not sure i'd actually end up with someone of the same gender",
          1,
        ],
        ["no", 0],
      ],
    },
    {
      q: "when you imagine kissing or being intimate with a future partner, how do you feel?",
      opts: [
        ["as long as i'm with someone i really like, that sounds great", 1],
        ["good, i guess?", 1],
        [
          "i can't imagine that, and i don't think i'll ever want that, regardless of gender",
          0,
        ],
        ["i'm too young for that", 0],
      ],
    },
    {
      q: "if you scroll through your feed or fyp, do you see content from queer creators?",
      opts: [
        ["yup. you got me", 3],
        ["maybe! it depends on the day", 2],
        ["yeah, but only because i've looked at one or two related posts", 1],
        ["probably not", 0],
      ],
    },
    {
      q: "flash forward 5 years: how likely is it that your partner is the same gender as you?",
      opts: [
        ["very likely", 3],
        ["pretty likely", 2],
        ["possible, but not super likely", 1],
        ["not very likely", 0],
      ],
    },
    {
      q: "would you be comfortable using an lgbtq+ dating app?",
      opts: [
        ["absolutely! i already have one downloaded", 3],
        ["i'm open to giving one a try", 2],
        ["not really, but i won't rule it out completely", 1],
        ["no. that makes me uncomfortable", 0],
      ],
    },
    {
      q: "are there a lot of lgbtq+ individuals in your friend group?",
      opts: [
        ["absolutely! lots of my friends are queer", 3],
        ["a few good friends of mine identify as lgbtq+", 2],
        ["not really, most of my friends are straight", 1],
        ["nope. my entire friend group is straight", 0],
      ],
    },
    {
      q: "what inspired you to take this quiz?",
      opts: [
        ["i think i might be gay, but i wanted some extra validation", 3],
        [
          "i identify with aspects of the queer experience but am not totally sure where i stand",
          2,
        ],
        ["i'm just curious about the result i'll get", 1],
        ["i want to confirm that i'm heterosexual", 0],
      ],
    },
  ],
  tiers: [
    {
      max: 24,
      title: "probably straight",
      line: "not much same-gender attraction showing up in your answers.",
    },
    {
      max: 49,
      title: "maybe a little curious",
      line: "a few of your answers point somewhere. no pressure to name it yet.",
    },
    {
      max: 74,
      title: "signs point to queer",
      line: "there's a real pattern in your answers. worth sitting with, at your own pace.",
    },
    {
      max: 100,
      title: "yeah, probably gay",
      line: "your answers point pretty clearly toward same\u2011gender attraction.",
    },
  ],
});

quiz({
  id: "quiz-trans",
  match:
    /^(?:am\s+i\s+trans(?:gender)?|how\s+trans\s+am\s+i|trans(?:gender)?\s+(?:quiz|test))\s*\??$/i,
  title: "am i trans?",
  questions: [
    {
      q: "have you ever wondered what it'd be like to be a different gender, just for a little while?",
      opts: [
        ["yes, often!", 3],
        ["i used to all the time as a kid", 2],
        ["sometimes", 1],
        ["no, not really", 0],
      ],
    },
    {
      q: "do you ever get uncomfortable when you think about certain parts of your own body?",
      opts: [
        [
          "yeah. it's like i wish they weren't there, or that they were different",
          3,
        ],
        ["sometimes, but for reasons that don't have to do with gender", 1],
        ["no. for the most part, i like my body as it is!", 0],
      ],
    },
    {
      q: "is your friend group mostly the same gender as you?",
      opts: [
        ["yes, and that's fine by me", 0],
        ["yes, but i wish i had more friends of another gender", 1],
        ["nope. it's pretty mixed and diverse!", 1],
        ["no. actually, most of my friends are a different gender!", 2],
      ],
    },
    {
      q: "when you see or think about your chest, how do you feel?",
      opts: [
        [
          "i wish it were different in some way. it feels like it doesn't belong to me",
          3,
        ],
        ["i'm fine with it. i don't really think about it", 0],
        ["i'd like to change or improve it, but nothing dramatic", 1],
        ["it feels good! it's a part of my body, and i like it", 0],
      ],
    },
    {
      q: "have you ever had trouble fitting in with people of the gender you were assigned at birth?",
      opts: [
        ["yes. i find them hard to relate to", 3],
        ["sometimes, but not often", 1],
        ["not really. i feel pretty at home around them", 0],
        ["i'm not sure", 1],
      ],
    },
    {
      q: "if you could change one of these things about yourself, which would you choose?",
      opts: [
        ["my voice", 2],
        ["my body", 2],
        ["my personality", 0],
        ["my life circumstances", 0],
        ["i would change multiple of these, or even all of them", 3],
        ["none of these", 0],
      ],
    },
    {
      q: "what's stopping you from transitioning right now?",
      opts: [
        ["i don't want to transition", 0],
        ["i'm not sure if it's right for me", 1],
        [
          "i can't afford it, or my life circumstances (religion, politics, etc.) won't allow it",
          3,
        ],
        ["something else", 2],
      ],
    },
    {
      q: "if you woke up tomorrow and found that you transitioned overnight, how do you think you would feel?",
      opts: [
        ["curious. i'd want to experiment and explore", 2],
        ["relieved or excited. it'd be a dream come true", 3],
        ["uncertain. i'm not sure if i'd want that", 1],
        ["upset. i'd want to go back to how i was before", 0],
      ],
    },
    {
      q: "if you could do one of these right now with nothing but positive consequences, and you could snap your fingers and go back whenever you want, which would you pick?",
      opts: [
        [
          "physically transition (change my body) and socially transition (change my social identity)",
          3,
        ],
        ["only physically transition (changing parts of my body)", 2],
        ["only socially transition (like changing my name and pronouns)", 2],
        ["none of these", 0],
      ],
    },
    {
      q: "what emotion do you most feel when you see transgender people?",
      opts: [
        ["envy", 3],
        ["curiosity", 1],
        ["anxiety", 2],
        ["excitement", 2],
        ["nothing in particular", 0],
      ],
    },
    {
      q: "finally, can we ask why you're taking this quiz?",
      opts: [
        ["i think i might be trans, but want a second opinion", 3],
        ["i'm not sure if i'm trans, and want some guidance", 2],
        ["i don't think i'm trans, but want to be sure", 1],
        ["i'm just taking it for fun!", 0],
      ],
    },
  ],
  tiers: [
    {
      max: 24,
      title: "probably cis",
      line: "not much gender friction showing up in your answers.",
    },
    {
      max: 49,
      title: "some questions worth sitting with",
      line: "a few of your answers point somewhere. no rush to figure out where.",
    },
    {
      max: 74,
      title: "there's a real pattern here",
      line: "plenty of people who answer like this end up somewhere under the trans umbrella.",
    },
    {
      max: 100,
      title: "you're probably trans",
      line: "you've probably suspected this for a while.",
    },
  ],
});

quiz({
  id: "quiz-furry",
  match:
    /^(?:am\s+i\s+a?\s*furry|how\s+furry\s+am\s+i|furry\s+(?:quiz|test))\s*\??$/i,
  title: "am i a furry?",
  questions: [
    {
      q: "how do you feel when you see an animal with human-like traits?",
      opts: [
        ["super excited", 3],
        ["intrigued", 2],
        ["mildly interested", 1],
        ["indifferent", 0],
      ],
    },
    {
      q: "do you ever feel like an animal trapped in a human body?",
      opts: [
        ["yes, for sure! it's a frequent thing", 3],
        ["sometimes, but the feeling goes away eventually", 2],
        ["maybe once, but it was just a passing thought", 1],
        ["nope. i feel 100% like a human", 0],
      ],
    },
    {
      q: "would you be interested in going to furry conventions?",
      opts: [
        ["yes! i already go to several cons in full fursuit every year", 3],
        ["yes. i've never been to one, but i'm curious about them", 2],
        ["maybe, i guess. but i definitely wouldn't dress up", 1],
        ["no. i know they exist, i just wouldn't go", 0],
        ["no. i didn't even know they existed", 0],
      ],
    },
    {
      q: "do you belong to any online furry communities?",
      opts: [
        ["absolutely. the furry fandom is a major part of my life", 3],
        [
          "yeah, i'm in the community, but i'm not a super active participant",
          2,
        ],
        [
          "not exactly, but the algorithm keeps showing me furries and i don't stop it",
          2,
        ],
        ["no, but i've lurked in the forums once or twice", 1],
        ["no, i don't follow any of that stuff online or irl", 0],
      ],
    },
    {
      q: "do you have a fursona?",
      opts: [
        ["i definitely do, and it's a huge part of who i am", 3],
        ["not yet, but i think i'd like to one day", 2],
        [
          "i have a commissioned animal pfp, but i wouldn't call it a fursona",
          2,
        ],
        ["i have an animal character i doodle sometimes, that's all", 1],
        ["no, it's not for me, but the idea is neat", 1],
        ["um, what's a fursona?", 0],
      ],
    },
    {
      q: "what do you think about fursuits?",
      opts: [
        ["i love them, i wear my fursuit every chance i get", 3],
        ["they're pretty cool, i'm thinking about getting one", 2],
        ["i've looked up prices. purely out of curiosity.", 2],
        ["i respect the craft, but i probably wouldn't wear one", 1],
        ["i guess they're fine... as halloween costumes", 0],
      ],
    },
    {
      q: "do you watch cartoons, shows, or movies with animals in them?",
      opts: [
        ["of course! that's pretty much all i watch these days", 3],
        ["yes, i watch a lot of them, but i like other stuff, too", 2],
        ["sometimes, but i usually don't seek them out", 1],
        ["rarely. i don't actively avoid them, but they're not my jam", 0],
      ],
    },
    {
      q: "have you ever spent time looking at furry art?",
      opts: [
        ["yes, tons! i even have a few pieces on my wall", 3],
        ["i've commissioned a piece or two, for completely normal reasons", 3],
        ["a little. i follow a few furry artists on social media", 2],
        ["i've seen some furry art, but i wasn't searching for it", 1],
        ["nope, never", 0],
      ],
    },
    {
      q: "have you ever role-played as a furry online or in person?",
      opts: [
        ["yes, regularly. it's one of my favorite things to do", 3],
        ["yes, a few times, but it wasn't a big deal", 2],
        ["no, but i think the idea is pretty cool", 1],
        ["no, role-playing just isn't my thing", 0],
      ],
    },
    {
      q: "do you feel spiritually connected to a specific animal or creature?",
      opts: [
        [
          "i feel a deep and spiritual kinship with a specific animal or character",
          3,
        ],
        [
          "i feel very drawn to a particular animal species that i like a lot",
          2,
        ],
        [
          "i feel a strong connection to all animals, but it's not spiritual",
          1,
        ],
        ["i like animals well enough, but my feelings aren't that deep", 0],
      ],
    },
    {
      q: "do you have any friends in the furry fandom?",
      opts: [
        ["yes, some of my besties are in the fandom!", 3],
        ["yes, i know a few people", 2],
        ["maybe one or two casual acquaintances", 1],
        ["no, i don't have any", 0],
      ],
    },
    {
      q: "how do you feel when someone says they're a furry?",
      opts: [
        ["i feel instantly connected to them", 3],
        ["i'm intrigued. i usually ask questions about it", 2],
        ["i'm interested, but i personally can't relate", 1],
        ["nothing in particular. to each their own", 0],
      ],
    },
  ],
  tiers: [
    {
      max: 24,
      title: "not a furry",
      line: "you like animals the normal amount.",
    },
    {
      max: 49,
      title: "furry-adjacent",
      line: "you have a favorite fox and you've thought about it.",
    },
    {
      max: 74,
      title: "basically a furry",
      line: "you know far too much for a civilian.",
    },
    {
      max: 100,
      title: "furry",
      line: "the quiz was a formality.",
    },
  ],
});

quiz({
  id: "quiz-iq",
  match:
    /^(?:iq\s+test|test\s+my\s+iq|what(?:'s|\s+is)\s+my\s+iq|how\s+smart\s+am\s+i|am\s+i\s+(?:smart|stupid|dumb))\s*\??$/i,
  title: "iq test",
  value: (pct) => 55 + pct,
  unit: "iq",
  suffix: null,
  questions: [
    {
      q: "you have 3 apples. you take away 2. how many apples do you have?",
      opts: [
        ["2. i took them, they're mine now", 3],
        ["3. taking isn't eating", 2],
        ["1", 1],
        ["i don't want apples", 0],
      ],
    },
    {
      q: "which is heavier: a kilogram of steel or a kilogram of feathers?",
      opts: [
        ["the feathers. emotionally.", 3],
        ["they weigh the same", 2],
        ["the feathers, but the steel hurts more", 1],
        ["steel, obviously", 0],
      ],
    },
    {
      q: "a rooster lays an egg on the exact top of a roof. which side does it roll down?",
      opts: [
        ["roosters don't lay eggs", 3],
        ["depends on the wind", 2],
        ["the left", 1],
        ["the right", 1],
      ],
    },
    {
      q: "how many months have 28 days?",
      opts: [
        ["all of them", 3],
        ["depends on leap years", 2],
        ["1", 1],
        ["i'd have to check", 0],
      ],
    },
    {
      q: "finish the sequence: 1, 1, 2, 3, 5, …",
      opts: [
        ["8", 3],
        ["it's already finished. you put an ellipsis, not me", 2],
        ["7", 1],
        ["6", 0],
      ],
    },
    {
      q: "you're in a race and you overtake the person in second place. what place are you in?",
      opts: [
        ["second", 3],
        ["i would never run", 2],
        ["depends how many racers there are", 1],
        ["first", 0],
      ],
    },
    {
      q: "be honest: why are you taking an iq test on a search engine?",
      opts: [
        ["to settle an argument", 3],
        ["i was promised a number", 2],
        ["boredom", 1],
        ["this is an iq test?", 0],
      ],
    },
  ],
  tiers: [
    {
      max: 24,
      title: "room temperature",
      line: "in celsius.",
    },
    {
      max: 49,
      title: "perfectly average",
      line: "statistically speaking, someone has to be.",
    },
    {
      max: 74,
      title: "dangerously smart",
      line: "smart enough to spot the trick questions, not smart enough to close the tab.",
    },
    {
      max: 100,
      title: "certified genius",
      line: "as certified by a search engine widget, the highest scientific authority.",
    },
  ],
});

reg({
  id: "coin",
  match: (q) =>
    /^(?:flip\s+a\s+coin|coin\s*flip|coin\s*toss|heads\s+or\s+tails|toss\s+a\s+coin)$/i.test(
      q.trim(),
    ),
  build: () => {
    const CROWN = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.6l3.2 4.9l4.4 -3.4l-1.7 9.1a1 1 0 0 1 -1 .8h-9.8a1 1 0 0 1 -1 -.8l-1.7 -9.1l4.4 3.4z"/><rect x="5.4" y="17.4" width="13.2" height="2.2" rx="1.1"/></svg>`;
    const STAR = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2l2.7 5.6l6.1 .9l-4.4 4.3l1 6.1l-5.4 -2.9l-5.4 2.9l1 -6.1l-4.4 -4.3l6.1 -.9z"/></svg>`;

    const inner = h(
      "div",
      { class: "w-coin3d-inner" },
      ...[
        ["heads", CROWN],
        ["tails", STAR],
      ].map(([cls, icon]) =>
        h(
          "div",
          { class: `w-coin-face ${cls}` },
          h("div", { class: "w-coin-icon", html: icon }),
        ),
      ),
    );
    const toss = h("div", { class: "w-coin3d-toss" }, inner);
    const shadow = h("div", { class: "w-coin-shadow" });
    const stage = h(
      "button",
      { type: "button", class: "w-coin3d", "aria-label": "flip the coin" },
      shadow,
      toss,
    );
    const label = h(
      "div",
      { class: "w-coin-label", role: "status" },
      "flipping…",
    );
    const headsN = h("span", null, "0");
    const tailsN = h("span", null, "0");
    const tally = h(
      "div",
      { class: "w-coin-tally" },
      h("span", null, headsN, " heads"),
      h("span", { class: "w-coin-dot" }),
      h("span", null, tailsN, " tails"),
    );

    let rotation = 0;
    let heads = 0;
    let tails = 0;
    let flipping = false;

    const flip = () => {
      if (flipping) return;
      flipping = true;
      label.textContent = "flipping…";
      label.className = "w-coin-label";

      const result = Math.random() < 0.5 ? "heads" : "tails";
      const base = rotation + 4 * 360;
      const want = result === "heads" ? 0 : 180;
      let target = base - (base % 360) + want;
      if (target < base) target += 360;
      rotation = target;

      inner.style.transform = `rotateX(${rotation}deg)`;
      const land = () => {
        if (result === "heads") swapIn(headsN, ++heads);
        else swapIn(tailsN, ++tails);
        label.textContent = result;
        label.className = `w-coin-label ${result}${stage.isConnected ? " landed" : ""}`;
        flipping = false;
      };
      if (!stage.isConnected) return land();
      stage.classList.remove("tossing");
      void stage.offsetWidth;
      stage.classList.add("tossing");
      setTimeout(land, calmMotion() ? 0 : 820);
    };

    stage.onclick = flip;
    flip();

    return card(
      "coin flip",
      null,
      stage,
      label,
      tally,
      h(
        "div",
        { class: "w-btn-row w-center-row" },
        h("button", {
          type: "button",
          class: "w-btn primary",
          html: "flip again",
          onclick: flip,
        }),
      ),
    );
  },
});

reg({
  id: "dice",
  match: (q) => {
    const t = q.trim().toLowerCase();
    const m = t.match(
      /^roll\s+(?:(\d+)\s*)?d\s*(\d+)$|^(\d+)d(\d+)$|^roll(?:\s+(?:a\s+)?dice?|\s+the\s+dice)?$|^dice\s*roller?$|^roll\s+a\s+die$/,
    );
    if (!m) return null;
    return { n: +(m[1] || m[3] || 1) || 1, sides: +(m[2] || m[4] || 6) || 6 };
  },
  build: ({ n, sides }) => {
    const capped = n > 20;
    n = Math.min(n, 20);
    sides = Math.max(2, sides);
    const PIPS = [
      [4],
      [0, 8],
      [0, 4, 8],
      [0, 2, 6, 8],
      [0, 2, 4, 6, 8],
      [0, 2, 3, 5, 6, 8],
    ];
    const rand = () => 1 + Math.floor(Math.random() * sides);
    const face = (d, v) => {
      if (sides !== 6) {
        d.textContent = v;
        return;
      }
      d.replaceChildren(
        ...Array.from({ length: 9 }, (_, k) =>
          h("i", { class: PIPS[v - 1].includes(k) ? "on" : null }),
        ),
      );
    };
    const dice = h("div", {
      class: `w-dice-row${sides === 6 ? " pips" : ""}`,
      role: "img",
    });
    const sumEl = h("span", { class: "w-dice-sum" });
    const total = h(
      "div",
      { class: "w-dice-total", role: "status" },
      h("span", { class: "w-dice-cap" }, "total"),
      sumEl,
    );
    const els = Array.from({ length: n }, () => h("div", { class: "w-die" }));
    dice.append(...els);
    const timers = [];
    const roll = () => {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
      const vals = els.map(rand);
      const sum = vals.reduce((a, b) => a + b, 0);
      dice.setAttribute("aria-label", `rolled ${vals.join(", ")}`);
      const first = !dice.isConnected;
      const calm = calmMotion() || first;
      if (!first) total.classList.add("rolling");
      els.forEach((d, i) => {
        const end = calm ? 0 : 420 + Math.min(i, 5) * 60;
        const turns = Math.random() < 0.5 ? -1 : 1;
        d.style.setProperty("--spin", `${turns * 360}deg`);
        d.style.setProperty("--hop", `${-12 - Math.random() * 12}px`);
        d.style.setProperty("--tumble", `${end}ms`);
        d.classList.remove("tumbling", "landed");
        void d.offsetWidth;
        if (!calm) d.classList.add("tumbling");
        let settled = false;
        const shuffle = () => {
          if (settled) return;
          face(d, rand());
          timers.push(setTimeout(shuffle, 70));
        };
        if (!calm) shuffle();
        timers.push(
          setTimeout(() => {
            settled = true;
            d.classList.remove("tumbling");
            face(d, vals[i]);
            if (!calm) d.classList.add("landed");
          }, end),
        );
      });
      const last = calm ? 0 : 420 + Math.min(n - 1, 5) * 60;
      timers.push(
        setTimeout(() => {
          total.classList.remove("rolling");
          if (n <= 1) return;
          if (first) sumEl.textContent = sum;
          else swapIn(sumEl, sum);
        }, last),
      );
    };
    roll();
    return card(
      "dice roll",
      `${n}d${sides}${capped ? ", capped at 20 dice" : ""}`,
      dice,
      n > 1 && total,
      h(
        "div",
        { class: "w-btn-row w-center-row" },
        h("button", {
          type: "button",
          class: "w-btn primary",
          html: "roll",
          onclick: roll,
        }),
      ),
    );
  },
});

reg({
  id: "rng",
  match: (q) => {
    const m = q.match(
      /^random\s+number(?:\s+(?:between\s+)?(-?\d+)\s*(?:to|-|and|,)\s*(-?\d+))?$|^(?:rng|pick\s+a\s+number)(?:\s+(-?\d+)\s*(?:to|-|and)\s*(-?\d+))?$/i,
    );
    if (!m) return null;
    const lo = m[1] ?? m[3],
      hi = m[2] ?? m[4];
    return { lo: lo != null ? +lo : 1, hi: hi != null ? +hi : 100 };
  },
  build: ({ lo, hi }) => {
    if (lo > hi) [lo, hi] = [hi, lo];
    const field = (text, value) => {
      const input = h("input", {
        class: "w-input w-rng-input",
        type: "number",
        inputmode: "numeric",
        value,
      });
      return [
        input,
        h(
          "label",
          { class: "w-rng-field" },
          h("span", { class: "w-rng-label" }, text),
          input,
        ),
      ];
    };
    const [loIn, loField] = field("min", lo);
    const [hiIn, hiField] = field("max", hi);
    const out = h("div", { class: "w-rng-out", role: "status" });
    const note = h("div", { class: "w-rng-note" });
    let spin;
    let value = "";
    const pick = () => {
      const a = Math.ceil(+loIn.value);
      const b = Math.floor(+hiIn.value);
      clearTimeout(spin);
      const bad =
        loIn.value === "" || hiIn.value === "" || Number.isNaN(a + b) || a > b;
      loIn.setAttribute("aria-invalid", bad);
      hiIn.setAttribute("aria-invalid", bad);
      note.classList.toggle("err", bad);
      if (bad) {
        value = "";
        note.textContent = "min has to be less than or equal to max";
        return swapIn(out, "?");
      }
      note.textContent = `whole number from ${a.toLocaleString()} to ${b.toLocaleString()}`;
      const roll = () => a + Math.floor(Math.random() * (b - a + 1));
      value = String(roll());
      const shown = (+value).toLocaleString();
      if (calmMotion() || !out.isConnected) return swapIn(out, shown);
      let k = 0;
      const tick = () => {
        if (k++ >= 6 || !out.isConnected) return swapIn(out, shown);
        out.textContent = roll().toLocaleString();
        out.classList.remove("w-swap");
        spin = setTimeout(tick, 34 + k * 10);
      };
      tick();
    };
    const onEnter = (e) => {
      if (e.key === "Enter") pick();
    };
    loIn.onkeydown = hiIn.onkeydown = onEnter;
    pick();
    return card(
      "random number",
      null,
      h("div", { class: "w-rng-hero" }, out, note),
      h("div", { class: "w-rng-fields" }, loField, hiField),
      h(
        "div",
        { class: "w-btn-row" },
        h("button", {
          type: "button",
          class: "w-btn primary",
          html: "generate",
          onclick: pick,
        }),
        copyBtn(() => value, "copy number"),
      ),
    );
  },
});

reg({
  id: "8ball",
  match: (q) => /^(?:magic\s+)?8\s*ball|^magic\s+eight\s+ball$/i.test(q.trim()),
  build: () => {
    const ans = [
      "it is certain",
      "without a doubt",
      "yes definitely",
      "you may rely on it",
      "most likely",
      "outlook good",
      "signs point to yes",
      "reply hazy try again",
      "ask again later",
      "cannot predict now",
      "don't count on it",
      "my reply is no",
      "very doubtful",
      "outlook not so good",
    ];
    const answer = h("span", { class: "w-8ball-answer", role: "status" });
    const win = h(
      "span",
      { class: "w-8ball-window" },
      h("span", { class: "w-8ball-eight", "aria-hidden": "true" }, "8"),
      h("span", { class: "w-8ball-die" }, answer),
    );
    const ball = h(
      "button",
      { type: "button", class: "w-8ball", "aria-label": "shake the 8 ball" },
      win,
    );
    let shakeTo = null;
    let last = -1;
    const ask = () => {
      clearTimeout(shakeTo);
      ball.classList.remove("shaking");
      win.classList.remove("revealed");
      void ball.offsetWidth;
      ball.classList.add("shaking", "asked");
      shakeTo = setTimeout(
        () => {
          ball.classList.remove("shaking");
          let i = Math.floor(Math.random() * ans.length);
          if (i === last) i = (i + 1) % ans.length;
          last = i;
          answer.textContent = ans[i];
          win.classList.add("revealed");
        },
        calmMotion() ? 0 : 640,
      );
    };
    ball.onclick = ask;
    return card(
      "magic 8 ball",
      "ask a yes or no question, then shake",
      h("div", { class: "w-center w-8ball-stage" }, ball),
      h(
        "div",
        { class: "w-btn-row w-center-row" },
        h("button", {
          type: "button",
          class: "w-btn primary",
          html: "shake",
          onclick: ask,
        }),
      ),
    );
  },
});

reg({
  id: "yesno",
  match: (q) =>
    /^(?:yes\s+or\s+no|should\s+i\b.*|will\s+i\b.*)$/i.test(q.trim()) &&
    /\?$|^yes\s+or\s+no$|^should\s+i|^will\s+i/i.test(q.trim()),
  build: (_, q = "") => {
    const question = q.trim();
    const out = h("div", { class: "w-yesno", role: "status" });
    const go = () => {
      const r = Math.random() < 0.5;
      out.dataset.answer = r ? "yes" : "no";
      swapIn(out, r ? "yes" : "no");
    };
    go();
    return card(
      "yes or no",
      /^yes\s+or\s+no$/i.test(question) ? null : question,
      out,
      h(
        "div",
        { class: "w-btn-row w-center-row" },
        h("button", {
          type: "button",
          class: "w-btn primary",
          html: "ask again",
          onclick: go,
        }),
      ),
    );
  },
});

reg({
  id: "picker",
  match: (q) => {
    const m = q.match(
      /^(?:pick|choose|decide|random)\s+(?:between|from|one\s+of)\s+(.+)$/i,
    );
    if (!m) return null;
    const items = m[1]
      .split(/\s*(?:,|\bor\b|\/)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length >= 2 ? { items } : null;
  },
  build: ({ items }) => {
    const out = h("div", { class: "w-picker-out", role: "status" });
    let spin = null;
    const go = () => {
      clearTimeout(spin);
      const first = !out.isConnected;
      const n = calmMotion() || first ? 1 : 9;
      let i = Math.floor(Math.random() * items.length);
      const end = i + n;
      out.classList.remove("flash", "spinning");
      const tick = () => {
        out.textContent = items[i % items.length];
        i++;
        out.classList.remove("w-tick");
        void out.offsetWidth;
        if (i < end) {
          out.classList.add("w-tick", "spinning");
          spin = setTimeout(tick, 40 + (i - end + n) ** 2 * 3);
          return;
        }
        out.classList.remove("spinning");
        if (first) return;
        out.classList.add("flash");
        spin = setTimeout(() => out.classList.remove("flash"), 60);
      };
      tick();
    };
    go();
    return card(
      "decision picker",
      `${items.length} options: ${items.join(", ")}`,
      h("div", { class: "w-center w-picker-stage" }, out),
      h(
        "div",
        { class: "w-btn-row w-center-row" },
        h("button", {
          type: "button",
          class: "w-btn primary",
          html: "pick again",
          onclick: go,
        }),
      ),
    );
  },
});

const converter = (
  id,
  title,
  sub,
  fn,
  matchRe,
  { mono = false, modes, mode = 0, err = "can't convert that", cls } = {},
) =>
  reg({
    id,
    match: (q) => {
      const m = q.match(matchRe);
      if (!m) return null;
      const cap = m.slice(1).find((x) => x != null) ?? "";
      return { text: cap.trim() };
    },
    build: ({ text }) => {
      let cur = mode;
      const input = h("textarea", {
        class: "w-textarea w-tx-in",
        rows: "2",
        "aria-label": `${title} input`,
        spellcheck: "false",
        autocapitalize: "off",
        autocomplete: "off",
      });
      const out = h("div", {
        class: `w-tx-text${mono ? " mono" : ""}${cls ? ` ${cls}` : ""}`,
        "data-ph": "the result appears here",
      });
      const copy = copyBtn(() => out.textContent, "copy result");
      const panel = h(
        "div",
        { class: "w-tx-out", role: "status", "aria-live": "polite" },
        out,
        copy,
      );
      const run = () => {
        const f = modes ? modes[cur][1] : fn;
        input.placeholder = modes?.[cur][2] ?? "type or paste text";
        let ok = true;
        try {
          out.textContent = f(input.value);
        } catch (e) {
          ok = false;
          out.textContent = e?.name === "Error" ? e.message : err;
        }
        panel.classList.toggle("err", !ok);
        copy.disabled = !ok || !out.textContent;
      };
      const seg =
        modes &&
        segmented(
          "direction",
          modes.map(([label], i) => [i, label]),
          cur,
          (i) => {
            if (!panel.classList.contains("err") && out.textContent)
              input.value = out.textContent;
            cur = i;
            run();
          },
        );
      seg?.classList.add("fit");
      input.value = text;
      input.oninput = run;
      run();
      return card(title, sub, seg, input, panel);
    },
  });

const b64Modes = [
  ["encode", (s) => btoa(unescape(encodeURIComponent(s)))],
  [
    "decode",
    (s) => {
      const t = s.trim().replace(/-/g, "+").replace(/_/g, "/");
      if (!t) return "";
      return decodeURIComponent(escape(atob(t)));
    },
    "paste base64",
  ],
];
const urlModes = [
  ["encode", (s) => encodeURIComponent(s)],
  ["decode", (s) => decodeURIComponent(s), "paste url-encoded text"],
];
converter(
  "b64enc",
  "base64",
  null,
  null,
  /^base64\s+encode\s+(.+)$|^encode\s+(?:to\s+)?base64\s+(.+)$|^base64\s*[:=]\s*(.+)$|^(.+)\s+to\s+base64$/i,
  { mono: true, modes: b64Modes, err: "that isn't valid base64" },
);
converter(
  "b64dec",
  "base64",
  null,
  null,
  /^base64\s+decode\s+(.+)$|^decode\s+base64\s+(.+)$/i,
  { mono: true, modes: b64Modes, mode: 1, err: "that isn't valid base64" },
);
converter("urlenc", "url encoding", null, null, /^url\s*encode\s+(.+)$/i, {
  mono: true,
  modes: urlModes,
  err: "that isn't valid url encoding",
});
converter("urldec", "url encoding", null, null, /^url\s*decode\s+(.+)$/i, {
  mono: true,
  modes: urlModes,
  mode: 1,
  err: "that isn't valid url encoding",
});
converter(
  "rot13",
  "rot13",
  "letter substitution cipher",
  (s) =>
    s.replace(/[a-z]/gi, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    }),
  /^rot13\s*[:=]\s*(.+)$|^rot13\s+(?:encode|decode|encrypt)\s+(.+)$|^(.+)\s+(?:in|to)\s+rot13$/i,
);
converter(
  "reverse",
  "reverse text",
  null,
  (s) => [...s].reverse().join(""),
  /^reverse\s+text\s+(.+)$|^reverse\s*[:=]\s*(.+)$|^(.+)\s+reversed$/i,
);
converter(
  "upper",
  "uppercase",
  null,
  (s) => s.toUpperCase(),
  /^upper\s*case\s*[:=]\s*(.+)$|^(.+)\s+(?:to|in)\s+upper\s*case$/i,
);
converter(
  "lower",
  "lowercase",
  null,
  (s) => s.toLowerCase(),
  /^lower\s*case\s*[:=]\s*(.+)$|^(.+)\s+(?:to|in)\s+lower\s*case$/i,
);
converter(
  "title",
  "title case",
  null,
  (s) =>
    s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
  /^title\s*case\s*[:=]\s*(.+)$|^(.+)\s+(?:to|in)\s+title\s*case$/i,
);

const toBinary = (s) =>
  [...new TextEncoder().encode(s)]
    .map((b) => b.toString(2).padStart(8, "0"))
    .join(" ");
const fromBinary = (s) => {
  const groups = s.trim().split(/\s+/).filter(Boolean);
  if (groups.some((b) => !/^[01]+$/.test(b)))
    throw new Error("binary digits only");
  return new TextDecoder().decode(
    Uint8Array.from(groups, (b) => parseInt(b, 2)),
  );
};
const binModes = [
  ["encode", toBinary],
  ["decode", fromBinary, "paste binary"],
];
converter(
  "textbin",
  "binary",
  null,
  null,
  /^(?:text\s+to\s+binary|binary\s+encode|string\s+to\s+binary)\s+(.+)$|^(?!\d+\s+(?:to|in)\s+binary$)(.+)\s+(?:to|in)\s+binary$/i,
  { mono: true, modes: binModes },
);
converter(
  "bintext",
  "binary",
  null,
  null,
  /^binary\s+(?:to\s+text|decode)\s+([01\s]+)$|^([01]{8}(?:\s+[01]{8})*)$/i,
  { mono: true, modes: binModes, mode: 1 },
);

const MORSE = {
  a: ".-",
  b: "-...",
  c: "-.-.",
  d: "-..",
  e: ".",
  f: "..-.",
  g: "--.",
  h: "....",
  i: "..",
  j: ".---",
  k: "-.-",
  l: ".-..",
  m: "--",
  n: "-.",
  o: "---",
  p: ".--.",
  q: "--.-",
  r: ".-.",
  s: "...",
  t: "-",
  u: "..-",
  v: "...-",
  w: ".--",
  x: "-..-",
  y: "-.--",
  z: "--..",
  0: "-----",
  1: ".----",
  2: "..---",
  3: "...--",
  4: "....-",
  5: ".....",
  6: "-....",
  7: "--...",
  8: "---..",
  9: "----.",
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "!": "-.-.--",
  "/": "-..-.",
  "@": ".--.-.",
  "-": "-....-",
};
const RMORSE = Object.fromEntries(
  Object.entries(MORSE).map(([k, v]) => [v, k]),
);
converter(
  "morse",
  "morse code",
  "type text or morse",
  (s) => {
    if (/^[.\-/\s]+$/.test(s.trim()))
      return s
        .trim()
        .split(/\s*\/\s*|\s{2,}/)
        .map((w) =>
          w
            .trim()
            .split(/\s+/)
            .map((c) => RMORSE[c] || "")
            .join(""),
        )
        .join(" ");
    return s
      .toLowerCase()
      .split("")
      .map((c) => (c === " " ? "/" : MORSE[c] != null ? MORSE[c] : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  },
  /^(.+?)\s+(?:in|to)\s+morse(?:\s+code)?$|^morse(?:\s+code)?\s*[:=]\s*(.+)$|^(?:decode|translate)\s+morse(?:\s+code)?\s+(.+)$/i,
  { mono: true, cls: "morse" },
);

const NATO = {
  a: "Alfa",
  b: "Bravo",
  c: "Charlie",
  d: "Delta",
  e: "Echo",
  f: "Foxtrot",
  g: "Golf",
  h: "Hotel",
  i: "India",
  j: "Juliett",
  k: "Kilo",
  l: "Lima",
  m: "Mike",
  n: "November",
  o: "Oscar",
  p: "Papa",
  q: "Quebec",
  r: "Romeo",
  s: "Sierra",
  t: "Tango",
  u: "Uniform",
  v: "Victor",
  w: "Whiskey",
  x: "X-ray",
  y: "Yankee",
  z: "Zulu",
};
converter(
  "nato",
  "nato phonetic",
  null,
  (s) =>
    s
      .toLowerCase()
      .split("")
      .map((c) => NATO[c] || (/[0-9]/.test(c) ? c : c === " " ? "|" : ""))
      .filter(Boolean)
      .join(" "),
  /^nato\s+phonetic\s+(?:for\s+)?(.+)$|^phonetic\s+alphabet\s+(?:for\s+)?(.+)$|^(?:nato|phonetic)\s*[:=]\s*(.+)$|^spell\s+(.+)\s+(?:phonetically|in\s+nato)$/i,
);

converter(
  "slug",
  "slugify",
  "url-friendly slug",
  (s) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  /^slugify\s+(.+)$|^slug\s*[:=]\s*(.+)$|^(.+)\s+to\s+(?:a\s+)?slug$/i,
  { mono: true },
);
converter(
  "htmlenc",
  "html entity encode",
  null,
  (s) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  /^html\s+(?:entity\s+)?encode\s+(.+)$/i,
  { mono: true },
);

const numTick = (el, text) => {
  const prev = el.textContent;
  if (prev === text) return;
  el.textContent = text;
  if (!prev || !el.isConnected) return;
  el.animate(
    calmMotion()
      ? [{ opacity: 0.55 }, { opacity: 1 }]
      : [
          { opacity: 0.4, filter: "blur(2px)", translate: "0 0.18em" },
          { opacity: 1, filter: "blur(0)", translate: "0 0" },
        ],
    { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  );
};

const colorPanel = (swatch) => {
  const vals = {};
  const rows = ["hex", "rgb", "hsl"].map((l) => {
    const v = h("span", { class: "w-mono w-color-val" });
    vals[l] = v;
    return h(
      "div",
      { class: "w-color-row" },
      h("span", { class: "w-color-label" }, l),
      v,
      copyBtn(() => v.textContent, `copy ${l}`),
    );
  });
  const set = ({ r, g, b }) => {
    const hex = rgbToHex(r, g, b);
    const hsl = rgbToHsl(r, g, b);
    swatch.style.backgroundColor = hex;
    numTick(vals.hex, hex.toUpperCase());
    numTick(vals.rgb, `rgb(${r}, ${g}, ${b})`);
    numTick(vals.hsl, `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`);
  };
  return {
    el: h(
      "div",
      { class: "w-color-grid" },
      swatch,
      h("div", { class: "w-color-rows" }, ...rows),
    ),
    set,
  };
};

reg({
  id: "colorinfo",
  match: (q) => {
    const m = q
      .trim()
      .match(
        /^#?([0-9a-f]{3}|[0-9a-f]{6})$|^(?:hex|color)\s+#?([0-9a-f]{3}|[0-9a-f]{6})$|^rgb\(?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/i,
      );
    if (!m) return null;
    if (m[3] != null) return { rgb: { r: +m[3], g: +m[4], b: +m[5] } };
    return { rgb: hexToRgb(m[1] || m[2]) };
  },
  build: ({ rgb }) => {
    if (!rgb) return null;
    const hslToRgb = (hh, s, l) => {
      const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
      const f = (n) => {
        const k = (n + hh / 30) % 12;
        return Math.round(
          255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
        );
      };
      return { r: f(0), g: f(8), b: f(4) };
    };
    const swatch = h("div", { class: "w-swatch" });
    const panel = colorPanel(swatch);
    const base = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const steps = [92, 82, 70, 58, 46, 36, 26, 16];
    const nearest = steps.reduce((best, l) =>
      Math.abs(l - base.l) < Math.abs(best - base.l) ? l : best,
    );
    const shades = steps.map((l) =>
      l === nearest ? rgb : hslToRgb(base.h, base.s, l),
    );
    const buttons = shades.map((c) => {
      const hex = rgbToHex(c.r, c.g, c.b);
      const b = h("button", {
        class: `w-shade${luminance(c) > 0.4 ? " light" : ""}`,
        type: "button",
        title: hex.toUpperCase(),
        "aria-label": `show ${hex.toUpperCase()}`,
        style: { backgroundColor: hex },
      });
      b.onclick = () => pick(b, c);
      return b;
    });
    const pick = (btn, c) => {
      for (const b of buttons)
        b.setAttribute("aria-pressed", String(b === btn));
      panel.set(c);
    };
    pick(buttons[shades.indexOf(rgb)], rgb);
    return card(
      "color",
      null,
      panel.el,
      h(
        "div",
        { class: "w-shades", role: "group", "aria-label": "shades" },
        ...buttons,
      ),
    );
  },
});

reg({
  id: "randomcolor",
  match: (q) => /^random\s+(?:color|colour|hex)$/i.test(q.trim()),
  build: () => {
    const swatch = h("button", {
      class: "w-swatch w-swatch-btn",
      type: "button",
      "aria-label": "generate another color",
    });
    const panel = colorPanel(swatch);
    const recent = h("div", {
      class: "w-recent-colors",
      role: "group",
      "aria-label": "recent colors",
    });
    const show = (c) => {
      panel.set(c);
      const hex = rgbToHex(c.r, c.g, c.b);
      const dot = h("button", {
        class: "w-recent-dot",
        type: "button",
        title: hex.toUpperCase(),
        "aria-label": `show ${hex.toUpperCase()} again`,
        style: { backgroundColor: hex },
      });
      const mark = () => {
        for (const d of recent.children)
          d.setAttribute("aria-pressed", String(d === dot));
      };
      dot.onclick = () => {
        panel.set(c);
        mark();
      };
      recent.prepend(dot);
      mark();
      while (recent.children.length > 8) recent.lastElementChild.remove();
    };
    const go = () =>
      show({
        r: Math.round(Math.random() * 255),
        g: Math.round(Math.random() * 255),
        b: Math.round(Math.random() * 255),
      });
    swatch.onclick = go;
    go();
    return card(
      "random color",
      null,
      panel.el,
      h(
        "div",
        { class: "w-random-color-foot" },
        recent,
        h("button", {
          class: "w-btn primary",
          type: "button",
          html: "generate color",
          onclick: go,
        }),
      ),
    );
  },
});

reg({
  id: "contrast",
  match: (q) =>
    /^(?:contrast\s+(?:checker|ratio)|wcag\s+contrast|color\s+contrast)$/i.test(
      q.trim(),
    ),
  build: () => {
    const X = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>`;
    const SWAP = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16"/><path d="M4 7l3 -3l3 3"/><path d="M17 20v-16"/><path d="M14 17l3 3l3 -3"/></svg>`;
    const picker = (value, label) => {
      const input = h("input", {
        type: "color",
        class: "w-color-pick",
        value,
        "aria-label": `pick ${label} color`,
      });
      const hex = h("input", {
        class: "w-mono w-contrast-hex",
        value: value.toUpperCase(),
        spellcheck: "false",
        autocomplete: "off",
        maxlength: "7",
        "aria-label": `${label} hex`,
      });
      return {
        input,
        hex,
        el: h(
          "div",
          { class: "w-contrast-pick" },
          input,
          h(
            "span",
            { class: "w-contrast-pick-text" },
            h("span", { class: "w-contrast-pick-label" }, label),
            hex,
          ),
        ),
      };
    };
    const fg = picker("#cdd6f4", "text");
    const bg = picker("#1e1e2e", "background");
    const ratioNum = h("span", { class: "w-contrast-num" });
    const verdict = h("div", { class: "w-focal-cap" });
    const cell = (min) => {
      const word = h("span", { class: "w-grade-word" });
      return {
        min,
        word,
        el: h(
          "span",
          { class: "w-grade" },
          h(
            "span",
            { class: "w-grade-icon", "aria-hidden": "true" },
            h("span", { class: "w-grade-yes", html: CHECK }),
            h("span", { class: "w-grade-no", html: X }),
          ),
          word,
        ),
      };
    };
    const rows = [
      ["normal text", 4.5, 7],
      ["large text", 3, 4.5],
    ].map(([size, aa, aaa]) => ({ size, cells: [cell(aa), cell(aaa)] }));
    const table = h(
      "div",
      { class: "w-grades", role: "table", "aria-label": "WCAG results" },
      h(
        "div",
        { class: "w-grades-row", role: "row" },
        h("span", { role: "columnheader" }),
        h("span", { class: "w-grades-head", role: "columnheader" }, "AA"),
        h("span", { class: "w-grades-head", role: "columnheader" }, "AAA"),
      ),
      ...rows.map((r) =>
        h(
          "div",
          { class: "w-grades-row", role: "row" },
          h("span", { class: "w-grades-size", role: "rowheader" }, r.size),
          ...r.cells.map((c) => {
            c.el.setAttribute("role", "cell");
            return c.el;
          }),
        ),
      ),
    );
    const preview = h(
      "div",
      { class: "w-contrast-preview" },
      h("span", { class: "w-contrast-large" }, "Large text"),
      h(
        "span",
        { class: "w-contrast-body" },
        "Body text at a normal reading size.",
      ),
    );
    const run = () => {
      const l1 = luminance(hexToRgb(fg.input.value));
      const l2 = luminance(hexToRgb(bg.input.value));
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const shown = Math.floor(ratio * 100) / 100;
      numTick(ratioNum, shown.toFixed(2));
      verdict.textContent =
        ratio >= 7
          ? "passes every level"
          : ratio >= 4.5
            ? "fine for body text"
            : ratio >= 3
              ? "large text only"
              : "too low for any text";
      for (const p of [fg, bg])
        if (document.activeElement !== p.hex)
          p.hex.value = p.input.value.toUpperCase();
      preview.style.color = fg.input.value;
      preview.style.backgroundColor = bg.input.value;
      for (const c of rows.flatMap((r) => r.cells)) {
        const ok = ratio >= c.min;
        c.el.classList.toggle("pass", ok);
        c.word.textContent = ok ? "pass" : "fail";
      }
    };
    for (const p of [fg, bg]) {
      p.input.oninput = run;
      p.hex.oninput = () => {
        const v = p.hex.value.trim().replace(/^#?/, "#");
        const rgb = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) && hexToRgb(v);
        p.hex.setAttribute("aria-invalid", String(!rgb));
        if (!rgb) return;
        p.input.value = rgbToHex(rgb.r, rgb.g, rgb.b);
        run();
      };
      p.hex.addEventListener("blur", () => {
        p.hex.removeAttribute("aria-invalid");
        p.hex.value = p.input.value.toUpperCase();
      });
    }
    const swap = h("button", {
      class: "w-contrast-swap",
      type: "button",
      "aria-label": "swap text and background",
      title: "swap colors",
      html: SWAP,
    });
    swap.onclick = () => {
      [fg.input.value, bg.input.value] = [bg.input.value, fg.input.value];
      swap.classList.toggle("flipped");
      run();
    };
    run();
    return card(
      "contrast checker",
      null,
      h(
        "div",
        { class: "w-contrast-top" },
        h(
          "div",
          { class: "w-focal", role: "status", "aria-live": "polite" },
          h(
            "div",
            { class: "w-big w-contrast-ratio" },
            ratioNum,
            h("span", { class: "w-nres-op" }, ":"),
            "1",
          ),
          verdict,
        ),
        table,
      ),
      preview,
      h("div", { class: "w-contrast-picks" }, fg.el, swap, bg.el),
    );
  },
});

reg({
  id: "gradient",
  match: (q) =>
    /^(?:css\s+)?gradient(?:\s+generator|\s+maker)?$/i.test(q.trim()),
  build: () => {
    let angle = 135;
    let mode = "linear";
    const stops = [
      { color: "#89b4fa", pos: 0 },
      { color: "#cba6f7", pos: 100 },
    ];
    const preview = h("div", { class: "w-gradient-preview" });
    const track = h("div", { class: "w-grad-track" });
    const code = h("div", { class: "w-mono w-grad-code" });
    const angleVal = h("span", { class: "w-grad-angle-val" });
    const needle = h("span", { class: "w-grad-needle" });
    const dial = h(
      "div",
      {
        class: "w-grad-dial",
        role: "slider",
        tabindex: "0",
        "aria-label": "angle",
        "aria-valuemin": "0",
        "aria-valuemax": "359",
      },
      needle,
    );
    const stopList = () =>
      [...stops]
        .sort((a, b) => a.pos - b.pos)
        .map((s) => `${s.color} ${Math.round(s.pos)}%`)
        .join(", ");
    const run = () => {
      const css =
        mode === "linear"
          ? `linear-gradient(${angle}deg, ${stopList()})`
          : `radial-gradient(circle, ${stopList()})`;
      preview.style.background = css;
      track.style.background = `linear-gradient(90deg, ${stopList()})`;
      code.textContent = `background: ${css};`;
      angleVal.textContent = `${angle}°`;
      needle.style.rotate = `${angle}deg`;
      dial.setAttribute("aria-valuenow", String(angle));
      dial.setAttribute("aria-valuetext", `${angle} degrees`);
      for (const s of stops) {
        s.handle.style.left = `${s.pos}%`;
        s.handle.style.setProperty("--stop", s.color);
        s.handle.setAttribute("aria-valuenow", String(Math.round(s.pos)));
      }
    };
    for (const [i, s] of stops.entries()) {
      const input = h("input", {
        type: "color",
        class: "w-grad-color",
        value: s.color,
        tabindex: "-1",
        "aria-hidden": "true",
      });
      const openPicker = () => {
        try {
          input.showPicker();
        } catch {
          input.click();
        }
      };
      input.oninput = () => {
        s.color = input.value;
        run();
      };
      const handle = h(
        "div",
        {
          class: "w-grad-handle",
          role: "slider",
          tabindex: "0",
          "aria-label": `${i ? "end" : "start"} color stop, press enter to change color`,
          "aria-valuemin": "0",
          "aria-valuemax": "100",
        },
        input,
      );
      s.handle = handle;
      let drag = null;
      handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        handle.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, moved: false };
        handle.classList.add("grabbing");
      });
      handle.addEventListener("pointermove", (e) => {
        if (!drag) return;
        if (!drag.moved && Math.abs(e.clientX - drag.x) < 3) return;
        drag.moved = true;
        const r = track.getBoundingClientRect();
        s.pos = Math.max(
          0,
          Math.min(100, ((e.clientX - r.left) / r.width) * 100),
        );
        run();
      });
      const end = () => {
        if (!drag) return;
        const { moved } = drag;
        drag = null;
        handle.classList.remove("grabbing");
        if (!moved) openPicker();
      };
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", () => {
        drag = null;
        handle.classList.remove("grabbing");
      });
      handle.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
          return;
        }
        const d =
          e.key === "ArrowRight" || e.key === "ArrowUp"
            ? step
            : e.key === "ArrowLeft" || e.key === "ArrowDown"
              ? -step
              : 0;
        if (!d) return;
        e.preventDefault();
        s.pos = Math.max(0, Math.min(100, Math.round(s.pos + d)));
        run();
      });
      track.append(handle);
    }
    let turning = false;
    const setFromPointer = (e, snap) => {
      const r = dial.getBoundingClientRect();
      const deg =
        (Math.atan2(
          e.clientX - (r.left + r.width / 2),
          -(e.clientY - (r.top + r.height / 2)),
        ) *
          180) /
        Math.PI;
      const a = Math.round((deg + 360) % 360);
      angle = snap ? (Math.round(a / 15) * 15) % 360 : a;
      run();
    };
    dial.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || mode !== "linear") return;
      dial.setPointerCapture(e.pointerId);
      turning = true;
      dial.classList.add("grabbing");
      setFromPointer(e, e.shiftKey);
    });
    dial.addEventListener("pointermove", (e) => {
      if (turning) setFromPointer(e, e.shiftKey);
    });
    for (const ev of ["pointerup", "pointercancel"])
      dial.addEventListener(ev, () => {
        turning = false;
        dial.classList.remove("grabbing");
      });
    dial.addEventListener("keydown", (e) => {
      if (mode !== "linear") return;
      const step = e.shiftKey ? 15 : 1;
      const d =
        e.key === "ArrowRight" || e.key === "ArrowUp"
          ? step
          : e.key === "ArrowLeft" || e.key === "ArrowDown"
            ? -step
            : 0;
      if (!d) return;
      e.preventDefault();
      angle = (angle + d + 360) % 360;
      run();
    });
    const modes = segmented("type", ["linear", "radial"], mode, (m) => {
      mode = m;
      dial.setAttribute("aria-disabled", String(m !== "linear"));
      dialWrap.classList.toggle("off", m !== "linear");
      run();
    });
    modes.classList.add("fit");
    const dialWrap = h("div", { class: "w-grad-angle" }, dial, angleVal);
    run();
    return card(
      "css gradient",
      "drag the stops, click one to change its color",
      h(
        "div",
        { class: "w-grad-canvas" },
        preview,
        h("div", { class: "w-grad-track-wrap" }, track),
      ),
      h("div", { class: "w-grad-controls" }, modes, dialWrap),
      h(
        "div",
        { class: "w-grad-code-row" },
        code,
        copyBtn(() => code.textContent, "copy css"),
      ),
    );
  },
});

const CALC_CONSTS = {
  pi: Math.PI,
  π: Math.PI,
  tau: Math.PI * 2,
  τ: Math.PI * 2,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
};

const CALC_FUNCS = {
  sin: (a, d) => Math.sin(d ? (a * Math.PI) / 180 : a),
  cos: (a, d) => Math.cos(d ? (a * Math.PI) / 180 : a),
  tan: (a, d) => Math.tan(d ? (a * Math.PI) / 180 : a),
  asin: (a, d) => (d ? (Math.asin(a) * 180) / Math.PI : Math.asin(a)),
  acos: (a, d) => (d ? (Math.acos(a) * 180) / Math.PI : Math.acos(a)),
  atan: (a, d) => (d ? (Math.atan(a) * 180) / Math.PI : Math.atan(a)),
  sinh: (a) => Math.sinh(a),
  cosh: (a) => Math.cosh(a),
  tanh: (a) => Math.tanh(a),
  ln: (a) => Math.log(a),
  log: (a) => Math.log10(a),
  log2: (a) => Math.log2(a),
  sqrt: (a) => Math.sqrt(a),
  cbrt: (a) => Math.cbrt(a),
  abs: (a) => Math.abs(a),
  exp: (a) => Math.exp(a),
  ceil: (a) => Math.ceil(a),
  floor: (a) => Math.floor(a),
  round: (a) => Math.round(a),
};

const CALC_PREC = { "+": 2, "-": 2, "*": 3, "/": 3, mod: 3, "^": 4, "u-": 4 };
const CALC_RIGHT = { "^": true, "u-": true };

const calcGamma = (z) => {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * calcGamma(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x;
};

const calcFact = (n) => {
  if (n < 0 && Number.isInteger(n)) throw new Error("domain");
  if (!Number.isInteger(n)) return calcGamma(n + 1);
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
};

const calcTokenize = (src) => {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      if ((s[j] === "e" || s[j] === "E") && /[0-9+-]/.test(s[j + 1] || "")) {
        j += 2;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      const num = s.slice(i, j);
      const val = Number(num);
      if (!Number.isFinite(val)) throw new Error(`bad number: ${num}`);
      tokens.push({ t: "num", v: val });
      i = j;
      continue;
    }
    if (/[a-zπτ]/i.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-z0-9]/i.test(s[j])) j++;
      const name = s.slice(i, j).toLowerCase();
      if (name in CALC_FUNCS) tokens.push({ t: "func", v: name });
      else if (name in CALC_CONSTS)
        tokens.push({ t: "num", v: CALC_CONSTS[name] });
      else if (name === "mod") tokens.push({ t: "op", v: "mod" });
      else throw new Error(`unknown: ${name}`);
      i = j;
      continue;
    }
    if ("+-*/^%!()".includes(c)) {
      tokens.push({ t: c === "(" ? "lp" : c === ")" ? "rp" : "op", v: c });
      i++;
      continue;
    }
    throw new Error(`bad char: ${c}`);
  }
  return tokens;
};

const calcApplyOp = (out, ops, v) => {
  const p = CALC_PREC[v];
  const right = CALC_RIGHT[v];
  while (ops.length) {
    const top = ops[ops.length - 1];
    if (top.t === "func") {
      out.push(ops.pop());
      continue;
    }
    if (top.t !== "op") break;
    const tp = CALC_PREC[top.v];
    if (tp > p || (tp === p && !right)) out.push(ops.pop());
    else break;
  }
  ops.push({ t: "op", v });
};

const calcToRPN = (tokens) => {
  const out = [];
  const ops = [];
  let prev = null;
  const mulIfValue = () => {
    if (prev === "num" || prev === "rp") calcApplyOp(out, ops, "*");
  };
  for (const tk of tokens) {
    if (tk.t === "num") {
      mulIfValue();
      out.push(tk);
      prev = "num";
    } else if (tk.t === "func") {
      mulIfValue();
      ops.push(tk);
      prev = "func";
    } else if (tk.t === "lp") {
      mulIfValue();
      ops.push(tk);
      prev = "lp";
    } else if (tk.t === "rp") {
      while (ops.length && ops[ops.length - 1].t !== "lp") out.push(ops.pop());
      if (!ops.length) throw new Error("mismatched )");
      ops.pop();
      if (ops.length && ops[ops.length - 1].t === "func") out.push(ops.pop());
      prev = "rp";
    } else {
      let v = tk.v;
      if (v === "!" || v === "%") {
        out.push({ t: "op", v });
        prev = "rp";
        continue;
      }
      if (
        (v === "-" || v === "+") &&
        (prev === null || prev === "op" || prev === "lp" || prev === "func")
      ) {
        if (v === "+") continue;
        v = "u-";
      }
      calcApplyOp(out, ops, v);
      prev = "op";
    }
  }
  while (ops.length) {
    const o = ops.pop();
    if (o.t === "lp") throw new Error("mismatched (");
    out.push(o);
  }
  return out;
};

const calcEvalRPN = (rpn, deg) => {
  const st = [];
  for (const tk of rpn) {
    if (tk.t === "num") {
      st.push(tk.v);
      continue;
    }
    if (tk.t === "func") {
      if (!st.length) throw new Error("missing arg");
      st.push(CALC_FUNCS[tk.v](st.pop(), deg));
      continue;
    }
    const v = tk.v;
    if (v === "u-" || v === "!" || v === "%") {
      if (!st.length) throw new Error("missing operand");
      const a = st.pop();
      st.push(v === "u-" ? -a : v === "!" ? calcFact(a) : a / 100);
      continue;
    }
    if (st.length < 2) throw new Error("missing operand");
    const b = st.pop();
    const a = st.pop();
    st.push(
      v === "+"
        ? a + b
        : v === "-"
          ? a - b
          : v === "*"
            ? a * b
            : v === "/"
              ? a / b
              : v === "^"
                ? a ** b
                : v === "mod"
                  ? a % b
                  : NaN,
    );
  }
  if (st.length !== 1) throw new Error("invalid expression");
  return st[0];
};

const calcEvaluate = (expr, deg) => {
  const open =
    (expr.match(/\(/g)?.length ?? 0) - (expr.match(/\)/g)?.length ?? 0);
  const rpn = calcToRPN(calcTokenize(expr + ")".repeat(Math.max(0, open))));
  if (!rpn.length) throw new Error("empty");
  const r = calcEvalRPN(rpn, deg);
  if (typeof r !== "number" || Number.isNaN(r)) throw new Error("not a number");
  return r;
};

const calcFmt = (n) => {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return String(Number(n.toPrecision(12)));
};

reg({
  id: "calculator",
  match: (q) => /^(?:calculator|calc|scientific\s+calculator)$/i.test(q.trim()),
  build: () => {
    const HKEY = "ms-calc-history";
    let history = [];
    try {
      const stored = JSON.parse(localStorage.getItem(HKEY) || "[]");
      if (Array.isArray(stored)) history = stored.slice(-50);
    } catch {}
    let mem = 0;
    let deg = true;
    try {
      deg = localStorage.getItem("ms-calc-deg") !== "rad";
    } catch {}
    let histNav = -1;
    let fresh = false;
    const startsOperand = /^[\d.(a-zπ]/i;

    const replay = (el, cls) => {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    };
    const pretty = (s) => s.replace(/\*/g, "×").replace(/\//g, "÷");

    const expr = h("input", {
      class: "w-calc2-expr",
      placeholder: "0",
      spellcheck: "false",
      autocomplete: "off",
      autocapitalize: "off",
      inputmode: "decimal",
      "aria-label": "calculator expression",
    });
    const eqLine = h("div", { class: "w-calc2-eq", "aria-hidden": "true" });
    const preview = h("div", {
      class: "w-calc2-preview",
      role: "status",
      "aria-live": "polite",
    });
    const display = h("div", { class: "w-calc2-display" });
    const copy = copyBtn(
      () => preview.textContent.replace(/^=\s*/, "") || expr.value,
      "copy result",
    );
    const memTag = h("span", {
      class: "w-calc2-memtag",
      "aria-live": "polite",
    });

    const degBtn = h(
      "button",
      {
        class: "w-calc2-deg",
        type: "button",
        role: "switch",
        "aria-label": "use radians",
        title: "Switch between degrees and radians",
      },
      h("span", { class: "w-calc2-deg-opt" }, "deg"),
      h("span", { class: "w-calc2-deg-opt" }, "rad"),
    );
    const syncDeg = () => {
      degBtn.dataset.unit = deg ? "deg" : "rad";
      degBtn.setAttribute("aria-checked", String(!deg));
    };
    syncDeg();

    const fitExpr = () => {
      const n = expr.value.length;
      expr.dataset.size = n > 22 ? "s" : n > 14 ? "m" : "l";
    };

    const updatePreview = () => {
      const s = expr.value.trim();
      display.classList.remove("err");
      fitExpr();
      if (!s) {
        preview.textContent = "";
        return;
      }
      try {
        const r = calcFmt(calcEvaluate(s, deg));
        preview.textContent = r === s ? "" : `= ${r}`;
      } catch {
        preview.textContent = "";
      }
    };

    const insert = (text) => {
      if (fresh && startsOperand.test(text)) expr.value = "";
      fresh = false;
      const start = expr.selectionStart ?? expr.value.length;
      const end = expr.selectionEnd ?? expr.value.length;
      expr.value = expr.value.slice(0, start) + text + expr.value.slice(end);
      const caret = start + text.length;
      expr.focus();
      expr.setSelectionRange(caret, caret);
      histNav = -1;
      updatePreview();
    };

    const backspace = () => {
      const start = expr.selectionStart ?? expr.value.length;
      const end = expr.selectionEnd ?? expr.value.length;
      const from = start === end ? Math.max(0, start - 1) : start;
      expr.value = expr.value.slice(0, from) + expr.value.slice(end);
      expr.focus();
      expr.setSelectionRange(from, from);
      histNav = -1;
      updatePreview();
    };

    const clearAll = () => {
      expr.value = "";
      preview.textContent = "";
      eqLine.textContent = "";
      display.classList.remove("err");
      histNav = -1;
      fitExpr();
      expr.focus();
    };

    const toggleSign = () => {
      const m = expr.value.match(/(-?\d*\.?\d+)(?!.*\d)/);
      if (!m) return insert("-");
      const flipped = m[0].startsWith("-") ? m[0].slice(1) : `-${m[0]}`;
      expr.value =
        expr.value.slice(0, m.index) +
        flipped +
        expr.value.slice(m.index + m[0].length);
      updatePreview();
      expr.focus();
    };

    const histList = h("div", { class: "w-calc2-hist-list" });
    const renderHistory = () => {
      histList.replaceChildren();
      histWrap.hidden = !history.length;
      for (let i = history.length - 1; i >= 0; i--) {
        const it = history[i];
        const row = h(
          "button",
          {
            class: "w-calc2-hist-row",
            type: "button",
            title: "insert this result",
          },
          h("span", { class: "w-calc2-hist-expr" }, pretty(it.expr)),
          h("span", { class: "w-calc2-hist-res" }, `= ${it.result}`),
        );
        row.onclick = () => insert(it.result);
        histList.append(row);
      }
    };
    const saveHistory = () => {
      try {
        localStorage.setItem(HKEY, JSON.stringify(history));
      } catch {}
    };

    const commit = () => {
      const s = expr.value.trim();
      if (!s) return;
      let r;
      try {
        r = calcEvaluate(s, deg);
      } catch {
        preview.textContent = "not a valid expression";
        display.classList.add("err");
        replay(display, "shake");
        return;
      }
      const res = calcFmt(r);
      const last = history[history.length - 1];
      if (!last || last.expr !== s || last.result !== res) {
        history.push({ expr: s, result: res });
        history = history.slice(-50);
        saveHistory();
        renderHistory();
      }
      eqLine.textContent = `${pretty(s)} =`;
      expr.value = res;
      fitExpr();
      expr.focus();
      expr.setSelectionRange(res.length, res.length);
      preview.textContent = "";
      display.classList.remove("err");
      histNav = -1;
      fresh = true;
      replay(display, "committed");
    };

    degBtn.onclick = () => {
      deg = !deg;
      syncDeg();
      try {
        localStorage.setItem("ms-calc-deg", deg ? "deg" : "rad");
      } catch {}
      updatePreview();
      expr.focus();
    };

    const sci = [
      ["(", "("],
      [")", ")"],
      ["x²", "^2"],
      ["xʸ", "^"],
      ["sin", "sin("],
      ["cos", "cos("],
      ["tan", "tan("],
      ["π", "pi"],
      ["asin", "asin("],
      ["acos", "acos("],
      ["atan", "atan("],
      ["e", "e"],
      ["ln", "ln("],
      ["log", "log("],
      ["√", "sqrt("],
      ["n!", "!"],
    ];
    const num = [
      ["C", "clear"],
      ["⌫", "back"],
      ["%", "%"],
      ["÷", "/"],
      ["7", "7"],
      ["8", "8"],
      ["9", "9"],
      ["×", "*"],
      ["4", "4"],
      ["5", "5"],
      ["6", "6"],
      ["−", "-"],
      ["1", "1"],
      ["2", "2"],
      ["3", "3"],
      ["+", "+"],
      ["±", "sign"],
      ["0", "0"],
      [".", "."],
    ];
    const keyLabels = {
      clear: "clear",
      back: "delete",
      sign: "change sign",
      "/": "divide",
      "*": "multiply",
      "-": "minus",
      "+": "plus",
      "%": "percent",
      "^2": "square",
      "^": "power",
      "!": "factorial",
      "sqrt(": "square root",
    };

    const keyFor = new Map();
    const makeKey = ([label, action], cls) => {
      const b = h(
        "button",
        {
          class: `w-calc2-key${cls}`,
          type: "button",
          "aria-label": keyLabels[action],
        },
        label,
      );
      b.onclick = () => {
        if (action === "clear") clearAll();
        else if (action === "back") backspace();
        else if (action === "sign") toggleSign();
        else insert(action);
      };
      keyFor.set(action, b);
      return b;
    };

    const numKeys = num.map((k) => {
      const cls = /^(?:clear|back|%)$/.test(k[1])
        ? " ctrl"
        : /^[/*+-]$/.test(k[1])
          ? " op"
          : "";
      return makeKey(k, cls);
    });
    const equals = h(
      "button",
      { class: "w-calc2-key eq", type: "button", "aria-label": "equals" },
      "=",
    );
    equals.onclick = commit;
    keyFor.set("=", equals);
    const numGrid = h("div", { class: "w-calc2-num" }, ...numKeys, equals);

    const flash = (key) => {
      const action =
        key === "Enter" || key === "="
          ? "="
          : key === "Backspace"
            ? "back"
            : key === "Escape"
              ? "clear"
              : key;
      const b = keyFor.get(action);
      if (!b) return;
      b.classList.add("is-pressed");
      clearTimeout(b._pressT);
      b._pressT = setTimeout(() => b.classList.remove("is-pressed"), 120);
    };

    const syncMem = () => {
      memTag.textContent = mem ? `m ${calcFmt(mem)}` : "";
      memTag.classList.toggle("on", mem !== 0);
    };
    const memKeys = [
      ["mc", "clear memory", () => (mem = 0)],
      ["mr", "recall memory", () => insert(calcFmt(mem))],
      [
        "m+",
        "add to memory",
        () => {
          try {
            mem += calcEvaluate(expr.value.trim() || "0", deg);
          } catch {}
        },
      ],
      [
        "m−",
        "subtract from memory",
        () => {
          try {
            mem -= calcEvaluate(expr.value.trim() || "0", deg);
          } catch {}
        },
      ],
    ].map(([l, label, fn]) => {
      const b = h(
        "button",
        { class: "w-calc2-key mem", type: "button", "aria-label": label },
        l,
      );
      b.onclick = () => {
        fn();
        syncMem();
        if (l !== "mr") expr.focus();
      };
      return b;
    });
    const sciGrid = h(
      "div",
      { class: "w-calc2-sci" },
      ...memKeys,
      ...sci.map((k) => makeKey(k, " fn")),
    );

    const histClear = h(
      "button",
      {
        class: "w-calc2-hist-clear",
        type: "button",
        "aria-label": "Clear history",
      },
      "clear",
    );
    histClear.onclick = () => {
      history = [];
      saveHistory();
      renderHistory();
      expr.focus();
    };

    expr.addEventListener("input", () => {
      fresh = false;
      histNav = -1;
      updatePreview();
    });
    expr.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      flash(e.key);
      if (fresh && e.key.length === 1 && startsOperand.test(e.key)) {
        expr.value = "";
        fresh = false;
      }
      if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearAll();
      } else if (e.key === "ArrowUp") {
        if (!history.length) return;
        e.preventDefault();
        if (histNav === -1) histNav = history.length;
        histNav = Math.max(0, histNav - 1);
        expr.value = history[histNav].expr;
        expr.setSelectionRange(expr.value.length, expr.value.length);
        updatePreview();
      } else if (e.key === "ArrowDown") {
        if (histNav === -1) return;
        e.preventDefault();
        histNav++;
        if (histNav >= history.length) {
          histNav = -1;
          expr.value = "";
        } else expr.value = history[histNav].expr;
        expr.setSelectionRange(expr.value.length, expr.value.length);
        updatePreview();
      }
    });

    const histWrap = h(
      "div",
      { class: "w-calc2-hist" },
      h(
        "div",
        { class: "w-calc2-hist-head" },
        h("span", null, "history"),
        histClear,
      ),
      histList,
    );

    display.append(
      h("div", { class: "w-calc2-top" }, degBtn, memTag, copy),
      eqLine,
      expr,
      preview,
    );
    fitExpr();

    const root = card(
      "calculator",
      "scientific",
      h(
        "div",
        { class: "w-calc2" },
        display,
        h(
          "div",
          { class: "w-calc2-body" },
          h("div", { class: "w-calc2-grids" }, sciGrid, numGrid),
          histWrap,
        ),
      ),
    );

    const onDoc = (e) => {
      if (!root.isConnected) {
        document.removeEventListener("keydown", onDoc);
        return;
      }
      const ae = document.activeElement;
      if (ae === expr) return;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1 && /[0-9.+\-*/^%()!]/.test(e.key)) {
        e.preventDefault();
        flash(e.key);
        insert(e.key);
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        flash(e.key);
        expr.focus();
        commit();
      }
    };
    document.addEventListener("keydown", onDoc);

    renderHistory();
    let focusTries = 0;
    const focusWhenReady = () => {
      if (root.isConnected) expr.focus({ preventScroll: true });
      else if (focusTries++ < 30) setTimeout(focusWhenReady, 16);
    };
    setTimeout(focusWhenReady, 0);
    return root;
  },
});

const splitBar = (aLabel, bLabel) => {
  const aVal = h("span", { class: "w-split-val" });
  const bVal = h("span", { class: "w-split-val" });
  const bFill = h("div", { class: "w-split-b" });
  const el = h(
    "div",
    { class: "w-split" },
    h("div", { class: "w-split-bar", "aria-hidden": "true" }, bFill),
    h(
      "div",
      { class: "w-split-legend" },
      h("span", { class: "w-split-key a" }, aLabel, aVal),
      h("span", { class: "w-split-key b" }, bLabel, bVal),
    ),
  );
  const update = (a, b) => {
    const ok = a > 0 && b >= 0 && Number.isFinite(a + b);
    el.hidden = !ok;
    if (!ok) return;
    const share = b / (a + b);
    bFill.style.scale = `${share} 1`;
    numTick(aVal, `${Math.round((1 - share) * 100)}%`);
    numTick(bVal, `${Math.round(share * 100)}%`);
  };
  return { el, update };
};

const money = (n) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const calc = ({ id, title, sub, alt, fields, compute, visual, empty }) =>
  reg({
    id,
    match: (q) =>
      new RegExp(
        `^${id.replace(/_/g, "[\\s_-]*")}(?:\\s+calculator|\\s+calc)?$`,
        "i",
      ).test(q.trim()) || alt?.test(q.trim())
        ? {}
        : null,
    build: () => {
      const inputs = {};
      const focalVal = h("div", { class: "w-big w-calcf-val" });
      const focalLabel = h("div", { class: "w-focal-cap" });
      const hint = h("div", { class: "w-calcf-hint" }, empty);
      const list = h("dl", { class: "w-kv flush" });
      const rows = new Map();
      const vis = visual?.();
      const panel = h(
        "div",
        { class: "w-calcf-panel", role: "status", "aria-live": "polite" },
        h("div", { class: "w-focal" }, focalVal, focalLabel),
        hint,
        vis?.el,
        list,
      );
      const run = () => {
        const vals = {};
        for (const k in inputs) vals[k] = parseFloat(inputs[k].value);
        const res = compute(vals);
        panel.classList.toggle("is-empty", !res);
        list.hidden = !res?.rows.length;
        if (!res) {
          vis?.update(null);
          return;
        }
        focalLabel.textContent = res.label;
        numTick(focalVal, res.value);
        const seen = new Set(res.rows.map(([l]) => l));
        for (const [l, r] of rows)
          if (!seen.has(l)) {
            r.el.remove();
            rows.delete(l);
          }
        for (const [l, v] of res.rows) {
          let r = rows.get(l);
          if (!r) {
            const val = h("dd");
            r = {
              val,
              el: h("div", { class: "w-kv-row" }, h("dt", null, l), val),
            };
            rows.set(l, r);
          }
          list.append(r.el);
          numTick(r.val, v);
        }
        vis?.update(vals);
      };
      const grid = h(
        "div",
        { class: "w-form-grid w-calcf-grid" },
        ...fields.map((f) => {
          const inp = h("input", {
            class: `w-input w-nnum${f.pre ? " has-pre" : ""}${f.post ? " has-post" : ""}`,
            type: "number",
            inputmode: "decimal",
            placeholder: f.ph || "",
            value: f.def ?? "",
            min: "0",
            step: "any",
          });
          if (f.post) inp.style.setProperty("--post", `${f.post.length}ch`);
          inp.oninput = run;
          inputs[f.k] = inp;
          return h(
            "label",
            { class: "w-label col" },
            f.label,
            h(
              "span",
              { class: "w-calcf-field" },
              f.pre && h("span", { class: "w-calcf-affix pre" }, f.pre),
              inp,
              f.post && h("span", { class: "w-calcf-affix post" }, f.post),
            ),
          );
        }),
      );
      run();
      return card(title, sub, grid, panel);
    },
  });

calc({
  id: "bmi",
  title: "bmi calculator",
  sub: "body mass index",
  empty: "enter your weight and height",
  fields: [
    { k: "w", label: "weight", ph: "70", def: 70, post: "kg" },
    { k: "h", label: "height", ph: "175", def: 175, post: "cm" },
  ],
  compute: ({ w, h: ht }) => {
    if (!(w > 0) || !(ht > 0)) return null;
    const m2 = (ht / 100) ** 2;
    return {
      value: (w / m2).toFixed(1),
      label: "bmi",
      rows: [
        [
          "healthy weight",
          `${Math.round(18.5 * m2)} to ${Math.round(24.9 * m2)} kg`,
        ],
      ],
    };
  },
  visual: () => {
    const lo = 12;
    const hi = 40;
    const bands = [
      ["underweight", 18.5, "under"],
      ["normal", 25, "normal"],
      ["overweight", 30, "over"],
      ["obese", hi, "obese"],
    ];
    let from = lo;
    const segs = bands.map(([name, to, short]) => {
      const grow = String(to - from);
      const bar = h("div", {
        class: `w-bmi-seg ${short}`,
        style: { flexGrow: grow },
      });
      const label = h(
        "div",
        { class: "w-bmi-label", style: { flexGrow: grow } },
        h("span", { class: "w-bmi-full" }, name),
        h("span", { class: "w-bmi-short" }, short),
      );
      from = to;
      return { bar, label, to };
    });
    const marker = h("div", { class: "w-bmi-marker" });
    const el = h(
      "div",
      { class: "w-bmi", "aria-hidden": "true" },
      h("div", { class: "w-bmi-track" }, ...segs.map((s) => s.bar), marker),
      h("div", { class: "w-bmi-labels" }, ...segs.map((s) => s.label)),
    );
    return {
      el,
      update: (vals) => {
        const bmi = vals && vals.w / (vals.h / 100) ** 2;
        const ok = vals?.w > 0 && vals?.h > 0 && Number.isFinite(bmi);
        el.hidden = !ok;
        if (!ok) return;
        const t = Math.max(0, Math.min(1, (bmi - lo) / (hi - lo)));
        marker.style.left = `${(t * 100).toFixed(2)}%`;
        const active = segs.find((s) => bmi < s.to) ?? segs[segs.length - 1];
        for (const s of segs) s.label.classList.toggle("on", s === active);
      },
    };
  },
});

calc({
  id: "tip",
  title: "tip calculator",
  empty: "enter the bill amount",
  fields: [
    { k: "bill", label: "bill", ph: "50", def: 50, pre: "$" },
    { k: "pct", label: "tip", ph: "18", def: 18, post: "%" },
    { k: "split", label: "people", ph: "1", def: 1 },
  ],
  compute: ({ bill, pct, split }) => {
    if (!(bill > 0)) return null;
    const tip = bill * ((pct || 0) / 100);
    const total = bill + tip;
    const people = Math.max(1, Math.round(split) || 1);
    return {
      value: money(tip),
      label: "tip",
      rows: [
        ["total", money(total)],
        ...(people > 1
          ? [
              ["tip per person", money(tip / people)],
              ["total per person", money(total / people)],
            ]
          : []),
      ],
    };
  },
});

calc({
  id: "loan",
  title: "loan calculator",
  alt: /^(?:mortgage|loan)\s+calculator$/i,
  empty: "enter the amount and term",
  fields: [
    { k: "p", label: "amount", ph: "20000", def: 20000, pre: "$" },
    { k: "rate", label: "interest rate", ph: "5", def: 5, post: "%" },
    { k: "years", label: "term", ph: "5", def: 5, post: "years" },
  ],
  compute: ({ p, rate, years }) => {
    if (!(p > 0) || !(years > 0)) return null;
    const r = (rate || 0) / 100 / 12;
    const n = years * 12;
    const m = r ? (p * r) / (1 - (1 + r) ** -n) : p / n;
    return {
      value: money(m),
      label: `per month for ${Math.round(n)} months`,
      rows: [
        ["total interest", money(m * n - p)],
        ["total paid", money(m * n)],
      ],
    };
  },
  visual: () => {
    const s = splitBar("principal", "interest");
    return {
      el: s.el,
      update: (v) => {
        if (!v) return s.update(0, 0);
        const r = (v.rate || 0) / 100 / 12;
        const n = v.years * 12;
        const m = r ? (v.p * r) / (1 - (1 + r) ** -n) : v.p / n;
        s.update(v.p, m * n - v.p);
      },
    };
  },
});

calc({
  id: "discount",
  title: "discount calculator",
  empty: "enter the original price",
  fields: [
    { k: "price", label: "price", ph: "80", def: 80, pre: "$" },
    { k: "pct", label: "discount", ph: "25", def: 25, post: "%" },
  ],
  compute: ({ price, pct }) => {
    if (!(price > 0)) return null;
    const save = price * (Math.min(100, pct || 0) / 100);
    return {
      value: money(price - save),
      label: "you pay",
      rows: [["you save", money(save)]],
    };
  },
});

reg({
  id: "percent",
  match: (q) => {
    let m = q.match(
      /^(?:what(?:'s| is))?\s*(\d+(?:\.\d+)?)\s*%\s+of\s+(\d+(?:\.\d+)?)$/i,
    );
    if (m) return { kind: "of", a: +m[1], b: +m[2] };
    m = q.match(/^percent(?:age)?\s+calculator$/i);
    if (m) return { kind: "tool" };
    return null;
  },
  build: (p) => {
    const fmt = (x) =>
      Number.isFinite(x)
        ? x.toLocaleString("en-US", { maximumFractionDigits: 4 })
        : "?";
    const field = (value, label) =>
      h("input", {
        class: "w-input w-nnum",
        type: "number",
        inputmode: "decimal",
        value: String(value),
        step: "any",
        "aria-label": label,
      });
    const a = field(p.a ?? 25, "Percentage");
    a.classList.add("has-post");
    const b = field(p.b ?? 200, "Amount");
    const focal = h("div", { class: "w-big" });
    const focalCap = h("div", { class: "w-focal-cap" });
    const line = (label) => {
      const l = h("dt", null, label);
      const v = h("dd", { class: "w-tick" });
      return { l, v, el: h("div", { class: "w-kv-row" }, l, v) };
    };
    const share = line();
    const change = line();
    const run = () => {
      const x = a.value === "" ? Number.NaN : +a.value;
      const y = b.value === "" ? Number.NaN : +b.value;
      const ok = Number.isFinite(x) && Number.isFinite(y);
      numTick(focal, ok ? fmt((x / 100) * y) : "?");
      focalCap.textContent = ok
        ? `${fmt(x)}% of ${fmt(y)}`
        : "enter two numbers";
      share.l.textContent = ok ? `${fmt(x)} is what % of ${fmt(y)}` : "share";
      numTick(share.v, ok && y ? `${fmt((x / y) * 100)}%` : "?");
      change.l.textContent = ok
        ? `change from ${fmt(x)} to ${fmt(y)}`
        : "change";
      const d = ((y - x) / Math.abs(x)) * 100;
      numTick(change.v, ok && x ? `${d > 0 ? "+" : ""}${fmt(d)}%` : "?");
    };
    a.oninput = b.oninput = run;
    run();
    return card(
      p.kind === "of" ? "percentage" : "percentage calculator",
      null,
      h(
        "div",
        { class: "w-focal", role: "status", "aria-live": "polite" },
        focal,
        focalCap,
      ),
      h(
        "div",
        { class: "w-pct-inputs" },
        h(
          "span",
          { class: "w-calcf-field" },
          a,
          h("span", { class: "w-calcf-affix post" }, "%"),
        ),
        h("span", { class: "w-mid" }, "of"),
        b,
      ),
      h("dl", { class: "w-kv" }, share.el, change.el),
    );
  },
});

reg({
  id: "aspect",
  match: (q) => /^aspect\s*ratio(?:\s+calculator)?$/i.test(q.trim()),
  build: () => {
    const w = h("input", {
      class: "w-input w-num w-nnum",
      type: "number",
      inputmode: "numeric",
      value: "1920",
      "aria-label": "Width",
    });
    const hh = h("input", {
      class: "w-input w-num w-nnum",
      type: "number",
      inputmode: "numeric",
      value: "1080",
      "aria-label": "Height",
    });
    const focal = h("div", { class: "w-big" });
    const caption = h("div", { class: "w-focal-cap" });
    const shape = h("div", { class: "w-aspect-shape" });
    const presets = [
      [16, 9],
      [4, 3],
      [3, 2],
      [1, 1],
      [21, 9],
      [9, 16],
    ];
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const presetBtns = presets.map(([pw, ph]) => {
      const b = h(
        "button",
        {
          class: "w-aspect-preset",
          type: "button",
          "aria-label": `set ratio to ${pw} by ${ph}`,
        },
        `${pw}:${ph}`,
      );
      b.onclick = () => {
        const long = Math.max(+w.value, +hh.value) || 1920;
        const k = Math.max(1, Math.round(long / Math.max(pw, ph)));
        w.value = String(k * pw);
        hh.value = String(k * ph);
        run();
      };
      return { b, key: `${pw}:${ph}` };
    });
    const run = () => {
      const a = Math.round(+w.value),
        b = Math.round(+hh.value);
      const ok = a > 0 && b > 0;
      shape.classList.toggle("empty", !ok);
      if (!ok) {
        numTick(focal, "?");
        caption.textContent = "enter a width and height";
        for (const p of presetBtns) p.b.setAttribute("aria-pressed", "false");
        return;
      }
      const g = gcd(a, b);
      const key = `${a / g}:${b / g}`;
      if (focal.dataset.key !== key) {
        focal.dataset.key = key;
        focal.replaceChildren(
          `${a / g}`,
          h("span", { class: "w-nres-op" }, ":"),
          `${b / g}`,
        );
        if (focal.isConnected && !calmMotion())
          focal.animate(
            [
              { opacity: 0.4, filter: "blur(2px)", translate: "0 0.18em" },
              { opacity: 1, filter: "blur(0)", translate: "0 0" },
            ],
            { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
          );
      }
      caption.textContent = `${a === b ? "square" : a > b ? "landscape" : "portrait"}, ${+(a / b).toFixed(4)} to 1`;
      const fit = a / b / (18 / 11);
      shape.style.width = `${Math.max(8, Math.min(1, fit) * 100)}%`;
      shape.style.height = `${Math.max(8, Math.min(1, 1 / fit) * 100)}%`;
      for (const p of presetBtns)
        p.b.setAttribute("aria-pressed", String(p.key === key));
    };
    w.oninput = hh.oninput = run;
    run();
    return card(
      "aspect ratio",
      null,
      h(
        "div",
        { class: "w-aspect-top" },
        h(
          "div",
          { class: "w-focal", role: "status", "aria-live": "polite" },
          focal,
          caption,
        ),
        h("div", { class: "w-aspect-stage", "aria-hidden": "true" }, shape),
      ),
      h(
        "div",
        { class: "w-row w-aspect-dims" },
        w,
        h("span", { class: "w-mid" }, "×"),
        hh,
      ),
      h(
        "div",
        { class: "w-aspect-presets", role: "group", "aria-label": "presets" },
        ...presetBtns.map((p) => p.b),
      ),
    );
  },
});

reg({
  id: "baseconv",
  match: (q) => {
    let m = q.match(
      /^(\d+)\s+(?:in|to|as)\s+(binary|hex(?:adecimal)?|octal|decimal)$/i,
    );
    if (m) return { n: parseInt(m[1], 10), to: m[2].toLowerCase() };
    m = q.match(/^(?:0x([0-9a-f]+)|0b([01]+))$/i);
    if (m)
      return { n: m[1] ? parseInt(m[1], 16) : parseInt(m[2], 2), to: "all" };
    if (/^(?:number\s+base|base|radix)\s+converter$/i.test(q.trim()))
      return { n: 255, to: "all" };
    return null;
  },
  build: ({ n, to }) => {
    const target = to.startsWith("hex") ? "hex" : to === "all" ? "decimal" : to;
    const bases = [
      ["decimal", "", 10, 3],
      ["binary", "0b", 2, 4],
      ["octal", "0o", 8, 3],
      ["hex", "0x", 16, 4],
    ].map(([name, prefix, radix, size]) => ({ name, prefix, radix, size }));
    const hero = bases.find((b) => b.name === target);
    const inp = h("input", {
      class: "w-input w-mono",
      value: String(n),
      spellcheck: "false",
      autocomplete: "off",
      autocapitalize: "off",
      placeholder: "255, 0xff, 0b1010 or 0o17",
      "aria-label": "Number, prefix with 0x, 0b or 0o for other bases",
    });
    const parse = (raw) => {
      const s = raw
        .trim()
        .replace(/[\s_,]/g, "")
        .toLowerCase();
      const m = s.match(/^(-?)(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+)$/);
      if (!m) return null;
      const v = BigInt(m[2]);
      return m[1] ? -v : v;
    };
    const format = (b, v) => {
      const abs = v < 0n ? -v : v;
      const digits = abs.toString(b.radix).toUpperCase();
      return {
        sign: v < 0n ? "-" : "",
        digits:
          b.radix === 10
            ? abs.toLocaleString("en-US")
            : digits.replace(new RegExp(`\\B(?=(.{${b.size}})+$)`, "g"), " "),
        raw: `${v < 0n ? "-" : ""}${b.prefix}${digits}`,
      };
    };
    const heroVal = h("span", { class: "w-base-digits" });
    const heroPrefix = h("span", { class: "w-base-prefix" });
    const big = h(
      "div",
      { class: "w-big w-mono w-base-big" },
      heroPrefix,
      heroVal,
    );
    let heroRaw = "";
    const rows = bases
      .filter((b) => b !== hero)
      .map((b) => {
        const val = h("span", { class: "w-base-digits" });
        const prefix = h("span", { class: "w-base-prefix" });
        const r = { b, val, prefix, raw: "" };
        r.row = [
          b.name,
          h("span", null, prefix, val),
          { mono: true, copy: () => r.raw },
        ];
        return r;
      });
    const note = h("div", { class: "w-focal-cap" });
    const out = kvList(rows.map((r) => r.row));
    const run = () => {
      const v = parse(inp.value);
      const bad = v == null && inp.value.trim() !== "";
      inp.setAttribute("aria-invalid", String(bad));
      out.classList.toggle("empty", v == null);
      if (v == null) {
        numTick(heroVal, "?");
        heroPrefix.textContent = "";
        heroRaw = "";
        for (const r of rows) {
          r.prefix.textContent = "";
          numTick(r.val, "?");
          r.raw = "";
        }
        note.textContent = bad
          ? "use digits, or a 0x, 0b or 0o prefix"
          : `enter a number to see it in ${hero.name}`;
        return;
      }
      const f = format(hero, v);
      heroPrefix.textContent = `${f.sign}${hero.prefix}`;
      numTick(heroVal, f.digits);
      big.classList.toggle("long", f.digits.length > 18);
      heroRaw = f.raw;
      note.textContent = hero.name;
      for (const r of rows) {
        const g = format(r.b, v);
        r.prefix.textContent = `${g.sign}${r.b.prefix}`;
        numTick(r.val, g.digits);
        r.raw = g.raw;
      }
    };
    inp.oninput = run;
    run();
    return card(
      "number base converter",
      null,
      h(
        "div",
        { class: "w-base-hero" },
        h(
          "div",
          { class: "w-focal", role: "status", "aria-live": "polite" },
          big,
          note,
        ),
        copyBtn(() => heroRaw, `copy ${hero.name}`),
      ),
      inp,
      out,
    );
  },
});

reg({
  id: "roman",
  match: (q) => {
    let m = q.match(
      /^(\d{1,4})\s+(?:in|to|as)\s+roman(?:\s+numerals?)?$|^roman\s+numerals?\s+(?:for\s+)?(\d{1,4})$/i,
    );
    if (m) return { n: +(m[1] || m[2]) };
    m = q.match(/^([IVXLCDM]+)\s+(?:in|to)\s+(?:number|decimal|arabic)$/i);
    if (m) return { roman: m[1].toUpperCase() };
    if (/^roman\s+numeral(?:s)?(?:\s+converter)?$/i.test(q.trim()))
      return { n: 2024 };
    return null;
  },
  build: (p) => {
    const map = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    const toParts = (n) => {
      const parts = [];
      for (const [v, s] of map) {
        let sym = "";
        let val = 0;
        while (n >= v) {
          sym += s;
          val += v;
          n -= v;
        }
        if (sym) parts.push([sym, val]);
      }
      return parts;
    };
    const fromRoman = (s) => {
      let n = 0;
      const vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
      for (let i = 0; i < s.length; i++) {
        const c = vals[s[i]],
          nx = vals[s[i + 1]] || 0;
        n += c < nx ? -c : c;
      }
      return n;
    };
    const inp = h("input", {
      class: "w-input",
      value: p.roman || p.n,
      spellcheck: "false",
      autocomplete: "off",
      autocapitalize: "characters",
      placeholder: "2024 or MMXXIV",
      "aria-label": "Number or roman numeral",
    });
    const out = h("div", { class: "w-big w-roman-out" });
    const note = h("div", { class: "w-focal-cap" });
    const parts = h("div", { class: "w-roman-parts", "aria-hidden": "true" });
    const run = () => {
      const v = inp.value.trim();
      let list = [];
      let bad = false;
      if (/^[ivxlcdm]+$/i.test(v)) {
        const up = v.toUpperCase();
        const n = fromRoman(up);
        list = n >= 1 && n <= 3999 ? toParts(n) : [];
        const canon = list.map(([s]) => s).join("");
        numTick(out, n >= 1 ? String(n) : "?");
        note.textContent =
          n > 3999
            ? `${up} as a number, standard numerals stop at 3999`
            : canon !== up
              ? `${up} isn't standard, ${n} is written ${canon}`
              : `${up} as a number`;
      } else if (/^\d+$/.test(v) && +v >= 1 && +v <= 3999) {
        list = toParts(+v);
        numTick(out, list.map(([s]) => s).join(""));
        note.textContent = `${+v} in roman numerals`;
      } else {
        bad = v !== "";
        numTick(out, "?");
        note.textContent = bad
          ? "enter a whole number from 1 to 3999, or a numeral"
          : "enter a number or a numeral";
      }
      inp.setAttribute("aria-invalid", String(bad));
      parts.replaceChildren(
        ...(list.length > 1 ? list : []).map(([sym, val]) =>
          h(
            "span",
            { class: "w-roman-part" },
            h("span", { class: "w-roman-sym" }, sym),
            h("span", { class: "w-roman-num" }, String(val)),
          ),
        ),
      );
    };
    inp.oninput = run;
    run();
    return card(
      "roman numerals",
      null,
      h(
        "div",
        { class: "w-roman-row" },
        h(
          "div",
          { class: "w-focal", role: "status", "aria-live": "polite" },
          out,
          note,
        ),
        copyBtn(() => out.textContent, "copy result"),
      ),
      parts,
      inp,
    );
  },
});

reg({
  id: "primefactor",
  match: (q) => {
    let m = q.match(/^(?:is\s+)?(\d+)\s+(?:a\s+)?prime\??$/i);
    if (m) return { n: +m[1], kind: "prime" };
    m = q.match(/^(?:prime\s+)?factor(?:s|ize|ization)?\s+(?:of\s+)?(\d+)$/i);
    if (m) return { n: +m[1], kind: "factor" };
    return null;
  },
  build: ({ n, kind }) => {
    n = Math.floor(n);
    const title = kind === "prime" ? "prime check" : "prime factorization";
    const shown = n.toLocaleString("en-US");
    if (!Number.isSafeInteger(n))
      return card(
        title,
        null,
        h("div", { class: "w-big" }, "too large"),
        h(
          "div",
          { class: "w-focal-cap" },
          "this works up to 9,007,199,254,740,991",
        ),
      );
    const f = [];
    let x = n;
    for (let d = 2; d * d <= x; d++)
      while (x % d === 0) {
        f.push(d);
        x /= d;
      }
    if (x > 1) f.push(x);
    const prime = n > 1 && f.length === 1;
    const counts = new Map();
    for (const p of f) counts.set(p, (counts.get(p) || 0) + 1);
    const verdict = h(
      "div",
      { class: `w-verdict${prime ? "" : " no"}` },
      prime ? "prime" : "not prime",
    );
    if (kind === "prime")
      return card(
        title,
        null,
        h(
          "div",
          { class: "w-focal" },
          h("div", { class: "w-big" }, shown),
          h(
            "div",
            { class: "w-focal-cap" },
            prime
              ? "only divisible by 1 and itself"
              : n < 2
                ? "primes start at 2"
                : `${shown} = ${f.join(" × ")}`,
          ),
        ),
        verdict,
      );
    if (n < 2)
      return card(
        title,
        null,
        h(
          "div",
          { class: "w-focal" },
          h("div", { class: "w-big" }, shown),
          h("div", { class: "w-focal-cap" }, "has no prime factors"),
        ),
      );
    const divisors = [...counts.values()].reduce((a, c) => a * (c + 1), 1);
    const terms = [...counts].flatMap(([p, c], i) => [
      i ? h("span", { class: "w-nres-op" }, "×") : null,
      h(
        "span",
        null,
        p.toLocaleString("en-US"),
        c > 1 ? h("sup", null, c) : null,
      ),
    ]);
    if (prime)
      return card(
        title,
        null,
        h("div", { class: "w-focal" }, h("div", { class: "w-big" }, shown)),
        verdict,
      );
    return card(
      title,
      `of ${shown}`,
      h(
        "div",
        { class: "w-focal" },
        h("div", { class: "w-big w-factor-terms" }, ...terms),
        h(
          "div",
          { class: "w-focal-cap" },
          `${f.length} prime factors, ${divisors} divisors`,
        ),
      ),
    );
  },
});

reg({
  id: "stats",
  match: (q) => {
    const m = q.match(
      /^(?:mean|average|median|stats|standard\s+deviation|stdev)\s+(?:of\s+)?([\d.,\s-]+)$/i,
    );
    if (!m) return null;
    const nums = m[1]
      .split(/[\s,]+/)
      .map(Number)
      .filter((x) => Number.isFinite(x));
    return nums.length >= 2 ? { nums } : null;
  },
  build: ({ nums }) => {
    const n = nums.length;
    const sum = nums.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const sorted = [...nums].sort((a, b) => a - b);
    const median =
      n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const sq = nums.reduce((a, b) => a + (b - mean) ** 2, 0);
    const r = (x) => x.toLocaleString("en-US", { maximumFractionDigits: 4 });
    return card(
      "statistics",
      null,
      h(
        "div",
        { class: "w-focal" },
        h("div", { class: "w-big" }, r(mean)),
        h("div", { class: "w-focal-cap" }, "mean"),
      ),
      h(
        "dl",
        { class: "w-stats-grid" },
        ...[
          ["median", median],
          ["sum", sum],
          ["std dev", Math.sqrt(sq / n)],
          ["sample std dev", Math.sqrt(sq / (n - 1))],
          ["min", sorted[0]],
          ["max", sorted[n - 1]],
          ["range", sorted[n - 1] - sorted[0]],
          ["count", n],
        ].map(([l, v]) =>
          h(
            "div",
            { class: "w-stats-tile" },
            h("dt", { class: "w-stats-tile-label" }, l),
            h("dd", { class: "w-stats-tile-val" }, r(v)),
          ),
        ),
      ),
    );
  },
});

const TZ_ALIAS = {
  utc: "UTC",
  gmt: "UTC",
  z: "UTC",
  zulu: "UTC",
  "greenwich mean time": "UTC",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  pt: "America/Los_Angeles",
  mst: "America/Denver",
  mdt: "America/Denver",
  mt: "America/Denver",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  ct: "America/Chicago",
  est: "America/New_York",
  edt: "America/New_York",
  et: "America/New_York",
  akst: "America/Anchorage",
  hst: "Pacific/Honolulu",
  bst: "Europe/London",
  cet: "Europe/Paris",
  cest: "Europe/Paris",
  eet: "Europe/Athens",
  eest: "Europe/Athens",
  wet: "Europe/Lisbon",
  msk: "Europe/Moscow",
  ist: "Asia/Kolkata",
  gst: "Asia/Dubai",
  pkt: "Asia/Karachi",
  ict: "Asia/Bangkok",
  sgt: "Asia/Singapore",
  hkt: "Asia/Hong_Kong",
  jst: "Asia/Tokyo",
  kst: "Asia/Seoul",
  aest: "Australia/Sydney",
  aedt: "Australia/Sydney",
  aet: "Australia/Sydney",
  awst: "Australia/Perth",
  acst: "Australia/Adelaide",
  acdt: "Australia/Adelaide",
  nzst: "Pacific/Auckland",
  nzdt: "Pacific/Auckland",
  brt: "America/Sao_Paulo",
  art: "America/Argentina/Buenos_Aires",
  wat: "Africa/Lagos",
  cat: "Africa/Harare",
  eat: "Africa/Nairobi",
  sast: "Africa/Johannesburg",
  japan: "Asia/Tokyo",
  uk: "Europe/London",
  gb: "Europe/London",
  england: "Europe/London",
  britain: "Europe/London",
  "great britain": "Europe/London",
  "united kingdom": "Europe/London",
  scotland: "Europe/London",
  wales: "Europe/London",
  usa: "America/New_York",
  us: "America/New_York",
  america: "America/New_York",
  "united states": "America/New_York",
  states: "America/New_York",
  canada: "America/Toronto",
  mexico: "America/Mexico_City",
  brazil: "America/Sao_Paulo",
  argentina: "America/Argentina/Buenos_Aires",
  chile: "America/Santiago",
  colombia: "America/Bogota",
  peru: "America/Lima",
  venezuela: "America/Caracas",
  cuba: "America/Havana",
  france: "Europe/Paris",
  germany: "Europe/Berlin",
  spain: "Europe/Madrid",
  italy: "Europe/Rome",
  portugal: "Europe/Lisbon",
  netherlands: "Europe/Amsterdam",
  holland: "Europe/Amsterdam",
  belgium: "Europe/Brussels",
  switzerland: "Europe/Zurich",
  austria: "Europe/Vienna",
  poland: "Europe/Warsaw",
  czechia: "Europe/Prague",
  "czech republic": "Europe/Prague",
  hungary: "Europe/Budapest",
  romania: "Europe/Bucharest",
  greece: "Europe/Athens",
  sweden: "Europe/Stockholm",
  norway: "Europe/Oslo",
  denmark: "Europe/Copenhagen",
  finland: "Europe/Helsinki",
  iceland: "Atlantic/Reykjavik",
  ireland: "Europe/Dublin",
  russia: "Europe/Moscow",
  ukraine: "Europe/Kyiv",
  kiev: "Europe/Kyiv",
  kyiv: "Europe/Kyiv",
  turkey: "Europe/Istanbul",
  israel: "Asia/Jerusalem",
  uae: "Asia/Dubai",
  emirates: "Asia/Dubai",
  "abu dhabi": "Asia/Dubai",
  "saudi arabia": "Asia/Riyadh",
  saudi: "Asia/Riyadh",
  doha: "Asia/Qatar",
  india: "Asia/Kolkata",
  pakistan: "Asia/Karachi",
  bangladesh: "Asia/Dhaka",
  nepal: "Asia/Kathmandu",
  "sri lanka": "Asia/Colombo",
  china: "Asia/Shanghai",
  beijing: "Asia/Shanghai",
  shenzhen: "Asia/Shanghai",
  guangzhou: "Asia/Shanghai",
  chengdu: "Asia/Shanghai",
  taiwan: "Asia/Taipei",
  korea: "Asia/Seoul",
  "south korea": "Asia/Seoul",
  "north korea": "Asia/Pyongyang",
  busan: "Asia/Seoul",
  vietnam: "Asia/Ho_Chi_Minh",
  saigon: "Asia/Ho_Chi_Minh",
  hanoi: "Asia/Ho_Chi_Minh",
  "ho chi minh": "Asia/Ho_Chi_Minh",
  "ho chi minh city": "Asia/Ho_Chi_Minh",
  thailand: "Asia/Bangkok",
  malaysia: "Asia/Kuala_Lumpur",
  indonesia: "Asia/Jakarta",
  bali: "Asia/Makassar",
  philippines: "Asia/Manila",
  iran: "Asia/Tehran",
  iraq: "Asia/Baghdad",
  australia: "Australia/Sydney",
  canberra: "Australia/Sydney",
  "gold coast": "Australia/Brisbane",
  tasmania: "Australia/Hobart",
  "new zealand": "Pacific/Auckland",
  nz: "Pacific/Auckland",
  wellington: "Pacific/Auckland",
  christchurch: "Pacific/Auckland",
  "south africa": "Africa/Johannesburg",
  "cape town": "Africa/Johannesburg",
  durban: "Africa/Johannesburg",
  pretoria: "Africa/Johannesburg",
  egypt: "Africa/Cairo",
  nigeria: "Africa/Lagos",
  kenya: "Africa/Nairobi",
  morocco: "Africa/Casablanca",
  nyc: "America/New_York",
  ny: "America/New_York",
  "new york city": "America/New_York",
  manhattan: "America/New_York",
  brooklyn: "America/New_York",
  boston: "America/New_York",
  philadelphia: "America/New_York",
  philly: "America/New_York",
  atlanta: "America/New_York",
  miami: "America/New_York",
  orlando: "America/New_York",
  washington: "America/New_York",
  "washington dc": "America/New_York",
  dc: "America/New_York",
  florida: "America/New_York",
  dallas: "America/Chicago",
  houston: "America/Chicago",
  austin: "America/Chicago",
  "san antonio": "America/Chicago",
  minneapolis: "America/Chicago",
  "new orleans": "America/Chicago",
  "kansas city": "America/Chicago",
  milwaukee: "America/Chicago",
  nashville: "America/Chicago",
  memphis: "America/Chicago",
  "st louis": "America/Chicago",
  texas: "America/Chicago",
  illinois: "America/Chicago",
  "salt lake city": "America/Denver",
  albuquerque: "America/Denver",
  la: "America/Los_Angeles",
  "l.a.": "America/Los_Angeles",
  sf: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  "san diego": "America/Los_Angeles",
  "san jose": "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  portland: "America/Los_Angeles",
  "las vegas": "America/Los_Angeles",
  vegas: "America/Los_Angeles",
  sacramento: "America/Los_Angeles",
  oakland: "America/Los_Angeles",
  "silicon valley": "America/Los_Angeles",
  "palo alto": "America/Los_Angeles",
  cupertino: "America/Los_Angeles",
  california: "America/Los_Angeles",
  cali: "America/Los_Angeles",
  nevada: "America/Los_Angeles",
  oregon: "America/Los_Angeles",
  hawaii: "Pacific/Honolulu",
  alaska: "America/Anchorage",
  ottawa: "America/Toronto",
  calgary: "America/Edmonton",
  munich: "Europe/Berlin",
  frankfurt: "Europe/Berlin",
  hamburg: "Europe/Berlin",
  cologne: "Europe/Berlin",
  barcelona: "Europe/Madrid",
  valencia: "Europe/Madrid",
  milan: "Europe/Rome",
  milano: "Europe/Rome",
  venice: "Europe/Rome",
  florence: "Europe/Rome",
  naples: "Europe/Rome",
  lyon: "Europe/Paris",
  marseille: "Europe/Paris",
  nice: "Europe/Paris",
  geneva: "Europe/Zurich",
  bern: "Europe/Zurich",
  basel: "Europe/Zurich",
  manchester: "Europe/London",
  liverpool: "Europe/London",
  birmingham: "Europe/London",
  glasgow: "Europe/London",
  edinburgh: "Europe/London",
  leeds: "Europe/London",
  bristol: "Europe/London",
  cardiff: "Europe/London",
  belfast: "Europe/London",
  "st petersburg": "Europe/Moscow",
  "saint petersburg": "Europe/Moscow",
  osaka: "Asia/Tokyo",
  kyoto: "Asia/Tokyo",
  nagoya: "Asia/Tokyo",
  yokohama: "Asia/Tokyo",
  sapporo: "Asia/Tokyo",
  mumbai: "Asia/Kolkata",
  bombay: "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  "new delhi": "Asia/Kolkata",
  bangalore: "Asia/Kolkata",
  bengaluru: "Asia/Kolkata",
  chennai: "Asia/Kolkata",
  hyderabad: "Asia/Kolkata",
  pune: "Asia/Kolkata",
  calcutta: "Asia/Kolkata",
  jeddah: "Asia/Riyadh",
  "tel aviv": "Asia/Jerusalem",
  rio: "America/Sao_Paulo",
  "rio de janeiro": "America/Sao_Paulo",
  brasilia: "America/Sao_Paulo",
};

const CLOCK_KIND = {
  time: "time",
  clock: "time",
  hour: "time",
  "o'clock": "time",
  date: "date",
  day: "day",
  weekday: "day",
  year: "year",
  month: "month",
};

const CLOCK_FILLER = new Set([
  "what",
  "whats",
  "what's",
  "wat",
  "is",
  "it",
  "the",
  "a",
  "an",
  "current",
  "currently",
  "now",
  "right",
  "today",
  "todays",
  "today's",
  "local",
  "this",
  "be",
  "are",
  "we",
  "and",
  "of",
  "do",
  "you",
  "know",
  "tell",
  "me",
  "please",
  "my",
  "exact",
  "real",
]);

const odometer = (cls, dir = 1, still = 0) => {
  const el = h("span", { class: cls ? `w-od ${cls}` : "w-od" });
  const live = h("span", { class: "w-sr" });
  const reels = h("span", { class: "w-od-in", "aria-hidden": "true" });
  el.append(live, reels);
  const at = (i) => `translateY(calc(${-i} * (1lh + 0.2em)))`;
  const jump = (reel, i) => {
    reel.style.transition = "none";
    reel.style.transform = at(i);
    void reel.offsetWidth;
    reel.style.transition = "";
  };
  let shape = null;
  const set = (str) => {
    const chars = [...str];
    const next = chars.map((c) => (c >= "0" && c <= "9" ? "#" : c)).join("");
    live.textContent = str;
    if (next !== shape) {
      shape = next;
      reels.replaceChildren(
        ...[...next].map((c) =>
          c === "#"
            ? h(
                "span",
                { class: "w-od-d" },
                h("span", { class: "w-od-g" }, "0"),
                h(
                  "span",
                  { class: "w-od-r" },
                  Array.from({ length: 30 }, (_, i) => h("span", null, i % 10)),
                ),
              )
            : h("span", { class: "w-od-s" }, c),
        ),
      );
    }
    let left = chars.filter((c) => c >= "0" && c <= "9").length;
    chars.forEach((c, i) => {
      if (!(c >= "0" && c <= "9")) return;
      left--;
      const cell = reels.children[i];
      if (!cell || cell.dataset.v === c) return;
      const reel = cell.lastChild;
      const to = +c;
      const parked = cell.dataset.v ? +cell.dataset.i : null;
      cell.dataset.v = c;
      if (parked == null || left < still) {
        cell.dataset.i = 10 + to;
        jump(reel, 10 + to);
        return;
      }
      const from = parked % 10;
      if (parked !== 10 + from) jump(reel, 10 + from);
      const target =
        dir > 0 ? (to > from ? 10 + to : 20 + to) : to < from ? 10 + to : to;
      cell.dataset.i = target;
      reel.style.transform = at(target);
    });
  };
  return { el, set };
};

let _tzKeys;

reg({
  id: "clock",
  match: (q) => {
    let s = q
      .trim()
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/[?!.]+$/, "")
      .replace(/\s+/g, " ");
    if (!s || s.length > 60) return null;
    s = s.replace(/\s+(?:right now|now|at the moment|atm|currently)$/, "");

    const valid = (z) => {
      if (!z) return null;
      try {
        new Intl.DateTimeFormat("en", { timeZone: z }).format();
        return z;
      } catch {
        return null;
      }
    };

    const resolve = (raw) => {
      const p = raw
        .replace(/[.,]+$/, "")
        .replace(/^the\s+/, "")
        .replace(/\s+(?:time|timezone|time zone)$/, "")
        .trim();
      if (!p) return null;
      if (TZ_ALIAS[p]) return valid(TZ_ALIAS[p]);
      const off = p.match(/^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?00)?$/);
      if (off) {
        const hrs = +off[2];
        if (hrs > 14) return null;
        if (!hrs) return "UTC";
        return valid(`Etc/GMT${off[1] === "+" ? "-" : "+"}${hrs}`);
      }
      if (!_tzKeys) {
        _tzKeys = new Map();
        for (const z of Intl.supportedValuesOf?.("timeZone") || []) {
          const segs = z.toLowerCase().replaceAll("_", " ").split("/");
          const last = segs.at(-1);
          if (!_tzKeys.has(last)) _tzKeys.set(last, z);
          const full = segs.join(" ");
          if (!_tzKeys.has(full)) _tzKeys.set(full, z);
        }
      }
      const hit =
        _tzKeys.get(p) ||
        (p.includes(",") ? _tzKeys.get(p.split(",")[0].trim()) : null);
      if (hit) return hit;
      if (p.length < 4) return null;
      for (const [k, z] of _tzKeys) if (k.startsWith(`${p} `)) return z;
      return null;
    };

    let place = null;
    let tz = null;
    const inM = s.match(/^(.*?)\s+in\s+(.+)$/);
    if (inM) {
      const z = resolve(inM[2]);
      if (z) {
        tz = z;
        place = inM[2].replace(/^the\s+/, "");
        s = inM[1];
      }
    }
    if (!tz) {
      const pre = s.match(/^(.+?)\s+(time|clock|date|hour)$/);
      if (pre) {
        const z = resolve(pre[1]);
        if (z) {
          tz = z;
          place = pre[1];
          s = pre[2];
        }
      }
    }

    const toks = s.split(" ").filter(Boolean);
    if (!toks.length) return null;
    let kind = null;
    for (const t of toks) {
      const k = CLOCK_KIND[t];
      if (k) {
        kind ||= k;
        continue;
      }
      if (!CLOCK_FILLER.has(t)) return null;
    }
    if (!kind) return null;
    if (!place && toks.length === 1 && kind !== "time") return null;
    return {
      kind,
      place,
      tz: tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };
  },
  build: ({ kind, place, tz }) => {
    const stored = localStorage.getItem("ms-clock-h12");
    let h12 = stored
      ? stored === "1"
      : !!new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
        }).resolvedOptions().hour12;

    const partsF = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      weekday: "long",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    const dateF = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const monthF = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      month: "long",
    });
    const abbrF = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    });

    const clock = (hour, minute, second) => {
      const hh = h12 ? hour % 12 || 12 : hour;
      return `${h12 ? hh : String(hh).padStart(2, "0")}:${minute}${second == null ? "" : `:${second}`}${h12 ? (hour < 12 ? " am" : " pm") : ""}`;
    };

    const isTime = kind === "time";
    const big = isTime
      ? odometer("w-clock-digits")
      : (() => {
          const el = h("span", { class: "w-clock-digits" });
          return {
            el,
            set: (v) => {
              if (el.textContent !== v) el.textContent = v;
            },
          };
        })();
    const secs = h("span", { class: "w-clock-secs" });
    const ampm = h("span", { class: "w-clock-ampm" });
    const sub = h("div", { class: "w-clock-sub" });
    const zone = h("div", { class: "w-clock-zone" });
    const diff = h("div", { class: "w-clock-diff" });

    const hero = h(
      "div",
      { class: "w-clock-hero" },
      h(
        "div",
        { class: "w-clock-big" },
        big.el,
        isTime && h("div", { class: "w-clock-tail" }, secs, ampm),
      ),
      sub,
      zone,
    );

    let offMin = 0;
    let seen = false;
    let copyText = "";
    const tick = () => {
      const now = new Date();
      const p = {};
      for (const { type, value } of partsF.formatToParts(now)) p[type] = value;
      const hour = +p.hour;
      const minute = String(+p.minute).padStart(2, "0");
      const second = String(+p.second).padStart(2, "0");
      offMin = Math.round(
        (Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second) -
          Math.floor(now.getTime() / 1000) * 1000) /
          60000,
      );
      const dateStr = dateF.format(now);

      if (isTime) {
        big.set(clock(hour, minute).replace(/ [ap]m$/, ""));
        secs.textContent = `:${second}`;
        ampm.textContent = h12 ? (hour < 12 ? "am" : "pm") : "";
        sub.textContent = dateStr;
      } else {
        big.set(
          kind === "year"
            ? p.year
            : kind === "month"
              ? monthF.format(now)
              : kind === "day"
                ? p.weekday
                : dateStr.replace(p.weekday, "").replace(/^[,\s]+/, ""),
        );
        sub.textContent =
          kind === "date"
            ? `${p.weekday} · ${clock(hour, minute, second)}`
            : `${dateStr} · ${clock(hour, minute, second)}`;
      }

      const sign = offMin < 0 ? "-" : "+";
      const oh = Math.floor(Math.abs(offMin) / 60);
      const om = Math.abs(offMin) % 60;
      const offStr = offMin
        ? `UTC${sign}${oh}${om ? `:${String(om).padStart(2, "0")}` : ""}`
        : "UTC";
      const abbr = abbrF
        .formatToParts(now)
        .find((x) => x.type === "timeZoneName")?.value;
      const chips = [
        tz.replaceAll("_", " "),
        abbr && !/^(?:GMT|UTC)/.test(abbr) ? abbr : null,
        offStr,
      ].filter(Boolean);
      if (zone.dataset.v !== chips.join("|")) {
        zone.dataset.v = chips.join("|");
        zone.replaceChildren(
          ...chips.map((t) => h("span", { class: "w-clock-chip" }, t)),
        );
      }

      const localOff = -now.getTimezoneOffset();
      const delta = offMin - localOff;
      if (!place || delta === 0) {
        diff.dataset.v = "";
        diff.textContent = place
          ? "same time as you"
          : offMin
            ? `${clock(now.getUTCHours(), String(now.getUTCMinutes()).padStart(2, "0"))} UTC`
            : "";
      } else {
        const dh = Math.floor(Math.abs(delta) / 60);
        const dm = Math.abs(delta) % 60;
        const span = [
          dh ? `${dh} hour${dh === 1 ? "" : "s"}` : null,
          dm ? `${dm} min` : null,
        ]
          .filter(Boolean)
          .join(" ");
        const localDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        const zoneDay = new Date(+p.year, +p.month - 1, +p.day);
        const dayGap = Math.round((zoneDay - localDay) / 86400000);
        const when =
          dayGap > 0
            ? ", tomorrow there"
            : dayGap < 0
              ? ", yesterday there"
              : "";
        const parts = [
          `${span} ${delta > 0 ? "ahead of" : "behind"} you${when}`,
          `${clock(now.getHours(), String(now.getMinutes()).padStart(2, "0"))} your time`,
        ];
        if (diff.dataset.v !== parts.join("|")) {
          diff.dataset.v = parts.join("|");
          diff.replaceChildren(
            ...parts.map((t) => h("span", { class: "w-clock-diff-part" }, t)),
          );
        }
      }

      copyText = `${clock(hour, minute, second)} · ${dateStr} · ${tz}`;
    };

    const unit = h("button", {
      class: "w-clock-unit",
      title: "toggle 12/24 hour",
      onclick: () => {
        h12 = !h12;
        localStorage.setItem("ms-clock-h12", h12 ? "1" : "0");
        unit.textContent = h12 ? "24h" : "12h";
        tick();
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const soft = [
          { opacity: 0, filter: "blur(4px)", transform: "translateY(3px)" },
          { opacity: 1, filter: "blur(0)", transform: "none" },
        ];
        const ease = {
          duration: 260,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        };
        big.el.animate(soft, ease);
        ampm.animate(soft, ease);
        unit.animate(
          soft.map(({ opacity, filter }) => ({ opacity, filter })),
          {
            ...ease,
            duration: 200,
          },
        );
      },
    });
    unit.textContent = h12 ? "24h" : "12h";

    tick();
    const loop = () => {
      if (hero.isConnected) seen = true;
      else if (seen) return;
      tick();
      setTimeout(loop, 1010 - (Date.now() % 1000));
    };
    setTimeout(loop, 1010 - (Date.now() % 1000));

    const noun =
      kind === "year"
        ? "year"
        : kind === "month"
          ? "month"
          : kind === "date" || kind === "day"
            ? "date"
            : "time";
    return card(
      place ? `${noun} in ${place}` : `current ${noun}`,
      null,
      hero,
      h(
        "div",
        { class: "w-clock-foot" },
        diff,
        h(
          "div",
          { class: "w-clock-actions" },
          unit,
          copyBtn(() => copyText),
        ),
      ),
    );
  },
});

reg({
  id: "age",
  match: (q) => {
    const m = q.match(
      /^age(?:\s+calculator)?(?:\s+(?:from\s+)?(\d{4}-\d{1,2}-\d{1,2}))?$/i,
    );
    return m ? { date: m[1] } : null;
  },
  build: ({ date }) => {
    const inp = h("input", {
      class: "w-input w-nnum",
      type: "date",
      value: date || "2000-01-01",
      required: true,
    });
    const val = h("div", { class: "w-big w-calcf-val" });
    const cap = h("div", { class: "w-focal-cap" });
    const hint = h("div", { class: "w-calcf-hint" });
    const rows = h("dl", { class: "w-kv flush" });
    const panel = h(
      "div",
      { class: "w-calcf-panel", role: "status", "aria-live": "polite" },
      h("div", { class: "w-focal" }, val, cap),
      hint,
      rows,
    );
    const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
    const row = (l, v) =>
      h("div", { class: "w-kv-row" }, h("dt", null, l), h("dd", null, v));
    const run = () => {
      const [Y, M, D] = (inp.value || "").split("-").map(Number);
      const d = new Date(Y, M - 1, D);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const bad = Number.isNaN(d.getTime()) || !Y;
      panel.classList.toggle("is-empty", bad || d > today);
      if (bad || d > today) {
        hint.textContent = bad
          ? "enter a date of birth"
          : "that date is in the future";
        return;
      }
      let y = today.getFullYear() - d.getFullYear();
      let m = today.getMonth() - d.getMonth();
      let days = today.getDate() - d.getDate();
      if (days < 0) {
        m--;
        days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
      }
      if (m < 0) {
        y--;
        m += 12;
      }
      const totalDays = Math.round((today - d) / 86400000);
      const bday = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      if (bday < today) bday.setFullYear(bday.getFullYear() + 1);
      const toBday = Math.round((bday - today) / 86400000);
      const turns = bday.getFullYear() - d.getFullYear();
      val.replaceChildren(
        String(y),
        h("span", { class: "w-calcf-unit" }, y === 1 ? "year" : "years"),
      );
      cap.textContent = `and ${plural(m, "month")}, ${plural(days, "day")}`;
      rows.replaceChildren(
        row(
          "next birthday",
          toBday ? `turns ${turns} in ${plural(toBday, "day")}` : "today",
        ),
        row("days old", totalDays.toLocaleString()),
        row("born on a", d.toLocaleDateString(undefined, { weekday: "long" })),
      );
    };
    inp.oninput = run;
    run();
    return card(
      "age calculator",
      null,
      h("label", { class: "w-label col" }, "date of birth", inp),
      panel,
    );
  },
});

reg({
  id: "datediff",
  match: (q) => {
    let m = q.match(
      /^days?\s+(?:between|from)\s+(\d{4}-\d{1,2}-\d{1,2})\s+(?:to|and)\s+(\d{4}-\d{1,2}-\d{1,2})$/i,
    );
    if (m) return { a: m[1], b: m[2] };
    m = q.match(/^days?\s+(?:until|till|to)\s+(\d{4}-\d{1,2}-\d{1,2})$/i);
    if (m) return { a: null, b: m[1] };
    return null;
  },
  build: ({ a, b }) => {
    const local = (s) => {
      const [Y, M, D] = s.split("-").map(Number);
      return new Date(Y, M - 1, D);
    };
    const now = new Date();
    const d1 = a
      ? local(a)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d2 = local(b);
    const days = Math.round((d2 - d1) / 86400000);
    const abs = Math.abs(days);
    const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
    const fmt = (d) =>
      d.toLocaleDateString(undefined, {
        weekday: a ? undefined : "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    const [from, to] = days < 0 ? [d2, d1] : [d1, d2];
    let workdays = 0;
    for (const d = new Date(from); d < to; d.setDate(d.getDate() + 1))
      if (d.getDay() % 6) workdays++;
    const wk = Math.floor(abs / 7);
    const row = (l, v) =>
      h("div", { class: "w-kv-row" }, h("dt", null, l), h("dd", null, v));
    return card(
      "date difference",
      null,
      h(
        "div",
        { class: "w-calcf-panel" },
        h(
          "div",
          { class: "w-focal" },
          h(
            "div",
            { class: "w-big w-calcf-val" },
            abs.toLocaleString(),
            h("span", { class: "w-calcf-unit" }, abs === 1 ? "day" : "days"),
          ),
          h(
            "div",
            { class: "w-focal-cap" },
            a
              ? `from ${fmt(d1)} to ${fmt(d2)}`
              : days === 0
                ? `${fmt(d2)} is today`
                : `${days > 0 ? "until" : "since"} ${fmt(d2)}`,
          ),
        ),
        abs > 0 &&
          h(
            "dl",
            { class: "w-kv flush" },
            wk > 0 &&
              row(
                "in weeks",
                abs % 7
                  ? `${plural(wk, "week")}, ${plural(abs % 7, "day")}`
                  : plural(wk, "week"),
              ),
            row("weekdays", workdays.toLocaleString()),
          ),
      ),
    );
  },
});

reg({
  id: "timestamp",
  match: (q) => {
    const m = q.match(
      /^(?:unix\s+)?(?:timestamp|epoch)\s+(\d{9,13})$|^(\d{10}|\d{13})\s+(?:to|in)\s+(?:date|time|human)$/i,
    );
    return m ? { ts: +(m[1] || m[2]) } : null;
  },
  build: ({ ts }) => {
    const isMs = ts > 1e12;
    const ms = isMs ? ts : ts * 1000;
    const d = new Date(ms);
    const days = Math.round((d - Date.now()) / 86400000);
    const abs = Math.abs(days);
    const rel =
      days === 0
        ? "today"
        : `${days > 0 ? "in " : ""}${abs.toLocaleString()} day${abs === 1 ? "" : "s"}${days < 0 ? " ago" : ""}`;
    const years = abs >= 365 ? Math.round(abs / 365.25) : 0;
    const parts = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(d);
    const clock = parts
      .filter((p) => p.type !== "dayPeriod")
      .map((p) => p.value)
      .join("")
      .trim();
    const period = parts.find((p) => p.type === "dayPeriod")?.value;
    const local = d.toLocaleString();
    return card(
      "unix timestamp",
      null,
      h(
        "div",
        { class: "w-ts-hero" },
        h(
          "div",
          { class: "w-ts-big" },
          clock,
          period && h("span", { class: "w-ts-ap" }, period.toLowerCase()),
        ),
        h(
          "div",
          { class: "w-ts-date" },
          d.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        ),
        h(
          "div",
          { class: "w-ts-rel" },
          years ? `${rel}, about ${years} year${years === 1 ? "" : "s"}` : rel,
        ),
      ),
      kvList(
        [
          ["local", local],
          ["utc", d.toUTCString().replace("GMT", "UTC")],
          ["iso 8601", d.toISOString()],
          [
            isMs ? "seconds" : "milliseconds",
            String(isMs ? Math.floor(ms / 1000) : ms),
          ],
        ].map(([l, v]) => [l, v, { copy: true }]),
        "stack",
      ),
    );
  },
});

reg({
  id: "worldclock",
  match: (q) =>
    /^(?:world\s+clock|time\s+zones?|world\s+time)$/i.test(q.trim()),
  build: () => {
    const zones = [
      ["Los Angeles", "America/Los_Angeles"],
      ["New York", "America/New_York"],
      ["London", "Europe/London"],
      ["Paris", "Europe/Paris"],
      ["Tokyo", "Asia/Tokyo"],
      ["Sydney", "Australia/Sydney"],
    ];
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (mine && !zones.some(([, z]) => z === mine))
      zones.unshift([mine.split("/").at(-1).replaceAll("_", " "), mine, true]);
    let started = false;
    const stored = localStorage.getItem("ms-clock-h12");
    const h12 = stored
      ? stored === "1"
      : !!new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
        }).resolvedOptions().hour12;
    const list = h("div", { class: "w-clock-list" });
    const rows = zones.map(([name, tz, own]) => {
      const t = odometer("w-clock-time");
      const note = h("span", { class: "w-clock-note" });
      const ampm = h("span", { class: "w-clock-ap" });
      const row = h(
        "div",
        { class: `w-clock-row${own ? " own" : ""}` },
        h(
          "span",
          { class: "w-clock-place" },
          h("span", { class: "w-clock-city" }, name),
          h(
            "span",
            { class: "w-clock-meta" },
            h("span", {
              class: "w-clock-sky",
              "aria-hidden": "true",
              html: `<svg class="sun" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9z"/></svg>`,
            }),
            note,
          ),
        ),
        h("span", { class: "w-clock-read" }, t.el, h12 && ampm),
      );
      list.append(row);
      const f = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      return { f, t, note, row, own, ampm };
    });
    const tick = () => {
      if (started && !list.isConnected) return clearInterval(iv);
      started = true;
      const now = new Date();
      const here = Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
      );
      for (const { f, t, note, row, own, ampm } of rows) {
        const p = {};
        for (const { type, value } of f.formatToParts(now)) p[type] = value;
        const hour = +p.hour;
        t.set(h12 ? `${hour % 12 || 12}:${p.minute}` : `${p.hour}:${p.minute}`);
        ampm.textContent = hour < 12 ? "am" : "pm";
        const there = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute);
        const diff = Math.round((there - here) / 60000);
        const dayGap =
          Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000 -
          Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
        const dh = Math.floor(Math.abs(diff) / 60);
        const dm = Math.abs(diff) % 60;
        const off = own
          ? "your time"
          : diff
            ? `${[dh && `${dh}h`, dm && `${dm}m`].filter(Boolean).join(" ")} ${diff > 0 ? "ahead" : "behind"}`
            : "same as you";
        const text =
          dayGap > 0
            ? `${off}, tomorrow`
            : dayGap < 0
              ? `${off}, yesterday`
              : off;
        if (note.textContent !== text) note.textContent = text;
        row.dataset.night = hour < 6 || hour >= 20 ? "1" : "0";
      }
    };
    const iv = setInterval(tick, 1000);
    tick();
    return card("world clock", null, list);
  },
});

const playToggle = (off, on, onIcon = "pause") => {
  const icons = {
    play: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>`,
    stop: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  };
  const el = h(
    "button",
    { class: "w-btn primary w-play", type: "button", "aria-label": off },
    h(
      "span",
      { class: "w-play-ic", "aria-hidden": "true" },
      h("span", { class: "w-play-a", html: icons.play }),
      h("span", { class: "w-play-b", html: icons[onIcon] }),
    ),
    h(
      "span",
      { class: "w-play-lb", "aria-hidden": "true" },
      h("span", { class: "w-play-a" }, off),
      h("span", { class: "w-play-b" }, on),
    ),
  );
  const set = (v) => {
    el.dataset.on = v ? "1" : "";
    el.setAttribute("aria-label", v ? on : off);
  };
  return { el, set };
};

reg({
  id: "pomodoro",
  match: (q) => /^pomodoro(?:\s+timer)?$/i.test(q.trim()),
  build: () => {
    let mode = "focus",
      remaining = 25 * 60,
      running = false,
      iv = null;
    const durations = { focus: 25 * 60, break: 5 * 60 };
    const digits = odometer("w-pomo-digits", -1, 2);
    const modeLabel = h("span", { class: "w-pomo-chip" });
    const ring = h("div", {
      class: "w-pomo-ring",
      "aria-hidden": "true",
      html: `<svg viewBox="0 0 120 120"><circle class="w-pomo-track" cx="60" cy="60" r="54" pathLength="100"/><circle class="w-pomo-arc" cx="60" cy="60" r="54" pathLength="100"/></svg>`,
    });
    const arc = ring.querySelector(".w-pomo-arc");
    const disp = h(
      "div",
      { class: "w-pomo-disp" },
      ring,
      h("div", { class: "w-pomo-core" }, digits.el, modeLabel),
    );
    const hero = h("div", { class: "w-pomo-hero" }, disp);
    const fmt = (s) =>
      `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    const upd = () => {
      digits.set(fmt(remaining));
      const fresh = mode === "focus" && remaining === durations.focus;
      modeLabel.textContent = running || fresh ? mode : `${mode}, paused`;
      disp.dataset.mode = mode;
      resetBtn.disabled = fresh && !running;
      const idle = fresh ? "start" : "resume";
      start.el.querySelector(".w-play-lb .w-play-a").textContent = idle;
      if (!running) start.el.setAttribute("aria-label", idle);
      const done = Math.max(0, 1 - remaining / durations[mode]);
      arc.style.strokeDashoffset = `${100 - done * 100}`;
      arc.style.opacity = done > 0 ? "1" : "0";
    };
    const snap = () => {
      arc.style.transition = "none";
      upd();
      void arc.getBoundingClientRect();
      arc.style.transition = "";
    };
    const start = playToggle("start", "pause");
    const tick = () => {
      if (!disp.isConnected) return clearInterval(iv);
      remaining--;
      if (remaining < 0) {
        mode = mode === "focus" ? "break" : "focus";
        remaining = durations[mode];
        snap();
        modeLabel.classList.remove("flip");
        void modeLabel.offsetWidth;
        modeLabel.classList.add("flip");
        const o = audio().createOscillator(),
          g = audio().createGain();
        o.frequency.value = 880;
        o.connect(g);
        g.connect(audio().destination);
        g.gain.setValueAtTime(0.2, audio().currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio().currentTime + 0.5);
        o.start();
        o.stop(audio().currentTime + 0.5);
      }
      upd();
    };
    start.el.onclick = () => {
      running = !running;
      start.set(running);
      disp.classList.toggle("running", running);
      if (running) iv = setInterval(tick, 1000);
      else clearInterval(iv);
      upd();
    };
    const resetBtn = h("button", {
      class: "w-btn",
      type: "button",
      html: "reset",
      onclick: () => {
        clearInterval(iv);
        running = false;
        mode = "focus";
        remaining = durations.focus;
        start.set(false);
        disp.classList.remove("running");
        snap();
      },
    });
    upd();
    return card(
      "pomodoro",
      "25 min focus / 5 min break",
      hero,
      h("div", { class: "w-btn-row w-pomo-btns" }, start.el, resetBtn),
    );
  },
});

reg({
  id: "countdownny",
  match: (q) =>
    /^(?:countdown\s+to\s+)?new\s*year(?:\s+countdown)?$/i.test(q.trim()),
  build: () => {
    const target = new Date(new Date().getFullYear() + 1, 0, 1);
    const cells = ["days", "hours", "minutes", "seconds"].map((unit) => {
      const od = odometer("w-nyc-num", -1, unit === "seconds" ? 2 : 0);
      return {
        od,
        el: h(
          "div",
          { class: "w-nyc-cell" },
          od.el,
          h("span", { class: "w-nyc-unit" }, unit),
        ),
      };
    });
    const disp = h("div", { class: "w-nyc-grid" }, ...cells.map((c) => c.el));
    const yearStart = new Date(target.getFullYear() - 1, 0, 1);
    const fill = h("i", { class: "w-nyc-fill" });
    const pct = h("span", { class: "w-nyc-pct" });
    const year = h(
      "div",
      { class: "w-nyc-year" },
      h("div", { class: "w-nyc-bar", "aria-hidden": "true" }, fill),
      pct,
    );
    const pad = (n) => String(n).padStart(2, "0");
    let iv = null;
    const tick = () => {
      if (iv && !disp.isConnected) return clearInterval(iv);
      const done = Math.min(1, (Date.now() - yearStart) / (target - yearStart));
      fill.style.scale = `${done} 1`;
      const label = `${(done * 100).toFixed(1)}% of ${yearStart.getFullYear()} done`;
      if (pct.textContent !== label) pct.textContent = label;
      let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const d = Math.floor(s / 86400);
      s %= 86400;
      const hh = Math.floor(s / 3600);
      s %= 3600;
      const mm = Math.floor(s / 60);
      s %= 60;
      const vals = [String(d), pad(hh), pad(mm), pad(s)];
      cells.forEach((c, i) => {
        c.od.set(vals[i]);
      });
    };
    tick();
    iv = setInterval(tick, 1000);
    return card(
      `countdown to ${target.getFullYear()}`,
      "midnight on 1 january, your local time",
      disp,
      year,
    );
  },
});

reg({
  id: "breathing",
  match: (q) =>
    /^(?:breathing(?:\s+exercise)?|box\s+breathing|breathe)$/i.test(q.trim()),
  build: () => {
    const phases = [
      ["breathe in", "in"],
      ["hold", "full"],
      ["breathe out", "out"],
      ["hold", "empty"],
    ];
    const secs = 4;
    const circle = h("div", { class: "w-breath-circle" });
    const count = h("span", { class: "w-breath-count" });
    const stage = h(
      "div",
      { class: "w-breath-stage", "aria-hidden": "true" },
      h("div", { class: "w-breath-guide" }),
      circle,
      count,
    );
    const label = h(
      "div",
      { class: "w-breath-label", role: "status" },
      "ready",
    );
    const dots = h(
      "div",
      { class: "w-breath-steps", "aria-hidden": "true" },
      ...phases.map(() => h("i")),
    );
    let i = 0,
      n = 0,
      to = null,
      running = false;
    const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    const soft = (el, dist) => {
      if (calm()) return;
      el.animate(
        [
          {
            opacity: 0,
            filter: "blur(4px)",
            transform: `translateY(${dist}px)`,
          },
          { opacity: 1, filter: "blur(0)", transform: "none" },
        ],
        { duration: 360, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
    };
    const say = (text) => {
      if (label.textContent === text) return;
      label.textContent = text;
      soft(label, 4);
    };
    const step = () => {
      if (!circle.isConnected) return clearTimeout(to);
      const at = i % phases.length;
      if (n === 0) {
        const [text, phase] = phases[at];
        say(text);
        stage.dataset.phase = phase;
        [...dots.children].forEach((d, k) => {
          d.classList.toggle("on", k === at);
        });
      }
      count.textContent = secs - n;
      n++;
      if (n === secs) {
        n = 0;
        i++;
      }
      to = setTimeout(step, 1000);
    };
    const btn = playToggle("start", "stop", "stop");
    btn.el.onclick = () => {
      running = !running;
      btn.set(running);
      stage.classList.toggle("running", running);
      clearTimeout(to);
      if (running) {
        i = 0;
        n = 0;
        step();
        return;
      }
      delete stage.dataset.phase;
      count.textContent = "";
      for (const d of dots.children) d.classList.remove("on");
      say("ready");
    };
    return card(
      "box breathing",
      "4-4-4-4 to calm down",
      h("div", { class: "w-breath-wrap" }, stage, label, dots),
      h("div", { class: "w-btn-row w-breath-btns" }, btn.el),
    );
  },
});

reg({
  id: "counter",
  match: (q) =>
    /^(?:word|character|char)\s+count(?:er)?$|^count\s+(?:words|characters)$/i.test(
      q.trim(),
    ),
  build: () => {
    const ta = h("textarea", {
      class: "w-textarea w-wc-in",
      rows: "5",
      placeholder: "type or paste text",
      "aria-label": "text to count",
    });
    const big = h("span", { class: "w-wc-num" }, "0");
    const unit = h("span", { class: "w-wc-unit" }, "words");
    const stats = ["characters", "sentences", "lines", "reading time"].map(
      (label) => ({
        val: h("dd", { class: "w-wc-val" }, "0"),
        key: h("dt", { class: "w-wc-key" }, label),
      }),
    );
    const out = h(
      "div",
      { class: "w-wc-out empty" },
      h("div", { class: "w-wc-hero" }, big, unit),
      h(
        "dl",
        { class: "w-wc-stats" },
        stats.map(({ val, key }) => h("div", { class: "w-wc-stat" }, key, val)),
      ),
    );
    const sentencer = Intl.Segmenter
      ? new Intl.Segmenter(undefined, { granularity: "sentence" })
      : null;
    const run = () => {
      const t = ta.value;
      const words = (t.match(/\S+/g) || []).length;
      const sentences = sentencer
        ? [...sentencer.segment(t)].filter((x) =>
            /\p{L}|\p{N}/u.test(x.segment),
          ).length
        : (t.match(/[^.!?]+[.!?]*/g) || []).filter((x) => /\S/.test(x)).length;
      const secs = Math.round((words / 238) * 60);
      const vals = [
        [...t].length,
        sentences,
        t ? t.split("\n").length : 0,
        !words
          ? "0 sec"
          : secs < 60
            ? `${Math.max(1, secs)} sec`
            : `${Math.round(secs / 60)} min`,
      ];
      big.textContent = words.toLocaleString();
      unit.textContent = words === 1 ? "word" : "words";
      out.classList.toggle("empty", !t);
      stats.forEach(({ val }, i) => {
        const v =
          typeof vals[i] === "number" ? vals[i].toLocaleString() : vals[i];
        if (val.textContent !== v) val.textContent = v;
      });
    };
    ta.oninput = run;
    run();
    return card("word counter", null, ta, out);
  },
});

reg({
  id: "tapbpm",
  match: (q) =>
    /^(?:bpm\s+(?:tapper|counter)|tap\s+(?:tempo|bpm)|tempo\s+tapper)$/i.test(
      q.trim(),
    ),
  build: () => {
    let taps = [];
    const num = h("span", { class: "w-tap-num" }, "tap");
    const unit = h("span", { class: "w-tap-unit" }, "bpm");
    const hint = h("span", { class: "w-tap-hint" });
    const live = h("span", { class: "w-sr", role: "status" });
    const pad = h(
      "button",
      {
        class: "w-tap-pad",
        type: "button",
        "aria-label": "tap to the beat",
      },
      h(
        "span",
        { class: "w-tap-out", "aria-hidden": "true" },
        h("span", { class: "w-tap-read" }, num, unit),
        hint,
      ),
    );
    const reset = h("button", {
      class: "w-btn",
      type: "button",
      html: "reset",
      disabled: "",
    });
    const show = (bpm, text) => {
      pad.dataset.live = bpm == null ? "" : "1";
      num.textContent = bpm == null ? "tap" : bpm;
      hint.textContent = text;
      live.textContent = bpm == null ? "" : `${bpm} bpm`;
      reset.disabled = !taps.length;
    };
    show(null, "the tempo shows after two taps");
    const tap = () => {
      const now = performance.now();
      taps = taps.filter((t) => now - t < 3000);
      taps.push(now);
      if (taps.length >= 2) {
        const intervals = taps.slice(1).map((t, i) => t - taps[i]);
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        show(Math.round(60000 / avg), `averaged over ${taps.length} taps`);
      } else show(null, "keep tapping");
      pad.classList.remove("hit");
      void pad.offsetWidth;
      pad.classList.add("hit");
    };
    pad.onpointerdown = (e) => {
      if (!e.button) tap();
    };
    pad.onclick = (e) => {
      if (e.detail === 0) tap();
    };
    reset.onclick = () => {
      taps = [];
      show(null, "the tempo shows after two taps");
      pad.focus();
    };
    return card(
      "bpm tapper",
      "tap the pad in time with the beat",
      pad,
      live,
      h("div", { class: "w-btn-row w-tap-btns" }, reset),
    );
  },
});

reg({
  id: "metronome",
  match: (q) => /^metronome$/i.test(q.trim()),
  build: () => {
    let bpm = 120,
      beats = 4,
      running = false,
      iv = null,
      due = 0,
      beat = 0,
      side = 1;
    const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dots = h("div", { class: "w-metro-dots" });
    const arm = h(
      "div",
      { class: "w-metro-arm" },
      h("span", { class: "w-metro-bob" }),
    );
    const pend = h(
      "div",
      { class: "w-metro-pend", "aria-hidden": "true" },
      h("div", { class: "w-metro-arc" }),
      arm,
      h("span", { class: "w-metro-pivot" }),
    );
    const renderDots = () =>
      dots.replaceChildren(
        ...Array.from({ length: beats }, (_, i) =>
          h("div", {
            class: `w-metro-dot${i === 0 ? " accent" : ""}`,
            "aria-hidden": "true",
          }),
        ),
      );
    const click = (accent) => {
      const o = audio().createOscillator(),
        g = audio().createGain();
      o.frequency.value = accent ? 1500 : 1000;
      o.connect(g);
      g.connect(audio().destination);
      g.gain.setValueAtTime(0.3, audio().currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio().currentTime + 0.05);
      o.start();
      o.stop(audio().currentTime + 0.05);
    };
    const swing = (deg, ms, easing) => {
      arm.style.transition = `rotate ${ms}ms ${easing}`;
      arm.style.rotate = `${deg}deg`;
    };
    const tick = () => {
      if (!dots.isConnected) {
        running = false;
        return;
      }
      [...dots.children].forEach((d, i) => {
        d.classList.toggle("on", i === beat);
        if (i !== beat || calm()) return;
        d.animate([{ scale: 1.2 }, { scale: 1 }], {
          duration: Math.min(240, 60000 / bpm),
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        });
      });
      click(beat === 0);
      if (!calm()) {
        side = -side;
        swing(side * 26, 60000 / bpm, "cubic-bezier(0.37, 0, 0.63, 1)");
      }
      beat = (beat + 1) % beats;
      due += 60000 / bpm;
      iv = setTimeout(tick, Math.max(0, due - performance.now()));
    };
    const tempoNum = h("span", { class: "w-metro-num" }, bpm);
    const tempoName = h("span", { class: "w-metro-name" });
    const nameFor = (v) =>
      v < 60
        ? "largo"
        : v < 76
          ? "adagio"
          : v < 108
            ? "andante"
            : v < 120
              ? "moderato"
              : v < 168
                ? "allegro"
                : "presto";
    tempoName.textContent = nameFor(bpm);
    const bpmIn = slider({
      min: "40",
      max: "240",
      value: bpm,
      "aria-label": "tempo in beats per minute",
    });
    const start = playToggle("start", "stop", "stop");
    bpmIn.oninput = () => {
      bpm = +bpmIn.value;
      tempoNum.textContent = bpm;
      tempoName.textContent = nameFor(bpm);
    };
    start.el.onclick = () => {
      running = !running;
      start.set(running);
      dots.classList.toggle("running", running);
      pend.classList.toggle("running", running);
      clearTimeout(iv);
      if (running) {
        beat = 0;
        side = 1;
        due = performance.now();
        tick();
        return;
      }
      swing(0, 420, "cubic-bezier(0.23, 1, 0.32, 1)");
      for (const d of dots.children) d.classList.remove("on");
    };
    const beatsSeg = segmented(
      "beats per bar",
      ["2", "3", "4", "6"],
      "4",
      (v) => {
        beats = +v;
        beat = 0;
        renderDots();
      },
    );
    renderDots();
    return card(
      "metronome",
      null,
      h(
        "div",
        { class: "w-metro-stage" },
        pend,
        h(
          "div",
          { class: "w-metro-tempo" },
          tempoNum,
          h("span", { class: "w-metro-unit" }, "bpm"),
          tempoName,
        ),
        dots,
      ),
      sliderField("tempo", bpmIn),
      h("div", { class: "w-label col" }, "beats per bar", beatsSeg),
      h("div", { class: "w-btn-row" }, start.el),
    );
  },
});

const WAVE_PATHS = {
  sine: ["M0 20", "c10 -14 20 -14 30 0c10 14 20 14 30 0"],
  square: ["M0 32", "v-24h30v24h30"],
  sawtooth: ["M0 32", "l60 -24v24"],
  triangle: ["M0 20", "l15 -12l30 24l15 -12"],
};

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const mkPlayBtn = (onclick) => {
  const { el } = playToggle("play", "stop", "stop");
  el.onclick = onclick;
  return el;
};

const setPlaying = (btn, on) => {
  btn.dataset.on = on ? "1" : "";
  btn.classList.toggle("active", on);
  btn.setAttribute("aria-label", on ? "stop" : "play");
};

reg({
  id: "tone",
  match: (q) => {
    let m = q.match(
      /^(?:tone\s+generator|frequency\s+generator|sine\s+wave|signal\s+generator)$/i,
    );
    if (m) return { freq: 440 };
    m = q.match(/^(\d{2,5})\s*hz$/i);
    if (m) return { freq: +m[1] };
    return null;
  },
  build: ({ freq: initial }) => {
    const LO = 20;
    const HI = 20000;
    const clampF = (f) => Math.min(HI, Math.max(LO, f));
    const levelFor = (w) => (w === "sine" || w === "triangle" ? 0.15 : 0.07);
    const toPos = (f) =>
      Math.round((Math.log(f / LO) / Math.log(HI / LO)) * 1000);
    const fmt = (f) =>
      f < 100 ? f.toFixed(1).replace(/\.0$/, "") : `${Math.round(f)}`;
    let freq = clampF(initial),
      osc = null,
      gain = null,
      wave = "sine",
      raf = 0,
      last = 0,
      phase = 0;
    const num = h("input", {
      class: "w-tone-num",
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": "frequency in hertz",
      value: fmt(freq),
    });
    const note = h("span", { class: "w-tone-note", "aria-live": "polite" });
    const freqIn = slider({
      min: "0",
      max: "1000",
      value: toPos(freq),
    });
    const scope = h("div", {
      class: "w-tone-scope",
      html: `<svg viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true"><g class="w-tone-amp"><path/></g></svg>`,
    });
    const path = scope.querySelector("path");
    const place = () => {
      const sx = 2 / (1 + Math.log2(freq / 20) * 0.75);
      path.setAttribute(
        "transform",
        `scale(${sx.toFixed(4)} 1) translate(${(-(phase % 60)).toFixed(2)} 0)`,
      );
    };
    const shapeWave = () => {
      const [start, cycle] = WAVE_PATHS[wave];
      path.setAttribute("d", `${start}${cycle.repeat(10)}`);
    };
    const sizeNum = () => {
      num.style.width = `${Math.max(2, num.value.length) + 0.25}ch`;
    };
    const apply = (f, from) => {
      freq = clampF(f);
      if (from !== "num") {
        num.value = fmt(freq);
        sizeNum();
      }
      if (from !== "range") {
        freqIn.value = toPos(freq);
        freqIn.style.setProperty("--p", freqIn.value / 1000);
      }
      const midi = 69 + 12 * Math.log2(freq / 440);
      const near = Math.round(midi);
      const cents = Math.round((midi - near) * 100);
      note.textContent = `${NOTE_NAMES[near % 12]}${Math.floor(near / 12) - 1}${cents ? `, ${Math.abs(cents)} cents ${cents > 0 ? "sharp" : "flat"}` : ""}`;
      place();
      osc?.frequency.setTargetAtTime(freq, audio().currentTime, 0.01);
    };
    shapeWave();
    apply(freq);
    const loop = (now) => {
      if (!osc || !scope.isConnected) {
        raf = 0;
        return;
      }
      phase += (now - (last || now)) * 0.06;
      last = now;
      place();
      raf = requestAnimationFrame(loop);
    };
    const display = h(
      "div",
      { class: "w-tone-display" },
      h(
        "div",
        { class: "w-tone-read" },
        h(
          "label",
          { class: "w-tone-field" },
          num,
          h("span", { class: "w-tone-unit" }, "Hz"),
        ),
        note,
      ),
      scope,
    );
    const stop = () => {
      if (!osc) return;
      const t = audio().currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0.0001, t, 0.02);
      osc.stop(t + 0.15);
      osc = null;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const btn = mkPlayBtn(() => {
      if (osc) {
        stop();
        setPlaying(btn, false);
        display.classList.remove("live");
        return;
      }
      const ac = audio();
      const t = ac.currentTime;
      osc = ac.createOscillator();
      gain = ac.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.setTargetAtTime(levelFor(wave), t, 0.015);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      setPlaying(btn, true);
      display.classList.add("live");
      if (calmMotion()) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    });
    freqIn.oninput = () =>
      apply(LO * (HI / LO) ** (freqIn.value / 1000), "range");
    num.oninput = () => {
      sizeNum();
      const f = Number.parseFloat(num.value.replace(",", "."));
      const bad = Number.isNaN(f) || f < LO || f > HI;
      num.setAttribute("aria-invalid", bad);
      if (!bad) apply(f, "num");
    };
    num.onblur = () => {
      num.removeAttribute("aria-invalid");
      num.value = fmt(freq);
      sizeNum();
    };
    num.onkeydown = (e) => {
      if (e.key === "Enter") return num.blur();
      const dir = { ArrowUp: 1, ArrowDown: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      apply(Math.round(freq) + dir * (e.shiftKey ? 10 : 1));
    };
    const waves = segmented("waveform", Object.keys(WAVE_PATHS), wave, (w) => {
      wave = w;
      shapeWave();
      place();
      if (!osc) return;
      osc.type = w;
      gain.gain.setTargetAtTime(levelFor(w), audio().currentTime, 0.01);
    });
    return card(
      "tone generator",
      "check your volume before playing",
      display,
      sliderField("frequency", freqIn),
      h("div", { class: "w-label col" }, "waveform", waves),
      h("div", { class: "w-btn-row" }, btn),
    );
  },
});

reg({
  id: "noise",
  match: (q) =>
    /^(?:white|pink|brown)\s+noise|^noise\s+generator|^ambient\s+noise$/i.test(
      q.trim(),
    ),
  build: (_, q) => {
    let kind = (q.match(/white|pink|brown/i) || ["white"])[0].toLowerCase();
    let src = null,
      gain = null;
    const makeNoise = () => {
      const ac = audio();
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === "white") d[i] = w;
        else if (kind === "brown") {
          d[i] = (last + 0.02 * w) / 1.02;
          last = d[i];
          d[i] *= 3.5;
        } else {
          d[i] = ((last + 0.02 * w) / 1.02) * 1.5 + w * 0.5;
          last = (last + 0.02 * w) / 1.02;
        }
      }
      const s = ac.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      return s;
    };
    const volVal = h("span", null, "30");
    const vol = slider({
      min: "0",
      max: "100",
      value: "30",
    });
    const level = () => (vol.value / 100) * 0.5;
    const seeds = Array.from({ length: 40 }, () => 0.55 + Math.random() * 0.45);
    const bars = seeds.map((_, i) => {
      const b = h("span", { class: "w-noise-bar" });
      b.style.setProperty("--i", i);
      b.style.setProperty(
        "--d",
        `${(0.22 + Math.random() * 0.36).toFixed(2)}s`,
      );
      b.style.setProperty("--delay", `${(-Math.random()).toFixed(2)}s`);
      return b;
    });
    const shape = () => {
      bars.forEach((b, i) => {
        const t = i / 39;
        const tilt =
          kind === "white"
            ? 1
            : kind === "pink"
              ? 1 - t * 0.55
              : (1 - t) ** 2.2;
        b.style.setProperty(
          "--h",
          Math.max(0.06, Math.min(1, tilt * seeds[i])).toFixed(3),
        );
      });
    };
    shape();
    const display = h(
      "div",
      { class: `w-noise-viz ${kind}` },
      h("div", { class: "w-noise-bars", "aria-hidden": "true" }, bars),
    );
    display.style.setProperty("--vol", vol.value / 100);
    const start = () => {
      const ac = audio();
      const t = ac.currentTime;
      src = makeNoise();
      gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.setTargetAtTime(level(), t, 0.03);
      src.connect(gain);
      gain.connect(ac.destination);
      src.start(t);
    };
    const stop = () => {
      if (!src) return;
      const t = audio().currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0.0001, t, 0.03);
      src.stop(t + 0.2);
      src = null;
      gain = null;
    };
    const btn = mkPlayBtn(() => {
      const on = !src;
      if (on) start();
      else stop();
      setPlaying(btn, on);
      display.classList.toggle("live", on);
    });
    const blurb = {
      white: "even hiss across every frequency, like tv static",
      pink: "softer highs, like steady rain",
      brown: "deep rumble, like a distant waterfall",
    };
    const kinds = segmented(
      "noise color",
      ["white", "pink", "brown"],
      kind,
      (k) => {
        display.classList.remove(kind);
        kind = k;
        display.classList.add(k);
        shape();
        el.querySelector(".w-title").textContent = `${k} noise`;
        el.querySelector(".w-sub").textContent = blurb[k];
        if (!src) return;
        stop();
        start();
      },
    );
    vol.oninput = () => {
      volVal.textContent = vol.value;
      display.style.setProperty("--vol", vol.value / 100);
      gain?.gain.setTargetAtTime(level(), audio().currentTime, 0.02);
    };
    const el = card(
      `${kind} noise`,
      blurb[kind],
      display,
      h("div", { class: "w-label col" }, "color", kinds),
      sliderField("volume", vol, volVal, "%"),
      h("div", { class: "w-btn-row" }, btn),
    );
    return el;
  },
});

reg({
  id: "piano",
  match: (q) =>
    /^(?:piano|keyboard\s+piano|virtual\s+piano|play\s+piano)$/i.test(q.trim()),
  build: () => {
    const whites = [60, 62, 64, 65, 67, 69, 71, 72];
    const blacks = [
      [61, 0.65],
      [63, 1.75],
      [66, 3.6],
      [68, 4.7],
      [70, 5.8],
    ];
    const qwerty = {
      a: 60,
      w: 61,
      s: 62,
      e: 63,
      d: 64,
      f: 65,
      t: 66,
      g: 67,
      y: 68,
      h: 69,
      u: 70,
      j: 71,
      k: 72,
    };
    const letterFor = Object.fromEntries(
      Object.entries(qwerty).map(([k, m]) => [m, k]),
    );
    const noteName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
    let oct = 0;
    const bed = h("div", { class: "w-piano-bed" });
    const wrap = h("div", { class: "w-piano" }, bed);
    const elByMidi = {};
    const held = new Map();
    const byPointer = new Set();
    let dragging = false;
    const press = (key) => {
      if (held.has(key)) return;
      const ac = audio();
      const t = ac.currentTime;
      const o = ac.createOscillator(),
        f = ac.createBiquadFilter(),
        g = ac.createGain();
      o.type = "triangle";
      o.frequency.value = noteFreq(key + oct * 12);
      f.type = "lowpass";
      f.frequency.setValueAtTime(4000, t);
      f.frequency.setTargetAtTime(1200, t, 0.5);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.008);
      g.gain.setTargetAtTime(0.0001, t + 0.008, 1.1);
      o.connect(f);
      f.connect(g);
      g.connect(ac.destination);
      o.start(t);
      held.set(key, { o, g });
      elByMidi[key]?.classList.add("down");
    };
    const release = (key) => {
      const note = held.get(key);
      if (!note) return;
      held.delete(key);
      byPointer.delete(key);
      const t = audio().currentTime;
      const { gain: p } = note.g;
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else {
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
      }
      p.setTargetAtTime(0.0001, t, 0.12);
      note.o.stop(t + 1);
      elByMidi[key]?.classList.remove("down");
    };
    const notes = [];
    const mkKey = (midi, cls, props) => {
      const nm = h("span", { class: "w-key-note" });
      notes.push([nm, midi]);
      const k = h(
        "button",
        { class: cls, type: "button", ...props },
        nm,
        h("span", { class: "w-key-cap" }, letterFor[midi]),
      );
      k.onpointerdown = (e) => {
        if (e.button > 0) return;
        if (k.hasPointerCapture?.(e.pointerId))
          k.releasePointerCapture(e.pointerId);
        dragging = true;
        byPointer.add(midi);
        press(midi);
      };
      k.onpointerenter = () => {
        if (!dragging) return;
        byPointer.add(midi);
        press(midi);
      };
      k.onpointerleave = () => {
        if (byPointer.has(midi)) release(midi);
      };
      k.onclick = (e) => {
        if (e.detail) return;
        press(midi);
        setTimeout(() => release(midi), 180);
      };
      elByMidi[midi] = k;
      return k;
    };
    for (const midi of whites) bed.append(mkKey(midi, "w-key"));
    for (const [midi, at] of blacks)
      bed.append(
        mkKey(midi, "w-key black", { style: { left: `${at * 12.5}%` } }),
      );
    const range = h("span", { class: "w-piano-range", "aria-live": "polite" });
    const down = h("button", {
      class: "w-piano-step",
      type: "button",
      "aria-label": "octave down",
      html: `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9"/></svg>`,
    });
    const up = h("button", {
      class: "w-piano-step",
      type: "button",
      "aria-label": "octave up",
      html: `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9"/></svg>`,
    });
    const shift = (d) => {
      oct = Math.max(-3, Math.min(3, oct + d));
      down.disabled = oct === -3;
      up.disabled = oct === 3;
      range.textContent = `${noteName(60 + oct * 12)} to ${noteName(72 + oct * 12)}`;
      for (const [nm, midi] of notes) {
        nm.textContent = midi % 12 ? "" : noteName(midi + oct * 12);
        elByMidi[midi].setAttribute("aria-label", noteName(midi + oct * 12));
      }
    };
    down.onclick = () => shift(-1);
    up.onclick = () => shift(1);
    shift(0);
    const events = {
      keydown: (e) => {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const key = e.key.toLowerCase();
        if (key === "z" || key === "x") return shift(key === "z" ? -1 : 1);
        if (qwerty[key]) press(qwerty[key]);
      },
      keyup: (e) => {
        const m = qwerty[e.key.toLowerCase()];
        if (m && !byPointer.has(m)) release(m);
      },
      pointerup: () => {
        dragging = false;
        for (const m of [...byPointer]) release(m);
      },
      blur: () => {
        dragging = false;
        for (const m of [...held.keys()]) release(m);
      },
    };
    events.pointercancel = events.pointerup;
    const bind = (on) => {
      for (const type of Object.keys(events))
        window[on ? "addEventListener" : "removeEventListener"](type, guard);
    };
    const guard = (e) => {
      if (!wrap.isConnected) return bind(false);
      events[e.type](e);
    };
    bind(true);
    return card(
      "piano",
      "click the keys or type a to k",
      wrap,
      h(
        "div",
        { class: "w-piano-bar" },
        h(
          "div",
          { class: "w-piano-oct", role: "group", "aria-label": "octave" },
          down,
          range,
          up,
        ),
        h(
          "span",
          { class: "w-piano-hint" },
          h("kbd", null, "z"),
          " and ",
          h("kbd", null, "x"),
          " shift octave",
        ),
      ),
    );
  },
});

reg({
  id: "drums",
  match: (q) =>
    /^(?:drum\s+machine|beat\s+maker|step\s+sequencer|drum\s+pad)$/i.test(
      q.trim(),
    ),
  build: () => {
    const STEPS = 16;
    const tracks = ["kick", "snare", "hi-hat", "clap"];
    const starter = [[0, 7, 8, 10], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], []];
    const grid = starter.map((on) =>
      Array.from({ length: STEPS }, (_, s) => on.includes(s)),
    );
    let bpm = 110,
      playing = false,
      timer = 0,
      run = 0,
      step = 0,
      nextTime = 0,
      shown = -1,
      noiseBuf = null;
    const seq = h("div", { class: "w-seq" });
    const wrap = h("div", { class: "w-seq-wrap" }, seq);
    const cellEls = [];
    const pop = (el, from) => {
      if (calmMotion()) return;
      el.animate([{ scale: from }, { scale: 1 }], {
        duration: 220,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    };
    const sound = (ti, t) => {
      const ac = audio();
      const g = ac.createGain();
      g.connect(ac.destination);
      if (ti === 0) {
        const o = ac.createOscillator();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(0.8, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.16);
        return;
      }
      if (!noiseBuf) {
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const b = ac.createBufferSource();
      b.buffer = noiseBuf;
      const f = ac.createBiquadFilter();
      const len = { 1: 0.2, 2: 0.05, 3: 0.12 }[ti];
      f.type = ti === 2 ? "highpass" : "bandpass";
      f.frequency.value = { 1: 1800, 2: 7000, 3: 1200 }[ti];
      g.gain.setValueAtTime(ti === 2 ? 0.3 : 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      b.connect(f);
      f.connect(g);
      b.start(t);
      b.stop(t + len + 0.01);
    };
    const hasNotes = () => grid.some((t) => t.includes(true));
    const clear = h("button", { class: "w-btn", type: "button" }, "clear");
    tracks.forEach((name, ti) => {
      for (const half of [0, 1]) {
        const lb = h("span", { class: "w-seq-label" }, name);
        lb.style.setProperty("--t", ti);
        lb.style.setProperty("--half", half);
        if (half) lb.setAttribute("aria-hidden", "true");
        seq.append(lb);
      }
      const cells = [];
      for (let s = 0; s < STEPS; s++) {
        const c = h("button", {
          class: `w-seq-cell${s % 4 === 0 ? " beat" : ""}${grid[ti][s] ? " on" : ""}`,
          type: "button",
          "aria-label": `${name} step ${s + 1}`,
          "aria-pressed": grid[ti][s],
        });
        c.style.setProperty("--t", ti);
        c.style.setProperty("--s", s);
        c.style.setProperty("--s8", s % 8);
        c.style.setProperty("--half", s < 8 ? 0 : 1);
        c.onclick = () => {
          grid[ti][s] = !grid[ti][s];
          c.classList.toggle("on", grid[ti][s]);
          c.setAttribute("aria-pressed", grid[ti][s]);
          clear.disabled = !hasNotes();
          if (!grid[ti][s]) return;
          pop(c, 1.12);
          if (!playing) sound(ti, audio().currentTime);
        };
        cells.push(c);
        seq.append(c);
      }
      cellEls.push(cells);
    });
    const show = (s) => {
      if (shown >= 0)
        for (const cells of cellEls) cells[shown].classList.remove("now");
      shown = s;
      if (s < 0) return;
      cellEls.forEach((cells, ti) => {
        cells[s].classList.add("now");
        if (grid[ti][s]) pop(cells[s], 1.18);
      });
    };
    const halt = () => {
      playing = false;
      run++;
      clearInterval(timer);
      show(-1);
      setPlaying(playBtn, false);
    };
    const schedule = () => {
      if (!seq.isConnected) return halt();
      const ac = audio();
      const id = run;
      while (nextTime < ac.currentTime + 0.1) {
        const s = step;
        grid.forEach((row, ti) => {
          if (row[s]) sound(ti, nextTime);
        });
        setTimeout(
          () => {
            if (id === run) show(s);
          },
          Math.max(0, (nextTime - ac.currentTime) * 1000),
        );
        nextTime += 60 / bpm / 4;
        step = (step + 1) % STEPS;
      }
    };
    const playBtn = mkPlayBtn(() => {
      if (playing) return halt();
      playing = true;
      setPlaying(playBtn, true);
      step = 0;
      nextTime = audio().currentTime + 0.05;
      schedule();
      timer = setInterval(schedule, 25);
    });
    const bpmVal = h("span", null, bpm);
    const bpmIn = slider({
      min: "60",
      max: "180",
      value: bpm,
    });
    bpmIn.oninput = () => {
      bpm = +bpmIn.value;
      bpmVal.textContent = bpm;
    };
    clear.onclick = () => {
      for (const t of grid) t.fill(false);
      for (const cells of cellEls)
        for (const c of cells) {
          c.classList.remove("on");
          c.setAttribute("aria-pressed", "false");
        }
      clear.disabled = true;
    };
    return card(
      "drum machine",
      "tap steps to turn them on or off",
      wrap,
      sliderField("tempo", bpmIn, bpmVal, " bpm"),
      h("div", { class: "w-btn-row" }, playBtn, clear),
    );
  },
});

reg({
  id: "melody",
  match: (q) =>
    /^(?:melody\s+generator|random\s+melody|music\s+generator|generate\s+(?:a\s+)?(?:melody|music|tune))$/i.test(
      q.trim(),
    ),
  build: () => {
    const scales = {
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      pentatonic: [0, 2, 4, 7, 9],
      blues: [0, 3, 5, 6, 7, 10],
    };
    const STEPS = 16;
    const STEP_S = 0.24;
    let notes = [],
      scale = "major",
      voices = [],
      timers = [];
    const roll = h("div", { class: "w-melody-roll", "aria-hidden": "true" });
    const unlight = () => {
      for (const n of notes) n.el.classList.remove("lit");
    };
    const stop = () => {
      const t = audio().currentTime;
      for (const { o, g } of voices) {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0.0001, t, 0.015);
        o.stop(t + 0.1);
      }
      for (const id of timers) clearTimeout(id);
      voices = [];
      timers = [];
      unlight();
      setPlaying(playBtn, false);
    };
    const gen = () => {
      if (voices.length) stop();
      const sc = scales[scale];
      const top = sc.length * 2;
      const pick = (pairs) => {
        let r = Math.random();
        for (const [v, w] of pairs) {
          r -= w;
          if (r < 0) return v;
        }
        return pairs[0][0];
      };
      let deg =
        sc.length +
        pick([
          [0, 0.5],
          [2, 0.3],
          [4, 0.2],
        ]);
      let at = 0;
      notes = [];
      while (at < STEPS) {
        const left = STEPS - at;
        let len = Math.min(
          left,
          pick([
            [1, 0.45],
            [2, 0.4],
            [4, 0.15],
          ]),
        );
        if (left - len === 1) len = left;
        if (at > 0 && left > 2 && Math.random() < 0.1) {
          at += 1;
          continue;
        }
        const last = at + len >= STEPS;
        if (last) deg = deg >= sc.length ? sc.length : 0;
        const midi =
          60 + 12 * Math.floor(deg / sc.length) + sc[deg % sc.length];
        notes.push({ midi, at, len });
        at += len;
        const move = pick([
          [1, 0.35],
          [-1, 0.35],
          [2, 0.12],
          [-2, 0.12],
          [0, 0.06],
        ]);
        deg = Math.max(0, Math.min(top, deg + move));
      }
      const pitches = notes.map((n) => n.midi);
      const lo = Math.min(...pitches);
      const span = Math.max(12, Math.max(...pitches) - lo);
      const base = lo - (span - (Math.max(...pitches) - lo)) / 2;
      for (const n of notes) {
        n.el = h("span", { class: "w-melody-note" });
        n.el.style.setProperty("--at", n.at);
        n.el.style.setProperty("--len", n.len);
        n.el.style.setProperty("--y", (n.midi - base) / span);
      }
      roll.replaceChildren(...notes.map((n) => n.el));
    };
    const play = () => {
      if (voices.length) return stop();
      const ac = audio();
      const t0 = ac.currentTime + 0.05;
      setPlaying(playBtn, true);
      for (const n of notes) {
        const t = t0 + n.at * STEP_S;
        const dur = n.len * STEP_S;
        const o = ac.createOscillator(),
          g = ac.createGain();
        o.type = "triangle";
        o.frequency.value = noteFreq(n.midi);
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.setTargetAtTime(0.12, t + 0.02, 0.15);
        g.gain.setTargetAtTime(0.0001, t + dur - 0.05, 0.02);
        o.connect(g);
        g.connect(ac.destination);
        o.start(t);
        o.stop(t + dur + 0.05);
        voices.push({ o, g });
        timers.push(
          setTimeout(
            () => {
              if (!roll.isConnected) return;
              unlight();
              n.el.classList.add("lit");
            },
            (t - ac.currentTime) * 1000,
          ),
        );
      }
      timers.push(
        setTimeout(
          () => {
            voices = [];
            timers = [];
            unlight();
            setPlaying(playBtn, false);
          },
          (t0 + STEPS * STEP_S - ac.currentTime) * 1000,
        ),
      );
    };
    const playBtn = mkPlayBtn(play);
    const scaleSeg = segmented("scale", Object.keys(scales), scale, (s) => {
      scale = s;
      gen();
    });
    gen();
    return card(
      "melody generator",
      "a random two-bar tune in the scale you pick",
      roll,
      h("div", { class: "w-label col" }, "scale", scaleSeg),
      h(
        "div",
        { class: "w-btn-row" },
        playBtn,
        h("button", {
          class: "w-btn",
          type: "button",
          html: "regenerate",
          onclick: gen,
        }),
      ),
    );
  },
});

const gameStat = (label, value = "0") => {
  const v = h("b", null, value);
  const el = h("div", { class: "w-game-stat" }, h("span", null, label), v);
  return {
    el,
    set: (x) => {
      v.textContent = String(x);
    },
  };
};

const gameBar = (stats, ...actions) =>
  h(
    "div",
    { class: "w-game-bar" },
    h("div", { class: "w-game-stats" }, ...stats.map((s) => s.el)),
    actions.length ? h("div", { class: "w-game-acts" }, ...actions) : null,
  );

reg({
  id: "reaction",
  match: (q) =>
    /^(?:reaction\s+(?:time|test|speed)|reflex\s+test)$/i.test(q.trim()),
  build: () => {
    let state = "idle";
    let t0 = 0;
    let to = null;
    let raf = 0;
    let swallow = false;
    const main = h("span", { class: "w-react-main" }, "click to start");
    const hint = h(
      "span",
      { class: "w-react-hint" },
      "wait for green, then click as fast as you can",
    );
    const pad = h(
      "button",
      { class: "w-react-pad", type: "button" },
      main,
      hint,
    );
    const recent = [];
    let tries = 0;
    let bestMs = +(localStorage.getItem("w-reaction-best") || Infinity);
    const bestS = gameStat("best");
    const avgS = gameStat("average");
    const triesS = gameStat("tries");
    const bar = gameBar([bestS, avgS, triesS]);
    const showStats = () => {
      bar.hidden = !Number.isFinite(bestMs);
      bestS.set(`${bestMs} ms`);
      avgS.set(
        recent.length
          ? `${Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)} ms`
          : "none",
      );
      triesS.set(tries);
    };
    showStats();
    const set = (cls, text, sub) => {
      pad.className = `w-react-pad${cls ? ` ${cls}` : ""}`;
      main.className = "w-react-main";
      main.textContent = text;
      hint.textContent = sub;
    };
    const act = () => {
      cancelAnimationFrame(raf);
      if (state === "idle" || state === "result") {
        state = "wait";
        set("wait", "wait for green", "don't click yet");
        to = setTimeout(
          () => {
            state = "go";
            set("go", "click!", "now");
            t0 = performance.now();
          },
          1200 + Math.random() * 2800,
        );
        return;
      }
      if (state === "wait") {
        clearTimeout(to);
        state = "idle";
        set("early", "too soon", "click to try again");
        return;
      }
      const ms = Math.round(performance.now() - t0);
      const fresh = ms < bestMs;
      bestMs = Math.min(bestMs, ms);
      localStorage.setItem("w-reaction-best", bestMs);
      recent.push(ms);
      if (recent.length > 5) recent.shift();
      tries++;
      state = "result";
      const verdict = fresh
        ? "new best"
        : ms < 220
          ? "faster than most people"
          : ms < 320
            ? "about average"
            : "slower than average";
      set(
        `result${fresh ? " fresh" : ""}`,
        "0",
        `${verdict} · click to try again`,
      );
      main.classList.add("ms");
      showStats();
      const start = performance.now();
      const dur = calmMotion() ? 0 : Math.min(420, 200 + ms / 3);
      const step = (now) => {
        const p = dur ? Math.min(1, (now - start) / dur) : 1;
        main.textContent = String(Math.round(ms * (1 - (1 - p) ** 3)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    pad.onpointerdown = (e) => {
      swallow = false;
      if (e.button || (state !== "wait" && state !== "go")) return;
      swallow = true;
      act();
    };
    pad.onclick = () => {
      if (swallow) {
        swallow = false;
        return;
      }
      act();
    };
    return card("reaction time", null, bar, pad);
  },
});

reg({
  id: "tictactoe",
  match: (q) =>
    /^(?:tic[\s-]?tac[\s-]?toe|noughts\s+and\s+crosses|xox)$/i.test(q.trim()),
  build: () => {
    let board = Array(9).fill("");
    let game = 0;
    let busy = false;
    let level = localStorage.getItem("w-ttt-level") || "unbeatable";
    const MARK = {
      X: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 11L29 29" pathLength="1"/><path d="M29 11L11 29" pathLength="1"/></svg>`,
      O: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="10.5" pathLength="1"/></svg>`,
    };
    const youS = gameStat(
      h("span", { class: "w-ttt-who x" }, "you", h("i", { html: MARK.X })),
    );
    const tieS = gameStat("ties");
    const cpuS = gameStat(
      h("span", { class: "w-ttt-who o" }, "computer", h("i", { html: MARK.O })),
    );
    const tally = [0, 0, 0];
    const newBtn = h(
      "button",
      { class: "w-btn w-game-new", type: "button" },
      "new game",
    );
    const status = h("div", { class: "w-game-status", role: "status" });
    const line = h("div", { class: "w-ttt-line", "aria-hidden": "true" });
    const grid = h("div", { class: "w-ttt" });
    const setStatus = (text, tone = "") => {
      status.textContent = text;
      status.className = `w-game-status${tone ? ` ${tone}` : ""}`;
    };
    const setTurn = (who) => {
      youS.el.classList.toggle("on", who === "X");
      cpuS.el.classList.toggle("on", who === "O");
    };
    const wins = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    const winLine = (b) =>
      wins.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]);
    const winner = (b) => {
      const w = winLine(b);
      if (w) return b[w[0]];
      return b.every(Boolean) ? "tie" : null;
    };
    const minimax = (b, me, depth = 0) => {
      const w = winner(b);
      if (w === "O") return { score: 10 - depth };
      if (w === "X") return { score: depth - 10 };
      if (w === "tie") return { score: 0 };
      let best = me ? { score: -Infinity } : { score: Infinity };
      for (let i = 0; i < 9; i++)
        if (!b[i]) {
          b[i] = me ? "O" : "X";
          const s = minimax(b, !me, depth + 1).score;
          b[i] = "";
          if (me ? s > best.score : s < best.score)
            best = { score: s, move: i };
        }
      return best;
    };
    const aiMove = () => {
      const free = board.flatMap((v, i) => (v ? [] : [i]));
      const pick = (list) => list[Math.floor(Math.random() * list.length)];
      if (free.length === 9) return pick([0, 2, 4, 6, 8]);
      if (level === "easy" || (level === "medium" && Math.random() < 0.45))
        return pick(free);
      return minimax(board, true).move;
    };
    const place = (i, mark) => {
      board[i] = mark;
      const c = cells[i];
      c.className = `w-ttt-cell filled ${mark.toLowerCase()}`;
      c.innerHTML = MARK[mark];
      c.setAttribute("aria-label", `${c.getAttribute("aria-label")}: ${mark}`);
    };
    const finish = () => {
      const w = winner(board);
      if (!w) return false;
      setTurn(null);
      grid.classList.add("over");
      const slot = w === "X" ? 0 : w === "tie" ? 1 : 2;
      tally[slot]++;
      [youS, tieS, cpuS][slot].set(tally[slot]);
      if (w === "tie") {
        grid.classList.add("tie");
        setStatus("tie game");
        return true;
      }
      const trio = winLine(board);
      for (const [i, c] of cells.entries())
        c.classList.add(trio.includes(i) ? "win" : "dim");
      const [a, , d] = trio.map((i) => cells[i]);
      const ax = a.offsetLeft + a.offsetWidth / 2;
      const ay = a.offsetTop + a.offsetHeight / 2;
      const dx = d.offsetLeft + d.offsetWidth / 2;
      const dy = d.offsetTop + d.offsetHeight / 2;
      const len = Math.hypot(dx - ax, dy - ay) + a.offsetWidth * 0.5;
      line.style.width = `${len}px`;
      line.style.left = `${(ax + dx) / 2}px`;
      line.style.top = `${(ay + dy) / 2}px`;
      line.style.rotate = `${Math.atan2(dy - ay, dx - ax)}rad`;
      line.className = `w-ttt-line show ${w.toLowerCase()}`;
      if (w === "X") setStatus("you win", "win");
      else setStatus("computer wins", "lose");
      return true;
    };
    const cpuTurn = () => {
      busy = true;
      setTurn("O");
      setStatus("computer is thinking…", "wait");
      const g = game;
      setTimeout(() => {
        if (g !== game) return;
        busy = false;
        const ai = aiMove();
        if (ai != null) place(ai, "O");
        if (finish()) return;
        setTurn("X");
        setStatus("your turn");
      }, 320);
    };
    const cells = Array.from({ length: 9 }, (_, i) => {
      const c = h("button", {
        class: "w-ttt-cell",
        type: "button",
        "aria-label": `row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}`,
      });
      c.onclick = () => {
        if (busy || board[i] || winner(board)) return;
        place(i, "X");
        if (!finish()) cpuTurn();
      };
      grid.append(c);
      return c;
    });
    grid.append(line);
    const reset = () => {
      game++;
      busy = false;
      board = Array(9).fill("");
      for (const [i, c] of cells.entries()) {
        c.className = "w-ttt-cell";
        c.replaceChildren();
        c.setAttribute(
          "aria-label",
          `row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}`,
        );
      }
      grid.classList.remove("tie", "over");
      line.className = "w-ttt-line";
      if (game % 2 === 0) return cpuTurn();
      setTurn("X");
      setStatus("your turn");
    };
    newBtn.onclick = reset;
    const levels = segmented(
      "difficulty",
      ["easy", "medium", "unbeatable"],
      level,
      (v) => {
        level = v;
        localStorage.setItem("w-ttt-level", v);
        reset();
      },
    );
    reset();
    return card(
      "tic-tac-toe",
      null,
      h(
        "div",
        { class: "w-game-col" },
        gameBar([youS, tieS, cpuS], newBtn),
        grid,
        status,
        levels,
      ),
    );
  },
});

reg({
  id: "rps",
  match: (q) => /^(?:rock\s+paper\s+scissors|rps)$/i.test(q.trim()),
  build: () => {
    const choices = [
      ["rock", "✊"],
      ["paper", "✋"],
      ["scissors", "✌️"],
    ];
    const rec = JSON.parse(localStorage.getItem("w-rps") || "[0,0,0]");
    const tally = rec.slice(0, 3).map((n) => +n || 0);
    const you = h("div", { class: "w-rps-hand you" }, "✊");
    const cpu = h("div", { class: "w-rps-hand cpu" }, "✊");
    const stage = h(
      "div",
      { class: "w-rps-stage", "aria-hidden": "true" },
      h("div", { class: "w-rps-side" }, you, h("span", null, "you")),
      h("span", { class: "w-rps-vs" }, "vs"),
      h("div", { class: "w-rps-side" }, cpu, h("span", null, "computer")),
    );
    const result = h(
      "div",
      { class: "w-rps-result", role: "status" },
      "pick your move",
    );
    const stats = ["wins", "losses", "ties"].map((label, i) =>
      gameStat(label, String(tally[i])),
    );
    stats[0].el.classList.add("good");
    stats[1].el.classList.add("bad");
    const resetBtn = h(
      "button",
      { class: "w-btn w-game-new", type: "button" },
      "reset",
    );
    const syncReset = () => {
      resetBtn.disabled = !tally.some(Boolean);
    };
    syncReset();
    resetBtn.onclick = () => {
      tally.fill(0);
      localStorage.removeItem("w-rps");
      for (const s of stats) s.set(0);
      syncReset();
    };
    let pending = null;
    const settle = () => {
      if (!pending) return;
      const { i, ai, r, timer } = pending;
      clearTimeout(timer);
      pending = null;
      stage.classList.remove("shaking");
      you.textContent = choices[i][1];
      cpu.textContent = choices[ai][1];
      for (const el of [you, cpu]) {
        el.classList.remove("reveal", "won");
        void el.offsetWidth;
        el.classList.add("reveal");
      }
      const slot = [2, 0, 1][r];
      tally[slot]++;
      localStorage.setItem("w-rps", JSON.stringify(tally));
      stats[slot].set(tally[slot]);
      syncReset();
      if (r === 1) you.classList.add("won");
      if (r === 2) cpu.classList.add("won");
      result.textContent =
        r === 0
          ? `both ${choices[i][0]}, it's a tie`
          : r === 1
            ? `${choices[i][0]} beats ${choices[ai][0]}, you win`
            : `${choices[ai][0]} beats ${choices[i][0]}, you lose`;
      result.className = `w-rps-result played${r === 1 ? " win" : r === 2 ? " lose" : ""}`;
    };
    const play = (i) => {
      settle();
      const ai = Math.floor(Math.random() * 3);
      const r = (3 + i - ai) % 3;
      you.textContent = "✊";
      cpu.textContent = "✊";
      you.classList.remove("reveal", "won");
      cpu.classList.remove("reveal", "won");
      stage.classList.remove("shaking");
      void stage.offsetWidth;
      stage.classList.add("shaking");
      result.textContent = "rock, paper, scissors…";
      result.className = "w-rps-result counting";
      pending = { i, ai, r, timer: setTimeout(settle, calmMotion() ? 0 : 540) };
    };
    const btns = h(
      "div",
      { class: "w-rps-picks" },
      ...choices.map(([n, e], i) =>
        h(
          "button",
          { class: "w-btn", type: "button", onclick: () => play(i) },
          h("span", { "aria-hidden": "true" }, e),
          n,
        ),
      ),
    );
    return card(
      "rock paper scissors",
      null,
      gameBar(stats, resetBtn),
      stage,
      result,
      btns,
    );
  },
});

reg({
  id: "typing",
  match: (q) =>
    /^(?:typing\s+(?:test|speed)|wpm\s+test|type\s+test)$/i.test(q.trim()),
  build: () => {
    const sentences = [
      "the quick brown fox jumps over the lazy dog",
      "pack my box with five dozen liquor jugs",
      "how vexingly quick daft zebras jump",
      "sphinx of black quartz judge my vow",
      "the five boxing wizards jump quickly",
      "jackdaws love my big sphinx of quartz",
      "quick zephyrs blow vexing daft jim",
      "two driven jocks help fax my big quiz",
    ];
    let target = "";
    let started = 0;
    let finished = 0;
    let typos = 0;
    let keys = 0;
    let prevLen = 0;
    let idle = null;
    let tick = null;
    let spans = [];
    const wpmS = gameStat("wpm");
    const accS = gameStat("accuracy", "100%");
    const timeS = gameStat("time", "0.0 s");
    const newBtn = h(
      "button",
      { class: "w-btn w-game-new", type: "button" },
      "new sentence",
    );
    const bar = gameBar([wpmS, accS, timeS], newBtn);
    const caret = h("span", { class: "w-typing-caret", "aria-hidden": "true" });
    const text = h("span", { class: "w-typing-text", "aria-hidden": "true" });
    const input = h("textarea", {
      class: "w-typing-input",
      rows: "1",
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
      autocorrect: "off",
      "aria-label": "type the sentence shown",
    });
    const prompt = h("label", { class: "w-typing-prompt" }, text, caret, input);
    const hint = h("div", { class: "w-game-status", role: "status" });
    const moveCaret = (instant) => {
      const at = Math.min(input.value.length, target.length);
      const ref = spans[Math.min(at, spans.length - 1)];
      if (!ref) return;
      const x =
        at >= spans.length ? ref.offsetLeft + ref.offsetWidth : ref.offsetLeft;
      if (instant) caret.style.transition = "none";
      caret.style.translate = `${x}px ${ref.offsetTop}px`;
      caret.style.height = `${ref.offsetHeight}px`;
      if (instant) {
        void caret.offsetWidth;
        caret.style.transition = "";
      }
      caret.classList.add("moving");
      clearTimeout(idle);
      idle = setTimeout(() => caret.classList.remove("moving"), 600);
    };
    const paint = () => {
      const v = input.value;
      for (const [i, s] of spans.entries()) {
        const t = v[i];
        s.className = t == null ? "" : t === target[i] ? "ok" : "bad";
      }
    };
    const stats = () => {
      const end = finished || performance.now();
      const secs = started ? (end - started) / 1000 : 0;
      const correct = [...input.value].filter((c, i) => c === target[i]).length;
      const wpm =
        secs > 1.5 || finished ? Math.round(correct / 5 / (secs / 60)) : 0;
      wpmS.set(wpm);
      accS.set(`${keys ? Math.round(((keys - typos) / keys) * 100) : 100}%`);
      timeS.set(`${secs.toFixed(1)} s`);
    };
    const setHint = (msg, tone = "") => {
      hint.textContent = msg;
      hint.className = `w-game-status${tone ? ` ${tone}` : ""}`;
    };
    input.oninput = () => {
      if (finished) {
        input.value = target;
        return;
      }
      if (!started) {
        started = performance.now();
        clearInterval(tick);
        tick = setInterval(() => {
          if (!input.isConnected || finished) return clearInterval(tick);
          stats();
        }, 100);
      }
      const v = input.value;
      if (v.length > prevLen) {
        keys += v.length - prevLen;
        if (v[v.length - 1] !== target[v.length - 1]) typos++;
      }
      prevLen = v.length;
      paint();
      moveCaret(false);
      if (v === target) {
        finished = performance.now();
        clearInterval(tick);
        prompt.classList.add("done");
        bar.classList.add("done");
        setHint("done. press enter for another sentence", "win");
      } else setHint("");
      stats();
    };
    const reset = () => {
      const pool = sentences.filter((s) => s !== target);
      target = pool[Math.floor(Math.random() * pool.length)];
      input.value = "";
      input.maxLength = target.length + 8;
      started = 0;
      finished = 0;
      typos = 0;
      keys = 0;
      prevLen = 0;
      clearInterval(tick);
      spans = [...target].map((ch) => h("span", null, ch));
      text.replaceChildren(...spans);
      prompt.classList.remove("done");
      bar.classList.remove("done");
      setHint("click the sentence and start typing");
      stats();
      requestAnimationFrame(() => moveCaret(true));
    };
    input.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (finished) reset();
    };
    input.onfocus = () => {
      prompt.classList.add("focus");
      if (!started) setHint("the timer starts on your first key");
    };
    input.onblur = () => {
      prompt.classList.remove("focus");
      if (!started) setHint("click the sentence and start typing");
    };
    newBtn.onclick = () => {
      reset();
      input.focus();
    };
    reset();
    return card("typing speed test", null, bar, prompt, hint);
  },
});

const devPanel = (label, body, getCopy, copyTitle) => {
  const name = h("span", { class: "w-dev-label" }, label);
  const meta = h("span", { class: "w-dev-meta" });
  const copy = getCopy ? copyBtn(getCopy, copyTitle) : null;
  const panel = h(
    "div",
    { class: "w-dev-panel" },
    h("div", { class: "w-dev-bar" }, name, meta, copy),
    body,
  );
  return { panel, name, meta, copy };
};

const devEditor = (label, rows, placeholder, value) =>
  h(
    "textarea",
    {
      class: "w-dev-edit",
      rows,
      placeholder,
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
      "aria-label": label,
    },
    value,
  );

const devRel = (ms) => {
  const s = ms / 1000;
  const [unit, size] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ].find(([, n]) => Math.abs(s) >= n) ?? ["second", 1];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round(s / size),
    unit,
  );
};

reg({
  id: "json",
  match: (q) =>
    /^json\s+(?:format(?:ter)?|pretty(?:\s*print)?|validat(?:e|or)|beautif(?:y|ier))$/i.test(
      q.trim(),
    ),
  build: () => {
    const input = devEditor("json input", "7", '{"hello": "world"}');
    const src = devPanel("input", input);
    const code = h("pre", { class: "w-dev-code w-json-code" });
    let text = "";
    let indent = 2;
    const out = devPanel("output", code, () => text);
    const locate = (s) => {
      let i = 0;
      const shown = () => (i >= s.length ? "end of input" : `"${s[i]}"`);
      const fail = (msg) => {
        throw { at: i, msg };
      };
      const ws = () => {
        while (" \t\n\r".includes(s[i] ?? "x")) i++;
      };
      const str = () => {
        i++;
        while (i < s.length && s[i] !== '"') {
          if (s[i] < " ")
            fail("line break or control character inside a string");
          if (s[i] === "\\") {
            i++;
            if (!'"\\/bfnrtu'.includes(s[i] ?? "x")) fail("invalid escape");
            if (s[i] === "u" && !/^[0-9a-f]{4}$/i.test(s.slice(i + 1, i + 5)))
              fail("invalid unicode escape");
          }
          i++;
        }
        if (i >= s.length) fail("unterminated string");
        i++;
      };
      const val = () => {
        ws();
        const c = s[i];
        if (c === "{" || c === "[") {
          const close = c === "{" ? "}" : "]";
          i++;
          ws();
          if (s[i] === close) return i++;
          for (;;) {
            ws();
            if (c === "{") {
              if (s[i] !== '"')
                fail(
                  s[i] === "'"
                    ? "keys need double quotes, not single quotes"
                    : `expected a key in double quotes, got ${shown()}`,
                );
              str();
              ws();
              if (s[i] !== ":")
                fail(`expected ":" after the key, got ${shown()}`);
              i++;
            }
            val();
            ws();
            if (s[i] === close) return i++;
            if (s[i] !== ",")
              fail(`expected "," or "${close}", got ${shown()}`);
            const comma = i++;
            ws();
            if (s[i] === close) {
              i = comma;
              fail("trailing comma");
            }
          }
        }
        if (c === '"') return str();
        if (c === "'") fail("strings need double quotes, not single quotes");
        for (const w of ["true", "false", "null"])
          if (s.startsWith(w, i)) {
            i += w.length;
            return;
          }
        const num = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
          s.slice(i, i + 400),
        );
        if (num) {
          i += num[0].length;
          return;
        }
        fail(`unexpected ${shown()}`);
      };
      try {
        val();
        ws();
        if (i < s.length)
          fail(`unexpected ${shown()} after the end of the json`);
      } catch (e) {
        return e;
      }
      return null;
    };
    const run = () => {
      const raw = input.value;
      out.panel.classList.remove("err");
      input.removeAttribute("aria-invalid");
      text = "";
      if (!raw.trim()) {
        out.meta.textContent = "";
        out.copy.disabled = true;
        code.replaceChildren(
          h("span", { class: "w-dev-empty" }, "paste json above to format it"),
        );
        return;
      }
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        const { at, msg } = locate(raw) ?? { at: 0, msg: "not valid json" };
        const before = raw.slice(0, at).split("\n");
        const line = raw.split("\n")[before.length - 1].replace(/\t/g, "  ");
        const col = before.at(-1).replace(/\t/g, "  ").length;
        const from = Math.max(0, col - 36);
        const lead = from ? "…" : "";
        const gutter = `${before.length} │ `;
        out.panel.classList.add("err");
        input.setAttribute("aria-invalid", "true");
        out.copy.disabled = true;
        out.meta.textContent = `line ${before.length}, column ${col + 1}`;
        code.replaceChildren(
          h("div", { class: "w-dev-errmsg" }, msg),
          h(
            "div",
            { class: "w-dev-errsrc" },
            `${gutter}${lead}${line.slice(from, col + 36)}\n${" ".repeat(gutter.length + lead.length + col - from)}`,
            h("span", { class: "w-dev-caret" }, "^"),
          ),
        );
        return;
      }
      text = JSON.stringify(value, null, indent);
      const lines = text.split("\n").length;
      const bytes = new TextEncoder().encode(text).length;
      out.meta.textContent = `valid, ${lines} line${lines === 1 ? "" : "s"}, ${bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`}`;
      out.copy.disabled = false;
      highlightInto(code, text);
    };
    const style = segmented(
      "indentation",
      ["2 spaces", "4 spaces", "tabs", "minified"],
      "2 spaces",
      (v) => {
        indent = { "2 spaces": 2, "4 spaces": 4, tabs: "\t" }[v];
        run();
      },
    );
    input.oninput = run;
    run();
    return card(
      "json formatter",
      "validated and formatted in your browser",
      src.panel,
      style,
      out.panel,
    );
  },
});

reg({
  id: "jwt",
  match: (q) => {
    const m = q.match(
      /^jwt(?:\s+decoder?)?$|^(?:jwt\s+decode|decode\s+jwt)\s+(.+)$|^jwt\s+(ey[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+)$/i,
    );
    if (!m) return null;
    return { token: (m[1] || m[2] || "").trim() };
  },
  build: ({ token }) => {
    const input = devEditor(
      "token",
      "4",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
      token,
    );
    input.classList.add("w-jwt-token");
    const src = devPanel("token", input);
    const note = h("div", { class: "w-dev-status", role: "status" });
    const out = h("div", { class: "w-jwt-out" });
    const TIMES = [
      ["iat", "issued"],
      ["nbf", "valid from"],
      ["exp", "expires"],
    ];
    const decode = (seg) =>
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(
            atob(seg.replace(/-/g, "+").replace(/_/g, "/")),
            (c) => c.charCodeAt(0),
          ),
        ),
      );
    const section = (label, seg) => {
      const code = h("pre", { class: "w-dev-code" });
      let text = "";
      const p = devPanel(label, code, () => text, `copy ${label}`);
      try {
        const json = decode(seg);
        text = JSON.stringify(json, null, 2);
        highlightInto(code, text);
        return { ...p, json };
      } catch {
        p.panel.classList.add("err");
        p.copy.disabled = true;
        p.meta.textContent = "can't decode";
        code.replaceChildren(
          h(
            "div",
            { class: "w-dev-errmsg" },
            `this part isn't valid base64url json`,
          ),
        );
        return { ...p, json: null };
      }
    };
    const say = (text, bad) => {
      note.textContent = text;
      note.classList.toggle("err", !!bad);
    };
    const run = () => {
      out.replaceChildren();
      const raw = input.value.trim().replace(/^bearer\s+/i, "");
      input.removeAttribute("aria-invalid");
      if (!raw) return say("paste a token to read its header and payload");
      const parts = raw.split(".");
      if (parts.length !== 3 && parts.length !== 5) {
        input.setAttribute("aria-invalid", "true");
        return say(
          `a jwt has 3 parts separated by dots, this has ${parts.length}`,
          true,
        );
      }
      const head = section("header", parts[0]);
      out.append(head.panel);
      if (head.json?.alg) head.meta.textContent = head.json.alg;
      if (parts.length === 5)
        return say(
          "this is an encrypted token (jwe). only the header is readable without the key",
        );
      const body = section("payload", parts[1]);
      out.append(body.panel);
      say(
        head.json && body.json
          ? "the signature isn't checked, so don't trust these claims"
          : "",
      );
      const claims = body.json ?? {};
      const now = Date.now();
      const rows = TIMES.filter(([k]) => typeof claims[k] === "number").map(
        ([k, label]) => {
          const at = claims[k] * 1000;
          return h(
            "div",
            { class: "w-dev-row" },
            h("span", { class: "w-dev-key" }, label),
            h(
              "span",
              { class: "w-dev-val" },
              new Date(at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            ),
            h("span", { class: "w-dev-aux" }, devRel(at - now)),
          );
        },
      );
      if (rows.length)
        body.panel.append(h("div", { class: "w-dev-rows" }, ...rows));
      if (typeof claims.exp !== "number") return;
      const expired = claims.exp * 1000 < now;
      body.meta.textContent = expired ? "expired" : "not expired";
      body.meta.classList.toggle("bad", expired);
    };
    input.oninput = run;
    run();
    return card(
      "jwt decoder",
      "decoded in your browser, not sent anywhere",
      src.panel,
      note,
      out,
    );
  },
});

reg({
  id: "hash",
  match: (q) => {
    const m = q.match(
      /^(sha-?1|sha-?256|sha-?384|sha-?512)\s+(?:hash\s+of\s+|hash\s+|of\s+)(.+)$|^(sha-?1|sha-?256|sha-?384|sha-?512)\s*[:=]\s*(.+)$|^hash\s+of\s+(.+)$|^hash\s*[:=]\s*(.+)$|^(?:generate\s+)?hash\s+generator$|^(md5)\s+(?:hash\s+(?:of\s+)?|of\s+)?(.+)$/i,
    );
    if (!m) return null;
    const algoRaw = (m[1] || m[3] || m[7] || "sha-256")
      .toUpperCase()
      .replace(/SHA-?/, "SHA-");
    return {
      algo: algoRaw,
      text: (m[2] || m[4] || m[5] || m[6] || m[8] || "").trim(),
    };
  },
  build: ({ algo, text }) => {
    const ALGOS = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];
    let current = ALGOS.includes(algo) ? algo : "SHA-256";
    const md5 = (bytes) => {
      const K = Array.from(
        { length: 64 },
        (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0,
      );
      const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
      const len = bytes.length;
      const words = (((len + 8) >> 6) + 1) * 16;
      const w = new Int32Array(words);
      for (let i = 0; i < len; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
      w[len >> 2] |= 0x80 << ((len % 4) * 8);
      w[words - 2] = (len * 8) | 0;
      w[words - 1] = Math.floor(len / 0x20000000);
      const st = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476];
      for (let blk = 0; blk < words; blk += 16) {
        let [a, b, c, d] = st;
        for (let i = 0; i < 64; i++) {
          const r = i >> 4;
          const f = [
            (b & c) | (~b & d),
            (d & b) | (~d & c),
            b ^ c ^ d,
            c ^ (b | ~d),
          ][r];
          const g = [i, 5 * i + 1, 3 * i + 5, 7 * i][r] % 16;
          const s = S[r * 4 + (i % 4)];
          const t = (a + f + K[i] + w[blk + g]) | 0;
          a = d;
          d = c;
          c = b;
          b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
        }
        st[0] = (st[0] + a) | 0;
        st[1] = (st[1] + b) | 0;
        st[2] = (st[2] + c) | 0;
        st[3] = (st[3] + d) | 0;
      }
      return st
        .flatMap((v) =>
          [0, 8, 16, 24].map((sh) =>
            ((v >>> sh) & 255).toString(16).padStart(2, "0"),
          ),
        )
        .join("");
    };
    const input = devEditor("text to hash", "3", "text to hash", text);
    input.classList.add("w-hash-src");
    const src = devPanel("text", input);
    const code = h("div", { class: "w-dev-code w-hash-digest" });
    let digest = "";
    const out = devPanel(current, code, () => digest);
    let seq = 0;
    const run = async () => {
      const id = ++seq;
      out.name.textContent = current;
      out.panel.classList.remove("err");
      if (!input.value) {
        digest = "";
        out.meta.textContent = "";
        out.copy.disabled = true;
        code.replaceChildren(
          h("span", { class: "w-dev-empty" }, "type something to hash it"),
        );
        return;
      }
      const bytes = new TextEncoder().encode(input.value);
      try {
        const hex =
          current === "MD5"
            ? md5(bytes)
            : [...new Uint8Array(await crypto.subtle.digest(current, bytes))]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
        if (id !== seq) return;
        digest = hex;
        out.meta.textContent = `${hex.length * 4} bits`;
        out.copy.disabled = false;
        code.textContent = hex;
      } catch {
        if (id !== seq) return;
        digest = "";
        out.panel.classList.add("err");
        out.copy.disabled = true;
        out.meta.textContent = "";
        code.replaceChildren(
          h(
            "div",
            { class: "w-dev-errmsg" },
            "your browser blocked hashing on this page",
          ),
        );
      }
    };
    const pick = segmented("algorithm", ALGOS, current, (a) => {
      current = a;
      run();
    });
    input.oninput = run;
    run();
    return card(
      "hash generator",
      "hashed in your browser, not sent anywhere",
      pick,
      src.panel,
      out.panel,
    );
  },
});

reg({
  id: "useragent",
  match: (q) =>
    /^(?:my\s+)?(?:user\s*agent|browser\s+info|what(?:'s| is)\s+my\s+browser)$/i.test(
      q.trim(),
    ),
  build: () => {
    const ua = navigator.userAgent;
    const [name, version] =
      [
        ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
        ["Opera", /OPR\/(\d+)/],
        ["Samsung Internet", /SamsungBrowser\/(\d+)/],
        ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
        ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
        ["Safari", /Version\/(\d+(?:\.\d+)?).*Safari/],
      ]
        .map(([n, re]) => [n, ua.match(re)?.[1]])
        .find(([, v]) => v) ?? [];
    const os =
      [
        ["iPadOS", /iPad/],
        ["iOS", /iPhone|iPod/],
        ["Android", /Android/],
        ["ChromeOS", /CrOS/],
        ["Windows", /Windows/],
        ["macOS", /Mac OS X|Macintosh/],
        ["Linux", /Linux/],
      ].find(([, re]) => re.test(ua))?.[0] ?? "an unknown system";
    const touch = navigator.maxTouchPoints;
    return card(
      "browser info",
      null,
      h(
        "div",
        { class: "w-focal" },
        h(
          "div",
          { class: "w-big" },
          name ? `${name} ${version}` : "unknown browser",
        ),
        h("div", { class: "w-focal-cap" }, `on ${os}`),
      ),
      h(
        "div",
        { class: "w-ua-agent" },
        h("div", { class: "w-ua-value w-mono" }, ua),
        copyBtn(() => ua, "copy user agent"),
      ),
      kvList([
        ["language", navigator.languages?.join(", ") || navigator.language],
        ["cpu cores", navigator.hardwareConcurrency || "not reported"],
        [
          "memory",
          navigator.deviceMemory
            ? `${navigator.deviceMemory} GB${navigator.deviceMemory >= 8 ? " or more" : ""}`
            : "not reported",
        ],
        ["touch", touch ? `yes, ${touch} points` : "no"],
        ["cookies", navigator.cookieEnabled ? "enabled" : "blocked"],
      ]),
    );
  },
});

reg({
  id: "screen",
  match: (q) =>
    /^(?:my\s+)?(?:screen\s+(?:resolution|size)|viewport(?:\s+size)?|window\s+size|display\s+info)$/i.test(
      q.trim(),
    ),
  build: () => {
    const hero = h("div", { class: "w-big" });
    const list = h("div", { class: "w-screen-list" });
    const out = h(
      "div",
      { class: "w-screen" },
      h(
        "div",
        { class: "w-focal" },
        hero,
        h("div", { class: "w-focal-cap" }, "viewport in css pixels"),
      ),
      list,
    );
    const run = () => {
      const dpr = window.devicePixelRatio;
      hero.textContent = `${window.innerWidth} × ${window.innerHeight}`;
      list.replaceChildren(
        kvList([
          ["screen", `${screen.width} × ${screen.height}`],
          [
            "device pixels",
            `${Math.round(screen.width * dpr)} × ${Math.round(screen.height * dpr)}`,
          ],
          ["pixel ratio", `${+dpr.toFixed(2)}x`],
          ["color depth", `${screen.colorDepth}-bit`],
          [
            "orientation",
            screen.orientation?.type.split("-")[0] ??
              (screen.width >= screen.height ? "landscape" : "portrait"),
          ],
        ]),
      );
    };
    run();
    const onResize = () => {
      if (!out.isConnected)
        return window.removeEventListener("resize", onResize);
      run();
    };
    window.addEventListener("resize", onResize);
    return card("display info", "updates as you resize the window", out);
  },
});

reg({
  id: "regex",
  match: (q) => /^regex\s+(?:tester|test|tool)$|^test\s+regex$/i.test(q.trim()),
  build: () => {
    const FLAGS = [
      ["g", "global"],
      ["i", "ignore case"],
      ["m", "multiline"],
      ["s", "dot all"],
      ["u", "unicode"],
    ];
    const on = new Set(["g"]);
    const pat = h("input", {
      class: "w-rx-pat",
      value: "(?<year>\\d{4})-(\\d{2})",
      placeholder: "pattern",
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
      "aria-label": "pattern",
    });
    const flagText = h("span", {
      class: "w-rx-flagtext",
      "aria-hidden": "true",
    });
    const field = h(
      "label",
      { class: "w-rx-field" },
      h("span", { class: "w-rx-slash", "aria-hidden": "true" }, "/"),
      pat,
      h("span", { class: "w-rx-slash", "aria-hidden": "true" }, "/"),
      flagText,
    );
    const flags = h(
      "div",
      { class: "w-dev-chips", role: "group", "aria-label": "flags" },
      ...FLAGS.map(([f, name]) =>
        h(
          "button",
          {
            type: "button",
            class: "w-dev-chip",
            "aria-pressed": String(on.has(f)),
            title: `${name} (${f})`,
            onclick: (e) => {
              if (on.has(f)) on.delete(f);
              else on.add(f);
              e.currentTarget.setAttribute("aria-pressed", String(on.has(f)));
              run();
            },
          },
          name,
        ),
      ),
    );
    const test = devEditor(
      "test string",
      "4",
      "text to test the pattern against",
      "shipped 2024-03, patched 2024-11, first draft 1999-12",
    );
    const src = devPanel("test string", test);
    const view = h("div", { class: "w-dev-code w-rx-view" });
    const out = devPanel("matches", view);
    const run = () => {
      const str = test.value.slice(0, 20000);
      flagText.textContent = [...on].join("");
      out.panel.classList.remove("err");
      field.classList.remove("err");
      pat.removeAttribute("aria-invalid");
      out.meta.textContent = "";
      out.panel.querySelector(".w-dev-rows")?.remove();
      if (!pat.value)
        return view.replaceChildren(
          h("span", { class: "w-dev-empty" }, "type a pattern to see matches"),
        );
      let re;
      try {
        re = new RegExp(pat.value, [...on].join(""));
      } catch (e) {
        const msg = e.message.replace(/^.*?: \/.*\/[a-z]*: /s, "");
        out.panel.classList.add("err");
        field.classList.add("err");
        pat.setAttribute("aria-invalid", "true");
        out.meta.textContent = "invalid pattern";
        return view.replaceChildren(
          h(
            "div",
            { class: "w-dev-errmsg" },
            `${msg.charAt(0).toLowerCase()}${msg.slice(1)}`,
          ),
        );
      }
      if (!str)
        return view.replaceChildren(
          h(
            "span",
            { class: "w-dev-empty" },
            "add a test string to match against",
          ),
        );
      const found = [];
      if (on.has("g")) {
        for (const m of str.matchAll(re)) {
          found.push(m);
          if (found.length >= 1000) break;
        }
      } else {
        const m = re.exec(str);
        if (m) found.push(m);
      }
      out.meta.textContent = `${found.length === 1000 ? "1000+" : found.length} match${found.length === 1 ? "" : "es"}`;
      const names = [];
      for (const g of pat.value.matchAll(
        /\\.|\[(?:\\.|[^\]\\])*\]|\((\?<([A-Za-z_$][\w$]*)>|\?)?/g,
      )) {
        if (!g[0].startsWith("(")) continue;
        if (g[2]) names.push(g[2]);
        else if (!g[1]) names.push(null);
      }
      const marked = h("div", { class: "w-rx-text" });
      let last = 0;
      found.forEach((m, i) => {
        marked.append(str.slice(last, m.index));
        marked.append(
          h(
            "mark",
            { class: m[0] ? `w-rx-hit${i % 2 ? " alt" : ""}` : "w-rx-zero" },
            m[0],
          ),
        );
        last = m.index + m[0].length;
      });
      marked.append(str.slice(last));
      const LIST = 24;
      const listed = found.filter((m) => m[0] || m.length > 1);
      const rows = listed
        .slice(0, LIST)
        .flatMap((m, i) => [
          h(
            "div",
            { class: "w-dev-row w-rx-match" },
            h("span", { class: "w-dev-key" }, `match ${i + 1}`),
            h("span", { class: "w-dev-val" }, m[0] || "empty"),
            h("span", { class: "w-dev-aux" }, `at ${m.index}`),
          ),
          ...m
            .slice(1)
            .map((g, j) =>
              h(
                "div",
                { class: "w-dev-row w-rx-group" },
                h("span", { class: "w-dev-key" }, names[j] ?? `group ${j + 1}`),
                h(
                  "span",
                  { class: `w-dev-val${g === undefined ? " none" : ""}` },
                  g === undefined ? "no match" : g || "empty",
                ),
                h("span", { class: "w-dev-aux" }),
              ),
            ),
        ]);
      const more = listed.length - LIST;
      view.replaceChildren(marked);
      if (rows.length)
        out.panel.append(
          h(
            "div",
            { class: "w-dev-rows" },
            ...rows,
            more > 0 &&
              h("div", { class: "w-dev-more" }, `and ${more} more matches`),
          ),
        );
    };
    pat.oninput = test.oninput = run;
    run();
    return card(
      "regex tester",
      "javascript flavor, runs as you type",
      field,
      flags,
      src.panel,
      out.panel,
    );
  },
});

reg({
  id: "markdown",
  match: (q) =>
    /^markdown\s+(?:preview(?:er)?|editor|test)$|^md\s+preview$/i.test(
      q.trim(),
    ),
  build: () => {
    const input = devEditor(
      "markdown",
      "14",
      "# a heading\n\nsome **bold** text",
      '# Release notes\n\nThe search page now loads **twice as fast** on phones, and `?q=` links open in a new tab. Read the [full changelog](https://search.tiago.zip).\n\n- faster first paint\n- smaller bundle\n- [x] ship it\n\n> Measured on a Pixel 7 over 4G.\n\n```js\nconst q = new URL(location).searchParams.get("q");\n```',
    );
    const src = devPanel("markdown", input);
    const view = h("div", { class: "w-md-out" });
    const out = devPanel("preview", view, () => view.innerHTML, "copy html");
    const esc = (s) =>
      s.replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
      );
    const inline = (s) => {
      const codes = [];
      return esc(s)
        .replace(/`([^`]+)`/g, (_, c) => `\uE000${codes.push(c) - 1}\uE001`)
        .replace(
          /!?\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
          (_, label, url) =>
            `<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>`,
        )
        .replace(/\*\*(.+?)\*\*|__(.+?)__/g, "<strong>$1$2</strong>")
        .replace(/\*([^*\s](?:[^*]*[^*\s])?)\*/g, "<em>$1</em>")
        .replace(/(^|[^\w])_([^_\s](?:[^_]*[^_\s])?)_(?!\w)/g, "$1<em>$2</em>")
        .replace(/~~(.+?)~~/g, "<del>$1</del>")
        .replace(/ {2,}\n/g, "<br>")
        .replace(/\uE000(\d+)\uE001/g, (_, n) => `<code>${codes[n]}</code>`);
    };
    const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
    const LI = /^\s*([-*+]|\d+[.)])\s+/;
    const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
    const starts = (l) =>
      /^\s{0,3}(#{1,6}\s|```|~~~|>)/.test(l) || HR.test(l) || LI.test(l);
    const cells = (l) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => inline(c.trim()));
    const render = (text) => {
      const lines = text.replace(/\r\n?/g, "\n").split("\n");
      const html = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
          i++;
          continue;
        }
        const fence = line.match(/^\s{0,3}(```|~~~)/);
        if (fence) {
          const body = [];
          i++;
          while (i < lines.length && !lines[i].trim().startsWith(fence[1]))
            body.push(lines[i++]);
          i++;
          html.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
          continue;
        }
        const head = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
        if (head) {
          const n = head[1].length;
          html.push(`<h${n}>${inline(head[2])}</h${n}>`);
          i++;
          continue;
        }
        if (HR.test(line)) {
          html.push("<hr>");
          i++;
          continue;
        }
        if (/^\s{0,3}>/.test(line)) {
          const body = [];
          while (i < lines.length && /^\s{0,3}>/.test(lines[i]))
            body.push(lines[i++].replace(/^\s{0,3}>\s?/, ""));
          html.push(`<blockquote>${render(body.join("\n"))}</blockquote>`);
          continue;
        }
        if (LI.test(line)) {
          const ordered = /^\s*\d/.test(line);
          const first = Number.parseInt(line, 10);
          const items = [];
          while (
            i < lines.length &&
            LI.test(lines[i]) &&
            /^\s*\d/.test(lines[i]) === ordered
          ) {
            let item = lines[i++].replace(LI, "");
            while (
              i < lines.length &&
              /^\s+\S/.test(lines[i]) &&
              !LI.test(lines[i])
            )
              item += `\n${lines[i++].trim()}`;
            items.push(item);
          }
          const lis = items
            .map((t) => {
              const task = t.match(/^\[([ xX])\]\s+([\s\S]*)/);
              return task
                ? `<li class="task"><input type="checkbox" disabled${task[1] === " " ? "" : " checked"}><span>${inline(task[2])}</span></li>`
                : `<li>${inline(t)}</li>`;
            })
            .join("");
          html.push(
            ordered
              ? `<ol${first > 1 ? ` start="${first}"` : ""}>${lis}</ol>`
              : `<ul>${lis}</ul>`,
          );
          continue;
        }
        if (line.includes("|") && TABLE_RULE.test(lines[i + 1] ?? "")) {
          const headCells = cells(line);
          i += 2;
          const body = [];
          while (i < lines.length && lines[i].includes("|") && lines[i].trim())
            body.push(cells(lines[i++]));
          html.push(
            `<div class="w-md-table"><table><thead><tr>${headCells.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${headCells.map((_, j) => `<td>${r[j] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
          );
          continue;
        }
        const para = [line];
        i++;
        while (i < lines.length && lines[i].trim() && !starts(lines[i]))
          para.push(lines[i++]);
        html.push(`<p>${inline(para.join("\n"))}</p>`);
      }
      return html.join("");
    };
    const run = () => {
      const words = input.value.match(/[\p{L}\p{N}'’-]+/gu)?.length ?? 0;
      src.meta.textContent = `${words} word${words === 1 ? "" : "s"}`;
      view.innerHTML = render(input.value);
      out.copy.disabled = !input.value.trim();
      if (!input.value.trim())
        view.replaceChildren(
          h("span", { class: "w-dev-empty" }, "write markdown to preview it"),
        );
    };
    input.oninput = run;
    run();
    return card(
      "markdown preview",
      null,
      h("div", { class: "w-md-split" }, src.panel, out.panel),
    );
  },
});

reg({
  id: "ascii",
  match: (q) => /^(?:ascii(?:\s+table)?|ascii\s+chart)$/i.test(q.trim()),
  build: () => {
    const grid = h("div", { class: "w-ascii" });
    for (let i = 32; i < 127; i++) {
      const c = String.fromCharCode(i);
      const hex = i.toString(16).toUpperCase();
      const b = h(
        "button",
        {
          class: "w-ascii-cell",
          type: "button",
          title: `copy ${i === 32 ? "space" : c}`,
          "aria-label": `copy ${i === 32 ? "space" : c}, decimal ${i}, hex ${hex}`,
        },
        h(
          "span",
          { class: `w-ascii-char${i === 32 ? " sp" : ""}` },
          i === 32 ? "space" : c,
        ),
        h(
          "span",
          { class: "w-ascii-codes" },
          h("span", null, i),
          h("span", { class: "w-ascii-hex" }, hex),
        ),
      );
      let t;
      b.onclick = () => {
        navigator.clipboard?.writeText(c).catch(() => {});
        clearTimeout(t);
        b.classList.add("copied");
        t = setTimeout(() => b.classList.remove("copied"), 900);
      };
      grid.append(b);
    }
    return card(
      "ascii table",
      "decimal on the left, hex on the right. click to copy",
      grid,
    );
  },
});

reg({
  id: "charinfo",
  match: (q) => {
    const m = q.match(
      /^(?:char(?:acter)?|unicode|codepoint)\s+(?:info\s+)?(.)$/iu,
    );
    return m ? { ch: m[1] } : null;
  },
  build: ({ ch }) => {
    const cp = ch.codePointAt(0);
    const hex = cp.toString(16).toUpperCase();
    const point = `U+${hex.padStart(4, "0")}`;
    const kind =
      [
        [/\p{Lu}/u, "uppercase letter"],
        [/\p{Ll}/u, "lowercase letter"],
        [/\p{L}/u, "letter"],
        [/\p{N}/u, "number"],
        [/\p{P}/u, "punctuation"],
        [/\p{Sc}/u, "currency symbol"],
        [/\p{Sm}/u, "math symbol"],
        [/\p{S}/u, "symbol"],
        [/\p{Z}/u, "space"],
        [/\p{M}/u, "combining mark"],
      ].find(([re]) => re.test(ch))?.[1] ?? "control or other";
    return card(
      "character info",
      null,
      h(
        "div",
        { class: "w-char" },
        h("div", { class: "w-char-glyph", "aria-hidden": "true" }, ch),
        h(
          "div",
          { class: "w-char-meta" },
          h("div", { class: "w-char-point w-mono" }, point),
          h("div", { class: "w-focal-cap" }, kind),
        ),
        copyBtn(() => ch, "copy character"),
      ),
      kvList(
        [
          ["decimal", cp],
          ["html", `&#x${hex};`],
          ["css", `\\${hex}`],
          [
            "javascript",
            cp > 0xffff ? `\\u{${hex}}` : `\\u${hex.padStart(4, "0")}`,
          ],
          [
            "utf-8",
            [...new TextEncoder().encode(ch)]
              .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
              .join(" "),
          ],
        ].map(([l, v]) => [l, v, { mono: true, copy: true }]),
      ),
    );
  },
});

const EMOJI = [
  ["😀", "grin happy smile face"],
  ["😃", "happy smile face joy"],
  ["😄", "happy laugh smile"],
  ["😁", "grin beam smile"],
  ["😂", "laugh tears joy lol cry"],
  ["🤣", "rofl laugh rolling"],
  ["🙂", "slight smile"],
  ["😉", "wink"],
  ["😊", "blush smile happy"],
  ["😇", "angel halo innocent"],
  ["🥰", "love hearts adore"],
  ["😍", "heart eyes love"],
  ["😘", "kiss blow love"],
  ["😗", "kiss"],
  ["😜", "tongue wink silly"],
  ["🤪", "zany crazy silly"],
  ["😎", "cool sunglasses"],
  ["🤩", "star struck excited"],
  ["🥳", "party celebrate hat"],
  ["😏", "smirk"],
  ["😒", "unamused meh"],
  ["😞", "sad disappointed"],
  ["😔", "pensive sad"],
  ["😟", "worried"],
  ["😢", "cry sad tear"],
  ["😭", "sob cry bawling"],
  ["😤", "huff steam angry"],
  ["😠", "angry mad"],
  ["😡", "rage angry red"],
  ["🤬", "swear curse angry"],
  ["🤔", "thinking hmm"],
  ["🤗", "hug"],
  ["🤫", "shush quiet"],
  ["🙄", "eye roll"],
  ["😴", "sleep zzz"],
  ["🤤", "drool"],
  ["😷", "mask sick"],
  ["🤒", "sick fever"],
  ["🤮", "vomit sick"],
  ["🥵", "hot heat"],
  ["🥶", "cold freezing"],
  ["😵", "dizzy"],
  ["🤯", "mind blown explode"],
  ["🤠", "cowboy"],
  ["😈", "devil smiling imp"],
  ["👻", "ghost boo"],
  ["💀", "skull dead"],
  ["👽", "alien"],
  ["🤖", "robot bot"],
  ["💩", "poop"],
  ["👍", "thumbs up like yes good"],
  ["👎", "thumbs down no bad"],
  ["👌", "ok perfect"],
  ["✌️", "peace victory"],
  ["🤞", "fingers crossed luck"],
  ["🤟", "love you rock"],
  ["🤘", "rock horns"],
  ["👏", "clap applause"],
  ["🙌", "raise hands praise"],
  ["🙏", "pray thanks please"],
  ["💪", "muscle strong flex"],
  ["👀", "eyes look"],
  ["🧠", "brain"],
  ["❤️", "red heart love"],
  ["🧡", "orange heart"],
  ["💛", "yellow heart"],
  ["💚", "green heart"],
  ["💙", "blue heart"],
  ["💜", "purple heart"],
  ["🖤", "black heart"],
  ["💔", "broken heart"],
  ["💕", "two hearts love"],
  ["💖", "sparkle heart"],
  ["🔥", "fire lit hot"],
  ["✨", "sparkles shiny"],
  ["⭐", "star"],
  ["🌟", "glowing star"],
  ["💫", "dizzy star"],
  ["⚡", "lightning bolt"],
  ["💥", "boom collision"],
  ["💧", "droplet water"],
  ["🌈", "rainbow"],
  ["☀️", "sun sunny"],
  ["🌙", "moon night"],
  ["☁️", "cloud"],
  ["❄️", "snowflake cold"],
  ["🎉", "party tada celebrate"],
  ["🎊", "confetti party"],
  ["🎁", "gift present"],
  ["🎈", "balloon"],
  ["🏆", "trophy win"],
  ["🥇", "gold medal first"],
  ["🎯", "target bullseye"],
  ["💯", "hundred perfect"],
  ["✅", "check tick done"],
  ["❌", "cross x wrong"],
  ["❓", "question"],
  ["❗", "exclamation"],
  ["⚠️", "warning caution"],
  ["🚀", "rocket launch fast"],
  ["✈️", "plane flight"],
  ["🚗", "car"],
  ["🏠", "house home"],
  ["💻", "laptop computer"],
  ["📱", "phone mobile"],
  ["💡", "idea bulb light"],
  ["🔑", "key"],
  ["🔒", "lock secure"],
  ["📌", "pin"],
  ["📎", "paperclip"],
  ["✏️", "pencil write"],
  ["📚", "books"],
  ["💰", "money bag"],
  ["💸", "money flying"],
  ["🎵", "music note"],
  ["🎶", "music notes"],
  ["☕", "coffee"],
  ["🍕", "pizza"],
  ["🍔", "burger"],
  ["🍺", "beer"],
  ["🎂", "cake birthday"],
  ["🍎", "apple"],
  ["🐶", "dog puppy"],
  ["🐱", "cat"],
  ["🦊", "fox"],
  ["🐼", "panda"],
  ["🦄", "unicorn"],
  ["🐢", "turtle"],
  ["🌸", "blossom flower"],
  ["🌹", "rose flower"],
  ["🌵", "cactus"],
  ["🍀", "clover luck"],
];

reg({
  id: "emoji",
  match: (q) => {
    let m = q.match(/^emoji(?:\s+search)?$/i);
    if (m) return { term: "" };
    const hasMatch = (t) => EMOJI.some(([c, k]) => k.includes(t) || c === t);
    m = q.match(/^emoji\s+(?:for\s+)?(.+)$/i);
    if (m) {
      const t = m[1].trim().toLowerCase();
      return hasMatch(t) ? { term: m[1].trim() } : null;
    }
    m = q.match(/^:([a-z0-9_+-]{2,}):$/i);
    if (m) {
      const t = m[1].replace(/[_+-]/g, " ");
      return hasMatch(t) ? { term: t } : null;
    }
    return null;
  },
  build: ({ term }) => {
    const input = h("input", {
      class: "w-input",
      placeholder: "search emoji…",
      "aria-label": "search emoji",
      value: term,
    });
    const grid = h("div", { class: "w-emoji-grid" });
    const run = () => {
      const t = input.value.trim().toLowerCase();
      const list = t
        ? EMOJI.filter(([c, k]) => k.includes(t) || c === t)
        : EMOJI;
      grid.replaceChildren();
      if (!list.length) {
        const reset = h(
          "button",
          { class: "w-btn", type: "button" },
          "clear search",
        );
        reset.onclick = () => {
          input.value = "";
          input.focus();
          run();
        };
        return grid.append(
          h(
            "div",
            { class: "w-emoji-empty" },
            h("span", null, "no emoji here match that search"),
            reset,
          ),
        );
      }
      for (const [c, k] of list) {
        const b = h(
          "button",
          {
            class: "w-emoji",
            type: "button",
            title: k,
            "aria-label": `copy ${k}`,
          },
          c,
        );
        let t;
        b.onclick = () => {
          navigator.clipboard?.writeText(c);
          clearTimeout(t);
          b.classList.remove("copied");
          b.offsetWidth;
          b.classList.add("copied");
          t = setTimeout(() => b.classList.remove("copied"), 900);
        };
        grid.append(b);
      }
    };
    input.oninput = run;
    run();
    return card("emoji search", "click to copy", input, grid);
  },
});

reg({
  id: "kaomoji",
  match: (q) =>
    /^(?:kaomoji|japanese\s+emoticons|text\s+faces?|ascii\s+faces?)$/i.test(
      q.trim(),
    ),
  build: () => {
    const list = [
      "(◕‿◕)",
      "(╯°□°)╯︵ ┻━┻",
      "┬/┬ノ( º _ ºノ)",
      "¯\\_(ツ)_/¯",
      "(づ｡◕‿‿◕｡)づ",
      "(◡ ‿ ◡)",
      "ʕ•ᴥ•ʔ",
      "(╥﹏╥)",
      "(づ￣ ³￣)づ",
      "(ノ◕ヮ◕)ノ*:･ﾟ✧",
      "( ͡° ͜ʖ ͡°)",
      "(•_•)",
      "（；¬＿¬)",
      "(˘▾˘)~",
      "(✿◠‿◠)",
      "ヽ(´▽`)/",
      "(=^･ω･^=)",
      "(｡•́︿•̀｡)",
      "(♡°▽°♡)",
      "ƪ(˘⌣˘)ʃ",
    ];
    const grid = h("div", { class: "w-kaomoji-grid" });
    for (const k of list) {
      const b = h(
        "button",
        {
          class: `w-kaomoji${[...k].length > 11 ? " wide" : ""}`,
          type: "button",
          title: "copy",
          "aria-label": `copy ${k}`,
        },
        k,
      );
      let t;
      b.onclick = () => {
        navigator.clipboard?.writeText(k);
        clearTimeout(t);
        b.classList.remove("copied");
        b.offsetWidth;
        b.classList.add("copied");
        t = setTimeout(() => b.classList.remove("copied"), 900);
      };
      grid.append(b);
    }
    return card("kaomoji", "click to copy", grid);
  },
});

reg({
  id: "cron",
  match: (q) => {
    const m = q.match(/^cron\s+(.+)$/i);
    if (m && /[\d*]/.test(m[1])) return { expr: m[1].trim() };
    if (
      /^cron(?:\s+(?:expression|parser|explainer|generator))?$/i.test(q.trim())
    )
      return { expr: "*/5 * * * *" };
    return null;
  },
  build: ({ expr }) => {
    const FIELDS = [
      ["minute", 0, 59],
      ["hour", 0, 23],
      ["day", 1, 31],
      ["month", 1, 12],
      ["weekday", 0, 7],
    ];
    const MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const DAYS = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    const MACROS = {
      "@yearly": "0 0 1 1 *",
      "@annually": "0 0 1 1 *",
      "@monthly": "0 0 1 * *",
      "@weekly": "0 0 * * 0",
      "@daily": "0 0 * * *",
      "@midnight": "0 0 * * *",
      "@hourly": "0 * * * *",
    };
    const input = h("input", {
      class: "w-input w-cron-input",
      value: expr,
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
      "aria-label": "cron expression",
      "aria-describedby": "",
    });
    const desc = h("div", { class: "w-cron-desc", role: "status" });
    const legend = h("div", { class: "w-cron-fields", "aria-hidden": "true" });
    const list = h("div", { class: "w-dev-rows w-cron-runs" });
    const out = devPanel("next runs", list);
    out.meta.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const num = (s, i) => {
      const names = i === 3 ? MONTHS : i === 4 ? DAYS : null;
      const byName = names?.findIndex(
        (n) => n.slice(0, 3).toLowerCase() === s.toLowerCase(),
      );
      if (byName >= 0) return byName + (i === 3 ? 1 : 0);
      if (!/^\d+$/.test(s))
        throw { i, msg: `"${s}" isn't a valid ${FIELDS[i][0]}` };
      return +s;
    };
    const parse = (f, i) => {
      const [name, lo, hi] = FIELDS[i];
      const set = new Set();
      for (const part of f.split(",")) {
        const m = part.match(/^(\*|\w+(?:-\w+)?)(?:\/(\d+))?$/);
        if (!m) throw { i, msg: `"${part}" isn't a valid ${name} value` };
        const step = m[2] ? +m[2] : 1;
        if (!step) throw { i, msg: "a step of 0 never runs" };
        const [a, b = m[2] ? hi : a] =
          m[1] === "*" ? [lo, hi] : m[1].split("-").map((v) => num(v, i));
        if (a < lo || b > hi)
          throw {
            i,
            msg: `${name} must be between ${lo} and ${i === 4 ? 6 : hi}`,
          };
        if (a > b) throw { i, msg: `${name} range ${a}-${b} runs backwards` };
        for (let v = a; v <= b; v += step) set.add(i === 4 ? v % 7 : v);
      }
      return set;
    };
    const joinAnd = (xs) =>
      xs.length < 2
        ? xs.join("")
        : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
    const words = (token, fmt) =>
      joinAnd(
        token.split(",").map((part) => {
          const [range, step] = part.split("/");
          const span =
            range === "*"
              ? ""
              : range.includes("-")
                ? range
                    .split("-")
                    .map((v) => fmt(v))
                    .join(" to ")
                : fmt(range);
          if (!step) return span;
          return `every ${step}${span ? ` from ${span}` : ""}`;
        }),
      );
    const clock = (hr, min) =>
      hr === 0 && min === 0
        ? "midnight"
        : hr === 12 && min === 0
          ? "noon"
          : new Date(2000, 0, 1, hr, min)
              .toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })
              .replace(/\s/g, "\u00a0");
    const ordinal = (v) => {
      const n = +v;
      const tail =
        n % 100 >= 11 && n % 100 <= 13
          ? "th"
          : (["th", "st", "nd", "rd"][n % 10] ?? "th");
      return `${n}${tail}`;
    };
    const describe = (p, S) => {
      const [mi, hr, dom, mon, dow] = p;
      const plain = (t) => /^\d+(,\d+)*$/.test(t);
      const every = (t) => t.match(/^\*\/(\d+)$/)?.[1];
      const hourRange = hr.match(/^(\d+)-(\d+)$/);
      const mins = [...S[0]].sort((x, y) => x - y);
      const fixed = plain(mi) && plain(hr) && S[0].size * S[1].size <= 6;
      let time;
      if (mi === "*" && hr === "*") time = "every minute";
      else if (every(mi) && hr === "*") time = `every ${every(mi)} minutes`;
      else if (fixed)
        time = `at ${joinAnd(
          [...S[1]]
            .sort((x, y) => x - y)
            .flatMap((x) => mins.map((y) => clock(x, y))),
        )}`;
      else if (plain(mi) && S[0].size === 1 && hr === "*")
        time = mins[0]
          ? `at ${mins[0]} minutes past every hour`
          : "every hour, on the hour";
      else if (plain(mi) && S[0].size === 1 && every(hr))
        time = `every ${every(hr)} hours${mins[0] ? `, ${mins[0]} minutes past` : ""}`;
      else if ((mi === "*" || every(mi)) && hourRange)
        time = `every ${every(mi) ? `${every(mi)} minutes` : "minute"} from ${clock(+hourRange[1], 0)} to ${clock(+hourRange[2], mins.at(-1))}`;
      else
        time = `${mi === "*" ? "every minute" : `at minute ${words(mi, String)}`}${hr === "*" ? "" : `, during hour ${words(hr, String)}`}`;
      const dayName = (v) => DAYS[num(v, 4)];
      const weekdays = [...S[4]].sort().join();
      const days = [
        dom !== "*" &&
          (every(dom)
            ? `every ${every(dom)} days`
            : `on the ${words(dom, ordinal)} of the month`),
        dow !== "*" &&
          (weekdays === "1,2,3,4,5"
            ? "on weekdays"
            : weekdays === "0,6"
              ? "on weekends"
              : `on ${words(dow, dayName)}`),
      ]
        .filter(Boolean)
        .join(" or ");
      const months =
        mon === "*" ? "" : `in ${words(mon, (v) => MONTHS[num(v, 3) - 1])}`;
      if (/^\d+$/.test(dom) && /^\w+$/.test(mon) && dow === "*")
        return `${time} on ${MONTHS[num(mon, 3) - 1]} ${ordinal(dom)}`;
      if (!days && !months && fixed) return `every day ${time}`;
      return [time, days, months].filter(Boolean).join(" ");
    };
    let fields = [];
    let bad = -1;
    const paintLegend = () => {
      const caret = input.selectionStart ?? -1;
      const before = input.value.slice(0, caret).trimStart();
      const active =
        document.activeElement === input ? before.split(/\s+/).length - 1 : -1;
      legend.replaceChildren(
        ...FIELDS.map(([name], i) =>
          h(
            "div",
            {
              class: `w-cron-field${i === bad ? " bad" : ""}${i === active ? " on" : ""}`,
            },
            h("span", { class: "w-cron-token" }, fields[i] ?? ""),
            h("span", { class: "w-cron-name" }, name),
          ),
        ),
      );
    };
    const fail = (msg) => {
      desc.textContent = msg;
      desc.classList.add("err");
      input.setAttribute("aria-invalid", "true");
      out.panel.hidden = true;
    };
    const run = () => {
      const raw = input.value.trim();
      const parts = (MACROS[raw.toLowerCase()] ?? raw)
        .split(/\s+/)
        .filter(Boolean);
      fields = raw.startsWith("@") ? parts : raw.split(/\s+/);
      bad = -1;
      desc.classList.remove("err");
      input.removeAttribute("aria-invalid");
      out.panel.hidden = false;
      if (parts.length !== 5) {
        bad = parts.length > 5 ? 5 : parts.length;
        paintLegend();
        return fail(
          parts.length > 5
            ? `too many fields: cron uses 5, this has ${parts.length}`
            : `missing the ${FIELDS[parts.length][0]} field. cron uses 5 fields`,
        );
      }
      let S;
      try {
        S = parts.map((p, i) => parse(p, i));
      } catch (e) {
        bad = e.i ?? -1;
        paintLegend();
        return fail(e.msg ?? "that expression doesn't parse");
      }
      paintLegend();
      desc.textContent = describe(parts, S);
      const domR = parts[2] !== "*";
      const dowR = parts[4] !== "*";
      const runs = [];
      const d = new Date();
      d.setSeconds(0, 0);
      d.setMinutes(d.getMinutes() + 1);
      const end = d.getTime() + 5 * 366 * 864e5;
      while (runs.length < 5 && d.getTime() < end) {
        if (!S[3].has(d.getMonth() + 1)) {
          d.setMonth(d.getMonth() + 1, 1);
          d.setHours(0, 0, 0, 0);
          continue;
        }
        const dom = S[2].has(d.getDate());
        const dow = S[4].has(d.getDay());
        if (!(domR && dowR ? dom || dow : dom && dow)) {
          d.setDate(d.getDate() + 1);
          d.setHours(0, 0, 0, 0);
          continue;
        }
        if (!S[1].has(d.getHours())) {
          d.setHours(d.getHours() + 1, 0, 0, 0);
          continue;
        }
        if (!S[0].has(d.getMinutes())) {
          d.setMinutes(d.getMinutes() + 1, 0, 0);
          continue;
        }
        runs.push(new Date(d));
        d.setMinutes(d.getMinutes() + 1, 0, 0);
      }
      const now = Date.now();
      if (!runs.length)
        return list.replaceChildren(
          h("div", { class: "w-dev-more" }, "never runs in the next 5 years"),
        );
      const soon = (ms) => {
        const mins = Math.ceil(ms / 60000);
        if (mins >= 2880) return devRel(ms);
        const hrs = Math.floor(mins / 60);
        return `in ${hrs ? `${hrs}h ` : ""}${mins % 60}m`;
      };
      list.replaceChildren(
        ...runs.map((r, i) =>
          h(
            "div",
            { class: "w-dev-row w-cron-run" },
            h(
              "span",
              { class: "w-dev-key" },
              i && r.toDateString() === runs[i - 1].toDateString()
                ? ""
                : r.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    ...(r.getFullYear() === new Date().getFullYear()
                      ? {}
                      : { year: "numeric" }),
                  }),
            ),
            h(
              "span",
              { class: "w-dev-val" },
              r.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            ),
            h("span", { class: "w-dev-aux" }, soon(r - now)),
          ),
        ),
      );
    };
    input.oninput = run;
    input.onkeyup = input.onclick = input.onfocus = input.onblur = paintLegend;
    run();
    return card("cron expression", null, desc, input, legend, out.panel);
  },
});

reg({
  id: "sort",
  match: (q) =>
    /^(?:sorting\s+(?:visuali[sz]er|algorithm|demo)|visuali[sz]e\s+sort(?:ing)?|sort(?:ing)?\s+visuali[sz]er)$/i.test(
      q.trim(),
    ),
  build: () => {
    const N = 28;
    let arr = [];
    let run = 0;
    let algo = "bubble";
    const bars = h("div", { class: "w-sort-bars", "aria-hidden": "true" });
    const cmpS = gameStat("comparisons");
    const swapS = gameStat("swaps");
    const legend = h(
      "div",
      { class: "w-sort-legend", "aria-hidden": "true" },
      h("span", { class: "cmp" }, "comparing"),
      h("span", { class: "swp" }, "swapping"),
    );
    const bar = gameBar([cmpS, swapS], legend);
    const live = h("div", { class: "w-sr", role: "status" });
    bars.replaceChildren(
      ...Array.from({ length: N }, (_, i) =>
        h("div", { class: "w-sort-bar", style: `--i: ${i}` }),
      ),
    );
    const draw = (a = -1, b = -1, swap = false) => {
      [...bars.children].forEach((el, i) => {
        el.style.height = `${arr[i]}%`;
        const hit = i === a || i === b;
        el.className = `w-sort-bar${hit ? (swap ? " swap" : " active") : ""}`;
      });
    };
    const randomize = () => {
      arr = Array.from({ length: N }, () => 5 + Math.floor(Math.random() * 95));
      draw();
    };
    const steps = [];
    const rec = (a, b, swap = false) => steps.push([arr.slice(), a, b, swap]);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const algos = {
      bubble: () => {
        for (let i = 0; i < N; i++)
          for (let j = 0; j < N - i - 1; j++) {
            rec(j, j + 1);
            if (arr[j] > arr[j + 1]) {
              [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
              rec(j, j + 1, true);
            }
          }
      },
      insertion: () => {
        for (let i = 1; i < N; i++) {
          let j = i;
          while (j > 0) {
            rec(j - 1, j);
            if (arr[j - 1] <= arr[j]) break;
            [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
            rec(j - 1, j, true);
            j--;
          }
        }
      },
      selection: () => {
        for (let i = 0; i < N; i++) {
          let mn = i;
          for (let j = i + 1; j < N; j++) {
            rec(mn, j);
            if (arr[j] < arr[mn]) mn = j;
          }
          if (mn !== i) {
            [arr[i], arr[mn]] = [arr[mn], arr[i]];
            rec(i, mn, true);
          }
        }
      },
      quick: () => {
        const qs = (lo, hi) => {
          if (lo >= hi) return;
          const p = arr[hi];
          let i = lo;
          for (let j = lo; j < hi; j++) {
            rec(j, hi);
            if (arr[j] < p) {
              [arr[i], arr[j]] = [arr[j], arr[i]];
              if (i !== j) rec(i, j, true);
              i++;
            }
          }
          [arr[i], arr[hi]] = [arr[hi], arr[i]];
          if (i !== hi) rec(i, hi, true);
          qs(lo, i - 1);
          qs(i + 1, hi);
        };
        qs(0, N - 1);
      },
    };
    const sortBtn = h(
      "button",
      { class: "w-btn primary w-sort-go", type: "button" },
      "sort",
    );
    const counts = (c = 0, s = 0) => {
      cmpS.set(c);
      swapS.set(s);
    };
    const stop = () => {
      run++;
      sortBtn.textContent = "sort";
      bars.classList.remove("sorted", "running");
      draw();
    };
    sortBtn.onclick = async () => {
      if (sortBtn.textContent === "stop") return stop();
      const id = ++run;
      sortBtn.textContent = "stop";
      bars.classList.remove("sorted");
      bars.classList.add("running");
      const snapshot = arr.slice();
      steps.length = 0;
      algos[algo]();
      const sorted = arr.slice();
      arr = snapshot;
      let swaps = 0;
      let cmps = 0;
      for (const [state, a, b, swap] of steps) {
        if (id !== run || !bars.isConnected) return;
        arr = state;
        if (swap) swaps++;
        else cmps++;
        draw(a, b, swap);
        counts(cmps, swaps);
        await sleep(algo === "quick" ? 40 : 22);
      }
      if (id !== run) return;
      arr = sorted;
      draw();
      bars.classList.remove("running");
      bars.classList.add("sorted");
      live.textContent = `${algo} sort finished with ${cmps} comparisons and ${swaps} swaps`;
      sortBtn.textContent = "sort";
    };
    const shuffle = h(
      "button",
      {
        class: "w-btn",
        type: "button",
        onclick: () => {
          if (sortBtn.textContent === "stop") stop();
          bars.classList.remove("sorted");
          randomize();
          counts();
        },
      },
      "shuffle",
    );
    const pick = segmented(
      "algorithm",
      ["bubble", "insertion", "selection", "quick"],
      algo,
      (v) => {
        algo = v;
        if (sortBtn.textContent === "stop") stop();
        if (bars.classList.contains("sorted")) {
          bars.classList.remove("sorted");
          randomize();
        }
        counts();
      },
    );
    randomize();
    return card(
      "sorting visualizer",
      null,
      bar,
      bars,
      live,
      pick,
      h("div", { class: "w-btn-row" }, sortBtn, shuffle),
    );
  },
});

reg({
  id: "snake",
  match: (q) => /^(?:play\s+)?snake(?:\s+game)?$/i.test(q.trim()),
  build: () => {
    const SIZE = 17;
    const CELL = 20;
    const STEP = 110;
    const px = SIZE * CELL;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = h("canvas", {
      class: "w-game-canvas",
      width: px * dpr,
      height: px * dpr,
      style: { width: `${px}px` },
      "aria-label": "snake board",
      role: "img",
    });
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const scoreS = gameStat("score");
    let best = +(localStorage.getItem("w-snake-best") || 0);
    const bestS = gameStat("best", String(best));
    const overTitle = h("div", { class: "w-game-over-title" }, "snake");
    const overSub = h(
      "div",
      { class: "w-game-over-sub" },
      "use the arrow keys or swipe to steer",
    );
    const overBtn = h(
      "button",
      { class: "w-btn primary", type: "button" },
      "start",
    );
    const over = h(
      "div",
      { class: "w-game-over show" },
      h("div", { class: "w-game-over-card" }, overTitle, overSub, overBtn),
    );
    const wrap = h(
      "div",
      { class: "w-game", tabindex: "0", "aria-label": "snake game" },
      canvas,
      over,
    );
    let snake, prev, queue, dir, food, foodAt, score, dead, raf, last;
    let playing = false;
    let colors = {};
    const showScore = () => {
      scoreS.set(score);
      bestS.set(best);
    };
    const spawn = () => {
      let p;
      do {
        p = [
          Math.floor(Math.random() * SIZE),
          Math.floor(Math.random() * SIZE),
        ];
      } while (snake?.some((s) => s[0] === p[0] && s[1] === p[1]));
      foodAt = performance.now();
      return p;
    };
    const reset = () => {
      snake = [
        [8, 8],
        [7, 8],
        [6, 8],
      ];
      prev = snake.map((s) => s.slice());
      dir = [1, 0];
      queue = [];
      food = spawn();
      score = 0;
      dead = false;
      showScore();
    };
    const draw = (t, now) => {
      const c = colors;
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, px, px);
      ctx.fillStyle = c.grid;
      ctx.globalAlpha = 0.32;
      for (let y = 0; y < SIZE; y++)
        for (let x = (y % 2) ^ 1; x < SIZE; x += 2)
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      ctx.globalAlpha = 1;
      const grow = Math.min(1, Math.max(0, (now - foodAt) / 220));
      const pulse = 1 + Math.sin(now / 260) * 0.06;
      const fr = (CELL / 2 - 3) * (1 - (1 - grow) ** 3) * pulse;
      ctx.fillStyle = c.red;
      ctx.beginPath();
      ctx.arc(
        food[0] * CELL + CELL / 2,
        food[1] * CELL + CELL / 2,
        Math.max(0, fr),
        0,
        Math.PI * 2,
      );
      ctx.fill();
      const lerp = (a, b) => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ];
      const pts = [
        lerp(prev[0], snake[0]),
        ...snake.slice(1),
        lerp(prev[prev.length - 1], snake[snake.length - 1]),
      ].map(([x, y]) => [x * CELL + CELL / 2, y * CELL + CELL / 2]);
      ctx.strokeStyle = c.green;
      ctx.lineWidth = CELL - 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.78;
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      for (const p of pts.slice(1)) ctx.lineTo(...p);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const [hx, hy] = pts[0];
      ctx.fillStyle = c.green;
      ctx.beginPath();
      ctx.arc(hx, hy, CELL / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.bg;
      const [dx, dy] = dir;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(
          hx + dx * 3 + -dy * side * 4,
          hy + dy * 3 + dx * side * 4,
          2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    };
    const tick = () => {
      if (queue.length) dir = queue.shift();
      const head = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
      const body = snake.slice(0, -1);
      if (
        head[0] < 0 ||
        head[1] < 0 ||
        head[0] >= SIZE ||
        head[1] >= SIZE ||
        body.some((s) => s[0] === head[0] && s[1] === head[1])
      ) {
        dead = true;
        return;
      }
      prev = snake.map((s) => s.slice());
      snake.unshift(head);
      if (head[0] === food[0] && head[1] === food[1]) {
        score++;
        showScore();
        scoreS.el.classList.remove("bump");
        void scoreS.el.offsetWidth;
        scoreS.el.classList.add("bump");
        food = spawn();
      } else snake.pop();
    };
    const die = () => {
      playing = false;
      prev = snake.map((s) => s.slice());
      const fresh = score > best;
      if (fresh) {
        best = score;
        localStorage.setItem("w-snake-best", best);
      }
      showScore();
      overTitle.textContent = fresh ? "new best" : "game over";
      overSub.textContent = `you scored ${score}${fresh || !best ? "" : `, best is ${best}`}`;
      overBtn.textContent = "play again";
      over.classList.add("show");
      wrap.classList.remove("hit");
      void wrap.offsetWidth;
      wrap.classList.add("hit");
    };
    const frame = (now) => {
      if (!canvas.isConnected) {
        playing = false;
        return;
      }
      if (!playing) return;
      if (now - last > STEP * 4) last = now - STEP;
      while (now - last >= STEP && !dead) {
        last += STEP;
        tick();
      }
      draw(dead ? 1 : Math.min(1, (now - last) / STEP), now);
      if (dead) return die();
      raf = requestAnimationFrame(frame);
    };
    const readColors = () => {
      const theme = getComputedStyle(document.documentElement);
      const tok = (name) => theme.getPropertyValue(name).trim();
      colors = {
        bg: tok("--bg"),
        grid: tok("--surface0"),
        green: tok("--green"),
        red: tok("--red"),
      };
    };
    const start = () => {
      if (playing) return;
      cancelAnimationFrame(raf);
      readColors();
      reset();
      over.classList.remove("show");
      wrap.classList.remove("hit");
      playing = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const setDir = (nd) => {
      if (!playing) start();
      const tail = queue.at(-1) || dir;
      if (nd[0] === -tail[0] && nd[1] === -tail[1]) return;
      if (nd[0] === tail[0] && nd[1] === tail[1]) return;
      if (queue.length < 2) queue.push(nd);
    };
    wrap.addEventListener("keydown", (e) => {
      const map = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        w: [0, -1],
        s: [0, 1],
        a: [-1, 0],
        d: [1, 0],
      };
      const nd = map[e.key] || map[e.key.toLowerCase?.()];
      if (nd) {
        setDir(nd);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        if (e.target === overBtn) return;
        start();
        e.preventDefault();
        e.stopPropagation();
      }
    });
    let tsx, tsy;
    wrap.addEventListener(
      "touchstart",
      (e) => {
        tsx = e.touches[0].clientX;
        tsy = e.touches[0].clientY;
      },
      { passive: true },
    );
    wrap.addEventListener("touchend", (e) => {
      if (tsx == null) return;
      const dx = e.changedTouches[0].clientX - tsx;
      const dy = e.changedTouches[0].clientY - tsy;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      setDir(
        Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)],
      );
      e.preventDefault();
    });
    overBtn.onclick = (e) => {
      e.stopPropagation();
      wrap.focus({ preventScroll: true });
      start();
    };
    wrap.onclick = () => wrap.focus({ preventScroll: true });
    readColors();
    reset();
    requestAnimationFrame((now) => {
      foodAt = now - 1000;
      draw(1, now);
    });
    return card(
      "snake",
      "arrow keys or wasd to steer, swipe on touch screens",
      h("div", { class: "w-game-col" }, gameBar([scoreS, bestS]), wrap),
    );
  },
});

reg({
  id: "2048",
  match: (q) => /^(?:play\s+)?2048(?:\s+game)?$/i.test(q.trim()),
  build: () => {
    const SLIDE = 130;
    let grid, score, won, uid;
    let best = +(localStorage.getItem("w-2048-best") || 0);
    let doomed = [];
    const layer = h("div", { class: "w-2048-tiles" });
    const board = h(
      "div",
      { class: "w-2048" },
      ...Array.from({ length: 16 }, () => h("div", { class: "w-2048-cell" })),
      layer,
    );
    const scoreS = gameStat("score");
    const bestS = gameStat("best", String(best));
    const newBtn = h(
      "button",
      { class: "w-btn w-game-new", type: "button" },
      "new game",
    );
    const overTitle = h("div", { class: "w-game-over-title" });
    const overSub = h("div", { class: "w-game-over-sub" });
    const overBtn = h("button", { class: "w-btn primary", type: "button" });
    const over = h(
      "div",
      { class: "w-game-over" },
      h("div", { class: "w-game-over-card" }, overTitle, overSub, overBtn),
    );
    const wrap = h(
      "div",
      { class: "w-game", tabindex: "0", "aria-label": "2048 board" },
      board,
      over,
    );
    const place = (t) => {
      t.el.style.setProperty("--x", t.c);
      t.el.style.setProperty("--y", t.r);
    };
    const paint = (t) => {
      t.el.textContent = String(t.v);
      t.el.dataset.v = String(Math.min(t.v, 2048));
      t.el.dataset.len = String(String(t.v).length);
    };
    const makeTile = (r, c, v, cls) => {
      const t = {
        id: uid++,
        r,
        c,
        v,
        el: h("div", { class: `w-2048-tile ${cls}` }),
      };
      place(t);
      paint(t);
      layer.append(t.el);
      return t;
    };
    const flush = () => {
      for (const el of doomed) el.remove();
      doomed = [];
      for (const el of layer.children) el.classList.remove("spawn", "merged");
    };
    const addTile = () => {
      const free = [];
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) if (!grid[r][c]) free.push([r, c]);
      if (!free.length) return;
      const [r, c] = free[Math.floor(Math.random() * free.length)];
      grid[r][c] = makeTile(
        r,
        c,
        Math.random() < 0.9 ? 2 : 4,
        layer.isConnected ? "spawn" : "",
      );
    };
    const setScore = (gain) => {
      scoreS.set(score);
      if (score > best) {
        best = score;
        localStorage.setItem("w-2048-best", best);
      }
      bestS.set(best);
      if (!gain || calmMotion()) return;
      const d = h(
        "span",
        { class: "w-2048-delta", "aria-hidden": "true" },
        `+${gain}`,
      );
      d.addEventListener("animationend", () => d.remove());
      scoreS.el.append(d);
    };
    const showOver = (title, sub, label) => {
      overTitle.textContent = title;
      overSub.textContent = sub;
      overBtn.textContent = label;
      over.classList.add("show");
    };
    const reset = () => {
      flush();
      layer.replaceChildren();
      over.classList.remove("show");
      grid = Array.from({ length: 4 }, () => [null, null, null, null]);
      score = 0;
      won = false;
      uid = 0;
      addTile();
      addTile();
      setScore(0);
    };
    const canMove = () => {
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const v = grid[r][c]?.v;
          if (!v) return true;
          if (c < 3 && v === grid[r][c + 1]?.v) return true;
          if (r < 3 && v === grid[r + 1][c]?.v) return true;
        }
      return false;
    };
    const move = (d) => {
      if (over.classList.contains("show")) return;
      flush();
      const vec = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] }[
        d
      ];
      const order = [0, 1, 2, 3];
      const rows = vec[0] === 1 ? order.toReversed() : order;
      const cols = vec[1] === 1 ? order.toReversed() : order;
      const next = Array.from({ length: 4 }, () => [null, null, null, null]);
      const fused = new Set();
      let moved = false;
      let gain = 0;
      for (const r of rows)
        for (const c of cols) {
          const t = grid[r][c];
          if (!t) continue;
          let nr = r;
          let nc = c;
          while (
            nr + vec[0] >= 0 &&
            nr + vec[0] < 4 &&
            nc + vec[1] >= 0 &&
            nc + vec[1] < 4 &&
            !next[nr + vec[0]][nc + vec[1]]
          ) {
            nr += vec[0];
            nc += vec[1];
          }
          const ar = nr + vec[0];
          const ac = nc + vec[1];
          const ahead = next[ar]?.[ac];
          if (ahead && ahead.v === t.v && !fused.has(ahead)) {
            t.r = ar;
            t.c = ac;
            place(t);
            t.el.classList.add("gone");
            ahead.el.classList.add("gone");
            doomed.push(t.el, ahead.el);
            const m = makeTile(ar, ac, t.v * 2, "merged");
            next[ar][ac] = m;
            fused.add(m);
            gain += m.v;
            if (m.v === 2048 && !won) won = true;
            moved = true;
            continue;
          }
          if (nr !== r || nc !== c) moved = true;
          t.r = nr;
          t.c = nc;
          place(t);
          next[nr][nc] = t;
        }
      if (!moved) {
        board.classList.remove("nudge", "left", "right", "up", "down");
        void board.offsetWidth;
        board.classList.add("nudge", d);
        return;
      }
      grid = next;
      score += gain;
      setScore(gain);
      addTile();
      setTimeout(() => {
        for (const el of doomed) if (el.classList.contains("gone")) el.remove();
      }, SLIDE);
      if (won === true) {
        won = "shown";
        showOver("you made 2048", `score ${score}`, "keep going");
        return;
      }
      if (!canMove())
        showOver(
          "no moves left",
          `you scored ${score}${score < best ? `, best is ${best}` : ""}`,
          "try again",
        );
    };
    overBtn.onclick = (e) => {
      e.stopPropagation();
      if (overBtn.textContent === "keep going") over.classList.remove("show");
      else reset();
      wrap.focus({ preventScroll: true });
    };
    newBtn.onclick = () => {
      reset();
      wrap.focus({ preventScroll: true });
    };
    wrap.addEventListener("keydown", (e) => {
      const m = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
        a: "left",
        d: "right",
        w: "up",
        s: "down",
      };
      const dir = m[e.key] || m[e.key.toLowerCase?.()];
      if (!dir) return;
      move(dir);
      e.preventDefault();
      e.stopPropagation();
    });
    let tsx, tsy;
    wrap.addEventListener(
      "touchstart",
      (e) => {
        tsx = e.touches[0].clientX;
        tsy = e.touches[0].clientY;
      },
      { passive: true },
    );
    wrap.addEventListener("touchend", (e) => {
      if (tsx == null) return;
      const dx = e.changedTouches[0].clientX - tsx;
      const dy = e.changedTouches[0].clientY - tsy;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      move(horizontal ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
      e.preventDefault();
    });
    wrap.onclick = () => wrap.focus({ preventScroll: true });
    reset();
    return card(
      "2048",
      "arrow keys or wasd to slide, swipe on touch screens",
      h("div", { class: "w-game-col" }, gameBar([scoreS, bestS], newBtn), wrap),
    );
  },
});

reg({
  id: "minesweeper",
  match: (q) => /^(?:play\s+)?mine\s?sweeper$/i.test(q.trim()),
  build: () => {
    const ROWS = 9;
    const COLS = 9;
    const MINES = 10;
    const FLAG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 14V2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5.2 2.6l7 2.9-7 2.9z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    const MINE = `<svg viewBox="0 0 16 16" aria-hidden="true"><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 1.8v12.4M1.8 8h12.4M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8"/></g><circle cx="8" cy="8" r="4.4" fill="currentColor"/></svg>`;
    let cells, started, dead, won, flags, origin, t0, timer;
    let flagMode = false;
    let best = +(localStorage.getItem("w-mine-best") || 0);
    const board = h("div", { class: "w-mine-grid" });
    const status = h("div", { class: "w-game-status", role: "status" });
    const minesS = gameStat("mines");
    const timeS = gameStat("time", "0 s");
    const flagBtn = h("button", {
      class: "w-btn w-game-new w-mine-mode",
      type: "button",
      "aria-pressed": "false",
      html: `${FLAG}<span>flag</span>`,
    });
    const newBtn = h(
      "button",
      { class: "w-btn w-game-new", type: "button" },
      "new game",
    );
    const inBounds = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS;
    const neighbors = (r, c) => {
      const out = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          if (inBounds(r + dr, c + dc)) out.push([r + dr, c + dc]);
        }
      return out;
    };
    const makeCells = () =>
      Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => ({
          mine: false,
          revealed: false,
          flagged: false,
          count: 0,
          wave: 0,
        })),
      );
    const placeMines = (sr, sc) => {
      const safe = new Set([`${sr},${sc}`]);
      for (const [r, c] of neighbors(sr, sc)) safe.add(`${r},${c}`);
      let placed = 0;
      while (placed < MINES) {
        const r = Math.floor(Math.random() * ROWS);
        const c = Math.floor(Math.random() * COLS);
        if (safe.has(`${r},${c}`) || cells[r][c].mine) continue;
        cells[r][c].mine = true;
        placed++;
      }
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          cells[r][c].count = neighbors(r, c).filter(
            ([nr, nc]) => cells[nr][nc].mine,
          ).length;
    };
    const reveal = (sr, sc, base = 0) => {
      const queue = [[sr, sc, base]];
      while (queue.length) {
        const [r, c, d] = queue.shift();
        const cell = cells[r][c];
        if (cell.revealed || cell.flagged) continue;
        cell.revealed = true;
        cell.wave = d;
        if (cell.count === 0 && !cell.mine)
          for (const [nr, nc] of neighbors(r, c)) queue.push([nr, nc, d + 1]);
      }
    };
    const remaining = () =>
      cells.reduce(
        (acc, row) =>
          acc + row.filter((cell) => !cell.mine && !cell.revealed).length,
        0,
      );
    const elapsed = () =>
      t0 ? Math.floor((performance.now() - t0) / 1000) : 0;
    const stopClock = () => {
      clearInterval(timer);
      timeS.set(`${elapsed()} s`);
    };
    const showStatus = () => {
      minesS.set(MINES - flags);
      if (won || dead) return;
      status.className = "w-game-status";
      status.textContent = flagMode
        ? "flag mode is on, taps place flags"
        : started
          ? ""
          : "your first click is always safe";
    };
    const btns = [];
    const draw = () => {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const cell = cells[r][c];
          const btn = btns[r * COLS + c];
          const s = cell.revealed
            ? cell.mine
              ? "mine"
              : `n${cell.count}`
            : cell.flagged
              ? "flag"
              : "";
          if (btn.dataset.s === s) continue;
          const was = btn.dataset.s;
          btn.dataset.s = s;
          btn.className = "w-mine-cell";
          btn.style.animationDelay = "";
          btn.removeAttribute("data-n");
          btn.replaceChildren();
          const label = `row ${r + 1}, column ${c + 1}`;
          btn.setAttribute("aria-label", label);
          if (!s) continue;
          if (s === "flag") {
            btn.classList.add("flag");
            btn.setAttribute("aria-label", `${label}: flagged`);
            btn.append(h("span", { class: "w-mine-flag", html: FLAG }));
            if (won)
              btn.style.animationDelay = `${Math.min(cell.wave * 45, 500)}ms`;
            continue;
          }
          btn.classList.add("revealed");
          if (!was || was === "flag") {
            btn.classList.add("pop");
            btn.style.animationDelay = `${Math.min(cell.wave * 28, 420)}ms`;
          }
          if (s === "mine") {
            btn.classList.add("w-mine-mine");
            btn.setAttribute("aria-label", `${label}: mine`);
            if (origin && origin[0] === r && origin[1] === c)
              btn.classList.add("boom");
            btn.innerHTML = MINE;
            continue;
          }
          btn.setAttribute("aria-label", `${label}: ${cell.count}`);
          if (cell.count) {
            btn.textContent = String(cell.count);
            btn.dataset.n = String(cell.count);
          }
        }
      showStatus();
    };
    const endWave = (r0, c0) => {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          cells[r][c].wave = Math.max(Math.abs(r - r0), Math.abs(c - c0));
    };
    const boom = (r, c) => {
      dead = true;
      stopClock();
      origin = [r, c];
      endWave(r, c);
      for (const row of cells)
        for (const m of row) if (m.mine) m.revealed = true;
      draw();
      wrap.classList.remove("hit");
      void wrap.offsetWidth;
      wrap.classList.add("hit");
      status.textContent = "you hit a mine";
      status.className = "w-game-status lose";
    };
    const checkWin = (r, c) => {
      if (remaining() !== 0) return;
      won = true;
      stopClock();
      endWave(r, c);
      for (const row of cells)
        for (const m of row) if (m.mine) m.flagged = true;
      flags = MINES;
      const secs = elapsed();
      const fresh = !best || secs < best;
      if (fresh) {
        best = secs;
        localStorage.setItem("w-mine-best", best);
      }
      status.textContent = `cleared in ${secs} s${fresh ? ", a new best" : `, best is ${best} s`}`;
      status.className = "w-game-status win";
    };
    const onReveal = (r, c) => {
      if (dead || won) return;
      const cell = cells[r][c];
      if (cell.flagged || cell.revealed) return;
      if (!started) {
        placeMines(r, c);
        started = true;
        t0 = performance.now();
        clearInterval(timer);
        timer = setInterval(() => {
          if (!board.isConnected) return clearInterval(timer);
          timeS.set(`${elapsed()} s`);
        }, 1000);
      }
      if (cell.mine) return boom(r, c);
      reveal(r, c);
      checkWin(r, c);
      draw();
    };
    const onFlag = (r, c) => {
      if (dead || won) return;
      const cell = cells[r][c];
      if (cell.revealed) return;
      cell.flagged = !cell.flagged;
      cell.wave = 0;
      flags += cell.flagged ? 1 : -1;
      draw();
    };
    const chord = (r, c) => {
      if (dead || won) return;
      const cell = cells[r][c];
      if (!cell.revealed || !cell.count) return;
      const adj = neighbors(r, c);
      const flagged = adj.filter(([nr, nc]) => cells[nr][nc].flagged).length;
      if (flagged !== cell.count) return;
      let hit = null;
      for (const [nr, nc] of adj) {
        const n = cells[nr][nc];
        if (n.flagged || n.revealed) continue;
        if (n.mine) hit = [nr, nc];
        else reveal(nr, nc, 1);
      }
      if (hit) return boom(...hit);
      checkWin(r, c);
      draw();
    };
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const btn = h("button", { class: "w-mine-cell", type: "button" });
        let press = null;
        let held = false;
        const cancel = () => {
          clearTimeout(press);
          press = null;
        };
        btn.onpointerdown = (e) => {
          held = false;
          if (e.pointerType !== "touch") return;
          cancel();
          press = setTimeout(() => {
            press = null;
            held = true;
            if (cells[r][c].revealed) return;
            onFlag(r, c);
            navigator.vibrate?.(12);
          }, 380);
        };
        btn.onpointerup = cancel;
        btn.onpointerleave = cancel;
        btn.onpointercancel = cancel;
        btn.onclick = () => {
          if (held) {
            held = false;
            return;
          }
          if (cells[r][c].revealed) return chord(r, c);
          if (flagMode) return onFlag(r, c);
          onReveal(r, c);
        };
        btn.onauxclick = (e) => {
          if (e.button !== 1) return;
          e.preventDefault();
          chord(r, c);
        };
        btn.oncontextmenu = (e) => {
          e.preventDefault();
          if (held) return;
          onFlag(r, c);
        };
        btns.push(btn);
        board.append(btn);
      }
    const reset = () => {
      clearInterval(timer);
      cells = makeCells();
      started = false;
      dead = false;
      won = false;
      flags = 0;
      origin = null;
      t0 = 0;
      timeS.set("0 s");
      wrap.classList.remove("hit");
      draw();
    };
    const wrap = h("div", { class: "w-game w-mine-wrap" }, board);
    flagBtn.onclick = () => {
      flagMode = !flagMode;
      flagBtn.setAttribute("aria-pressed", String(flagMode));
      showStatus();
    };
    newBtn.onclick = reset;
    wrap.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey) return;
      reset();
      e.preventDefault();
    });
    reset();
    return card(
      "minesweeper",
      "right-click or long-press to flag, click a number to clear around it",
      h(
        "div",
        { class: "w-game-col" },
        gameBar([minesS, timeS], flagBtn, newBtn),
        wrap,
        status,
      ),
    );
  },
});

const CHORDS = {
  C: [-1, 3, 2, 0, 1, 0],
  G: [3, 2, 0, 0, 0, 3],
  D: [-1, -1, 0, 2, 3, 2],
  A: [-1, 0, 2, 2, 2, 0],
  E: [0, 2, 2, 1, 0, 0],
  Am: [-1, 0, 2, 2, 1, 0],
  Em: [0, 2, 2, 0, 0, 0],
  Dm: [-1, -1, 0, 2, 3, 1],
  F: [1, 3, 3, 2, 1, 1],
  B: [-1, 2, 4, 4, 4, 2],
  Bm: [-1, 2, 4, 4, 3, 2],
  A7: [-1, 0, 2, 0, 2, 0],
  E7: [0, 2, 0, 1, 0, 0],
  D7: [-1, -1, 0, 2, 1, 2],
  G7: [3, 2, 0, 0, 0, 1],
  C7: [-1, 3, 2, 3, 1, 0],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  Gmaj7: [3, 2, 0, 0, 0, 2],
  Fmaj7: [-1, -1, 3, 2, 1, 0],
  Emaj7: [0, 2, 1, 1, 0, 0],
  Dmaj7: [-1, -1, 0, 2, 2, 2],
  Dm7: [-1, -1, 0, 2, 1, 1],
  Am7: [-1, 0, 2, 0, 1, 0],
  Em7: [0, 2, 2, 0, 3, 0],
};

reg({
  id: "chord",
  match: (q) => {
    const m = q.match(
      /^(?:guitar\s+)?chord\s+(?:for\s+|of\s+)?([a-g][#b]?(?:m|maj7|m7|7|min)?)$|^([a-g][#b]?(?:m|maj7|m7|7|min)?)\s+(?:guitar\s+)?chord$/i,
    );
    return m ? { name: (m[1] || m[2]).trim() } : null;
  },
  build: ({ name }) => {
    const norm =
      name[0].toUpperCase() +
      name
        .slice(1)
        .replace(/B/, "b")
        .replace(/MIN$/i, "m")
        .replace(/M7$/i, "m7")
        .replace(/MAJ7$/i, "maj7");
    const [, root, acc, qual] = norm.match(/^([A-G])([#b]?)(.*)$/) || [];
    const quals = {
      "": ["major", [0, 4, 7], [0, 2, 2, 1, 0, 0], [-1, 0, 2, 2, 2, 0]],
      m: ["minor", [0, 3, 7], [0, 2, 2, 0, 0, 0], [-1, 0, 2, 2, 1, 0]],
      7: [
        "dominant 7th",
        [0, 4, 7, 10],
        [0, 2, 0, 1, 0, 0],
        [-1, 0, 2, 0, 2, 0],
      ],
      m7: ["minor 7th", [0, 3, 7, 10], [0, 2, 0, 0, 0, 0], [-1, 0, 2, 0, 1, 0]],
      maj7: [
        "major 7th",
        [0, 4, 7, 11],
        [0, -1, 1, 1, 0, -1],
        [-1, 0, 2, 1, 2, 0],
      ],
    };
    const spec = root && quals[qual];
    if (!spec)
      return card(
        "guitar chord",
        null,
        h(
          "div",
          { class: "w-chord-empty" },
          h("div", null, `no diagram for "${name}"`),
          h(
            "div",
            { class: "w-sub" },
            "try a chord like C, F#m, Bb7, Em7 or Cmaj7",
          ),
        ),
      );
    const [quality, intervals, eShape, aShape] = spec;
    const pc =
      ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[root] +
        (acc === "#" ? 1 : acc === "b" ? -1 : 0) +
        12) %
      12;
    const onE = (pc + 8) % 12;
    const onA = (pc + 3) % 12;
    const [shape, at] = onA < onE ? [aShape, onA] : [eShape, onE];
    const frets = CHORDS[norm] || shape.map((f) => (f < 0 ? -1 : f + at));
    const fretted = frets.filter((f) => f > 0);
    const low = Math.min(...fretted);
    const base = Math.max(...fretted) > 4 ? low : 1;
    const barred = frets.flatMap((f, s) => (f === low ? [s] : []));
    const barreAt =
      barred.length > 2 &&
      frets.slice(barred[0], barred.at(-1) + 1).every((f) => f >= low) &&
      low;
    const ri = "CDEFGAB".indexOf(root);
    const tones = intervals.map((i) => {
      const li = (ri + { 0: 0, 3: 2, 4: 2, 7: 4, 10: 6, 11: 6 }[i]) % 7;
      const d = ((((pc + i - [0, 2, 4, 5, 7, 9, 11][li]) % 12) + 18) % 12) - 6;
      return `${"CDEFGAB"[li]}${d > 0 ? "#".repeat(d) : "b".repeat(-d)}`;
    });
    const X = (s) => 22 + s * 24;
    const Y = (row) => 34 + (row - 0.5) * 30;
    const parts = [];
    for (let s = 0; s < 6; s++)
      parts.push(
        `<line class="w-chord-string" data-s="${s}" x1="${X(s)}" y1="34" x2="${X(s)}" y2="154" style="stroke-width:${(2 - s * 0.2).toFixed(2)}"/>`,
      );
    for (let row = 1; row <= 4; row++)
      parts.push(
        `<line class="w-chord-fret" x1="${X(0)}" y1="${34 + row * 30}" x2="${X(5)}" y2="${34 + row * 30}"/>`,
      );
    parts.push(
      base === 1
        ? `<line class="w-chord-nut" x1="${X(0)}" y1="34" x2="${X(5)}" y2="34"/>`
        : `<line class="w-chord-fret" x1="${X(0)}" y1="34" x2="${X(5)}" y2="34"/><text class="w-chord-pos" x="${X(5) + 14}" y="${Y(1) + 4}">${base}fr</text>`,
    );
    for (let s = 0; s < 6; s++) {
      const f = frets[s];
      if (f === 0)
        parts.push(
          `<circle class="w-chord-open" data-s="${s}" cx="${X(s)}" cy="20" r="5" />`,
        );
      else if (f < 0)
        parts.push(
          `<path class="w-chord-mute" d="M${X(s) - 4.5} 15.5l9 9M${X(s) + 4.5} 15.5l-9 9"/>`,
        );
    }
    if (barreAt) {
      const on = frets
        .map((f, s) => (f === barreAt ? s : -1))
        .filter((s) => s >= 0);
      const y = Y(barreAt - base + 1);
      parts.push(
        `<rect class="w-chord-barre" x="${X(on[0]) - 9}" y="${y - 9}" width="${X(on.at(-1)) - X(on[0]) + 18}" height="18" rx="9"/>`,
      );
    }
    for (let s = 0; s < 6; s++) {
      if (frets[s] <= 0 || frets[s] === barreAt) continue;
      parts.push(
        `<circle class="w-chord-dot" data-s="${s}" cx="${X(s)}" cy="${Y(frets[s] - base + 1)}" r="9"/>`,
      );
    }
    for (const [s, label] of ["E", "A", "D", "G", "B", "E"].entries())
      parts.push(
        `<text class="w-chord-name" x="${X(s)}" y="174">${label}</text>`,
      );
    const diagram = h("div", {
      class: "w-chord",
      html: `<svg viewBox="0 0 164 182" role="img" aria-label="${norm} chord diagram${base > 1 ? `, starting at fret ${base}` : ""}">${parts.join("")}</svg>`,
    });
    const strum = () => {
      const ac = audio();
      const t0 = ac.currentTime + 0.02;
      const calm = calmMotion();
      let n = 0;
      [40, 45, 50, 55, 59, 64].forEach((open, s) => {
        if (frets[s] < 0) return;
        const t = t0 + n++ * 0.035;
        const o = ac.createOscillator(),
          f = ac.createBiquadFilter(),
          g = ac.createGain();
        o.type = "sawtooth";
        o.frequency.value = noteFreq(open + frets[s]);
        f.type = "lowpass";
        f.frequency.setValueAtTime(3200, t);
        f.frequency.exponentialRampToValueAtTime(700, t + 0.6);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        o.connect(f);
        f.connect(g);
        g.connect(ac.destination);
        o.start(t);
        o.stop(t + 1.85);
        if (calm) return;
        diagram.querySelector(`.w-chord-string[data-s="${s}"]`)?.animate(
          [0, 1.4, -1.1, 0.8, -0.5, 0.3, -0.15, 0].map((x) => ({
            translate: `${x}px 0`,
          })),
          {
            duration: 520,
            delay: (t - ac.currentTime) * 1000,
            easing: "linear",
          },
        );
      });
    };
    return card(
      `${norm} chord`,
      `${root}${acc} ${quality} · ${tones.join(" ")}`,
      h(
        "div",
        { class: "w-chord-stage" },
        diagram,
        h(
          "button",
          { class: "w-btn w-chord-strum", type: "button", onclick: strum },
          "strum",
        ),
      ),
    );
  },
});

reg({
  id: "diff",
  match: (q) =>
    /^(?:text\s+)?diff(?:\s+(?:checker|tool|viewer))?$|^compare\s+text$/i.test(
      q.trim(),
    ),
  build: () => {
    const a = devEditor("original text", "7", "paste the original");
    const b = devEditor("changed text", "7", "paste the changed version");
    const left = devPanel("original", a);
    const right = devPanel("changed", b);
    const view = h("div", { class: "w-diff-view" });
    let lastRows = [];
    const out = devPanel(
      "changes",
      view,
      () =>
        lastRows.map(({ s, t }) => `${s === "=" ? " " : s} ${t}`).join("\n"),
      "copy diff",
    );
    const lineCount = (ta, p) => {
      const n = ta.value ? ta.value.split("\n").length : 0;
      p.meta.textContent = n ? `${n} line${n === 1 ? "" : "s"}` : "";
    };
    const empty = (text) => {
      lastRows = [];
      out.copy.disabled = true;
      out.meta.replaceChildren();
      view.replaceChildren(
        h("div", { class: "w-dev-empty w-diff-empty" }, text),
      );
    };
    const line = ({ s, t, o, n, hl }) =>
      h(
        "div",
        {
          class: `w-diff-row${s === "+" ? " add" : s === "-" ? " del" : ""}`,
        },
        h("span", { class: "w-diff-ln" }, o ?? ""),
        h("span", { class: "w-diff-ln" }, n ?? ""),
        h(
          "span",
          { class: "w-diff-sign", "aria-hidden": "true" },
          s === "=" ? "" : s === "+" ? "+" : "−",
        ),
        h(
          "span",
          { class: "w-diff-text" },
          hl
            ? [
                t.slice(0, hl[0]),
                h("span", { class: "w-diff-hl" }, t.slice(hl[0], hl[1])),
                t.slice(hl[1]),
              ]
            : t,
        ),
      );
    const run = () => {
      lineCount(a, left);
      lineCount(b, right);
      out.panel.classList.remove("err");
      if (!a.value && !b.value)
        return empty("paste text on both sides to compare");
      const la = a.value.split("\n");
      const lb = b.value.split("\n");
      const n = la.length;
      const m = lb.length;
      if (n * m > 4e6) {
        out.panel.classList.add("err");
        return empty("too long to compare here. try under 2,000 lines a side");
      }
      const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
          dp[i][j] =
            la[i] === lb[j]
              ? dp[i + 1][j + 1] + 1
              : Math.max(dp[i + 1][j], dp[i][j + 1]);
      const rows = [];
      let i = 0;
      let j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && la[i] === lb[j])
          rows.push({ s: "=", t: la[i], o: ++i, n: ++j });
        else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1]))
          rows.push({ s: "-", t: la[i], o: ++i });
        else rows.push({ s: "+", t: lb[j], n: ++j });
      }
      for (let k = 0; k < rows.length; ) {
        if (rows[k].s !== "-") {
          k++;
          continue;
        }
        let d = k;
        while (rows[d]?.s === "-") d++;
        let e = d;
        while (rows[e]?.s === "+") e++;
        if (e - d === d - k)
          for (let x = 0; x < d - k; x++) {
            const del = rows[k + x];
            const add = rows[d + x];
            let p = 0;
            while (p < del.t.length && del.t[p] === add.t[p]) p++;
            let q = 0;
            while (
              q < del.t.length - p &&
              q < add.t.length - p &&
              del.t.at(-1 - q) === add.t.at(-1 - q)
            )
              q++;
            if (p + q > 0) {
              del.hl = [p, del.t.length - q];
              add.hl = [p, add.t.length - q];
            }
          }
        k = e;
      }
      lastRows = rows;
      const added = rows.filter((r) => r.s === "+").length;
      const removed = rows.filter((r) => r.s === "-").length;
      if (!added && !removed) return empty("no differences, both sides match");
      out.copy.disabled = false;
      out.meta.replaceChildren(
        h("span", { class: "w-diff-plus" }, `${added} added`),
        ", ",
        h("span", { class: "w-diff-minus" }, `${removed} removed`),
      );
      view.style.setProperty("--ln", `${String(Math.max(n, m)).length}ch`);
      const CONTEXT = 3;
      const near = rows.map((_, x) =>
        rows
          .slice(Math.max(0, x - CONTEXT), x + CONTEXT + 1)
          .some((r) => r.s !== "="),
      );
      const kids = [];
      for (let x = 0; x < rows.length; ) {
        if (near[x]) {
          kids.push(line(rows[x++]));
          continue;
        }
        let y = x;
        while (y < rows.length && !near[y]) y++;
        const hidden = rows.slice(x, y);
        if (hidden.length < 4) kids.push(...hidden.map(line));
        else {
          const fold = h(
            "button",
            { type: "button", class: "w-diff-fold" },
            `show ${hidden.length} unchanged lines`,
          );
          fold.onclick = () => fold.replaceWith(...hidden.map(line));
          kids.push(fold);
        }
        x = y;
      }
      view.replaceChildren(...kids);
    };
    a.oninput = b.oninput = run;
    run();
    return card(
      "text diff",
      "line by line, with changes inside each line marked",
      h("div", { class: "w-md-split w-diff-inputs" }, left.panel, right.panel),
      out.panel,
    );
  },
});

const numToWords = (num) => {
  if (num === 0) return "zero";
  const neg = num < 0;
  num = Math.abs(num);
  const ones = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const scales = ["", "thousand", "million", "billion", "trillion"];
  const chunk = (n) => {
    let s = "";
    if (n >= 100) {
      s += `${ones[Math.floor(n / 100)]} hundred`;
      n %= 100;
      if (n) s += " ";
    }
    if (n >= 20) {
      s += tens[Math.floor(n / 10)];
      if (n % 10) s += `-${ones[n % 10]}`;
    } else if (n > 0) s += ones[n];
    return s;
  };
  const parts = [];
  let scale = 0;
  while (num > 0) {
    const c = num % 1000;
    if (c) parts.unshift(chunk(c) + (scales[scale] ? ` ${scales[scale]}` : ""));
    num = Math.floor(num / 1000);
    scale++;
  }
  return (neg ? "negative " : "") + parts.join(" ");
};

reg({
  id: "numwords",
  match: (q) => {
    const m = q.match(
      /^(?:number\s+to\s+words|spell(?:\s+out)?|say)\s+(-?\d[\d,]*)$|^(-?\d[\d,]*)\s+(?:in|to)\s+words$/i,
    );
    return m ? { n: (m[1] || m[2]).replace(/,/g, "") } : null;
  },
  build: ({ n }) => {
    const input = h("input", {
      class: "w-input w-nw-in",
      type: "text",
      inputmode: "numeric",
      autocomplete: "off",
      "aria-label": "number",
      placeholder: "type a number",
      value: (+n).toLocaleString("en-US"),
    });
    const words = h("div", {
      class: "w-tx-text w-nw-words",
      "data-ph": "the words appear here",
    });
    const copy = copyBtn(() => words.textContent, "copy the words");
    const panel = h(
      "div",
      { class: "w-tx-out w-nw-out", role: "status", "aria-live": "polite" },
      words,
      copy,
    );
    const run = () => {
      const raw = input.value.replace(/[\s,_]/g, "");
      const bad = raw && !/^-?\d+$/.test(raw);
      const big = !bad && raw && Math.abs(+raw) >= 1e15;
      words.textContent = bad
        ? "whole numbers only"
        : big
          ? "that's too large to spell out. try one below a quadrillion."
          : raw
            ? numToWords(parseInt(raw, 10))
            : "";
      panel.classList.toggle("err", Boolean(bad || big));
      copy.disabled = Boolean(bad || big || !raw);
    };
    input.oninput = run;
    run();
    return card("number to words", null, input, panel);
  },
});

const HTTP_STATUS = {
  100: "Continue",
  101: "Switching Protocols",
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  206: "Partial Content",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  418: "I'm a teapot",
  422: "Unprocessable Entity",
  425: "Too Early",
  429: "Too Many Requests",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

reg({
  id: "http",
  match: (q) => {
    let m = q.match(/^(?:http\s+|status\s+(?:code\s+)?)(\d{3})$/i);
    if (m) {
      const c = +m[1];
      return c >= 100 && c < 600 ? { code: c } : null;
    }
    m = q.match(/^(\d{3})$/);
    if (m && HTTP_STATUS[+m[1]]) return { code: +m[1] };
    return null;
  },
  build: ({ code }) => {
    const cls = Math.floor(code / 100);
    const txt =
      HTTP_STATUS[code] ||
      {
        1: "Informational",
        2: "Success",
        3: "Redirect",
        4: "Client Error",
        5: "Server Error",
      }[cls] ||
      "Unknown";
    const group =
      {
        1: "informational",
        2: "success",
        3: "redirection",
        4: "client error",
        5: "server error",
      }[cls] || "unknown class";
    const note = {
      100: "the server got the request headers and the client should send the body.",
      101: "the server is switching to the protocol the client asked for, like WebSocket.",
      200: "the request worked and the response carries the result.",
      201: "the request worked and created a new resource.",
      202: "the request was accepted but hasn't been processed yet.",
      204: "the request worked and there is no body to send back.",
      206: "the server is sending only the byte range the client asked for.",
      301: "the resource moved for good. update links to the new URL.",
      302: "the resource is at another URL for now. keep using the original.",
      303: "fetch the result from another URL with a GET request.",
      304: "the cached copy is still fresh, so the server sent no body.",
      307: "temporary redirect that keeps the original method and body.",
      308: "permanent redirect that keeps the original method and body.",
      400: "the server couldn't parse the request, usually malformed syntax.",
      401: "the request needs valid authentication credentials.",
      403: "the server understood the request but refuses to allow it.",
      404: "the server can't find anything at this URL.",
      405: "the resource exists but doesn't accept this HTTP method.",
      408: "the server gave up waiting for the client to finish the request.",
      409: "the request conflicts with the current state of the resource.",
      410: "the resource was here but has been removed on purpose.",
      413: "the request body is larger than the server will accept.",
      415: "the server doesn't support the body's media type.",
      418: "an April Fools' joke from RFC 2324. the teapot refuses to brew coffee.",
      422: "the syntax is fine but the server couldn't process the contents.",
      429: "the client sent too many requests. slow down and retry later.",
      451: "the resource is blocked for legal reasons.",
      500: "something went wrong on the server with no more specific code.",
      501: "the server doesn't support the feature needed for this request.",
      502: "a gateway or proxy got a bad response from the upstream server.",
      503: "the server is overloaded or down for maintenance.",
      504: "a gateway or proxy timed out waiting for the upstream server.",
    }[code];
    return card(
      "http status",
      `${cls}xx ${group}`,
      h(
        "div",
        { class: "w-http-row" },
        h(
          "div",
          { class: `w-http-hero c${cls}` },
          h("div", { class: "w-big w-http-code" }, code),
          h("div", { class: "w-http-txt" }, txt),
        ),
        copyBtn(() => `${code} ${txt}`, "copy status line"),
      ),
      note && h("p", { class: "w-http-note" }, note),
    );
  },
});

reg({
  id: "chmod",
  match: (q) => {
    const m = q.match(/^chmod\s+([0-7]{3})$/i);
    if (m) return { oct: m[1] };
    if (/^chmod(?:\s+calculator)?$/i.test(q.trim())) return { oct: "755" };
    return null;
  },
  build: ({ oct }) => {
    const groups = ["owner", "group", "others"];
    const perms = ["r", "w", "x"];
    const permNames = ["read", "write", "execute"];
    const state = oct.split("").map((d) => +d);
    const boxes = [];
    const digitEls = groups.map(() => h("span", { class: "w-chmod-digit" }));
    const octEl = h(
      "div",
      { class: "w-big w-mono w-chmod-oct", "aria-live": "polite" },
      ...digitEls,
    );
    const symEls = groups.flatMap(() =>
      perms.map(() => h("span", { class: "w-chmod-bit" })),
    );
    const symEl = h("div", { class: "w-chmod-sym w-mono" }, ...symEls);
    const upd = () => {
      boxes.forEach((g, gi) => {
        const d = String(
          g.reduce((acc, cb, i) => acc + (cb.checked ? [4, 2, 1][i] : 0), 0),
        );
        const el = digitEls[gi];
        if (el.textContent !== d && el.textContent) {
          el.classList.remove("bump");
          el.offsetWidth;
          el.classList.add("bump");
        }
        el.textContent = d;
        g.forEach((cb, i) => {
          const bit = symEls[gi * 3 + i];
          bit.textContent = cb.checked ? perms[i] : "-";
          bit.classList.toggle("on", cb.checked);
        });
      });
    };
    const grid = h(
      "div",
      { class: "w-chmod", role: "group", "aria-label": "permissions" },
      h("span"),
      permNames.map((p) => h("span", { class: "w-chmod-col" }, p)),
    );
    groups.forEach((g, gi) => {
      boxes[gi] = permNames.map((name, pi) => {
        const cb = h("input", {
          type: "checkbox",
          "aria-label": `${g} ${name}`,
          ...(state[gi] & [4, 2, 1][pi] ? { checked: "" } : {}),
        });
        cb.onchange = upd;
        return cb;
      });
      grid.append(
        h("span", { class: "w-chmod-label" }, g),
        ...boxes[gi].map((cb) => h("label", { class: "w-chmod-cell" }, cb)),
      );
    });
    upd();
    return card(
      "chmod calculator",
      null,
      h(
        "div",
        { class: "w-chmod-out" },
        h("div", { class: "w-chmod-vals" }, octEl, symEl),
        copyBtn(() => octEl.textContent, "copy octal mode"),
      ),
      grid,
    );
  },
});

reg({
  id: "caesar",
  match: (q) => {
    const m = q.match(/^caesar\s+(?:cipher\s+)?(?:shift\s+)?(-?\d+)\s+(.+)$/i);
    if (m) return { shift: +m[1], text: m[2] };
    if (/^caesar(?:\s+cipher)?$/i.test(q.trim()))
      return { shift: 3, text: "hello world" };
    return null;
  },
  build: ({ shift, text }) => {
    const input = h("textarea", {
      class: "w-textarea w-tx-in",
      rows: "1",
      placeholder: "type or paste text",
      "aria-label": "text to shift",
      spellcheck: "false",
      autocapitalize: "off",
    });
    input.value = text;
    const shiftNum = h("span");
    const shiftMap = h("span", { class: "w-slider-aux" });
    const shiftIn = slider({
      min: "0",
      max: "25",
      "aria-label": "shift",
      value: ((shift % 26) + 26) % 26,
    });
    const out = h("div", {
      class: "w-tx-text mono",
      "data-ph": "the shifted text appears here",
    });
    const copy = copyBtn(() => out.textContent, "copy result");
    const run = () => {
      const s = +shiftIn.value;
      shiftNum.textContent = s;
      shiftMap.textContent = `a → ${String.fromCharCode(97 + s)}`;
      out.textContent = input.value.replace(/[a-z]/gi, (c) => {
        const base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + s) % 26) + base);
      });
      copy.disabled = !out.textContent;
    };
    input.oninput = shiftIn.oninput = run;
    run();
    return card(
      "caesar cipher",
      null,
      input,
      sliderField("shift", shiftIn, shiftNum, shiftMap),
      h(
        "div",
        { class: "w-tx-out", role: "status", "aria-live": "polite" },
        out,
        copy,
      ),
    );
  },
});

converter(
  "leet",
  "leetspeak",
  "1337 5p34k",
  (s) =>
    s.replace(
      /[aeiotslbg]/gi,
      (c) =>
        ({
          a: "4",
          e: "3",
          i: "1",
          o: "0",
          t: "7",
          s: "5",
          l: "1",
          b: "8",
          g: "9",
        })[c.toLowerCase()] || c,
    ),
  /^leet(?:speak)?\s+(.+)$|^(.+)\s+(?:in|to)\s+leet(?:speak)?$/i,
);

reg({
  id: "subnet",
  match: (q) => {
    const m = q.match(
      /^(?:subnet\s+)?(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})$/i,
    );
    if (m && +m[2] <= 32) return { ip: m[1], cidr: +m[2] };
    if (/^subnet(?:\s+calculator)?$|^ip\s+subnet$/i.test(q.trim()))
      return { ip: "192.168.1.0", cidr: 24 };
    return null;
  },
  build: ({ ip, cidr }) => {
    const errId = `w-subnet-err-${Math.random().toString(36).slice(2)}`;
    const toIp = (n) =>
      [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    const input = h("input", {
      class: "w-input w-mono w-subnet-input",
      value: `${ip}/${cidr}`,
      spellcheck: "false",
      autocomplete: "off",
      autocapitalize: "off",
      inputmode: "decimal",
      "aria-describedby": errId,
    });
    const err = h("div", {
      class: "w-subnet-err",
      id: errId,
      role: "status",
    });
    const range = h("div", { class: "w-big w-mono w-subnet-range" });
    const hostsEl = h("div", { class: "w-focal-cap" });
    const bits = Array.from({ length: 32 }, () => h("i"));
    const netLegend = h("span", { class: "net" });
    const hostLegend = h("span");
    const list = h("div");
    const result = h(
      "div",
      { class: "w-subnet-result" },
      h(
        "div",
        { class: "w-subnet-hero" },
        range,
        hostsEl,
        h(
          "div",
          { class: "w-subnet-bits", "aria-hidden": "true" },
          [0, 1, 2, 3].map((o) =>
            h("div", { class: "w-subnet-oct" }, bits.slice(o * 8, o * 8 + 8)),
          ),
        ),
        h("div", { class: "w-subnet-legend" }, netLegend, hostLegend),
      ),
      list,
    );
    const run = () => {
      const m = input.value
        .trim()
        .match(/^(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})$/);
      const octs = m?.[1].split(".").map(Number);
      const bad = !m
        ? "enter an IPv4 address with a prefix, like 10.0.0.0/8"
        : octs.some((o) => o > 255)
          ? "each part of the address goes from 0 to 255"
          : +m[2] > 32
            ? "the prefix goes from /0 to /32"
            : "";
      err.textContent = bad;
      input.setAttribute("aria-invalid", String(!!bad));
      result.classList.toggle("stale", !!bad);
      if (bad) return;
      const c = +m[2];
      const ipNum =
        ((octs[0] << 24) | (octs[1] << 16) | (octs[2] << 8) | octs[3]) >>> 0;
      const mask = c === 0 ? 0 : (0xffffffff << (32 - c)) >>> 0;
      const network = (ipNum & mask) >>> 0;
      const broadcast = (network | (~mask >>> 0)) >>> 0;
      const hosts = c === 32 ? 1 : c === 31 ? 2 : broadcast - network - 1;
      const first = c >= 31 ? network : network + 1;
      const last = c >= 31 ? broadcast : broadcast - 1;
      range.textContent = `${toIp(network)}/${c}`;
      hostsEl.textContent = `${hosts.toLocaleString()} usable ${hosts === 1 ? "host" : "hosts"}`;
      for (const [i, b] of bits.entries()) b.classList.toggle("net", i < c);
      netLegend.textContent = `${c} network ${c === 1 ? "bit" : "bits"}`;
      hostLegend.textContent = `${32 - c} host ${32 - c === 1 ? "bit" : "bits"}`;
      list.replaceChildren(
        kvList(
          [
            ["network", toIp(network)],
            ["broadcast", toIp(broadcast)],
            ["netmask", toIp(mask)],
            ["wildcard", toIp(~mask >>> 0)],
            ["first host", toIp(first)],
            ["last host", toIp(last)],
          ].map(([l, v]) => [l, v, { mono: true, copy: true }]),
        ),
      );
    };
    input.oninput = run;
    run();
    return card(
      "subnet calculator",
      null,
      h("label", { class: "w-label col" }, "address and prefix", input),
      err,
      result,
    );
  },
});

reg({
  id: "sleep",
  match: (q) =>
    /^(?:sleep|bedtime)\s+calculator$|^when\s+should\s+i\s+(?:wake\s+up|sleep|go\s+to\s+bed)\??$/i.test(
      q.trim(),
    ),
  build: () => {
    let wakeMode = true;
    const seg = segmented(
      "sleep calculator mode",
      [
        ["wake", "wake-up time"],
        ["bed", "sleep now"],
      ],
      "wake",
      (v) => {
        wakeMode = v === "wake";
        run();
      },
    );
    const timeIn = h("input", {
      class: "w-input w-sleep-timein",
      type: "time",
      value: "07:00",
      required: true,
    });
    const timeWrap = h(
      "label",
      { class: "w-sleep-at" },
      h("span", null, "wake up at"),
      timeIn,
    );
    const hint = h("div", { class: "w-sleep-hint" });
    const fmt = (d) =>
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const cycles = [6, 5, 4];
    const times = cycles.map(() => h("span", { class: "w-sleep-time" }));
    const out = h(
      "div",
      { class: "w-sleep-list", role: "status", "aria-live": "polite" },
      ...cycles.map((c, i) =>
        h(
          "div",
          { class: "w-sleep-row" },
          times[i],
          h(
            "span",
            { class: "w-sleep-meta" },
            i === 0 && h("span", { class: "w-sleep-best" }, "recommended"),
            h(
              "span",
              { class: "w-sleep-len" },
              `${c * 1.5} hours, ${c} cycles`,
            ),
          ),
        ),
      ),
    );
    const run = () => {
      timeWrap.hidden = !wakeMode;
      const [hh, mm] = timeIn.value.split(":").map(Number);
      const ok = !wakeMode || (Number.isFinite(hh) && Number.isFinite(mm));
      out.hidden = !ok;
      if (!ok) {
        hint.textContent = "pick a wake-up time";
        return;
      }
      const base = (() => {
        if (!wakeMode) return Date.now();
        const wake = new Date();
        wake.setHours(hh, mm, 0, 0);
        if (wake <= new Date()) wake.setDate(wake.getDate() + 1);
        return wake.getTime();
      })();
      const dir = wakeMode ? -1 : 1;
      hint.textContent = wakeMode
        ? "fall asleep at one of these times"
        : "set an alarm for one of these times";
      cycles.forEach((c, i) => {
        numTick(times[i], fmt(new Date(base + dir * (c * 90 + 15) * 60000)));
      });
    };
    timeIn.oninput = run;
    run();
    return card(
      "sleep calculator",
      "90 minute cycles, plus 15 minutes to fall asleep",
      seg,
      timeWrap,
      h("div", { class: "w-sleep-results" }, hint, out),
    );
  },
});

const SWAP = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7H3M6 4l-3 3l3 3M3 17h18M18 14l3 3l-3 3"/></svg>`;

const langBase = (c) =>
  String(c || "")
    .split("-")[0]
    .toLowerCase();

const headLang = (str) => {
  const w = str.trim().split(" ");
  for (let n = Math.min(3, w.length); n >= 1; n--) {
    const code = codeForName(
      w
        .slice(0, n)
        .join(" ")
        .replace(/[:,]+$/, ""),
    );
    if (code)
      return {
        code,
        rest: w
          .slice(n)
          .join(" ")
          .replace(/^[:,]\s*/, ""),
      };
  }
  return null;
};

const tailLang = (str, seps) => {
  const w = str.trim().split(" ");
  for (let n = Math.min(3, w.length - 2); n >= 1; n--) {
    const code = codeForName(w.slice(-n).join(" "));
    if (code && seps.includes(w[w.length - n - 1]?.toLowerCase()))
      return { text: w.slice(0, -(n + 1)).join(" "), tl: code };
  }
  return null;
};

const parseTranslateQuery = (q) => {
  const t = q
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.]+$/, "");
  if (/^(?:google )?translat(?:e|or|ion)$/i.test(t)) return { text: "" };

  let m = t.match(/^how do (?:you|i|we) say (.+)$/i);
  if (m) return tailLang(m[1], ["in"]);

  m = t.match(/^([a-z]+(?: [a-z]+)?) (?:to|into) (.+)$/i);
  if (m) {
    const sl = codeForName(m[1]);
    if (sl) {
      const head = headLang(m[2]);
      if (head) return { sl, tl: head.code, text: head.rest };
    }
  }

  m = t.match(/^translate (.+)$/i);
  if (m) {
    const rest = m[1];
    const mm = rest.match(/^(?:from ([a-z]+(?: [a-z]+)?) )?(?:to|into) (.+)$/i);
    if (mm && (!mm[1] || codeForName(mm[1]))) {
      const head = headLang(mm[2]);
      if (head)
        return {
          sl: mm[1] ? codeForName(mm[1]) : "auto",
          tl: head.code,
          text: head.rest,
        };
    }
    return tailLang(rest, ["to", "into", "in"]) || { text: rest };
  }

  return tailLang(t, ["in"]);
};

const UPLOAD = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 9l5 -5l5 5"/><path d="M12 4v12"/></svg>`;

const CONV_CHECK = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10"/></svg>`;

reg({
  id: "convert",
  match: parseConvertQuery,
  build: ({ from, to }) => {
    let file = null;
    let want = to;
    let busy = false;
    let outUrl = null;
    let srcUrl = null;

    const tile = (f, url) =>
      url
        ? h("img", { class: "w-conv-thumb", src: url, alt: "" })
        : h("span", { class: "w-conv-tile" }, extOf(f.name).slice(0, 4) || "?");

    const picker = h("input", {
      type: "file",
      class: "w-drop-input",
      "aria-label": "choose a file to convert",
    });
    const drop = h("label", { class: "w-drop" }, picker);

    const toSel = h("select", {
      class: "w-select w-conv-sel",
      "aria-label": "output format",
    });
    const go = h("button", { class: "w-btn", type: "button" }, "convert");
    const row = h(
      "div",
      { class: "w-conv-row" },
      h("label", { class: "w-conv-to" }, h("span", null, "convert to"), toSel),
      go,
    );
    const bar = h("i");
    const barWrap = h(
      "div",
      {
        class: "w-conv-bar",
        role: "progressbar",
        "aria-label": "conversion progress",
      },
      bar,
    );
    const status = h("div", { class: "w-conv-status", role: "status" });
    const result = h("div", { class: "w-conv-result" });

    const renderDrop = () => {
      drop.classList.toggle("has", Boolean(file));
      if (!file) {
        drop.replaceChildren(
          picker,
          h("span", { class: "w-drop-icon", html: UPLOAD }),
          h(
            "span",
            { class: "w-drop-text" },
            from ? `drop a .${from} file, or ` : "drop a file, or ",
            h("span", { class: "w-drop-link" }, "browse"),
          ),
          h("span", { class: "w-drop-hint" }, "images, audio and video"),
        );
        return;
      }
      const ok = Boolean(kindOf(extOf(file.name)));
      drop.classList.toggle("bad", !ok);
      drop.replaceChildren(
        picker,
        tile(file, srcUrl),
        h(
          "span",
          { class: "w-drop-file" },
          h("span", { class: "w-drop-name", title: file.name }, file.name),
          h(
            "span",
            { class: "w-drop-meta" },
            ok
              ? `${humanSize(file.size)}${file.size > 100 * 1024 * 1024 ? ", this may take a while" : ""}`
              : `can't convert .${extOf(file.name)} files`,
          ),
        ),
        h("span", { class: "w-drop-change" }, "replace"),
      );
    };

    const fill = () => {
      const src = file ? extOf(file.name) : from;
      const targets = src && kindOf(src) ? targetsFor(src) : [];
      toSel.replaceChildren(
        ...targets.map((t) => h("option", { value: t }, `.${t}`)),
      );
      if (targets.length) {
        toSel.value = targets.includes(want) ? want : targets[0];
        want = toSel.value;
      }
      row.hidden = !targets.length;
      toSel.disabled = busy;
      const ready = Boolean(file) && targets.length > 0;
      go.disabled = busy || !ready;
      go.classList.toggle("primary", ready && !busy && !result.firstChild);
    };

    const setFile = (f) => {
      if (!f || busy) return;
      file = f;
      if (srcUrl) URL.revokeObjectURL(srcUrl);
      srcUrl =
        kindOf(extOf(f.name)) === "image" && f.size < 40 * 1024 * 1024
          ? URL.createObjectURL(f)
          : null;
      status.textContent = "";
      status.classList.remove("err");
      result.replaceChildren();
      renderDrop();
      fill();
    };

    picker.onchange = () => {
      setFile(picker.files[0]);
      picker.value = "";
    };
    drop.ondragover = (e) => {
      e.preventDefault();
      drop.classList.add("over");
    };
    drop.ondragleave = (e) => {
      if (drop.contains(e.relatedTarget)) return;
      drop.classList.remove("over");
    };
    drop.ondrop = (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      setFile(e.dataTransfer.files[0]);
    };
    toSel.onchange = () => {
      want = toSel.value;
      if (!result.firstChild) return;
      result.replaceChildren();
      fill();
    };

    go.onclick = async () => {
      if (busy || !file) return;
      busy = true;
      result.replaceChildren();
      status.classList.remove("err");
      status.textContent = "starting";
      bar.style.setProperty("--p", "0");
      barWrap.classList.add("on", "indet");
      fill();
      const target = toSel.value;
      let phase = "";

      try {
        const blob = await convertFile(file, target, {
          onStatus: (s) => {
            phase = s;
            status.textContent = s;
          },
          onProgress: (p) => {
            const v = Math.min(1, Math.max(0, p));
            barWrap.classList.remove("indet");
            bar.style.setProperty("--p", String(v));
            status.textContent = `${phase || "converting"}, ${Math.round(v * 100)}%`;
          },
        });
        const name = `${file.name.replace(/\.[^.]+$/, "")}.${outExtFor(target)}`;
        if (outUrl) URL.revokeObjectURL(outUrl);
        outUrl = URL.createObjectURL(blob);
        status.textContent = "";
        const dl = h(
          "a",
          { class: "w-btn primary", href: outUrl, download: name },
          "download",
        );
        result.append(
          kindOf(target) === "image"
            ? h("img", { class: "w-conv-thumb", src: outUrl, alt: "" })
            : h("span", { class: "w-conv-check", html: CONV_CHECK }),
          h(
            "div",
            { class: "w-conv-meta" },
            h("div", { class: "w-conv-name", title: name }, name),
            h("div", { class: "w-conv-size" }, humanSize(blob.size)),
          ),
          dl,
        );
        dl.click();
      } catch (e) {
        status.textContent = String(e?.message || e).slice(0, 200);
        status.classList.add("err");
      } finally {
        busy = false;
        barWrap.classList.remove("on", "indet");
        fill();
      }
    };

    renderDrop();
    fill();

    return card(
      "file converter",
      "converted on your device, nothing is uploaded",
      h("div", { class: "w-conv" }, drop, row, barWrap, status, result),
    );
  },
});

const CLEAR = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

const CHEVRON_DOWN = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>`;

reg({
  id: "currency",
  match: parseCurrencyQuery,
  build: ({ amount, from, to }) => {
    const fmt = (n, dp) =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      }).format(n);
    const fmtAmt = (n) => {
      const abs = Math.abs(n);
      return fmt(n, abs >= 1 || n === 0 ? 2 : abs >= 0.01 ? 4 : 6);
    };
    const fmtRate = (n) =>
      new Intl.NumberFormat("en-US", {
        maximumSignificantDigits: 6,
        maximumFractionDigits: n >= 1 ? 4 : 8,
      }).format(n);
    const parse = (s) => {
      const t = s.replace(/[,\s]/g, "");
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
    };

    const side = (name, code) => {
      const input = h("input", {
        class: "w-cur-amt",
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": `${name} amount`,
      });
      const sel = h(
        "select",
        { class: "w-cur-sel", "aria-label": `${name} currency`, disabled: "" },
        h("option", { value: code }, currencyLabel(code)),
      );
      const label = h("span", { class: "w-cur-code" }, code);
      const row = h(
        "div",
        { class: "w-cur-row" },
        input,
        h(
          "span",
          { class: "w-cur-pick" },
          label,
          h("span", { class: "w-cur-chev", html: CHEVRON_DOWN }),
          sel,
        ),
      );
      return { input, sel, row, code: label };
    };

    const a = side("from", from);
    const b = side("to", to);
    a.input.value = String(amount);
    b.row.classList.add("wait");
    b.row.prepend(h("span", { class: "w-cur-skel", "aria-hidden": "true" }));

    const swap = h("button", {
      class: "w-cur-swap",
      type: "button",
      title: "swap currencies",
      "aria-label": "swap currencies",
      disabled: "",
      html: SWAP,
    });
    const rateLine = h("div", { class: "w-cur-rate" });
    const msg = h("div", { class: "w-cur-msg", role: "status" });
    const retry = h(
      "button",
      { class: "w-cur-retry", type: "button" },
      "try again",
    );
    const fail = h(
      "div",
      { class: "w-cur-fail", role: "alert", hidden: "" },
      h("span", null, "couldn't load exchange rates"),
      retry,
    );

    let rates = null;
    let anchor = "a";

    const recompute = (flash = false) => {
      if (!rates) return;
      const [src, dst] = anchor === "a" ? [a, b] : [b, a];
      const f = a.sel.value;
      const t = b.sel.value;
      const rate = rates[t] / rates[f];
      a.code.textContent = f;
      b.code.textContent = t;
      a.sel.title = currencyLabel(f);
      b.sel.title = currencyLabel(t);
      rateLine.textContent = `1 ${f} = ${fmtRate(rate)} ${t}`;
      const n = parse(src.input.value);
      const bad = Number.isNaN(n);
      src.row.classList.toggle("bad", bad);
      dst.row.classList.remove("bad");
      if (bad) src.input.setAttribute("aria-invalid", "true");
      else src.input.removeAttribute("aria-invalid");
      dst.input.removeAttribute("aria-invalid");
      msg.textContent = bad ? "enter a number, like 12.50" : "";
      dst.input.value =
        n == null || bad ? "" : fmtAmt(anchor === "a" ? n * rate : n / rate);
      if (!flash || calmMotion()) return;
      dst.input.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: 180,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    };

    a.input.oninput = () => {
      anchor = "a";
      recompute();
    };
    b.input.oninput = () => {
      anchor = "b";
      recompute();
    };
    a.sel.onchange = b.sel.onchange = () => recompute(true);

    let turns = 0;
    swap.onclick = () => {
      if (!rates) return;
      const f = a.sel.value;
      a.sel.value = b.sel.value;
      b.sel.value = f;
      if (anchor === "b") {
        a.input.value = b.input.value;
        anchor = "a";
      }
      turns += 1;
      swap.style.setProperty("--turn", `${turns * 180}deg`);
      recompute(true);
    };

    const section = card(
      "currency converter",
      "live mid-market rates",
      h(
        "div",
        { class: "w-cur-box" },
        h("div", { class: "w-cur-grid" }, a.row, swap, b.row),
      ),
      msg,
      rateLine,
      fail,
    );
    const sub = section.querySelector(".w-sub");

    const load = () => {
      fail.hidden = true;
      rateLine.hidden = false;
      b.row.classList.add("wait");
      fetch("/fx/USD")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => {
          if (!data?.rates?.USD) throw new Error("no rates");
          rates = data.rates;
          const codes = sortCodes(Object.keys(rates));
          for (const [s, want, fallback] of [
            [a, from, "USD"],
            [b, to, "EUR"],
          ]) {
            s.sel.replaceChildren(
              ...codes.map((c) => h("option", { value: c }, currencyLabel(c))),
            );
            s.sel.value = rates[want] ? want : fallback;
            s.sel.disabled = false;
          }
          swap.disabled = false;
          b.row.classList.remove("wait");
          if (data.updated && sub)
            sub.textContent = `mid-market rates, updated ${new Date(
              data.updated * 1000,
            ).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}`;
          recompute();
        })
        .catch(() => {
          b.row.classList.remove("wait");
          rateLine.hidden = true;
          fail.hidden = false;
        });
    };
    retry.onclick = load;
    load();

    return section;
  },
});

reg({
  id: "translate",
  match: parseTranslateQuery,
  build: ({ text = "", sl = "auto", tl = null }) => {
    const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
    const src = h(
      "textarea",
      {
        class: "w-tr-src",
        dir: "auto",
        rows: "1",
        maxlength: "5000",
        placeholder: "type to translate",
        "aria-label": "text to translate",
      },
      text,
    );
    const mirror = h("span", { class: "w-tr-mirror", "aria-hidden": "true" });
    const out = h("div", { class: "w-tr-out", "aria-live": "polite" });
    const srcTl = h("p", { class: "w-tr-reading", dir: "auto" });
    const outTl = h("p", { class: "w-tr-reading", dir: "auto" });
    const dym = h("p", { class: "w-tr-dym" });
    const alts = h("div", { class: "w-tr-alts" });
    const dict = h("div", { class: "w-tr-dict" });
    const foot = h("div", { class: "w-tr-foot" }, alts, dict);

    let outValue = "";
    const syncFoot = () => {
      foot.hidden = !alts.childElementCount && !dict.childElementCount;
    };
    const setOut = (value, cls = "") => {
      out.classList.remove("pending");
      out.removeAttribute("aria-busy");
      outValue = cls ? "" : value || "";
      const next = h(
        "p",
        {
          class: `w-tr-text${cls ? ` ${cls}` : ""}`,
          dir: "auto",
          lang: cls ? null : tlP.value,
        },
        value || "translation",
      );
      if (!value) next.classList.add("ph");
      const prev = [...out.children].filter((c) => !c.dataset.leaving);
      out.append(next);
      for (const p of prev) {
        if (calmMotion() || !p.isConnected) {
          p.remove();
          continue;
        }
        p.dataset.leaving = "1";
        p.animate(
          [
            { opacity: 1, filter: "blur(0)" },
            { opacity: 0, filter: "blur(4px)" },
          ],
          { duration: 150, easing: EASE, fill: "forwards" },
        ).finished.then(
          () => p.remove(),
          () => p.remove(),
        );
      }
      if (prev.length && !calmMotion())
        next.animate(
          [
            { opacity: 0, filter: "blur(4px)" },
            { opacity: 1, filter: "blur(0)" },
          ],
          { duration: 300, easing: EASE },
        );
      return next;
    };
    const setLoading = () => {
      out.setAttribute("aria-busy", "true");
      out.classList.add("pending");
    };
    const syncSrc = () => {
      mirror.textContent = `${src.value} `;
      clear.hidden = !src.value;
    };
    const clearExtras = () => {
      srcTl.textContent = "";
      outTl.textContent = "";
      alts.replaceChildren();
      dym.replaceChildren();
      dict.replaceChildren();
      syncFoot();
    };

    const slP = makeLangPicker({
      value: sl || "auto",
      detect: true,
      onChange: () => go(0),
    });
    const tlP = makeLangPicker({
      value: tl || browserTargetLang(),
      onChange: () => go(0),
    });

    const swap = h("button", {
      class: "w-tr-swap",
      type: "button",
      "aria-label": "swap languages",
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="w-tr-swap-a"><path d="M3 7h18M6 10 3 7l3-3"/></g><g class="w-tr-swap-b"><path d="M21 17H3M18 20l3-3-3-3"/></g></svg>`,
    });
    const syncSwap = () => {
      swap.disabled = slP.value === "auto" && !slP.detected;
    };

    let ctrl, timer;
    let flipped = false;

    const single = (s) =>
      /^\p{L}[\p{L}'’-]*$/u.test(s.trim()) && s.trim().length <= 30;

    const renderDict = async (word) => {
      try {
        const res = await fetch(`/dict/${encodeURIComponent(word)}`);
        if (!res.ok) return;
        const entries = await res.json();
        const e0 = entries?.[0];
        if (!e0?.meanings?.length || !dict.isConnected) return;
        dict.replaceChildren(
          h(
            "div",
            { class: "w-tr-dict-head" },
            h("span", { class: "w-tr-dict-word" }, e0.word),
            e0.phonetic && h("span", { class: "w-tr-dict-ipa" }, e0.phonetic),
          ),
          ...e0.meanings
            .slice(0, 2)
            .map((m) =>
              h(
                "p",
                { class: "w-tr-dict-meaning" },
                h("span", { class: "w-tr-dict-pos" }, m.partOfSpeech),
                m.definitions?.[0]?.definition || "",
              ),
            ),
        );
        syncFoot();
      } catch {}
    };

    const renderExtras = (data) => {
      outTl.textContent = data.transliteration || "";
      srcTl.textContent = data.srcTransliteration || "";
      alts.replaceChildren();
      if (data.alternatives?.length)
        alts.append(
          h("span", { class: "w-tr-alts-label" }, "alternatives"),
          ...data.alternatives.map((a) =>
            h(
              "button",
              {
                class: "w-tr-alt",
                type: "button",
                dir: "auto",
                onclick: () => {
                  setOut(a);
                  outTl.textContent = "";
                },
              },
              a,
            ),
          ),
        );
      dym.replaceChildren();
      if (data.didYouMean)
        dym.append(
          "did you mean ",
          h(
            "button",
            {
              class: "w-tr-dym-btn",
              type: "button",
              onclick: () => {
                src.value = data.didYouMean;
                syncSrc();
                run();
              },
            },
            data.didYouMean,
          ),
        );
      syncFoot();
    };

    const run = async () => {
      ctrl?.abort();
      const value = src.value.trim();
      clearExtras();

      if (!value) {
        setOut(null);
        slP.setDetected(null);
        syncSwap();
        return;
      }
      ctrl = new AbortController();
      setLoading();
      try {
        const data = await requestTranslation(
          {
            text: value,
            targetLang: tlP.value,
            ...(slP.value !== "auto" && { sourceLang: slP.value }),
          },
          ctrl.signal,
        );
        const det = data.detectedLang;
        if (
          !flipped &&
          !tl &&
          slP.value === "auto" &&
          det &&
          langBase(langByCode(det)?.code) === langBase(tlP.value)
        ) {
          const alt =
            langBase(browserTargetLang()) !== langBase(det)
              ? browserTargetLang()
              : langBase(det) !== "en"
                ? "en"
                : null;
          if (alt) {
            flipped = true;
            tlP.value = alt;
            run();
            return;
          }
        }
        if (data.translatedText !== outValue) setOut(data.translatedText);
        else out.classList.remove("pending");
        out.removeAttribute("aria-busy");
        if (slP.value === "auto") slP.setDetected(det);
        syncSwap();

        renderExtras(data);
        let word = null;
        if (langBase(tlP.value) === "en" && single(data.translatedText))
          word = data.translatedText;
        else if (
          langBase(slP.value === "auto" ? det : slP.value) === "en" &&
          single(value)
        )
          word = value;
        if (word) renderDict(word.toLowerCase());
      } catch (e) {
        if (e.name === "AbortError") return;
        setOut(e.message || "translation failed", "err").append(
          h(
            "button",
            { class: "w-tr-retry", type: "button", onclick: () => run() },
            "try again",
          ),
        );
      }
    };

    const go = (delay = 600) => {
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    };

    src.oninput = () => {
      syncSrc();
      go();
    };

    const bodies = [];
    let turns = 0;
    swap.onclick = () => {
      const from = slP.value === "auto" ? slP.detected : slP.value;
      if (!from) return;
      const to = tlP.value;
      const moved = outValue;
      slP.value = to;
      tlP.value = from;
      if (moved) src.value = moved.slice(0, 5000);
      turns += 1;
      swap.classList.toggle("swapped", turns % 2 === 1);
      syncSrc();
      if (!calmMotion())
        for (const [i, b] of bodies.entries())
          b.animate(
            [
              {
                translate: `${i ? -8 : 8}px 0`,
                opacity: 0,
                filter: "blur(3px)",
              },
              { translate: "0 0", opacity: 1, filter: "blur(0)" },
            ],
            { duration: 250, easing: EASE },
          );
      run();
    };

    const clear = h("button", {
      class: "w-copy w-tr-act",
      type: "button",
      "aria-label": "clear text",
      html: CLEAR,
    });
    clear.onclick = () => {
      src.value = "";
      syncSrc();
      src.focus();
      run();
    };

    const srcSpeak = speakButton(
      () => src.value,
      () => (slP.value === "auto" ? slP.detected : slP.value),
      "w-copy w-tr-act",
    );
    const outSpeak = speakButton(
      () => outValue,
      () => tlP.value,
      "w-copy w-tr-act",
    );
    const outCopy = copyBtn(() => outValue);
    outCopy.classList.add("w-tr-act");

    const srcBody = h(
      "div",
      { class: "w-tr-body" },
      h("div", { class: "w-tr-field" }, mirror, src),
      srcTl,
      dym,
    );
    const outBody = h("div", { class: "w-tr-body" }, out, outTl);
    bodies.push(srcBody, outBody);

    const grid = h(
      "div",
      { class: "w-tr-grid" },
      h(
        "section",
        { class: "w-tr-pane" },
        h(
          "div",
          { class: "w-tr-pane-head" },
          slP.el,
          h("div", { class: "w-tr-acts" }, srcSpeak, clear),
        ),
        srcBody,
      ),
      h(
        "section",
        { class: "w-tr-pane out" },
        h(
          "div",
          { class: "w-tr-pane-head" },
          tlP.el,
          h("div", { class: "w-tr-acts" }, outSpeak, outCopy),
        ),
        outBody,
        swap,
      ),
    );

    const shell = h("div", { class: "w-tr-shell" }, grid, foot);
    new ResizeObserver(() => {
      shell.style.height = `${grid.offsetHeight + (foot.hidden ? 0 : foot.offsetHeight)}px`;
    }).observe(grid);
    new ResizeObserver(() => {
      shell.style.height = `${grid.offsetHeight + (foot.hidden ? 0 : foot.offsetHeight)}px`;
    }).observe(foot);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => shell.classList.add("settled")),
    );

    setOut(null);
    syncSrc();
    syncSwap();
    syncFoot();

    if (text) run();

    return h("section", { class: "rich-result w w-tr-card" }, shell);
  },
});

const WX_TYPOS = new Set([
  "whether",
  "wether",
  "wheather",
  "wheater",
  "weahter",
  "weater",
  "wather",
  "weathr",
  "wetaher",
  "weaher",
  "weatehr",
  "waether",
  "temprature",
  "tempature",
  "temperture",
  "temperatur",
  "tempreture",
  "temparature",
  "temperatue",
  "forcast",
  "forecst",
  "foercast",
  "forecaste",
]);
const WX_KEY = /^(?:weather|temperature|temp|forecast)$/;
const WX_WHEN =
  /^(?:(?:right\s+)?now|today|tonight|tomorrow|here|outside|near\s+me|this\s+week|(?:weather\s+)?forecast|(?:for\s+)?(?:the\s+)?week)$/;
const WX_NOT =
  /\b(?:channel|underground|app|apps|radar|api|map|maps|report|network|station|girl|girls|man|lyrics|song|meaning|definition|vs|or|not|icon|icons|emoji|widget|gov|com|news|alert|alerts)\b/;

const wxWord = (w) => WX_KEY.test(w) || WX_TYPOS.has(w);

const parseWeatherQuery = (raw) => {
  const q = raw
    .toLowerCase()
    .replace(/[?!.,']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (q.length > 60 || WX_NOT.test(q)) return null;
  if (/^how (?:hot|cold|warm) is it(?: (?:outside|today|now))?$/.test(q))
    return { place: "" };
  const m = q.match(
    /^(?:(?:whats|what is|hows|how is)\s+)?(?:the\s+)?(?:current\s+|local\s+)?(\S+)(?:\s+(.*))?$/,
  );
  if (m && wxWord(m[1])) {
    const rest = (m[2] || "").trim();
    if (!rest || WX_WHEN.test(rest)) return { place: "" };
    const at = rest.match(/^(?:in|for|at)\s+(.+)$/);
    const place = (at ? at[1] : rest)
      .replace(/\s+(?:today|tonight|tomorrow|now|forecast)$/, "")
      .trim();
    if (!place || place.split(" ").length > 4) return null;
    return { place };
  }
  const tail = q.match(
    /^(.+?)\s+(\S+)(?:\s+(?:today|tonight|tomorrow|now|forecast))?$/,
  );
  if (tail && wxWord(tail[2]) && tail[1].split(" ").length <= 4)
    return { place: tail[1].replace(/^(?:the|in)\s+/, "") };
  return null;
};

reg({
  id: "weather",
  match: parseWeatherQuery,
  build: ({ place }) => {
    if (document.querySelector(".rich-weather")) return null;
    const section = h("section", {
      class: "rich-result rich-weather",
      "aria-busy": "true",
    });
    const geo = place ? `/geo?q=${encodeURIComponent(place)}` : "/geo";
    fetch(geo)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(async (location) => {
        const { fillWeather } = await import("/s/weather.js");
        await fillWeather(section, { location });
      })
      .catch(() => section.remove())
      .finally(() => section.removeAttribute("aria-busy"));
    return section;
  },
});

const typoDistance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = max + 1;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
};

const TYPO_BLOCK = new Set([
  "heather",
  "leather",
  "feather",
  "times",
  "timed",
  "counted",
  "colors",
]);
let triggerWords;
const correctTypos = (q) => {
  triggerWords ??= new Set(
    widgets.flatMap((w) =>
      (String(w.match).match(/\/\^[^\n]*?\/[gimsuy]*/g) || []).flatMap(
        (re) => re.toLowerCase().match(/[a-z]{5,}/g) || [],
      ),
    ),
  );
  const tokens = q.toLowerCase().split(/\s+/);
  if (tokens.length > 6) return null;
  let changed = false;
  const fixed = tokens.map((t) => {
    if (
      t.length < 5 ||
      triggerWords.has(t) ||
      TYPO_BLOCK.has(t) ||
      !/^[a-z]+$/.test(t)
    )
      return t;
    const max = t.length >= 8 ? 2 : 1;
    let best = null;
    let bestD = max + 1;
    for (const word of triggerWords) {
      const dist = typoDistance(t, word, max);
      if (dist < bestD) {
        best = word;
        bestD = dist;
      } else if (dist === bestD) best = null;
    }
    if (!best || bestD > max) return t;
    changed = true;
    return best;
  });
  return changed ? fixed.join(" ") : null;
};

const tryWidgets = (q) => {
  for (const w of widgets) {
    let params;
    try {
      params = w.match(q);
    } catch {
      continue;
    }
    if (!params) continue;
    let el;
    try {
      el = w.build(params, q);
    } catch (e) {
      console.error("widget", w.id, e);
      continue;
    }
    if (el) {
      const frag = document.createDocumentFragment();
      frag.append(el);
      return frag;
    }
  }
  return null;
};

export function renderLocalWidgets(query) {
  const q = query?.trim();
  if (!q || q.length > 600) return null;
  const hit = tryWidgets(q);
  if (hit) return hit;
  const fixed = correctTypos(q);
  return fixed ? tryWidgets(fixed) : null;
}

export const __widgetCount = widgets.length;
