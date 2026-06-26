import { env } from "cloudflare:workers";
import { Elysia, t } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { jwtVerify, SignJWT } from "jose";
import bang from "./bangs.js";
import { coloCity } from "./colos.js";
import searchImages from "./search/images.js";
import * as maps from "./search/maps.js";
import searchMixed from "./search/mixed.js";
import searchNews from "./search/news.js";
import * as templates from "./templates.js";
import {
  enrichTranslation,
  isValidLang,
  translateBatch,
  transliterate,
} from "./translate.js";

const getSecret = () => new TextEncoder().encode(env.JWT_SECRET);

const sign = async (payload, expiry) => {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiry || "1h")
    .sign(getSecret());
};

const checkApiAuth = async (headers) => {
  if (!env.DB)
    return { status: 503, error: "api is not enabled on this instance" };

  const match = /^Bearer\s+(.+)$/i.exec(headers.authorization || "");
  if (!match)
    return {
      status: 401,
      error:
        "missing or malformed Authorization header (expected: Bearer <key>)",
    };

  let row;
  try {
    row = await env.DB.prepare("SELECT key FROM api_keys WHERE key = ?")
      .bind(match[1].trim())
      .first();
  } catch {
    return { status: 503, error: "api is not enabled on this instance" };
  }

  if (!row) return { status: 401, error: "invalid api key" };
  return null;
};

export default new Elysia({ adapter: CloudflareAdapter })
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
    set.headers["access-control-allow-headers"] = "authorization, content-type";
    set.headers["access-control-max-age"] = "86400";
    return null;
  })
  .post("/api", async ({ body, headers, set }) => {
    set.headers["content-type"] = "application/json";
    set.headers["access-control-allow-origin"] = "*";
    set.headers["cache-control"] = "no-store";

    const authError = await checkApiAuth(headers);
    if (authError) {
      set.status = authError.status;
      if (authError.status === 401) set.headers["www-authenticate"] = "Bearer";
      return { error: authError.error };
    }

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

    const page = Math.floor(Number(payload.page ?? 0));
    if (!Number.isFinite(page) || page < 0) {
      set.status = 400;
      return { error: "page must be a non-negative integer" };
    }

    let data;
    try {
      data =
        type === "images"
          ? await searchImages(query, page)
          : type === "news"
            ? await searchNews(query, page)
            : await searchMixed(query, page);
    } catch (e) {
      set.status = 502;
      return { error: "search failed", detail: String(e?.message || e) };
    }

    return { query, type, page, ...data };
  })
  .get("/translate", async ({ set }) => {
    set.headers["cache-control"] = "public, max-age=3600";
    const resp = await env.ASSETS.fetch(
      new Request("https://assets/translate.html"),
    );
    return new Response(resp.body, resp);
  })
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
        "cache-control": "public, max-age=86400",
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
    set.headers["cache-control"] = "public, max-age=86400";

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
        "cache-control": "public, max-age=86400",
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
          "cache-control": "public, max-age=3600",
        },
      },
    );
  })
  .get("/s/flags/:file", async ({ set, params }) => {
    if (!/^[a-z-]{2,8}\.svg$/.test(params.file)) {
      set.status = 404;
      return "no";
    }
    set.headers["cache-control"] = "public, max-age=5184000";
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

    if (!q && type !== "maps") {
      set.headers["cache-control"] = "public, max-age=86400";
      const resp = await env.ASSETS.fetch(
        new Request("https://assets/index.html"),
      );
      const html = await resp.text();
      return html.replace("%%colo%%", coloCity(request.cf?.colo));
    }

    if (q) {
      const bangUrl = bang(q);
      if (bangUrl) {
        return redirect(bangUrl);
      }
    }

    let template;
    if (type === "maps") {
      template = await templates.maps();
    } else if (type === "images") {
      template = await templates.images();
    } else if (type === "news") {
      template = await templates.news();
    } else {
      template = await templates.web();
    }

    set.headers["cache-control"] = "public, max-age=300";

    const qSafe = q || "";
    const pageTitle = qSafe
      ? qSafe.replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      : type === "maps"
        ? "maps"
        : "search";

    const html = template
      .replace("%%pageTitle%%", pageTitle)
      .replace("%%jsJwt%%", await sign({ s: qSafe, t: type }, "10m"))
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

    set.headers["cache-control"] = "public, max-age=86400";

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
  .get("/p/:q", async ({ set, params }) => {
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
    set.headers["cache-control"] = "public, max-age=86400";
    set.headers.Vary = "Accept-Encoding";

    let template, results;

    if (payload.t === "maps") {
      template = await templates.mapsJs();
      results = { initialQuery: payload.s || null };
    } else if (payload.t === "images") {
      template = await templates.imagesJs();
      results = await searchImages(payload.s);
    } else if (payload.t === "news") {
      template = await templates.newsJs();
      results = await searchNews(payload.s);
    } else {
      template = await templates.webJs();
      results = await searchMixed(payload.s);
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
      set.headers["cache-control"] = "public, max-age=300";

      const results = isImages
        ? await searchImages(q, page)
        : isNews
          ? await searchNews(q, page)
          : await searchMixed(q, page);

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

    function xor(str) {
      return [...str]
        .map((c, i) =>
          String.fromCharCode(
            c.charCodeAt(0) ^
              "filed in quiet ink a body claimed by no one words refuse their cage copyright tiago zip".charCodeAt(
                i % 87,
              ),
          ),
        )
        .join("");
    }

    function decode(token) {
      const bin = atob(token);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const r = new TextDecoder().decode(bytes);

      const x = [...r].reverse().join("");
      return xor(x);
    }

    const [long, _q, lat] = JSON.parse(decode(token));
    const q = atob(_q.split("").reverse().join(""));

    set.headers["content-type"] = "application/json";
    set.headers["cache-control"] = "public, max-age=120";
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

    function xor(str) {
      return [...str]
        .map((c, i) =>
          String.fromCharCode(
            c.charCodeAt(0) ^
              "filed in quiet ink a body claimed by no one words refuse their cage copyright tiago zip".charCodeAt(
                i % 87,
              ),
          ),
        )
        .join("");
    }

    function decode(token) {
      const bin = atob(token);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const r = new TextDecoder().decode(bytes);
      const x = [...r].reverse().join("");
      return xor(x);
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
    set.headers["cache-control"] = "public, max-age=300";
    if (!q || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { name: q || "", lat: lat || 0, lng: lng || 0, place: null };
    }
    return await maps.enrichPlace(q, lat, lng);
  })
  .get("/s/:file", async ({ set, params }) => {
    if (params.file.includes("/") || params.file.includes("..")) return "no";

    set.headers["cache-control"] = "public, max-age=5184000";
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
