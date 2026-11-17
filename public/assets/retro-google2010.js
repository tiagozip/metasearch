const enc = encodeURIComponent;

const sep = () => document.createTextNode(" | ");

const openSettings = (el, textContent) =>
  el("a", {
    href: "/about",
    textContent,
    onclick: (e) => {
      const b = document.getElementById("open-settings");
      if (!b) return;
      e.preventDefault();
      b.click();
    },
  });

const gbar = (ctx) => {
  const { el, q, page } = ctx;
  const qs = q ? `q=${enc(q)}&` : "";
  const items = [
    ["web", "Web", `/?${qs}`],
    ["images", "Images", `/?${qs}type=images`],
    ["videos", "Videos", `/?q=${enc(`!yt ${q}`)}`],
    ["maps", "Maps", `/?${qs}type=maps`],
    ["news", "News", `/?${qs}type=news`],
    ["shopping", "Shopping", `/?q=${enc(`!shopping ${q}`)}`],
    ["code", "Code", "https://github.com/tiagozip/metasearch"],
  ];
  const cur = page === "home" ? "web" : page;
  const typed = (e) => {
    const input = document.querySelector("header input[name=q]");
    const v = input?.value.trim();
    if (q || e.currentTarget.host !== location.host) return;
    e.preventDefault();
    if (!v) return input?.focus();
    const u = new URL(e.currentTarget.href);
    const b = u.searchParams.get("q")?.trim();
    u.searchParams.set("q", b ? `${b} ${v}` : v);
    location.href = u;
  };
  const left = el("div", { className: "g10-gbar" });
  for (const [k, label, href] of items) {
    left.append(
      k === cur
        ? el("b", { textContent: label })
        : el("a", { href, textContent: label, onclick: typed }),
      " ",
    );
  }
  left.append(
    el(
      "a",
      { href: "/bangs", className: "g10-more" },
      el("u", { textContent: "more" }),
      " ",
      el("small", { textContent: "▼" }),
    ),
  );
  const settings =
    document.getElementById("open-settings") ??
    el("a", { href: "/about#settings" });
  settings.textContent = "Search settings";
  settings.removeAttribute("target");
  const right = el(
    "div",
    { className: "g10-guser" },
    el("a", {
      href: "https://github.com/tiagozip/metasearch",
      textContent: "Run your own",
    }),
    sep(),
    settings,
    sep(),
    el("a", {
      href: "/about#default-engine",
      textContent: "Make metasearch your default",
    }),
  );
  document.body.prepend(el("div", { className: "g10-top" }, left, right));
};

const lucky = (ctx, form) => {
  const btn = form.querySelector("button[type=submit]");
  if (!btn) return;
  const input = form.querySelector("input[name=q]");
  if (ctx.page !== "home") {
    btn.textContent = "Search";
    return;
  }
  btn.textContent = "metasearch Search";
  const l = ctx.el("button", {
    type: "submit",
    className: "g10-lucky",
    textContent: "I'm Feeling Lucky",
  });
  l.addEventListener("click", (e) => {
    if (!input?.value.trim()) return;
    e.preventDefault();
    location.href = `/?q=${enc(`! ${input.value}`)}`;
  });
  btn.after(l);
};

const home = (ctx) => {
  const { el } = ctx;
  const form = document.querySelector("header form");
  if (!form) return;
  form
    .querySelector(".search-bar")
    ?.append(
      el(
        "div",
        { className: "g10-sblc" },
        el("a", { href: "/bangs", textContent: "Advanced Search Tips" }),
        openSettings(el, "Language Tools"),
      ),
    );
  const links = document.querySelector("header .links");
  links?.replaceChildren(
    el(
      "div",
      { className: "g10-promo" },
      el("span", { className: "g10-new", textContent: "New!" }),
      " Search faster with ",
      el("a", { href: "/bangs", textContent: "bangs" }),
    ),
  );
  ctx.footer.append(
    el(
      "div",
      { className: "g10-fll" },
      el("a", { href: "/api", textContent: "API Programs" }),
      el("a", {
        href: "https://github.com/tiagozip/metasearch",
        textContent: "Self-hosting Solutions",
      }),
      el("a", { href: "/about", textContent: "About metasearch" }),
    ),
    el(
      "p",
      { className: "g10-copy" },
      "©2010 - ",
      el("a", { href: "/about#privacy", textContent: "Privacy" }),
    ),
  );
};

const icons = {
  web: "everything",
  images: "images",
  news: "news",
  maps: "maps",
};

