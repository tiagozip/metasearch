import braveData from "./braveData.js";
import braveFetch from "./braveFetch.js";

export default async function searchNews(
  query,
  page = 0,
  { attempts, clearance } = {},
) {
  const resp = await braveFetch(
    `https://search.brave.com/news?q=${encodeURIComponent(query)}${page ? `&offset=${page}` : ""}&source=web`,
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
    },
  );

  const raw = await resp.text();

  try {
    const simplified = braveData(raw);
    const newsResults = simplified?.response?.news?.results || [];

    return {
      pow_low: resp.powLow,
      more_results_available:
        simplified?.response?.query?.more_results_available ?? false,
      results: newsResults.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
        age: r.age,
        meta_url: r.meta_url
          ? {
              hostname: r.meta_url.hostname,
              favicon: r.meta_url.favicon,
            }
          : null,
        profile: r.profile
          ? {
              name: r.profile.name,
              img: r.profile.img,
            }
          : null,
        thumbnail: r.thumbnail
          ? {
              src: r.thumbnail.src,
            }
          : null,
        is_live: r.is_live || false,
      })),
    };
  } catch (e) {
    console.error("news search parse error:", e);
    throw new Error(`brave news parse failed (${resp.status})`);
  }
}
