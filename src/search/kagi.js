import { parseKagiHtml, searchKagi } from "../../../kagibot/search.js";

export { parseKagiHtml };

const DEAD_AT = 3;
const MAX_TRIES = 4;

async function pickSession(db) {
  const row = await db
    .prepare(
      `SELECT id, cookie FROM sessions
       WHERE dead = 0
       ORDER BY last_used_at ASC NULLS FIRST, fails ASC, id ASC
       LIMIT 1`,
    )
    .first();
  return row || null;
}

async function markUsed(db, id) {
  await db
    .prepare("UPDATE sessions SET last_used_at = ?, fails = 0 WHERE id = ?")
    .bind(Date.now(), id)
    .run();
}

async function markFail(db, id) {
  await db
    .prepare(
      "UPDATE sessions SET fails = fails + 1, dead = CASE WHEN fails + 1 >= ? THEN 1 ELSE 0 END WHERE id = ?",
    )
    .bind(DEAD_AT, id)
    .run();
}

function shape(items) {
  return {
    more_results_available: items.length >= 8,
    results: {
      web: {
        results: items.map((r) => {
          let host = "";
          try {
            host = new URL(r.url).hostname.replace(/^www\./, "");
          } catch {}
          return {
            title: r.title,
            url: r.url,
            snippet: r.snippet || "",
            description: r.snippet || "",
            age: null,
            meta_url: host
              ? {
                  hostname: host,
                  favicon: `https://icons.duckduckgo.com/ip3/${host}.ico`,
                }
              : null,
            profile: host ? { name: host, img: null } : null,
            thumbnail: null,
            deep_results: null,
            cluster: null,
          };
        }),
      },
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
      mixed: items.map((_, index) => ({ type: "web", index })),
    },
  };
}

export default async function searchKagiWeb(query, page = 0, db) {
  if (!db) throw new Error("kagi session store unavailable");

  const tried = new Set();
  let lastErr = new Error("no live kagi sessions in bank");

  for (let i = 0; i < MAX_TRIES; i++) {
    const session = await pickSession(db);
    if (!session || tried.has(session.id)) break;
    tried.add(session.id);

    try {
      const data = await searchKagi(query, { cookie: session.cookie, page });
      const items = data.results || [];
      if (!items.length) {
        lastErr = new Error("kagi session returned 0 results (likely dead)");
        await markFail(db, session.id);
        continue;
      }
      await markUsed(db, session.id);
      return shape(items);
    } catch (e) {
      lastErr = e;
      await markFail(db, session.id);
    }
  }

  throw lastErr;
}
