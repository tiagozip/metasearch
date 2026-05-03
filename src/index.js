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

const getSecret = () => new TextEncoder().encode(env.JWT_SECRET);

const sign = async (payload, expiry) => {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiry || "1h")
    .sign(getSecret());
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
      ? qSafe.replace("<", "&lt;").replaceAll(">", "&gt;")
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
      .replaceAll('<input type="hidden" name="pass">', "");

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
      .on('[data-lyrics-container="true"] [data-exclude-from-selection="true"]', {
        element(el) {
          state.skipDepth++;
          el.onEndTag(() => {
            state.skipDepth--;
          });
        },
      });

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
    const { payload } = await jwtVerify(params?.q || "", getSecret());

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
      const { payload } = await jwtVerify(body, secret);

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

      const Cl = await jwtVerify(headers["x-galileo-jwt"], secret);

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
    if (!q || !isFinite(lat) || !isFinite(lng)) {
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
  .compile();
