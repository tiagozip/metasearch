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
      "highlight answers",
      "mark the main point in people also ask",
      prefs.highlight,
      (on) => {
        store.set("ms-highlight", on ? "" : "0");
        changed();
      },
    ),
    toggle(
      "bold matching words",
      "in result descriptions",
      prefs.bold,
      (on) => {
        store.set("ms-bold", on ? "" : "0");
        changed();
      },
    ),
  );

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
      ...entries.map(([host, rule]) => {
        const remove = el("button", {
          type: "button",
          className: "mss-remove",
          ariaLabel: `remove ${host}`,
          title: "remove",
        });
        remove.innerHTML =
          '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
        remove.addEventListener("click", () => {
          const d = prefs.domains;
          delete d[host];
          save(d);
        });
        const icon = el("img", {
          className: "mss-favicon",
          src: `https://external-content.duckduckgo.com/ip3/${host}.ico`,
          alt: "",
          loading: "lazy",
        });
        icon.onerror = () =>
          icon.replaceWith(el("span", { className: "mss-favicon" }));
        const label = el("span", { textContent: rule });
        const picker = el(
          "select",
          { ariaLabel: `rule for ${host}` },
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
            JSON.stringify({ ...prefs.domains, [host]: picker.value }),
          );
          changed();
        });
        return el(
          "li",
          { className: "mss-row" },
          icon,
          el("span", { className: "mss-host", textContent: host, title: host }),
          ruleEl,
          remove,
        );
      }),
    );
    list.hidden = !entries.length;
  };

  const input = el("input", {
    type: "text",
    inputMode: "url",
    placeholder: "pinterest.com",
    autocomplete: "off",
    spellcheck: false,
    id: "mss-domain",
  });
  const rule = el(
    "select",
    { ariaLabel: "rule", className: "mss-select" },
    ...Object.keys(RULE_KEYS).map((r) =>
      el("option", { value: r, textContent: r }),
    ),
  );
  const form = el(
    "form",
    { className: "mss-field" },
    input,
    rule,
    el("button", { type: "submit", className: "mss-btn", textContent: "add" }),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let host = input.value.trim().toLowerCase();
    try {
      host = new URL(host.includes("://") ? host : `https://${host}`).hostname;
    } catch {}
    host = host.replace(/^www\./, "");
    const ok = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host);
    input.setAttribute("aria-invalid", String(!ok));
    if (!ok) return input.focus();
    save({ ...prefs.domains, [host]: rule.value });
    input.value = "";
  });
  input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
  render();

  return section(
    "domains",
    el(
      "div",
      { className: "mss-row mss-stack" },
      el("label", {
        className: "mss-desc",
        htmlFor: "mss-domain",
        textContent:
          "block a site, or move it up or down in your results. subdomains count too.",
      }),
      form,
    ),
    list,
  );
};

const appearanceSection = () => {
  const d = document.documentElement;

  const tiles = MASCOTS.map((m) => {
    const tile = el(
      "button",
      { type: "button", className: "mss-mascot", title: m },
      el("img", { src: `/s/${m}.png`, alt: "" }),
      el("span", { textContent: m }),
    );
    tile.addEventListener("click", () => {
      calm();
      if (m === "teto") delete d.dataset.mascot;
      else d.dataset.mascot = m;
      store.set("ms-mascot", m === "teto" ? "" : m);
      for (const f of document.querySelectorAll("link[rel~=icon]"))
        f.href = `/s/${m}.png`;
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

export async function openSettings() {
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
}
