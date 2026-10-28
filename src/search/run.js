import { parseQuery } from "../query.js";
import searchImages from "./images.js";
import searchKagiWeb from "./kagi.js";
import searchMixed from "./mixed.js";
import searchNews from "./news.js";
import { emptyResults } from "./shape.js";

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

const hasAnything = (data, tab) => {
  const r = data?.results;
  if (!r) return false;
  if (tab === "images" || tab === "news") return Boolean(r.length);
  return Boolean(
    r.web?.results?.length ||
      r.news?.results?.length ||
      r.videos?.results?.length ||
      r.infobox?.results?.length ||
      r.discussions?.results?.length ||
      r.rich?.length,
  );
};

export async function runSearch({
  query,
  type = "web",
  page = 0,
  engines = ["brave"],
  lens,
  db,
  clearance,
  interactive = false,
  safe,
  time,
} = {}) {
  const filters = {
    safe: ["off", "moderate", "strict"].includes(safe) ? safe : undefined,
    time: ["pd", "pw", "pm", "py"].includes(time) ? time : undefined,
  };
  const parsed = parseQuery(query, { lens });
  if (parsed.redirectUrl) {
    return { query, type, page, redirect: parsed.redirectUrl, parsed };
  }

  const tab = parsed.tab || type || "web";
  const q = parsed.engineQuery || parsed.query || "";
  const webTab = tab !== "images" && tab !== "news" && tab !== "maps";
  const order = engines.filter(
    (e, i, a) => a.indexOf(e) === i && (webTab || e === "brave"),
  );
  if (!order.length) order.push("brave");
  const attempts = order.length > 1 ? 1 : 2;

  const t0 = Date.now();
  let data;
  let used = order[0];
  const errors = [];
  let powRequired = false;
  for (const eng of order) {
    try {
      let attempt;
      if (tab === "images")
        attempt = await searchImages(q, page, {
          attempts,
          clearance,
          safe: filters.safe,
        });
      else if (tab === "news")
        attempt = await searchNews(q, page, {
          attempts,
          clearance,
          ...filters,
        });
      else if (eng === "kagi") attempt = await searchKagiWeb(q, page, db);
      else
        attempt = await searchMixed(q, page, {
          attempts,
          clearance,
          ...filters,
        });
      const ok = hasAnything(attempt, tab);
      if (ok || !data) {
        data = attempt;
        used = eng;
      }
      if (ok) break;
    } catch (e) {
      errors.push({ engine: eng, error: e });
      if (interactive && e?.pow && !data) {
        powRequired = true;
        break;
      }
    }
  }
  const failed = !data;
  if (!data) data = { more_results_available: false, results: emptyResults() };
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
    engine: used,
    took,
    ...(used !== order[0]
      ? {
          fallback_from: order[0],
          fallback_reason: errors.find((e) => e.engine === order[0])?.error
            ?.blocked
            ? "is rate limited"
            : "didn't answer",
        }
      : {}),
    ...(powRequired ? { pow_required: true } : {}),
    ...(failed
      ? {
          search_error: errors
            .map((e) => `${e.engine}: ${String(e.error?.message || e.error)}`)
            .join("; "),
        }
      : {}),
    parsed,
    ...(first_result ? { first_result } : {}),
    ...data,
  };
}
