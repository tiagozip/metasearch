import { env } from "cloudflare:workers";
import { Elysia, t } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { jwtVerify, SignJWT } from "jose";
import bang from "./bangs.js";
import searchImages from "./search/images.js";
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

    if (!q) {
      set.headers["cache-control"] = "public, max-age=86400";
      const resp = await env.ASSETS.fetch(
        new Request("https://assets/index.html"),
      );
      const html = await resp.text();
      return html.replace("%%colo%%", request.cf?.colo || "unknown");
    }

    const bangUrl = bang(q);
    if (bangUrl) {
      return redirect(bangUrl);
    }

    let template;
    if (type === "images") {
      template = await templates.images();
    } else if (type === "news") {
      template = await templates.news();
    } else {
      template = await templates.web();
    }

    set.headers["cache-control"] = "public, max-age=300";

    const html = template
      .replace("%%pageTitle%%", q.replace("<", "&lt;").replaceAll(">", "&gt;"))
      .replace("%%jsJwt%%", await sign({ s: q, t: type }, "10m"))
      .replaceAll(
        "%%inputValue%%",
        q
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;"),
      )
      .replaceAll("%%inputValueEncoded%%", encodeURIComponent(q))
      .replaceAll("&pass", "")
      .replaceAll('<input type="hidden" name="pass">', "");

    return html;
  })
  .get("/p", ({ request }) => {
    const colo = request.cf?.colo;
    return { colo };
  })
  .get("/p/:q", async ({ set, params }) => {
    const { payload } = await jwtVerify(params?.q || "", getSecret());

    set.headers["content-type"] = "application/javascript";
    set.headers["cache-control"] = "public, max-age=86400";
    set.headers.Vary = "Accept-Encoding";

    let template, results;

    if (payload.t === "images") {
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
  .get("/s/:file", async ({ set, params }) => {
    if (params.file.includes("/") || params.file.includes("..")) return "no";

    set.headers["cache-control"] = "public, max-age=5184000";
    const resp = await env.ASSETS.fetch(
      new Request(`https://assets/assets/${params.file}`),
    );
    return new Response(resp.body, resp);
  })
  .compile();
