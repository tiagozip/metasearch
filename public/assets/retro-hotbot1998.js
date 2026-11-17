const sel = (el, cls, opts) =>
  el(
    "select",
    { className: cls },
    ...opts.map((t) => el("option", { textContent: t })),
  );

const gh = "https://github.com/tiagozip/metasearch";
const act = (el, text, href, fn) =>
  el("a", {
    href,
    textContent: text,
    onclick: (e) => {
      e.preventDefault();
      fn();
    },
  });
const openSettings = () => document.getElementById("open-settings")?.click();
const lens = (v) => {
  const s = document.getElementById("lens-select");
  if (!s) return;
  s.value = v;
  s.dispatchEvent(new Event("change", { bubbles: true }));
};

const home = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  const btn = form.querySelector("button[type=submit]");
  if (btn) btn.textContent = "SEARCH";
  const input = form.querySelector("input[name=q]");
  if (input) input.placeholder = "";
  header.prepend(
    el(
      "div",
      { className: "hb-promo" },
      "Broken down? ",
      el("br"),
      el("a", { href: "/?q=new+cars", textContent: "Find a new car" }),
      " on metasearch.",
    ),
  );
  const settings = document.getElementById("open-settings");
  if (settings) settings.textContent = "Preferences";
  const bar = form.querySelector(".search-bar");
  bar?.prepend(
    el("div", { className: "hb-redbar", textContent: "Search the Web" }),
  );
  const check = (t) =>
    el("label", {}, el("input", { type: "checkbox" }), ` ${t}`);
  input?.after(
    el(
      "div",
      { className: "hb-opts" },
      sel(el, "hb-s1", [
        "all the words",
        "any of the words",
        "exact phrase",
        "the page title",
        "the person",
        "links to this URL",
        "Boolean phrase",
      ]),
      sel(el, "hb-s2", [
        "anytime",
        "in the last week",
        "in the last 2 weeks",
        "in the last month",
        "in the last 3 months",
        "in the last 6 months",
        "in the last year",
        "in the last 2 years",
      ]),
      sel(el, "hb-s3", [
        "any language",
        "Dutch",
        "English",
        "Finnish",
        "French",
        "German",
        "Italian",
        "Portuguese",
        "Spanish",
        "Swedish",
      ]),
      el("div", { textContent: "Pages Must Include:" }),
      el(
        "div",
        { className: "hb-checks" },
        check("image"),
        check("audio"),
        check("video"),
        check("JavaScript"),
      ),
      el("div", { textContent: "Return Results:" }),
      el(
        "div",
        {},
        sel(el, "hb-s4", ["10", "25", "50", "100"]),
        " ",
        sel(el, "hb-s5", [
          "full descriptions",
          "brief descriptions",
          "URLs only",
        ]),
      ),
    ),
  );
  form.append(
    el(
      "a",
      {
        className: "hb-mso",
        href: "/bangs",
        onclick: (e) => {
          e.preventDefault();
          openSettings();
        },
      },
      el("img", {
        src: "/s/retro-hotbot1998-mso.gif",
        alt: "More Search Options",
      }),
    ),
  );
  const also = [
    ["Discussion Groups", "/?q=forums"],
    ["Yellow Pages", "/?q=yellow+pages"],
    ["White Pages", "/?q=white+pages"],
    ["Search Tips", "/bangs"],
    ["Shopping", "/?q=shopping"],
    ["Domain Names", "/?q=domain+names"],
    ["Classifieds", "/?q=classifieds"],
    ["Homes & Loans", "/?q=mortgage"],
    ["Stocks", "/?q=stocks"],
    ["Free Download", gh],
    ["Music", "/?q=music"],
    ["Jobs & Résumés", "/?q=jobs"],
    ["API Service", "/api"],
    ["Road Maps", "/?q=maps&type=maps"],
  ];
  header.append(
    el(
      "div",
      { className: "hb-also" },
      el("b", {}, el("i", { textContent: "Also Search:" })),
      ...also.map(([t, h]) => el("a", { href: h, textContent: t })),
      ...(settings ? [settings] : []),
    ),
  );
  const cat = (t, d, h = `/?q=${encodeURIComponent(t.toLowerCase())}`) =>
    el(
      "div",
      { className: "hb-cat" },
      el("a", { href: h, textContent: t }),
      el("div", { textContent: d }),
    );
  const section = (title, left, right) =>
    el(
      "div",
      { className: "hb-sec" },
      title ? el("div", { className: "hb-green", textContent: title }) : "",
      el(
        "div",
        { className: "hb-cols" },
        el("div", {}, ...left),
        el("div", {}, ...right),
      ),
    );
  const right = el(
    "div",
    { className: "hb-right" },
    el("div", { className: "hb-navmap", textContent: "" }),
    section(
      "",
      [
        cat(
          "Holiday Gift Guide",
          "Books, Music, Clothes, Food, Jewelry, Toys ....",
          "/?q=gift+guide",
        ),
      ],
      [
        cat(
          "Holiday Resources",
          "Holiday Sites, Recipes, Greeting Cards, Clip Art ...",
          "/?q=holiday",
        ),
      ],
    ),
    section(
      "Stay Informed",
      [
        cat("News", "business, tech, politics ...", "/?q=news&type=news"),
        cat("Sports", "scores, stats, schedules ..."),
        cat("Entertainment", "movies, music, books ..."),
      ],
      [
        cat(
          "Reference",
          "dictionaries, encyclopedias, time zones, zip codes ...",
        ),
        cat("Health", "diseases & symptoms, fitness, self-help ..."),
      ],
    ),
    section(
      "Manage Your Money",
      [
        cat("Finance", "stocks, mutual funds, indexes, portfolios ..."),
        cat("Jobs", "job listings, résumés ..."),
      ],
      [
        cat("Business", "investment, small business ..."),
        cat("Education", "college, K-12, adult ed ..."),
      ],
    ),
    section(
      "Plan a Purchase",
      [
        cat("Cars", "buy, sell, price, research ..."),
        cat("Home & Real Estate", "buy, sell, mortgage, remodel ..."),
      ],
      [
        cat("Travel", "vacations, airfare, hotels ..."),
        cat(
          "Shopping Directory",
          "auctions, clothes, food, wine, toys, computers ...",
        ),
      ],
    ),
    section(
      "Use Technology",
      [
        cat("Computers", "hardware, software, peripherals, reviews ..."),
        cat("Downloads & Games", "free software, games, MP3 ..."),
      ],
      [cat("Web Development", "tutorials, tips, tools ...")],
    ),
    el("div", { className: "hb-purple", textContent: "metasearch Online" }),
    el(
      "div",
      { className: "hb-foot" },
      ...[
        ["metasearch News", "/?q=tech+news&type=news"],
        ["Source Workshop", gh],
        ["RGB Gallery", "/?q=rgb+art&type=images"],
        ["Animation Express", "/?q=animation"],
        ["Search 101", "/bangs"],
        ["Daily Snark", "/?q=humor"],
        ["metasearch Magazine", "/about"],
      ].flatMap(([t, h], i) => [
        i ? " | " : "",
        el("a", { href: h, textContent: t }),
      ]),
      el(
        "p",
        {},
        "Be a ",
        el("a", { href: gh, textContent: "beta tester" }),
        ".",
        el("br"),
        "Run your own ",
        el("a", { href: gh, textContent: "metasearch server" }),
        ".",
      ),
      el(
        "p",
        {},
        ...[
          ["Send us feedback", "https://github.com/tiagozip/metasearch/issues"],
          ["Contribute to metasearch", gh],
          ["API Programs", "/api"],
          ["About metasearch Digital", "/about"],
          ["Our Privacy Policy", "/about#privacy"],
          ["Search Tips", "/bangs"],
        ].flatMap(([t, h], i) => [
          i ? " | " : "",
          el("a", { href: h, textContent: t }),
        ]),
      ),
      el(
        "p",
        {},
        el("a", { href: "/about", textContent: "Copyright" }),
        " © 1994-98 metasearch Digital Inc. All rights reserved.",
      ),
    ),
  );
  document.querySelector(".retro-footer")?.append(right);
};

