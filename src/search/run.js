import { parseQuery } from "../query.js";
import searchImages from "./images.js";
import searchKagiWeb from "./kagi.js";
import searchMixed from "./mixed.js";
import searchNews from "./news.js";

function firstWeb(data) {
  const web = data?.results?.web?.results || [];
  const r = web.find((x) => x?.url && x?.title);
  if (!r) return;
  return {
    title: r.title,
    url: r.url,
    snippet: r.description || r.snippet || "",
  };
}

export async function runSearch({
  query,
  type = "web",
  page = 0,
  engine = "brave",
  lens,
  db,
} = {}) {
  const parsed = parseQuery(query, { lens });
  if (parsed.redirectUrl) {
    return { query, type, page, redirect: parsed.redirectUrl, parsed };
  }

  const tab = parsed.tab || type || "web";
  const q = parsed.engineQuery || parsed.query || "";
  const useKagi =
    engine === "kagi" && tab !== "images" && tab !== "news" && tab !== "maps";

  const t0 = Date.now();
  let data;
  let searchError;
  try {
    if (tab === "images") data = await searchImages(q, page);
    else if (tab === "news") data = await searchNews(q, page);
    else if (useKagi) data = await searchKagiWeb(q, page, db);
    else data = await searchMixed(q, page);
  } catch (e) {
    searchError = String(e?.message || e);
    data = {
      more_results_available: false,
      results: {
        web: { results: [] },
        news: null,
        videos: null,
        discussions: null,
        faq: null,
        infobox: null,
        rich: null,
        qanda: null,
        locations: null,
        recepies: null,
        images: null,
        mixed: [],
      },
    };
  }
  const took = Date.now() - t0;

  const web = data?.results?.web?.results;
  if (Array.isArray(web)) {
    data.results.web.results = web.map((r) => ({
      ...r,
      snippet: r.snippet || r.description || "",
      description: r.description || r.snippet || "",
    }));
  }

  const first_result = parsed.firstResult ? firstWeb(data) : undefined;
  const outType = tab === "videos" ? "web" : tab;

  return {
    query: parsed.query,
    type: outType,
    page,
    engine: useKagi ? "kagi" : "brave",
    took,
    ...(searchError ? { search_error: searchError } : {}),
    parsed,
    ...(first_result ? { first_result } : {}),
    ...data,
  };
}
