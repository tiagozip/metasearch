const ENDPOINT = "/suggest";
const DEBOUNCE_MS = 110;
const MAX_ITEMS = 10;

const ICON_SEARCH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="m18.031 16.617 4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617m-2.006-.742A6.98 6.98 0 0 0 18 11c0-3.867-3.133-7-7-7s-7 3.133-7 7 3.133 7 7 7a6.98 6.98 0 0 0 4.875-1.975z"></path></svg>`;

const ICON_ARROW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path pathLength="1" d="M9 14 4 9l5-5"></path><path pathLength="1" d="M4 9h11a4 4 0 0 1 4 4v7"></path></svg>`;

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

const STYLE = `
.omnibox-host {
  position: relative;
  isolation: isolate;
}
.omnibox-host.omnibox-raised {
  z-index: 100;
}
.omnibox-goo {
  position: absolute;
  top: 0;
  left: calc(var(--omnibox-b, 1px) * -1);
  right: calc(var(--omnibox-b, 1px) * -1);
  height: calc(var(--omnibox-bar, 40px) + 24px + var(--omnibox-h, 0px));
  z-index: -1;
  filter: url(#omnibox-goo-filter);
  pointer-events: none;
}
.omnibox-blob {
  position: absolute;
  background: var(--surface0, #313244);
  will-change: transform;
}
.omnibox-blob-bar {
  top: 0;
  left: var(--omnibox-b, 1px);
  right: var(--omnibox-b, 1px);
  height: var(--omnibox-bar, 40px);
  border-radius: var(--omnibox-r, 9px);
}
.omnibox-blob-panel {
  top: calc(var(--omnibox-bar, 40px) + 8px);
  left: 0;
  right: 0;
  height: var(--omnibox-h, 0px);
  border-radius: 12px;
  transform-origin: 50% 0;
  transform: translateY(-26px) scale(0.6, var(--omnibox-sy, 0.05));
  transition:
    transform 280ms ${EASE},
    height 220ms ${EASE};
}
.omnibox-host.omnibox-open .omnibox-blob-panel {
  transform: none;
}
.omnibox-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: calc(var(--omnibox-b, 1px) * -1);
  right: calc(var(--omnibox-b, 1px) * -1);
  z-index: 1;
  display: flex;
  visibility: hidden;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  background: transparent;
  border-radius: 12px;
  box-shadow:
    inset 0 0 0 1px var(--surface1, #45475a),
    0 2px 4px rgb(0 0 0 / 0.16),
    0 16px 32px -12px rgb(0 0 0 / 0.5);
  max-height: min(70vh, 620px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--surface1, #45475a) transparent;
  opacity: 0;
  translate: 0 -4px;
  filter: blur(4px);
  pointer-events: none;
  transition:
    opacity 100ms ${EASE},
    translate 100ms ${EASE},
    filter 100ms ${EASE},
    visibility 0s 100ms;
}
.omnibox-panel.open {
  visibility: visible;
  opacity: 1;
  translate: 0 0;
  filter: none;
  pointer-events: auto;
  transition:
    opacity 140ms ${EASE} 100ms,
    translate 220ms ${EASE} 100ms,
    filter 140ms ${EASE} 100ms,
    visibility 0s;
}
.omnibox-hl {
  position: absolute;
  top: 0;
  left: 4px;
  right: 4px;
  border-radius: 8px;
  background: var(--surface1, #45475a);
  opacity: 0;
  pointer-events: none;
  transition:
    transform 120ms ${EASE},
    height 120ms ${EASE},
    opacity 100ms ease;
}
.omnibox-hl.on {
  opacity: 1;
}
.omnibox-hl.snap {
  transition: opacity 100ms ease;
}
.omnibox-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text, #cdd6f4);
  user-select: none;
  transition:
    background-color 150ms ease,
    scale 200ms ${EASE};
}
.omnibox-item:active {
  scale: 0.985;
}
.omnibox-icon {
  flex: none;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  color: var(--muted, #7f849c);
  transition: color 120ms ease;
}
.omnibox-icon svg {
  width: 18px;
  height: 18px;
}
.omnibox-item.active .omnibox-icon {
  color: var(--subtext, #a6adc8);
}
.omnibox-thumb {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--surface1, #45475aa6);
  outline: 1px solid rgb(255 255 255 / 0.08);
  outline-offset: -1px;
}
.omnibox-text {
  flex: 1;
  min-width: 0;
  line-height: 1.3;
}
.omnibox-title {
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text, #cdd6f4);
}
.omnibox-title .omnibox-typed {
  color: var(--subtext, #a6adc8);
}
.omnibox-desc {
  font-size: 12px;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--muted, #7f849c);
}
.omnibox-arrow {
  flex: none;
  display: grid;
  place-items: center;
  color: var(--muted, #7f849c);
  opacity: 0;
  translate: -3px 0;
  transition:
    opacity 120ms ease,
    translate 160ms ${EASE};
}
.omnibox-arrow svg {
  width: 16px;
  height: 16px;
}
.omnibox-arrow path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset 260ms ${EASE};
}
.omnibox-item.active .omnibox-arrow {
  opacity: 0.8;
  translate: 0 0;
}
.omnibox-item.active .omnibox-arrow path {
  stroke-dashoffset: 0;
}
@media (hover: hover) and (pointer: fine) {
  .omnibox-item:not(.active):hover {
    background-color: color-mix(in srgb, var(--surface1, #45475a) 55%, transparent);
    transition: scale 200ms ${EASE};
  }
  .omnibox-item:hover .omnibox-arrow {
    opacity: 0.8;
    translate: 0 0;
  }
  .omnibox-item:hover .omnibox-arrow path {
    stroke-dashoffset: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .omnibox-panel,
  .omnibox-hl,
  .omnibox-arrow {
    transition-property: opacity;
  }
  .omnibox-panel {
    translate: none;
    filter: none;
  }
  .omnibox-blob-panel {
    transition: none;
  }
  .omnibox-arrow path {
    stroke-dashoffset: 0;
    transition: none;
  }
}
`;

