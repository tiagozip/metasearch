export const MASCOTS = ["teto", "spongebob", "gumi", "miku", "ralsei"];
export const SAFE = ["off", "moderate", "strict"];
export const TIMES = ["pd", "pw", "pm", "py"];

export const cookieSafe = (header) => {
  const v = /(?:^|;\s*)safesearch=(\w+)/.exec(header || "")?.[1];
  return SAFE.includes(v) ? v : undefined;
};
const RULES = { b: "block", r: "raise", l: "lower" };
const SITE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const decode = (raw, max) => {
  if (!raw || typeof raw !== "string" || raw.length > max) return null;
  try {
    const b64 = raw.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
};

export const rulePattern = (pattern) => {
  if (typeof pattern !== "string") return null;
  if (/^\/.+\/$/s.test(pattern)) {
    if (pattern.length > 202) return null;
    try {
      new RegExp(pattern.slice(1, -1), "i");
      return pattern;
    } catch {
      return null;
    }
  }
  const p = pattern.toLowerCase();
  return /^[a-z0-9*.-]{1,253}$/.test(p) && /[a-z0-9]/.test(p) ? p : null;
};

const lensOf = (obj) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const sites = (list) =>
    Array.isArray(list)
      ? [
          ...new Set(
            list
              .filter((x) => typeof x === "string")
              .map((x) => x.toLowerCase())
              .filter((x) => SITE.test(x) && x.length <= 253),
          ),
        ].slice(0, 30)
      : [];
  const name =
    typeof obj.n === "string"
      ? obj.n.trim().replace(/\s+/g, " ").slice(0, 32)
      : "";
  const keywords =
    typeof obj.k === "string"
      ? obj.k
          .split(/\s+/)
          .filter((k) => /^-?[\p{L}\p{N}_.'+#-]{1,40}$/u.test(k))
          .slice(0, 10)
      : [];
  const lens = {
    n: name,
    i: sites(obj.i),
    x: sites(obj.x),
    k: keywords.join(" "),
    f: typeof obj.f === "string" && /^[a-z0-9]{1,8}$/.test(obj.f) ? obj.f : "",
  };
  if (!lens.n || !(lens.i.length || lens.x.length || lens.k || lens.f))
    return null;
  return lens;
};

export const parseLens = (raw) => {
  const lens = lensOf(decode(raw, 4000));
  if (!lens) return null;
  return {
    includeSites: lens.i,
    excludeSites: lens.x,
    includeKeywords: lens.k ? lens.k.split(" ") : [],
    ...(lens.f ? { filetype: lens.f } : {}),
  };
};

export function parseCfg(raw) {
  const obj = decode(raw, 24000);
  if (!obj) return null;

  const domains = {};
  if (obj.d && typeof obj.d === "object") {
    for (const [pattern, rule] of Object.entries(obj.d).slice(0, 300)) {
      const p = rulePattern(pattern);
      if (p && Object.hasOwn(RULES, rule)) domains[p] = RULES[rule];
    }
  }

  const lenses = Array.isArray(obj.c)
    ? obj.c.slice(0, 20).map(lensOf).filter(Boolean)
    : [];

  return {
    theme: obj.t === "amoled" ? "amoled" : "",
    mascot: MASCOTS.includes(obj.m) && obj.m !== "teto" ? obj.m : "",
    accent: /^#[0-9a-f]{6}$/i.test(obj.a) ? obj.a : "",
    engine: obj.e === "kagi" ? "kagi" : obj.e === "brave" ? "brave" : "",
    safe: SAFE.includes(obj.s) ? obj.s : "",
    linksOnly: obj.l === 1,
    newTab: obj.n === 1,
    highlight: obj.h !== 0,
    bold: obj.b !== 0,
    domains,
    lenses,
  };
}

export function cfgScript(cfg) {
  const json = JSON.stringify(cfg).replaceAll("<", "\\u003c");
  return `<script>try{const c=${json},L=localStorage,s=(k,v)=>v?L.setItem(k,v):L.removeItem(k),y="; path=/; max-age=31536000; samesite=lax";s("ms-theme",c.theme);s("ms-mascot",c.mascot);s("ms-accent",c.accent);s("ms-newtab",c.newTab?"1":"");s("ms-highlight",c.highlight?"":"0");s("ms-bold",c.bold?"":"0");s("ms-domains",Object.keys(c.domains).length?JSON.stringify(c.domains):"");s("ms-lenses",c.lenses.length?JSON.stringify(c.lenses):"");document.cookie=\`links_only=\${c.linksOnly?1:0}\${y}\`;if(c.engine)document.cookie=\`engine=\${c.engine}\${y}\`;document.cookie=c.safe?\`safesearch=\${c.safe}\${y}\`:"safesearch=; path=/; max-age=0"}catch{}</script>`;
}
