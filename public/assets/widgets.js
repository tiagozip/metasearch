import {
  currencyLabel,
  parseCurrencyQuery,
  sortCodes,
} from "./currency.js";
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
  const b = h("button", { class: "w-copy", title, html: COPY });
  b.onclick = () => {
    navigator.clipboard?.writeText(getText());
    b.innerHTML = CHECK;
    b.classList.add("done");
    setTimeout(() => {
      b.innerHTML = COPY;
      b.classList.remove("done");
    }, 1400);
  };
  return b;
};

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

// ─── generators ──────────────────────────────────────────────────────────────

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
    const input = h("input", {
      class: "w-input",
      placeholder: "text or url to encode",
      value: text,
    });
    const canvas = h("canvas", { class: "w-qr-canvas" });
    const dl = h("button", { class: "w-btn", html: "download png" });
    const wrap = h("div", { class: "w-qr-wrap" }, canvas);
    const draw = async () => {
      const t = input.value || "https://search.tiago.zip";
      if (!window.qrcode) await loadScript("/s/qrcode.js");
      const qr = window.qrcode(0, "M");
      qr.addData(t);
      qr.make();
      const n = qr.getModuleCount();
      const scale = 8,
        pad = 4,
        size = (n + pad * 2) * scale;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#cdd6f4";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#1e1e2e";
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (qr.isDark(r, c))
            ctx.fillRect((c + pad) * scale, (r + pad) * scale, scale, scale);
    };
    let t;
    input.oninput = () => {
      clearTimeout(t);
      t = setTimeout(draw, 150);
    };
    dl.onclick = () => {
      const a = h("a", {
        href: canvas.toDataURL("image/png"),
        download: "qrcode.png",
      });
      document.body.append(a);
      a.click();
      a.remove();
    };
    draw();
    return card(
      "qr code",
      "encode any text or link",
      input,
      wrap,
      h(
        "div",
        { class: "w-btn-row" },
        dl,
        copyBtn(() => input.value || "https://search.tiago.zip", "copy text"),
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
    const out = h("div", { class: "w-mono w-big w-pw-out" });
    const lenLabel = h("span", { class: "w-range-val" }, "16");
    const len = h("input", {
      class: "w-range",
      type: "range",
      min: "4",
      max: "64",
      value: "16",
    });
    const opts = {
      lower: h("input", { type: "checkbox", checked: "" }),
      upper: h("input", { type: "checkbox", checked: "" }),
      digits: h("input", { type: "checkbox", checked: "" }),
      symbols: h("input", { type: "checkbox", checked: "" }),
      "no ambiguous": h("input", { type: "checkbox" }),
    };
    const sets = {
      lower: "abcdefghijklmnopqrstuvwxyz",
      upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      digits: "0123456789",
      symbols: "!@#$%^&*()-_=+[]{};:,.<>?",
    };
    const ambiguous = /[Il1O0o]/g;
    const strengthBar = h("div", { class: "w-strength-bar" });
    const strengthLabel = h("span", { class: "w-strength-label" });
    const gen = () => {
      let pool = "";
      for (const k of ["lower", "upper", "digits", "symbols"])
        if (opts[k].checked) pool += sets[k];
      if (!pool) pool = sets.lower;
      if (opts["no ambiguous"].checked) pool = pool.replace(ambiguous, "");
      const n = +len.value;
      const arr = new Uint32Array(n);
      crypto.getRandomValues(arr);
      out.textContent = [...arr].map((x) => pool[x % pool.length]).join("");
      const bits = Math.round(n * Math.log2(pool.length));
      const pct = Math.min(100, (bits / 128) * 100);
      strengthBar.style.width = `${pct}%`;
      const [color, word] =
        bits < 50
          ? ["#f38ba8", "weak"]
          : bits < 90
            ? ["#f9e2af", "good"]
            : ["#a6e3a1", "strong"];
      strengthBar.style.background = color;
      strengthLabel.textContent = `${word} · ${bits} bits`;
      strengthLabel.style.color = color;
    };
    len.oninput = () => {
      lenLabel.textContent = len.value;
      gen();
    };
    for (const k in opts) opts[k].onchange = gen;
    const copy = copyBtn(() => out.textContent);
    const regen = h("button", {
      class: "w-btn primary",
      html: "regenerate",
      onclick: gen,
    });
    gen();
    return card(
      "password generator",
      "cryptographically random, generated in your browser",
      h("div", { class: "w-pw-row" }, out, copy),
      h("div", { class: "w-strength" }, strengthBar),
      h("div", { class: "w-strength-row" }, strengthLabel),
      h("label", { class: "w-label" }, "length: ", lenLabel, len),
      h(
        "div",
        { class: "w-chips" },
        ...Object.keys(opts).map((k) =>
          h("label", { class: "w-chk" }, opts[k], k),
        ),
      ),
      h("div", { class: "w-btn-row" }, regen),
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
    const make = (n = 5) => {
      list.replaceChildren();
      for (let i = 0; i < n; i++) {
        const u = crypto.randomUUID();
        list.append(
          h(
            "div",
            { class: "w-uuid-row" },
            h("span", { class: "w-mono" }, u),
            copyBtn(() => u),
          ),
        );
      }
    };
    make();
    return card(
      "uuid generator",
      "version 4, random",
      list,
      h(
        "div",
        { class: "w-btn-row" },
        h("button", {
          class: "w-btn primary",
          html: "generate more",
          onclick: () => make(),
        }),
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
      return `${s[0][0].toUpperCase() + s[0].slice(1)} ${s.slice(1).join(" ")}.`;
    };
    const para = () => Array.from({ length: rand(3, 6) }, sentence).join(" ");
    const out = h("div", { class: "w-lorem-out" });
    const countLabel = h("span", { class: "w-range-val" }, "3");
    const count = h("input", {
      class: "w-range",
      type: "range",
      min: "1",
      max: "10",
      value: "3",
    });
    const gen = () =>
      out.replaceChildren(
        ...Array.from({ length: +count.value }, () => h("p", null, para())),
      );
    count.oninput = () => {
      countLabel.textContent = count.value;
      gen();
    };
    gen();
    return card(
      "lorem ipsum",
      "placeholder text",
      h("label", { class: "w-label" }, "paragraphs: ", countLabel, count),
      out,
      h(
        "div",
        { class: "w-btn-row" },
        copyBtn(
          () => [...out.children].map((p) => p.textContent).join("\n\n"),
          "copy text",
        ),
        h("button", { class: "w-btn", html: "shuffle", onclick: gen }),
      ),
    );
  },
});

// ─── easter eggs ─────────────────────────────────────────────────────────────

reg({
  id: "not-furry",
  match: (q) => {
    const t = q.toLowerCase();
    return t.includes("tiago") && t.includes("furry") ? {} : null;
  },
  build: () => {
    const img = h("img", {
      class: "w-notfurry-img",
      src: "https://tiago.zip/assets/img/not-furry.png",
      alt: "",
      loading: "lazy",
    });
    return card(
      null,
      null,
      h(
        "div",
        { class: "w-notfurry" },
        img,
        h(
          "div",
          { class: "w-notfurry-text" },
          "Tiago is ",
          h("b", null, "not"),
          " a furry",
        ),
      ),
    );
  },
});

// ─── random / chance ─────────────────────────────────────────────────────────

reg({
  id: "coin",
  match: (q) =>
    /^(?:flip\s+a\s+coin|coin\s*flip|coin\s*toss|heads\s+or\s+tails|toss\s+a\s+coin)$/i.test(
      q.trim(),
    ),
  build: () => {
    const CROWN = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.6l3.2 4.9l4.4 -3.4l-1.7 9.1a1 1 0 0 1 -1 .8h-9.8a1 1 0 0 1 -1 -.8l-1.7 -9.1l4.4 3.4z"/><rect x="5.4" y="17.4" width="13.2" height="2.2" rx="1.1"/></svg>`;
    const STAR = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2l2.7 5.6l6.1 .9l-4.4 4.3l1 6.1l-5.4 -2.9l-5.4 2.9l1 -6.1l-4.4 -4.3l6.1 -.9z"/></svg>`;

    const mkFace = (cls, icon, text) =>
      h(
        "div",
        { class: `w-coin-face ${cls}` },
        h("div", { class: "w-coin-icon", html: icon }),
        h("div", { class: "w-coin-text" }, text),
      );

    const inner = h(
      "div",
      { class: "w-coin3d-inner" },
      mkFace("heads", CROWN, "heads"),
      mkFace("tails", STAR, "tails"),
    );
    const toss = h("div", { class: "w-coin3d-toss" }, inner);
    const stage = h("div", { class: "w-coin3d" }, toss);
    const label = h("div", { class: "w-coin-label" }, "flipping…");
    const tally = h("div", { class: "w-coin-tally" });

    let rotation = 0;
    let heads = 0;
    let tails = 0;
    let flipping = false;

    const drawTally = () =>
      tally.replaceChildren(
        h("span", null, `${heads} heads`),
        h("span", { class: "w-coin-dot" }),
        h("span", null, `${tails} tails`),
      );

    const flip = () => {
      if (flipping) return;
      flipping = true;
      label.textContent = "flipping…";
      label.className = "w-coin-label";

      const result = Math.random() < 0.5 ? "heads" : "tails";
      const base = rotation + 5 * 360;
      const want = result === "heads" ? 0 : 180;
      let target = base - (base % 360) + want;
      if (target < base) target += 360;
      rotation = target;

      inner.style.transform = `rotateX(${rotation}deg)`;
      toss.classList.remove("tossing");
      void toss.offsetWidth;
      toss.classList.add("tossing");

      setTimeout(() => {
        if (result === "heads") heads++;
        else tails++;
        label.textContent = result;
        label.className = `w-coin-label ${result}`;
        drawTally();
        flipping = false;
      }, 1150);
    };

    stage.onclick = flip;
    drawTally();
    setTimeout(flip, 350);

    return card(
      "coin flip",
      null,
      stage,
      label,
      tally,
      h(
        "div",
        { class: "w-btn-row" },
        h("button", { class: "w-btn primary", html: "flip again", onclick: flip }),
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
    const dice = h("div", { class: "w-dice-row" });
    const total = h("div", { class: "w-dice-total" });
    const roll = () => {
      dice.replaceChildren();
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const v = 1 + Math.floor(Math.random() * sides);
        sum += v;
        const d = h("div", { class: "w-die" }, v);
        d.style.animationDelay = `${i * 60}ms`;
        dice.append(d);
      }
      total.textContent = n > 1 ? `total: ${sum}` : "";
    };
    roll();
    return card(
      `dice · ${n}d${sides}`,
      capped ? "capped at 20 dice" : null,
      dice,
      total,
      h(
        "div",
        { class: "w-btn-row" },
        h("button", { class: "w-btn primary", html: "roll", onclick: roll }),
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
    const loIn = h("input", {
      class: "w-input w-num",
      type: "number",
      value: lo,
    });
    const hiIn = h("input", {
      class: "w-input w-num",
      type: "number",
      value: hi,
    });
    const out = h("div", { class: "w-big w-mono w-rng-out" }, "—");
    const pick = () => {
      const a = Math.ceil(+loIn.value),
        b = Math.floor(+hiIn.value);
      out.textContent =
        a > b ? "—" : a + Math.floor(Math.random() * (b - a + 1));
    };
    const onEnter = (e) => {
      if (e.key === "Enter") pick();
    };
    loIn.onkeydown = hiIn.onkeydown = onEnter;
    pick();
    return card(
      "random number",
      null,
      h(
        "div",
        { class: "w-row" },
        loIn,
        h("span", { class: "w-mid" }, "to"),
        hiIn,
      ),
      h(
        "div",
        { class: "w-out-row w-center-row" },
        out,
        copyBtn(() => out.textContent),
      ),
      h(
        "div",
        { class: "w-btn-row" },
        h("button", {
          class: "w-btn primary",
          html: "generate",
          onclick: pick,
        }),
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
    const ball = h(
      "div",
      { class: "w-8ball" },
      h("div", { class: "w-8ball-window" }, "8"),
    );
    const ask = () => {
      ball.firstChild.textContent = "…";
      ball.classList.add("shake");
      setTimeout(() => {
        ball.classList.remove("shake");
        ball.firstChild.textContent =
          ans[Math.floor(Math.random() * ans.length)];
      }, 700);
    };
    ball.onclick = ask;
    return card(
      "magic 8 ball",
      "ask a yes/no question",
      h("div", { class: "w-center" }, ball),
      h(
        "div",
        { class: "w-btn-row" },
        h("button", { class: "w-btn primary", html: "shake", onclick: ask }),
      ),
    );
  },
});

reg({
  id: "yesno",
  match: (q) =>
    /^(?:yes\s+or\s+no|should\s+i\b.*|will\s+i\b.*)$/i.test(q.trim()) &&
    /\?$|^yes\s+or\s+no$|^should\s+i|^will\s+i/i.test(q.trim()),
  build: () => {
    const out = h("div", { class: "w-big w-yesno" }, "?");
    const go = () => {
      const r = Math.random() < 0.5;
      out.textContent = r ? "yes" : "no";
      out.style.color = r ? "var(--green)" : "var(--red)";
    };
    go();
    return card(
      "yes or no",
      null,
      h("div", { class: "w-center" }, out),
      h(
        "div",
        { class: "w-btn-row" },
        h("button", { class: "w-btn primary", html: "again", onclick: go }),
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
    const out = h("div", { class: "w-big w-picker-out" }, "—");
    const go = () => {
      let i = 0,
        n = 14;
      const tick = () => {
        out.textContent = items[i % items.length];
        i++;
        if (i < n) setTimeout(tick, 60 + i * 12);
        else out.classList.add("flash");
      };
      out.classList.remove("flash");
      tick();
    };
    go();
    return card(
      "decision picker",
      items.join(" · "),
      h("div", { class: "w-center" }, out),
      h(
        "div",
        { class: "w-btn-row" },
        h("button", {
          class: "w-btn primary",
          html: "pick again",
          onclick: go,
        }),
        copyBtn(() => out.textContent, "copy result"),
      ),
    );
  },
});

// ─── text encoders / converters ────────────────────────────────────────────

const converter = (id, title, sub, fn, matchRe) =>
  reg({
    id,
    match: (q) => {
      const m = q.match(matchRe);
      if (!m) return null;
      const cap = m.slice(1).find((x) => x != null) ?? "";
      return { text: cap.trim() };
    },
    build: ({ text }) => {
      const input = h(
        "textarea",
        { class: "w-textarea", rows: "2", placeholder: "input…" },
        text,
      );
      const out = h("div", { class: "w-out w-mono", "aria-live": "polite" });
      const run = () => {
        try {
          out.textContent = fn(input.value);
          out.classList.remove("err");
        } catch (e) {
          out.textContent = e.message || "invalid input";
          out.classList.add("err");
        }
      };
      input.value = text;
      input.oninput = run;
      run();
      return card(
        title,
        sub,
        input,
        h(
          "div",
          { class: "w-out-row" },
          out,
          copyBtn(() => out.textContent),
        ),
      );
    },
  });

converter(
  "b64enc",
  "base64 encode",
  null,
  (s) => btoa(unescape(encodeURIComponent(s))),
  /^base64\s+encode\s+(.+)$|^encode\s+(?:to\s+)?base64\s+(.+)$|^base64\s*[:=]\s*(.+)$|^(.+)\s+to\s+base64$/i,
);
converter(
  "b64dec",
  "base64 decode",
  "handles standard and url-safe base64",
  (s) => {
    const t = s.trim().replace(/-/g, "+").replace(/_/g, "/");
    if (!t) return "";
    return decodeURIComponent(escape(atob(t)));
  },
  /^base64\s+decode\s+(.+)$|^decode\s+base64\s+(.+)$/i,
);
converter(
  "urlenc",
  "url encode",
  null,
  (s) => encodeURIComponent(s),
  /^url\s*encode\s+(.+)$/i,
);
converter(
  "urldec",
  "url decode",
  null,
  (s) => decodeURIComponent(s),
  /^url\s*decode\s+(.+)$/i,
);
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
converter(
  "textbin",
  "text → binary",
  null,
  toBinary,
  /^(?:text\s+to\s+binary|binary\s+encode|string\s+to\s+binary)\s+(.+)$|^(?!\d+\s+(?:to|in)\s+binary$)(.+)\s+(?:to|in)\s+binary$/i,
);
converter(
  "bintext",
  "binary → text",
  null,
  fromBinary,
  /^binary\s+(?:to\s+text|decode)\s+([01\s]+)$|^([01]{8}(?:\s+[01]{8})*)$/i,
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
  "text ↔ morse",
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
);

// ─── color tools ─────────────────────────────────────────────────────────────

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
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const fmts = [
      ["HEX", hex.toUpperCase()],
      ["RGB", `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`],
      ["HSL", `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`],
    ];
    const sw = h("div", { class: "w-swatch", style: { background: hex } });
    const rows = fmts.map(([l, v]) =>
      h(
        "div",
        { class: "w-color-row" },
        h("span", { class: "w-color-label" }, l),
        h("span", { class: "w-mono" }, v),
        copyBtn(() => v),
      ),
    );
    return card(
      "color",
      null,
      h(
        "div",
        { class: "w-color-grid" },
        sw,
        h("div", { class: "w-color-rows" }, ...rows),
      ),
    );
  },
});

reg({
  id: "randomcolor",
  match: (q) => /^random\s+(?:color|colour|hex)$/i.test(q.trim()),
  build: () => {
    const sw = h("div", { class: "w-swatch lg" });
    const txt = h("span", { class: "w-mono w-big" });
    const go = () => {
      const hex = rgbToHex(
        Math.random() * 255,
        Math.random() * 255,
        Math.random() * 255,
      );
      sw.style.background = hex;
      txt.textContent = hex.toUpperCase();
    };
    go();
    return card(
      "random color",
      null,
      h(
        "div",
        { class: "w-color-grid" },
        sw,
        h(
          "div",
          { class: "w-row" },
          txt,
          copyBtn(() => txt.textContent),
        ),
      ),
      h(
        "div",
        { class: "w-btn-row" },
        h("button", { class: "w-btn primary", html: "new color", onclick: go }),
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
    const fg = h("input", {
      type: "color",
      class: "w-color-pick",
      value: "#cdd6f4",
    });
    const bg = h("input", {
      type: "color",
      class: "w-color-pick",
      value: "#1e1e2e",
    });
    const ratioEl = h("div", { class: "w-big w-mono", "aria-live": "polite" });
    const preview = h(
      "div",
      { class: "w-contrast-preview" },
      "Aa quick sample",
    );
    const grades = h("div", { class: "w-chips" });
    const run = () => {
      const l1 = luminance(hexToRgb(fg.value)),
        l2 = luminance(hexToRgb(bg.value));
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      ratioEl.textContent = `${ratio.toFixed(2)} : 1`;
      preview.style.color = fg.value;
      preview.style.background = bg.value;
      grades.replaceChildren(
        ...[
          ["AA normal", 4.5],
          ["AAA normal", 7],
          ["AA large", 3],
        ].map(([label, min]) =>
          h(
            "span",
            { class: `w-grade ${ratio >= min ? "pass" : "fail"}` },
            label + (ratio >= min ? " ✓" : " ✗"),
          ),
        ),
      );
    };
    fg.oninput = bg.oninput = run;
    run();
    return card(
      "contrast checker",
      "WCAG ratio",
      h(
        "div",
        { class: "w-row" },
        h("label", { class: "w-label" }, "text", fg),
        h("label", { class: "w-label" }, "bg", bg),
      ),
      ratioEl,
      grades,
      preview,
    );
  },
});

reg({
  id: "gradient",
  match: (q) =>
    /^(?:css\s+)?gradient(?:\s+generator|\s+maker)?$/i.test(q.trim()),
  build: () => {
    const c1 = h("input", {
      type: "color",
      class: "w-color-pick",
      value: "#89b4fa",
    });
    const c2 = h("input", {
      type: "color",
      class: "w-color-pick",
      value: "#cba6f7",
    });
    const angle = h("input", {
      class: "w-range",
      type: "range",
      min: "0",
      max: "360",
      value: "135",
    });
    const angleVal = h("span", { class: "w-range-val" }, "135°");
    const preview = h("div", { class: "w-gradient-preview" });
    const code = h("div", { class: "w-out w-mono" });
    const run = () => {
      const css = `linear-gradient(${angle.value}deg, ${c1.value}, ${c2.value})`;
      preview.style.background = css;
      code.textContent = `background: ${css};`;
      angleVal.textContent = `${angle.value}°`;
    };
    c1.oninput = c2.oninput = angle.oninput = run;
    run();
    return card(
      "css gradient",
      null,
      preview,
      h(
        "div",
        { class: "w-row" },
        c1,
        c2,
        h("label", { class: "w-label" }, angleVal, angle),
      ),
      h(
        "div",
        { class: "w-out-row" },
        code,
        copyBtn(() => code.textContent),
      ),
    );
  },
});

// ─── math / calculators ──────────────────────────────────────────────────────

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
  const rpn = calcToRPN(calcTokenize(expr));
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
    let deg = localStorage.getItem("ms-calc-deg") !== "rad";
    let histNav = -1;

    const expr = h("input", {
      class: "w-calc2-expr w-mono",
      placeholder: "0",
      spellcheck: "false",
      autocomplete: "off",
      autocapitalize: "off",
      "aria-label": "calculator expression",
    });
    const preview = h("div", { class: "w-calc2-preview w-mono" });
    const copy = copyBtn(
      () => preview.textContent.replace(/^=\s*/, "") || expr.value,
      "copy result",
    );

    const degBtn = h(
      "button",
      { class: "w-calc2-deg", type: "button", title: "degrees / radians" },
      "DEG",
    );

    const updatePreview = () => {
      const s = expr.value.trim();
      preview.classList.remove("err");
      if (!s) {
        preview.textContent = "";
        return;
      }
      try {
        preview.textContent = `= ${calcFmt(calcEvaluate(s, deg))}`;
      } catch {
        preview.textContent = "";
      }
    };

    const insert = (text) => {
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
      preview.classList.remove("err");
      histNav = -1;
      expr.focus();
    };

    const toggleSign = () => {
      const m = expr.value.match(/(-?\d*\.?\d+)(?!.*\d)/);
      if (m) {
        const flipped = m[0].startsWith("-") ? m[0].slice(1) : `-${m[0]}`;
        expr.value =
          expr.value.slice(0, m.index) +
          flipped +
          expr.value.slice(m.index + m[0].length);
        updatePreview();
        expr.focus();
      } else insert("-");
    };

    const histList = h("div", { class: "w-calc2-hist-list" });
    const renderHistory = () => {
      histList.replaceChildren();
      if (!history.length) {
        histList.append(
          h("div", { class: "w-calc2-hist-empty" }, "no calculations yet"),
        );
        return;
      }
      for (let i = history.length - 1; i >= 0; i--) {
        const it = history[i];
        const row = h(
          "button",
          { class: "w-calc2-hist-row", type: "button" },
          h("span", { class: "w-calc2-hist-expr" }, it.expr),
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
        preview.textContent = "error";
        preview.classList.add("err");
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
      expr.value = res;
      expr.focus();
      expr.setSelectionRange(res.length, res.length);
      preview.textContent = "";
      preview.classList.remove("err");
      histNav = -1;
    };

    degBtn.onclick = () => {
      deg = !deg;
      degBtn.textContent = deg ? "DEG" : "RAD";
      updatePreview();
      expr.focus();
    };

    const sci = [
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
      ["xʸ", "^"],
      ["x²", "^2"],
      ["n!", "!"],
      ["mod", " mod "],
      ["%", "%"],
    ];
    const num = [
      ["C", "clear"],
      ["(", "("],
      [")", ")"],
      ["⌫", "back"],
      ["7", "7"],
      ["8", "8"],
      ["9", "9"],
      ["÷", "/"],
      ["4", "4"],
      ["5", "5"],
      ["6", "6"],
      ["×", "*"],
      ["1", "1"],
      ["2", "2"],
      ["3", "3"],
      ["−", "-"],
      ["±", "sign"],
      ["0", "0"],
      [".", "."],
      ["+", "+"],
    ];

    const makeKey = ([label, action], cls) => {
      const b = h(
        "button",
        { class: `w-calc2-key${cls}`, type: "button" },
        label,
      );
      b.onclick = () => {
        if (action === "clear") clearAll();
        else if (action === "back") backspace();
        else if (action === "sign") toggleSign();
        else insert(action);
      };
      return b;
    };

    const sciGrid = h(
      "div",
      { class: "w-calc2-sci" },
      ...sci.map((k) => makeKey(k, " fn")),
    );
    const numKeys = num.map((k) => {
      const cls =
        k[1] === "clear" || k[1] === "back"
          ? " ctrl"
          : /^[/*+-]$|^sign$/.test(k[1])
            ? " op"
            : "";
      return makeKey(k, cls);
    });
    const equals = h(
      "button",
      { class: "w-calc2-key eq", type: "button" },
      "=",
    );
    equals.onclick = commit;
    const numGrid = h("div", { class: "w-calc2-num" }, ...numKeys, equals);

    const memBar = h(
      "div",
      { class: "w-calc2-mem" },
      ...[
        ["MC", () => (mem = 0)],
        ["MR", () => insert(calcFmt(mem))],
        [
          "M+",
          () => {
            try {
              mem += calcEvaluate(expr.value.trim() || "0", deg);
            } catch {}
          },
        ],
        [
          "M−",
          () => {
            try {
              mem -= calcEvaluate(expr.value.trim() || "0", deg);
            } catch {}
          },
        ],
      ].map(([l, fn]) => {
        const b = h(
          "button",
          { class: "w-calc2-mem-key", type: "button" },
          l,
        );
        b.onclick = () => {
          fn();
          if (l !== "MR") expr.focus();
        };
        return b;
      }),
    );

    const histClear = h(
      "button",
      { class: "w-calc2-hist-clear", type: "button" },
      "clear",
    );
    histClear.onclick = () => {
      history = [];
      saveHistory();
      renderHistory();
      expr.focus();
    };

    expr.addEventListener("input", () => {
      histNav = -1;
      updatePreview();
    });
    expr.addEventListener("keydown", (e) => {
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

    const root = card(
      "calculator",
      "scientific · ↑↓ recalls history · esc clears",
      h(
        "div",
        { class: "w-calc2" },
        h(
          "div",
          { class: "w-calc2-display" },
          h("div", { class: "w-calc2-top" }, degBtn, copy),
          expr,
          preview,
        ),
        h(
          "div",
          { class: "w-calc2-body" },
          h(
            "div",
            { class: "w-calc2-pad" },
            memBar,
            h("div", { class: "w-calc2-grids" }, sciGrid, numGrid),
          ),
          h(
            "div",
            { class: "w-calc2-hist" },
            h(
              "div",
              { class: "w-calc2-hist-head" },
              h("span", null, "history"),
              histClear,
            ),
            histList,
          ),
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
      if (e.key.length === 1 && /[0-9.+\-*/^%()!]/.test(e.key)) {
        e.preventDefault();
        insert(e.key);
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
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

const calc = (id, title, sub, fields, compute) =>
  reg({
    id,
    match: (q) =>
      new RegExp(
        `^${id.replace(/_/g, "[\\s_-]*")}(?:\\s+calculator|\\s+calc)?$`,
        "i",
      ).test(q.trim()) ||
      (sub && typeof sub === "object" && sub.alt?.test(q.trim()))
        ? {}
        : null,
    build: () => {
      const inputs = {};
      const out = h("div", { class: "w-calc-out" });
      const run = () => {
        const vals = {};
        for (const k in inputs) vals[k] = parseFloat(inputs[k].value);
        out.replaceChildren(
          ...compute(vals).map(([l, v]) =>
            h(
              "div",
              { class: "w-stat" },
              h("span", { class: "w-stat-label" }, l),
              h("span", { class: "w-stat-val" }, v),
            ),
          ),
        );
      };
      const rows = fields.map((f) => {
        const inp = h("input", {
          class: "w-input",
          type: "number",
          placeholder: f.ph || "",
          value: f.def ?? "",
          step: "any",
        });
        inp.oninput = run;
        inputs[f.k] = inp;
        return h("label", { class: "w-label col" }, f.label, inp);
      });
      run();
      return card(
        title,
        typeof sub === "string" ? sub : sub?.text,
        h("div", { class: "w-form-grid" }, ...rows),
        out,
      );
    },
  });

calc(
  "bmi",
  "bmi calculator",
  { text: "body mass index" },
  [
    { k: "w", label: "weight (kg)", ph: "70", def: 70 },
    { k: "h", label: "height (cm)", ph: "175", def: 175 },
  ],
  ({ w, h: ht }) => {
    if (!w || !ht) return [["bmi", "—"]];
    const bmi = w / (ht / 100) ** 2;
    const cat =
      bmi < 18.5
        ? "underweight"
        : bmi < 25
          ? "normal"
          : bmi < 30
            ? "overweight"
            : "obese";
    return [
      ["bmi", bmi.toFixed(1)],
      ["category", cat],
    ];
  },
);

calc(
  "tip",
  "tip calculator",
  null,
  [
    { k: "bill", label: "bill", ph: "50", def: 50 },
    { k: "pct", label: "tip %", ph: "18", def: 18 },
    { k: "split", label: "split between", ph: "1", def: 1 },
  ],
  ({ bill, pct, split }) => {
    if (!bill) return [["tip", "—"]];
    const tip = bill * (pct / 100),
      total = bill + tip,
      per = total / (split || 1);
    return [
      ["tip", `$${tip.toFixed(2)}`],
      ["total", `$${total.toFixed(2)}`],
      ...(split > 1 ? [["per person", `$${per.toFixed(2)}`]] : []),
    ];
  },
);

calc(
  "loan",
  "loan calculator",
  { text: "monthly payment", alt: /^(?:mortgage|loan)\s+calculator$/i },
  [
    { k: "p", label: "principal", ph: "20000", def: 20000 },
    { k: "rate", label: "annual rate %", ph: "5", def: 5 },
    { k: "years", label: "term (years)", ph: "5", def: 5 },
  ],
  ({ p, rate, years }) => {
    if (!p || !years) return [["payment", "—"]];
    const r = rate / 100 / 12,
      n = years * 12;
    const m = r ? (p * r) / (1 - (1 + r) ** -n) : p / n;
    return [
      ["monthly", `$${m.toFixed(2)}`],
      ["total paid", `$${(m * n).toFixed(2)}`],
      ["total interest", `$${(m * n - p).toFixed(2)}`],
    ];
  },
);

calc(
  "discount",
  "discount calculator",
  null,
  [
    { k: "price", label: "price", ph: "80", def: 80 },
    { k: "pct", label: "discount %", ph: "25", def: 25 },
  ],
  ({ price, pct }) => {
    if (!price) return [["final", "—"]];
    const save = price * (pct / 100);
    return [
      ["you save", `$${save.toFixed(2)}`],
      ["final price", `$${(price - save).toFixed(2)}`],
    ];
  },
);

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
    if (p.kind === "of") {
      const r = (p.a / 100) * p.b;
      return card(
        "percentage",
        null,
        h("div", { class: "w-big" }, `${p.a}% of ${p.b} = ${+r.toFixed(6)}`),
      );
    }
    const a = h("input", {
      class: "w-input",
      type: "number",
      value: "25",
      step: "any",
    });
    const b = h("input", {
      class: "w-input",
      type: "number",
      value: "200",
      step: "any",
    });
    const out = h("div", { class: "w-calc-out" });
    const run = () => {
      const x = +a.value,
        y = +b.value;
      out.replaceChildren(
        h(
          "div",
          { class: "w-stat" },
          h("span", { class: "w-stat-label" }, `${x}% of ${y}`),
          h("span", { class: "w-stat-val" }, +((x / 100) * y).toFixed(4)),
        ),
        h(
          "div",
          { class: "w-stat" },
          h("span", { class: "w-stat-label" }, `${x} is what % of ${y}`),
          h(
            "span",
            { class: "w-stat-val" },
            y ? `${+((x / y) * 100).toFixed(4)}%` : "—",
          ),
        ),
      );
    };
    a.oninput = b.oninput = run;
    run();
    return card(
      "percentage calculator",
      null,
      h(
        "div",
        { class: "w-row" },
        a,
        h("span", { class: "w-mid" }, "%  /  of"),
        b,
      ),
      out,
    );
  },
});

reg({
  id: "aspect",
  match: (q) => /^aspect\s*ratio(?:\s+calculator)?$/i.test(q.trim()),
  build: () => {
    const w = h("input", {
      class: "w-input w-num",
      type: "number",
      value: "1920",
    });
    const hh = h("input", {
      class: "w-input w-num",
      type: "number",
      value: "1080",
    });
    const out = h("div", { class: "w-calc-out" });
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const run = () => {
      const a = Math.round(+w.value),
        b = Math.round(+hh.value);
      if (!a || !b) return out.replaceChildren();
      const g = gcd(a, b);
      out.replaceChildren(
        h(
          "div",
          { class: "w-stat" },
          h("span", { class: "w-stat-label" }, "ratio"),
          h("span", { class: "w-stat-val" }, `${a / g} : ${b / g}`),
        ),
        h(
          "div",
          { class: "w-stat" },
          h("span", { class: "w-stat-label" }, "decimal"),
          h("span", { class: "w-stat-val" }, (a / b).toFixed(4)),
        ),
      );
    };
    w.oninput = hh.oninput = run;
    run();
    return card(
      "aspect ratio",
      null,
      h("div", { class: "w-row" }, w, h("span", { class: "w-mid" }, "×"), hh),
      out,
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
  build: ({ n }) => {
    const inp = h("input", { class: "w-input", type: "number", value: n });
    const out = h("div", { class: "w-calc-out" });
    const run = () => {
      const v = parseInt(inp.value, 10);
      if (!Number.isFinite(v)) return out.replaceChildren();
      out.replaceChildren(
        ...[
          ["decimal", v.toString(10)],
          ["binary", `0b${v.toString(2)}`],
          ["octal", `0o${v.toString(8)}`],
          ["hex", `0x${v.toString(16).toUpperCase()}`],
        ].map(([l, val]) =>
          h(
            "div",
            { class: "w-stat" },
            h("span", { class: "w-stat-label" }, l),
            h(
              "span",
              { class: "w-row" },
              h("span", { class: "w-stat-val w-mono" }, val),
              copyBtn(() => val),
            ),
          ),
        ),
      );
    };
    inp.oninput = run;
    run();
    return card("number base converter", null, inp, out);
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
    const toRoman = (n) => {
      let r = "";
      for (const [v, s] of map)
        while (n >= v) {
          r += s;
          n -= v;
        }
      return r;
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
    const inp = h("input", { class: "w-input", value: p.roman || p.n });
    const out = h("div", { class: "w-big w-mono" });
    const run = () => {
      const v = inp.value.trim();
      out.textContent = /^[ivxlcdm]+$/i.test(v)
        ? fromRoman(v.toUpperCase())
        : +v >= 1 && +v <= 3999
          ? toRoman(Math.floor(+v))
          : "—";
    };
    inp.oninput = run;
    run();
    return card(
      "roman numerals",
      "number ↔ roman (1–3999)",
      inp,
      h(
        "div",
        { class: "w-out-row" },
        out,
        copyBtn(() => out.textContent),
      ),
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
    const isPrime = (x) => {
      if (x < 2) return false;
      for (let i = 2; i * i <= x; i++) if (x % i === 0) return false;
      return true;
    };
    const factorize = (x) => {
      const f = [];
      for (let d = 2; d * d <= x; d++)
        while (x % d === 0) {
          f.push(d);
          x /= d;
        }
      if (x > 1) f.push(x);
      return f;
    };
    if (kind === "prime")
      return card(
        "prime check",
        null,
        h(
          "div",
          { class: "w-big" },
          `${n} is ${isPrime(n) ? "" : "not "}prime`,
        ),
      );
    const f = factorize(n);
    const counts = {};
    for (const p of f) counts[p] = (counts[p] || 0) + 1;
    const pretty = Object.entries(counts)
      .map(([p, c]) => (c > 1 ? `${p}^${c}` : p))
      .join(" × ");
    return card(
      "prime factorization",
      null,
      h(
        "div",
        { class: "w-big" },
        `${n} = ${f.length === 1 ? `${n} (prime)` : pretty}`,
      ),
      h("div", { class: "w-sub" }, `factors: ${f.join(", ")}`),
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
    const n = nums.length,
      sum = nums.reduce((a, b) => a + b, 0),
      mean = sum / n;
    const sorted = [...nums].sort((a, b) => a - b);
    const median =
      n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const r = (x) => +x.toFixed(4);
    return card(
      "statistics",
      `${n} values`,
      h(
        "div",
        { class: "w-calc-out" },
        ...[
          ["sum", sum],
          ["mean", r(mean)],
          ["median", r(median)],
          ["min", sorted[0]],
          ["max", sorted[n - 1]],
          ["std dev", r(Math.sqrt(variance))],
        ].map(([l, v]) =>
          h(
            "div",
            { class: "w-stat" },
            h("span", { class: "w-stat-label" }, l),
            h("span", { class: "w-stat-val" }, v),
          ),
        ),
      ),
    );
  },
});

// ─── date / time ───────────────────────────────────────────────────────────

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
      class: "w-input",
      type: "date",
      value: date || "2000-01-01",
    });
    const out = h("div", { class: "w-calc-out" });
    const run = () => {
      const [Y, M, D] = (inp.value || "").split("-").map(Number);
      const d = new Date(Y, M - 1, D);
      if (Number.isNaN(d.getTime()) || !Y) return out.replaceChildren();
      const now = new Date();
      let y = now.getFullYear() - d.getFullYear();
      let m = now.getMonth() - d.getMonth();
      let days = now.getDate() - d.getDate();
      if (days < 0) {
        m--;
        days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      }
      if (m < 0) {
        y--;
        m += 12;
      }
      const totalDays = Math.floor((now - d) / 86400000);
      out.replaceChildren(
        h(
          "div",
          { class: "w-stat" },
          h("span", { class: "w-stat-label" }, "age"),
          h("span", { class: "w-stat-val" }, `${y}y ${m}m ${days}d`),
        ),
        h(
          "div",
          { class: "w-stat" },
          h("span", { class: "w-stat-label" }, "total days"),
          h("span", { class: "w-stat-val" }, totalDays.toLocaleString()),
        ),
        h(
          "div",
          { class: "w-stat" },
          h("span", { class: "w-stat-label" }, "total hours"),
          h("span", { class: "w-stat-val" }, (totalDays * 24).toLocaleString()),
        ),
      );
    };
    inp.oninput = run;
    run();
    return card("age calculator", null, inp, out);
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
    const d1 = a ? local(a) : new Date();
    const d2 = local(b);
    const days = Math.round(
      (d2 - new Date(d1.getFullYear(), d1.getMonth(), d1.getDate())) / 86400000,
    );
    return card(
      "date difference",
      null,
      h(
        "div",
        { class: "w-big" },
        `${Math.abs(days).toLocaleString()} day${Math.abs(days) === 1 ? "" : "s"}`,
      ),
      h(
        "div",
        { class: "w-sub" },
        a ? `between ${a} and ${b}` : days >= 0 ? `until ${b}` : `since ${b}`,
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
    const ms = ts > 1e12 ? ts : ts * 1000;
    const d = new Date(ms);
    return card(
      "unix timestamp",
      null,
      h(
        "div",
        { class: "w-calc-out" },
        ...[
          ["local", d.toLocaleString()],
          ["utc", d.toUTCString()],
          ["iso 8601", d.toISOString()],
          [
            "relative",
            `${Math.round((d - Date.now()) / 86400000)} days from now`,
          ],
        ].map(([l, v]) =>
          h(
            "div",
            { class: "w-stat" },
            h("span", { class: "w-stat-label" }, l),
            h(
              "span",
              { class: "w-row" },
              h("span", { class: "w-stat-val w-mono" }, v),
              copyBtn(() => v),
            ),
          ),
        ),
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
    const list = h("div", { class: "w-clock-list" });
    const rows = zones.map(([name, tz]) => {
      const t = h("span", { class: "w-clock-time w-mono" });
      list.append(
        h(
          "div",
          { class: "w-clock-row" },
          h("span", { class: "w-clock-city" }, name),
          t,
        ),
      );
      return { tz, t };
    });
    const tick = () => {
      if (!list.isConnected) return clearInterval(iv);
      for (const { tz, t } of rows)
        t.textContent = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date());
    };
    const iv = setInterval(tick, 1000);
    tick();
    return card("world clock", null, list);
  },
});

reg({
  id: "pomodoro",
  match: (q) => /^pomodoro(?:\s+timer)?$/i.test(q.trim()),
  build: () => {
    let mode = "focus",
      remaining = 25 * 60,
      running = false,
      iv = null;
    const durations = { focus: 25 * 60, break: 5 * 60 };
    const disp = h("div", { class: "w-timer-disp w-mono" });
    const modeLabel = h("div", { class: "w-sub w-center" });
    const fmt = (s) =>
      `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const upd = () => {
      disp.textContent = fmt(remaining);
      modeLabel.textContent = mode === "focus" ? "focus time" : "break time";
    };
    const startBtn = h("button", { class: "w-btn primary" }, "start");
    const tick = () => {
      if (!disp.isConnected) return clearInterval(iv);
      remaining--;
      if (remaining < 0) {
        mode = mode === "focus" ? "break" : "focus";
        remaining = durations[mode];
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
    startBtn.onclick = () => {
      running = !running;
      startBtn.textContent = running ? "pause" : "start";
      if (running) iv = setInterval(tick, 1000);
      else clearInterval(iv);
    };
    const resetBtn = h("button", {
      class: "w-btn",
      html: "reset",
      onclick: () => {
        clearInterval(iv);
        running = false;
        mode = "focus";
        remaining = durations.focus;
        startBtn.textContent = "start";
        upd();
      },
    });
    upd();
    return card(
      "pomodoro",
      "25 min focus / 5 min break",
      disp,
      modeLabel,
      h("div", { class: "w-btn-row" }, startBtn, resetBtn),
    );
  },
});

reg({
  id: "countdownny",
  match: (q) =>
    /^(?:countdown\s+to\s+)?new\s*year(?:\s+countdown)?$/i.test(q.trim()),
  build: () => {
    const target = new Date(new Date().getFullYear() + 1, 0, 1);
    const disp = h("div", { class: "w-timer-disp w-mono" });
    const tick = () => {
      if (!disp.isConnected) return clearInterval(iv);
      let s = Math.floor((target - Date.now()) / 1000);
      const d = Math.floor(s / 86400);
      s %= 86400;
      const hh = Math.floor(s / 3600);
      s %= 3600;
      const mm = Math.floor(s / 60);
      s %= 60;
      disp.textContent = `${d}d ${hh}h ${mm}m ${s}s`;
    };
    const iv = setInterval(tick, 1000);
    tick();
    return card(`countdown to ${target.getFullYear()}`, null, disp);
  },
});

// ─── productivity / focus ──────────────────────────────────────────────────

reg({
  id: "breathing",
  match: (q) =>
    /^(?:breathing(?:\s+exercise)?|box\s+breathing|breathe)$/i.test(q.trim()),
  build: () => {
    const phases = [
      ["breathe in", 4000],
      ["hold", 4000],
      ["breathe out", 4000],
      ["hold", 4000],
    ];
    const circle = h("div", { class: "w-breath-circle" });
    const label = h("div", { class: "w-breath-label" }, "tap start");
    let i = 0,
      to = null,
      running = false;
    const step = () => {
      if (!circle.isConnected) return clearTimeout(to);
      const [text, dur] = phases[i % phases.length];
      label.textContent = text;
      circle.style.transitionDuration = `${dur}ms`;
      circle.classList.toggle(
        "big",
        text === "breathe in" || (text === "hold" && i % 4 === 1),
      );
      i++;
      to = setTimeout(step, dur);
    };
    const btn = h("button", { class: "w-btn primary" }, "start");
    btn.onclick = () => {
      running = !running;
      btn.textContent = running ? "stop" : "start";
      if (running) {
        i = 0;
        step();
      } else {
        clearTimeout(to);
        circle.classList.remove("big");
        label.textContent = "tap start";
      }
    };
    return card(
      "box breathing",
      "4-4-4-4 to calm down",
      h("div", { class: "w-breath-wrap" }, circle, label),
      h("div", { class: "w-btn-row" }, btn),
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
      class: "w-textarea",
      rows: "5",
      placeholder: "type or paste text…",
    });
    const out = h("div", { class: "w-calc-out" });
    const run = () => {
      const t = ta.value;
      const words = (t.match(/\S+/g) || []).length;
      const lines = t ? t.split("\n").length : 0;
      out.replaceChildren(
        ...[
          ["characters", t.length],
          ["words", words],
          ["lines", lines],
          ["sentences", (t.match(/[.!?]+/g) || []).length],
          ["reading time", `${Math.ceil(words / 200)} min`],
        ].map(([l, v]) =>
          h(
            "div",
            { class: "w-stat" },
            h("span", { class: "w-stat-label" }, l),
            h("span", { class: "w-stat-val" }, v),
          ),
        ),
      );
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
    const out = h("div", { class: "w-big w-mono" }, "tap →");
    const pad = h("button", { class: "w-tap-pad" }, "tap");
    pad.onclick = () => {
      const now = performance.now();
      taps = taps.filter((t) => now - t < 3000);
      taps.push(now);
      if (taps.length >= 2) {
        const intervals = taps.slice(1).map((t, i) => t - taps[i]);
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        out.textContent = `${Math.round(60000 / avg)} bpm`;
      }
      pad.classList.remove("hit");
      void pad.offsetWidth;
      pad.classList.add("hit");
    };
    return card(
      "bpm tapper",
      "tap the pad to the beat",
      h("div", { class: "w-center" }, out),
      pad,
      h(
        "div",
        { class: "w-btn-row" },
        h("button", {
          class: "w-btn",
          html: "reset",
          onclick: () => {
            taps = [];
            out.textContent = "tap →";
          },
        }),
      ),
    );
  },
});

// ─── audio / music ─────────────────────────────────────────────────────────

reg({
  id: "metronome",
  match: (q) => /^metronome$/i.test(q.trim()),
  build: () => {
    let bpm = 120,
      beats = 4,
      running = false,
      iv = null,
      beat = 0;
    const dots = h("div", { class: "w-metro-dots" });
    const renderDots = () =>
      dots.replaceChildren(
        ...Array.from({ length: beats }, (_, i) =>
          h("div", { class: `w-metro-dot${i === 0 ? " accent" : ""}` }),
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
    const tick = () => {
      if (!dots.isConnected) {
        clearInterval(iv);
        iv = null;
        running = false;
        return;
      }
      [...dots.children].forEach((d, i) => {
        d.classList.toggle("on", i === beat);
      });
      click(beat === 0);
      beat = (beat + 1) % beats;
    };
    const bpmVal = h("span", { class: "w-range-val" }, bpm);
    const bpmIn = h("input", {
      class: "w-range",
      type: "range",
      min: "40",
      max: "240",
      value: bpm,
    });
    const startBtn = h("button", { class: "w-btn primary" }, "start");
    const restart = () => {
      if (running) {
        clearInterval(iv);
        beat = 0;
        iv = setInterval(tick, 60000 / bpm);
      }
    };
    bpmIn.oninput = () => {
      bpm = +bpmIn.value;
      bpmVal.textContent = bpm;
      restart();
    };
    startBtn.onclick = () => {
      running = !running;
      startBtn.textContent = running ? "stop" : "start";
      if (running) {
        beat = 0;
        tick();
        iv = setInterval(tick, 60000 / bpm);
      } else {
        clearInterval(iv);
        [...dots.children].forEach((d) => {
          d.classList.remove("on");
        });
      }
    };
    const beatsSel = h(
      "select",
      { class: "w-select" },
      ...[2, 3, 4, 6].map((n) =>
        h(
          "option",
          { value: n, ...(n === 4 ? { selected: "" } : {}) },
          `${n}/4`,
        ),
      ),
    );
    beatsSel.onchange = () => {
      beats = +beatsSel.value;
      beat = 0;
      renderDots();
    };
    renderDots();
    return card(
      "metronome",
      null,
      dots,
      h("label", { class: "w-label" }, "tempo: ", bpmVal, " bpm", bpmIn),
      h(
        "div",
        { class: "w-row" },
        h("label", { class: "w-label" }, "time sig", beatsSel),
      ),
      h("div", { class: "w-btn-row" }, startBtn),
    );
  },
});

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
  build: ({ freq }) => {
    let osc = null,
      gain = null;
    const freqVal = h("span", { class: "w-range-val" }, freq);
    const freqIn = h("input", {
      class: "w-range",
      type: "range",
      min: "20",
      max: "4000",
      value: freq,
    });
    const wave = h(
      "select",
      { class: "w-select" },
      ...["sine", "square", "sawtooth", "triangle"].map((w) =>
        h("option", { value: w }, w),
      ),
    );
    const btn = h("button", { class: "w-btn primary" }, "play");
    const stop = () => {
      if (osc) {
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          audio().currentTime + 0.05,
        );
        osc.stop(audio().currentTime + 0.06);
        osc = null;
      }
    };
    btn.onclick = () => {
      if (osc) {
        stop();
        btn.textContent = "play";
        btn.classList.remove("active");
        return;
      }
      const ac = audio();
      osc = ac.createOscillator();
      gain = ac.createGain();
      osc.type = wave.value;
      osc.frequency.value = +freqIn.value;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      btn.textContent = "stop";
      btn.classList.add("active");
    };
    freqIn.oninput = () => {
      freqVal.textContent = freqIn.value;
      if (osc) osc.frequency.value = +freqIn.value;
    };
    wave.onchange = () => {
      if (osc) osc.type = wave.value;
    };
    return card(
      "tone generator",
      "⚠ check your volume",
      h("label", { class: "w-label" }, "frequency: ", freqVal, " hz", freqIn),
      h(
        "div",
        { class: "w-row" },
        h("label", { class: "w-label" }, "waveform", wave),
      ),
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
    const kind = (q.match(/white|pink|brown/i) || ["white"])[0].toLowerCase();
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
    const volVal = h("span", { class: "w-range-val" }, "30");
    const vol = h("input", {
      class: "w-range",
      type: "range",
      min: "0",
      max: "100",
      value: "30",
    });
    const btn = h("button", { class: "w-btn primary" }, "play");
    btn.onclick = () => {
      if (src) {
        src.stop();
        src = null;
        btn.textContent = "play";
        btn.classList.remove("active");
        return;
      }
      const ac = audio();
      src = makeNoise();
      gain = ac.createGain();
      gain.gain.value = (vol.value / 100) * 0.5;
      src.connect(gain);
      gain.connect(ac.destination);
      src.start();
      btn.textContent = "stop";
      btn.classList.add("active");
    };
    vol.oninput = () => {
      volVal.textContent = vol.value;
      if (gain) gain.gain.value = (vol.value / 100) * 0.5;
    };
    return card(
      `${kind} noise`,
      "for focus or sleep",
      h("label", { class: "w-label" }, "volume: ", volVal, vol),
      h("div", { class: "w-btn-row" }, btn),
    );
  },
});

reg({
  id: "piano",
  match: (q) =>
    /^(?:piano|keyboard\s+piano|virtual\s+piano|play\s+piano)$/i.test(q.trim()),
  build: () => {
    const keys = [
      ["C", 60, 0],
      ["C#", 61, 1],
      ["D", 62, 0],
      ["D#", 63, 1],
      ["E", 64, 0],
      ["F", 65, 0],
      ["F#", 66, 1],
      ["G", 67, 0],
      ["G#", 68, 1],
      ["A", 69, 0],
      ["A#", 70, 1],
      ["B", 71, 0],
      ["C", 72, 0],
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
    const wrap = h("div", { class: "w-piano" });
    const elByMidi = {};
    const play = (midi) => {
      const ac = audio();
      const o = ac.createOscillator(),
        g = ac.createGain();
      o.type = "triangle";
      o.frequency.value = noteFreq(midi);
      g.gain.setValueAtTime(0.001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.2);
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 1.2);
      const el = elByMidi[midi];
      if (el) {
        el.classList.add("active");
        setTimeout(() => el.classList.remove("active"), 150);
      }
    };
    for (const [name, midi, black] of keys) {
      const k = h("div", {
        class: `w-key${black ? " black" : ""}`,
        title: name,
      });
      k.onpointerdown = () => play(midi);
      elByMidi[midi] = k;
      wrap.append(k);
    }
    const onKey = (e) => {
      if (!wrap.isConnected)
        return document.removeEventListener("keydown", onKey);
      if (e.repeat) return;
      const m = qwerty[e.key.toLowerCase()];
      if (m && document.activeElement?.tagName !== "INPUT") play(m);
    };
    document.addEventListener("keydown", onKey);
    return card("piano", "click keys or use your keyboard (a–k)", wrap);
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
    const tracks = ["kick", "snare", "hat", "clap"];
    const grid = tracks.map(() => Array(STEPS).fill(false));
    let bpm = 120,
      playing = false,
      iv = null,
      step = 0;
    const seq = h("div", { class: "w-seq" });
    const cellEls = [];
    tracks.forEach((name, ti) => {
      const row = h(
        "div",
        { class: "w-seq-row" },
        h("span", { class: "w-seq-label" }, name),
      );
      const cells = [];
      for (let s = 0; s < STEPS; s++) {
        const c = h("div", {
          class: `w-seq-cell${s % 4 === 0 ? " group" : ""}`,
        });
        c.onclick = () => {
          grid[ti][s] = !grid[ti][s];
          c.classList.toggle("on", grid[ti][s]);
        };
        cells.push(c);
        row.append(c);
      }
      cellEls.push(cells);
      seq.append(row);
    });
    const sound = (ti) => {
      const ac = audio(),
        t = ac.currentTime,
        g = ac.createGain();
      g.connect(ac.destination);
      if (ti === 0) {
        const o = ac.createOscillator();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(0.8, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.15);
      } else if (ti === 1 || ti === 3) {
        const b = ac.createBufferSource();
        const buf = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        b.buffer = buf;
        const f = ac.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = ti === 1 ? 1800 : 1200;
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + (ti === 3 ? 0.12 : 0.2));
        b.connect(f);
        f.connect(g);
        b.start(t);
      } else {
        const b = ac.createBufferSource();
        const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        b.buffer = buf;
        const f = ac.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 7000;
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        b.connect(f);
        f.connect(g);
        b.start(t);
      }
    };
    const tick = () => {
      if (!seq.isConnected) {
        clearInterval(iv);
        iv = null;
        playing = false;
        return;
      }
      cellEls.forEach((cells) => {
        cells.forEach((c, i) => {
          c.classList.toggle("playhead", i === step);
        });
      });
      tracks.forEach((_, ti) => {
        if (grid[ti][step]) sound(ti);
      });
      step = (step + 1) % STEPS;
    };
    const playBtn = h("button", { class: "w-btn primary" }, "play");
    playBtn.onclick = () => {
      playing = !playing;
      playBtn.textContent = playing ? "stop" : "play";
      if (playing) {
        step = 0;
        iv = setInterval(tick, 60000 / bpm / 4);
      } else {
        clearInterval(iv);
        cellEls.forEach((cells) => {
          cells.forEach((c) => {
            c.classList.remove("playhead");
          });
        });
      }
    };
    const bpmVal = h("span", { class: "w-range-val" }, bpm);
    const bpmIn = h("input", {
      class: "w-range",
      type: "range",
      min: "60",
      max: "200",
      value: bpm,
    });
    bpmIn.oninput = () => {
      bpm = +bpmIn.value;
      bpmVal.textContent = bpm;
      if (playing) {
        clearInterval(iv);
        iv = setInterval(tick, 60000 / bpm / 4);
      }
    };
    const clear = h("button", {
      class: "w-btn",
      html: "clear",
      onclick: () => {
        grid.forEach((t) => {
          t.fill(false);
        });
        cellEls.forEach((cells) => {
          cells.forEach((c) => {
            c.classList.remove("on");
          });
        });
      },
    });
    return card(
      "drum machine",
      "click steps to build a beat",
      seq,
      h("label", { class: "w-label" }, "tempo: ", bpmVal, bpmIn),
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
    let notes = [];
    const vis = h("div", { class: "w-melody-vis" });
    const scaleSel = h(
      "select",
      { class: "w-select" },
      ...Object.keys(scales).map((s) => h("option", { value: s }, s)),
    );
    const gen = () => {
      const sc = scales[scaleSel.value],
        root = 60;
      notes = Array.from(
        { length: 16 },
        () =>
          root +
          sc[Math.floor(Math.random() * sc.length)] +
          12 * (Math.random() < 0.25 ? 1 : 0),
      );
      vis.replaceChildren(
        ...notes.map((n) => {
          const bar = h("div", { class: "w-melody-bar" });
          bar.style.height = `${20 + ((n - 60) / 24) * 80}%`;
          return bar;
        }),
      );
    };
    const play = async () => {
      const ac = audio();
      let t = ac.currentTime + 0.05;
      const bars = [...vis.children];
      notes.forEach((n, i) => {
        const o = ac.createOscillator(),
          g = ac.createGain();
        o.type = "triangle";
        o.frequency.value = noteFreq(n);
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g);
        g.connect(ac.destination);
        o.start(t);
        o.stop(t + 0.25);
        const at = (t - ac.currentTime) * 1000;
        setTimeout(() => {
          if (vis.isConnected) {
            bars.forEach((b) => {
              b.classList.remove("lit");
            });
            bars[i]?.classList.add("lit");
          }
        }, at);
        t += 0.25;
      });
    };
    scaleSel.onchange = gen;
    gen();
    return card(
      "melody generator",
      "procedural tunes in a scale",
      vis,
      h(
        "div",
        { class: "w-row" },
        h("label", { class: "w-label" }, "scale", scaleSel),
      ),
      h(
        "div",
        { class: "w-btn-row" },
        h("button", { class: "w-btn primary", html: "play", onclick: play }),
        h("button", { class: "w-btn", html: "regenerate", onclick: gen }),
      ),
    );
  },
});

// ─── games / fun ───────────────────────────────────────────────────────────

reg({
  id: "reaction",
  match: (q) =>
    /^(?:reaction\s+(?:time|test|speed)|reflex\s+test)$/i.test(q.trim()),
  build: () => {
    let state = "idle",
      t0 = 0,
      to = null;
    const pad = h("div", { class: "w-react-pad" }, "click to start");
    const best = h("div", { class: "w-sub w-center" });
    let bestMs = +(localStorage.getItem("w-reaction-best") || Infinity);
    if (Number.isFinite(bestMs)) best.textContent = `best: ${bestMs} ms`;
    pad.onclick = () => {
      if (state === "idle" || state === "result") {
        state = "wait";
        pad.className = "w-react-pad wait";
        pad.textContent = "wait for green…";
        to = setTimeout(
          () => {
            state = "go";
            pad.className = "w-react-pad go";
            pad.textContent = "CLICK!";
            t0 = performance.now();
          },
          1000 + Math.random() * 3000,
        );
      } else if (state === "wait") {
        clearTimeout(to);
        state = "idle";
        pad.className = "w-react-pad";
        pad.textContent = "too soon! click to retry";
      } else if (state === "go") {
        const ms = Math.round(performance.now() - t0);
        bestMs = Math.min(bestMs, ms);
        localStorage.setItem("w-reaction-best", bestMs);
        state = "result";
        pad.className = "w-react-pad";
        pad.textContent = `${ms} ms · click to retry`;
        best.textContent = `best: ${bestMs} ms`;
      }
    };
    return card("reaction time", "click when the box turns green", pad, best);
  },
});

reg({
  id: "tictactoe",
  match: (q) =>
    /^(?:tic[\s-]?tac[\s-]?toe|noughts\s+and\s+crosses|xox)$/i.test(q.trim()),
  build: () => {
    let board = Array(9).fill("");
    const status = h("div", { class: "w-sub w-center" }, "your turn (X)");
    const grid = h("div", { class: "w-ttt" });
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
    const winner = (b) => {
      for (const [a, c, d] of wins)
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
      return b.every(Boolean) ? "tie" : null;
    };
    const minimax = (b, me) => {
      const w = winner(b);
      if (w === "O") return { score: 10 };
      if (w === "X") return { score: -10 };
      if (w === "tie") return { score: 0 };
      let best = me ? { score: -Infinity } : { score: Infinity };
      for (let i = 0; i < 9; i++)
        if (!b[i]) {
          b[i] = me ? "O" : "X";
          const s = minimax(b, !me).score;
          b[i] = "";
          if (me ? s > best.score : s < best.score)
            best = { score: s, move: i };
        }
      return best;
    };
    const render = () =>
      [...grid.children].forEach((c, i) => {
        c.textContent = board[i];
        c.className = `w-ttt-cell${board[i] ? " filled" : ""}`;
      });
    const reset = () => {
      board = Array(9).fill("");
      status.textContent = "your turn (X)";
      render();
    };
    for (let i = 0; i < 9; i++) {
      const c = h("div", { class: "w-ttt-cell" });
      c.onclick = () => {
        if (board[i] || winner(board)) return;
        board[i] = "X";
        render();
        let w = winner(board);
        if (w) {
          status.textContent = w === "tie" ? "tie!" : "you win! 🎉";
          return;
        }
        const ai = minimax(board, true).move;
        if (ai != null) board[ai] = "O";
        render();
        w = winner(board);
        status.textContent = w
          ? w === "tie"
            ? "tie!"
            : "computer wins"
          : "your turn (X)";
      };
      grid.append(c);
    }
    reset();
    return card(
      "tic-tac-toe",
      "vs unbeatable computer",
      grid,
      status,
      h(
        "div",
        { class: "w-btn-row" },
        h("button", { class: "w-btn", html: "new game", onclick: reset }),
      ),
    );
  },
});

reg({
  id: "rps",
  match: (q) => /^(?:rock\s+paper\s+scissors|rps)$/i.test(q.trim()),
  build: () => {
    const choices = [
      ["rock", "🪨"],
      ["paper", "📄"],
      ["scissors", "✂️"],
    ];
    const rec = JSON.parse(localStorage.getItem("w-rps") || "[0,0,0]");
    let [wins, losses, ties] = rec;
    const result = h("div", { class: "w-big w-center" }, "pick one");
    const score = h("div", { class: "w-sub w-center" });
    const showScore = () => {
      score.textContent = `${wins}W – ${losses}L – ${ties}T`;
      localStorage.setItem("w-rps", JSON.stringify([wins, losses, ties]));
    };
    const play = (i) => {
      const ai = Math.floor(Math.random() * 3);
      const r = (3 + i - ai) % 3;
      if (r === 0) {
        ties++;
        result.textContent = `${choices[i][1]} vs ${choices[ai][1]} · tie`;
      } else if (r === 1) {
        wins++;
        result.textContent = `${choices[i][1]} beats ${choices[ai][1]} · you win!`;
      } else {
        losses++;
        result.textContent = `${choices[ai][1]} beats ${choices[i][1]} · you lose`;
      }
      showScore();
    };
    showScore();
    const btns = h(
      "div",
      { class: "w-btn-row" },
      ...choices.map(([n, e], i) =>
        h("button", {
          class: "w-btn",
          html: `${e} ${n}`,
          onclick: () => play(i),
        }),
      ),
    );
    return card("rock paper scissors", null, result, score, btns);
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
    ];
    let target = sentences[Math.floor(Math.random() * sentences.length)];
    let started = 0;
    const prompt = h("div", { class: "w-typing-prompt" });
    const input = h("textarea", {
      class: "w-textarea",
      rows: "2",
      placeholder: "start typing…",
    });
    const out = h("div", { class: "w-sub w-center" }, "—");
    const renderPrompt = () => {
      prompt.replaceChildren(
        ...[...target].map((ch, i) => {
          const t = input.value[i];
          return h(
            "span",
            { class: t == null ? "" : t === ch ? "ok" : "bad" },
            ch,
          );
        }),
      );
    };
    input.oninput = () => {
      if (!started) started = performance.now();
      renderPrompt();
      if (input.value === target) {
        const mins = (performance.now() - started) / 60000;
        const wpm = Math.round(target.split(" ").length / mins);
        out.textContent = `${wpm} wpm 🎉`;
      }
    };
    const reset = () => {
      target = sentences[Math.floor(Math.random() * sentences.length)];
      input.value = "";
      started = 0;
      out.textContent = "—";
      renderPrompt();
    };
    renderPrompt();
    return card(
      "typing speed test",
      null,
      prompt,
      input,
      out,
      h(
        "div",
        { class: "w-btn-row" },
        h("button", { class: "w-btn", html: "new sentence", onclick: reset }),
      ),
    );
  },
});

// ─── dev / reference ─────────────────────────────────────────────────────────

reg({
  id: "json",
  match: (q) =>
    /^json\s+(?:format(?:ter)?|pretty(?:\s*print)?|validat(?:e|or)|beautif(?:y|ier))$/i.test(
      q.trim(),
    ),
  build: () => {
    const input = h("textarea", {
      class: "w-textarea",
      rows: "4",
      placeholder: '{"hello": "world"}',
    });
    const out = h("pre", { class: "w-out w-mono w-json-out" });
    const run = () => {
      if (!input.value.trim()) {
        out.textContent = "";
        out.className = "w-out w-mono w-json-out";
        return;
      }
      try {
        out.className = "w-out w-mono w-json-out";
        highlightInto(out, JSON.stringify(JSON.parse(input.value), null, 2));
      } catch (e) {
        out.textContent = `✗ ${e.message}`;
        out.className = "w-out w-mono w-json-out err";
      }
    };
    input.oninput = run;
    return card(
      "json formatter",
      null,
      input,
      h(
        "div",
        { class: "w-out-row" },
        out,
        copyBtn(() => out.textContent),
      ),
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
    const input = h(
      "textarea",
      { class: "w-textarea", rows: "3", placeholder: "paste a JWT…" },
      token,
    );
    const out = h("div", { class: "w-jwt-out" });
    const run = () => {
      out.replaceChildren();
      const parts = input.value.trim().split(".");
      if (parts.length < 2) return;
      const labels = ["header", "payload"];
      parts.slice(0, 2).forEach((p, i) => {
        try {
          const json = JSON.parse(
            decodeURIComponent(
              escape(atob(p.replace(/-/g, "+").replace(/_/g, "/"))),
            ),
          );
          const pre = h("pre", { class: "w-out w-mono" });
          out.append(
            h(
              "div",
              { class: "w-jwt-section" },
              h("div", { class: `w-jwt-label ${labels[i]}` }, labels[i]),
              pre,
            ),
          );
          highlightInto(pre, JSON.stringify(json, null, 2));
        } catch {}
      });
    };
    input.value = token;
    input.oninput = run;
    if (token) run();
    return card(
      "jwt decoder",
      "decoded in your browser, not sent anywhere",
      input,
      out,
    );
  },
});

reg({
  id: "hash",
  match: (q) => {
    const m = q.match(
      /^(sha-?1|sha-?256|sha-?384|sha-?512)\s+(?:hash\s+of\s+|hash\s+|of\s+)(.+)$|^(sha-?1|sha-?256|sha-?384|sha-?512)\s*[:=]\s*(.+)$|^hash\s+of\s+(.+)$|^hash\s*[:=]\s*(.+)$|^(?:generate\s+)?hash\s+generator$/i,
    );
    if (!m) return null;
    const algoRaw = (m[1] || m[3] || "sha-256")
      .toUpperCase()
      .replace(/SHA-?/, "SHA-");
    return { algo: algoRaw, text: (m[2] || m[4] || m[5] || m[6] || "").trim() };
  },
  build: ({ algo, text }) => {
    const sel = h(
      "select",
      { class: "w-select" },
      ...["SHA-1", "SHA-256", "SHA-384", "SHA-512"].map((a) =>
        h("option", { value: a, ...(a === algo ? { selected: "" } : {}) }, a),
      ),
    );
    const input = h(
      "textarea",
      { class: "w-textarea", rows: "2", placeholder: "text to hash…" },
      text,
    );
    const out = h("div", { class: "w-out w-mono", "aria-live": "polite" });
    const run = async () => {
      if (!input.value) {
        out.textContent = "";
        out.classList.remove("err");
        return;
      }
      try {
        const buf = await crypto.subtle.digest(
          sel.value,
          new TextEncoder().encode(input.value),
        );
        out.textContent = [...new Uint8Array(buf)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        out.classList.remove("err");
      } catch (e) {
        out.textContent = e.message || "hashing failed";
        out.classList.add("err");
      }
    };
    input.value = text;
    input.oninput = run;
    sel.onchange = run;
    run();
    return card(
      "hash generator",
      null,
      h("div", { class: "w-row" }, sel),
      input,
      h(
        "div",
        { class: "w-out-row" },
        out,
        copyBtn(() => out.textContent),
      ),
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
    const rows = [
      ["user agent", navigator.userAgent],
      ["platform", navigator.platform || "—"],
      ["language", navigator.language],
      ["cores", navigator.hardwareConcurrency || "—"],
      ["memory", navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "—"],
      ["online", navigator.onLine ? "yes" : "no"],
      ["touch", navigator.maxTouchPoints > 0 ? "yes" : "no"],
    ];
    return card(
      "browser info",
      null,
      h(
        "div",
        { class: "w-calc-out" },
        ...rows.map(([l, v]) =>
          h(
            "div",
            { class: "w-stat" },
            h("span", { class: "w-stat-label" }, l),
            h(
              "span",
              {
                class: "w-stat-val w-mono",
                style: { fontSize: "0.85rem", textAlign: "right" },
              },
              v,
            ),
          ),
        ),
      ),
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
    const out = h("div", { class: "w-calc-out" });
    const run = () =>
      out.replaceChildren(
        ...[
          ["screen", `${screen.width} × ${screen.height}`],
          ["available", `${screen.availWidth} × ${screen.availHeight}`],
          ["viewport", `${window.innerWidth} × ${window.innerHeight}`],
          ["pixel ratio", window.devicePixelRatio],
          ["color depth", `${screen.colorDepth}-bit`],
        ].map(([l, v]) =>
          h(
            "div",
            { class: "w-stat" },
            h("span", { class: "w-stat-label" }, l),
            h("span", { class: "w-stat-val w-mono" }, v),
          ),
        ),
      );
    run();
    window.addEventListener("resize", () => {
      if (out.isConnected) run();
    });
    return card("display info", "resize your window to watch it update", out);
  },
});

reg({
  id: "regex",
  match: (q) => /^regex\s+(?:tester|test|tool)$|^test\s+regex$/i.test(q.trim()),
  build: () => {
    const pat = h("input", {
      class: "w-input w-mono",
      placeholder: "pattern e.g. \\d+",
      value: "\\b\\w+\\b",
    });
    const flags = h("input", {
      class: "w-input w-mono w-num",
      placeholder: "flags",
      value: "g",
    });
    const test = h(
      "textarea",
      { class: "w-textarea", rows: "3", placeholder: "test string…" },
      "the year is 2024 and 1999",
    );
    const out = h("div", { class: "w-out" });
    const run = () => {
      try {
        const re = new RegExp(pat.value, flags.value);
        const str = test.value.slice(0, 5000);
        let html = "",
          last = 0,
          m,
          count = 0;
        if (flags.value.includes("g")) {
          m = re.exec(str);
          while (m && count < 1000) {
            if (m[0] === "") {
              re.lastIndex++;
              m = re.exec(str);
              continue;
            }
            html += `${esc(str.slice(last, m.index))}<mark>${esc(m[0])}</mark>`;
            last = m.index + m[0].length;
            count++;
            m = re.exec(str);
          }
        } else {
          m = re.exec(str);
          if (m) {
            html += `${esc(str.slice(0, m.index))}<mark>${esc(m[0])}</mark>`;
            last = m.index + m[0].length;
            count = 1;
          }
        }
        html += esc(str.slice(last));
        out.innerHTML =
          `<div class="w-sub">${count} match${count === 1 ? "" : "es"}</div>` +
          html;
        out.classList.remove("err");
      } catch (e) {
        out.textContent = e.message;
        out.classList.add("err");
      }
    };
    const esc = (s) =>
      s.replace(
        /[&<>]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
      );
    pat.oninput = flags.oninput = test.oninput = run;
    run();
    return card(
      "regex tester",
      null,
      h("div", { class: "w-row" }, pat, flags),
      test,
      out,
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
    const input = h(
      "textarea",
      {
        class: "w-textarea",
        rows: "5",
        placeholder: "# Hello\n\n**bold** and *italic*\n\n- a list",
      },
      "# Hello\n\nsome **bold** and *italic* text.\n\n- one\n- two\n\n`code` and [a link](https://search.tiago.zip)",
    );
    const out = h("div", { class: "w-md-out" });
    const esc = (s) =>
      s.replace(
        /[&<>]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
      );
    const md = (src) =>
      esc(src)
        .replace(/^### (.*)$/gm, "<h3>$1</h3>")
        .replace(/^## (.*)$/gm, "<h2>$1</h2>")
        .replace(/^# (.*)$/gm, "<h1>$1</h1>")
        .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
        .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(
          /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
          (_, label, url) =>
            `<a href="${url.replace(/"/g, "%22")}" rel="noopener" target="_blank">${label}</a>`,
        )
        .replace(/\n{2,}/g, "</p><p>")
        .replace(/^(?!<[hlu])(.+)$/gm, "$1");
    const run = () => {
      out.innerHTML = `<p>${md(input.value)}</p>`;
    };
    input.oninput = run;
    run();
    return card(
      "markdown preview",
      null,
      h("div", { class: "w-md-split" }, input, out),
      h(
        "div",
        { class: "w-btn-row" },
        copyBtn(() => input.value, "copy markdown"),
        copyBtn(() => out.innerHTML, "copy html"),
      ),
    );
  },
});

reg({
  id: "ascii",
  match: (q) => /^(?:ascii(?:\s+table)?|ascii\s+chart)$/i.test(q.trim()),
  build: () => {
    const grid = h("div", { class: "w-ascii" });
    for (let i = 32; i < 127; i++)
      grid.append(
        h(
          "div",
          { class: "w-ascii-cell" },
          h("span", { class: "w-ascii-char" }, String.fromCharCode(i)),
          h("span", { class: "w-ascii-dec" }, i),
          h("span", { class: "w-ascii-hex" }, `0x${i.toString(16)}`),
        ),
      );
    return card("ascii table", "printable characters 32–126", grid);
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
    return card(
      "character info",
      ch,
      h(
        "div",
        { class: "w-calc-out" },
        ...[
          ["character", ch],
          ["code point", `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`],
          ["decimal", cp],
          ["html entity", `&#${cp};`],
          [
            "utf-8 bytes",
            [...new TextEncoder().encode(ch)]
              .map((b) => b.toString(16))
              .join(" "),
          ],
        ].map(([l, v]) =>
          h(
            "div",
            { class: "w-stat" },
            h("span", { class: "w-stat-label" }, l),
            h(
              "span",
              { class: "w-row" },
              h("span", { class: "w-stat-val w-mono" }, v),
              copyBtn(() => String(v)),
            ),
          ),
        ),
      ),
    );
  },
});

// ─── wave 2: emoji, cron, viz, games, reference ──────────────────────────────

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
      value: term,
    });
    const grid = h("div", { class: "w-emoji-grid" });
    const run = () => {
      const t = input.value.trim().toLowerCase();
      const list = (
        t ? EMOJI.filter(([c, k]) => k.includes(t) || c === t) : EMOJI
      ).slice(0, 72);
      grid.replaceChildren();
      if (!list.length)
        return grid.append(h("div", { class: "w-sub" }, "no matches"));
      for (const [c] of list) {
        const b = h("button", { class: "w-emoji", title: "copy" }, c);
        b.onclick = () => {
          navigator.clipboard?.writeText(c);
          b.classList.add("copied");
          setTimeout(() => b.classList.remove("copied"), 600);
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
      "┬─┬ノ( º _ ºノ)",
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
      const b = h("button", { class: "w-kaomoji w-mono", title: "copy" }, k);
      b.onclick = () => {
        navigator.clipboard?.writeText(k);
        b.classList.add("copied");
        setTimeout(() => b.classList.remove("copied"), 600);
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
    const input = h("input", { class: "w-input w-mono", value: expr });
    const desc = h("div", { class: "w-big" });
    const next = h("div", { class: "w-calc-out" });
    const FIELDS = [
      ["minute", 0, 59],
      ["hour", 0, 23],
      ["day of month", 1, 31],
      ["month", 1, 12],
      ["day of week", 0, 6],
    ];
    const parseField = (f, lo, hi) => {
      const set = new Set();
      for (const part of f.split(",")) {
        const [range, stepRaw] = part.split("/");
        const step = stepRaw ? +stepRaw : 1;
        let a, b;
        if (range === "*") {
          a = lo;
          b = hi;
        } else if (range.includes("-")) {
          const [x, y] = range.split("-").map(Number);
          a = x;
          b = y;
        } else {
          a = b = +range;
        }
        if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("bad");
        for (let i = a; i <= b; i += step) if (i >= lo && i <= hi) set.add(i);
      }
      return set;
    };
    const run = () => {
      const parts = input.value.trim().split(/\s+/);
      if (parts.length !== 5) {
        desc.textContent = "needs 5 fields: min hour day month weekday";
        next.replaceChildren();
        return;
      }
      let sets;
      try {
        sets = FIELDS.map(([, lo, hi], i) => parseField(parts[i], lo, hi));
      } catch {
        desc.textContent = "invalid expression";
        next.replaceChildren();
        return;
      }
      const human = parts
        .map((p, i) => (p === "*" ? null : `${FIELDS[i][0]} ${p}`))
        .filter(Boolean)
        .join(", ");
      desc.textContent = human ? `runs at ${human}` : "runs every minute";
      const runs = [];
      const d = new Date();
      d.setSeconds(0, 0);
      d.setMinutes(d.getMinutes() + 1);
      const domRestricted = parts[2] !== "*";
      const dowRestricted = parts[4] !== "*";
      for (let i = 0; i < 366 * 24 * 60 && runs.length < 5; i++) {
        const dom = sets[2].has(d.getDate());
        const dow = sets[4].has(d.getDay());
        // POSIX: when both day fields are restricted, match either
        const dayOk = domRestricted && dowRestricted ? dom || dow : dom && dow;
        if (
          sets[0].has(d.getMinutes()) &&
          sets[1].has(d.getHours()) &&
          sets[3].has(d.getMonth() + 1) &&
          dayOk
        )
          runs.push(new Date(d));
        d.setMinutes(d.getMinutes() + 1);
      }
      next.replaceChildren(
        ...runs.map((r) =>
          h(
            "div",
            { class: "w-stat" },
            h("span", { class: "w-stat-label" }, "next run"),
            h("span", { class: "w-stat-val w-mono" }, r.toLocaleString()),
          ),
        ),
      );
      if (!runs.length)
        next.append(h("div", { class: "w-sub" }, "no run within a year"));
    };
    input.oninput = run;
    run();
    return card("cron expression", null, input, desc, next);
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
    let running = false;
    const bars = h("div", { class: "w-sort-bars" });
    const sel = h(
      "select",
      { class: "w-select" },
      ...["bubble", "insertion", "selection", "quick"].map((s) =>
        h("option", { value: s }, s),
      ),
    );
    const draw = (a = -1, b = -1, done = 0) => {
      bars.replaceChildren(
        ...arr.map((v, i) => {
          const bar = h("div", {
            class:
              "w-sort-bar" +
              (i === a || i === b ? " active" : "") +
              (i < done ? " done" : ""),
          });
          bar.style.height = `${v}%`;
          return bar;
        }),
      );
    };
    const randomize = () => {
      arr = Array.from({ length: N }, () => 5 + Math.floor(Math.random() * 95));
      draw();
    };
    const steps = [];
    const rec = (a, b) => steps.push([arr.slice(), a, b]);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const algos = {
      bubble: () => {
        for (let i = 0; i < N; i++)
          for (let j = 0; j < N - i - 1; j++) {
            rec(j, j + 1);
            if (arr[j] > arr[j + 1]) {
              [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
              rec(j, j + 1);
            }
          }
      },
      insertion: () => {
        for (let i = 1; i < N; i++) {
          let j = i;
          while (j > 0 && arr[j - 1] > arr[j]) {
            rec(j - 1, j);
            [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
            j--;
          }
        }
      },
      selection: () => {
        for (let i = 0; i < N; i++) {
          let mn = i;
          for (let j = i + 1; j < N; j++) {
            rec(i, j);
            if (arr[j] < arr[mn]) mn = j;
          }
          if (mn !== i) {
            [arr[i], arr[mn]] = [arr[mn], arr[i]];
            rec(i, mn);
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
              i++;
            }
          }
          [arr[i], arr[hi]] = [arr[hi], arr[i]];
          rec(i, hi);
          qs(lo, i - 1);
          qs(i + 1, hi);
        };
        qs(0, N - 1);
      },
    };
    const run = async () => {
      if (running) return;
      running = true;
      const snapshot = arr.slice();
      steps.length = 0;
      algos[sel.value]();
      const sorted = arr.slice();
      arr = snapshot;
      for (const [state, a, b] of steps) {
        if (!bars.isConnected) {
          running = false;
          return;
        }
        arr = state;
        draw(a, b);
        await sleep(26);
      }
      arr = sorted;
      for (let i = 0; i <= N; i++) {
        if (!bars.isConnected) break;
        draw(-1, -1, i);
        await sleep(14);
      }
      running = false;
    };
    randomize();
    return card(
      "sorting visualizer",
      null,
      bars,
      h(
        "div",
        { class: "w-row" },
        h("label", { class: "w-label" }, "algorithm", sel),
      ),
      h(
        "div",
        { class: "w-btn-row" },
        h("button", { class: "w-btn primary", html: "sort", onclick: run }),
        h("button", {
          class: "w-btn",
          html: "shuffle",
          onclick: () => {
            if (!running) randomize();
          },
        }),
      ),
    );
  },
});

reg({
  id: "snake",
  match: (q) => /^(?:play\s+)?snake(?:\s+game)?$/i.test(q.trim()),
  build: () => {
    const SIZE = 17,
      CELL = 16;
    const canvas = h("canvas", {
      class: "w-game-canvas",
      width: SIZE * CELL,
      height: SIZE * CELL,
    });
    const ctx = canvas.getContext("2d");
    const scoreEl = h("div", { class: "w-sub" }, "score: 0");
    const wrap = h("div", { class: "w-game", tabindex: "0" }, canvas);
    let snake, dir, nextDir, food, score, iv, dead;
    let best = +(localStorage.getItem("w-snake-best") || 0);
    const showScore = () =>
      (scoreEl.textContent = `score: ${score}${best ? ` · best: ${best}` : ""}`);
    const spawn = () => {
      let p;
      do {
        p = [
          Math.floor(Math.random() * SIZE),
          Math.floor(Math.random() * SIZE),
        ];
      } while (snake?.some((s) => s[0] === p[0] && s[1] === p[1]));
      return p;
    };
    const reset = () => {
      snake = [[8, 8]];
      dir = [1, 0];
      nextDir = [1, 0];
      food = spawn();
      score = 0;
      dead = false;
      showScore();
    };
    const draw = () => {
      ctx.fillStyle = "#181825";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f38ba8";
      ctx.fillRect(food[0] * CELL + 2, food[1] * CELL + 2, CELL - 4, CELL - 4);
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? "#a6e3a1" : "#74c490";
        ctx.fillRect(s[0] * CELL + 1, s[1] * CELL + 1, CELL - 2, CELL - 2);
      });
    };
    const tick = () => {
      dir = nextDir;
      const head = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
      if (
        head[0] < 0 ||
        head[1] < 0 ||
        head[0] >= SIZE ||
        head[1] >= SIZE ||
        snake.some((s) => s[0] === head[0] && s[1] === head[1])
      ) {
        dead = true;
        clearInterval(iv);
        iv = null;
        if (score > best) {
          best = score;
          localStorage.setItem("w-snake-best", best);
          showScore();
        }
        ctx.fillStyle = "rgba(0,0,0,.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff";
        ctx.font = "15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          "game over · press space",
          canvas.width / 2,
          canvas.height / 2,
        );
        return;
      }
      snake.unshift(head);
      if (head[0] === food[0] && head[1] === food[1]) {
        score++;
        showScore();
        food = spawn();
      } else snake.pop();
      draw();
    };
    const start = () => {
      if (iv) return;
      reset();
      draw();
      iv = setInterval(tick, 110);
    };
    const setDir = (nd) => {
      if (!(nd[0] === -dir[0] && nd[1] === -dir[1])) nextDir = nd;
      if (!iv && !dead) start();
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
      if (map[e.key]) {
        setDir(map[e.key]);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === " ") {
        if (dead || !iv) start();
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
    wrap.onclick = () => wrap.focus();
    reset();
    draw();
    return card(
      "snake",
      "arrow keys / wasd · or swipe on mobile",
      wrap,
      scoreEl,
      h(
        "div",
        { class: "w-btn-row" },
        h("button", {
          class: "w-btn primary",
          html: "start",
          onclick: () => {
            wrap.focus();
            start();
          },
        }),
      ),
    );
  },
});

reg({
  id: "2048",
  match: (q) => /^(?:play\s+)?2048(?:\s+game)?$/i.test(q.trim()),
  build: () => {
    let grid, score;
    const board = h("div", { class: "w-2048" });
    const scoreEl = h("div", { class: "w-sub" }, "score: 0");
    const wrap = h("div", { class: "w-game", tabindex: "0" }, board);
    const colors = {
      2: "#45475a",
      4: "#585b70",
      8: "#fab387",
      16: "#f9a05c",
      32: "#f38ba8",
      64: "#eba0ac",
      128: "#f9e2af",
      256: "#a6e3a1",
      512: "#94e2d5",
      1024: "#89dceb",
      2048: "#cba6f7",
    };
    const emptyCells = () => {
      const c = [];
      for (let r = 0; r < 4; r++)
        for (let q = 0; q < 4; q++) if (!grid[r][q]) c.push([r, q]);
      return c;
    };
    const addTile = () => {
      const c = emptyCells();
      if (!c.length) return;
      const [r, q] = c[Math.floor(Math.random() * c.length)];
      grid[r][q] = Math.random() < 0.9 ? 2 : 4;
    };
    const draw = () => {
      board.replaceChildren();
      for (let r = 0; r < 4; r++)
        for (let q = 0; q < 4; q++) {
          const v = grid[r][q];
          const t = h("div", { class: "w-2048-tile" }, v || "");
          if (v) {
            t.style.background = colors[v] || "#cba6f7";
            t.style.color = v <= 4 ? "#cdd6f4" : "#1e1e2e";
          }
          board.append(t);
        }
      scoreEl.textContent = `score: ${score}`;
    };
    const reset = () => {
      grid = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
      score = 0;
      addTile();
      addTile();
      draw();
    };
    const slide = (row) => {
      const a = row.filter(Boolean);
      for (let i = 0; i < a.length - 1; i++)
        if (a[i] === a[i + 1]) {
          a[i] *= 2;
          score += a[i];
          a.splice(i + 1, 1);
        }
      while (a.length < 4) a.push(0);
      return a;
    };
    const rot = (g) => g[0].map((_, i) => g.map((row) => row[i]));
    const canMove = () => {
      if (emptyCells().length) return true;
      for (let r = 0; r < 4; r++)
        for (let q = 0; q < 4; q++) {
          if (q < 3 && grid[r][q] === grid[r][q + 1]) return true;
          if (r < 3 && grid[r][q] === grid[r + 1][q]) return true;
        }
      return false;
    };
    const move = (d) => {
      const before = JSON.stringify(grid);
      if (d === "left") grid = grid.map(slide);
      else if (d === "right")
        grid = grid.map((r) => slide(r.slice().reverse()).reverse());
      else if (d === "up") grid = rot(rot(grid).map(slide));
      else if (d === "down")
        grid = rot(rot(grid).map((r) => slide(r.slice().reverse()).reverse()));
      if (JSON.stringify(grid) !== before) {
        addTile();
        draw();
        if (!canMove()) scoreEl.textContent = `game over · score: ${score}`;
      }
    };
    wrap.addEventListener("keydown", (e) => {
      const m = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      if (m[e.key]) {
        move(m[e.key]);
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
      move(
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up",
      );
      e.preventDefault();
    });
    wrap.onclick = () => wrap.focus();
    reset();
    return card(
      "2048",
      "arrow keys · or swipe on mobile",
      wrap,
      scoreEl,
      h(
        "div",
        { class: "w-btn-row" },
        h("button", {
          class: "w-btn",
          html: "new game",
          onclick: () => {
            reset();
            wrap.focus();
          },
        }),
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
    const frets =
      CHORDS[norm] ||
      CHORDS[name[0].toUpperCase() + name.slice(1).toLowerCase()];
    if (!frets)
      return card(
        "guitar chord",
        null,
        h(
          "div",
          { class: "w-sub" },
          `no diagram for "${name}" — try C, G, Am, E7, Cmaj7…`,
        ),
      );
    const diagram = h("div", { class: "w-chord" });
    const head = h("div", { class: "w-chord-head" });
    for (const f of frets)
      head.append(
        h(
          "span",
          { class: "w-chord-marker" },
          f < 0 ? "×" : f === 0 ? "○" : "",
        ),
      );
    diagram.append(head);
    const gridBox = h("div", { class: "w-chord-grid" });
    for (let row = 1; row <= 4; row++)
      for (let s = 0; s < 6; s++) {
        const cell = h("div", { class: "w-chord-cell" });
        if (frets[s] === row) cell.append(h("div", { class: "w-chord-dot" }));
        gridBox.append(cell);
      }
    diagram.append(gridBox);
    return card(
      `${norm} chord`,
      "guitar · low E → high E",
      h("div", { class: "w-center" }, diagram),
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
    const a = h("textarea", {
      class: "w-textarea",
      rows: "5",
      placeholder: "original",
    });
    const b = h("textarea", {
      class: "w-textarea",
      rows: "5",
      placeholder: "changed",
    });
    const out = h("div", { class: "w-out w-mono w-diff-out" });
    let lastRows = [];
    const run = () => {
      const la = a.value.split("\n"),
        lb = b.value.split("\n");
      const n = la.length,
        m = lb.length;
      if (n * m > 4e6) {
        out.textContent = "too large to diff (try shorter inputs)";
        return;
      }
      const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
          dp[i][j] =
            la[i] === lb[j]
              ? dp[i + 1][j + 1] + 1
              : Math.max(dp[i + 1][j], dp[i][j + 1]);
      const rows = [];
      let i = 0,
        j = 0;
      while (i < n && j < m) {
        if (la[i] === lb[j]) {
          rows.push([" ", la[i]]);
          i++;
          j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
          rows.push(["-", la[i]]);
          i++;
        } else {
          rows.push(["+", lb[j]]);
          j++;
        }
      }
      while (i < n) rows.push(["-", la[i++]]);
      while (j < m) rows.push(["+", lb[j++]]);
      lastRows = rows;
      out.replaceChildren(
        ...rows.map(([s, t]) =>
          h(
            "div",
            {
              class: `w-diff-line ${s === "+" ? "add" : s === "-" ? "del" : ""}`,
            },
            `${s} ${t}`,
          ),
        ),
      );
    };
    a.oninput = b.oninput = run;
    return card(
      "text diff",
      "line-by-line comparison",
      h("div", { class: "w-md-split" }, a, b),
      h(
        "div",
        { class: "w-out-row" },
        out,
        copyBtn(
          () => lastRows.map(([s, t]) => `${s} ${t}`).join("\n"),
          "copy diff",
        ),
      ),
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
    const num = parseInt(n, 10);
    if (Math.abs(num) >= 1e15)
      return card(
        "number to words",
        null,
        h("div", { class: "w-sub" }, "number too large"),
      );
    const words = numToWords(num);
    return card(
      "number to words",
      null,
      h("div", { class: "w-big" }, words),
      h(
        "div",
        { class: "w-out-row" },
        h("div", { class: "w-out w-mono" }, num.toLocaleString()),
        copyBtn(() => words),
      ),
    );
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
    const note =
      {
        1: "informational response",
        2: "request succeeded",
        3: "further action needed (redirect)",
        4: "client error",
        5: "server error",
      }[cls] || "";
    return card(
      "http status",
      null,
      h(
        "div",
        { class: "w-out-row" },
        h("div", { class: "w-big" }, `${code} ${txt}`),
        copyBtn(() => `${code} ${txt}`),
      ),
      h("div", { class: "w-sub" }, note),
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
    const groups = ["owner", "group", "public"];
    const perms = ["r", "w", "x"];
    const state = oct.split("").map((d) => +d);
    const boxes = [];
    const octEl = h("div", { class: "w-big w-mono" });
    const symEl = h("div", { class: "w-sub w-mono" });
    const upd = () => {
      const digits = boxes.map((g) =>
        g.reduce((acc, cb, i) => acc + (cb.checked ? [4, 2, 1][i] : 0), 0),
      );
      octEl.textContent = digits.join("");
      symEl.textContent = boxes
        .map((g) => g.map((cb, i) => (cb.checked ? perms[i] : "-")).join(""))
        .join("");
    };
    const grid = h("div", { class: "w-chmod" });
    groups.forEach((g, gi) => {
      const row = [];
      boxes[gi] = row;
      const groupEl = h(
        "div",
        { class: "w-chmod-group" },
        h("div", { class: "w-chmod-label" }, g),
      );
      perms.forEach((p, pi) => {
        const cb = h("input", {
          type: "checkbox",
          ...(state[gi] & [4, 2, 1][pi] ? { checked: "" } : {}),
        });
        cb.onchange = upd;
        row.push(cb);
        groupEl.append(h("label", { class: "w-chk" }, cb, p));
      });
      grid.append(groupEl);
    });
    upd();
    return card(
      "chmod calculator",
      null,
      grid,
      h(
        "div",
        { class: "w-row" },
        octEl,
        symEl,
        copyBtn(() => octEl.textContent),
      ),
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
    const input = h("input", { class: "w-input", value: text });
    const shiftVal = h("span", { class: "w-range-val" }, shift);
    const shiftIn = h("input", {
      class: "w-range",
      type: "range",
      min: "0",
      max: "25",
      value: ((shift % 26) + 26) % 26,
    });
    const out = h("div", { class: "w-out w-mono", "aria-live": "polite" });
    const run = () => {
      const s = ((+shiftIn.value % 26) + 26) % 26;
      shiftVal.textContent = s;
      out.textContent = input.value.replace(/[a-z]/gi, (c) => {
        const base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + s) % 26) + base);
      });
    };
    input.oninput = shiftIn.oninput = run;
    run();
    return card(
      "caesar cipher",
      null,
      input,
      h("label", { class: "w-label" }, "shift: ", shiftVal, shiftIn),
      h(
        "div",
        { class: "w-out-row" },
        out,
        copyBtn(() => out.textContent),
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
    const octs = ip.split(".").map(Number);
    if (octs.length !== 4 || octs.some((o) => o > 255))
      return card(
        "subnet calculator",
        null,
        h("div", { class: "w-sub" }, "invalid IPv4 address"),
      );
    const ipNum =
      ((octs[0] << 24) | (octs[1] << 16) | (octs[2] << 8) | octs[3]) >>> 0;
    const mask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
    const network = (ipNum & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const toIp = (n) =>
      [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    const hosts = cidr >= 31 ? 0 : broadcast - network - 1;
    const rows = [
      ["network", toIp(network)],
      ["broadcast", toIp(broadcast)],
      ["netmask", toIp(mask)],
      ["first host", cidr >= 31 ? "—" : toIp(network + 1)],
      ["last host", cidr >= 31 ? "—" : toIp(broadcast - 1)],
      ["usable hosts", Math.max(0, hosts).toLocaleString()],
    ];
    return card(
      `subnet · ${ip}/${cidr}`,
      null,
      h(
        "div",
        { class: "w-calc-out" },
        ...rows.map(([l, v]) =>
          h(
            "div",
            { class: "w-stat" },
            h("span", { class: "w-stat-label" }, l),
            h(
              "span",
              { class: "w-row" },
              h("span", { class: "w-stat-val w-mono" }, v),
              copyBtn(() => String(v)),
            ),
          ),
        ),
      ),
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
    const mode = h(
      "select",
      { class: "w-select" },
      h("option", { value: "wake" }, "I want to wake up at…"),
      h("option", { value: "bed" }, "I'm going to bed now"),
    );
    const timeIn = h("input", {
      class: "w-input w-num",
      type: "time",
      value: "07:00",
    });
    const timeWrap = h("label", { class: "w-label" }, timeIn);
    const out = h("div", { class: "w-calc-out" });
    const fmt = (d) =>
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const run = () => {
      out.replaceChildren();
      const cycle = 90,
        fallAsleep = 15;
      if (mode.value === "wake") {
        timeWrap.style.display = "";
        const [hh, mm] = timeIn.value.split(":").map(Number);
        const wake = new Date();
        wake.setHours(hh, mm, 0, 0);
        if (wake <= new Date()) wake.setDate(wake.getDate() + 1);
        const times = [6, 5, 4].map((c) => {
          const d = new Date(wake.getTime() - (c * cycle + fallAsleep) * 60000);
          return [c, d];
        });
        out.append(
          h(
            "div",
            { class: "w-sub" },
            "fall asleep at one of these for full cycles:",
          ),
        );
        for (const [c, d] of times)
          out.append(
            h(
              "div",
              { class: "w-stat" },
              h(
                "span",
                { class: "w-stat-label" },
                `${c} cycles (${(c * 1.5).toFixed(1)}h)`,
              ),
              h("span", { class: "w-stat-val w-mono" }, fmt(d)),
            ),
          );
      } else {
        timeWrap.style.display = "none";
        const now = Date.now();
        out.append(h("div", { class: "w-sub" }, "wake up at one of these:"));
        for (const c of [6, 5, 4]) {
          const d = new Date(now + (c * cycle + fallAsleep) * 60000);
          out.append(
            h(
              "div",
              { class: "w-stat" },
              h(
                "span",
                { class: "w-stat-label" },
                `${c} cycles (${(c * 1.5).toFixed(1)}h)`,
              ),
              h("span", { class: "w-stat-val w-mono" }, fmt(d)),
            ),
          );
        }
      }
    };
    mode.onchange = run;
    timeIn.oninput = run;
    run();
    return card(
      "sleep calculator",
      "based on 90-min sleep cycles",
      h("div", { class: "w-row" }, mode),
      timeWrap,
      out,
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

const CLEAR = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

reg({
  id: "currency",
  match: parseCurrencyQuery,
  build: ({ amount, from, to }) => {
    const fmtNum = (n, dp) =>
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      }).format(n);
    const fmtAmt = (n) => {
      const abs = Math.abs(n);
      const dp = abs >= 1 || n === 0 ? 2 : abs >= 0.01 ? 4 : 6;
      return fmtNum(n, dp);
    };
    const fmtRate = (n) =>
      new Intl.NumberFormat(undefined, {
        maximumFractionDigits: n >= 1 ? 4 : 6,
      }).format(n);

    const amt = h("input", {
      class: "w-input w-cur-amt",
      type: "text",
      inputmode: "decimal",
      value: String(amount),
    });
    const fromSel = h("select", { class: "w-select w-cur-sel" });
    const toSel = h("select", { class: "w-select w-cur-sel" });
    const swap = h("button", {
      class: "w-cur-swap",
      title: "swap currencies",
      "aria-label": "swap currencies",
      html: SWAP,
    });
    const result = h("div", { class: "w-big w-cur-result" }, "loading rates…");
    const rateLine = h("div", { class: "w-sub w-cur-rate" });
    const stamp = h("div", { class: "w-cur-stamp" });

    let rates = null;
    let lastValue = 0;
    const recompute = () => {
      if (!rates) return;
      const a = parseFloat(amt.value.replace(/,/g, ""));
      const f = fromSel.value;
      const tt = toSel.value;
      if (!Number.isFinite(a) || !rates[f] || !rates[tt]) {
        result.textContent = "—";
        rateLine.textContent = "";
        lastValue = 0;
        return;
      }
      const rate = rates[tt] / rates[f];
      lastValue = a * rate;
      result.replaceChildren(
        h("span", { class: "w-cur-out" }, `${fmtAmt(lastValue)} ${tt}`),
      );
      rateLine.textContent = `${fmtAmt(a)} ${f} · 1 ${f} = ${fmtRate(rate)} ${tt}`;
    };

    amt.oninput = recompute;
    fromSel.onchange = toSel.onchange = recompute;
    swap.onclick = () => {
      const f = fromSel.value;
      fromSel.value = toSel.value;
      toSel.value = f;
      recompute();
    };

    fetch("/fx/USD")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        rates = data.rates || {};
        const codes = sortCodes(Object.keys(rates));
        const opts = (sel, val) => {
          sel.replaceChildren(
            ...codes.map((c) =>
              h("option", { value: c, selected: c === val ? "" : null }, currencyLabel(c)),
            ),
          );
          if (rates[val]) sel.value = val;
        };
        opts(fromSel, rates[from] ? from : "USD");
        opts(toSel, rates[to] ? to : "EUR");
        if (data.updated)
          stamp.textContent = `rates updated ${new Date(data.updated * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
        recompute();
      })
      .catch(() => {
        result.textContent = "couldn't load exchange rates";
      });

    return card(
      "currency converter",
      "live mid-market rates",
      h(
        "div",
        { class: "w-cur-row" },
        amt,
        fromSel,
        swap,
        toSel,
      ),
      h(
        "div",
        { class: "w-out-row w-cur-out-row" },
        result,
        copyBtn(() => (lastValue ? String(+lastValue.toFixed(6)) : ""), "copy result"),
      ),
      rateLine,
      stamp,
    );
  },
});

reg({
  id: "translate",
  match: parseTranslateQuery,
  build: ({ text = "", sl = "auto", tl = null }) => {
    const src = h(
      "textarea",
      {
        class: "w-tr-src",
        dir: "auto",
        maxlength: "5000",
        placeholder: "enter text…",
      },
      text,
    );
    const out = h("div", {
      class: "w-tr-out",
      dir: "auto",
      "aria-live": "polite",
    });
    const srcTl = h("div", { class: "w-tr-translit", dir: "auto" });
    const outTl = h("div", { class: "w-tr-translit", dir: "auto" });
    const alts = h("div", { class: "w-tr-alts" });
    const dym = h("div", { class: "w-tr-dym" });
    const status = h("span", { class: "w-tr-status" });
    const count = h("span", { class: "w-tr-count" });
    const dict = h("div", { class: "w-tr-dict" });
    const link = h(
      "a",
      { class: "w-tr-link", href: "/translate" },
      "full translator ↗",
    );

    const setOut = (value) => {
      if (value == null)
        out.replaceChildren(h("span", { class: "w-tr-ph" }, "translation"));
      else out.textContent = value;
    };
    const syncCount = () => {
      count.textContent = `${src.value.length} / 5000`;
    };
    const clearExtras = () => {
      srcTl.textContent = "";
      outTl.textContent = "";
      alts.replaceChildren();
      dym.replaceChildren();
      dict.replaceChildren();
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
      title: "swap languages",
      "aria-label": "swap languages",
      html: SWAP,
    });
    const syncSwap = () => {
      swap.disabled = slP.value === "auto" && !slP.detected;
    };

    let ctrl, timer;
    let flipped = false;

    const syncLink = () => {
      link.href = `/translate?sl=${encodeURIComponent(slP.value)}&tl=${encodeURIComponent(tlP.value)}&text=${encodeURIComponent(src.value.slice(0, 2000))}`;
    };

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
                "div",
                { class: "w-tr-dict-meaning" },
                h("span", { class: "w-tr-dict-pos" }, m.partOfSpeech),
                m.definitions?.[0]?.definition || "",
              ),
            ),
        );
      } catch {}
    };

    const renderExtras = (data) => {
      outTl.textContent = data.transliteration || "";
      srcTl.textContent = data.srcTransliteration || "";
      alts.replaceChildren();
      if (data.alternatives?.length) {
        alts.append(h("span", { class: "w-tr-alts-label" }, "alternatives"));
        for (const a of data.alternatives)
          alts.append(
            h("button", {
              class: "w-tr-alt",
              dir: "auto",
              html: "",
              onclick: () => {
                setOut(a);
                outTl.textContent = "";
              },
            }),
          );
        for (const [i, a] of data.alternatives.entries())
          alts.children[i + 1].textContent = a;
      }
      dym.replaceChildren();
      if (data.didYouMean) {
        const fix = h("button", { class: "w-tr-dym-btn" }, data.didYouMean);
        fix.onclick = () => {
          src.value = data.didYouMean;
          syncCount();
          run();
        };
        dym.append("did you mean: ", fix);
      }
    };

    const run = async () => {
      ctrl?.abort();
      const value = src.value.trim();
      clearExtras();
      syncLink();
      if (!value) {
        setOut(null);
        out.classList.remove("err");
        status.textContent = "";
        slP.setDetected(null);
        syncSwap();
        return;
      }
      ctrl = new AbortController();
      status.textContent = "translating…";
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
        setOut(data.translatedText);
        out.classList.remove("err");
        status.textContent = "";
        if (slP.value === "auto") slP.setDetected(det);
        syncSwap();
        syncLink();
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
        setOut(e.message || "translation failed");
        out.classList.add("err");
        status.textContent = "";
      }
    };

    const go = (delay = 500) => {
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    };

    src.oninput = () => {
      syncCount();
      go();
    };

    swap.onclick = () => {
      const from = slP.value === "auto" ? slP.detected : slP.value;
      if (!from) return;
      const to = tlP.value;
      slP.value = to;
      tlP.value = from;
      if (!out.classList.contains("err") && !out.querySelector(".w-tr-ph"))
        src.value = out.textContent.slice(0, 5000);
      syncCount();
      run();
    };

    const clear = h("button", {
      class: "w-copy",
      title: "clear",
      "aria-label": "clear text",
      html: CLEAR,
    });
    clear.onclick = () => {
      src.value = "";
      syncCount();
      src.focus();
      run();
    };

    setOut(null);
    syncCount();
    syncSwap();
    syncLink();
    if (text) run();

    return h(
      "section",
      { class: "rich-result w w-tr-card" },
      h(
        "div",
        { class: "w-tr-head" },
        h("div", { class: "w-title" }, "translate"),
        link,
      ),
      h(
        "div",
        { class: "w-tr" },
        h(
          "div",
          { class: "w-tr-bar" },
          h("div", { class: "w-tr-slot" }, slP.el),
          swap,
          h("div", { class: "w-tr-slot" }, tlP.el),
        ),
        h(
          "div",
          { class: "w-tr-duo" },
          h(
            "div",
            { class: "w-tr-pane" },
            src,
            srcTl,
            dym,
            h(
              "div",
              { class: "w-tr-pane-foot" },
              speakButton(
                () => src.value,
                () => (slP.value === "auto" ? slP.detected : slP.value),
                "w-copy",
              ),
              count,
              clear,
            ),
          ),
          h(
            "div",
            { class: "w-tr-pane" },
            out,
            outTl,
            h(
              "div",
              { class: "w-tr-pane-foot" },
              speakButton(
                () => (out.querySelector(".w-tr-ph") ? "" : out.textContent),
                () => tlP.value,
                "w-copy",
              ),
              status,
              copyBtn(() =>
                out.querySelector(".w-tr-ph") ? "" : out.textContent,
              ),
            ),
          ),
        ),
        alts,
        dict,
      ),
    );
  },
});
// ─── engine ──────────────────────────────────────────────────────────────────

export function renderLocalWidgets(query) {
  if (!query) return null;
  const q = query.trim();
  if (!q || q.length > 600) return null;
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
}

export const __widgetCount = widgets.length;
