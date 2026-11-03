import { env } from "cloudflare:workers";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HEADERS = { "user-agent": UA, "accept-language": "en-US,en;q=0.9" };
const TIMEOUT = 12000;
const LIMIT = 40;

const unescapeHtml = (s) =>
  s
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const absolute = (u) => (u?.startsWith("//") ? `https:${u}` : u || "");

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const GENERIC = new Set([
  "wiki",
  "thread",
  "gallery",
  "post",
  "posts",
  "status",
  "image",
  "images",
  "photo",
  "photos",
  "index",
  "view",
  "html",
]);

const slugTitle = (u) => {
  try {
    const seg = decodeURIComponent(new URL(u).pathname)
      .split("/")
      .map((p) =>
        p
          .replace(/\.(?:html?|php|aspx?)$/i, "")
          .replace(/[-_+]+/g, " ")
          .replace(/(?:\s\d{5,})+$/, "")
          .trim(),
      )
      .filter((p) => p && !GENERIC.has(p.toLowerCase()))
      .findLast((p) => /\p{L}{3,}.* \p{L}{2,}|^\p{L}{4,}$/u.test(p));
    return seg ? seg[0].toUpperCase() + seg.slice(1) : "";
  } catch {
    return "";
  }
};

const withTimeout = (url, init = {}) =>
  fetch(url, {
    ...init,
    headers: { ...HEADERS, ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT),
  });

const fileForm = (field, image) => {
  const form = new FormData();
  form.append(
    field,
    new Blob([image.bytes], { type: image.type }),
    `image.${image.type.split("/")[1] || "jpg"}`,
  );
  return form;
};

const yandex = async ({ url, image }) => {
  let page = `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(url || "")}`;
  if (image) {
    const request = encodeURIComponent(
      JSON.stringify({
        blocks: [{ block: "b-page_type_search-by-image__link" }],
      }),
    );
    const up = await withTimeout(
      `https://yandex.com/images/search?rpt=imageview&format=json&request=${request}`,
      { method: "POST", body: fileForm("upfile", image) },
    );
    const cbirId = (await up.json()).blocks?.[0]?.params?.cbirId;
    if (!cbirId) throw new Error("upload rejected");
    page = `https://yandex.com/images/search?rpt=imageview&cbir_id=${encodeURIComponent(cbirId)}`;
  }

  const html = await (await withTimeout(page)).text();
  if (/showcaptcha|smartcaptcha/i.test(html)) throw new Error("captcha");
  const blob = [...html.matchAll(/data-state="([^"]+)"/g)]
    .map((m) => m[1])
    .find((s) => s.includes("initialState") && s.includes("cbir"));
  if (!blob) throw new Error("no results state");
  const st = JSON.parse(unescapeHtml(blob)).initialState;

  return {
    link: page,
    pages: (st.cbirSites?.sites || []).slice(0, LIMIT).map((s) => ({
      title: s.title,
      url: s.url,
      domain: s.domain || hostOf(s.url),
      description: s.description,
      thumb: absolute(s.thumb?.url),
      image: s.originalImage?.url,
      width: s.originalImage?.width,
      height: s.originalImage?.height,
    })),
    similar: (st.cbirSimilar?.thumbs || []).slice(0, LIMIT).map((t) => {
      const target = new URLSearchParams(t.linkUrl?.split("?")[1] || "").get(
        "img_url",
      );
      return {
        title: t.title,
        thumb: absolute(t.imageUrl),
        url: target || absolute(t.imageUrl),
        width: t.width,
        height: t.height,
      };
    }),
    tags: (st.cbirTags?.tags || [])
      .map((t) => t.text)
      .filter((t) => t && !/[Ѐ-ӿ]/.test(t)),
  };
};

const tineye = async ({ url, image }) => {
  const relay = env.RIMG_RELAY_SECRET;
  const api = relay
    ? "https://rimgrelay.tiago.zip/tineye?sort=score&order=desc"
    : "https://tineye.com/api/v1/result_json/?sort=score&order=desc";
  const headers = relay ? { "x-rimg-relay-secret": relay } : {};
  const resp = image
    ? await withTimeout(api, {
        method: "POST",
        headers,
        body: fileForm("image", image),
      })
    : await withTimeout(`${api}&url=${encodeURIComponent(url)}`, { headers });
  if (!resp.ok) throw new Error(`http ${resp.status}`);
  const d = await resp.json();
  return {
    link: url
      ? `https://tineye.com/search?url=${encodeURIComponent(url)}`
      : "https://tineye.com/",
    total: d.num_matches ?? 0,
    pages: (d.matches || []).slice(0, LIMIT).map((m) => {
      const b = m.backlinks?.[0] || {};
      return {
        title: slugTitle(b.backlink) || b.image_name || m.domain,
        url: b.backlink || b.url,
        domain: m.domain || hostOf(b.backlink),
        thumb: m.image_url,
        image: b.url,
        width: m.width,
        height: m.height,
        date: b.crawl_date,
      };
    }),
    similar: [],
    tags: [],
  };
};