const leftnav = (ctx) => {
  const { el } = ctx;
  const nav = document.querySelector("nav.tabs");
  if (!nav) return;
  const labels = {
    web: "Everything",
    images: "Images",
    news: "News",
    maps: "Maps",
  };
  for (const a of nav.querySelectorAll("a.tab")) {
    const k = a.textContent.trim();
    if (!labels[k]) continue;
    a.dataset.k = k;
    a.replaceChildren(
      el("span", { className: `g10-ico g10-ico-${icons[k]}` }),
      labels[k],
    );
  }
  const q = enc(ctx.q);
  const extra = [
    ["videos", "Videos", `/?q=${enc(`!yt ${ctx.q}`)}`],
    ["shopping", "Shopping", `/?q=${enc(`!shopping ${ctx.q}`)}`],
  ];
  for (const [k, label, href] of extra) {
    (k === "shopping"
      ? nav.querySelector('a.tab[data-k="maps"]')
      : nav.querySelector('a.tab[data-k="images"]')
    )?.after(
      el(
        "a",
        { className: "tab", href },
        el("span", { className: `g10-ico g10-ico-${k}` }),
        label,
      ),
    );
  }
  const more = el(
    "a",
    { className: "tab g10-moremodes", href: "/bangs" },
    el("span", { className: "g10-ico g10-ico-more" }),
    "More",
  );
  nav.querySelector(".opt")?.before(more);
  const sel = document.getElementById("time-select");
  const times = [
    ["", "Any time"],
    ["pd", "Past 24 hours"],
    ["pw", "Past week"],
    ["pm", "Past month"],
    ["py", "Past year"],
  ];
  const tl = el("ul", { className: "g10-tbt" });
  const paint = () => {
    for (const li of tl.children)
      li.classList.toggle("g10-sel", li.dataset.v === (sel?.value ?? ""));
  };
  for (const [v, label] of times) {
    const li = el("li", {}, el("a", { href: `/?q=${q}`, textContent: label }));
    li.dataset.v = v;
    li.firstChild.addEventListener("click", (e) => {
      if (!sel) return;
      e.preventDefault();
      sel.value = v;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      paint();
    });
    tl.append(li);
  }
  paint();
  sel?.addEventListener("change", paint);
  const opt = document.getElementById("options-btn");
  if (opt) opt.replaceChildren("More search tools");
  nav.append(el("div", { className: "g10-lnsec" }, tl, opt ?? ""));
};

const resultsFooter = (ctx) => {
  const { el, q } = ctx;
  ctx.footer.append(
    el(
      "form",
      { action: "/", className: "g10-bsf" },
      el("input", { name: "q", value: q, className: "g10-bsf-q" }),
      el("button", { type: "submit", textContent: "Search" }),
    ),
    el(
      "div",
      { className: "g10-fl1" },
      el("a", { href: `/?q=${enc(q)}`, textContent: "Search within results" }),
      sep(),
      openSettings(el, "Language Tools"),
      sep(),
      el("a", { href: "/bangs", textContent: "Search Help" }),
      sep(),
      el("a", {
        href: "https://github.com/tiagozip/metasearch/issues",
        textContent: "Dissatisfied? Help us improve",
      }),
    ),
    el(
      "div",
      { className: "g10-fl2" },
      el("a", { href: "/", textContent: "metasearch Home" }),
      " - ",
      el("a", { href: "/api", textContent: "API Programs" }),
      " - ",
      el("a", {
        href: "https://github.com/tiagozip/metasearch",
        textContent: "Self-hosting Solutions",
      }),
      " - ",
      el("a", { href: "/about#privacy", textContent: "Privacy" }),
      " - ",
      el("a", { href: "/about", textContent: "About metasearch" }),
    ),
  );
};

const decorate = (art, ctx) => {
  const cite = art.querySelector(".retro-url");
  if (!cite || cite.dataset.g10) return;
  cite.dataset.g10 = "1";
  const url = art.dataset.url;
  cite.textContent =
    cite.textContent.length > 70
      ? `${cite.textContent.slice(0, 67)}...`
      : cite.textContent;
  const host = cite.textContent.split("/")[0];
  const row = ctx.el(
    "div",
    { className: "g10-cite" },
    cite,
    ctx.el(
      "span",
      { className: "g10-gl" },
      " - ",
      ctx.el("a", {
        href: `https://web.archive.org/web/2010/${url}`,
        textContent: "Cached",
      }),
      " - ",
      ctx.el("a", {
        href: `/?q=${enc(`site:${host} ${ctx.q}`)}`,
        textContent: "Similar",
      }),
    ),
  );
  art.querySelector(".result-content")?.append(row);
};

export default {
  init(ctx) {
    ctx.footer = document.querySelector("footer.retro-footer");
    gbar(ctx);
    const form = document.querySelector("header form");
    if (form) lucky(ctx, form);
    if (ctx.page === "home") {
      home(ctx);
      return;
    }
    leftnav(ctx);
    resultsFooter(ctx);
  },
  result(node, ctx) {
    const arts = node.matches?.("article.result")
      ? [node]
      : [...(node.querySelectorAll?.("article.result") ?? [])];
    for (const art of arts) decorate(art, ctx);
  },
};
