import { env } from "cloudflare:workers";
import { Elysia, t } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { jwtVerify, SignJWT } from "jose";
import { ImageResponse } from "takumi-js/response";
import { coloCity } from "./colos.js";
import { decode } from "./galileo.js";
import { resolveSearchPage } from "./query.js";
import braveFetch from "./search/braveFetch.js";
import * as maps from "./search/maps.js";
import searchMixed from "./search/mixed.js";
import { runSearch } from "./search/run.js";
import * as templates from "./templates.js";
import {
  enrichTranslation,
  isValidLang,
  translateBatch,
  transliterate,
} from "./translate.js";

const CACHE = {
  short: "public, max-age=300",
  med: "public, max-age=3600",
  day: "public, max-age=86400",
  forever: "public, max-age=5184000",
  tts: "public, max-age=120",
};

const getSecret = () => new TextEncoder().encode(env.JWT_SECRET);

const pickEngine = (cookieHeader) =>
  /(?:^|;\s*)engine_fb=(brave|kagi)\b/.exec(cookieHeader || "")?.[1] ||
  /(?:^|;\s*)engine=(brave|kagi)\b/.exec(cookieHeader || "")?.[1] ||
  (env.SEARCH_ENGINE || "brave").toString().toLowerCase();

const sign = async (payload, expiry) => {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiry || "1h")
    .sign(getSecret());
};

