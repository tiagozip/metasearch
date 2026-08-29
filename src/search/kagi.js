import { parseKagiHtml, searchKagi } from "../../../kagibot/search.js";
import { mintTrialSession } from "../../../kagibot/session.js";

export { parseKagiHtml };

const bank = [];
const BANK_MAX = 5;
const MINT_COOLDOWN = 5 * 60 * 1000;
let lastMintAt = 0;

async function mintIntoBank(force) {
  if (!force && Date.now() - lastMintAt < MINT_COOLDOWN) return null;
  lastMintAt = Date.now();
  const minted = await mintTrialSession();
  bank.push(minted.cookie);
  if (bank.length > BANK_MAX) bank.shift();
  return minted.cookie;
}

export async function resolveKagiCookie(explicit) {
  if (explicit) return explicit;
  if (bank.length) return bank[bank.length - 1];
  return await mintIntoBank(true);
}

export default async function searchKagiWeb(query, page = 0, cookie) {
  const session = await resolveKagiCookie(cookie);
  let data;
  try {
    data = await searchKagi(query, { cookie: session, page });
  } catch (e) {
    const i = bank.indexOf(session);
    if (i !== -1) bank.splice(i, 1);
    let fresh;
    try {
      fresh = bank.length ? bank[bank.length - 1] : await mintIntoBank(true);
    } catch {
      throw e;
    }
    if (!fresh || fresh === session) throw e;
    data = await searchKagi(query, { cookie: fresh, page });
  }
  if (!cookie && bank.length < 2) mintIntoBank().catch(() => {});
  const items = data.results || [];
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
