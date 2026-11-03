import { emptyResults } from "./shape.js";

const snippet = (highlights = []) =>
  highlights
    .join("\n...\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("|"))
    .map((l) =>
      l === "..." ? "…" : l.replace(/^#+\s*|^(?:[-*•]|\d+\.)\s+/, ""),
    )
    .join(" ")
    .replace(/^(?:… )+|(?: …)+$/g, "")
    .replace(/(?:… ){2,}/g, "… ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]{1,3}([^*_`]+)[*_`]{1,3}/g, "$1")
    .replace(/(?:\s*\|\s*)+/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/^[·\s]+|[·\s]+$/g, "")
    .trim()
    .replace(/^(.{300}\S*).+$/, "$1 …");

export default async function searchExa(query, page = 0, relaySecret) {
  if (!relaySecret) throw new Error("exa relay not configured");
  if (page > 0)
    return { more_results_available: false, results: emptyResults() };
  const res = await fetch("https://rimgrelay.tiago.zip/exa", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rimg-relay-secret": relaySecret,
    },
    body: JSON.stringify({ query, num_results: 10 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok)
    throw Object.assign(new Error(`exa http ${res.status}`), {
      blocked: res.status === 429,
    });
  const items = (await res.json()).results || [];
  return {
    more_results_available: false,
    results: {
      ...emptyResults(),
      web: {
        results: items
          .filter((r) => r.url)
          .map((r) => {
            let host = "";
            try {
              host = new URL(r.url).hostname.replace(/^www\./, "");
            } catch {}
            const description = snippet(r.highlights);
            return {
              title: r.title || host,
              url: r.url,
              snippet: description,
              description,
              age: r.publishedDate?.slice(0, 10) || null,
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
    },
  };
}
