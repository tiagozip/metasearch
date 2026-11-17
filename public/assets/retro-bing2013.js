const footerLinks = [
  ["Privacy and Cookies", "/about#privacy"],
  ["Legal", "https://github.com/tiagozip/metasearch/blob/main/LICENSE"],
  ["Developers", "/api"],
  ["About our results", "/about"],
  ["Help", "/bangs"],
];

const buildFooter = (ctx) => {
  const footer = document.querySelector(".retro-footer");
  if (!footer || footer.childElementCount) return;
  const { el } = ctx;
  const items = [
    el("li", {}, el("span", { textContent: "© 2013 metasearch" }), " | "),
  ];
  for (const [text, href] of footerLinks)
    items.push(el("li", {}, el("a", { href, textContent: text }), " | "));
  items.push(
    el(
      "li",
      {},
      el("a", {
        href: "https://github.com/tiagozip/metasearch/issues",
        className: "b13-fb",
        textContent: "Feedback",
      }),
    ),
  );
  footer.append(el("ul", {}, ...items));
};

const home = (ctx) => {
  const { el } = ctx;
  const logo = document.querySelector(".retro-logo img");
  if (logo) {
    logo.src = "/s/retro-bing2013-home-logo.png";
    logo.alt = "metasearch";
  }
  const q = document.querySelector("input[name=q]");
  if (q) q.title = "Enter your search term";
  document.querySelector(".search-bar button")?.setAttribute("title", "Search");

  const topic = "Long-tailed widowbird";
  const scope = (pre, post) => {
    const v = q?.value.trim() || topic;
    return `/?q=${encodeURIComponent(`${pre}${v}`)}${post}`;
  };
  const scopes = [
    ["Images", "", "&type=images"],
    ["Videos", "!yt ", ""],
    ["Maps", "", "&type=maps"],
    ["News", "", "&type=news"],
  ];
  const items = scopes.map(([text, pre, post]) => {
    const a = el("a", { href: scope(pre, post), textContent: text });
    a.addEventListener("click", () => {
      a.href = scope(pre, post);
    });
    return el("li", {}, a);
  });
  items.push(
    el("li", {}, el("a", { href: "/bangs", textContent: "Search Tips" })),
    el("li", {}, el("a", { href: "/api", textContent: "More" })),
    el("li", { textContent: "|" }),
    el(
      "li",
      {},
      el("a", {
        href: "/?q=top+stories&type=news",
        className: "b13-plain",
        textContent: "metasearch News",
      }),
    ),
    el("li", { textContent: "|" }),
    el(
      "li",
      {},
      el("a", {
        href: "https://github.com/tiagozip/metasearch",
        className: "b13-plain",
        textContent: "Source",
      }),
    ),
  );
  document.body.prepend(
    el("div", { className: "b13-hdr" }, el("ul", {}, ...items)),
  );

  const settings = document.getElementById("open-settings");
  if (settings) {
    settings.title = "Preferences";
    settings.textContent = "Preferences";
    settings.before(
      el("a", {
        className: "b13-signin",
        href: "/about#default-engine",
        textContent: "Set as homepage",
      }),
    );
  }

  document.body.append(
    el(
      "div",
      { className: "b13-caption" },
      el(
        "a",
        {
          className: "b13-info",
          href: "/?q=Long-tailed+widowbird",
        },
        el(
          "span",
          {},
          el("p", {
            textContent:
              "Long-tailed widowbird male in breeding plumage, Marievale Bird Sanctuary, South Africa (© Richard Du Toit/Corbis)",
          }),
        ),
      ),
      el("a", {
        className: "b13-down",
        title: "About metasearch",
        href: "/about",
      }),
    ),
  );
};

const results = (ctx) => {
  const { el, q } = ctx;
  const tabs = document.querySelector("nav.tabs");
  if (!tabs) return;
  const names = { web: "Web", images: "Images", news: "News", maps: "Maps" };
  const byName = {};
  for (const tab of tabs.querySelectorAll("a.tab")) {
    const key = tab.textContent.trim().toLowerCase();
    if (names[key]) tab.textContent = names[key];
    byName[key] = tab;
  }
  const _enc = encodeURIComponent(q);
  const videos = el("a", {
    className: "b13-tab",
    href: `/?q=${encodeURIComponent(`!yt ${q}`)}`,
    textContent: "Videos",
  });
  const more = el("a", {
    className: "b13-tab",
    href: "/bangs",
    textContent: "More",
  });
  byName.images?.after(videos);
  if (byName.maps && byName.news) byName.news.before(byName.maps);
  tabs.querySelector("#options-btn")?.before(more);

  const btn = document.getElementById("options-btn");
  if (btn) {
    btn.title = "Preferences";
    btn.before(
      el("a", {
        className: "b13-signin-r",
        href: "/about#default-engine",
        textContent: "Set as homepage",
      }),
    );
  }
  const input = document.querySelector("header input[name=q]");
  if (input) input.title = "Enter your search term";
  document.querySelector(".search-bar button")?.setAttribute("title", "Search");
  document.title = `${q} - metasearch`;
};

export default {
  init(ctx) {
    if (ctx.page === "home") home(ctx);
    else results(ctx);
    buildFooter(ctx);
  },
};
