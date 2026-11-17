const img = (el, name, alt = "") =>
  el("img", { src: `/s/retro-askjeeves2000-${name}.gif`, alt });

const askButton = (ctx, form, name) => {
  const btn = form?.querySelector("button[type=submit]");
  if (!btn || btn.dataset.aj) return;
  btn.dataset.aj = "1";
  btn.title = "Ask!";
  btn.replaceChildren(img(ctx.el, name, "Ask!"));
};

const questions = [
  "How does the Internet work?",
  "Is DSL available in my area?",
  "What is my IP Address?",
];

const openSettings = (e) => {
  e.preventDefault();
  document.getElementById("open-settings")?.click();
};

const home = (ctx) => {
  const { el } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  askButton(ctx, form, "ask");
  form.querySelector("input[name=q]")?.removeAttribute("placeholder");

  const topnav = el(
    "div",
    { className: "aj-topnav" },
    el("a", { className: "on", href: "/", textContent: "Ask metasearch Home" }),
    el("a", {
      href: "#",
      textContent: "Personal metasearch",
      onclick: openSettings,
    }),
    el("a", { href: "/?q=shopping", textContent: "Shopping" }),
    el("a", { href: "/api", textContent: "Answer Point API" }),
    el("a", { href: "/bangs", textContent: "Help" }),
  );

  const left = el(
    "div",
    { className: "aj-left" },
    img(el, "logoleft", "metasearch, at your service"),
    el(
      "div",
      { className: "aj-sm" },
      "Featuring sites ranked by ",
      el("a", { href: "/about", textContent: "popularity" }),
    ),
  );

  const recentInput = el("input", {
    type: "text",
    name: "q",
    value: questions[0],
  });
  const recent = el(
    "form",
    { className: "aj-recent", action: "/" },
    el(
      "div",
      { className: "aj-dirs" },
      "Recent questions about ",
      el("span", { className: "aj-red", textContent: "Computers:" }),
    ),
    el(
      "div",
      { className: "search-bar" },
      recentInput,
      el("button", { type: "submit", title: "Ask!" }, img(el, "ask", "Ask!")),
    ),
  );
  let i = 0;
  setInterval(() => {
    i = (i + 1) % questions.length;
    recentInput.value = questions[i];
  }, 3500);

  const cat = (name, q) =>
    el("a", {
      href: `/?q=${encodeURIComponent(q ?? name)}`,
      textContent: name,
    });
  const col = (...names) =>
    el("div", {}, ...names.flatMap((n) => [cat(n), el("br")]));
  const settings = document.getElementById("open-settings");
  if (settings) settings.textContent = "Preferences";
  const dest = el(
    "div",
    { className: "aj-panel" },
    "• ",
    el(
      "a",
      { href: "/?q=kids" },
      "Ask metasearch for ",
      el("b", { className: "aj-red", textContent: "Kids!" }),
    ),
    el("br"),
    "• ",
    el("a", {
      href: "#",
      textContent: "Language Tools",
      onclick: openSettings,
    }),
    el("br"),
    "• ",
    el("a", {
      href: "/?q=headlines&type=news",
      textContent: "metasearch News Peek",
    }),
    el("br"),
    "• ",
    settings ??
      el("a", { href: "/about#settings", textContent: "Preferences" }),
  );

  const areas = el(
    "div",
    { className: "aj-areas" },
    el(
      "div",
      { className: "aj-areas-l" },
      el(
        "div",
        { className: "aj-dirs" },
        "Care to explore these ",
        el("b", { textContent: "areas of interest" }),
        "?",
      ),
      el(
        "div",
        { className: "aj-panel aj-cols" },
        col("Arts & Entertainment", "Business", "Computers", "Games", "Health"),
        col("Home & Family", "News", "Recreation", "Reference", "Regional"),
        col("Science", "Society", "Sports", "Travel", "World"),
      ),
    ),
    el(
      "div",
      { className: "aj-areas-r" },
      el(
        "div",
        { className: "aj-dirs" },
        el("b", { textContent: "Favorite destinations:" }),
      ),
      dest,
    ),
  );

  const right = el(
    "div",
    { className: "aj-right" },
    el(
      "div",
      { className: "aj-top" },
      img(el, "logoright", "Ask metasearch"),
      el(
        "div",
        { className: "aj-headline" },
        "Have a Question? Just",
        el("br"),
        "type it in and click Ask!",
      ),
    ),
    form,
    recent,
    areas,
  );

  header.append(
    topnav,
    el(
      "div",
      { className: "aj-box" },
      el("div", { className: "aj-cols2" }, left, right),
    ),
  );

  document.querySelector(".retro-footer")?.append(
    el(
      "div",
      { className: "aj-bnav" },
      el("a", { href: "/about", textContent: "About" }),
      el("a", {
        href: "https://github.com/tiagozip/metasearch",
        textContent: "Self-hosting Solutions",
      }),
      el("a", { href: "/api", textContent: "API Programs" }),
      el("a", {
        href: "https://github.com/tiagozip/metasearch",
        textContent: "Open Source Relations",
      }),
      el("a", {
        href: "https://github.com/tiagozip/metasearch",
        textContent: "Become a Contributor",
      }),
    ),
    el(
      "div",
      { className: "aj-fine" },
      el("a", {
        href: "/bangs",
        textContent: "Shortcut Guidelines for Answers",
      }),
      el("br"),
      el("a", { href: "/about#privacy", textContent: "Privacy Statement" }),
      el("br"),
      "© 1996-2000 metasearch",
      el("br"),
      "Ask metasearch and the butler design are service marks of metasearch.",
      el("br"),
      "All other brands are property of their respective owners. Patent pending.",
    ),
  );
};

