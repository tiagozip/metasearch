const gh = "https://github.com/tiagozip/metasearch";
const openSettings = () => document.getElementById("open-settings")?.click();
const act = (el, text, href, fn) =>
  el("a", {
    href,
    textContent: text,
    onclick: (e) => {
      e.preventDefault();
      fn();
    },
  });

const links = (el, items, sep = " | ") =>
  items.flatMap(([text, href], i) => [
    i ? sep : "",
    el("a", { href, textContent: text }),
  ]);

const netbar = (el) =>
  el(
    "div",
    { className: "ly-net" },
    el(
      "span",
      {},
      el(
        "b",
        {},
        "  ",
        el("a", { href: "/about", textContent: "metasearch Network" }),
      ),
      ": ",
      ...links(el, [
        ["Run Your Own", gh],
        ["Free API", "/api"],
        ["Search Tips", "/bangs"],
        ["Pictures", "/?q=dogs&type=images"],
        ["Web Search", "/"],
      ]),
    ),
    el("a", { href: "/about", textContent: "All Sites..." }),
  );

const searchrow = (ctx, form) => {
  const { el } = ctx;
  const bar = form.querySelector(".search-bar");
  const btn = bar?.querySelector("button[type=submit]");
  if (!bar || bar.dataset.ly) return;
  bar.dataset.ly = "1";
  btn?.setAttribute("aria-label", "Go Get It!");
  bar.prepend(
    el("img", {
      className: "ly-dog",
      src: "/s/retro-lycos1999-dog.png",
      alt: "",
    }),
    el("b", { className: "ly-for", textContent: "Search for " }),
  );
  const opt = document.getElementById("options-btn");
  const sub = el("div", { className: "ly-sub" });
  if (opt) {
    opt.textContent = "Advanced Search";
    opt.removeAttribute("aria-label");
    sub.append(
      el(
        "span",
        { className: "ly-optwrap" },
        opt,
        ...[document.getElementById("options-popup")].filter(Boolean),
      ),
    );
  } else
    sub.append(
      el("a", { href: "/bangs", textContent: "Advanced Search Tips" }),
    );
  sub.append(" | ", act(el, "Customize", "/about", openSettings));
  bar.after(sub);
};

const tools = (el) =>
  el(
    "div",
    { className: "ly-tools" },
    el("b", { textContent: "Tools" }),
    " ",
    ...links(
      el,
      [
        ["Help", "/bangs"],
        ["Message Boards", "/?q=forums"],
        ["Clubs", gh],
        ["Feedback", `${gh}/issues`],
        ["Developers", "/api"],
        ["Freeware", gh],
      ],
      "  ",
    ),
    "  ",
    el("b", { textContent: "Build" }),
    "  ",
    ...links(el, [["Your Own Engine", gh]], "  "),
    "  ",
    act(el, "My\u00a0metasearch", "/about", openSettings),
    el("br"),
    el("b", { textContent: "Find" }),
    " ",
    ...links(
      el,
      [
        ["MP3", "/?q=mp3"],
        ["News", "/?q=world&type=news"],
        ["Weather", "/?q=weather"],
        ["Stocks", "/?q=stock+market"],
        ["Yellow Pages", "/?q=restaurants&type=maps"],
        ["Cities", "/?q=city&type=maps"],
        ["People", "/?q=famous+people&type=images"],
        ["Road Maps", "/?q=road+map&type=maps"],
      ],
      "  ",
    ),
    "  ",
    el("b", { textContent: "Buy" }),
    "  ",
    ...links(
      el,
      [
        ["Books", "/?q=books"],
        ["Music", "/?q=music"],
      ],
      "  ",
    ),
  );

const dir = (el) =>
  el(
    "div",
    { className: "ly-dir" },
    ...[
      ["Arts & Entertainment", "Movies", "TV", "Music"],
      ["Recreation", "Autos", "Travel", "Outdoors"],
      ["Business & Careers", "Real Estate", "Jobs", "Investing"],
      ["Reference", "Education", "Libraries", "Dictionaries"],
      ["Computers & Internet", "Hardware", "Software", "Internet"],
      ["Regional", "US", "Canada", "Europe"],
      ["Games", "Computer", "Web", "Video"],
      ["Science & Technology", "Biology", "Astronomy", "Math"],
      ["Health", "Nutrition", "Diseases", "Fitness"],
      ["Shopping", "Auctions", "Classifieds", "Computers"],
      ["Home & Family", "Kids", "Recipes", "Gardens"],
      ["Society & Culture", "Religion", "People", "Women"],
      ["News", "Online", "Media", "Newspapers"],
      ["Sports", "Basketball", "Baseball", "Soccer"],
    ].map(([head, ...subs]) =>
      el(
        "div",
        {},
        el(
          "h3",
          {},
          el("a", {
            href: `/?q=${encodeURIComponent(head)}`,
            textContent: head,
          }),
        ),
        ...links(
          el,
          subs.map((t) => [t, `/?q=${encodeURIComponent(t)}`]),
          ", ",
        ),
        "...",
      ),
    ),
  );

const footer = (el) =>
  el(
    "div",
    { className: "ly-foot" },
    el("b", { textContent: "News from:" }),
    " ",
    ...links(
      el,
      [
        "Germany",
        "UK",
        "France",
        "Netherlands",
        "Italy",
        "Switzerland",
        "Belgium",
        "Spain",
        "Japan",
        "Denmark",
        "Sweden",
      ].map((c) => [c, `/?q=${encodeURIComponent(c)}&type=news`]),
      ", ",
    ),
    el(
      "p",
      {},
      ...links(
        el,
        [
          ["API Programs", "/api"],
          ["About metasearch", "/about"],
          ["Make metasearch Your Default", "/about#default-engine"],
          ["Self-hosting Solutions", gh],
          ["Free metasearch Software", gh],
        ],
        " - ",
      ),
      el("br"),
      ...links(
        el,
        [
          ["Contribute@metasearch", gh],
          ["metasearch Search for Missing Children", "/?q=missing+children"],
          ["Help", "/bangs"],
          ["Feedback", `${gh}/issues`],
        ],
        " - ",
      ),
    ),
    el(
      "p",
      {},
      el("img", {
        src: "/s/retro-lycos1999-foot.png",
        alt: "",
        width: 181,
        height: 31,
      }),
    ),
    el(
      "p",
      {},
      el("a", { href: "/about", textContent: "Copyright" }),
      " © 1999 metasearch. All Rights Reserved.",
      el("br"),
      "metasearch is a free, open search service.",
      el("br"),
      ...links(
        el,
        [
          ["Our Privacy Vow", "/about#privacy"],
          ["Data Sharing Terms", "/about#privacy"],
        ],
        " - ",
      ),
    ),
  );

export default {
  init(ctx) {
    const { el } = ctx;
    const header = document.querySelector("header");
    const form = header?.querySelector("form");
    header?.querySelector(".retro-logo")?.after(netbar(el));
    if (form) searchrow(ctx, form);
    for (const t of header?.querySelectorAll("nav.tabs a.tab") ?? [])
      t.textContent =
        {
          web: "Web Sites",
          images: "Pictures",
          news: "News",
          maps: "Road Maps",
        }[t.textContent.trim()] ?? t.textContent;
    if (ctx.page === "home") form?.after(tools(el), dir(el));
    document.querySelector(".retro-footer")?.append(footer(el));
  },
};