const results = (ctx) => {
  const { el, q } = ctx;
  const header = document.querySelector("header");
  if (!header) return;
  const enc = encodeURIComponent(q);
  header.prepend(
    el(
      "div",
      { className: "hb-top" },
      el("span", { className: "hb-free", textContent: "Free Services" }),
      ...[
        ["SOURCE CODE", gh],
        ["RUN YOUR OWN", gh],
        ["DEVELOPER API", "/api"],
        ["PERSONAL GUIDE", "/bangs"],
      ].flatMap(([t, h]) => [
        el("span", { className: "hb-dot", textContent: " · " }),
        el("a", { href: h, textContent: t }),
      ]),
      el("span", { className: "hb-dot", textContent: " · " }),
      act(el, "MESSAGE BOARDS", `/?q=${enc}+forum`, () => lens("forums")),
    ),
  );
  const btn = header.querySelector("button[type=submit]");
  if (btn) btn.textContent = "SEARCH";
  header
    .querySelector(".search-bar")
    ?.prepend(el("span", { className: "hb-rf", textContent: "Results for" }));
  header
    .querySelector(".search-bar")
    ?.append(
      el(
        "label",
        { className: "hb-within" },
        el("span", {}, "Search within", el("br"), "these results"),
        el("input", { type: "checkbox" }),
      ),
    );
  const optBtn = document.getElementById("options-btn");
  const settings = act(el, "PREFERENCES", "/about", openSettings);
  const link = (t, h) => el("a", { href: h, textContent: t });
  const side = el(
    "div",
    { className: "hb-side" },
    el(
      "div",
      { className: "hb-big" },
      link("REVISE SEARCH", `/?q=${enc}`),
      link("NEW SEARCH", "/"),
      optBtn
        ? el(
            "span",
            { className: "hb-optwrap" },
            optBtn,
            ...[document.getElementById("options-popup")].filter(Boolean),
          )
        : link("ADVANCED SEARCH", "/bangs"),
      settings,
    ),
    el("div", { className: "hb-h", textContent: "Search Resources" }),
    ...[
      ["Web", `/?q=${enc}`],
      ["Images", `/?q=${enc}&type=images`],
      ["News Headlines", `/?q=${enc}&type=news`],
      ["Road Maps", `/?q=${enc}&type=maps`],
      ["Yellow Pages", `/?q=${encodeURIComponent(`${q} near me`)}&type=maps`],
      ["Encyclopedia", `/?q=${encodeURIComponent(`${q} wikipedia`)}`],
      ["Free Downloads", `/?q=${encodeURIComponent(`${q} download`)}`],
      ["Stock Quotes", `/?q=${encodeURIComponent(`${q} stock`)}`],
      ["Jobs & Résumés", `/?q=${encodeURIComponent(`${q} jobs`)}`],
    ].map(([t, h]) => link(t, h)),
    act(
      el,
      "Discussion Groups",
      `/?q=${encodeURIComponent(`${q} forum`)}`,
      () => lens("forums"),
    ),
    act(
      el,
      "Research Papers",
      `/?q=${encodeURIComponent(`${q} research`)}`,
      () => lens("academic"),
    ),
    act(el, "FTP Search", `/?q=${encodeURIComponent(`${q} pdf`)}`, () =>
      lens("pdfs"),
    ),
    el("div", { className: "hb-h", textContent: "Shopping Resources" }),
    ...[
      "Shopping Directory",
      "Books",
      "Hardware",
      "Classifieds",
      "Music",
      "Travel",
      "New & Used Cars",
    ].map((t) =>
      link(t, `/?q=${encodeURIComponent(`${q} ${t.toLowerCase()}`)}`),
    ),
  );
  if (optBtn) {
    optBtn.textContent = "ADVANCED SEARCH";
    optBtn.removeAttribute("aria-label");
  }
  header.append(side);
  const stats = document.querySelector(".retro-stats");
  if (stats) {
    const label =
      ctx.page === "web" ? "WEB RESULTS" : `${ctx.page.toUpperCase()} RESULTS`;
    stats.replaceChildren(
      el("b", { className: "hb-red", textContent: `${label}  ` }),
      `${ctx.total} Matches  `,
      el("b", { textContent: "1 - 10 " }),
      " ",
      el("a", { href: `/?q=${enc}`, textContent: "next" }),
      " ",
      el("b", { className: "hb-gt", textContent: ">>" }),
    );
  }
  const foot = document.querySelector(".retro-footer");
  foot?.append(
    el("b", { className: "hb-red", textContent: "SECOND OPINION" }),
    el("br"),
    el(
      "span",
      { className: "hb-small" },
      `try your search for "${q}" with `,
      link("metasearch Images", `/?q=${enc}&type=images`),
    ),
    el(
      "p",
      { className: "hb-small" },
      link("Copyright", "/about"),
      " © 1994-99 metasearch Digital Inc. All rights reserved.",
    ),
  );
};