const results = (ctx) => {
  const { el, q } = ctx;
  const header = document.querySelector("header");
  const form = header?.querySelector("form");
  if (!form) return;
  askButton(ctx, form, "askffffcc");
  const input = form.querySelector("input[name=q]");
  input?.removeAttribute("placeholder");

  const tabs = header.querySelector("nav.tabs");
  const opt = document.getElementById("options-btn");
  if (opt) opt.replaceChildren("Options");

  header.prepend(
    el(
      "div",
      { className: "aj-uninav" },
      el("a", { href: "/about", textContent: "About" }),
      " | ",
      el("a", { href: "/bangs", textContent: "Help" }),
    ),
  );
  if (tabs) header.querySelector(".aj-uninav").after(tabs);

  const bar = form.querySelector(".search-bar");
  bar?.prepend(el("b", { className: "aj-asked", textContent: "  You asked:" }));
  form.append(
    el(
      "div",
      { className: "aj-tip" },
      el("a", { href: "/bangs", textContent: "Tip" }),
      ":",
      el("span", {
        textContent:
          ' Be specific. "Organic gardening" works better than "gardens."',
      }),
    ),
    el(
      "div",
      { className: "aj-text aj-found" },
      "   Click Ask for Answers! I have found the ",
      el("b", { textContent: "answers" }),
      " to the following questions:",
    ),
  );

  const stats = document.querySelector(".retro-stats");
  if (!stats || ctx.page !== "web") return;
  const ask = (text) =>
    el(
      "div",
      { className: "aj-q" },
      el(
        "a",
        { href: `/?q=${encodeURIComponent(text)}` },
        img(el, "asksm", "Ask!"),
      ),
      el("span", { textContent: text }),
    );
  stats.append(
    el(
      "div",
      { className: "aj-qs" },
      ask(`Where can I learn about ${q}?`),
      ask(`Where can I find pictures of ${q}?`),
      el(
        "div",
        { className: "aj-q aj-forum" },
        el(
          "a",
          { href: "https://github.com/tiagozip/metasearch" },
          img(el, "asksm", "Ask!"),
        ),
        el("span", {
          textContent:
            "Post your question and get answers from other users in our Open Source Forum",
        }),
      ),
    ),
    el(
      "div",
      { className: "aj-text aj-similar" },
      "   People with ",
      el("b", { textContent: "similar questions" }),
      " have found these sites relevant: ",
    ),
  );
};

export default {
  init(ctx) {
    if (ctx.page === "home") home(ctx);
    else results(ctx);
    document.querySelector(".teto")?.remove();
  },
  result(node, ctx) {
    const arts = node.matches?.("article.result")
      ? [node]
      : [...(node.querySelectorAll?.("article.result") ?? [])];
    for (const art of arts) {
      const content = art.querySelector(".result-content");
      if (!content || art.querySelector(".aj-ask")) continue;
      const href =
        art.querySelector("a.result-title")?.href ?? art.dataset.url ?? "/";
      art.prepend(
        ctx.el(
          "a",
          { className: "aj-ask", href },
          img(ctx.el, "asksm", "Ask!"),
        ),
      );
      const cite = content.querySelector(".retro-url");
      if (cite && art.dataset.url)
        cite.textContent = art.dataset.url.replace(/^https:/, "http:");
    }
  },
};