export default new Elysia({ adapter: CloudflareAdapter })
  .get("/og", async ({ query }) => {
    const q =
      (query?.q || "").toString().replaceAll("\n", " ").trim().slice(0, 120) ||
      "search";

    let web = [];
    try {
      const data = await searchMixed(q);
      web = data?.results?.web?.results || [];
    } catch {}

    const strip = (s) =>
      (s || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/[^ -ɏ‐-‧‰-⁞₠-₿]/g, "")
        .replace(/[([{]\s*[,;:]?\s*[)\]}]/g, "")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
    const clip = (s, n) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
    const box = (style, children) => ({
      type: "div",
      props: { style, children },
    });
    const magnifier = (stroke, size) => ({
      type: "svg",
      props: {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        children: [
          {
            type: "circle",
            props: {
              cx: "11",
              cy: "11",
              r: "7.25",
              stroke,
              strokeWidth: "2.25",
            },
          },
          {
            type: "path",
            props: {
              d: "M16.5 16.5L21 21",
              stroke,
              strokeWidth: "2.25",
              strokeLinecap: "round",
            },
          },
        ],
      },
    });
    const C = {
      bg: "#1f1e2e",
      text: "#cdd6f4",
      blue: "#89b4fa",
      desc: "#bac2de",
      sub: "#a6adc8",
      muted: "#7f849c",
      surf: "#313244",
    };

    const sliced = web.slice(0, 4);
    const favicons = await Promise.all(
      sliced.map(async (r) => {
        const src = r.meta_url?.favicon || r.profile?.img || "";
        if (!src) return null;
        try {
          const u = src.startsWith("//") ? `https:${src}` : src;
          const resp = await fetch(u, {
            cf: { cacheTtl: 86400, cacheEverything: true },
          });
          if (!resp.ok) return null;
          const ct = (resp.headers.get("content-type") || "").toLowerCase();
          if (!/(png|jpe?g|gif|webp)/.test(ct)) return null;
          const buf = await resp.arrayBuffer();
          if (!buf.byteLength || buf.byteLength > 80000) return null;
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (let j = 0; j < bytes.length; j += 8192)
            bin += String.fromCharCode(...bytes.subarray(j, j + 8192));
          return `data:${ct};base64,${btoa(bin)}`;
        } catch {
          return null;
        }
      }),
    );

    const tile = ["#89b4fa", "#a6e3a1", "#f9e2af", "#fab387"];
    const favEl = (fav, label, i) =>
      fav
        ? {
            type: "img",
            props: {
              src: fav,
              width: 26,
              height: 26,
              style: {
                width: "26px",
                height: "26px",
                borderRadius: "5px",
                objectFit: "cover",
              },
            },
          }
        : box(
            {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "26px",
              height: "26px",
              borderRadius: "5px",
              background: tile[i % tile.length],
              color: "#1e1e2e",
              fontSize: "16px",
              fontWeight: 700,
            },
            (label || "?").slice(0, 1).toUpperCase(),
          );

    const results = sliced.map((r, i) => {
      let host = "";
      let urlPath = "";
      try {
        const parsed = new URL(r.url);
        host = parsed.hostname.replace(/^www\./, "");
        urlPath = (host + parsed.pathname).replace(/\/$/, "");
      } catch {}
      const siteName = strip(r.profile?.name || r.meta_url?.hostname || host);
      const source = [
        favEl(favicons[i], siteName || host, i),
        box(
          {
            display: "flex",
            fontSize: "19px",
            color: C.sub,
            marginLeft: "9px",
          },
          clip(siteName, 28),
        ),
      ];
      if (urlPath && urlPath !== siteName) {
        source.push(
          box(
            {
              display: "flex",
              fontSize: "19px",
              color: C.muted,
              marginLeft: "9px",
            },
            clip(urlPath, 40),
          ),
        );
      }
      return box(
        { display: "flex", flexDirection: "column", padding: "18px 0" },
        [
          box(
            { display: "flex", alignItems: "center", marginBottom: "6px" },
            source,
          ),
          box(
            {
              display: "flex",
              fontSize: "27px",
              color: C.blue,
              lineHeight: 1.35,
              marginBottom: "7px",
            },
            clip(strip(r.title), 64),
          ),
          box(
            {
              display: "flex",
              fontSize: "20px",
              color: C.desc,
              lineHeight: 1.45,
            },
            clip(strip(r.description), 150),
          ),
        ],
      );
    });

    const tab = (label, active) =>
      box(
        {
          display: "flex",
          fontSize: "21px",
          padding: "9px 16px 11px",
          color: active ? C.blue : C.sub,
          borderBottom: active ? "3px solid #89b4fa" : "3px solid transparent",
        },
        label,
      );

    const tree = box(
      {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        color: C.text,
        padding: "44px 60px",
        position: "relative",
      },
      [
        box(
          {
            display: "flex",
            alignItems: "center",
            height: "58px",
            background: C.surf,
            border: "1px solid #7f849c78",
            borderRadius: "9px",
            padding: "0 10px 0 18px",
          },
          [
            box(
              { display: "flex", flexGrow: 1, fontSize: "23px", color: C.text },
              clip(q, 52),
            ),
            box(
              {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "40px",
                height: "40px",
              },
              [magnifier(C.text, 23)],
            ),
          ],
        ),
        box(
          {
            display: "flex",
            marginTop: "16px",
            borderBottom: "1px solid #313244",
          },
          [tab("web", true), tab("images"), tab("news"), tab("maps")],
        ),
        box(
          { display: "flex", flexDirection: "column", marginTop: "4px" },
          results.length
            ? results
            : [
                box(
                  {
                    display: "flex",
                    padding: "40px 0",
                    fontSize: "22px",
                    color: C.muted,
                  },
                  "no results",
                ),
              ],
        ),
        box(
          {
            position: "absolute",
            left: "0px",
            right: "0px",
            bottom: "0px",
            height: "110px",
            display: "flex",
            background: "linear-gradient(to bottom, rgba(31,30,46,0), #1f1e2e)",
          },
          "",
        ),
      ],
    );

    return new ImageResponse(tree, {
      width: 1200,
      height: 630,
      headers: { "cache-control": CACHE.day },
    });
  })
  .get("/about", async () => {
    const resp = await env.ASSETS.fetch(
      new Request("https://assets/about.html"),
    );
    return new Response(resp.body, resp);
  })
  .get("/bangs", async () => {
    const resp = await env.ASSETS.fetch(
      new Request("https://assets/bangs.html"),
    );
    return new Response(resp.body, resp);
  })
  .get("/api", async () => {
    const resp = await env.ASSETS.fetch(new Request("https://assets/api.html"));
    return new Response(resp.body, resp);
  })
  .options("/api", ({ set }) => {
    set.status = 204;
    set.headers["access-control-allow-origin"] = "*";
    set.headers["access-control-allow-methods"] = "POST, OPTIONS";
    set.headers["access-control-allow-headers"] = "content-type";
    set.headers["access-control-max-age"] = "86400";
    return null;
  })
  .post("/api", async ({ body, set }) => {
    set.headers["content-type"] = "application/json";
    set.headers["access-control-allow-origin"] = "*";
    set.headers["cache-control"] = "no-store";

    let payload = body;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        set.status = 400;
        return { error: "request body must be valid JSON" };
      }
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      set.status = 400;
      return { error: "request body must be a JSON object" };
    }

    const query =
      typeof payload.query === "string"
        ? payload.query.replaceAll("\n", " ").trim()
        : "";
    if (!query) {
      set.status = 400;
      return { error: "missing required field: query" };
    }

    const type = (payload.type || "web").toString().toLowerCase();
    const allowed = ["web", "images", "news"];
    if (!allowed.includes(type)) {
      set.status = 400;
      return {
        error: `invalid type "${type}" (allowed: ${allowed.join(", ")})`,
      };
    }

    const engine = (payload.engine || env.SEARCH_ENGINE || "brave")
      .toString()
      .toLowerCase();
    if (engine !== "brave" && engine !== "kagi") {
      set.status = 400;
      return {
        error: `invalid engine "${engine}" (allowed: brave, kagi)`,
      };
    }

    const page = Math.floor(Number(payload.page ?? 0));
    if (!Number.isFinite(page) || page < 0) {
      set.status = 400;
      return { error: "page must be a non-negative integer" };
    }

    let data;
    try {
      data = await runSearch({
        query,
        type,
        page,
        engine,
        lens: payload.lens,
        cookie: payload.cookie || env.KAGI_COOKIE,
      });
    } catch (e) {
      set.status = 502;
      return { error: "search failed", detail: String(e?.message || e) };
    }

    return { query, type, page, engine, ...data };
  })
  .get("/suggest", async ({ query, set }) => {
    const q = (query?.q || "").toString().replaceAll("\n", " ").trim();

    set.headers["content-type"] = "application/json";

    if (!q || q.length > 100) {
      set.headers["cache-control"] = CACHE.short;
      return { suggestions: [] };
    }

    let data;
    try {
      const resp = await braveFetch(
        `https://search.brave.com/api/suggest?q=${encodeURIComponent(q)}&rich=true`,
        {
          headers: {
            accept: "*/*",
            referer: "https://search.brave.com/",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
          },
        },
      );
      if (!resp.ok) throw new Error(`upstream ${resp.status}`);
      data = await resp.json();
    } catch {
      set.headers["cache-control"] = "no-store";
      return { suggestions: [] };
    }

    const list = Array.isArray(data?.[1]) ? data[1] : [];
    const suggestions = [];
    for (const item of list) {
      if (typeof item === "string") {
        suggestions.push({ query: item });
      } else if (item && typeof item.q === "string") {
        const out = { query: item.q };
        if (item.is_entity) {
          out.entity = true;
          if (item.name) out.name = String(item.name);
          if (item.desc) out.desc = String(item.desc);
          if (item.category) out.category = String(item.category);
          if (typeof item.img === "string" && item.img.startsWith("https://"))
            out.img = item.img;
        }
        suggestions.push(out);
      }
      if (suggestions.length >= 10) break;
    }

    set.headers["cache-control"] = CACHE.tts;
    return { suggestions };
  })
  .get(
    "/translate",
    () =>
      new Response(null, {
        status: 301,
        headers: { location: "/?q=translate" },
      }),
  )
  .post("/translate", async ({ body, set }) => {
    set.headers["content-type"] = "application/json";
    set.headers["cache-control"] = "no-store";

    let payload = body;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        set.status = 400;
        return { error: "request body must be valid JSON" };
      }
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      set.status = 400;
      return { error: "request body must be a JSON object" };
    }

    const { targetLang, sourceLang } = payload;
    if (!isValidLang(targetLang)) {
      set.status = 400;
      return { error: "missing or invalid targetLang" };
    }
    if (sourceLang != null && !isValidLang(sourceLang, true)) {
      set.status = 400;
      return { error: "invalid sourceLang" };
    }

    const text = payload.text;
    if (typeof text !== "string" || !text.trim()) {
      set.status = 400;
      return { error: "missing required field: text" };
    }
    if (text.length > 5000) {
      set.status = 413;
      return { error: "text too long (max 5000 chars)" };
    }

    const [main, extras] = await Promise.allSettled([
      translateBatch([text], sourceLang, targetLang),
      text.length <= 1500
        ? enrichTranslation(text, sourceLang, targetLang)
        : Promise.reject(new Error("skipped")),
    ]);

    if (main.status === "rejected") {
      set.status = 502;
      return {
        error: "translation failed",
        detail: String(main.reason?.message || main.reason),
      };
    }

    const translatedText = main.value.texts[0] ?? "";
    const e = extras.status === "fulfilled" ? extras.value : null;
    const alternatives = [
      ...new Set(
        (e?.alternatives || []).filter(
          (a) => a.trim() && a.trim() !== translatedText.trim(),
        ),
      ),
    ].slice(0, 3);

    let translit = e?.transliteration || "";
    if (translit && e.gtxTranslation !== translatedText.trim())
      translit = await transliterate(translatedText, targetLang).catch(
        () => "",
      );

    return {
      translatedText,
      detectedLang: main.value.detected[0] || e?.detected || sourceLang || null,
      ...(translit && { transliteration: translit }),
      ...(e?.srcTransliteration && {
        srcTransliteration: e.srcTransliteration,
      }),
      ...(alternatives.length && { alternatives }),
      ...(e?.didYouMean && { didYouMean: e.didYouMean }),
    };
  })
  .get("/tts", async ({ query, set }) => {
    const text = (query?.q || "").trim();
    const lang = query?.tl || "";
    if (!text || text.length > 200) {
      set.status = 400;
      return { error: "q is required (max 200 chars)" };
    }
    if (!isValidLang(lang)) {
      set.status = 400;
      return { error: "invalid tl" };
    }

    let resp;
    try {
      resp = await fetch(
        `https://translate.googleapis.com/translate_tts?client=gtx&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`,
        { cf: { cacheTtl: 86400, cacheEverything: true } },
      );
    } catch {
      set.status = 502;
      return { error: "tts fetch failed" };
    }
    if (!resp.ok) {
      set.status = 502;
      return { error: "tts failed", status: resp.status };
    }
    return new Response(resp.body, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": CACHE.day,
      },
    });
  })
  .get("/dict/:word", async ({ set, params }) => {
    const word = decodeURIComponent(params.word || "").trim();
    if (!/^[a-z'’ -]{1,40}$/i.test(word)) {
      set.status = 400;
      return { error: "invalid word" };
    }

    set.headers["content-type"] = "application/json";
    set.headers["cache-control"] = CACHE.day;

    let resp;
    try {
      resp = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
        { cf: { cacheTtl: 86400, cacheEverything: true } },
      );
    } catch {
      set.status = 502;
      return { error: "dictionary fetch failed" };
    }

    if (!resp.ok) {
      set.status = 404;
      return { error: "no definition found" };
    }
    return new Response(resp.body, {
      headers: {
        "content-type": "application/json",
        "cache-control": CACHE.day,
      },
    });
  })
  .get("/fx/:base", async ({ set, params }) => {
    const base = (params.base || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(base)) {
      set.status = 400;
      return { error: "invalid base currency" };
    }

    let resp;
    try {
      resp = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
    } catch {
      set.status = 502;
      return { error: "fx fetch failed" };
    }

    if (!resp.ok) {
      set.status = 502;
      return { error: "fx upstream error" };
    }

    const data = await resp.json();
    if (data.result !== "success" || !data.rates) {
      set.status = 502;
      return { error: "fx unavailable" };
    }

    return new Response(
      JSON.stringify({
        base: data.base_code,
        rates: data.rates,
        updated: data.time_last_update_unix,
      }),
      {
        headers: {
          "content-type": "application/json",
          "cache-control": CACHE.med,
        },
      },
    );
  })
  .get("/s/flags/:file", async ({ set, params }) => {
    if (!/^[a-z-]{2,8}\.svg$/.test(params.file)) {
      set.status = 404;
      return "no";
    }
    set.headers["cache-control"] = CACHE.forever;
    const resp = await env.ASSETS.fetch(
      new Request(`https://assets/assets/flags/${params.file}`),
    );
    return new Response(resp.body, resp);
  })
  .get("/", async ({ query, set, redirect, request }) => {
    const q = query?.q?.replaceAll?.("\n", " ")?.trim();
    const type = query?.type;

    set.headers["content-type"] = "text/html";
    set.headers.Link = `</s/inter-var-v4.woff2>; rel="preload"; as="font"`;

    const ua = request.headers.get("user-agent") || "";
    const isUnfurler =
      /discordbot|twitterbot|slackbot|telegrambot|whatsapp|facebookexternalhit|linkedinbot|pinterest|redditbot|embedly|quora link preview|vkshare|skypeuripreview|nuzzel|bitlybot|flipboard|tumblr|mastodon|misskey|bluesky|iframely|gptbot|oai-searchbot/i.test(
        ua,
      );
    if (q && isUnfurler) {
      const origin = new URL(request.url).origin;
      const enc = encodeURIComponent(q);
      const esc = (s) =>
        s
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      const eq = esc(q);
      const img = `${origin}/og?q=${enc}`;
      set.headers["cache-control"] = CACHE.short;
      return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${eq} · search.tiago.zip</title>
<meta name="description" content="search the web without AI slop.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="search.tiago.zip">
<meta property="og:title" content="${eq}">
<meta property="og:description" content="search the web without AI slop.">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${origin}/?q=${enc}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${eq}">
<meta name="twitter:description" content="search the web without AI slop.">
<meta name="twitter:image" content="${img}">
<meta name="theme-color" content="#1e1e2e">
</head><body>search results for ${eq}</body></html>`;
    }

    if (!q && type !== "maps") {
      set.headers["cache-control"] = CACHE.day;
      const resp = await env.ASSETS.fetch(
        new Request("https://assets/index.html"),
      );
      const html = await resp.text();
      return html.replace("%%colo%%", coloCity(request.cf?.colo));
    }

    const { pageType, redirectUrl, firstResult } = resolveSearchPage(q, type);
    if (q && redirectUrl) {
      return redirect(redirectUrl);
    }
    if (q && firstResult) {
      try {
        const data = await runSearch({
          query: q,
          type: pageType || "web",
          engine: pickEngine(request.headers.get("cookie")),
          cookie: env.KAGI_COOKIE,
        });
        if (data.first_result?.url) return redirect(data.first_result.url);
      } catch {}
    }

    let template;
    if (pageType === "maps") {
      template = await templates.maps();
    } else if (pageType === "images") {
      template = await templates.images();
    } else if (pageType === "news") {
      template = await templates.news();
    } else {
      template = await templates.web();
    }

    set.headers["cache-control"] = CACHE.short;

    const qSafe = q || "";
    const pageTitle = qSafe
      ? qSafe.replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      : pageType === "maps"
        ? "maps"
        : "search";

    const html = template
      .replace("%%pageTitle%%", pageTitle)
      .replace(
        "%%jsJwt%%",
        await sign({ s: qSafe, t: pageType || type }, "10m"),
      )
      .replaceAll(
        "%%inputValue%%",
        qSafe
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;"),
      )
      .replaceAll("%%inputValueEncoded%%", encodeURIComponent(qSafe))
      .replaceAll("&pass", "")
      .replace(/<input[^>]*name="pass"[^>]*>/g, "");

    return html;
  })
  .get("/p", ({ request }) => {
    const colo = request.cf?.colo;
    return { colo };
  })
  .get("/g", async ({ query, set }) => {
    const u = query?.u;
    if (!u) {
      set.status = 400;
      return { error: "missing url" };
    }

    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      set.status = 400;
      return { error: "bad url" };
    }

    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    if (host !== "genius.com" || !/^\/[A-Za-z0-9_%-]+-lyrics$/.test(path)) {
      set.status = 400;
      return { error: "not a genius lyrics url" };
    }

    set.headers["cache-control"] = CACHE.day;

    let resp;
    try {
      resp = await fetch(`https://genius.com${path}`, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
          "accept-language": "en-US,en;q=0.9",
        },
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
    } catch {
      set.status = 502;
      return { error: "fetch failed" };
    }

    if (!resp.ok) {
      set.status = 502;
      return { error: "fetch failed", status: resp.status };
    }

    const state = {
      ogTitle: "",
      ogImage: "",
      docTitle: "",
      sections: [],
      idx: -1,
      skipDepth: 0,
    };

    const rewriter = new HTMLRewriter()
      .on('meta[property="og:title"]', {
        element(el) {
          state.ogTitle = el.getAttribute("content") || "";
        },
      })
      .on('meta[property="og:image"]', {
        element(el) {
          state.ogImage = el.getAttribute("content") || state.ogImage;
        },
      })
      .on("title", {
        text(t) {
          state.docTitle += t.text;
        },
      })
      .on('[data-lyrics-container="true"]', {
        element(el) {
          state.sections.push("");
          state.idx = state.sections.length - 1;
          el.onEndTag(() => {
            state.idx = -1;
          });
        },
        text(t) {
          if (state.idx >= 0 && state.skipDepth === 0)
            state.sections[state.idx] += t.text;
        },
      })
      .on('[data-lyrics-container="true"] br', {
        element() {
          if (state.idx >= 0 && state.skipDepth === 0)
            state.sections[state.idx] += "\n";
        },
      })
      .on(
        '[data-lyrics-container="true"] [data-exclude-from-selection="true"]',
        {
          element(el) {
            state.skipDepth++;
            el.onEndTag(() => {
              state.skipDepth--;
            });
          },
        },
      );

    await rewriter.transform(resp).text();

    const namedEntities = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
    };
    const decode = (s) =>
      s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, ref) => {
        if (ref[0] === "#") {
          const cp =
            ref[1] === "x" || ref[1] === "X"
              ? parseInt(ref.slice(2), 16)
              : parseInt(ref.slice(1), 10);
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
        }
        return namedEntities[ref.toLowerCase()] ?? m;
      });

    const lyrics = decode(state.sections.join("\n\n"))
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    let title = "";
    let artist = "";
    const cleaned = decode(state.docTitle)
      .replace(/\s*\|\s*Genius.*$/i, "")
      .replace(/\s*Lyrics?\s*$/i, "")
      .trim();
    for (const s of [decode(state.ogTitle), cleaned]) {
      if (!s) continue;
      const m = s.match(/^(.+?)\s+[–—-]\s+(.+)$/);
      if (m) {
        artist = m[1].trim();
        title = m[2].replace(/\s*Lyrics?\s*$/i, "").trim();
        break;
      }
    }
    if (!title) title = state.ogTitle || cleaned;

    if (!lyrics) {
      set.status = 404;
      return { error: "no lyrics" };
    }

    return { title, artist, image: state.ogImage, lyrics };
  })
  .get("/p/:q", async ({ set, params, headers }) => {
    let payload;
    try {
      ({ payload } = await jwtVerify(params?.q || "", getSecret()));
    } catch {
      set.status = 401;
      set.headers["content-type"] = "application/javascript";
      set.headers["cache-control"] = "no-store";
      return "location.reload()";
    }

    set.headers["content-type"] = "application/javascript";
    set.headers["cache-control"] = CACHE.day;
    set.headers.Vary = "Accept-Encoding";

    let template, results;

    if (payload.t === "maps") {
      template = await templates.mapsJs();
      results = { initialQuery: payload.s || null };
    } else if (payload.t === "images") {
      template = await templates.imagesJs();
      results = await runSearch({
        query: payload.s,
        type: "images",
        engine: pickEngine(headers?.cookie),
        cookie: env.KAGI_COOKIE,
      });
    } else if (payload.t === "news") {
      template = await templates.newsJs();
      results = await runSearch({
        query: payload.s,
        type: "news",
        engine: pickEngine(headers?.cookie),
        cookie: env.KAGI_COOKIE,
      });
    } else {
      template = await templates.webJs();
      results = await runSearch({
        query: payload.s,
        type: "web",
        engine: pickEngine(headers?.cookie),
        cookie: env.KAGI_COOKIE,
      });
    }

    const js = template
      .replace(
        "__results_pk__",
        await sign({ q: payload.s, p: 1, t: payload.t }, "2h"),
      )
      .replace(
        "__results_cl__",
        await sign(
          {
            v: payload.s,
            _: crypto.randomUUID().split("-")[0],
          },
          "6h",
        ),
      )
      .replace("__results_template__", JSON.stringify(results))
      .replace("%%galileo_pass%%", "");

    return js;
  })
  .post(
    "/p",
    async ({ set, headers, body }) => {
      const secret = getSecret();
      let payload;
      try {
        ({ payload } = await jwtVerify(body, secret));
      } catch {
        set.status = 401;
        return ["expired token"];
      }

      if (!payload.q || !payload.p) {
        return ["missing q or p"];
      }

      if (
        !headers["x-galileo-hash"] ||
        !headers["x-galileo-jwt"] ||
        headers["x-galileo-hash"] !==
          [...`${payload.q}${body}`]
            .reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
            .toString(16)
      ) {
        return ["invalid hash"];
      }

      const page = payload.p || 1;
      const q = payload.q;
      const isImages = payload.t === "images";
      const isNews = payload.t === "news";

      let Cl;
      try {
        Cl = await jwtVerify(headers["x-galileo-jwt"], secret);
      } catch {
        set.status = 401;
        return ["expired token"];
      }

      if (Cl.payload.v !== q) {
        return ["invalid v"];
      }

      if (page < 0 || page > 100) {
        return [];
      }

      set.headers["content-type"] = "application/json";
      set.headers["cache-control"] = CACHE.short;

      const results = await runSearch({
        query: q,
        type: isImages ? "images" : isNews ? "news" : "web",
        page,
        engine: pickEngine(headers?.cookie),
        cookie: env.KAGI_COOKIE,
      });

      if (results?.more_results_available) {
        set.headers["x-galileo-upk"] = await sign(
          {
            q: q,
            p: page + 1,
            ...(isImages ? { t: "images" } : isNews ? { t: "news" } : {}),
          },
          "2h",
        );
      }

      return results;
    },
    {
      body: t.String(),
    },
  )
  .post("/m", async ({ body, set, headers }) => {
    const [token] = body;

    if (headers["x-galileo-hint"] !== "73G8yHKfX2bZqNwDLe6g2NYnyeHJXTFV")
      return { suggestions: [] };

    const [long, _q, lat] = JSON.parse(decode(token));
    const q = atob(_q.split("").reverse().join(""));

    set.headers["content-type"] = "application/json";
    set.headers["cache-control"] = CACHE.tts;
    if (!q) return { suggestions: [] };

    const suggestions = (await maps.mapboxSearch(q, [lat, long])).map(
      (suggestion) => [
        suggestion.coords,
        suggestion.name,
        suggestion.place,
        suggestion.poi,
      ],
    );

    return { suggestions };
  })
  .post("/d", async ({ body, set, headers }) => {
    const [token] = body;

    if (headers["x-galileo-hint"] !== "73G8yHKfX2bZqNwDLe6g2NYnyeHJXTFV") {
      return { name: "", lat: 0, lng: 0, place: null };
    }

    let lng, lat, q;
    try {
      const [_lng, _q, _lat] = JSON.parse(decode(token));
      lng = Number(_lng);
      lat = Number(_lat);
      q = new TextDecoder().decode(
        Uint8Array.from(atob(_q.split("").reverse().join("")), (c) =>
          c.charCodeAt(0),
        ),
      );
    } catch {
      return { name: "", lat: 0, lng: 0, place: null };
    }

    set.headers["content-type"] = "application/json";
    set.headers["cache-control"] = CACHE.short;
    if (!q || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { name: q || "", lat: lat || 0, lng: lng || 0, place: null };
    }
    return await maps.enrichPlace(q, lat, lng);
  })
  .get("/s/:file", async ({ set, params }) => {
    if (params.file.includes("/") || params.file.includes("..")) return "no";

    set.headers["cache-control"] = CACHE.forever;
    const resp = await env.ASSETS.fetch(
      new Request(`https://assets/assets/${params.file}`),
    );
    return new Response(resp.body, resp);
  })
  .all("/*", async () => {
    const resp = await env.ASSETS.fetch(new Request("https://assets/404.html"));
    return new Response(resp.body, { status: 404, headers: resp.headers });
  })
  .compile();
