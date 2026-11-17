import braveFetch from "./braveFetch.js";

const DEADLINE_MS = 3000;
const CONCURRENCY = 8;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

export const destinationOf = (html) => {
  const m = html.match(/class="destination[^"]*"\s+href="([^"]+)"/);
  if (!m) return null;
  const url = m[1].replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]);
  return /^https?:\/\//.test(url) ? url : null;
};

const isCloaked = (v) => typeof v === "string" && v.startsWith("/go/v1/");

const collect = (node, found, parent) => {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, found, parent);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (isCloaked(value))
      found.push({ node, key, host: node.meta_url?.hostname ?? parent });
    else collect(value, found, node.meta_url?.hostname ?? parent);
  }
};

export default async function uncloak(data, options = {}) {
  const found = [];
  collect(data, found, null);
  if (!found.length) return data;

  const tokens = [...new Set(found.map((f) => f.node[f.key]))];
  const resolved = new Map();
  const deadline = new Promise((r) => setTimeout(r, DEADLINE_MS));

  const resolveOne = async (token) => {
    try {
      const resp = await braveFetch(`https://search.brave.com${token}`, {
        attempts: 1,
        redirect: "manual",
        clearance: options.clearance,
        safe: options.safe,
      });
      const location = resp.headers.location;
      resolved.set(
        token,
        /^https?:\/\//.test(location ?? "")
          ? location
          : destinationOf(await resp.text()),
      );
    } catch {
      resolved.set(token, null);
    }
  };

  const queue = [...tokens];
  const worker = async () => {
    while (queue.length) await resolveOne(queue.shift());
  };
  await Promise.race([
    Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, tokens.length) }, worker),
    ),
    deadline,
  ]);

  for (const { node, key, host } of found) {
    node[key] = resolved.get(node[key]) ?? (host ? `https://${host}/` : "");
  }
  return data;
}
