const sp = (n = 4) => " ".repeat(n);

const buttons = (ctx, form) => {
  const btn = form.querySelector("button[type=submit]");
  if (!btn || btn.dataset.g) return;
  btn.dataset.g = "1";
  btn.textContent = "metasearch Search";
  const lucky = ctx.el("button", {
    type: "submit",
    className: "g-lucky",
    textContent: "I'm Feeling Lucky",
  });
  lucky.addEventListener("click", (e) => {
    const input = form.querySelector("input[name=q]");
    if (!input?.value.trim()) return;
    e.preventDefault();
    location.href = `/?q=${encodeURIComponent(`! ${input.value}`)}`;
  });
  btn.after(lucky);
};

const gh = "https://github.com/tiagozip/metasearch";

const prefs = (el, t) => {
  const a = el("a", { href: "#", textContent: t });
  a.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("open-settings")?.click();
  });
  return a;
};

const home = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  header.querySelector(".retro-logo img").src = "/s/retro-google2004-home.png";
  const tab = (t, params, fallback) => {
    const a = el("a", { href: fallback, textContent: t });
    a.addEventListener("click", (e) => {
      const v = form.querySelector("input[name=q]")?.value.trim();
      if (!v) return;
      e.preventDefault();
      location.href = `/?${new URLSearchParams({ q: v, ...params })}`;
    });
    return a;
  };
  const tabs = el(
    "div",
    { className: "g-tabs" },
    el("b", { textContent: "Web" }),
    sp(),
    tab("Images", { type: "images" }, "/?type=images"),
    sp(),
    tab(
      "Groups",
      { lens: "forums" },
      `/?q=${encodeURIComponent("usenet")}&lens=forums`,
    ),
    sp(),
    tab("News", { type: "news" }, "/?type=news"),
    sp(),
    tab("Local", { type: "maps" }, "/?type=maps"),
    sp(),
    el("b", {}, el("a", { href: "/bangs", textContent: "more »" })),
  );
  form.before(tabs);
  const settings = document.getElementById("open-settings");
  const side = el(
    "div",
    { className: "g-side" },
    el("a", { href: "/bangs", textContent: "Search Tips" }),
  );
  if (settings) {
    settings.textContent = "Preferences";
    side.append(settings);
  }
  side.append(prefs(el, "Language Tools"));
  form.querySelector(".search-bar")?.after(side);
  buttons(ctx, form);
  const foot = document.querySelector(".retro-footer");
  foot.append(
    el(
      "div",
      { className: "g-foot-links" },
      el("a", { href: "/api", textContent: "API Programs" }),
      " - ",
      el("a", { href: gh, textContent: "Self-hosting Solutions" }),
      " - ",
      el("a", { href: "/about", textContent: "About metasearch" }),
    ),
    el(
      "p",
      { className: "g-copy" },
      "©2004 metasearch - ",
      el("a", { href: "/about#privacy", textContent: "Privacy" }),
    ),
  );
};

const results = (ctx) => {
  const { el, q, total, secs } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (form) buttons(ctx, form);
  const nav = header?.querySelector("nav.tabs");
  for (const t of nav?.querySelectorAll("a.tab") ?? [])
    t.textContent = t.textContent.trim().replace(/^./, (c) => c.toUpperCase());
  const opt = document.getElementById("options-btn");
  const links = el("div", { className: "g-toplinks" }, sp());
  if (opt) {
    opt.textContent = "Advanced Search";
    links.append(opt, sp());
  }
  links.append(
    prefs(el, "Preferences"),
    sp(),
    el("a", { href: "/bangs", textContent: "Search Tips" }),
  );
  nav?.before(links);
  const stats = document.querySelector(".retro-stats");
  if (stats && q) {
    const label =
      { web: "the web", images: "images", news: "news", maps: "maps" }[
        ctx.page
      ] ?? "the web";
    stats.replaceChildren(
      el(
        "span",
        { className: "g-l" },
        `Searched ${label} for `,
        el(
          "b",
          {},
          el("a", {
            href: `/?q=${encodeURIComponent(`!wiktionary ${q}`)}`,
            textContent: q,
          }),
        ),
        ".",
      ),
      el(
        "span",
        { className: "g-r" },
        "Results ",
        el("b", { textContent: "1 - 10" }),
        " of about ",
        el("b", { textContent: total }),
        ".  Search took ",
        el("b", { textContent: secs }),
        " seconds.",
      ),
    );
  }
  const foot = document.querySelector(".retro-footer");
  const bar = el("div", { className: "g-bar" });
  const items = [
    ["metasearch Bang Directory", "/bangs"],
    ["Contribute", gh],
    ["API Programs", "/api"],
    ["Add metasearch to your Browser", "/about#default-engine"],
  ];
  for (const [t, h] of items)
    bar.append(el("a", { href: h, textContent: t }), " - ");
  bar.append(prefs(el, "metasearch in your Language"), " - ");
  bar.append(
    el(
      "b",
      {},
      el("a", { href: "/about", textContent: "All About metasearch" }),
    ),
  );
  foot.append(
    bar,
    el(
      "div",
      { className: "g-copy" },
      "©2004 metasearch - ",
      el("a", { href: "/about#privacy", textContent: "Privacy" }),
    ),
  );
};

export default {
  init(ctx) {
    document.title = ctx.q ? `metasearch Search: ${ctx.q}` : "metasearch";
    if (ctx.page === "home") return home(ctx);
    results(ctx);
  },
  result(node, ctx) {
    const arts = node.matches?.("article.result")
      ? [node]
      : [...(node.querySelectorAll?.("article.result") ?? [])];
    for (const art of arts) {
      const cite = art.querySelector(".retro-url");
      if (!cite || cite.dataset.g) continue;
      cite.dataset.g = "1";
      const url = art.dataset.url ?? "";
      const size = `${((url.length * 7) % 60) + 5}k`;
      const extra = ctx.el(
        "span",
        { className: "g-extra" },
        ` - ${size} - `,
        ctx.el("a", {
          href: `https://web.archive.org/web/2004/${url}`,
          className: "l",
          textContent: "Cached",
        }),
        " - ",
        ctx.el("a", {
          href: `/?q=${encodeURIComponent(`related:${cite.textContent}`)}`,
          className: "l",
          textContent: "Similar pages",
        }),
      );
      cite.after(extra);
    }
  },
};
