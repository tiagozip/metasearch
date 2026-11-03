const ENGINES = ["yandex", "bing", "tineye"];
const PAGE_STEP = 20;

const CAMERA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 7h1a2 2 0 0 0 2-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2"/><circle cx="12" cy="13" r="3"/></svg>`;
const CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const OUT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>`;

const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter((k) => k != null && k !== false));
  return el;
};

const safe = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

export const isImageUrl = (q) =>
  /^https?:\/\/\S+\.(?:jpe?g|png|webp|gif|avif|bmp)(?:[?#]\S*)?$/i.test(q);

const upload = async (file, signal) => {
  let body = file;
  if (file.size > 600_000) {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (bitmap) {
      const scale = Math.min(
        1,
        Math.sqrt(1e6 / (bitmap.width * bitmap.height)),
      );
      const canvas = new OffscreenCanvas(
        Math.round(bitmap.width * scale),
        Math.round(bitmap.height * scale),
      );
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.8, 0.7]) {
        body = await canvas.convertToBlob({ type: "image/jpeg", quality });
        if (body.size <= 600_000) break;
      }
    }
  }
  const res = await fetch("/rimg/up", {
    method: "POST",
    signal,
    headers: { "content-type": body.type },
    body,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.id) throw new Error(out.error || "upload failed");
  return out.id;
};

const go = (q) => {
  location.href = `/?q=${encodeURIComponent(q)}`;
};

export function attachImageSearch(bar, input) {
  if (bar.querySelector(".rimg-btn")) return;
  const picker = h("input", {
    type: "file",
    accept: "image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp",
    hidden: true,
  });
  const btn = h("button", {
    type: "button",
    class: "rimg-btn",
    title: "search by image",
    "aria-label": "search by image",
  });
  btn.innerHTML = CAMERA;
  btn.onclick = () => picker.click();

  let chip = null;
  let chipQuery = "";
  const dropChip = () => {
    chip?.remove();
    chip = null;
    chipQuery = "";
    input.placeholder = "search…";
  };
  const showChip = (src, { query = "", pending = false, onClear } = {}) => {
    chip?.remove();
    const clear = h("button", {
      type: "button",
      class: "rimg-qchip-x",
      "aria-label": pending ? "cancel upload" : "remove image",
      title: pending ? "cancel upload" : "remove image",
      onclick: () => {
        onClear?.();
        dropChip();
        input.focus();
      },
    });
    clear.innerHTML = CLOSE;
    chip = h(
      "span",
      { class: `rimg-qchip${pending ? " pending" : ""}` },
      h(
        "span",
        { class: "rimg-qchip-img" },
        h("img", { src, alt: "the image you're searching with" }),
      ),
      clear,
    );
    chipQuery = query;
    input.before(chip);
    input.value = "";
    input.placeholder = pending ? "uploading image…" : "search by image";
  };
  input.form?.addEventListener("submit", () => {
    if (chipQuery && !input.value.trim()) input.value = chipQuery;
  });

  const busy = (on) => {
    bar.classList.toggle("rimg-busy", on);
    btn.disabled = on;
  };
  const send = async (file) => {
    if (!file?.type.startsWith("image/")) return;
    const ctrl = new AbortController();
    const preview = URL.createObjectURL(file);
    showChip(preview, { pending: true, onClear: () => ctrl.abort() });
    busy(true);
    try {
      go(`img:${await upload(file, ctrl.signal)}`);
    } catch (e) {
      busy(false);
      dropChip();
      URL.revokeObjectURL(preview);
      if (e.name !== "AbortError") input.placeholder = e.message;
    }
  };
  picker.onchange = () => send(picker.files?.[0]);

  input.addEventListener("paste", (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) =>
      f.type.startsWith("image/"),
    );
    if (!file) return;
    e.preventDefault();
    send(file);
  });

  let depth = 0;
  const hasImage = (e) =>
    [...(e.dataTransfer?.items || [])].some(
      (i) => i.type.startsWith("image/") || i.type === "text/uri-list",
    );
  document.addEventListener("dragenter", (e) => {
    if (!hasImage(e)) return;
    depth++;
    bar.classList.add("rimg-drop");
  });
  document.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) bar.classList.remove("rimg-drop");
  });
  document.addEventListener("dragover", (e) => {
    if (hasImage(e)) e.preventDefault();
  });
  document.addEventListener("drop", (e) => {
    depth = 0;
    bar.classList.remove("rimg-drop");
    const file = [...(e.dataTransfer?.files || [])].find((f) =>
      f.type.startsWith("image/"),
    );
    if (file) {
      e.preventDefault();
      send(file);
      return;
    }
    const url = e.dataTransfer
      ?.getData("text/uri-list")
      ?.split("\n")
      .find((l) => /^https?:\/\//.test(l.trim()));
    if (!url) return;
    e.preventDefault();
    showChip(url.trim(), { pending: true });
    go(url.trim());
  });

  const q = new URLSearchParams(location.search).get("q") || "";
  if (/^img:[0-9a-f]{24}$/.test(q) || isImageUrl(q))
    showChip(q.startsWith("img:") ? `/rimg/img/${q.slice(4)}` : q, {
      query: q,
    });

  const submit = bar.querySelector('button[type="submit"]');
  if (submit) submit.before(btn);
  else bar.append(btn);
  bar.append(picker);
}

export function fillReverseImage(section, { id, url }) {
  const imageUrl = id ? `${location.origin}/rimg/img/${id}` : url;
  const param = id ? `id=${id}` : `url=${encodeURIComponent(url)}`;
  const enc = encodeURIComponent(imageUrl);
  document.body.classList.add("rimg-mode");
  document.getElementById("results-all")?.before(section);

  const meta = h(
    "p",
    { class: "rimg-q-meta" },
    id ? "uploaded image" : new URL(url).hostname.replace(/^www\./, ""),
  );
  const frame = h(
    "a",
    { class: "rimg-q-frame", href: imageUrl, rel: "noopener noreferrer" },
    h("img", {
      src: id ? `/rimg/img/${id}` : url,
      alt: "the image you searched with",
      onload() {
        meta.prepend(`${this.naturalWidth} × ${this.naturalHeight} · `);
      },
      onerror() {
        frame.classList.add("broken");
      },
    }),
  );
  const tags = h("div", { class: "rimg-tags", hidden: true });
  const links = {
    yandex: `https://yandex.com/images/search?rpt=imageview&url=${enc}`,
    bing: `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${enc}`,
    tineye: `https://tineye.com/search?url=${enc}`,
  };
  const elsewhere = [
    ["google lens", `https://lens.google.com/uploadbyurl?url=${enc}`],
    ...ENGINES.map((e) => [e, links[e]]),
  ].map(([name, href]) => {
    const a = h(
      "a",
      {
        class: "rimg-out",
        href,
        target: "_blank",
        rel: "noopener noreferrer",
      },
      name,
    );
    a.insertAdjacentHTML("beforeend", OUT);
    links[name] = a;
    return h("li", {}, a);
  });

  const switcher = h("div", {
    class: "rimg-switch",
    role: "tablist",
    "aria-label": "engines",
  });
  const panel = h("div", {
    class: "rimg-panel",
    role: "tabpanel",
    "aria-live": "polite",
  });
  section.append(
    h(
      "aside",
      { class: "rimg-q" },
      frame,
      meta,
      tags,
      h(
        "div",
        { class: "rimg-q-group" },
        h("h2", { class: "rimg-h" }, "search elsewhere"),
        h("ul", { class: "rimg-outs" }, elsewhere),
      ),
    ),
    h("div", { class: "rimg-main" }, switcher, panel),
  );

  const state = new Map();
  const tabFor = new Map();
  let current = ENGINES[0];
  let touched = false;
  const seenTags = new Set();
  const chips = h("div", { class: "rimg-chips" });
  const count = (r) => (r?.ok ? r.total || r.pages.length : 0);

  const skeleton = () =>
    h(
      "div",
      { class: "rimg-rows", "aria-hidden": "true" },
      [70, 55, 80, 60, 75, 50].map((w) =>
        h(
          "div",
          { class: "rimg-row rimg-sk" },
          h("span", { class: "sk rimg-row-thumb" }),
          h(
            "div",
            { class: "rimg-row-text" },
            h("span", { class: "sk sk-source" }),
            h("span", { class: "sk sk-mid", style: `width:${w}%` }),
            h("span", { class: "sk sk-source" }),
          ),
        ),
      ),
    );

  const favicon = (domain) =>
    h("img", {
      class: "favicon",
      src: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      alt: "",
      loading: "lazy",
      onerror() {
        this.remove();
      },
    });

  const row = (p) => {
    const href = safe(p.url);
    if (!href) return null;
    const domain = p.domain || new URL(href).hostname.replace(/^www\./, "");
    const thumb = safe(p.thumb) && `/rimg/t?u=${encodeURIComponent(p.thumb)}`;
    const date = p.date && new Date(p.date);
    const meta = [
      p.width && p.height && `${p.width} × ${p.height}`,
      date &&
        !Number.isNaN(date.getTime()) &&
        date.toLocaleDateString(undefined, { year: "numeric", month: "short" }),
    ].filter(Boolean);
    return h(
      "a",
      { class: "rimg-row", href, rel: "noopener noreferrer" },
      thumb &&
        h("img", {
          class: "rimg-row-thumb",
          src: thumb,
          alt: "",
          loading: "lazy",
          onerror() {
            this.classList.add("noimg");
          },
        }),
      h(
        "div",
        { class: "rimg-row-text" },
        h(
          "span",
          { class: "rimg-row-source" },
          favicon(domain),
          h("span", { class: "source-name" }, domain),
        ),
        h(
          "span",
          { class: "rimg-row-title", title: p.title || "" },
          p.title || domain,
        ),
        meta.length > 0 &&
          h("span", { class: "rimg-row-meta" }, meta.join(" · ")),
      ),
    );
  };

  const card = (p) => {
    const href = safe(p.url);
    const thumb = safe(p.thumb) && `/rimg/t?u=${encodeURIComponent(p.thumb)}`;
    if (!href || !thumb) return null;
    const domain = p.domain || new URL(href).hostname.replace(/^www\./, "");
    const size = p.width && p.height ? `${p.width} × ${p.height}` : "";
    const item = h(
      "a",
      {
        class: "image-item",
        href,
        rel: "noopener noreferrer",
        title: [p.title, size].filter(Boolean).join(" · "),
        style: `--ar:${p.width && p.height ? (p.width / p.height).toFixed(3) : 1}`,
      },
      h(
        "div",
        { class: "image-wrapper" },
        h("img", {
          src: thumb,
          alt: p.title || "",
          loading: "lazy",
          onload() {
            item.classList.add("loaded");
          },
          onerror() {
            item.classList.add("loaded", "noimg");
          },
        }),
      ),
      h(
        "div",
        { class: "image-info" },
        h("div", { class: "image-title" }, p.title || domain),
        h(
          "div",
          { class: "image-source" },
          favicon(domain),
          h("span", { class: "source-name" }, domain),
          size && h("span", { class: "rimg-size" }, size),
        ),
      ),
    );
    return item;
  };

  const block = (title, items, total, list) => {
    const grid = h("div", {
      class: list ? "rimg-rows" : "images-grid rimg-cards",
    });
    const more = h("button", { type: "button", class: "rimg-more" });
    let shown = 0;
    const step = () => {
      grid.append(
        ...items
          .slice(shown, shown + PAGE_STEP)
          .map(list ? row : card)
          .filter(Boolean),
      );
      shown += PAGE_STEP;
      more.hidden = shown >= items.length;
      more.textContent = `Show ${Math.min(PAGE_STEP, items.length - shown)} more`;
    };
    more.onclick = step;
    step();
    return h(
      "section",
      { class: "rimg-block" },
      h(
        "h2",
        { class: "rimg-h" },
        title,
        total > items.length &&
          h("span", { class: "rimg-dim" }, `${total.toLocaleString()} found`),
      ),
      grid,
      more,
    );
  };

  const render = () => {
    const r = state.get(current);
    panel.replaceChildren();
    if (!r) {
      panel.append(skeleton());
      return;
    }
    if (!r.ok || (!r.pages.length && !r.similar?.length)) {
      const retry = h(
        "button",
        {
          type: "button",
          class: "results-retry",
          onclick: () => run(r.engine),
        },
        "Try again",
      );
      panel.append(
        h(
          "div",
          { class: "results-empty" },
          h(
            "p",
            { class: "results-empty-title" },
            r.ok ? `${r.engine} found nothing` : `${r.engine} didn't answer`,
          ),
          h(
            "p",
            { class: "results-empty-detail" },
            r.ok
              ? "try another engine above, or one of the links on the side"
              : r.error,
          ),
          !r.ok && retry,
        ),
      );
      return;
    }
    if (r.pages.length)
      panel.append(block("pages with this image", r.pages, r.total, true));
    if (r.similar?.length) panel.append(block("similar images", r.similar, 0));
  };

  const select = (engine) => {
    current = engine;
    for (const [e, b] of tabFor) {
      b.setAttribute("aria-selected", String(e === engine));
      b.tabIndex = e === engine ? 0 : -1;
    }
    render();
  };

  const run = (engine) => {
    state.delete(engine);
    const b = tabFor.get(engine);
    b.dataset.state = "loading";
    b.val.textContent = "";
    if (engine === current) render();
    fetch(`/rimg?engine=${engine}&${param}`)
      .then((r) => r.json())
      .catch(() => ({ engine, ok: false, error: "network error" }))
      .then((r) => {
        state.set(engine, r);
        b.dataset.state = r.ok ? (count(r) ? "done" : "empty") : "failed";
        b.val.textContent = r.ok ? count(r).toLocaleString() : "";
        if (r.ok && r.link && links[engine]) links[engine].href = r.link;
        const fresh = (r.tags || []).filter(
          (t) => !seenTags.has(t.toLowerCase()) && seenTags.size < 8,
        );
        if (fresh.length) {
          if (tags.hidden) {
            tags.hidden = false;
            tags.append(h("h2", { class: "rimg-h" }, "looks like"), chips);
          }
          for (const t of fresh) {
            seenTags.add(t.toLowerCase());
            chips.append(
              h(
                "a",
                { class: "rimg-chip", href: `/?q=${encodeURIComponent(t)}` },
                t,
              ),
            );
          }
        }
        const fallback =
          !touched &&
          state.has(current) &&
          !count(state.get(current)) &&
          ENGINES.find((e) => count(state.get(e)));
        if (fallback) select(fallback);
        else if (engine === current) render();
      });
  };

  for (const engine of ENGINES) {
    const val = h("span", { class: "rimg-switch-val" });
    const b = h(
      "button",
      {
        type: "button",
        role: "tab",
        class: "rimg-switch-tab",
        onclick: () => {
          touched = true;
          select(engine);
        },
        onkeydown(e) {
          const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
          if (!d) return;
          touched = true;
          const next =
            ENGINES[
              (ENGINES.indexOf(engine) + d + ENGINES.length) % ENGINES.length
            ];
          select(next);
          tabFor.get(next).focus();
        },
      },
      h("span", {}, engine),
      val,
    );
    b.val = val;
    tabFor.set(engine, b);
    switcher.append(b);
  }
  select(current);
  for (const engine of ENGINES) run(engine);
}
