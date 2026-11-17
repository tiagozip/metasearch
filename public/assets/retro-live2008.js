const sep = () => " | ";

const row = (el, className, items) =>
  el(
    "ul",
    { className },
    ...items.map((item, i) =>
      el("li", {}, item, i < items.length - 1 ? sep() : ""),
    ),
  );

const link = (el, href, textContent) => el("a", { href, textContent });

const act = (el, textContent, id) => {
  const a = el("a", { href: "#", textContent });
  a.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById(id)?.click();
  });
  return a;
};

const goButton = (form) => {
  const btn = form?.querySelector("button[type=submit]");
  if (!btn) return;
  btn.title = "Search";
  btn.replaceChildren();
};

const settingsLink = (el) => {
  const s = document.getElementById("open-settings");
  if (s?.tagName !== "A") return act(el, "Options", "open-settings");
  s.textContent = "Options";
  return s;
};

const footer = (el, foot, home) => {
  foot.append(
    row(el, "lv-footL", [
      link(el, "/about", "© 2008 metasearch"),
      link(el, "/about#privacy", "Privacy"),
      link(el, "https://github.com/tiagozip/metasearch", "Open Source"),
    ]),
    row(el, "lv-footR", [
      link(el, "/about", "About"),
      link(el, "https://github.com/tiagozip/metasearch", "Self-hosting"),
      link(el, "/api", "Developers"),
      link(el, "/bangs", "Help"),
      link(el, "https://github.com/tiagozip/metasearch/issues", "Feedback"),
    ]),
  );
  if (!home)
    foot.prepend(
      el(
        "div",
        { className: "lv-mobile" },
        link(
          el,
          "/about#default-engine",
          "Make metasearch your default search.",
        ),
      ),
    );
};

const home = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  goButton(form);
  form.querySelector("input[name=q]")?.removeAttribute("placeholder");
  const top = el(
    "div",
    { className: "lv-top" },
    row(el, "lv-topL", [
      link(el, "/", "metasearch"),
      link(el, "/api", "metasearch Developer"),
      link(
        el,
        "https://github.com/tiagozip/metasearch",
        "metasearch Downloads",
      ),
    ]),
    row(el, "lv-topR", [
      link(el, "/about#privacy", "Privacy"),
      settingsLink(el),
      link(el, "/about#default-engine", "Default Search"),
      link(el, "/bangs", "Advanced Search Tips"),
    ]),
  );
  header.before(top);
  header.prepend(
    el(
      "div",
      { className: "lv-bar lv-bar1" },
      link(
        el,
        "/?q=celebrity&type=news",
        "Find out what your favorite star is up to on metasearch News.",
      ),
    ),
  );
  const scopes = el(
    "ul",
    { className: "lv-scopes" },
    el("li", { className: "lv-active", textContent: "Web" }),
    el("li", {}, link(el, "/?type=images", "Images")),
    el("li", {}, link(el, "/?type=news", "News")),
    el("li", {}, link(el, "/?type=maps", "Maps")),
    el(
      "li",
      {},
      el(
        "a",
        { href: "/bangs" },
        "More ",
        el("span", { className: "lv-arw", textContent: "▼" }),
      ),
    ),
  );
  form.prepend(scopes);
  header.append(
    el("div", { className: "lv-hpimg" }),
    el(
      "div",
      { className: "lv-bar lv-bar2" },
      link(
        el,
        "/?q=weather",
        "In a rush? Get instant answers for weather, math and currency",
      ),
      el("a", {
        className: "lv-tour",
        href: "/about",
        textContent: "Take a tour of metasearch",
      }),
    ),
  );
  const foot = document.querySelector(".retro-footer");
  if (foot) footer(el, foot, true);
};

const serp = (ctx) => {
  const { el, q, page } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  goButton(form);
  const tb = el(
    "div",
    { className: "lv-tb" },
    row(el, "lv-topL", [
      link(el, "/", "metasearch"),
      link(el, "/api", "metasearch Developer"),
      link(
        el,
        "https://github.com/tiagozip/metasearch",
        "metasearch Downloads",
      ),
      link(el, "/about", "About"),
    ]),
    row(el, "lv-topR", [
      link(el, "/about#privacy", "Privacy"),
      act(el, "Options", "open-settings"),
      link(el, "/about#default-engine", "Default Search"),
      link(el, "/bangs", "Search Tips"),
    ]),
  );
  document.body.prepend(tb);
  const nav = header?.querySelector("nav.tabs");
  const enc = encodeURIComponent(q);
  const names = { web: "Web", images: "Images", news: "News", maps: "Maps" };
  const opt = document.getElementById("options-btn");
  if (opt) {
    opt.title = "Advanced";
    for (const s of opt.querySelectorAll("svg")) s.remove();
    opt.prepend("Advanced");
  }
  const head = el(
    "div",
    { className: "lv-rh" },
    el("h1", { textContent: names[page] ?? "Web" }),
    el("span", { className: "lv-count" }),
    el("span", { className: "lv-bullet", textContent: "·" }),
  );
  const also = el("div", { className: "lv-also" }, "See also: ");
  const tabs = [...(nav?.querySelectorAll("a.tab") ?? [])].filter(
    (t) => !t.classList.contains("active"),
  );
  for (const t of tabs) {
    t.textContent = names[t.textContent.trim()] ?? t.textContent;
    t.classList.add("lv-scope");
    also.append(t, ", ");
  }
  also.append(
    el(
      "a",
      { href: `/bangs?q=${enc}`, className: "lv-scope" },
      "More ",
      el("span", { className: "lv-arw", textContent: "▼" }),
    ),
  );
  nav?.prepend(head, also);
  head.append(opt ?? "");
  const stats = document.querySelector(".retro-stats");
  const count = head.querySelector(".lv-count");
  const sync = () => {
    const n = Number(stats?.dataset.count ?? 0);
    count.textContent = `1-${Math.max(10, Math.min(n, 10))} of ${ctx.total} results`;
  };
  sync();
  if (stats) new MutationObserver(sync).observe(stats, { attributes: true });
  const foot = document.querySelector(".retro-footer");
  if (foot) footer(el, foot, false);
};

const cached = (ctx, art) => {
  const cite = art.querySelector(".retro-url");
  if (!cite || art.querySelector(".lv-meta")) return;
  const meta = ctx.el(
    "div",
    { className: "lv-meta" },
    cite,
    ctx.el("span", { className: "lv-dot", textContent: " · " }),
    ctx.el("a", {
      href: `https://web.archive.org/web/2008/${art.dataset.url}`,
      textContent: "Cached page",
    }),
  );
  art.querySelector(".result-content")?.append(meta);
};

export default {
  init(ctx) {
    if (ctx.page === "home") return home(ctx);
    serp(ctx);
    for (const art of document.querySelectorAll("#results-all article.result"))
      cached(ctx, art);
  },
  result(node, ctx) {
    if (node.matches?.("article.result")) cached(ctx, node);
    for (const art of node.querySelectorAll?.("article.result") ?? [])
      cached(ctx, art);
  },
};
