(() => {
  const captcha = () => import("/s/captcha.js");
  const solveCaptcha = async () => (await captcha()).solveCaptcha();
  const refillPool = async () =>
    (await captcha()).refill({ force: true }).catch(() => false);
  const refillWhenLow = (results) => {
    if (results?.pow_low) captcha().then((m) => m.refillWhenIdle());
  };

  const safeUrl = (url) => {
    if (!url) return "#";
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:")
        return url;
    } catch {}
    return "#";
  };

  let isLoading = false;
  let hasMoreResults = true;
  let pk = "__results_pk__";
  const currentQuery = new URLSearchParams(window.location.search).get("q");

  const renderNewsResult = (r) => {
    const favicon = r.meta_url?.favicon || r.profile?.img || "";
    const siteName = r.profile?.name || r.meta_url?.hostname || "";
    const title = r.title || "";
    const description = r.description || "";
    const age = r.age || "";
    const url = safeUrl(r.url);
    const thumb = r.thumbnail?.src ? safeUrl(r.thumbnail.src) : "";
    const isLive = r.is_live || false;

    const article = document.createElement("article");
    article.className = "news-result";

    const link = document.createElement("a");
    link.href = url;
    link.className = "news-result-link";

    const content = document.createElement("div");
    content.className = "news-result-content";

    const header = document.createElement("div");
    header.className = "news-result-header";

    if (favicon) {
      const faviconImg = document.createElement("img");
      faviconImg.src = safeUrl(favicon);
      faviconImg.className = "news-result-favicon";
      faviconImg.alt = "";
      faviconImg.loading = "lazy";
      faviconImg.onerror = () => {
        faviconImg.style.display = "none";
      };
      header.append(faviconImg);
    }

    const siteNameSpan = document.createElement("span");
    siteNameSpan.className = "news-result-site";
    siteNameSpan.textContent = siteName;
    header.append(siteNameSpan);

    if (age) {
      const ageSpan = document.createElement("span");
      ageSpan.className = "news-result-age";
      ageSpan.textContent = age;
      header.append(ageSpan);
    }

    if (isLive) {
      const liveBadge = document.createElement("span");
      liveBadge.className = "news-result-live";
      liveBadge.textContent = "live";
      header.append(liveBadge);
    }

    content.append(header);

    const titleEl = document.createElement("h2");
    titleEl.className = "news-result-title";
    titleEl.innerHTML = title;
    content.append(titleEl);

    if (description) {
      const descEl = document.createElement("p");
      descEl.className = "news-result-desc";
      descEl.textContent = description;
      content.append(descEl);
    }

    link.append(content);

    if (thumb) {
      const thumbWrapper = document.createElement("div");
      thumbWrapper.className = "news-result-thumb";

      const thumbImg = document.createElement("img");
      thumbImg.src = thumb;
      thumbImg.alt = "";
      thumbImg.loading = "lazy";
      thumbImg.onload = () => thumbWrapper.classList.add("loaded");
      thumbImg.onerror = () => thumbWrapper.remove();
      thumbWrapper.append(thumbImg);

      link.append(thumbWrapper);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "news-result-thumb-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = ">.<";
      link.append(placeholder);
    }

    article.append(link);
    return article;
  };

  const renderNews = (results) => {
    const container = document.getElementById("news-results");
    const frag = document.createDocumentFragment();

    if (!results?.length) {
      const noResults = document.createElement("div");
      noResults.className = "no-results";
      noResults.textContent = "no news found";
      frag.append(noResults);
    } else {
      for (const r of results) frag.append(renderNewsResult(r));
    }

    container.append(frag);
  };

  const appendNews = (results) => {
    const container = document.getElementById("news-results");
    const frag = document.createDocumentFragment();

    for (const r of results) frag.append(renderNewsResult(r));

    container.append(frag);
  };

  const loadMoreNews = async () => {
    if (isLoading || !hasMoreResults || !currentQuery) return;

    isLoading = true;
    const loadingEl = document.getElementById("loading-indicator");
    loadingEl.classList.add("visible");

    try {
      const res = await fetch("/p", {
        method: "POST",
        headers: {
          "X-Galileo-Hash": [...`${currentQuery}${pk}`]
            .reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
            .toString(16),
          "X-Galileo-JWT": "__results_cl__",
          "X-Galileo-Pass": "%%galileo_pass%%",
        },
        body: pk,
      });

      pk = res.headers.get("x-galileo-upk") || pk;
      const newData = await res.json();

      if (newData.pow_required) {
        if (await refillPool()) setTimeout(loadMoreNews);
        else hasMoreResults = false;
        return;
      }
      refillWhenLow(newData);

      if (newData.error || !newData.results?.length) {
        hasMoreResults = false;
        loadingEl.classList.remove("visible");
        if (!newData.results?.length) {
          const endEl = document.createElement("div");
          endEl.className = "end-of-results";
          endEl.textContent = "no more news";
          document.getElementById("news-results").append(endEl);
        }
        return;
      }

      appendNews(newData.results);
      hasMoreResults =
        newData.more_results_available !== false && newData.results.length > 0;
    } catch (err) {
      console.error("failed to load more news:", err);
    } finally {
      isLoading = false;
      if (document.getElementById("loading-indicator")) {
        document
          .getElementById("loading-indicator")
          .classList.remove("visible");
      }
    }
  };

  const data = __results_template__;
  hasMoreResults = data.more_results_available !== false;
  refillWhenLow(data);

  if (data.pow_required) {
    solveCaptcha().then(() => {
      location.reload();
    });
  } else {
    renderNews(data.results);

    const sentinel = document.getElementById("load-more-sentinel");
    if (sentinel) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            loadMoreNews();
          }
        },
        {
          rootMargin: "400px",
        },
      );

      if (currentQuery && hasMoreResults) {
        observer.observe(sentinel);
      }
    }
  }

  const keyState = { key: "", at: 0 };
  document.addEventListener("keydown", (event) => {
    const input = document.querySelector(".search-bar input");
    if (document.activeElement === input) return;

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const lastKey = keyState.key;
    const quick = Date.now() - keyState.at < 600;
    keyState.key = event.key;
    keyState.at = Date.now();

    if (
      ["/", "i", "a", "S"].includes(event.key) ||
      (event.key === "c" && lastKey === "c" && quick)
    ) {
      if (event.key === "S" || event.key === "c") input.value = "";
      input.focus();
      const at = event.key === "i" ? 0 : input.value.length;
      input.setSelectionRange(at, at);
      keyState.key = "";
      event.preventDefault();
      return;
    }

    if (event.key === "w") {
      document.querySelectorAll(".tabs .tab")[0].click();
    }

    if (event.key === "p") {
      document.querySelectorAll(".tabs .tab")[1].click();
    }

    if (event.key === "n") {
      document.querySelectorAll(".tabs .tab")[2].click();
    }

    const visibleResults = () =>
      [...document.querySelectorAll(".news-result-link")].filter((r) =>
        r.checkVisibility(),
      );

    if (event.key === "y" && lastKey === "y" && quick) {
      const results = visibleResults();
      const target = results.includes(document.activeElement)
        ? document.activeElement
        : results.find((r) => r.getBoundingClientRect().top >= 0);
      keyState.key = "";
      if (!target?.href) return;
      (navigator.clipboard?.writeText(target.href) ?? Promise.reject())
        .then(
          () => "link copied",
          () => "couldn't copy the link",
        )
        .then((text) => {
          document.querySelector(".ms-toast")?.remove();
          const toast = Object.assign(document.createElement("div"), {
            className: "ms-toast",
            role: "status",
            textContent: text,
          });
          document.body.append(toast);
          setTimeout(() => toast.remove(), 1600);
        });
      return;
    }

    if (["j", "k", "ArrowUp", "ArrowDown"].includes(event.key)) {
      const results = visibleResults();
      if (!results.length) return;

      const down = event.key === "j" || event.key === "ArrowDown";
      let index = results.indexOf(document.activeElement);
      if (index === -1) {
        index = down
          ? results.findIndex((r) => r.getBoundingClientRect().top >= 0)
          : results.findLastIndex(
              (r) => r.getBoundingClientRect().bottom <= innerHeight,
            );
        if (index === -1) index = down ? 0 : results.length - 1;
      } else {
        index = (index + (down ? 1 : -1) + results.length) % results.length;
      }

      results[index].focus();
      event.preventDefault();
    }
  });
})();
