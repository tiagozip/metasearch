export const MASCOTS = ["teto", "spongebob", "gumi", "miku", "ralsei"];
export const SAFE = ["off", "moderate", "strict"];
export const TIMES = ["pd", "pw", "pm", "py"];

export const cookieSafe = (header) => {
  const v = /(?:^|;\s*)safesearch=(\w+)/.exec(header || "")?.[1];
  return SAFE.includes(v) ? v : undefined;
};
const RULES = { b: "block", r: "raise", l: "lower" };

export function parseCfg(raw) {
  if (!raw || typeof raw !== "string" || raw.length > 12000) return null;
  let obj;
  try {
    const b64 = raw.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    obj = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const domains = {};
  if (obj.d && typeof obj.d === "object") {
    for (const [host, rule] of Object.entries(obj.d).slice(0, 300)) {
      const h = host.toLowerCase();
      if (/^[a-z0-9.-]{1,253}$/.test(h) && Object.hasOwn(RULES, rule))
        domains[h] = RULES[rule];
    }
  }

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
  };
}

export function cfgScript(cfg) {
  const json = JSON.stringify(cfg).replaceAll("<", "\\u003c");
  return `<script>try{const c=${json},L=localStorage,s=(k,v)=>v?L.setItem(k,v):L.removeItem(k),y="; path=/; max-age=31536000; samesite=lax";s("ms-theme",c.theme);s("ms-mascot",c.mascot);s("ms-accent",c.accent);s("ms-newtab",c.newTab?"1":"");s("ms-highlight",c.highlight?"":"0");s("ms-bold",c.bold?"":"0");s("ms-domains",Object.keys(c.domains).length?JSON.stringify(c.domains):"");document.cookie=\`links_only=\${c.linksOnly?1:0}\${y}\`;if(c.engine)document.cookie=\`engine=\${c.engine}\${y}\`;document.cookie=c.safe?\`safesearch=\${c.safe}\${y}\`:"safesearch=; path=/; max-age=0"}catch{}</script>`;
}