const BING = "https://www.bing.com";

const bingSession = () => {
  const jar = new Map();
  return async (path, init = {}) => {
    const res = await withTimeout(new URL(path, BING), {
      ...init,
      redirect: "manual",
      headers: {
        "user-agent": `${UA} Edg/130.0.0.0`,
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...init.headers,
      },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    return res;
  };
};

const bingSignature = (html) => {
  const raw = html.match(/ignature="v2s\|([^|"]+)\|([^"]+)"/);
  const init = html.match(/SignatureUtils\.init\("([^"]+)",\s*(\d+)\)/);
  if (!raw || !init) return "";
  const [, key, offset] = init;
  const bytes = atob(raw[1]);
  let out = "";
  for (let i = 0; i < bytes.length; i++)
    out += String.fromCharCode(
      (bytes.charCodeAt(i) ^ key.charCodeAt(i % key.length)) - Number(offset),
    );
  return `v2u|${out}|${raw[2]}`;
};

const bingItem = (v) => ({
  title: v.name,
  url: v.hostPageUrl || v.contentUrl,
  domain: hostOf(v.hostPageUrl || v.contentUrl),
  thumb: v.thumbnailUrl,
  image: v.contentUrl,
  width: v.width,
  height: v.height,
  date: v.datePublished?.slice(0, 10),
});

const bing = async ({ url, image, publicUrl }) => {
  const go = bingSession();
  let landing;
  if (image && image.bytes.byteLength <= 700_000) {
    const form = new FormData();
    form.append("imgurl", "");
    form.append("cbir", "sbi");
    let bin = "";
    const bytes = new Uint8Array(image.bytes);
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    form.append("imageBin", btoa(bin));
    const up = await go("/images/kblob?iss=sbi&FORM=SBIWEB&sbisrc=ImgPicker", {
      method: "POST",
      body: form,
    });
    if (!up.ok) throw new Error(`upload rejected (${up.status})`);
    landing = (await up.json()).redirectUrl;
  } else if (url || publicUrl) {
    const res = await go(
      `/images/search?view=detailv2&iss=sbi&FORM=SBIHMP&sbisrc=UrlPaste&q=imgurl:${encodeURIComponent(url || publicUrl)}&idpbck=1`,
    );
    landing = res.headers.get("location");
  } else {
    throw new Error("image too large for bing");
  }
  const page = new URL(landing || "/", BING);
  const bcid = page.searchParams.get("bcid");
  if (!bcid) throw new Error("bing couldn't read the image");

  const html = await (
    await go(page, { headers: { accept: "text/html" } })
  ).text();
  const api = html.match(/\/images\/api\/custom\/knowledge[^"]*/)?.[0];
  const signature = bingSignature(html);
  if (!api || !signature) throw new Error("bing changed its page");
  const form = new FormData();
  form.append(
    "knowledgeRequest",
    JSON.stringify({
      imageInfo: { imageInsightsToken: `bcid_${bcid}`, source: "Url" },
      knowledgeRequest: {
        invokedSkills: ["SimilarImages", "PagesIncluding"],
        index: 1,
      },
    }),
  );
  const res = await go(unescapeHtml(api), {
    method: "POST",
    body: form,
    headers: {
      accept: "application/json",
      "x-image-knowledge-signature": signature,
    },
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const actions = ((await res.json()).tags || []).flatMap(
    (t) => t.actions || [],
  );
  const action = (type) => actions.find((a) => a.actionType === type)?.data;
  const pages = (action("PagesIncluding")?.value || []).map(bingItem);
  const guess = page.searchParams.get("q");
  page.searchParams.delete("fq");
  page.searchParams.set("vsa", "3");
  return {
    link: page.href,
    total: pages.length,
    pages: pages.filter((p) => p.url).slice(0, LIMIT),
    similar: (action("VisualSearch")?.value || [])
      .map(bingItem)
      .filter((s) => s.thumb)
      .slice(0, LIMIT),
    tags: guess ? [guess] : [],
  };
};

const ENGINES = { yandex, bing, tineye };

export const rimgEngines = Object.keys(ENGINES);

export async function reverseImage(engine, input) {
  const run = ENGINES[engine];
  if (!run) return { engine, ok: false, error: "unknown engine" };
  const started = Date.now();
  try {
    const out = await run(input);
    return { engine, ok: true, ms: Date.now() - started, ...out };
  } catch (e) {
    return {
      engine,
      ok: false,
      ms: Date.now() - started,
      error: e?.name === "TimeoutError" ? "timed out" : e?.message || "failed",
    };
  }
}
