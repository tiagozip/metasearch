const tabList = [
  ["Web", "web"],
  ["Images", "images"],
  ["Video", "web", " video"],
  ["Shortcuts", "bangs"],
  ["Local", "maps"],
  ["News", "news"],
  ["Shopping", "web", " price"],
];

const prefs = (el, label) => {
  const a = el("a", { href: "/about#settings", textContent: label });
  a.addEventListener("click", (e) => {
    const s = document.getElementById("open-settings");
    if (!s || s === a) return;
    e.preventDefault();
    s.click();
  });
  return a;
};

const topBar = (ctx) => {
  const { el } = ctx;
  return el(
    "div",
    { className: "y-hdr" },
    el("a", { className: "y-yhm", href: "/", textContent: "metasearch!" }),
    el(
      "span",
      { className: "y-hdr-r" },
      prefs(el, "My metasearch!"),
      " - ",
      el("a", { href: "/api", textContent: "Developer API" }),
      " - ",
      el("a", { href: "/bangs", textContent: "Help" }),
    ),
  );
};

const tabs = (ctx, current) => {
  const { el, q } = ctx;
  const box = el("div", { className: "y-tabs" });
  tabList.forEach(([label, type, suffix], i) => {
    if (i) box.append(el("span", { className: "y-sep", textContent: " | " }));
    if (
      label.toLowerCase() === current ||
      (current === "maps" && label === "Local")
    ) {
      box.append(el("strong", { textContent: label }));
      return;
    }
    if (type === "bangs") {
      box.append(el("a", { href: "/bangs", textContent: label }));
      return;
    }
    const term = suffix && q ? `${q}${suffix}` : q;
    const qs = term
      ? `q=${encodeURIComponent(term)}${type === "web" ? "" : `&type=${type}`}`
      : type === "web"
        ? ""
        : `type=${type}`;
    box.append(el("a", { href: qs ? `/?${qs}` : "/", textContent: label }));
  });
  box.append(" ", el("em", {}, "[", prefs(el, "Edit"), "]"));
  return box;
};

const footer = (ctx) => {
  const { el } = ctx;
  const foot = document.querySelector(".retro-footer");
  if (!foot || foot.childElementCount) return;
  foot.append(
    el(
      "p",
      {},
      "Copyright © 2005 metasearch. All rights reserved. ",
      el("a", { href: "/about#privacy", textContent: "Privacy Policy" }),
      " - ",
      el("a", { href: "/about", textContent: "About metasearch" }),
      " - ",
      el("a", {
        href: "/about#default-engine",
        textContent: "Make metasearch your Home Page",
      }),
      " - ",
      el("a", {
        href: "https://github.com/tiagozip/metasearch",
        textContent: "Run Your Own",
      }),
      " - ",
      el("a", {
        href: "https://github.com/tiagozip/metasearch",
        textContent: "Contribute",
      }),
    ),
  );
};

const home = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  document.body.prepend(topBar(ctx));
  form.before(tabs(ctx, "web"));
  form
    .querySelector(".search-bar")
    ?.before(el("label", { className: "y-label", textContent: "Web Search" }));
  const btn = form.querySelector("button[type=submit]");
  if (btn) btn.textContent = "Search the Web";
  const settings = document.getElementById("open-settings");
  const side = el(
    "p",
    { className: "y-side" },
    el("a", { href: "/bangs", textContent: "Search Tips" }),
    el("a", { href: "/api", textContent: "Developer API" }),
  );
  if (settings) {
    settings.textContent = "Preferences";
    side.append(settings);
  }
  form.querySelector(".search-container")?.append(side);
  form.after(
    el(
      "p",
      { className: "y-try" },
      "Try ",
      el("a", {
        href: "https://github.com/tiagozip/metasearch",
        textContent: "metasearch Server",
      }),
      " ",
      el("em", { textContent: "BETA" }),
      " - Download it, run it, keep your searches to yourself.",
    ),
  );
  footer(ctx);
};

const results = (ctx) => {
  const { el, q, total, secs, page } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  document.body.prepend(topBar(ctx));
  const nav = header?.querySelector("nav.tabs");
  const opt = document.getElementById("options-btn");
  if (form) {
    form.querySelector(".search-bar")?.before(tabs(ctx, page));
    const btn = form.querySelector("button[type=submit]");
    if (btn) btn.textContent = "Search";
    const side = el(
      "span",
      { className: "y-side" },
      el("a", { href: "/bangs", textContent: "Search Tips" }),
      el("span", { textContent: " | " }),
    );
    if (opt) {
      opt.textContent = "Advanced Search";
      side.append(opt);
    }
    side.append(el("span", { textContent: " | " }), prefs(el, "Preferences"));
    form.querySelector(".search-bar")?.after(side);
  }
  if (nav) nav.classList.add("y-hidden-tabs");
  const stats = document.querySelector(".retro-stats");
  if (stats) {
    const label =
      { web: "Web", images: "Images", news: "News", maps: "Local" }[page] ??
      "Web";
    stats.replaceChildren(
      el("h2", { textContent: `${label} Results` }),
      el(
        "p",
        {},
        "Results ",
        el("strong", { textContent: "1 - 10" }),
        " of about ",
        el("strong", { textContent: total }),
        " for ",
        el("strong", { textContent: q }),
        ` - ${secs} sec. (`,
        el("a", { href: "/about", textContent: "About this page" }),
        ")",
      ),
    );
  }
  footer(ctx);
};

export default {
  init(ctx) {
    if (ctx.page === "home") return home(ctx);
    results(ctx);
  },
  result(node, ctx) {
    const { el } = ctx;
    const arts = node.matches?.("article.result")
      ? [node]
      : [...(node.querySelectorAll?.("article.result") ?? [])];
    for (const art of arts) {
      const cite = art.querySelector(".retro-url");
      if (!cite || cite.dataset.y) continue;
      cite.dataset.y = "1";
      const host = cite.textContent.split("/")[0];
      const kb = `${((cite.textContent.length * 7) % 90) + 9}k`;
      cite.append(
        el(
          "span",
          { className: "y-meta" },
          ` - ${kb} - `,
          el("a", {
            href: `https://web.archive.org/web/2005/${art.dataset.url}`,
            textContent: "Cached",
          }),
          " - ",
          el("a", {
            href: `/?q=${encodeURIComponent(`site:${host} ${ctx.q}`)}`,
            textContent: "More from this site",
          }),
        ),
      );
    }
  },
};
