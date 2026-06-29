const ENDPOINT = "/suggest";
const DEBOUNCE_MS = 110;
const MAX_ITEMS = 10;

const ICON_SEARCH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="m18.031 16.617 4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617m-2.006-.742A6.98 6.98 0 0 0 18 11c0-3.867-3.133-7-7-7s-7 3.133-7 7 3.133 7 7 7a6.98 6.98 0 0 0 4.875-1.975z"></path></svg>`;

const ICON_ARROW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 14 4 9l5-5"></path><path d="M4 9h11a4 4 0 0 1 4 4v7"></path></svg>`;

const STYLE = `
.omnibox-host {
  position: relative;
}
.omnibox-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 100;
  display: none;
  flex-direction: column;
  gap: 2px;
  padding: 5px;
  background: var(--surface0, #313244);
  border: 1px solid var(--surface1, #45475a);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  max-height: min(70vh, 620px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--surface1, #45475a) transparent;
}
.omnibox-panel.open {
  display: flex;
}
.omnibox-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text, #cdd6f4);
  user-select: none;
  transition: background .2s, transform .2s;
}
.omnibox-item:hover,
.omnibox-item.active {
  background: var(--surface1, #45475aa6);
  transition: transform .2s;
}
.omnibox-item:active {
  transform: scale(.98);
}
.omnibox-icon {
  flex: none;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  color: var(--muted, #7f849c);
}
.omnibox-icon svg {
  width: 18px;
  height: 18px;
}
.omnibox-thumb {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--surface1, #45475aa6);
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
}
.omnibox-arrow svg {
  width: 16px;
  height: 16px;
}
.omnibox-item.active .omnibox-arrow {
  opacity: 0.7;
}
@media (hover: hover) {
  .omnibox-item:hover .omnibox-arrow {
    opacity: 0.7;
  }
}
`;

const ensureStyles = () => {
  if (document.getElementById("omnibox-style")) return;
  const el = document.createElement("style");
  el.id = "omnibox-style";
  el.textContent = STYLE;
  document.head.append(el);
};

// build the title, dimming the part the user already typed. all text goes
// through textContent so suggestion text can't inject markup
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
  host.append(panel);

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
      input.value = typedValue;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    const row = rows[active];
    row.classList.add("active");
    row.setAttribute("aria-selected", "true");
    row.scrollIntoView({ block: "nearest" });
    input.value = items[active].query;
    input.setAttribute("aria-activedescendant", row.id);
  };

  const close = () => {
    if (!panel.classList.contains("open")) return;
    panel.classList.remove("open");
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
    panel.textContent = "";

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
    active = -1;
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