const ensureStyles = () => {
  if (document.getElementById("omnibox-style")) return;
  const el = document.createElement("style");
  el.id = "omnibox-style";
  el.textContent = STYLE;
  document.head.append(el);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.innerHTML = `<filter id="omnibox-goo-filter" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo"/><feComposite in="SourceGraphic" in2="goo" operator="atop"/></filter>`;
  document.body.append(svg);
};

const renderTitle = (node, text, typed) => {
  node.textContent = "";
  const lower = text.toLowerCase();
  const t = typed.trim().toLowerCase();
  if (t && lower.startsWith(t)) {
    const dim = document.createElement("span");
    dim.className = "omnibox-typed";
    dim.textContent = text.slice(0, typed.trim().length);
    node.append(dim, document.createTextNode(text.slice(typed.trim().length)));
  } else {
    node.textContent = text;
  }
};

const setup = (host, input, form) => {
  ensureStyles();
  host.classList.add("omnibox-host");

  const panel = document.createElement("div");
  panel.className = "omnibox-panel";
  panel.id = "omnibox-panel";
  panel.setAttribute("role", "listbox");
  const goo = document.createElement("div");
  goo.className = "omnibox-goo";
  goo.setAttribute("aria-hidden", "true");
  goo.innerHTML = `<div class="omnibox-blob omnibox-blob-bar"></div><div class="omnibox-blob omnibox-blob-panel"></div>`;
  host.prepend(goo);
  host.append(panel);
  const measure = () => {
    const cs = getComputedStyle(host);
    const b = Number.parseFloat(cs.borderTopWidth) || 0;
    const r = Number.parseFloat(cs.borderTopLeftRadius) || 0;
    host.style.setProperty("--omnibox-bar", `${host.clientHeight}px`);
    host.style.setProperty("--omnibox-b", `${b}px`);
    host.style.setProperty("--omnibox-r", `${Math.max(r - b, 0)}px`);
  };
  measure();

  const hl = document.createElement("div");
  hl.className = "omnibox-hl";
  hl.setAttribute("aria-hidden", "true");

  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "omnibox-panel");
  input.setAttribute("aria-expanded", "false");

  const cache = new Map();
  let controller = null;
  let debounce = 0;
  let lower = 0;
  let items = [];
  let rows = [];
  let active = -1;
  let typedValue = input.value;

  const setActive = (next) => {
    if (rows[active]) {
      rows[active].classList.remove("active");
      rows[active].setAttribute("aria-selected", "false");
    }
    active = next;
    if (active < 0) {
      hl.classList.remove("on");
      input.value = typedValue;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    const row = rows[active];
    row.classList.add("active");
    row.setAttribute("aria-selected", "true");
    const wasOn = hl.classList.contains("on");
    if (!wasOn) hl.classList.add("snap");
    hl.style.transform = `translateY(${row.offsetTop}px)`;
    hl.style.height = `${row.offsetHeight}px`;
    if (!wasOn) {
      hl.getBoundingClientRect();
      hl.classList.remove("snap");
      hl.classList.add("on");
    }
    row.scrollIntoView({ block: "nearest" });
    input.value = items[active].query;
    input.setAttribute("aria-activedescendant", row.id);
  };

  const close = () => {
    if (!panel.classList.contains("open")) return;
    panel.classList.remove("open");
    host.classList.remove("omnibox-open");
    clearTimeout(lower);
    lower = setTimeout(() => host.classList.remove("omnibox-raised"), 300);
    hl.classList.remove("on");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const submitWith = (value) => {
    input.value = value;
    close();
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.submit();
  };

  const render = (list, typed) => {
    items = list;
    rows = [];
    const wasOpen = panel.classList.contains("open");
    const h0 = wasOpen ? panel.getBoundingClientRect().height : 0;
    for (const a of panel.getAnimations()) a.cancel();
    panel.textContent = "";
    hl.classList.remove("on");
    panel.append(hl);

    list.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "omnibox-item";
      row.id = `omnibox-item-${i}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");

      if (item.entity && item.img) {
        const thumb = document.createElement("img");
        thumb.className = "omnibox-thumb";
        thumb.src = item.img;
        thumb.alt = "";
        thumb.loading = "lazy";
        thumb.referrerPolicy = "no-referrer";
        thumb.onerror = () => {
          thumb.remove();
        };
        row.append(thumb);
      } else {
        const icon = document.createElement("div");
        icon.className = "omnibox-icon";
        icon.innerHTML = ICON_SEARCH;
        row.append(icon);
      }

      const text = document.createElement("div");
      text.className = "omnibox-text";
      const title = document.createElement("div");
      title.className = "omnibox-title";
      if (item.entity && item.name) {
        title.textContent = item.name;
      } else {
        renderTitle(title, item.query, typed);
      }
      text.append(title);

      const subtitle = item.entity ? item.desc || item.category : "";
      if (subtitle) {
        const desc = document.createElement("div");
        desc.className = "omnibox-desc";
        desc.textContent = subtitle;
        text.append(desc);
      }
      row.append(text);

      const arrow = document.createElement("div");
      arrow.className = "omnibox-arrow";
      arrow.innerHTML = ICON_ARROW;
      row.append(arrow);

      row.addEventListener("click", () => submitWith(item.query));
      panel.append(row);
      rows.push(row);
    });

    active = -1;
    panel.classList.add("open");
    input.setAttribute("aria-expanded", "true");
    const h1 = panel.getBoundingClientRect().height;
    measure();
    host.style.setProperty("--omnibox-h", `${h1}px`);
    host.style.setProperty("--omnibox-sy", `${Math.min(1, 12 / (h1 || 12))}`);
    clearTimeout(lower);
    host.classList.add("omnibox-open", "omnibox-raised");
    if (
      wasOpen &&
      h0 &&
      h0 !== h1 &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      panel.style.overflow = "hidden";
      panel
        .animate([{ height: `${h0}px` }, { height: `${h1}px` }], {
          duration: 220,
          easing: EASE,
        })
        .finished.finally(() => {
          panel.style.overflow = "";
        });
    }
  };

  const load = async (q) => {
    if (cache.has(q)) return cache.get(q);
    if (controller) controller.abort();
    controller = new AbortController();
    try {
      const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) return [];
      const json = await res.json();
      const list = Array.isArray(json?.suggestions)
        ? json.suggestions.slice(0, MAX_ITEMS)
        : [];
      cache.set(q, list);
      return list;
    } catch {
      return null;
    }
  };

  const request = (q, typed) => {
    load(q).then((list) => {
      if (list === null) return;
      if (input.value.trim() !== q) return;
      const filtered = list.filter(
        (item) => item.entity || item.query.toLowerCase() !== q.toLowerCase(),
      );
      if (!filtered.length) {
        close();
        return;
      }
      render(filtered, typed);
    });
  };

  input.addEventListener("input", () => {
    typedValue = input.value;
    setActive(-1);
    const q = input.value.trim();
    clearTimeout(debounce);
    if (!q) {
      close();
      return;
    }
    debounce = setTimeout(() => request(q, typedValue), DEBOUNCE_MS);
  });

  input.addEventListener("focus", () => {
    typedValue = input.value;
    const q = input.value.trim();
    if (q && !panel.classList.contains("open")) request(q, typedValue);
  });

  input.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    const isOpen = panel.classList.contains("open");

    if (e.key === "ArrowDown") {
      if (!isOpen) return;
      e.preventDefault();
      setActive(active + 1 >= rows.length ? -1 : active + 1);
    } else if (e.key === "ArrowUp") {
      if (!isOpen) return;
      e.preventDefault();
      setActive(active <= -1 ? rows.length - 1 : active - 1);
    } else if (e.key === "Enter") {
      if (isOpen) close();
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setActive(-1);
        close();
      }
    }
  });

  panel.addEventListener("pointerdown", (e) => e.preventDefault());

  host.addEventListener("focusout", (e) => {
    if (!host.contains(e.relatedTarget)) close();
  });
};

const init = () => {
  const input = document.querySelector('form .search-bar input[name="q"]');
  if (!input) return;
  const host = input.closest(".search-bar");
  const form = input.closest("form");
  if (!host || !form) return;
  setup(host, input, form);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
