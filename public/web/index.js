(() => {
  let isLoading, hasHadWebResult;
  const currentQuery = new URLSearchParams(window.location.search).get("q");

  const solveCaptcha = async (a) => {
    const { solveCaptcha } = await import("/s/captcha.js");
    return solveCaptcha(a);
  };

  const safeUrl = (url) => {
    if (!url) return "#";
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
    } catch {}
    return "#";
  };

  const analyzeImage = (pick) =>
    new Promise((resolve) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onerror = () => resolve({ ...pick, broken: true });
      im.onload = () => {
        const nw = im.naturalWidth, nh = im.naturalHeight;
        if (!nw || !nh) return resolve({ ...pick, broken: true });
        pick = { ...pick, naturalW: nw, naturalH: nh };

        try {
          const SCAN = 200;
          const sx = Math.min(SCAN / nw, SCAN / nh, 1);
          const sw = Math.max(1, Math.round(nw * sx));
          const sh = Math.max(1, Math.round(nh * sx));
          const c = document.createElement("canvas");
          c.width = sw;
          c.height = sh;
          const ctx = c.getContext("2d");
          ctx.drawImage(im, 0, 0, sw, sh);
          const { data } = ctx.getImageData(0, 0, sw, sh);

          let oMinX = sw, oMaxX = -1, oMinY = sh, oMaxY = -1;
          let cMinX = sw, cMaxX = -1, cMinY = sh, cMaxY = -1;
          let opaque = 0, dark = 0;
          for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
              const i = (y * sw + x) * 4;
              const a = data[i + 3];
              if (a < 64) continue;
              opaque++;
              if (x < oMinX) oMinX = x;
              if (x > oMaxX) oMaxX = x;
              if (y < oMinY) oMinY = y;
              if (y > oMaxY) oMaxY = y;
              const r = data[i], g = data[i + 1], b = data[i + 2];
              const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              if (lum < 70) dark++;
              if (r < 235 || g < 235 || b < 235) {
                if (x < cMinX) cMinX = x;
                if (x > cMaxX) cMaxX = x;
                if (y < cMinY) cMinY = y;
                if (y > cMaxY) cMaxY = y;
              }
            }
          }

          if (oMaxX < 0) return resolve({ ...pick, broken: true });

          const opaqueArea = (oMaxX - oMinX + 1) * (oMaxY - oMinY + 1);
          const opaqueFillsImage = opaqueArea > sw * sh * 0.85;
          const hasContent = cMaxX >= 0;
          const contentArea = hasContent
            ? (cMaxX - cMinX + 1) * (cMaxY - cMinY + 1)
            : opaqueArea;
          const hasWhiteBg =
            opaqueFillsImage &&
            hasContent &&
            contentArea < opaqueArea * 0.7;

          const cropBbox = hasWhiteBg
            ? { L: cMinX, R: cMaxX, T: cMinY, B: cMaxY }
            : { L: oMinX, R: oMaxX, T: oMinY, B: oMaxY };

          const transMarginX = oMinX + (sw - 1 - oMaxX);
          const transMarginY = oMinY + (sh - 1 - oMaxY);
          const hasTransMargin = transMarginX > sw * 0.05 || transMarginY > sh * 0.05;
          const shouldCrop = hasTransMargin || hasWhiteBg;

          const darkRatio = opaque ? dark / opaque : 0;
          const needsBackdrop = pick.contain && darkRatio > 0.6;

          resolve({
            ...pick,
            broken: false,
            hasWhiteBg,
            needsBackdrop,
            crop: shouldCrop
              ? {
                  L: cropBbox.L,
                  T: cropBbox.T,
                  W: cropBbox.R - cropBbox.L + 1,
                  H: cropBbox.B - cropBbox.T + 1,
                  imgW: sw,
                  imgH: sh,
                }
              : null,
          });
        } catch {
          resolve({ ...pick, broken: false, hasWhiteBg: false, needsBackdrop: false, crop: null });
        }
      };
      im.src = pick.src;
    });

  const renderInfoboxImagesAsync = async (rawImages, box, header, linkUrl) => {
    let picks = pickInfoboxImages(rawImages);

    const onlyLogos = picks.length > 0 && picks.every((p) => p.contain);
    if (!picks.length || onlyLogos) {
      const heroSrc = data.results?.web?.results?.[0]?.thumbnail?.src;
      const safe = heroSrc ? safeUrl(heroSrc) : "#";
      if (safe !== "#") {
        const hero = await analyzeImage({ src: safe, contain: false });
        if (!hero.broken && !hero.hasWhiteBg) picks = [{ src: safe, contain: false }];
      }
    }
    if (!picks.length) return;

    const analyzed = await Promise.all(picks.map(analyzeImage));
    const valid = analyzed.filter(
      (a) => !a.broken && Math.min(a.naturalW, a.naturalH) >= 48,
    );
    if (!valid.length) return;

    const noWhiteBg = valid.filter((a) => !a.hasWhiteBg);
    const final = noWhiteBg.length ? noWhiteBg : valid;
    if (!final.length) return;

    const allLogos = final.every((a) => a.contain);
    const useGallery = !allLogos && final.length >= 3;
    const ranked = [...final].sort(
      (a, b) => b.naturalW * b.naturalH - a.naturalW * a.naturalH,
    );
    const display = useGallery ? ranked.slice(0, 5) : ranked.slice(0, 1);
    const wrapUrl = linkUrl ? safeUrl(linkUrl) : "#";
    const linkWrap = (cls) => {
      const w = document.createElement(wrapUrl !== "#" ? "a" : "div");
      if (wrapUrl !== "#") {
        w.href = wrapUrl;
        w.target = "_blank";
        w.rel = "noopener";
      }
      w.className = cls;
      return w;
    };

    if (!useGallery && display.length === 1 && !display[0].contain) {
      const a = display[0];
      if (a.naturalW / a.naturalH >= 1.3) {
        const wide = linkWrap("infobox-hero-wide");
        const img = document.createElement("img");
        img.src = a.src;
        img.alt = "";
        img.loading = "lazy";
        img.onerror = () => wide.remove();
        wide.append(img);
        header.after(wide);
        return;
      }
    }

    const container = document.createElement("div");
    container.className = useGallery
      ? "infobox-gallery"
      : `infobox-header-right count-${display.length}`;

    for (const a of display) {
      const wrap = linkWrap(
        useGallery ? "infobox-gallery-item" : "infobox-img-wrap",
      );
      if (a.needsBackdrop) wrap.classList.add("needs-backdrop");

      const img = document.createElement("img");
      img.crossOrigin = "anonymous";
      img.src = a.src;
      img.className = `infobox-img${a.contain ? " contain" : ""}`;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => wrap.remove();

      const isCount1 = !useGallery && display.length === 1;
      const visibleW = a.crop ? a.crop.W : a.naturalW;
      const visibleH = a.crop ? a.crop.H : a.naturalH;
      const visibleAspect = visibleW && visibleH ? visibleW / visibleH : 1;
      const useNarrow = isCount1 && visibleAspect < 0.85;

      if (useNarrow) {
        wrap.classList.add("narrow");
        wrap.style.setProperty("--aspect", visibleAspect.toFixed(4));
      }

      if (a.crop) {
        wrap.classList.add("cropped");
        if (useNarrow) {
          const w = (a.crop.imgW / a.crop.W) * 100;
          const h = (a.crop.imgH / a.crop.H) * 100;
          const x = (-a.crop.L / a.crop.W) * 100;
          const y = (-a.crop.T / a.crop.H) * 100;
          img.style.setProperty("--w", `${w.toFixed(2)}%`);
          img.style.setProperty("--h", `${h.toFixed(2)}%`);
          img.style.setProperty("--x", `${x.toFixed(2)}%`);
          img.style.setProperty("--y", `${y.toFixed(2)}%`);
        } else {
          const ratio = Math.max(a.crop.W, a.crop.H);
          const w = (a.crop.imgW / ratio) * 100;
          const h = (a.crop.imgH / ratio) * 100;
          const x = (0.5 - (a.crop.L + a.crop.W / 2) / ratio) * 100;
          const y = (0.5 - (a.crop.T + a.crop.H / 2) / ratio) * 100;
          img.style.setProperty("--w", `${w.toFixed(2)}%`);
          img.style.setProperty("--h", `${h.toFixed(2)}%`);
          img.style.setProperty("--x", `${x.toFixed(2)}%`);
          img.style.setProperty("--y", `${y.toFixed(2)}%`);
        }
      }

      wrap.append(img);
      container.append(wrap);
    }

    if (useGallery) {
      box.prepend(container);
    } else {
      header.append(container);
    }
  };

  const pickInfoboxImages = (raw) => {
    if (!raw?.length) return [];

    const all = raw
      .map((img) => {
        let src = img?.src || img?.original || (typeof img === "string" ? img : "");
        if (src?.startsWith?.("//")) src = `https:${src}`;
        if (!src) return null;
        const safe = safeUrl(src);
        if (safe === "#") return null;
        return { src: safe, isLogo: !!img?.logo };
      })
      .filter(Boolean);

    const seen = new Set();
    const unique = all.filter((i) => {
      if (seen.has(i.src)) return false;
      seen.add(i.src);
      return true;
    });

    const photos = unique.filter((i) => !i.isLogo);
    const pool = photos.length ? photos : unique;
    const onlyLogos = !photos.length;

    return pool.slice(0, 5).map((i) => ({
      src: i.src,
      contain: onlyLogos && i.isLogo,
    }));
  };

  const renderWebResult = (r) => {
    const favicon = r.meta_url?.favicon || r.profile?.img || "";
    const siteName = r.profile?.name || r.meta_url?.hostname || "";
    const title = r.title || "";
    const age = r.age || "";
    const url = safeUrl(r.url);
    const thumb = r.thumbnail?.src ? safeUrl(r.thumbnail.src) : "";

    let urlPath = "";
    let urlSource = "";
    try {
      const parsed = new URL(r.url);
      urlPath = parsed.hostname.replace("www.", "") + parsed.pathname + parsed.search;
      urlSource = parsed.hostname;

      if (urlPath.endsWith("/")) {
        urlPath = urlPath.slice(0, -1);
      }

      if (urlSource.includes("reddit.com")) {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts[0] === "r" && parts[1]) {
          urlPath = `r/${parts[1]}`;
        }
      } else if (
        ["x.com", "instagram.com"].some((d) => urlSource.endsWith(`.${d}`) || urlSource === d)
      ) {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts[0]) {
          urlPath = `@${parts[0]}`;
        }
      } else if (
        [
          "wikipedia.org",
          "amazon.com",
          "amazon.co.uk",
          "amazon.ca",
          "amazon.in",
          "youtube.com",
        ].some((d) => urlSource.endsWith(`.${d}`) || urlSource === d)
      ) {
        urlPath = "";
      }
    } catch {}

    const source = document.createElement("div");
    source.className = "result-source";

    if (favicon) {
      const faviconImg = document.createElement("img");
      faviconImg.src = safeUrl(favicon);
      faviconImg.className = "favicon";
      faviconImg.alt = "";
      faviconImg.loading = "lazy";
      faviconImg.onerror = () => {
        const base = urlSource.split(".").slice(-2).join(".");
        const ddg = `https://external-content.duckduckgo.com/ip3/${base}.ico`;
        if (base && faviconImg.src !== ddg) faviconImg.src = ddg;
        else faviconImg.remove();
      };
      source.append(faviconImg);
    }

    const siteNameSpan = document.createElement("span");
    siteNameSpan.className = "site-name";
    siteNameSpan.textContent = siteName;
    source.append(siteNameSpan);

    if (urlPath) {
      const urlPathSpan = document.createElement("span");
      urlPathSpan.className = "url-path";
      urlPathSpan.textContent = urlPath;
      source.append(urlPathSpan);
    }

    if (age) {
      const ageSpan = document.createElement("span");
      ageSpan.className = "age";
      ageSpan.textContent = `· ${age}`;
      source.append(ageSpan);
    }

    const titleEl = document.createElement("a");
    titleEl.href = url;
    titleEl.className = "result-title";
    titleEl.textContent = title;

    const desc = document.createElement("p");
    desc.className = "result-desc";
    desc.innerHTML = r.description || "";

    const content = document.createElement("div");
    content.className = "result-content";
    content.append(source, titleEl, desc);

    if (r.deep_results?.buttons?.length) {
      const sitelinks = document.createElement("div");
      sitelinks.className = "sitelinks";
      for (const b of r.deep_results.buttons) {
        const link = document.createElement("a");
        link.href = safeUrl(b.url);
        link.className = "sitelink";
        link.textContent = b.title;
        sitelinks.append(link);
      }
      content.append(sitelinks);
    }

    if (r.cluster?.length) {
      const cluster = document.createElement("div");
      cluster.className = "link-cluster";
      for (const c of r.cluster) {
        const item = document.createElement("div");
        item.className = "link-cluster-item";

        const link = document.createElement("a");
        link.href = safeUrl(c.url);
        link.className = "link-cluster-title";
        link.textContent = c.title || c.label;
        item.append(link);

        if (c.description) {
          const desc = document.createElement("div");
          desc.className = "link-cluster-desc";
          desc.innerHTML = c.description;
          item.append(desc);
        }

        cluster.append(item);
      }
      content.append(cluster);
    }

    const article = document.createElement("article");
    article.className = "result web-result";
    article.append(content);

    if (thumb && (!hasHadWebResult || urlSource.endsWith("wikipedia.org"))) {
      const thumbLink = document.createElement("a");
      thumbLink.href = url;
      thumbLink.className = "result-thumb-link";
      const thumbImg = document.createElement("img");
      thumbImg.src = thumb;
      thumbImg.className = "result-thumb";
      thumbImg.alt = "";
      thumbImg.loading = "lazy";
      thumbImg.onerror = () => thumbLink.remove();
      thumbLink.append(thumbImg);
      article.append(thumbLink);
    }

    if (!hasHadWebResult) {
      const u = new URL(url);
      const sourceHost = u.hostname.replace(/^www\./, "").toLowerCase();

      if (sourceHost === "youtube.com" || sourceHost.endsWith(".youtube.com")) {
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);

        if (videoIdMatch) {
          const videoId = videoIdMatch[1];
          const iframe = document.createElement("iframe");
          iframe.style.cssText = `width:100%;aspect-ratio:16/9;border-radius:6px;border:1px solid rgb(49, 50, 68);background-color:black;`;
          iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1`;
          iframe.allow = "encrypted-media";
          iframe.loading = "lazy";
          iframe.referrerpolicy = "strict-origin-when-cross-origin";

          iframe.allowFullscreen = true;
          document.querySelector("#results-all").append(iframe);

          article.classList.add("youtube-featured");

          iframe.addEventListener("load", () => {
            const handshake = JSON.stringify({ event: "listening", id: videoId, channel: "widget" });
            const subscribe = JSON.stringify({ event: "command", func: "addEventListener", args: ["onError"], id: videoId, channel: "widget" });
            iframe.contentWindow?.postMessage(handshake, "*");
            iframe.contentWindow?.postMessage(subscribe, "*");
          });

          const onErrorMessage = (e) => {
            if (e.source !== iframe.contentWindow) return;
            let data;
            try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
            if (data?.event !== "onError") return;
            if (![100, 101, 150, 153].includes(data.info)) return;

            window.removeEventListener("message", onErrorMessage);

            const fallback = document.createElement("a");
            fallback.href = `https://www.youtube.com/watch?v=${videoId}`;
            fallback.target = "_blank";
            fallback.rel = "noopener";
            fallback.style.cssText = `position:relative;display:block;width:100%;aspect-ratio:16/9;border-radius:6px;border:1px solid rgb(49, 50, 68);background:#000 center/cover no-repeat;overflow:hidden;`;
            fallback.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><svg fill="#fff" height="80px" viewBox="0 0 24 24" width="80px"><path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z"></path></svg></div>`;

            const probe = new Image();
            probe.onload = () => {
              fallback.style.backgroundImage = probe.naturalWidth > 120
                ? `url(${probe.src})`
                : `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)`;
            };
            probe.onerror = () => {
              fallback.style.backgroundImage = `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)`;
            };
            probe.src = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

            iframe.replaceWith(fallback);
          };
          window.addEventListener("message", onErrorMessage);
        }
      }

      if (sourceHost === "polymarket.com" || sourceHost.endsWith(".polymarket.com")) {
        const eventMatch = url.match(/\/event\/([^/?]+)/);
        if (eventMatch) {
          const eventSlug = eventMatch[1];
          const iframe = document.createElement("iframe");
          iframe.style.cssText = `width:100%;aspect-ratio:730/300;border-radius:1rem;`;
          iframe.title = "polymarket-market-iframe";
          iframe.src = `https://embed.polymarket.com/market?event=${eventSlug}&rotate=true&theme=dark&liveactivity=true&buttons=false&border=true&width=730&height=300`;
          iframe.width = "730";
          iframe.height = "300";
          iframe.frameBorder = "0";
          iframe.loading = "lazy";
          document.querySelector("#results-all").append(iframe);
          article.classList.add("youtube-featured");
        }
      }

      if (
        ["whatismyipaddress.com","whatismyip.com","showmyip.com"].includes(sourceHost) &&
        (u.pathname === "/" || u.pathname === "")
      ) {
        const ipFrame = document.createElement("div");
        ipFrame.style.cssText = `width: 100%;border: 1px solid var(--surface0);border-radius: 8px;margin-bottom: 8px;padding: 16px;`;
        ipFrame.innerHTML = `<p style="margin-top: 0px;color: var(--subtext);margin-bottom: 10px;">your ip is:</p><p class="ip" style="font-size: 21px;margin: 0px;font-variant-numeric: tabular-nums lining-nums;font-weight: 500;">...</p><p style="margin: 0px;margin-top: 6px;font-size: 15px;color: var(--subtext);display: flex;align-items: center;gap: 6px;" class="ipdata">loading data...</p>`;

        (async () => {
          const ip = await (await fetch("https://api.country.is/?fields=city,continent,subdivision,postal,location,asn")).json();

          ipFrame.querySelector(".ip").innerText = ip.ip;
          ipFrame.querySelector(".ipdata").innerHTML = `<img src="https://tiagozip.github.io/asn-data/logos/${ip.asn.number}.png" alt="Organization icon" style="width: 20px;height: 20px;border-radius: 4px;"> ${ip.asn.organization} (as${ip.asn.number}) // ${ip.city}, ${ip.country}`;
        })();

        document.querySelector("#results-all").append(ipFrame);
      }
      
      if (sourceHost === "spotify.com" || sourceHost.endsWith(".spotify.com")) {
        const spotifyMatch = url.match(/\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
        if (spotifyMatch) {
          const [, type, id] = spotifyMatch;
          const iframe = document.createElement("iframe");
          iframe.style.cssText = `width:100%;aspect-ratio:560/332;border-radius:.75rem;border:1px solid rgb(49, 50, 68);`;
          iframe.src = `https://open.spotify.com/embed/${type}/${id}?utm_source=metasearch`;
          iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
          iframe.loading = "lazy";
          document.querySelector("#results-all").append(iframe);
          article.classList.add("spotify-featured");
        }
      }
      
      if (sourceHost === "codepen.io") {
        const codepenMatch = url.match(/codepen\.io\/([^/]+)\/pen\/([^/?]+)/);
        if (codepenMatch) {
          const [, username, penId] = codepenMatch;
          const iframe = document.createElement("iframe");
          iframe.style.cssText = `width:100%;aspect-ratio:560/300;border-radius:6px;border:1px solid rgb(49, 50, 68);`;
          iframe.src = `https://codepen.io/${username}/embed/preview/${penId}?default-tabs=result&height=520`;
          iframe.allow = "accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone";
          iframe.loading = "lazy";
          iframe.title = "CodePen Embed";
          document.querySelector("#results-all").append(iframe);
          article.classList.add("codepen-featured");
        }
      }
      
      if (sourceHost === "music.apple.com" || sourceHost.endsWith(".music.apple.com")) {
        const appleMatch = url.match(/\/(album|playlist|song)\/([^?]+)/);
        if (appleMatch) {
          const fullPath = url.split("music.apple.com")[1];
          const iframe = document.createElement("iframe");
          iframe.style.cssText = `width:100%;height:450px;border-radius:6px;border:1px solid rgb(49, 50, 68);`;
          iframe.src = `https://embed.music.apple.com${fullPath}`;
          iframe.allow = "autoplay; encrypted-media";
          iframe.loading = "lazy";
          document.querySelector("#results-all").append(iframe);
          article.classList.add("apple-music-featured");
        }
      }
    }

    hasHadWebResult = true;

    return article;
  };

  const renderNewsResult = (r) => {
    const favicon = r.meta_url?.favicon || r.profile?.img || "";
    const siteName =
      r.profile?.name || r.meta_url?.hostname?.replace(/^www\./, "") || "";
    const title = r.title || "";
    const age = r.age || "";
    const url = safeUrl(r.url);
    const thumb = r.thumbnail?.src ? safeUrl(r.thumbnail.src) : "";

    const card = document.createElement("a");
    card.href = url;
    card.className = "news-card";

    if (thumb) {
      const img = document.createElement("img");
      img.src = thumb;
      img.className = "news-card-thumb";
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => img.remove();
      card.append(img);
    } else {
      const img = document.createElement("div");
      img.src = thumb;
      img.className = "news-card-thumb-placeholder";
      img.alt = "";
      img.loading = "lazy";
      card.append(img);

      if (favicon) {
        const faviconImg = document.createElement("img");
        faviconImg.src = safeUrl(favicon);
        faviconImg.className = "favicon";
        faviconImg.alt = "";
        faviconImg.loading = "lazy";
        img.append(faviconImg);
      }
    }

    const header = document.createElement("div");
    header.className = "news-card-header";

    const sourceEl = document.createElement("div");
    sourceEl.className = "news-card-source";

    if (favicon) {
      const faviconImg = document.createElement("img");
      faviconImg.src = safeUrl(favicon);
      faviconImg.className = "favicon";
      faviconImg.alt = "";
      faviconImg.loading = "lazy";
      sourceEl.append(faviconImg);
    }

    const siteNameSpan = document.createElement("span");
    siteNameSpan.className = "news-card-site";
    siteNameSpan.textContent = siteName;
    sourceEl.append(siteNameSpan);

    header.append(sourceEl);

    if (age) {
      const ageSpan = document.createElement("span");
      ageSpan.className = "news-card-age";
      ageSpan.textContent = age;
      header.append(ageSpan);
    }

    card.append(header);

    const titleEl = document.createElement("div");
    titleEl.className = "news-card-title";
    titleEl.textContent = title;
    card.append(titleEl);

    return card;
  };

  const renderVideoResult = (r, compact = false) => {
    const siteName = r.profile?.name || r.meta_url?.hostname || "";
    const url = safeUrl(r.url);
    const thumb = r.thumbnail?.src || r.video?.thumbnail?.src || "";
    const duration = r.video?.duration || "";
    const creator = r.video?.creator || "";
    const age = r.age || "";

    const thumbContainer = document.createElement("div");
    thumbContainer.className = "video-thumb-container";

    if (thumb) {
      const thumbImg = document.createElement("img");
      thumbImg.src = safeUrl(thumb);
      thumbImg.className = "video-thumb";
      thumbImg.alt = "";
      thumbImg.loading = "lazy";
      thumbContainer.append(thumbImg);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "video-thumb-placeholder";
      thumbContainer.append(placeholder);
    }

    if (duration) {
      const durationSpan = document.createElement("span");
      durationSpan.className = "video-duration";
      durationSpan.textContent = duration;
      thumbContainer.append(durationSpan);
    }

    const titleEl = document.createElement("a");
    titleEl.href = url;
    titleEl.className = "result-title";
    titleEl.textContent = r.title || "";

    const creatorSpan = document.createElement("span");
    creatorSpan.className = "creator";
    creatorSpan.textContent = creator || siteName;

    const videoMeta = document.createElement("div");
    videoMeta.className = "video-meta";
    videoMeta.append(creatorSpan);

    if (age) {
      const ageSpan = document.createElement("span");
      ageSpan.className = "age";
      ageSpan.textContent = `· ${age}`;
      videoMeta.append(ageSpan);
    }

    const content = document.createElement("div");
    content.className = "result-content";
    content.append(titleEl, videoMeta);

    const article = document.createElement("article");
    article.className = `result video-result ${compact ? "video-compact" : ""}`;
    article.append(thumbContainer, content);

    return article;
  };

  const renderDiscussionResult = (r) => {
    let host = "";
    try {
      host = new URL(r.url).hostname.replace(/^www\./, "");
    } catch {}
    const forumName = r.data?.forum_name || host || "";
    const title = r.title || "";
    const url = safeUrl(r.url);
    const votes = r.data?.num_votes || 0;
    const answers = r.data?.num_answers || 0;
    const question = r.data?.question || "";
    const topComment = r.data?.top_comment || "";
    const age = r.age || "";

    const source = document.createElement("div");
    source.className = "result-source";

    if (host) {
      const fav = document.createElement("img");
      fav.className = "favicon";
      fav.alt = "";
      fav.loading = "lazy";
      fav.onerror = () => fav.remove();
      fav.src = `https://external-content.duckduckgo.com/ip3/${host}.ico`;
      source.append(fav);
    }

    const forumSpan = document.createElement("span");
    forumSpan.className = "forum-name";
    forumSpan.textContent = forumName;
    source.append(forumSpan);

    if (age) {
      const ageSpan = document.createElement("span");
      ageSpan.className = "age";
      ageSpan.textContent = `· ${age}`;
      source.append(ageSpan);
    }

    const titleEl = document.createElement("a");
    titleEl.href = url;
    titleEl.className = "result-title";
    titleEl.textContent = title;

    const content = document.createElement("div");
    content.className = "result-content";
    content.append(source, titleEl);

    const thread = document.createElement("div");
    thread.className = "discussion-thread";
    const addThreadNode = (text, { muted, html, label }) => {
      const node = document.createElement("div");
      node.className = `thread-node${muted ? " muted" : ""}`;
      const tag = document.createElement("span");
      tag.className = "thread-label";
      tag.textContent = label;
      const p = document.createElement("p");
      if (html) p.innerHTML = text;
      else p.textContent = text;
      node.append(tag, p);
      thread.append(node);
    };

    if (question) addThreadNode(question, { html: true, label: "post" });
    if (topComment)
      addThreadNode(topComment, { muted: true, label: "top reply" });
    if (thread.children.length) content.append(thread);

    const stats = document.createElement("div");
    stats.className = "discussion-stats";

    if (votes) {
      const voteStat = document.createElement("span");
      voteStat.className = "stat";
      voteStat.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-up"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg> ${votes}`;
      stats.append(voteStat);
    }

    if (answers) {
      const answerStat = document.createElement("span");
      answerStat.className = "stat";
      answerStat.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-message-dots"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 11v.01" /><path d="M8 11v.01" /><path d="M16 11v.01" /><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3l12 0" /></svg> ${answers}`;
      stats.append(answerStat);
    }

    content.append(stats);

    const article = document.createElement("article");
    article.className = "result discussion-result";
    article.append(content);

    return article;
  };

  const renderFaqResult = (r) => {
    const details = document.createElement("details");
    details.className = "faq-item";

    const summary = document.createElement("summary");
    summary.className = "faq-question";
    summary.textContent = r.question || "";
    details.append(summary);

    const answerDiv = document.createElement("div");
    answerDiv.className = "faq-answer";
    answerDiv.innerHTML = r.answer || "";
    details.append(answerDiv);

    const source = document.createElement("div");
    source.className = "faq-source";

    if (r.meta_url?.favicon) {
      const favicon = document.createElement("img");
      favicon.src = safeUrl(r.meta_url.favicon);
      favicon.className = "favicon";
      favicon.alt = "";
      favicon.loading = "lazy";
      source.append(favicon);
    }

    const link = document.createElement("a");
    link.href = safeUrl(r.url);
    link.className = "faq-source-link";
    link.textContent = r.meta_url?.hostname || r.title || "";
    source.append(link);

    details.append(source);

    return details;
  };

  const renderFaqSection = (faq) => {
    if (!faq?.results?.length) return null;

    const section = document.createElement("section");
    section.className = "faq-section";

    const heading = document.createElement("h3");
    heading.textContent = "people also ask";
    section.append(heading);

    for (const item of faq.results.slice(0, 5)) {
      section.append(renderFaqResult(item));
    }

    return section;
  };

  const renderInfobox = (infobox) => {
    if (!infobox?.results?.length) return null;
    const info = infobox.results[0];
    const desc = info.description || "";
    const longDesc = info.long_desc || "";
    const profiles = info.profiles || [];


    const box = document.createElement("div");
    box.className = "infobox";

    const header = document.createElement("div");
    header.className = "infobox-header";

    const headerLeft = document.createElement("div");
    headerLeft.className = "infobox-header-left";

    const titleEl = document.createElement("h2");
    titleEl.className = "infobox-title";
    const titleLink = document.createElement("a");
    titleLink.href = safeUrl(info.url);
    titleLink.target = "_blank";
    titleLink.rel = "noopener";
    titleLink.innerHTML = info.title
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    titleEl.append(titleLink);
    headerLeft.append(titleEl);

    if (desc) {
      const descEl = document.createElement("p");
      descEl.className = "infobox-desc";
      descEl.textContent = desc;
      if (info.ratings.length) {
        const rating = info.ratings[0];
        if (rating.ratingValue) {
          const ratingEl = document.createElement("span");
          ratingEl.className = "infobox-rating";
          ratingEl.textContent = `★ ${rating.ratingValue}${rating.bestRating ? `/${rating.bestRating}` : ""}`;
          descEl.append(" ", ratingEl);
        }
      }
      headerLeft.append(descEl);
    }

    if (longDesc) {
      let txt = longDesc.trim();
      const MAX = 280;
      if (txt.length > MAX) {
        const slice = txt.slice(0, MAX);
        const m = slice.match(/^[\s\S]*[.!?](?=\s|$)/);
        txt =
          m && m[0].length >= MAX * 0.5
            ? m[0].trim()
            : `${slice.slice(0, slice.lastIndexOf(" ")).trim()}…`;
      }
      const longDescEl = document.createElement("p");
      longDescEl.className = "infobox-long-desc";
      longDescEl.textContent = txt;
      headerLeft.append(longDescEl);
    }

    header.append(headerLeft);

    renderInfoboxImagesAsync(info.images, box, header, info.url);

    box.append(header);

    if (info.data?.answer || info.data?.suggestedAnswers?.length) {
      const questionEl = document.createElement("div");
      questionEl.className = "infobox-question";

      if (info.data.answer) {
        const answerEl = document.createElement("div");
        answerEl.className = "infobox-answer";
        answerEl.classList.add("selected-answer");
        answerEl.innerHTML = info.data.answer.text;

        const upvoteEl = document.createElement("span");
        upvoteEl.className = "title";
        upvoteEl.innerHTML = `<b>selected answer</b> <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-up"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg> ${info.data.answer.upvoteCount || 0}`;
        answerEl.prepend(upvoteEl);
        questionEl.append(answerEl);
      }

      (info.data.suggestedAnswers || []).forEach((answer) => {
        if (answer.text === info.data.answer?.text) return;
        const answerEl = document.createElement("div");
        answerEl.className = "infobox-answer";
        answerEl.innerHTML = answer.text;

        const upvoteEl = document.createElement("span");
        upvoteEl.className = "title";
        upvoteEl.innerHTML = `<b>${answer.author}</b> <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-up"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg> ${answer.upvoteCount || 0}`;
        answerEl.prepend(upvoteEl);
        questionEl.append(answerEl);
      });

      questionEl.querySelectorAll("pre code").forEach((block) => {
        const copyBtn = document.createElement("button");
        copyBtn.className = "code-copy-btn";
        copyBtn.title = "Copy code";
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-copy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>`;
        copyBtn.onclick = () => {
          const or = copyBtn.innerHTML;

          navigator.clipboard.writeText(block.textContent || "");
          copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-check"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>`;
          setTimeout(() => {
            copyBtn.innerHTML = or;
          }, 2000);
        };
        const pre = block.parentElement;
        pre.style.position = "relative";
        pre.append(copyBtn);
      });

      box.append(questionEl);

      const showMore = document.createElement("button");
      showMore.className = "infobox-toggle";
      showMore.classList.add("sticky");
      showMore.textContent = "show more";
      showMore.onclick = () => {
        questionEl.classList.toggle("expanded");
        showMore.textContent = questionEl.classList.contains("expanded")
          ? "show less"
          : "show more";
      };
      box.append(showMore);

      setTimeout(async () => {
        console.log(questionEl.scrollHeight);
        if (questionEl.scrollHeight < 480) {
          showMore.remove();
          questionEl.classList.add("expanded");
        }
        if (!questionEl.querySelectorAll("pre code").length) return;

        const { highlight } = await import("/s/sugar-high.js");
        questionEl.querySelectorAll("pre code").forEach((block) => {
          const code = block.textContent || "";
          block.innerHTML = highlight(code);
        });
      }, 1);
    }

    const hasAttrs = info.attributes?.length;
    if (hasAttrs || profiles.length) {
      const attrsContainer = document.createElement("div");
      attrsContainer.className = "infobox-attrs-container";

      const dl = document.createElement("dl");
      dl.className = "infobox-attrs";

      const VISIBLE_COUNT = 6;
      const hasHidden = hasAttrs && info.attributes.length > VISIBLE_COUNT;

      if (hasAttrs) {
        for (let i = 0; i < info.attributes.length; i++) {
          const attr = info.attributes[i];
          if (Array.isArray(attr) && attr.length >= 2) {
            const isHeader = attr[0]?.includes("<strong>");
            if (isHeader) {
              const dt = document.createElement("dt");
              dt.className = "infobox-attr-header";
              dt.innerHTML = attr[0];
              if (i >= VISIBLE_COUNT) dt.classList.add("hidden");
              dl.append(dt);
            } else if (attr[1] !== null) {
              const row = document.createElement("div");
              row.className = "infobox-attr-row";
              if (i >= VISIBLE_COUNT) row.classList.add("hidden");

              const dt = document.createElement("dt");
              dt.textContent = attr[0];
              const dd = document.createElement("dd");
              const val = String(attr[1]).trim();
              if (/^https?:\/\/\S+$/.test(val)) {
                const img = document.createElement("img");
                img.src = safeUrl(val);
                img.alt = attr[0] || "";
                img.className = "infobox-attr-img";
                img.loading = "lazy";
                img.onerror = () => {
                  dd.textContent = val;
                };
                dd.append(img);
              } else {
                dd.innerHTML = attr[1];
              }
              row.append(dt, dd);
              dl.append(row);
            }
          }
        }
      }

      if (profiles.length) {
        const profilesSection = document.createElement("div");
        profilesSection.className = "infobox-profiles";
        if (hasHidden) profilesSection.classList.add("hidden");

        for (const profile of profiles) {
          const link = document.createElement("a");
          link.className = "infobox-profile";
          link.href = profile.url;
          link.target = "_blank";
          link.rel = "noopener";

          if (profile.img) {
            const img = document.createElement("img");
            img.src = safeUrl(profile.img);
            img.alt = profile.name || profile.long_name || "";
            img.className = "infobox-profile-icon";
            img.title = profile.name || profile.long_name || "";
            img.loading = "lazy";
            img.onerror = () => img.remove();
            link.append(img);
          }

          profilesSection.append(link);
        }
        dl.append(profilesSection);
      }

      if (hasHidden) {
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "infobox-toggle";
        toggleBtn.textContent = "show more";
        toggleBtn.onclick = () => {
          const isExpanded = attrsContainer.classList.toggle("expanded");
          toggleBtn.textContent = isExpanded ? "show less" : "show more";
        };
        dl.append(toggleBtn);
      }

      attrsContainer.append(dl);
      box.append(attrsContainer);
    }

    return box;
  };

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  };

  const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/></svg>`;
  const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10"/></svg>`;

  const richCopyBtn = (getText, title = "copy") => {
    const btn = document.createElement("button");
    btn.className = "rich-copy-btn";
    btn.title = title;
    btn.innerHTML = COPY_SVG;
    btn.onclick = () => {
      navigator.clipboard?.writeText(getText());
      btn.innerHTML = CHECK_SVG;
      btn.classList.add("copied");
      setTimeout(() => {
        btn.innerHTML = COPY_SVG;
        btn.classList.remove("copied");
      }, 1400);
    };
    return btn;
  };

  const weatherIcon = (main) => {
    const m = (main || "").toLowerCase();
    if (m.includes("thunder")) return "⛈️";
    if (m.includes("drizzle")) return "🌦️";
    if (m.includes("rain")) return "🌧️";
    if (m.includes("snow") || m.includes("sleet")) return "🌨️";
    if (m.includes("clear") || m.includes("sun")) return "☀️";
    if (m.includes("cloud")) return "☁️";
    if (m.includes("mist") || m.includes("fog") || m.includes("haze") || m.includes("smoke"))
      return "🌫️";
    if (m.includes("wind")) return "💨";
    return "🌡️";
  };

  const renderRichResults = (rich) => {
    if (!rich?.length) return null;
    const frag = document.createDocumentFragment();

    for (const item of rich) {
      const section = document.createElement("section");
      section.className = "rich-result";

      if (
        item.subtype === "calculator" &&
        item.calculator &&
        item.calculator.answer != null &&
        item.calculator.answer !== ""
      ) {
        section.classList.add("rich-calculator");
        const expr = document.createElement("div");
        expr.className = "rich-calc-expr";
        expr.textContent = item.calculator.expression;
        const answer = document.createElement("div");
        answer.className = "rich-calc-answer";
        answer.textContent = `= ${item.calculator.answer}`;
        section.append(expr, answer, richCopyBtn(() => String(item.calculator.answer), "copy answer"));
        frag.append(section);
      } else if (item.subtype === "colorpicker" && item.colorpicker) {
        section.classList.add("rich-colorpicker");
        let currentColor = item.colorpicker.color;

        const pickerContainer = document.createElement("div");
        pickerContainer.className = "rich-color-picker-container";

        const preview = document.createElement("div");
        preview.className = "rich-color-preview";
        preview.style.backgroundColor = currentColor;

        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = currentColor;
        colorInput.className = "rich-color-input";
        preview.append(colorInput);

        const info = document.createElement("div");
        info.className = "rich-color-info";

        const updateColorDisplay = (color) => {
          const rgb = hexToRgb(color);
          if (!rgb) return;
          const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

          info.innerHTML = "";
          const formats = [
            { label: "HEX", value: color.toUpperCase() },
            { label: "RGB", value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
            { label: "HSL", value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
          ];

          for (const fmt of formats) {
            const row = document.createElement("div");
            row.className = "rich-color-row";
            const label = document.createElement("span");
            label.className = "rich-color-label";
            label.textContent = fmt.label;
            const value = document.createElement("span");
            value.className = "rich-color-value";
            value.textContent = fmt.value;
            const copyBtn = document.createElement("button");
            copyBtn.className = "rich-color-copy";
            copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/></svg>`;
            copyBtn.title = "Copy";
            copyBtn.onclick = () => {
              navigator.clipboard.writeText(fmt.value);
              copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10"/></svg>`;
              setTimeout(() => {
                copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/></svg>`;
              }, 1500);
            };
            row.append(label, value, copyBtn);
            info.append(row);
          }
        };

        colorInput.addEventListener("input", (e) => {
          currentColor = e.target.value;
          preview.style.backgroundColor = currentColor;
          updateColorDisplay(currentColor);
        });

        updateColorDisplay(currentColor);
        pickerContainer.append(preview);
        section.append(pickerContainer, info);
        frag.append(section);
      } else if (item.subtype === "weather" && item.weather) {
        section.classList.add("rich-weather");
        const w = item.weather;
        const header = document.createElement("div");
        header.className = "rich-weather-header";
        const location = document.createElement("div");
        location.className = "rich-weather-location";
        location.textContent = [w.location?.name, w.location?.state, w.location?.country]
          .filter(Boolean)
          .join(", ");
        header.append(location);

        if (w.current_weather) {
          const cw = w.current_weather;
          const current = document.createElement("div");
          current.className = "rich-weather-current";

          const icon = document.createElement("span");
          icon.className = "rich-weather-icon";
          icon.textContent = weatherIcon(cw.weather?.main || cw.weather?.description);

          const temp = document.createElement("span");
          temp.className = "rich-weather-temp";
          temp.textContent = `${Math.round(cw.temp)}°`;

          const info = document.createElement("div");
          info.className = "rich-weather-info";
          const desc = document.createElement("span");
          desc.className = "rich-weather-desc";
          desc.textContent = cw.weather?.description || cw.weather?.main || "";
          const feels = document.createElement("span");
          feels.className = "rich-weather-feels";
          feels.textContent = `feels like ${Math.round(cw.feels_like)}°`;
          info.append(desc, feels);

          current.append(icon, temp, info);
          header.append(current);

          const metrics = [];
          if (cw.humidity != null) metrics.push(["humidity", `${Math.round(cw.humidity)}%`]);
          if (cw.wind_speed != null) metrics.push(["wind", `${Math.round(cw.wind_speed)} m/s`]);
          if (cw.uvi != null) metrics.push(["uv index", Math.round(cw.uvi)]);
          if (cw.pressure != null) metrics.push(["pressure", `${Math.round(cw.pressure)} hPa`]);
          if (metrics.length) {
            const stats = document.createElement("div");
            stats.className = "rich-weather-metrics";
            for (const [label, value] of metrics) {
              const metric = document.createElement("div");
              metric.className = "rich-weather-metric";
              metric.innerHTML = `<span class="rich-weather-metric-val">${value}</span><span class="rich-weather-metric-label">${label}</span>`;
              stats.append(metric);
            }
            header.append(stats);
          }
        }
        section.append(header);

        if (w.daily?.length) {
          const forecast = document.createElement("div");
          forecast.className = "rich-weather-forecast";
          for (const day of w.daily.slice(0, 5)) {
            const dayEl = document.createElement("div");
            dayEl.className = "rich-weather-day";
            const dayName = document.createElement("span");
            dayName.className = "rich-weather-dayname";
            const d = new Date(day.ts * 1000);
            const isToday = d.toDateString() === new Date().toDateString();
            dayName.textContent = isToday
              ? "today"
              : d.toLocaleDateString("en", { weekday: "short" });
            const dayIcon = document.createElement("span");
            dayIcon.className = "rich-weather-dayicon";
            dayIcon.textContent = weatherIcon(day.weather?.main);
            const dayTemp = document.createElement("span");
            dayTemp.className = "rich-weather-daytemp";
            const high = day.temperature?.max ?? day.temperature?.day ?? "";
            const low = day.temperature?.min ?? "";
            dayTemp.innerHTML =
              high && low
                ? `<b>${Math.round(high)}°</b> ${Math.round(low)}°`
                : `<b>${Math.round(high || low)}°</b>`;
            const dayDesc = document.createElement("span");
            dayDesc.className = "rich-weather-daydesc";
            dayDesc.textContent = day.weather?.main || "";
            dayEl.append(dayName, dayIcon, dayTemp, dayDesc);
            forecast.append(dayEl);
          }
          section.append(forecast);
        }

        if (w.alerts?.length) {
          const alerts = document.createElement("div");
          alerts.className = "rich-weather-alerts";
          for (const alert of w.alerts.slice(0, 2)) {
            const alertEl = document.createElement("div");
            alertEl.className = "rich-weather-alert";
            const alertTitle = document.createElement("span");
            alertTitle.className = "rich-weather-alert-title";
            alertTitle.textContent = alert.event;
            const alertTime = document.createElement("span");
            alertTime.className = "rich-weather-alert-time";
            alertTime.textContent = alert.start_relative_i18n || "";
            alertEl.append(alertTitle, alertTime);
            alerts.append(alertEl);
          }
          section.append(alerts);
        }
        frag.append(section);
      } else if (item.subtype === "timer" && item.timer) {
        section.classList.add("rich-timer");
        const totalSeconds = item.timer.duration;
        let remaining = totalSeconds;
        let isRunning = item.timer.start_on_load;
        let intervalId = null;

        const display = document.createElement("div");
        display.className = "rich-timer-display";

        const progressRing = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        progressRing.setAttribute("class", "progress-ring");
        progressRing.setAttribute("viewBox", "0 0 32 32");
        const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        bgCircle.setAttribute("class", "progress-ring-bg");
        bgCircle.setAttribute("cx", "16");
        bgCircle.setAttribute("cy", "16");
        bgCircle.setAttribute("r", "14");
        const progressCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        progressCircle.setAttribute("class", "progress-ring-circle");
        progressCircle.setAttribute("cx", "16");
        progressCircle.setAttribute("cy", "16");
        progressCircle.setAttribute("r", "14");
        const circumference = 2 * Math.PI * 14;
        progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
        progressRing.append(bgCircle, progressCircle);

        const controls = document.createElement("div");
        controls.className = "rich-timer-controls";

        const playPauseBtn = document.createElement("button");
        playPauseBtn.className = "rich-timer-btn";
        const resetBtn = document.createElement("button");
        resetBtn.className = "rich-timer-btn";
        resetBtn.textContent = "reset";

        let doNotify;

        const notifBtn = document.createElement("button");
        notifBtn.className = "rich-timer-btn";
        notifBtn.classList.add("rich-timer-notify");
        notifBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-bell"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></svg> <span>enable notifications</span>`;
        let notificationsEnabled = false;
        notifBtn.onclick = () => {
          if (notificationsEnabled) return;
          if (!("Notification" in window)) {
            return;
          }
          playTick();

          Notification.requestPermission().then((permission) => {
            if (permission === "granted") {
              notificationsEnabled = true;
              notifBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-bell-check"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M11.5 17h-7.5a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3c.016 .129 .037 .256 .065 .382" /><path d="M9 17v1a3 3 0 0 0 2.502 2.959" /><path d="M15 19l2 2l4 -4" /></svg> <span>notifications enabled!</span>`;
              notifBtn.disabled = true;
              doNotify = true;
            }
          });
        };

        const formatTime = (secs) => {
          const h = Math.floor(secs / 3600);
          const m = Math.floor((secs % 3600) / 60);
          const s = Math.round(secs % 60);
          if (h > 0)
            return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
          return `${m}:${s.toString().padStart(2, "0")}`;
        };

        const updateDisplay = () => {
          display.textContent = formatTime(remaining);
          document.title = `${formatTime(remaining)} - timer`;
          const pct = (remaining / totalSeconds) * 0.98;
          const offset = circumference * (1 - pct);
          progressCircle.style.strokeDashoffset = offset;
          if (remaining <= 0) {
            progressCircle.classList.add("done");
          } else {
            progressCircle.classList.remove("done");
          }
        };

        const ctx = new (window.AudioContext || window.webkitAudioContext)();

        const playTick = ({ freq = 2000, duration = 0.015, volume = 0.12 } = {}) => {
          const now = ctx.currentTime;

          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = "sine";
          osc.frequency.value = freq;

          gain.gain.setValueAtTime(volume, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + duration);
        };

        const bell = ({ freq = 880, duration = 2, volume = 0.2 } = {}) => {
          const now = ctx.currentTime;

          const master = ctx.createGain();
          master.gain.value = 1;

          const env = ctx.createGain();
          env.gain.setValueAtTime(0, now);
          env.gain.linearRampToValueAtTime(volume * 0.25, now + 0.03);
          env.gain.linearRampToValueAtTime(volume * 0.6, now + 0.12);
          env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

          const filter = ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(4000, now);
          filter.frequency.exponentialRampToValueAtTime(1200, now + 0.15);

          env.connect(filter);
          filter.connect(master);
          master.connect(ctx.destination);

          const partials = [
            [1, 1],
            [2.7, 0.4],
            [5.4, 0.2],
            [8.9, 0.1],
          ];

          for (const [ratio, level] of partials) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();

            osc.type = "sine";
            osc.frequency.value = freq * ratio;
            g.gain.value = level;

            osc.connect(g);
            g.connect(env);

            osc.start(now);
            osc.stop(now + duration);
          }
        };

        const tick = () => {
          if (Math.round(remaining) > 0) {
            remaining -= 0.1;
            updateDisplay();
          } else {
            clearInterval(intervalId);
            isRunning = false;
            playPauseBtn.textContent = "start";
            section.classList.add("timer-done");
            bell();

            progressCircle.style.strokeDashoffset = circumference * (1 - 1);

            if (doNotify) {
              new Notification("🔔 timer finished!", {
                body: `your ${formatTime(totalSeconds)} timer has completed.`,
                icon: "",
              });
            }
          }
        };

        const start = () => {
          if (Math.round(remaining) <= 0) return;
          isRunning = true;
          playPauseBtn.textContent = "pause";
          intervalId = setInterval(tick, 100);
          playTick();
        };

        const pause = () => {
          isRunning = false;
          playPauseBtn.textContent = "resume";
          clearInterval(intervalId);
          playTick();
        };

        const reset = () => {
          clearInterval(intervalId);
          isRunning = false;
          remaining = totalSeconds;
          section.classList.remove("timer-done");
          playPauseBtn.textContent = "start";

          updateDisplay();
          playTick();
        };

        playPauseBtn.textContent = isRunning ? "pause" : "start";
        playPauseBtn.onclick = () => (isRunning ? pause() : start());
        resetBtn.onclick = reset;

        controls.append(playPauseBtn, resetBtn, notifBtn);
        updateDisplay();

        if (isRunning) start();

        const timerContent = document.createElement("div");
        timerContent.className = "rich-timer-content";
        timerContent.append(progressRing, display);
        section.append(timerContent, controls);
        frag.append(section);
      } else if (item.subtype === "unitConversion" && item.unitConversion) {
        section.classList.add("rich-conversion");
        const u = item.unitConversion;
        const formatUnit = (unit) => {
          const mapped = {
            poundmass: "pound",
            squaremeter: "square meter",
            squarefoot: "square foot",
            squareyard: "square yard",
            squarekilometer: "square kilometer",
            squaremile: "square mile",
            meterpersecond: "meter/second",
            kilometerperhour: "km/h",
            mileperhour: "mph",
            fluidounce: "fluid ounce",
          };
          const lower = unit.toLowerCase().replace(/[^a-z]/g, "");
          return (
            mapped[lower] ||
            unit
              .replace(/([a-z])([A-Z])/g, "$1 $2")
              .replace(/_/g, " ")
              .toLowerCase()
          );
        };
        const converted = convertUnit(u.amount, u.from_unit, u.to_unit, u.dimensionality);
        const fromDisplay =
          u.amount === 1 ? formatUnit(u.from_unit) : `${formatUnit(u.from_unit)}s`;
        const toNum = parseFloat(converted.toString().replace(/,/g, ""));
        const toDisplay =
          Math.abs(toNum) === 1 ? formatUnit(u.to_unit) : `${formatUnit(u.to_unit)}s`;

        const result = document.createElement("div");
        result.className = "rich-conversion-result";
        result.innerHTML = `<span class="rich-conversion-from">${u.amount} ${fromDisplay}</span> = <span class="rich-conversion-to">${converted} ${toDisplay}</span>`;

        section.append(result, richCopyBtn(() => String(converted), "copy result"));
        frag.append(section);
      } else if (item.subtype === "timezones" && item.timezones?.timezones?.length) {
        section.classList.add("rich-timezones");
        const tzList = document.createElement("div");
        tzList.className = "rich-tz-list";
        for (const tz of item.timezones.timezones.slice(0, 6)) {
          const tzEl = document.createElement("div");
          tzEl.className = "rich-tz-item";
          const tzTime = document.createElement("span");
          tzTime.className = "rich-tz-time";
          tzTime.textContent = tz.converted_time?.strftime || "";
          const tzLoc = document.createElement("span");
          tzLoc.className = "rich-tz-location";
          tzLoc.textContent =
            tz.converted_time?.city?.name || tz.converted_time?.location || tz.abbreviation;
          const tzOffset = document.createElement("span");
          tzOffset.className = "rich-tz-offset";
          tzOffset.textContent = tz.converted_time?.utc_diff || tz.utc_offset || "";
          tzEl.append(tzTime, tzLoc, tzOffset);
          tzList.append(tzEl);
        }
        section.append(tzList);
        frag.append(section);
      } else if (item.subtype === "cryptocurrency" && item.cryptocurrency?.quote) {
        section.classList.add("rich-crypto");
        const c = item.cryptocurrency;
        const q = c.quote;

        const header = document.createElement("div");
        header.className = "rich-crypto-header";
        if (q.image) {
          const img = document.createElement("img");
          img.src = q.image;
          img.alt = q.name;
          img.className = "rich-crypto-icon";
          header.append(img);
        }
        const name = document.createElement("span");
        name.className = "rich-crypto-name";
        name.textContent = `${q.name} (${q.symbol?.toUpperCase()})`;
        header.append(name);

        const priceSection = document.createElement("div");
        priceSection.className = "rich-crypto-price-section";

        const price = document.createElement("div");
        price.className = "rich-crypto-price";
        const currSymbol =
          c.vs_currency === "usd"
            ? "$"
            : c.vs_currency === "eur"
              ? "€"
              : c.vs_currency === "gbp"
                ? "£"
                : "";
        price.textContent =
          q.current_price != null
            ? `${currSymbol}${q.current_price.toLocaleString()}`
            : "Price unavailable";

        const stats = document.createElement("div");
        stats.className = "rich-crypto-stats";
        if (q.price_change_percentage_24h != null) {
          const change = document.createElement("span");
          change.className = `rich-crypto-change ${q.price_change_percentage_24h >= 0 ? "positive" : "negative"}`;
          change.textContent = `${q.price_change_percentage_24h >= 0 ? "+" : ""}${q.price_change_percentage_24h.toFixed(2)}% (24h)`;
          stats.append(change);
        }
        if (q.high_24h != null && q.low_24h != null) {
          const range = document.createElement("span");
          range.className = "rich-crypto-range";
          range.textContent = `24h: ${currSymbol}${q.low_24h.toLocaleString()} – ${currSymbol}${q.high_24h.toLocaleString()}`;
          stats.append(range);

          if (q.price_change_24h != null) {
            const priceChange = document.createElement("span");
            priceChange.className = `rich-crypto-price-change ${q.price_change_24h >= 0 ? "positive" : "negative"}`;
            const sign = q.price_change_24h >= 0 ? "+" : "";
            priceChange.textContent = `${sign}${currSymbol}${Math.abs(q.price_change_24h).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            stats.append(priceChange);
          }
        }
        priceSection.append(price, stats);

        section.append(header, priceSection);

        if (c.timeseries?.ts_price?.length > 1) {
          const chartContainer = document.createElement("div");
          chartContainer.className = "rich-crypto-chart";
          const canvas = document.createElement("canvas");
          chartContainer.append(canvas);
          section.append(chartContainer);

          const prices = c.timeseries.ts_price;
          const isUp = prices[prices.length - 1][1] >= prices[0][1];
          const lineColor = isUp ? "#a6e3a1" : "#f38ba8";
          const fillColor = isUp ? "rgba(166, 227, 161, 0.15)" : "rgba(243, 139, 168, 0.15)";

          const renderChart = async () => {
            if (!window.Chart) {
              await new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = "/s/chart.js";
                script.onload = resolve;
                script.onerror = reject;
                document.head.append(script);
              });
            }

            new window.Chart(canvas, {
              type: "line",
              data: {
                labels: prices.map((p) => new Date(p[0])),
                datasets: [
                  {
                    data: prices.map((p) => p[1]),
                    borderColor: lineColor,
                    backgroundColor: fillColor,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                      label: (ctx) =>
                        `${currSymbol}${ctx.raw.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    },
                  },
                },
                scales: {
                  x: {
                    type: "category",
                    display: true,
                    grid: { display: false },
                    ticks: {
                      color: "#6c7086",
                      maxTicksLimit: 5,
                      callback: (_, idx) => {
                        const date = prices[idx]?.[0];
                        return date
                          ? new Date(date).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "";
                      },
                    },
                  },
                  y: {
                    display: true,
                    grid: { color: "#31324433" },
                    ticks: {
                      color: "#6c7086",
                      callback: (val) =>
                        `${currSymbol}${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                    },
                  },
                },
                interaction: {
                  mode: "nearest",
                  axis: "x",
                  intersect: false,
                },
              },
            });
          };
          renderChart();
        }

        frag.append(section);
      } else if (item.subtype === "unixtimestamp" && item.unixtimestamp) {
        section.classList.add("rich-timestamp");

        const display = document.createElement("div");
        display.className = "rich-timestamp-value";

        const readable = document.createElement("div");
        readable.className = "rich-timestamp-readable";

        const label = document.createElement("div");
        label.className = "rich-timestamp-label";
        label.textContent = "current unix timestamp";

        let current = Math.floor(Date.now() / 1000);
        const update = () => {
          current = Math.floor(Date.now() / 1000);
          display.textContent = current.toString();
          readable.textContent = new Date().toLocaleString();
        };

        update();
        const tsInterval = setInterval(() => {
          if (!section.isConnected) return clearInterval(tsInterval);
          update();
        }, 1000);

        section.append(display, richCopyBtn(() => String(current), "copy timestamp"), label, readable);
        frag.append(section);
      } else if (item.subtype === "stopwatch" || item.stopwatch) {
        section.classList.add("rich-stopwatch");
        let elapsed = 0;
        let isRunning = false;
        let intervalId = null;
        let lapTimes = [];

        const display = document.createElement("div");
        display.className = "rich-stopwatch-display";

        const controls = document.createElement("div");
        controls.className = "rich-stopwatch-controls";

        const playPauseBtn = document.createElement("button");
        playPauseBtn.className = "rich-timer-btn";
        playPauseBtn.textContent = "start";

        const lapResetBtn = document.createElement("button");
        lapResetBtn.className = "rich-timer-btn";
        lapResetBtn.textContent = "reset";

        const lapsContainer = document.createElement("div");
        lapsContainer.className = "rich-stopwatch-laps";

        const formatTime = (ms) => {
          const totalSecs = Math.floor(ms / 1000);
          const mins = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          const centis = Math.floor((ms % 1000) / 10);
          return `${mins}:${secs.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
        };

        const updateDisplay = () => {
          display.textContent = formatTime(elapsed);
        };

        const tick = () => {
          elapsed += 10;
          updateDisplay();
        };

        const start = () => {
          isRunning = true;
          playPauseBtn.textContent = "pause";
          lapResetBtn.textContent = "lap";
          intervalId = setInterval(tick, 10);
        };

        const pause = () => {
          isRunning = false;
          playPauseBtn.textContent = "resume";
          lapResetBtn.textContent = "reset";
          clearInterval(intervalId);
        };

        const reset = () => {
          clearInterval(intervalId);
          isRunning = false;
          elapsed = 0;
          lapTimes = [];
          playPauseBtn.textContent = "start";
          lapResetBtn.textContent = "reset";
          lapsContainer.innerHTML = "";
          updateDisplay();
        };

        const lap = () => {
          lapTimes.push(elapsed);
          const lapEl = document.createElement("div");
          lapEl.className = "rich-stopwatch-lap";
          lapEl.innerHTML = `<b>lap ${lapTimes.length}:</b> <span>${formatTime(elapsed)}</span>`;
          lapsContainer.prepend(lapEl);
        };

        playPauseBtn.onclick = () => (isRunning ? pause() : start());
        lapResetBtn.onclick = () => {
          if (isRunning) lap();
          else reset();
        };

        controls.append(playPauseBtn, lapResetBtn);
        updateDisplay();
        section.append(display, controls, lapsContainer);
        frag.append(section);
      } else if (item.subtype === "news" && item.news?.articles?.length) {
        section.classList.add("rich-news");
        const h3 = document.createElement("h3");
        h3.textContent = "top stories";
        section.append(h3);
        const gallery = document.createElement("div");
        gallery.className = "news-gallery";
        for (const article of item.news.articles.slice(0, 6)) {
          gallery.append(
            renderNewsResult({
              title: article.title,
              url: article.url,
              age: article.page_age,
              meta_url: article.meta_url,
              profile: { name: article.publisher_name },
              thumbnail: article.img ? { src: article.img } : null,
            }),
          );
        }
        section.append(gallery);
        frag.append(section);
      }
    }

    return frag.childNodes.length ? frag : null;
  };

  const convertUnit = (amount, from, to, dim) => {
    const conversions = {
      mass: {
        gram: 1,
        kilogram: 1000,
        pound: 453.592,
        poundmass: 453.592,
        ounce: 28.3495,
        milligram: 0.001,
        ton: 907185,
        tonne: 1000000,
        stone: 6350.29,
      },
      length: {
        meter: 1,
        metre: 1,
        kilometer: 1000,
        kilometre: 1000,
        mile: 1609.34,
        foot: 0.3048,
        feet: 0.3048,
        inch: 0.0254,
        centimeter: 0.01,
        centimetre: 0.01,
        yard: 0.9144,
        millimeter: 0.001,
        millimetre: 0.001,
      },
      volume: {
        liter: 1,
        litre: 1,
        milliliter: 0.001,
        millilitre: 0.001,
        gallon: 3.78541,
        quart: 0.946353,
        pint: 0.473176,
        cup: 0.24,
        fluidounce: 0.0295735,
        tablespoon: 0.0147868,
        teaspoon: 0.00492892,
      },
      area: {
        squaremeter: 1,
        squarefoot: 0.092903,
        squareyard: 0.836127,
        acre: 4046.86,
        hectare: 10000,
        squarekilometer: 1000000,
        squaremile: 2590000,
      },
      time: {
        second: 1,
        minute: 60,
        hour: 3600,
        day: 86400,
        week: 604800,
        month: 2628000,
        year: 31536000,
      },
      speed: {
        meterpersecond: 1,
        kilometerperhour: 0.277778,
        mileperhour: 0.44704,
        knot: 0.514444,
      },
      digital: {
        byte: 1,
        kilobyte: 1024,
        megabyte: 1048576,
        gigabyte: 1073741824,
        terabyte: 1099511627776,
        bit: 0.125,
      },
    };

    if (dim === "temperature") {
      const fromLower = from.toLowerCase();
      const toLower = to.toLowerCase();
      if (fromLower === "celsius" && toLower === "fahrenheit")
        return ((amount * 9) / 5 + 32).toFixed(2);
      if (fromLower === "fahrenheit" && toLower === "celsius")
        return (((amount - 32) * 5) / 9).toFixed(2);
      if (fromLower === "celsius" && toLower === "kelvin") return (amount + 273.15).toFixed(2);
      if (fromLower === "kelvin" && toLower === "celsius") return (amount - 273.15).toFixed(2);
      if (fromLower === "fahrenheit" && toLower === "kelvin")
        return (((amount - 32) * 5) / 9 + 273.15).toFixed(2);
      if (fromLower === "kelvin" && toLower === "fahrenheit")
        return (((amount - 273.15) * 9) / 5 + 32).toFixed(2);
      return amount;
    }

    const table = conversions[dim];
    if (!table) return amount;

    const fromKey = from.toLowerCase().replace(/[^a-z]/g, "");
    const toKey = to.toLowerCase().replace(/[^a-z]/g, "");
    const fromFactor = table[fromKey] || 1;
    const toFactor = table[toKey] || 1;
    const result = (amount * fromFactor) / toFactor;

    if (Math.abs(result) >= 1000)
      return result.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (Math.abs(result) >= 1) return result.toFixed(4).replace(/\.?0+$/, "");
    return result.toPrecision(4);
  };

  const renderPlaceholder = (name, content) => {
    if (!content) return null;

    const details = document.createElement("details");
    details.className = "placeholder-section";

    const summary = document.createElement("summary");
    summary.textContent = name;
    details.append(summary);

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = JSON.stringify(content, null, 2);
    pre.append(code);
    details.append(pre);

    return details;
  };

  const renderGenius = (el, d, url) => {
    el.classList.remove("rich-genius-loading");
    el.replaceChildren();

    const header = document.createElement("div");
    header.className = "rich-genius-header";

    if (d.image) {
      const img = document.createElement("img");
      img.src = d.image;
      img.className = "rich-genius-art";
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => img.remove();
      header.append(img);
    }

    const meta = document.createElement("div");
    meta.className = "rich-genius-meta";

    const eyebrow = document.createElement("div");
    eyebrow.className = "rich-genius-eyebrow";
    eyebrow.textContent = "lyrics · genius";
    meta.append(eyebrow);

    const titleEl = document.createElement("a");
    titleEl.className = "rich-genius-title";
    titleEl.textContent = d.title || "lyrics";
    titleEl.href = url;
    meta.append(titleEl);

    if (d.artist) {
      const a = document.createElement("div");
      a.className = "rich-genius-artist";
      a.textContent = d.artist;
      meta.append(a);
    }

    header.append(meta);
    el.append(header);

    const wrap = document.createElement("div");
    wrap.className = "rich-genius-lyrics-wrap rich-genius-collapsed";

    const lyricsEl = document.createElement("div");
    lyricsEl.className = "rich-genius-lyrics";

    let buffer = [];
    const flushStanza = () => {
      if (!buffer.length) return;
      const p = document.createElement("p");
      p.className = "rich-genius-stanza";
      p.textContent = buffer.join("\n");
      lyricsEl.append(p);
      buffer = [];
    };

    for (const line of d.lyrics.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushStanza();
      } else if (/^\[.+\]$/.test(trimmed)) {
        flushStanza();
        const h = document.createElement("div");
        h.className = "rich-genius-section";
        h.textContent = trimmed.slice(1, -1);
        lyricsEl.append(h);
      } else {
        buffer.push(line);
      }
    }
    flushStanza();

    wrap.append(lyricsEl);
    el.append(wrap);

    requestAnimationFrame(() => {
      if (lyricsEl.scrollHeight <= wrap.clientHeight + 5) {
        wrap.classList.remove("rich-genius-collapsed");
        return;
      }
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "rich-genius-toggle";
      toggle.textContent = "show full lyrics";
      toggle.onclick = () => {
        const collapsed = wrap.classList.toggle("rich-genius-collapsed");
        toggle.textContent = collapsed ? "show full lyrics" : "show less";
      };
      el.append(toggle);
    });
  };

  const showGeniusInstantAnswer = () => {
    const firstResult = data.results?.web?.results?.[0];
    if (!firstResult?.url) return;

    let host, path;
    try {
      const u = new URL(firstResult.url);
      host = u.hostname.replace(/^www\./, "");
      path = u.pathname.replace(/\/$/, "");
    } catch {
      return;
    }

    if (host !== "genius.com") return;
    if (!/^\/[A-Za-z0-9_%-]+-lyrics$/.test(path)) return;

    const placeholder = document.createElement("section");
    placeholder.className = "rich-result rich-genius rich-genius-loading";

    const spinner = document.createElement("div");
    spinner.className = "rich-genius-spinner";
    spinner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a9 9 0 1 0 9 9"/></svg><span>loading lyrics from genius…</span>`;
    placeholder.append(spinner);

    document.getElementById("results-all").prepend(placeholder);

    fetch(`/g?u=${encodeURIComponent(firstResult.url)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (d?.lyrics) renderGenius(placeholder, d, firstResult.url);
        else placeholder.remove();
      })
      .catch(() => placeholder.remove());
  };

  const renderAllTab = () => {
    const results = data.results;
    const mixed = results.mixed || [];
    const frag = document.createDocumentFragment();
    let discussionsRendered = false;
    let faqRendered = false;
    let webRendered = 0;
    let pendingDiscussions = null;
    const MIN_WEB_BEFORE_DISCUSSIONS = 4;

    const buildDiscussions = () => {
      const section = document.createElement("section");
      section.className = "discussions-section";
      const h3 = document.createElement("h3");
      h3.textContent = "discussions";
      section.append(h3);

      const items = results.discussions.results.slice(0, 4);
      const list = document.createElement("div");
      list.className = "discussions-list";
      for (const d of items) list.append(renderDiscussionResult(d));
      section.append(list);

      if (items.length > 1) {
        list.classList.add("collapsed");
        const toggle = document.createElement("button");
        toggle.className = "discussions-toggle";
        toggle.textContent = `show ${items.length - 1} more`;
        toggle.onclick = () => {
          list.classList.remove("collapsed");
          toggle.remove();
        };
        section.append(toggle);
      }
      return section;
    };

    const richSection = renderRichResults(results.rich);
    if (richSection) frag.append(richSection);

    if (mixed.length) {
      for (const item of mixed) {
        const type = item.type;
        const idx = item.index ?? item.all?.index;

        if (type === "web" && results.web?.results?.[idx]) {
          frag.append(renderWebResult(results.web.results[idx]));
          webRendered++;
          if (pendingDiscussions && webRendered >= MIN_WEB_BEFORE_DISCUSSIONS) {
            frag.append(pendingDiscussions);
            pendingDiscussions = null;
            discussionsRendered = true;
          }
        } else if (type === "news" && results.news?.results) {
          const section = document.createElement("section");
          section.className = "news-section";
          const h3 = document.createElement("h3");
          h3.textContent = "news";
          section.append(h3);
          const gallery = document.createElement("div");
          gallery.className = "news-gallery";
          results.news.results.slice(0, 6).forEach((n) => {
            gallery.append(renderNewsResult(n));
          });
          section.append(gallery);
          frag.append(section);
        } else if (type === "faq" && results.faq?.results?.length && !faqRendered) {
          faqRendered = true;
          const faqSection = renderFaqSection(results.faq);
          if (faqSection) frag.append(faqSection);
        } else if (
          type === "discussions" &&
          results.discussions?.results?.length &&
          !discussionsRendered &&
          !pendingDiscussions
        ) {
          const section = buildDiscussions();
          if (webRendered >= MIN_WEB_BEFORE_DISCUSSIONS) {
            frag.append(section);
            discussionsRendered = true;
          } else {
            pendingDiscussions = section;
          }
        }
      }
      if (pendingDiscussions && !discussionsRendered) {
        frag.append(pendingDiscussions);
        discussionsRendered = true;
        pendingDiscussions = null;
      }
    } else {
      if (results.web?.results) {
        results.web.results.forEach((r) => {
          frag.append(renderWebResult(r));
        });
      }
      if (results.news?.results?.length) {
        const section = document.createElement("section");
        section.className = "news-section";
        const h3 = document.createElement("h3");
        h3.textContent = "News";
        section.append(h3);
        const gallery = document.createElement("div");
        gallery.className = "news-gallery";
        results.news.results.slice(0, 6).forEach((n) => {
          gallery.append(renderNewsResult(n));
        });
        section.append(gallery);
        frag.append(section);
      }
    }

    if (!faqRendered && results.faq?.results?.length) {
      const faqSection = renderFaqSection(results.faq);
      if (faqSection) frag.append(faqSection);
    }

    if (!discussionsRendered && results.discussions?.results?.length) {
      frag.append(buildDiscussions());
      discussionsRendered = true;
    }

    const placeholders = [
      ["locations", results.locations],
      ["recipes", results.recepies],
      ["qanda", results.qanda],
    ];
    for (const [name, content] of placeholders) {
      const p = renderPlaceholder(name, content);
      if (p) frag.append(p);
    }

    return frag;
  };

  const renderSidebar = () => {
    const results = data.results;
    const frag = document.createDocumentFragment();

    const infobox = renderInfobox(results.infobox);
    if (infobox) frag.append(infobox);

    if (results.videos?.results?.length) {
      const list = document.createElement("div");
      list.className = "sidebar-videos-list";
      results.videos.results.slice(0, 4).forEach((v) => {
        list.append(renderVideoResult(v, true));
      });

      const section = document.createElement("section");
      section.className = "sidebar-videos";
      const h3 = document.createElement("h3");
      h3.textContent = "videos";
      section.append(h3, list);
      frag.append(section);
    }

    return frag;
  };

  const data = __results_template__;
  let hasMoreResults = data.more_results_available !== false;

  if (data.captchaHtml) {
    solveCaptcha(data.captchaHtml).then(() => {
      setTimeout(() => {
        location.reload();
      }, 1000);
    });
  } else {
    document.getElementById("results-all").append(renderAllTab());
    document.getElementById("sidebar").append(renderSidebar());
    showGeniusInstantAnswer();

    import("/s/widgets.js")
      .then(({ renderLocalWidgets }) => {
        const widget = renderLocalWidgets(currentQuery);
        if (widget) document.getElementById("results-all").prepend(widget);
      })
      .catch(() => {});
  }

  let pk = "__results_pk__";
  const loadMoreResults = async () => {
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
        loadMoreResults();
        return;
      }

      if (newData.error || !newData.results?.web?.results?.length) {
        hasMoreResults = false;
        loadingEl.style.display = "none";
        if (!newData.results?.web?.results?.length) {
          const endEl = document.createElement("div");
          endEl.className = "end-of-results";
          endEl.textContent = "No more results";
          document.getElementById("results-all").append(endEl);
        }
        return;
      }

      const resultsContainer = document.getElementById("results-all");
      const webResults = newData.results.web.results;

      for (const r of webResults) {
        resultsContainer.append(renderWebResult(r));
      }

      hasMoreResults = newData.more_results_available !== false && webResults.length > 0;
    } catch (err) {
      console.error("Failed to load more results:", err);
    } finally {
      isLoading = false;

      if (document.getElementById("loading-indicator"))
        document.getElementById("loading-indicator").style.display = "none";
    }
  };

  const sentinel = document.getElementById("load-more-sentinel");
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        loadMoreResults();
      }
    },
    {
      rootMargin: "200px",
    },
  );

  if (currentQuery && hasMoreResults && !data.captchaHtml) {
    observer.observe(sentinel);
  }

  document.addEventListener("keydown", (event) => {
    const input = document.querySelector(".search-bar input");
    const ae = document.activeElement;
    if (
      ae &&
      (ae.tagName === "INPUT" ||
        ae.tagName === "TEXTAREA" ||
        ae.tagName === "SELECT" ||
        ae.isContentEditable)
    )
      return;

    if (event.key === "/") {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      event.preventDefault();
    }

    if (event.key === "w") {
      document.querySelectorAll(".tabs .tab")[0].click();
    }

    if (event.key === "i") {
      document.querySelectorAll(".tabs .tab")[1].click();
    }

    if (event.key === "n") {
      document.querySelectorAll(".tabs .tab")[2].click();
    }

    if (["j", "k", "ArrowUp", "ArrowDown"].includes(event.key)) {
      const results = Array.from(document.querySelectorAll(".result-title"));
      if (!results.length) return;

      const active = document.activeElement;
      let index = results.indexOf(active);

      if (event.key === "j" || event.key === "ArrowDown") {
        if (index === -1 || index === results.length - 1) {
          index = 0;
        } else {
          index++;
        }
      } else if (event.key === "k" || event.key === "ArrowUp") {
        if (index <= 0) {
          index = results.length - 1;
        } else {
          index--;
        }
      }

      results[index].focus();
      event.preventDefault();
    }
  });
})();
