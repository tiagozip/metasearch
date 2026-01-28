(() => {
	const solveCaptcha = async (a) => {
		const { solveCaptcha } = await import("/s/captcha.js");
		return solveCaptcha(a);
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
      faviconImg.onerror = () => { faviconImg.style.display = "none" };
			header.append(faviconImg);
		}

		const siteNameSpan = document.createElement("span");
		siteNameSpan.className = "news-result-site";
		siteNameSpan.textContent = siteName;
		header.append(siteNameSpan);

		if (age) {
			const dot = document.createElement("span");
			dot.className = "news-result-dot";
			dot.textContent = "·";
			header.append(dot);

			const ageSpan = document.createElement("span");
			ageSpan.className = "news-result-age";
			ageSpan.textContent = age;
			header.append(ageSpan);
		}

		if (isLive) {
			const liveBadge = document.createElement("span");
			liveBadge.className = "news-result-live";
			liveBadge.textContent = "LIVE";
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
			thumbImg.onerror = () => thumbWrapper.remove();
			thumbWrapper.append(thumbImg);

			link.append(thumbWrapper);
		} else {
			const placeholder = document.createElement("div");
			placeholder.className = "news-result-thumb-placeholder";
			placeholder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M4 20h16"/><path d="M8 7h.01"/><path d="M16 7h.01"/><path d="M8 11h8"/><path d="M8 15h6"/></svg>`;
			link.append(placeholder);
		}

		article.append(link);
		return article;
	};

	const renderNews = (results) => {
		const container = document.getElementById("news-results");
		const frag = document.createDocumentFragment();

		if (!results || !results.length) {
			const noResults = document.createElement("div");
			noResults.className = "no-results";
			noResults.textContent = "No news found";
			frag.append(noResults);
		} else {
			for (const r of results) {
				frag.append(renderNewsResult(r));
			}
		}

		container.append(frag);
	};

	const appendNews = (results) => {
		const container = document.getElementById("news-results");
		const frag = document.createDocumentFragment();

		for (const r of results) {
			frag.append(renderNewsResult(r));
		}

		container.append(frag);
	};

	const loadMoreNews = async () => {
		if (isLoading || !hasMoreResults || !currentQuery) return;

		isLoading = true;
		const loadingEl = document.getElementById("loading-indicator");
		loadingEl.style.display = "flex";

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

			if (newData.captchaHtml) {
				await solveCaptcha(newData.captchaHtml);
				loadMoreNews();
				return;
			}

			if (newData.error || !newData.results?.length) {
				hasMoreResults = false;
				loadingEl.style.display = "none";
				if (!newData.results?.length) {
					const endEl = document.createElement("div");
					endEl.className = "end-of-results";
					endEl.textContent = "No more news";
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
				document.getElementById("loading-indicator").style.display = "none";
			}
		}
	};

  const data = __results_template__;
	hasMoreResults = data.more_results_available !== false;

	if (data.captchaHtml) {
		solveCaptcha(data.captchaHtml).then(() => {
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
})();
