const verticals = (ctx, current) => {
  const { el, q } = ctx;
  const enc = encodeURIComponent(q);
  const items = [
    ["Web", "web", q ? `/?q=${enc}` : "/"],
    ["News", "news", q ? `/?q=${enc}&type=news` : "/?type=news"],
    ["Images", "images", q ? `/?q=${enc}&type=images` : "/?type=images"],
    ["Local", "maps", q ? `/?q=${enc}&type=maps` : "/?type=maps"],
    [
      "Encyclopedia",
      "",
      q ? `/?q=${encodeURIComponent(`${q} wikipedia`)}` : "",
    ],
  ];
  return el(
    "ul",
    { className: "m-vnav" },
    ...items
      .filter(([, , href]) => href)
      .map(([label, key, href]) =>
        el(
          "li",
          { className: key && key === current ? "selected" : "" },
          key && key === current
            ? el("span", { textContent: label })
            : el("a", { href, textContent: label }),
        ),
      ),
  );
};

const prefs = (el, label) => {
  const a = el("a", { href: "/about#settings", textContent: label });
  a.addEventListener("click", (e) => {
    const s = document.getElementById("open-settings");
    if (!s) return;
    e.preventDefault();
    s.click();
  });
  return a;
};

const searchButton = (form) => {
  const btn = form?.querySelector("button[type=submit]");
  if (!btn || btn.dataset.m) return;
  btn.dataset.m = "1";
  btn.className = "m-btn";
  btn.textContent = "Search";
};

const footer = (ctx) => {
  const { el } = ctx;
  const foot = document.querySelector(".retro-footer");
  if (!foot) return;
  const links = [
    ["metasearch Home", "/"],
    ["metasearch Server", "https://github.com/tiagozip/metasearch"],
    ["metasearch Developer API", "/api"],
    ["Search Shortcuts", "/bangs"],
    ["About metasearch Search", "/about"],
  ];
  foot.append(
    el(
      "ul",
      { className: "m-foot" },
      ...links.map(([label, href], i) =>
        el(
          "li",
          { className: i ? "" : "first" },
          el("a", { href, textContent: label }),
        ),
      ),
    ),
    el(
      "div",
      { className: "m-copy" },
      "© 2005 metasearch. ",
      el("a", { href: "/about#privacy", textContent: "Privacy" }),
      " | ",
      el("a", {
        href: "/about#default-engine",
        textContent: "Make metasearch your default",
      }),
    ),
  );
};

const home = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  header.classList.add("m-hp");
  header
    .querySelector(".retro-logo")
    ?.append(el("span", { textContent: "Search" }));
  form.prepend(verticals(ctx, ""));
  const input = form.querySelector("input[name=q]");
  input?.removeAttribute("placeholder");
  input?.setAttribute("size", "20");
  const sel = el(
    "select",
    { className: "m-type" },
    ...[
      "Web",
      "News",
      "Images",
      "Look up word",
      "Encyclopedia",
      "Stock Quotes",
      "Find Movies",
      "Shopping",
      "Music",
    ].map((t) => el("option", { textContent: t })),
  );
  const modes = {
    News: [undefined, "news"],
    Images: [undefined, "images"],
    "Look up word": ["define "],
    Encyclopedia: [undefined, undefined, " wikipedia"],
    "Stock Quotes": [undefined, undefined, " stock"],
    "Find Movies": [undefined, undefined, " movie"],
    Shopping: [undefined, undefined, " price"],
    Music: [undefined, undefined, " music"],
  };
  const go = (type) => {
    const [pre = "", t = type, post = ""] = modes[sel.value] ?? [];
    const v = input?.value.trim();
    if (!v) {
      if (t) location.href = `/?type=${t}`;
      return;
    }
    location.href = `/?q=${encodeURIComponent(`${pre}${v}${post}`)}${t ? `&type=${t}` : ""}`;
  };
  sel.addEventListener("change", () => {
    if (input?.value.trim()) go();
  });
  form.addEventListener(
    "submit",
    (e) => {
      if (sel.value === "Web") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      go();
    },
    true,
  );
  input?.after(sel);
  searchButton(form);
  const near = el("button", {
    type: "button",
    className: "m-near",
    textContent: "Near Me",
  });
  near.addEventListener("click", () => {
    sel.value = "Web";
    const v = input?.value.trim();
    location.href = v
      ? `/?q=${encodeURIComponent(v)}&type=maps`
      : "/?type=maps";
  });
  form.querySelector(".m-btn")?.after(near);
  const settings = document.getElementById("open-settings");
  const commands = el(
    "ul",
    { className: "m-commands" },
    el("li", {}, el("a", { href: "/bangs", textContent: "Search Tips" })),
  );
  if (settings) {
    settings.textContent = "Settings";
    commands.append(el("li", {}, settings));
  }
  commands.append(
    el("li", {}, el("a", { href: "/bangs", textContent: "Help" })),
    el("li", {}, prefs(el, "Language Tools")),
  );
  form.append(commands);
};

const results = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!header || !form) return;
  header.classList.add("m-rp");
  header
    .querySelector(".retro-logo")
    ?.append(el("span", { textContent: "Search" }));
  form.querySelector("input[name=q]")?.setAttribute("placeholder", "");
  searchButton(form);
  const nav = header.querySelector("nav.tabs");
  const labels = { web: "Web", images: "Images", news: "News", maps: "Local" };
  for (const tab of nav?.querySelectorAll("a.tab") ?? [])
    tab.textContent = labels[tab.textContent.trim()] ?? tab.textContent;
  const opt = document.getElementById("options-btn");
  if (opt) opt.textContent = "Search Builder";
  nav?.append(
    el("a", {
      className: "m-tab-extra",
      href: `/?q=${encodeURIComponent(`${ctx.q} wikipedia`)}`,
      textContent: "Encyclopedia",
    }),
  );
  const commands = el(
    "ul",
    { className: "m-commands" },
    el("li", {}, prefs(el, "Settings")),
    el("li", {}, el("a", { href: "/bangs", textContent: "Help" })),
  );
  form.append(commands);
  const stats = document.querySelector(".retro-stats");
  if (stats) {
    stats.append(
      el("span", { className: "m-page", textContent: "Page 1 of " }),
      el("span", { className: "m-total", textContent: ctx.total }),
      " results containing ",
      el("strong", { textContent: ctx.q }),
      el("span", {
        className: "m-time",
        textContent: ` (${ctx.secs} seconds)`,
      }),
    );
  }
};

export default {
  init(ctx) {
    if (ctx.page === "home") home(ctx);
    else results(ctx);
    footer(ctx);
  },
  result(node) {
    const arts = node.matches?.("article.result")
      ? [node]
      : [...(node.querySelectorAll?.("article.result") ?? [])];
    for (const art of arts) {
      const cite = art.querySelector(".retro-url");
      if (!cite || art.querySelector(".m-cached")) continue;
      const url = art.dataset.url;
      cite.after(
        Object.assign(document.createElement("a"), {
          className: "m-cached",
          href: `https://web.archive.org/web/2005/${url}`,
          textContent: "Cached page",
        }),
      );
    }
  },
};
