const d = document.documentElement;
const id = d.dataset.retro;
const params = new URLSearchParams(location.search);
const q = params.get("q") ?? "";
const type = params.get("type") ?? "web";
d.dataset.page = q ? type : "home";

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (localStorage.getItem("ms-retro-scheme")) return;
  d.dataset.scheme = e.matches ? "dark" : "light";
});

const fmt = (n) => n.toLocaleString("en-US");
const seed = [...q].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const ctx = {
  id,
  q,
  page: d.dataset.page,
  total: fmt(((seed % 9000) + 1000) * 1000 + ((seed >> 8) % 1000) * 10),
  secs: (0.08 + (seed % 30) / 100).toFixed(2),
  el(tag, props = {}, ...children) {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
  },
};

const theme = await import(`/s/retro-${id}.js`).then(
  (m) => m.default,
  () => null,
);

const cite = (art) => {
  if (art.querySelector(".retro-url")) return;
  const url = art.dataset.url;
  if (!url) return;
  const clean = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  art
    .querySelector(".result-content")
    ?.append(ctx.el("cite", { className: "retro-url", textContent: clean }));
};

const enhance = (root) => {
  for (const art of root.querySelectorAll?.("article.result[data-url]") ?? [])
    cite(art);
  if (root.matches?.("article.result[data-url]")) cite(root);
  theme?.result?.(root, ctx);
};

const start = () => {
  const header = document.querySelector("header");
  if (header && !header.querySelector(".retro-logo")) {
    header.prepend(
      ctx.el(
        "a",
        { className: "retro-logo", href: "/" },
        ctx.el("img", { src: `/s/retro-${id}-logo.png`, alt: "" }),
      ),
    );
  }

  const results = document.getElementById("results-all");
  if (results) {
    const stats = ctx.el("div", { className: "retro-stats" });
    Object.assign(stats.dataset, { q, total: ctx.total, secs: ctx.secs });
    results.before(stats);
    enhance(results);
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes) if (n.nodeType === 1) enhance(n);
      stats.dataset.count = results.querySelectorAll("article.result").length;
    }).observe(results, { childList: true, subtree: true });
  }

  document.body.append(ctx.el("footer", { className: "retro-footer" }));
  theme?.init?.(ctx);
};

if (document.readyState === "loading")
  addEventListener("DOMContentLoaded", start);
else start();