const relevance = new WeakMap();
let rank = 99;

export default {
  init(ctx) {
    if (ctx.page === "home") return home(ctx);
    results(ctx);
  },
  result(node, ctx) {
    const arts = node.matches?.("article.result")
      ? [node]
      : [...(node.querySelectorAll?.("article.result") ?? [])];
    for (const art of arts) {
      const content = art.querySelector(".result-content");
      if (!content || content.querySelector(".hb-meta")) continue;
      const cite = content.querySelector(".retro-url");
      if (!cite) continue;
      if (!relevance.has(art)) {
        relevance.set(art, rank);
        rank = Math.max(51, rank - (rank > 90 ? 1 : 2));
      }
      const age = art.querySelector(".age")?.textContent?.trim();
      const url = art.dataset.url ?? "";
      const host = url.replace(/^https?:\/\//, "").split("/")[0];
      cite.remove();
      const meta = ctx.el(
        "div",
        { className: "hb-meta" },
        ctx.el("b", { textContent: `${relevance.get(art)}%  ` }),
        age ? ctx.el("i", { textContent: `${age}  ` }) : "",
        cite,
        ctx.el("br"),
        "See results from ",
        ctx.el("a", {
          href: `/?q=${encodeURIComponent(`${ctx.q} site:${host}`)}`,
          textContent: "this site only",
        }),
        ".",
      );
      content.append(meta);
      cite.textContent = url.startsWith("http") ? url : `http://${url}`;
    }
  },
};
