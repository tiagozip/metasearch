import braveData from "./braveData.js";
import braveFetch from "./braveFetch.js";

export const IMG_SIZES = ["small", "medium", "large"];
export const IMG_LAYOUTS = ["wide", "tall", "square"];

const sizeOf = (w, h) => {
  const side = Math.max(w, h);
  return side >= 1200 ? "large" : side >= 500 ? "medium" : "small";
};

const layoutOf = (w, h) =>
  w > h * 1.15 ? "wide" : h > w * 1.15 ? "tall" : "square";

export default async function searchImages(
  query,
  page = 0,
  { attempts, clearance, safe, size, layout } = {},
) {
  const resp = await braveFetch(
    `https://search.brave.com/images?q=${encodeURIComponent(query)}${page ? `&offset=${page}` : ""}&source=web`,
    {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      },
      referrerPolicy: "strict-origin-when-cross-origin",
      method: "GET",
      sniffBlockPage: true,
      attempts,
      clearance,
      safe,
    },
  );

  const raw = await resp.text();

  try {
    const simplified = braveData(raw);
    const imageResults = simplified.body?.response?.results || [];

    const keep = (r) => {
      if (!size && !layout) return true;
      const w = Number(r.properties?.width);
      const h = Number(r.properties?.height);
      if (!w || !h) return false;
      if (size && sizeOf(w, h) !== size) return false;
      return !layout || layoutOf(w, h) === layout;
    };

    return {
      pow_low: resp.powLow,
      more_results_available:
        simplified.body?.response?.query?.more_results_available ?? false,
      results: imageResults
        .map((r) => ({
          title: r.title,
          url: r.url,
          source: r.source,
          thumbnail: r.thumbnail?.src || r.properties?.url,
          properties: r.properties
            ? {
                url: r.properties.url,
                width: r.properties.width,
                height: r.properties.height,
              }
            : null,
          meta_url: r.meta_url
            ? {
                hostname: r.meta_url.hostname,
                favicon: r.meta_url.favicon,
              }
            : null,
        }))
        .filter(keep),
    };
  } catch (e) {
    console.error("image search parse error:", e);
    throw new Error(`brave image parse failed (${resp.status})`);
  }
}
