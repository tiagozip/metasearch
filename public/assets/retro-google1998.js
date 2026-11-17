const buttons = (ctx, form) => {
  const btn = form.querySelector("button[type=submit]");
  if (!btn || btn.dataset.g) return;
  btn.dataset.g = "1";
  btn.textContent = "metasearch Search";
  const lucky = ctx.el("button", {
    type: "submit",
    className: "g-lucky",
    textContent: "I'm feeling lucky",
  });
  lucky.addEventListener("click", (e) => {
    const input = form.querySelector("input[name=q]");
    if (!input?.value.trim()) return;
    e.preventDefault();
    location.href = `/?q=${encodeURIComponent(`! ${input.value}`)}`;
  });
  btn.after(lucky);
};

const home = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  const bar = form.querySelector(".search-bar");
  bar?.prepend(
    el("div", {
      className: "g-caption",
      textContent: "Search the web using metasearch!",
    }),
  );
  buttons(ctx, form);
  const settings = document.getElementById("open-settings");
  if (settings) settings.textContent = "Preferences";
  const gh = "https://github.com/tiagozip/metasearch";
  const prefs = (t) => {
    const a = el("a", { href: "#", textContent: t });
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("open-settings")?.click();
    });
    return a;
  };
  const cells = el(
    "div",
    { className: "g-cells" },
    el(
      "div",
      { className: "g-c1" },
      "Special Searches",
      el("br"),
      el("a", {
        href: `/?q=${encodeURIComponent("stanford")}&lens=academic`,
        textContent: "Academic Search",
      }),
      el("br"),
      el("a", {
        href: `/?q=${encodeURIComponent("linux")}&lens=programming`,
        textContent: "Linux Search",
      }),
      el("br"),
      ...(settings ? [settings] : []),
    ),
    el(
      "div",
      { className: "g-c2" },
      ...[
        ["Why use metasearch!", "/about"],
        ["Privacy at metasearch!", "/about#privacy"],
        ["Help!", "/bangs"],
        ["metasearch! API", "/api"],
        ["Hack on metasearch!", gh],
      ].flatMap(([t, h]) => [el("a", { href: h, textContent: t }), el("br")]),
      prefs("metasearch! Mascots"),
      el("br"),
      el("a", {
        href: "/about#default-engine",
        textContent: "Making metasearch! the Default",
      }),
    ),
    el(
      "div",
      { className: "g-c3" },
      "Get metasearch!",
      el("br"),
      "for your own server:",
      el("br"),
      el("a", { href: gh, className: "g-btn", textContent: "Download" }),
      "   ",
      el("a", { href: `${gh}/commits`, textContent: "Archive" }),
    ),
  );
  form.after(cells);
  document.querySelector(".retro-footer")?.append(
    el("div", {
      className: "g-copy",
      textContent: "Copyright ©1999 metasearch",
    }),
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
  if (opt) opt.textContent = "Preferences";
  const stats = document.querySelector(".retro-stats");
  if (stats && q) {
    const label =
      { web: "the web", images: "images", news: "news", maps: "maps" }[
        ctx.page
      ] ?? "the web";
    stats.replaceChildren(
      `Searched ${label} for `,
      el("b", { textContent: q }),
      ". Results ",
      el("b", { textContent: "1 - 10" }),
      " of about ",
      el("b", { textContent: total }),
      ". Search took ",
      el("b", { textContent: secs }),
      " seconds.",
    );
  }
  document
    .querySelector(".retro-footer")
    ?.append(
      el("hr"),
      el(
        "div",
        { className: "g-copy" },
        "Copyright ©1999 metasearch - ",
        el("a", { href: "/", textContent: "metasearch! Home" }),
        " - ",
        el("a", { href: "/about", textContent: "About" }),
      ),
    );
};

export default {
  init(ctx) {
    document.title = ctx.q ? `metasearch Search: ${ctx.q}` : "metasearch!";
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
      const n = [...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 3);
      const title = art.querySelector(".result-title");
      title?.before(
        ctx.el("span", { className: "g-pr", style: `--pr:${(n % 9) + 2}` }),
      );
      cite.after(
        ctx.el(
          "span",
          { className: "g-extra" },
          ` - ${(n % 60) + 4}k - `,
          ctx.el("a", {
            href: `https://web.archive.org/web/1999/${url}`,
            textContent: "Cached",
          }),
          " - ",
          ctx.el("a", {
            href: `/?q=${encodeURIComponent(`related:${cite.textContent}`)}`,
            textContent: "Similar pages",
          }),
        ),
      );
    }
  },
};
