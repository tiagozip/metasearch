const MASCOTS = ["teto", "spongebob", "gumi", "miku", "ralsei"];
const ACCENTS = [
  ["blue", "#89b4fa"],
  ["lavender", "#b4befe"],
  ["mauve", "#cba6f7"],
  ["pink", "#f5c2e7"],
  ["red", "#f38ba8"],
  ["peach", "#fab387"],
  ["yellow", "#f9e2af"],
  ["green", "#a6e3a1"],
  ["teal", "#94e2d5"],
  ["sky", "#89dceb"],
];
const RULE_KEYS = { block: "b", raise: "r", lower: "l" };

const store = {
  get(k) {
    try {
      return localStorage.getItem(k) || "";
    } catch {
      return "";
    }
  },
  set(k, v) {
    try {
      if (v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    } catch {}
  },
};

const cookie = {
  get: (k) => document.cookie.match(new RegExp(`(?:^|;\\s*)${k}=([^;]*)`))?.[1],
  set: (k, v) => {
    document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`;
  },
};

export const prefs = {
  get linksOnly() {
    return cookie.get("links_only") === "1";
  },
  get newTab() {
    return store.get("ms-newtab") === "1";
  },
  get highlight() {
    return store.get("ms-highlight") !== "0";
  },
  get safe() {
    const v = cookie.get("safesearch");
    return ["off", "moderate", "strict"].includes(v) ? v : "moderate";
  },
  get bold() {
    return store.get("ms-bold") !== "0";
  },
  get domains() {
    try {
      return JSON.parse(store.get("ms-domains") || "{}");
    } catch {
      return {};
    }
  },
  get lenses() {
    try {
      return JSON.parse(store.get("ms-lenses") || "[]");
    } catch {
      return [];
    }
  },
};

const changed = () => {
  const out = document.getElementById("mss-link");
  if (out) out.value = settingsLink();
  dispatchEvent(new CustomEvent("ms-prefs"));
};

const calm = () => {
  const d = document.documentElement;
  d.classList.add("no-transitions");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => d.classList.remove("no-transitions")),
  );
};

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const settingsLink = () => {
  const domains = Object.fromEntries(
    Object.entries(prefs.domains).map(([h, r]) => [h, RULE_KEYS[r]]),
  );
  const cfg = {
    ...(store.get("ms-theme") === "amoled" ? { t: "amoled" } : {}),
    ...(store.get("ms-mascot") ? { m: store.get("ms-mascot") } : {}),
    ...(store.get("ms-accent") ? { a: store.get("ms-accent") } : {}),
    ...(cookie.get("engine") ? { e: cookie.get("engine") } : {}),
    ...(prefs.safe !== "moderate" ? { s: prefs.safe } : {}),
    ...(prefs.linksOnly ? { l: 1 } : {}),
    ...(prefs.newTab ? { n: 1 } : {}),
    ...(prefs.highlight ? {} : { h: 0 }),
    ...(prefs.bold ? {} : { b: 0 }),
    ...(Object.keys(domains).length ? { d: domains } : {}),
    ...(prefs.lenses.length ? { c: prefs.lenses } : {}),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(cfg));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `${location.origin}/?cfg=${b64}`;
};

let dialog;

const section = (title, ...children) =>
  el(
    "section",
    { className: "mss-section" },
    el("h3", { textContent: title }),
    el("div", { className: "mss-group" }, ...children),
  );

const toggle = (label, desc, checked, onChange) => {
  const input = el("input", { type: "checkbox", checked });
  input.addEventListener("change", () => onChange(input.checked));
  return el(
    "label",
    { className: "mss-row mss-toggle" },
    el(
      "span",
      { className: "mss-text" },
      el("span", { className: "mss-label", textContent: label }),
      ...(desc
        ? [el("span", { className: "mss-desc", textContent: desc })]
        : []),
    ),
    el(
      "span",
      { className: "mss-switch" },
      input,
      el("span", { className: "mss-slider" }),
    ),
  );
};

const segmented = (label, options, value, onChange) => {
  const group = el("div", {
    className: "mss-segmented",
    role: "radiogroup",
    ariaLabel: label,
  });
  const select = (v) => {
    group.style.setProperty(
      "--i",
      Math.max(
        0,
        options.findIndex(([x]) => x === v),
      ),
    );
    for (const [i, b] of buttons.entries())
      b.ariaChecked = String(options[i][0] === v);
  };
  const buttons = options.map(([v, text]) => {
    const b = el("button", {
      type: "button",
      role: "radio",
      textContent: text,
    });
    b.addEventListener("click", () => {
      select(v);
      onChange(v);
    });
    return b;
  });
  group.style.setProperty("--n", options.length);
  group.append(
    el("span", { className: "mss-thumb", ariaHidden: "true" }),
    ...buttons,
  );
  select(value);
  return group;
};

const searchSection = () =>
  section(
    "search",
    el(
      "div",
      { className: "mss-row mss-stack" },
      el(
        "span",
        { className: "mss-text" },
        el("span", { className: "mss-label", textContent: "safe search" }),
        el("span", {
          className: "mss-desc",
          textContent: "filters explicit results from web, images and news",
        }),
      ),
      segmented(
        "safe search",
        [
          ["off", "off"],
          ["moderate", "moderate"],
          ["strict", "strict"],
        ],
        prefs.safe,
        (v) => {
          if (v === "moderate")
            document.cookie = "safesearch=; path=/; max-age=0";
          else cookie.set("safesearch", v);
          changed();
        },
      ),
    ),
  );

const resultsSection = () =>
  section(
    "results",
    toggle(
      "links only",
      "hide answers, discussions, news and videos",
      prefs.linksOnly,
      (on) => {
        cookie.set("links_only", on ? 1 : 0);
        changed();
      },
    ),
    toggle("open results in a new tab", "", prefs.newTab, (on) => {
      store.set("ms-newtab", on ? "1" : "");
      changed();
    }),
    toggle(
      "highlight answers in people also ask",
      "marks the main point of each answer",
      prefs.highlight,
      (on) => {
        store.set("ms-highlight", on ? "" : "0");
        changed();
      },
    ),
    toggle(
      "bold words in descriptions",
      "the words the search engine marks as relevant",
      prefs.bold,
      (on) => {
        store.set("ms-bold", on ? "" : "0");
        changed();
      },
    ),
  );

const SITE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const hostOf = (raw) => {
  let host = raw.trim().toLowerCase();
  try {
    host = new URL(host.includes("://") ? host : `https://${host}`).hostname;
  } catch {}
  return host.replace(/^www\./, "");
};

const readRule = (raw) => {
  const value = raw.trim();
  if (!value) return { empty: true };
  if (/^\/.+\/$/s.test(value)) {
    if (value.length > 202)
      return { error: "keep regexes under 200 characters" };
    try {
      const re = new RegExp(value.slice(1, -1), "i");
      return { pattern: value, kind: "regex", test: (url) => re.test(url) };
    } catch {
      return { error: "this regex has a syntax error" };
    }
  }
  if (value.includes("*")) {
    const pattern = value.toLowerCase();
    if (!/^[a-z0-9*.-]{1,253}$/.test(pattern) || !/[a-z0-9]/.test(pattern))
      return {
        error: "wildcards can only use letters, numbers, dots, dashes and *",
      };
    const body = pattern
      .split("*")
      .map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    const re = new RegExp(`^(?:.+\\.)?${body}$`);
    return { pattern, kind: "wildcard", test: (url) => re.test(hostOf(url)) };
  }
  const pattern = hostOf(value);
  if (!SITE.test(pattern)) return { error: "that doesn't look like a domain" };
  return {
    pattern,
    kind: "domain",
    test: (url) => {
      const h = hostOf(url);
      return h === pattern || h.endsWith(`.${pattern}`);
    },
  };
};

const field = (label, control, hint) => {
  const id = `mss-f-${Math.random().toString(36).slice(2, 8)}`;
  const labelable = control.matches("input, select, textarea");
  const caption = el(labelable ? "label" : "span", {
    className: "mss-field-label",
    id: `${id}-label`,
    textContent: label,
  });
  if (labelable) {
    control.id = id;
    caption.htmlFor = id;
  } else control.setAttribute("aria-labelledby", caption.id);
  const children = [caption, control];
  if (hint) {
    hint.id = `${id}-hint`;
    control.setAttribute("aria-describedby", hint.id);
    children.push(hint);
  }
  return el("div", { className: "mss-field-block" }, ...children);
};

const modal = ({ title, fields, submit, onSubmit }) => {
  const cancel = el("button", {
    type: "button",
    className: "mss-btn mss-btn-quiet",
    textContent: "cancel",
  });
  const form = el(
    "form",
    { className: "mss-modal-form", noValidate: true },
    el("h3", { className: "mss-modal-title", textContent: title }),
    ...fields,
    el(
      "div",
      { className: "mss-modal-actions" },
      cancel,
      el("button", {
        type: "submit",
        className: "mss-btn mss-btn-primary",
        textContent: submit,
      }),
    ),
  );
  const box = el("dialog", { className: "mss-modal", ariaLabel: title }, form);
  cancel.addEventListener("click", () => box.close());
  box.addEventListener("click", (e) => {
    if (e.target === box) box.close();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (onSubmit()) box.close();
  });
  box.addEventListener("close", () => setTimeout(() => box.remove(), 200));
  document.body.append(box);
  box.showModal();
  return box;
};

const editRule = (current, onSave) => {
  const input = el("input", {
    type: "text",
    inputMode: "url",
    value: current?.pattern || "",
    placeholder: "pinterest.*",
    autocomplete: "off",
    spellcheck: false,
  });
  const hint = el("p", { className: "mss-hint" });
  const tryInput = el("input", {
    type: "text",
    inputMode: "url",
    placeholder: "https://www.pinterest.co.uk/pin/123",
    autocomplete: "off",
    spellcheck: false,
  });
  const tryResult = el("p", { className: "mss-hint", role: "status" });
  let action = current?.rule || "block";

  const update = () => {
    const r = readRule(input.value);
    input.setAttribute("aria-invalid", String(Boolean(r.error)));
    hint.dataset.state = r.error ? "error" : "";
    hint.textContent =
      r.error ||
      {
        domain: `covers ${r.pattern} and all of its subdomains`,
        wildcard:
          "* stands for anything, so pinterest.* covers pinterest.com and pinterest.co.uk",
        regex: "checked against the full url, ignoring case",
      }[r.kind] ||
      "a domain like pinterest.com, a wildcard like pinterest.* or a regex between slashes like /reddit\\.com\\/r\\/funny/";
    const url = tryInput.value.trim();
    tryResult.dataset.state = "";
    if (!url || !r.test) {
      tryResult.textContent = "";
      return;
    }
    const full = url.includes("://") ? url : `https://${url}`;
    const hit = r.test(full);
    tryResult.dataset.state = hit ? "match" : "";
    tryResult.textContent = hit
      ? `this rule would ${action} it`
      : "this rule doesn't touch it";
  };
  input.addEventListener("input", update);
  tryInput.addEventListener("input", update);
  update();

  modal({
    title: current ? "edit rule" : "add a rule",
    fields: [
      field("site or pattern", input, hint),
      field(
        "action",
        segmented(
          "action",
          [
            ["block", "block"],
            ["raise", "raise"],
            ["lower", "lower"],
          ],
          action,
          (v) => {
            action = v;
            update();
          },
        ),
      ),
      field("try it on a url", tryInput, tryResult),
    ],
    submit: current ? "save rule" : "add rule",
    onSubmit: () => {
      const r = readRule(input.value);
      if (!r.pattern) {
        input.setAttribute("aria-invalid", "true");
        if (r.empty) {
          hint.dataset.state = "error";
          hint.textContent = "type a domain, a wildcard or a regex";
        }
        input.focus();
        return false;
      }
      onSave(r.pattern, action);
      return true;
    },
  });
  input.focus();
};

const glyph = (kind) =>
  el("span", {
    className: "mss-favicon mss-glyph",
    textContent: kind === "regex" ? "/" : "*",
    ariaHidden: "true",
  });

const domainsSection = () => {
  const list = el("ul", { className: "mss-domains" });
  const save = (d) => {
    store.set("ms-domains", Object.keys(d).length ? JSON.stringify(d) : "");
    render();
    changed();
  };
  const render = () => {
    const entries = Object.entries(prefs.domains).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    list.replaceChildren(
      ...entries.map(([pattern, rule]) => {
        const kind = readRule(pattern).kind;
        const remove = el("button", {
          type: "button",
          className: "mss-remove",
          ariaLabel: `remove ${pattern}`,
          title: "remove",
        });
        remove.innerHTML =
          '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
        remove.addEventListener("click", () => {
          const d = prefs.domains;
          delete d[pattern];
          save(d);
        });
        let icon;
        if (kind === "domain") {
          icon = el("img", {
            className: "mss-favicon",
            src: `https://external-content.duckduckgo.com/ip3/${pattern}.ico`,
            alt: "",
            loading: "lazy",
          });
          icon.onerror = () =>
            icon.replaceWith(el("span", { className: "mss-favicon" }));
        } else icon = glyph(kind);
        const label = el("span", { textContent: rule });
        const picker = el(
          "select",
          { ariaLabel: `rule for ${pattern}` },
          ...Object.keys(RULE_KEYS).map((r) =>
            el("option", { value: r, textContent: r, selected: r === rule }),
          ),
        );
        const ruleEl = el(
          "label",
          { className: `mss-rule mss-rule-${rule}` },
          label,
          el("span", { className: "mss-chevron", ariaHidden: "true" }),
          picker,
        );
        picker.addEventListener("change", () => {
          ruleEl.className = `mss-rule mss-rule-${picker.value}`;
          label.textContent = picker.value;
          store.set(
            "ms-domains",
            JSON.stringify({ ...prefs.domains, [pattern]: picker.value }),
          );
          changed();
        });
        const edit = el("button", {
          type: "button",
          className: "mss-host",
          textContent: pattern,
          title: `edit ${pattern}`,
        });
        edit.addEventListener("click", () =>
          editRule(
            { pattern, rule: prefs.domains[pattern] || rule },
            (p, r) => {
              const d = prefs.domains;
              delete d[pattern];
              save({ ...d, [p]: r });
            },
          ),
        );
        return el("li", { className: "mss-row" }, icon, edit, ruleEl, remove);
      }),
    );
    list.hidden = !entries.length;
  };

  const add = el("button", {
    type: "button",
    className: "mss-row mss-add",
  });
  add.innerHTML =
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span>add a rule</span>';
  add.addEventListener("click", () =>
    editRule(null, (p, r) => save({ ...prefs.domains, [p]: r })),
  );
  render();

  return section(
    "domains",
    el(
      "p",
      { className: "mss-row mss-desc mss-intro" },
      "block sites or move them up or down in your results. wildcards like pinterest.* and regexes work too.",
    ),
    list,
    add,
  );
};

const FILETYPES = ["pdf", "docx", "pptx", "xlsx", "epub", "txt"];

const readSites = (raw) => {
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  const sites = [...new Set(parts.map(hostOf))];
  const bad = sites.filter((s) => !SITE.test(s));
  return { sites: sites.filter((s) => SITE.test(s)).slice(0, 30), bad };
};

const editLens = (current, onSave) => {
  const name = el("input", {
    type: "text",
    value: current?.n || "",
    placeholder: "small web",
    maxLength: 32,
    autocomplete: "off",
  });
  const only = el("textarea", {
    rows: 3,
    value: (current?.i || []).join("\n"),
    placeholder: "lobste.rs\nnews.ycombinator.com",
    spellcheck: false,
  });
  const skip = el("textarea", {
    rows: 2,
    value: (current?.x || []).join("\n"),
    placeholder: "medium.com",
    spellcheck: false,
  });
  const words = el("input", {
    type: "text",
    value: current?.k || "",
    placeholder: "rust -javascript",
    autocomplete: "off",
    spellcheck: false,
  });
  const type = el(
    "select",
    { className: "mss-select" },
    el("option", { value: "", textContent: "any" }),
    ...FILETYPES.map((f) =>
      el("option", { value: f, textContent: f, selected: current?.f === f }),
    ),
  );
  const error = el("p", { className: "mss-hint", role: "alert" });
  error.dataset.state = "error";

  modal({
    title: current ? "edit lens" : "new lens",
    fields: [
      field("name", name),
      field(
        "only search these sites",
        only,
        el("p", {
          className: "mss-hint",
          textContent: "one per line, subdomains included",
        }),
      ),
      field("never show these sites", skip),
      field(
        "add these words",
        words,
        el("p", {
          className: "mss-hint",
          textContent: "put a - before a word to leave it out",
        }),
      ),
      field("file type", type),
      error,
    ],
    submit: current ? "save lens" : "create lens",
    onSubmit: () => {
      for (const c of [name, only, skip, words])
        c.removeAttribute("aria-invalid");
      const fail = (control, text) => {
        control.setAttribute("aria-invalid", "true");
        error.textContent = text;
        control.focus();
        return false;
      };
      const n = name.value.trim().replace(/\s+/g, " ");
      if (!n) return fail(name, "give the lens a name");
      const i = readSites(only.value);
      if (i.bad.length) return fail(only, `not a site: ${i.bad.join(", ")}`);
      const x = readSites(skip.value);
      if (x.bad.length) return fail(skip, `not a site: ${x.bad.join(", ")}`);
      const k = words.value.trim().split(/\s+/).filter(Boolean);
      const badWord = k.find((w) => !/^-?[\p{L}\p{N}_.'+#-]{1,40}$/u.test(w));
      if (badWord)
        return fail(words, `words can't contain symbols like in "${badWord}"`);
      const lens = {
        n,
        i: i.sites,
        x: x.sites,
        k: k.slice(0, 10).join(" "),
        f: type.value,
      };
      if (!(lens.i.length || lens.x.length || lens.k || lens.f))
        return fail(only, "add at least one site, word or file type");
      onSave(lens);
      return true;
    },
  });
  name.focus();
};

const lensSummary = (l) =>
  [
    l.i.length ? `${l.i.length} ${l.i.length === 1 ? "site" : "sites"}` : "",
    l.x.length ? `${l.x.length} left out` : "",
    l.k ? `"${l.k}"` : "",
    l.f ? `${l.f} only` : "",
  ]
    .filter(Boolean)
    .join(", ");

const lensesSection = () => {
  const list = el("ul", { className: "mss-domains" });
  const save = (lenses) => {
    store.set("ms-lenses", lenses.length ? JSON.stringify(lenses) : "");
    render();
    changed();
  };
  const render = () => {
    const lenses = prefs.lenses;
    list.replaceChildren(
      ...lenses.map((l, index) => {
        const edit = el(
          "button",
          { type: "button", className: "mss-lens", title: `edit ${l.n}` },
          el("span", { className: "mss-label", textContent: l.n }),
          el("span", { className: "mss-desc", textContent: lensSummary(l) }),
        );
        edit.addEventListener("click", () =>
          editLens(l, (next) => {
            const all = prefs.lenses;
            all[index] = next;
            save(all);
          }),
        );
        const remove = el("button", {
          type: "button",
          className: "mss-remove",
          ariaLabel: `remove ${l.n}`,
          title: "remove",
        });
        remove.innerHTML =
          '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
        remove.addEventListener("click", () =>
          save(prefs.lenses.filter((_, i) => i !== index)),
        );
        return el("li", { className: "mss-row" }, edit, remove);
      }),
    );
    list.hidden = !lenses.length;
  };
  render();

  const add = el("button", { type: "button", className: "mss-row mss-add" });
  add.innerHTML =
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span>new lens</span>';
  const create = () =>
    editLens(null, (lens) => save([...prefs.lenses, lens].slice(0, 20)));
  add.addEventListener("click", create);

  const node = section(
    "lenses",
    el(
      "p",
      { className: "mss-row mss-desc mss-intro" },
      "your own lenses show up in the lens menu on the results page, next to the built-in ones.",
    ),
    list,
    add,
  );
  node.create = create;
  return node;
};

const appearanceSection = () => {
  const d = document.documentElement;

  const tiles = MASCOTS.map((m) => {
    const tile = el(
      "button",
      { type: "button", className: "mss-mascot", title: m },
      el("img", { src: `/s/${m}.webp`, alt: "" }),
      el("span", { textContent: m }),
    );
    tile.addEventListener("click", () => {
      calm();
      if (m === "teto") delete d.dataset.mascot;
      else d.dataset.mascot = m;
      store.set("ms-mascot", m === "teto" ? "" : m);
      for (const f of document.querySelectorAll("link[rel~=icon]"))
        f.href = `/s/${m}.webp`;
      sync();
      changed();
    });
    return tile;
  });

  const swatches = ACCENTS.map(([name, c]) => {
    const s = el("button", {
      type: "button",
      className: "mss-swatch",
      title: name,
      ariaLabel: name,
    });
    s.style.background = c;
    s.addEventListener("click", () => {
      calm();
      accent(c);
    });
    return s;
  });
  const custom = el("input", { type: "color", value: "#89b4fa" });
  custom.addEventListener("input", () => accent(custom.value));
  const reset = el("button", {
    type: "button",
    className: "mss-btn mss-btn-quiet",
    textContent: "reset",
  });
  reset.addEventListener("click", () => accent(""));

  const accent = (c) => {
    if (c) d.style.setProperty("--blue", c);
    else d.style.removeProperty("--blue");
    store.set("ms-accent", c);
    if (c) custom.value = c;
    sync();
    changed();
  };

  const sync = () => {
    const m = store.get("ms-mascot") || "teto";
    const a = store.get("ms-accent").toLowerCase();
    for (const [i, t] of tiles.entries())
      t.setAttribute("aria-pressed", String(MASCOTS[i] === m));
    for (const [i, s] of swatches.entries())
      s.setAttribute("aria-pressed", String(ACCENTS[i][1] === a));
    reset.hidden = !a;
  };
  sync();

  return section(
    "appearance",
    toggle(
      "amoled mode",
      "pure black background",
      d.dataset.theme === "amoled",
      (on) => {
        calm();
        if (on) d.dataset.theme = "amoled";
        else delete d.dataset.theme;
        store.set("ms-theme", on ? "amoled" : "");
        changed();
      },
    ),
    el(
      "div",
      { className: "mss-row mss-stack" },
      el(
        "span",
        { className: "mss-text" },
        el("span", { className: "mss-label", textContent: "mascot" }),
        el("span", {
          className: "mss-desc",
          textContent: "changes the logo, favicon and accent",
        }),
      ),
      el("div", { className: "mss-mascots" }, ...tiles),
    ),
    el(
      "div",
      { className: "mss-row mss-stack" },
      el(
        "span",
        { className: "mss-text" },
        el("span", { className: "mss-label", textContent: "accent color" }),
        el("span", {
          className: "mss-desc",
          textContent: "overrides the mascot's accent",
        }),
      ),
      el(
        "div",
        { className: "mss-accents" },
        ...swatches,
        el(
          "label",
          {
            className: "mss-custom",
            title: "custom",
            ariaLabel: "custom accent color",
          },
          custom,
        ),
        reset,
      ),
    ),
  );
};

const linkSection = () => {
  const out = el("input", { type: "text", readOnly: true, id: "mss-link" });
  const copy = el("button", {
    type: "button",
    className: "mss-btn",
    textContent: "copy",
  });
  copy.addEventListener("click", async () => {
    out.value = settingsLink();
    try {
      await navigator.clipboard.writeText(out.value);
      copy.textContent = "copied";
    } catch {
      out.select();
      copy.textContent = "select it";
    }
    setTimeout(() => {
      copy.textContent = "copy";
    }, 1600);
  });
  out.addEventListener("focus", () => out.select());
  out.value = settingsLink();

  const reset = el("button", {
    type: "button",
    className: "mss-row mss-danger",
    textContent: "reset all settings",
  });
  let armed;
  reset.addEventListener("click", () => {
    if (!armed) {
      reset.textContent = "click again to reset everything";
      armed = setTimeout(() => {
        armed = null;
        reset.textContent = "reset all settings";
      }, 3000);
      return;
    }
    for (const k of [
      "ms-theme",
      "ms-mascot",
      "ms-accent",
      "ms-newtab",
      "ms-highlight",
      "ms-bold",
      "ms-domains",
      "ms-lenses",
    ])
      store.set(k, "");
    for (const k of ["links_only", "safesearch", "engine"])
      document.cookie = `${k}=; path=/; max-age=0`;
    location.reload();
  });

  return section(
    "your settings",
    el(
      "div",
      { className: "mss-row mss-stack" },
      el(
        "span",
        { className: "mss-text" },
        el("span", { className: "mss-label", textContent: "settings link" }),
        el("label", {
          className: "mss-desc",
          htmlFor: "mss-link",
          textContent:
            "restores everything here, even in a browser that clears cookies. add &q=%s to use it as a search engine url.",
        }),
      ),
      el("div", { className: "mss-field" }, out, copy),
    ),
    reset,
  );
};

let css;
const loadCss = () => {
  css ??= new Promise((resolve) => {
    const link = el("link", { rel: "stylesheet", href: "/s/settings.css" });
    link.onload = link.onerror = resolve;
    document.head.append(link);
  });
  return css;
};

const build = () => {
  const close = el("button", {
    type: "button",
    className: "mss-close",
    ariaLabel: "close settings",
  });
  close.innerHTML =
    '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  close.addEventListener("click", () => dialog.close());

  dialog = el(
    "dialog",
    { className: "mss", ariaLabel: "settings" },
    el(
      "div",
      { className: "mss-head" },
      el("h2", { textContent: "settings" }),
      close,
    ),
    el(
      "div",
      { className: "mss-body" },
      ...[
        searchSection(),
        resultsSection(),
        domainsSection(),
        lensesSection(),
        appearanceSection(),
        linkSection(),
      ].map((node, i) => {
        node.style.setProperty("--d", i);
        return node;
      }),
    ),
  );
  const body = dialog.querySelector(".mss-body");
  body.addEventListener(
    "scroll",
    () => dialog.toggleAttribute("data-scrolled", body.scrollTop > 0),
    { passive: true },
  );
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  const self = dialog;
  self.addEventListener("close", () => {
    setTimeout(() => {
      if (self.open) return;
      if (dialog === self) {
        document.documentElement.style.removeProperty("overflow");
        document.documentElement.style.removeProperty("padding-right");
      }
      self.remove();
    }, 240);
  });
  document.body.append(dialog);
};

export async function openSettings(target) {
  if (dialog?.open) return;
  await loadCss();
  dialog?.remove();
  build();
  dialog.tabIndex = -1;
  const root = document.documentElement;
  const before = document.body.getBoundingClientRect().width;
  root.style.overflow = "hidden";
  const freed = document.body.getBoundingClientRect().width - before;
  if (freed > 0) root.style.paddingRight = `${freed}px`;
  const probe = el("div");
  probe.style.cssText = "position:fixed;top:0;right:0;width:0;height:0";
  document.body.append(probe);
  const gap = innerWidth - probe.getBoundingClientRect().right;
  probe.remove();
  if (gap > 0) dialog.style.setProperty("--mss-gutter", `${gap}px`);
  dialog.showModal();
  dialog.focus();
  if (target === "new-lens") {
    const lenses = [...dialog.querySelectorAll(".mss-section")].find(
      (n) => n.create,
    );
    lenses.scrollIntoView({ block: "start" });
    lenses.create();
  }
}
