(() => {
  const ctx = __results_template__;
  const urlQuery = new URLSearchParams(window.location.search).get("q") || "";
  const initialQuery = ctx?.initialQuery || urlQuery || "";

  try {
    mapboxgl.config.EVENTS_URL = "https://localhost.invalid";
  } catch {}
  try {
    mapboxgl.config.FEEDBACK_URL = "https://localhost.invalid";
  } catch {}

  mapboxgl.accessToken =
    "pk.eyJ1IjoidW50cnV0aDQ0NSIsImEiOiJjbW53NDVvNXQwZXc0MnNzYjlodmhobXh1In0.l-4OHl3hyX-PrHOzBzQMng";

  const STANDARD_URL = "mapbox://styles/mapbox/standard-beta";
  const SATELLITE_URL = "mapbox://styles/mapbox/satellite-streets-v12";

  const LIGHT_PRESETS = ["day", "dusk", "night"];
  const THUMB_PLAIN_SRC = "/s/mp-plain.svg";
  const THUMB_SATELLITE_SRC = "/s/mp-satellite.svg";

  let currentMode = "dusk";
  let lastLightMode = "dusk";
  let activeMarker = null;

  const map = new mapboxgl.Map({
    container: "map",
    center: [2.293506, 48.859605],
    zoom: 12,
    pitch: 55,
    bearing: -15,
    style: STANDARD_URL,
    hash: true,
  });

  const layers = document.getElementById("map-layers");
  const layersThumb = document.getElementById("map-layers-thumb");
  const layersImg = document.getElementById("map-layers-img");
  const layersPopover = document.getElementById("map-layers-popover");

  LIGHT_PRESETS.forEach((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = id[0].toUpperCase() + id.slice(1);
    btn.dataset.light = id;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      switchMode(id);
    });
    layersPopover.appendChild(btn);
  });

  function refreshPopoverActive() {
    layersPopover.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.light === currentMode);
    });
  }

  function updateLayerUI() {
    const inSat = currentMode === "satellite";
    layersImg.src = inSat ? THUMB_PLAIN_SRC : THUMB_SATELLITE_SRC;
    document.body.classList.toggle("theme-light", currentMode === "day");
    refreshPopoverActive();
  }

  map.on("style.load", () => {
    if (currentMode !== "satellite") {
      try {
        map.setConfigProperty("basemap", "lightPreset", currentMode);
      } catch {}
    }
    updateLayerUI();
  });
  updateLayerUI();

  function switchMode(id) {
    const wasSatellite = currentMode === "satellite";
    if (id !== "satellite") lastLightMode = id;
    currentMode = id;
    updateLayerUI();
    if (id === "satellite") {
      map.setStyle(SATELLITE_URL, { diff: false });
    } else if (wasSatellite) {
      map.setStyle(STANDARD_URL, { diff: false });
    } else {
      try {
        map.setConfigProperty("basemap", "lightPreset", id);
      } catch {}
    }
  }

  layersThumb.addEventListener("click", () => {
    if (currentMode === "satellite") {
      switchMode(lastLightMode || "dusk");
    } else {
      switchMode("satellite");
    }
  });

  let hoverCloseTimer = null;
  function showLayersPopover() {
    if (currentMode === "satellite") return;
    if (hoverCloseTimer) {
      clearTimeout(hoverCloseTimer);
      hoverCloseTimer = null;
    }
    layers.classList.add("show-popover");
  }
  function hideLayersPopover(delay = 160) {
    if (hoverCloseTimer) clearTimeout(hoverCloseTimer);
    hoverCloseTimer = setTimeout(() => {
      layers.classList.remove("show-popover");
    }, delay);
  }
  layers.addEventListener("mouseenter", () => showLayersPopover());
  layers.addEventListener("mouseleave", () => hideLayersPopover());
  layers.addEventListener("focusin", () => showLayersPopover());
  layers.addEventListener("focusout", (e) => {
    if (!layers.contains(e.relatedTarget)) hideLayersPopover(0);
  });

  const input = document.getElementById("map-input");
  const suggestionsEl = document.getElementById("map-suggestions");
  const form = document.getElementById("map-form");

  let searchTimer = null;
  let currentSuggestions = [];
  let activeIdx = -1;
  let searchSeq = 0;

  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (!q) {
      suggestionsEl.classList.remove("open");
      currentSuggestions = [];
      return;
    }
    searchTimer = setTimeout(() => runSearch(q), 180);
  });

  input.addEventListener("focus", () => {
    if (currentSuggestions.length) suggestionsEl.classList.add("open");
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#map-form")) suggestionsEl.classList.remove("open");
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!currentSuggestions.length) return;
      activeIdx = Math.min(currentSuggestions.length - 1, activeIdx + 1);
      renderActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(0, activeIdx - 1);
      renderActive();
    } else if (e.key === "Escape") {
      suggestionsEl.classList.remove("open");
      input.blur();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    suggestionsEl.classList.remove("open");
    if (activeIdx >= 0 && currentSuggestions[activeIdx]) {
      selectSuggestion(currentSuggestions[activeIdx]);
    } else {
      smartGoto(q);
    }
  });

  function renderActive() {
    [...suggestionsEl.children].forEach((el, i) => {
      el.classList.toggle("active", i === activeIdx);
    });
    const el = suggestionsEl.children[activeIdx];
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  const GALILEO_HINT = "73G8yHKfX2bZqNwDLe6g2NYnyeHJXTFV";
  function galileoEncode(str) {
    const x = [...str]
      .map((c, i) =>
        String.fromCharCode(
          c.charCodeAt(0) ^
            "filed in quiet ink a body claimed by no one words refuse their cage copyright tiago zip".charCodeAt(
              i % 87,
            ),
        ),
      )
      .join("");
    const r = [...x].reverse().join("");
    const bytes = new TextEncoder().encode(r);
    const bin = String.fromCharCode(...bytes);
    return btoa(bin);
  }
  function galileoEncodeName(name) {
    const utf8 = new TextEncoder().encode(name);
    const bin = String.fromCharCode(...utf8);
    return btoa(bin).split("").reverse().join("");
  }

  async function runSearch(q) {
    const seq = ++searchSeq;

    try {
      const c = map.getCenter();
      const coord = [c.lng, c.lat];

      const token = galileoEncode(
        JSON.stringify([
          coord[0],
          btoa(q.trim()).split("").reverse().join(""),
          coord[1],
        ]),
      );

      const r = await fetch("/m", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-galileo-hint": GALILEO_HINT,
        },
        body: JSON.stringify([token]),
      });
      if (seq !== searchSeq) return;
      const data = await r.json();
      currentSuggestions = data.suggestions || [];
      activeIdx = -1;
      renderSuggestions();
    } catch (err) {
      console.error(err);
    }
  }

  function renderSuggestions() {
    suggestionsEl.innerHTML = "";
    if (!currentSuggestions.length) {
      suggestionsEl.classList.remove("open");
      return;
    }
    currentSuggestions.forEach((s) => {
      const el = document.createElement("div");
      s = {
        coords: s[0],
        name: s[1],
        place: s[2],
        poi: s[3],
      };

      el.className = "map-sug";
      el.innerHTML = `
        <div class="ic">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div class="mt">
          <div class="nm">${esc(s.name)}</div>
          <div class="pl">${esc(s.place)}</div>
        </div>`;
      el.onclick = () => selectSuggestion(s);
      suggestionsEl.appendChild(el);
    });
    suggestionsEl.classList.add("open");
  }

  function selectSuggestion(s) {
    if (!s.coords) return;
    const [lng, lat] = s.coords;
    suggestionsEl.classList.remove("open");
    input.value = s.name;
    input.blur();
    placePin(lng, lat);
    map.flyTo({
      center: [lng, lat],
      zoom: 17.2,
      pitch: 60,
      bearing: 0,
      speed: 1.2,
      curve: 1.6,
      essential: true,
    });
    openPanel(s);
  }

  function placePin(lng, lat) {
    if (activeMarker) activeMarker.remove();
    const wrap = document.createElement("div");
    wrap.className = "map-pin-wrap";
    wrap.innerHTML = `
      <div class="map-pin-inner">
        <svg viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 1 C7.7 1 1 7.7 1 16 C1 27 16 41 16 41 S31 27 31 16 C31 7.7 24.3 1 16 1 Z"
                fill="#89b4fa" stroke="#cdd6f4" stroke-width="2.5" stroke-linejoin="round"/>
          <circle cx="16" cy="16" r="5" fill="#1f1e2e"/>
        </svg>
      </div>`;
    activeMarker = new mapboxgl.Marker({
      element: wrap,
      anchor: "bottom",
      offset: [0, 2],
      occludedOpacity: 0.2,
    })
      .setLngLat([lng, lat])
      .addTo(map);
  }

  function findNamed(feats) {
    const prioritized = feats
      .map((f) => ({ f, p: f.properties || {} }))
      .filter(({ p }) => p.name || p.name_en);
    if (!prioritized.length) return null;
    const rank = (id) => {
      if (/poi/i.test(id)) return 0;
      if (/transit|airport|station/i.test(id)) return 1;
      if (/building/i.test(id)) return 2;
      if (/place|settlement|locality|neighborhood/i.test(id)) return 3;
      return 4;
    };
    prioritized.sort((a, b) => {
      const ra = rank(a.f.layer?.id || "");
      const rb = rank(b.f.layer?.id || "");
      return ra - rb;
    });
    return prioritized[0].f;
  }

  map.on("click", (e) => {
    const feats = map.queryRenderedFeatures(e.point);
    const hit = findNamed(feats);
    if (!hit) return;
    const p = hit.properties || {};
    const name = p.name_en || p.name;
    selectSuggestion({
      name,
      place: (p.class || p.type || "").replace(/_/g, " "),
      full: name,
      type: "poi",
      coords: [e.lngLat.lng, e.lngLat.lat],
    });
  });

  map.on("mousemove", (e) => {
    const feats = map.queryRenderedFeatures(e.point);
    map.getCanvas().style.cursor = findNamed(feats) ? "pointer" : "";
  });

  const panel = document.getElementById("map-panel");
  const panelHero = document.getElementById("map-hero");
  const panelName = document.getElementById("map-name");
  const panelSub = document.getElementById("map-sub");
  const panelBody = document.getElementById("map-body");
  function closePanel() {
    panel.classList.remove("open");
    if (activeMarker) {
      activeMarker.remove();
      activeMarker = null;
    }
  }
  document.getElementById("map-panel-close").onclick = closePanel;

  function openPanelSkeleton() {
    panelBody.innerHTML = `
      <div class="mp-skeleton mp-skl"></div>
      <div class="mp-skeleton mp-skl mp-short"></div>
      <div class="mp-skeleton mp-skl mp-tall" style="margin-top:16px;"></div>
      <div class="mp-skeleton mp-skl"></div>
      <div class="mp-skeleton mp-skl mp-short"></div>`;
    panel.classList.add("open");
  }

  async function fetchPlace(name, lat, lng) {
    const token = galileoEncode(
      JSON.stringify([lng, galileoEncodeName(name), lat]),
    );
    const r = await fetch("/d", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-galileo-hint": GALILEO_HINT,
      },
      body: JSON.stringify([token]),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function openPanel(s, prefetched) {
    panelName.textContent = s.name;
    panelSub.textContent = s.place || "";
    panelHero.classList.add("mp-empty");
    panelHero.style.backgroundImage = "";
    openPanelSkeleton();
    if (prefetched) {
      renderPanel(s, prefetched);
      return;
    }
    fetchPlace(s.name, s.coords[1], s.coords[0])
      .then((data) => renderPanel(s, data))
      .catch((err) => {
        panelBody.innerHTML = `<div class="mp-empty-hint">Error: ${esc(err.message)}</div>`;
      });
  }

  async function smartGoto(q) {
    if (!q) return;
    openPanelSkeleton();
    const c = map.getCenter();
    try {
      const data = await fetchPlace(q, c.lat, c.lng);
      if (data?.place?.coordinates) {
        const [lng, lat] = data.place.coordinates;
        const s = {
          name: data.place.name || q,
          place: data.place.address || "",
          full: data.place.address || "",
          type: "poi",
          coords: [lng, lat],
        };
        placePin(lng, lat);
        map.flyTo({
          center: [lng, lat],
          zoom: 17.2,
          pitch: 60,
          bearing: 0,
          speed: 1.2,
          curve: 1.6,
          essential: true,
        });
        openPanel(s, data);
        return;
      }
    } catch (err) {
      console.error(err);
    }
    if (currentSuggestions[0]) {
      selectSuggestion(currentSuggestions[0]);
    } else {
      const panel = document.getElementById("map-panel");
      panel.classList.remove("open");
    }
  }

  function hostOf(u) {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  }

  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/></svg>',
    directions:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5-5 18-3-8-10-5z"/></svg>',
    clock:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    chev: '<svg class="mp-hours-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    target:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  };

  const iconRow = (icon, label, value) =>
    `<div class="mp-info-row">${ICONS[icon] || ""}<div class="mp-v">${label ? `<div class="mp-k">${esc(label)}</div>` : ""}<div>${value}</div></div></div>`;

  function formatTime(hhmm) {
    if (!hhmm) return "";
    const parts = String(hhmm).split(":").map(Number);
    const h = parts[0];
    const m = parts[1] || 0;
    if (!Number.isFinite(h)) return hhmm;
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0
      ? `${h12} ${period}`
      : `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }

  function formatHoursRange(range) {
    if (!range) return "";
    const parts = String(range).split(/[–\-\u2013]/);
    if (parts.length !== 2) return range;
    const [a, b] = parts.map((t) => formatTime(t.trim().slice(0, 5)));
    return `${a}-${b}`;
  }

  function renderStars(rating) {
    const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    let out = "";
    for (let i = 0; i < 5; i++) {
      out += i < n ? "●" : '<span class="mp-dot-off">●</span>';
    }
    return `<span class="mp-rating-dots">${out}</span>`;
  }

  function renderPhotoStrip(p) {
    const all = [];
    const seen = new Set();
    const add = (u) => {
      if (!u || seen.has(u)) return;
      seen.add(u);
      all.push(u);
    };
    if (p.image) add(p.image);
    (p.photos || []).forEach(add);
    const strip = all.slice(0, 3);
    if (!strip.length) return "";
    return `<div class="mp-photo-strip">${strip
      .map((url) => {
        return `<div class="mp-photo-tile" data-full="${esc(url)}" style="background-image:url('${esc(url)}')"></div>`;
      })
      .join("")}</div>`;
  }

  function renderTitleBlock(p, s) {
    const name = esc(p.name || s.name);
    const parts = [];
    if (p.category) parts.push(p.category);
    if (p.city) {
      const hasCity = (p.category || "")
        .toLowerCase()
        .includes(p.city.toLowerCase());
      if (!hasCity) parts.push(`in ${p.city}`);
    }
    const subtitle = parts.join(" ") || s.place || "";
    return `
      <div class="mp-title-block">
        <h2 class="mp-title">${name}</h2>
        ${subtitle ? `<div class="mp-subtitle">${esc(subtitle)}</div>` : ""}
        ${
          p.website
            ? `<a class="mp-title-link" href="${esc(p.website)}" target="_blank" rel="noopener">${ICONS.globe}<span>${esc(hostOf(p.website))}</span></a>`
            : ""
        }
      </div>
    `;
  }

  function renderRatingStatus(p) {
    const hasReviews = typeof p.reviewCount === "number";
    const h = p.hours;
    let statusHtml = "";
    if (h && (h.is_open != null || h.state_switch_time)) {
      const isOpen = !!h.is_open;
      const soon = !!h.closes_soon;
      const sts = h.state_switch_time;
      const tLabel = sts ? formatTime(String(sts).slice(0, 5)) : "";
      if (isOpen) {
        const cls = soon ? "mp-warn" : "mp-open";
        statusHtml = `<span class="${cls}">Open</span>${tLabel ? ` <span class="mp-muted">· Closes at ${esc(tLabel)}</span>` : ""}`;
      } else {
        statusHtml = `<span class="mp-closed">Closed</span>${tLabel ? ` <span class="mp-muted">· Opens at ${esc(tLabel)}</span>` : ""}`;
      }
    }
    if (!hasReviews && !statusHtml) return "";
    return `<div class="mp-rating-row">
      <div class="mp-rating-count">${hasReviews ? `${p.reviewCount.toLocaleString()} Reviews` : ""}</div>
      ${statusHtml ? `<div class="mp-status">${statusHtml}</div>` : ""}
    </div>`;
  }

  function renderActions(p, lat, lng) {
    const actions = [];
    if (p.website) {
      actions.push({
        icon: "globe",
        label: "Website",
        href: p.website,
        external: true,
      });
    }
    actions.push({
      icon: "directions",
      label: "Directions",
      href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      external: true,
    });
    if (p.phone) {
      actions.push({ icon: "phone", label: "Call", href: `tel:${p.phone}` });
    }
    if (!actions.length) return "";
    return `<div class="mp-actions">${actions
      .map(
        (a) =>
          `<a class="mp-action" href="${esc(a.href)}" ${a.external ? 'target="_blank" rel="noopener"' : ""}>${ICONS[a.icon] || ""}<span>${esc(a.label)}</span></a>`,
      )
      .join("")}</div>`;
  }

  function renderInfoRows(p) {
    const rows = [];
    if (p.address) rows.push(iconRow("pin", null, esc(p.address)));
    if (p.phoneDisplay || p.phone) {
      const display = p.phoneDisplay || p.phone;
      const tel = p.phone || display;
      rows.push(
        iconRow("phone", null, `<a href="tel:${esc(tel)}">${esc(display)}</a>`),
      );
    }
    return rows.length
      ? `<div class="mp-info-list">${rows.join("")}</div>`
      : "";
  }

  function renderHours(p) {
    const h = p.hours;
    if (!h) {
      if (p.openingHoursText) {
        return `<div class="mp-info-row">${ICONS.clock}<div class="mp-v"><div>${esc(p.openingHoursText)}</div></div></div>`;
      }
      return "";
    }
    const dayKeys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const hasAny = dayKeys.some((d) => h[d]);
    if (!hasAny) return "";
    const todayIdx = (new Date().getDay() + 6) % 7;
    const today = dayKeys[todayIdx];
    const todayRange = h[today] ? formatHoursRange(h[today]) : "Closed";
    const daysHtml = dayKeys
      .map((d) => {
        const r = h[d];
        const formatted = r ? formatHoursRange(r) : "Closed";
        const todayCls = d === today ? " mp-hour-today" : "";
        return `<div class="mp-hour-row${todayCls}"><span>${d}</span><span>${esc(formatted)}</span></div>`;
      })
      .join("");
    return `
      <details class="mp-hours">
        <summary>
          ${ICONS.clock}
          <div class="mp-hours-label"><strong>${today}</strong> ${esc(todayRange)}</div>
          ${ICONS.chev}
        </summary>
        <div class="mp-hours-list">${daysHtml}</div>
      </details>
    `;
  }

  function renderDescription(p) {
    if (!p.description) return "";
    const url = p.url;
    const engine = p.engine || "source";
    const more = url
      ? ` <a class="mp-review-more" href="${esc(url)}" target="_blank" rel="noopener">More on ${esc(engine)}</a>`
      : "";
    return `<div class="mp-review" style="border-bottom:none;padding-top:0"><div class="mp-review-text">${esc(p.description)}${more}</div></div>`;
  }

  function renderReviews(p) {
    if (!p.reviews?.length) return "";
    const items = p.reviews
      .map((r) => {
        const initials = (r.user.name || "?")
          .split(/\s+/)
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        const date = r.date
          ? new Date(r.date * 1000).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "";
        const avatar = r.user.image
          ? `<div class="mp-review-avatar"><img src="${esc(r.user.image)}" alt="" loading="lazy"/></div>`
          : `<div class="mp-review-avatar">${esc(initials)}</div>`;
        const moreLink = p.url
          ? ` <a class="mp-review-more" href="${esc(p.url)}" target="_blank" rel="noopener">More on ${esc(p.engine || "source")}</a>`
          : "";
        return `
          <div class="mp-review">
            ${renderStars(r.rating)}
            <div class="mp-review-text">${esc(r.excerpt)}${moreLink}</div>
            <div class="mp-review-meta">
              ${avatar}
              <div class="mp-review-name">${esc(r.user.name)}</div>
              <div class="mp-review-date">· ${esc(date)}</div>
            </div>
          </div>
        `;
      })
      .join("");
    return `<div class="mp-reviews-section">
      <div class="mp-reviews-header">
        <div class="mp-reviews-title">What people say</div>
      </div>
      ${items}
    </div>`;
  }

  function renderPanel(s, data) {
    const [lng, lat] = s.coords;
    const p = data.place;

    if (!p) {
      panelBody.innerHTML = `
        <div class="mp-title-block">
          <h2 class="mp-title">${esc(s.name)}</h2>
          ${s.place ? `<div class="mp-subtitle">${esc(s.place).split("")[0].toUpperCase() + esc(s.place).slice(1)}</div>` : ""}
        </div>
        <div class="mp-info-list">${iconRow("target", null, `<span class="mp-mono">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>`)}</div>
      `;
      return;
    }

    panelBody.innerHTML = [
      renderPhotoStrip(p),
      renderTitleBlock(p, s),
      renderRatingStatus(p),
      renderActions(p, lat, lng),
      renderInfoRows(p),
      renderHours(p),
      renderDescription(p),
      renderReviews(p),
    ]
      .filter(Boolean)
      .join("");

    panelBody.querySelectorAll(".mp-photo-tile").forEach((el) => {
      el.addEventListener("click", () => openLightbox(el.dataset.full));
    });
  }

  const lightbox = document.getElementById("map-lightbox");
  const lightboxImg = document.getElementById("map-lightbox-img");
  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.add("open");
  }
  lightbox.onclick = () => lightbox.classList.remove("open");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") lightbox.classList.remove("open");
  });

  const backBtn = document.getElementById("mp-back");
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      const q = input.value.trim();
      if (q) {
        e.preventDefault();
        window.location.href = `/?q=${encodeURIComponent(q)}&pass`;
      }
    });
  }

  if (initialQuery) {
    input.value = initialQuery;
    map.once("load", () => {
      runSearch(initialQuery);
      smartGoto(initialQuery);
    });
  }
})();
