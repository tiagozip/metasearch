const langs = [
  "any language",
  "Chinese",
  "Czech",
  "Danish",
  "Dutch",
  "English",
  "Estonian",
  "Finnish",
  "French",
  "German",
  "Greek",
  "Hebrew",
  "Hungarian",
  "Icelandic",
  "Italian",
  "Japanese",
  "Korean",
  "Latvian",
  "Lithuanian",
  "Norwegian",
  "Polish",
  "Portuguese",
  "Romanian",
  "Russian",
  "Spanish",
  "Swedish",
];

const sep = (el, items, glue = " - ") =>
  items.flatMap(([text, href, bold], i) => {
    const a = href.startsWith("@")
      ? act(el, text, href.slice(1))
      : el("a", { href, textContent: text });
    const node = bold ? el("b", {}, a) : a;
    return i ? [glue, node] : [node];
  });

const act = (el, textContent, id) => {
  const a = el("a", { href: "#", textContent });
  a.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById(id)?.click();
  });
  return a;
};

const select = (el, options) =>
  el("select", {}, ...options.map((t) => el("option", { textContent: t })));

const footer = (ctx) => {
  const { el } = ctx;
  const foot = document.querySelector(".retro-footer");
  if (!foot) return;
  const settings = document.getElementById("open-settings");
  const prefs =
    settings?.tagName === "A" ? settings : act(el, "", "open-settings");
  prefs.textContent = "Set your Preferences";
  foot.append(
    el("div", { className: "av-rule" }),
    el(
      "div",
      { className: "av-foot" },
      el(
        "div",
        { className: "av-foot-links" },
        el("a", { href: "/", textContent: "metasearch Home" }),
        " | ",
        el("a", { href: "/bangs", textContent: "Help" }),
        " | ",
        el("a", {
          href: "https://github.com/tiagozip/metasearch/issues",
          textContent: "Feedback",
        }),
        " | ",
        el("a", { href: "/api", textContent: "API Info" }),
        " | ",
        prefs,
        " | ",
        el("a", { href: "/bangs", textContent: "Search Tips" }),
        el("br"),
        el("a", {
          href: "https://github.com/tiagozip/metasearch",
          textContent: "Source Code",
        }),
        " | ",
        el("a", {
          href: "https://github.com/tiagozip/metasearch/blob/main/LICENSE",
          textContent: "License",
        }),
        " | ",
        el("a", { href: "/about#privacy", textContent: "Privacy" }),
        " | ",
        el("a", { href: "/bangs", textContent: "Our Search Network" }),
        " | ",
        el("a", { href: "/about", textContent: "About metasearch" }),
        " | ",
        el("a", {
          href: "https://github.com/tiagozip/metasearch",
          textContent: "Run Your Own",
        }),
      ),
    ),
  );
};

const searchButton = (form) => {
  const btn = form?.querySelector("button[type=submit]");
  if (!btn) return;
  btn.textContent = "Search";
  btn.removeAttribute("title");
};

const section = (el, first, rest) =>
  el(
    "div",
    { className: "av-sec" },
    el("font", { className: "av-cap" }, first),
    el("b", { textContent: rest }),
  );

const home = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  const bar = form.querySelector(".search-bar");
  bar.querySelector("input").removeAttribute("placeholder");
  form.prepend(
    el(
      "div",
      { className: "av-ask" },
      el(
        "span",
        {},
        el(
          "b",
          {},
          "Ask metasearch",
          el("sup", {}, el("small", { textContent: "TM" })),
          " a question.",
        ),
        "  Or enter a few words in ",
        select(el, langs),
      ),
      el(
        "span",
        { className: "av-help" },
        el("a", { href: "/about", textContent: "Help" }),
        " - ",
        el("a", { href: "/bangs", textContent: "Advanced" }),
      ),
    ),
  );
  bar.after(
    el(
      "div",
      { className: "av-example" },
      "Example: ",
      el("b", {
        textContent: "Where can I download mp3 files for instrumental music?",
      }),
    ),
  );
  const q = (t) => `/?q=${encodeURIComponent(t)}`;
  const specialty = el(
    "div",
    { className: "av-specialty" },
    el(
      "div",
      { className: "av-spec-title" },
      "Specialty",
      el("br"),
      "Searches",
    ),
    el(
      "div",
      { className: "av-spec-links" },
      ...sep(el, [
        ["AV Family Filter", "@open-settings", true],
        ["metasearch Photo & Media Finder", "/?type=images", true],
        ["AV Tools & Gadgets", "/bangs"],
      ]),
      el("br"),
      ...sep(el, [
        ["Online Shopping", q("online shopping")],
        ["AV Finance", q("stock quotes")],
        ["Health", q("health")],
        ["Industrial Communities", q("industry")],
        ["Careers", q("jobs")],
      ]),
      el("br"),
      ...sep(el, [
        ["Maps", "/?type=maps"],
        ["People Finder", q("people finder")],
        ["Travel", q("travel")],
        ["Newsgroups", "/?type=news"],
        ["Yellow Pages", q("yellow pages")],
        ["Entertainment", q("entertainment")],
      ]),
    ),
  );
  const cats = [
    "Automotive",
    "Business & Finance",
    "Computers & Internet",
    "Health & Fitness",
    "Hobbies & Interests",
    "Home & Family",
    "Media & Amusements",
    "People & Chat",
    "Reference & Education",
    "Shopping & Services",
    "Society & Politics",
    "Sports & Recreation",
    "Travel & Vacations",
  ];
  const dart = (text, href) =>
    el("div", { className: "av-dart" }, el("a", { href, textContent: text }));
  const columns = el(
    "div",
    { className: "av-cols" },
    el(
      "div",
      { className: "av-col av-col-cat" },
      section(el, "C", "ATEGORIES"),
      el("div", { className: "av-bar" }),
      el(
        "div",
        { className: "av-cats" },
        ...cats.map((c) => el("a", { href: q(c), textContent: c })),
      ),
    ),
    el(
      "div",
      { className: "av-col av-col-news" },
      el(
        "div",
        { className: "av-sec" },
        el("font", { className: "av-cap" }, "N"),
        el(
          "b",
          {},
          "EWS BY ",
          el("span", { className: "av-abc", textContent: "ABC" }),
          el("span", { className: "av-abcn", textContent: "NEWS.com" }),
        ),
      ),
      el("div", { className: "av-bar" }),
      el(
        "div",
        { className: "av-list" },
        dart("Today's top stories", "/?q=news&type=news"),
        dart("World news", "/?q=world&type=news"),
        dart("Technology news", "/?q=technology&type=news"),
        dart("Sports headlines", "/?q=sports&type=news"),
      ),
      el(
        "div",
        { className: "av-sec av-right" },
        el("font", { className: "av-cap" }, "M"),
        el("b", { textContent: "ETASEARCH " }),
        el("font", { className: "av-cap" }, "H"),
        el("b", { textContent: "IGHLIGHTS" }),
      ),
      el("div", { className: "av-bar" }),
      el(
        "div",
        { className: "av-list av-indent" },
        dart("Search with !bangs", "/bangs"),
        dart("Use the metasearch API", "/api"),
        dart(
          "Run your own metasearch",
          "https://github.com/tiagozip/metasearch",
        ),
        el(
          "div",
          { className: "av-dart" },
          el(
            "a",
            { href: "/?type=images" },
            el("span", { className: "av-new", textContent: "New" }),
            " metasearch Photo & Media Finder",
          ),
        ),
      ),
      section(el, "O", "THER SERVICES"),
      el("div", { className: "av-bar" }),
      el(
        "div",
        { className: "av-list av-indent av-plain" },
        el(
          "a",
          { href: "/about#default-engine" },
          el(
            "b",
            {},
            el("span", { className: "av-new", textContent: "Get" }),
            " metasearch Toolbar",
          ),
        ),
        " - ",
        el("a", {
          href: "https://github.com/tiagozip/metasearch/issues",
          textContent: "Email Us",
        }),
        el("br"),
        el("a", { href: "/api", textContent: "metasearch API 1.1" }),
        el("br"),
        el("a", { href: "/?type=maps", textContent: "Map Search Demo" }),
        " - ",
        el("a", { href: "/?type=images", textContent: "Free Photo Search" }),
        el("br"),
        el("a", {
          href: q("translate"),
          textContent: "AV Translation Services",
        }),
        " - ",
        el("a", { href: q("asian languages"), textContent: "Asian Languages" }),
        el("br"),
        el("a", {
          href: "/about#default-engine",
          textContent: "Make Us Your Homepage",
        }),
      ),
    ),
    el(
      "div",
      { className: "av-col av-col-spons" },
      el("b", { textContent: "Featured Sponsors" }),
      el("div", { className: "av-bar av-grey" }),
      el(
        "div",
        { className: "av-list av-indent av-spons" },
        el("a", {
          href: "https://github.com/tiagozip/metasearch",
          textContent: "metasearch - Open Source Super-Site",
        }),
        el("a", {
          href: "/about",
          textContent: "No ads, no tracking, no AI slop",
        }),
        el("a", { href: "/bangs", textContent: "13,000 bangs! Click HERE" }),
      ),
    ),
  );
  header.append(
    el("div", { className: "av-rule av-rule-gap" }),
    specialty,
    el("div", { className: "av-rule" }),
    columns,
  );
};

const results = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  const logo = header.querySelector(".retro-logo img");
  if (logo) logo.src = "/s/retro-altavista1999-results.png";
  const tabs = header.querySelector("nav.tabs");
  const labels = {
    web: "the Web",
    images: "Images",
    news: "News",
    maps: "Maps",
  };
  const sel = el("select", { className: "av-where" });
  for (const a of tabs?.querySelectorAll("a.tab") ?? []) {
    const key = a.textContent.trim();
    sel.append(
      el("option", {
        value: a.href,
        textContent: labels[key] ?? key,
        selected: a.classList.contains("active"),
      }),
    );
  }
  sel.addEventListener("change", () => {
    location.href = sel.value;
  });
  form.prepend(
    el(
      "div",
      { className: "av-ask" },
      el(
        "span",
        {},
        el("b", { textContent: "Search " }),
        sel,
        el("b", { textContent: " for documents in " }),
        select(el, langs),
      ),
    ),
  );
  const opt = document.getElementById("options-btn");
  if (opt) {
    opt.replaceChildren("Advanced Search");
    form
      .querySelector(".search-bar")
      ?.after(
        el(
          "div",
          { className: "av-example av-tip" },
          el(
            "span",
            {},
            el("b", { textContent: "Search tip: " }),
            "use quotation marks to search for an exact phrase.",
          ),
          opt,
        ),
      );
  }
  const stats = document.querySelector(".retro-stats");
  if (stats && ctx.page === "web") {
    stats.append(
      el("b", {
        textContent: `metasearch found ${ctx.total} Web pages for you.`,
      }),
      " ",
      act(el, "Refine your search", "options-btn"),
    );
  }
  if (stats && ctx.page !== "web") {
    stats.append(
      el("b", {
        textContent: `metasearch found ${ctx.total} ${labels[ctx.page] ?? ""} matches for you.`,
      }),
    );
  }
};

export default {
  init(ctx) {
    const form = document.querySelector("header form");
    searchButton(form);
    if (ctx.page === "home") home(ctx);
    else results(ctx);
    footer(ctx);
  },
  result(node, ctx) {
    const arts = node.matches?.("article.result")
      ? [node]
      : [...(node.querySelectorAll?.("article.result") ?? [])];
    for (const art of arts) {
      const cite = art.querySelector(".retro-url");
      if (!cite || cite.dataset.av) continue;
      cite.dataset.av = "1";
      const url = cite.textContent;
      const host = url.split("/")[0];
      const extra = ctx.el(
        "div",
        { className: "av-more" },
        "[ ",
        ctx.el("a", {
          href: `https://translate.google.com/translate?u=${encodeURIComponent(art.dataset.url)}`,
          textContent: "Translate",
        }),
        " ] ",
        ctx.el("a", {
          href: `/?q=${encodeURIComponent(`site:${host} ${ctx.q}`)}`,
          textContent: "More pages from this site",
        }),
      );
      cite.replaceChildren(
        ctx.el("span", { className: "av-url-label", textContent: "URL: " }),
        url,
      );
      cite.after(extra);
    }
  },
};
