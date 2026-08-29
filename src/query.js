import checkBang from "./bangs.js";

export const TAB_BANGS = {
  i: "images",
  n: "news",
  m: "maps",
  v: "videos",
  k: "web",
};

export const LENSES = {
  forums: {
    includeSites: [
      "reddit.com",
      "news.ycombinator.com",
      "stackoverflow.com",
      "stackexchange.com",
      "quora.com",
      "lemmy.world",
      "kbin.social",
      "discourse.org",
    ],
  },
  pdfs: {
    filetype: "pdf",
  },
};

function resolveLens(lens) {
  if (!lens) return null;
  if (typeof lens === "string") {
    return LENSES[lens.toLowerCase()] || null;
  }
  if (typeof lens === "object") return lens;
  return null;
}

function stripFirstResult(raw) {
  let q = String(raw || "").trim();
  let firstResult = false;
  if (q.startsWith("\\")) {
    firstResult = true;
    q = q.slice(1).trim();
  }
  if (q.startsWith("! ")) {
    firstResult = true;
    q = q.slice(2).trim();
  }
  if (/(?:^|\s)!$/.test(q)) {
    firstResult = true;
    q = q.replace(/(?:^|\s)!$/, "").trim();
  }
  return { q, firstResult };
}

function takeTabBang(q) {
  const tokens = q.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let name = null;
    if (t[0] === "!" && t.length > 1) name = t.slice(1).toLowerCase();
    else if (t.endsWith("!") && t.length > 1)
      name = t.slice(0, -1).toLowerCase();
    if (!name || !TAB_BANGS[name]) continue;
    const rest = [...tokens.slice(0, i), ...tokens.slice(i + 1)]
      .join(" ")
      .trim();
    return { q: rest, tab: TAB_BANGS[name] };
  }
}

function parseOperators(raw) {
  const operators = {
    site: [],
    filetype: [],
    intitle: [],
    inurl: [],
    quotes: [],
    include: [],
    exclude: [],
  };
  let rest = String(raw || "");
  rest = rest.replace(
    /\b(site|filetype|intitle|inurl):"([^"]*)"/gi,
    (_, op, val) => {
      if (val) operators[op.toLowerCase()].push(val);
      return " ";
    },
  );
  rest = rest.replace(
    /\b(site|filetype|intitle|inurl):(\S+)/gi,
    (_, op, val) => {
      if (val) operators[op.toLowerCase()].push(val);
      return " ";
    },
  );
  rest = rest.replace(/"([^"]*)"/g, (_, q) => {
    if (q) operators.quotes.push(q);
    return " ";
  });
  const terms = [];
  for (const word of rest.split(/\s+/).filter(Boolean)) {
    if (word.length > 1 && word.startsWith("+")) {
      operators.include.push(word.slice(1));
      continue;
    }
    if (word.length > 1 && word.startsWith("-")) {
      operators.exclude.push(word.slice(1));
      continue;
    }
    terms.push(word);
  }
  return { terms, operators };
}

function buildEngineQuery(terms, operators, lens) {
  const parts = [];
  for (const q of operators.quotes) parts.push(`"${q}"`);
  parts.push(...terms);
  for (const t of operators.include) parts.push(`+${t}`);
  for (const t of operators.exclude) parts.push(`-${t}`);
  for (const s of operators.site) parts.push(`site:${s}`);
  for (const f of operators.filetype) parts.push(`filetype:${f}`);
  for (const t of operators.intitle) parts.push(`intitle:${t}`);
  for (const u of operators.inurl) parts.push(`inurl:${u}`);

  const includeSites = lens?.includeSites || [];
  const excludeSites = lens?.excludeSites || [];
  const includeKeywords = lens?.includeKeywords || [];
  const excludeKeywords = lens?.excludeKeywords || [];
  const filetype = lens?.filetype;

  const extraSites = includeSites.filter((s) => !operators.site.includes(s));
  if (extraSites.length === 1) parts.push(`site:${extraSites[0]}`);
  else if (extraSites.length > 1) {
    parts.push(`(${extraSites.map((s) => `site:${s}`).join(" OR ")})`);
  }
  for (const s of excludeSites) parts.push(`-site:${s}`);
  for (const k of includeKeywords) parts.push(k);
  for (const k of excludeKeywords) parts.push(`-${k}`);
  if (filetype && !operators.filetype.includes(filetype)) {
    parts.push(`filetype:${filetype}`);
  }

  return parts.join(" ").trim();
}

const emptyOperators = () => ({
  site: [],
  filetype: [],
  intitle: [],
  inurl: [],
  quotes: [],
  include: [],
  exclude: [],
});

export function parseQuery(input, { lens } = {}) {
  const original = String(input || "")
    .replaceAll("\n", " ")
    .trim();
  const lucky = stripFirstResult(original);
  const tabbed = takeTabBang(lucky.q);
  const resolved = resolveLens(lens);

  if (tabbed) {
    const { terms, operators } = parseOperators(tabbed.q);
    const query = [...operators.quotes.map((q) => `"${q}"`), ...terms]
      .join(" ")
      .trim();
    return {
      original,
      query: query || tabbed.q,
      engineQuery: buildEngineQuery(terms, operators, resolved),
      firstResult: lucky.firstResult,
      tab: tabbed.tab,
      redirectUrl: undefined,
      operators,
      lens: resolved,
    };
  }

  const redirectUrl = checkBang(lucky.q);
  if (redirectUrl) {
    return {
      original,
      query: lucky.q,
      engineQuery: lucky.q,
      firstResult: lucky.firstResult,
      tab: null,
      redirectUrl,
      operators: emptyOperators(),
      lens: resolved,
    };
  }

  const { terms, operators } = parseOperators(lucky.q);
  const query = [...operators.quotes.map((q) => `"${q}"`), ...terms]
    .join(" ")
    .trim();
  return {
    original,
    query: query || lucky.q,
    engineQuery: buildEngineQuery(terms, operators, resolved),
    firstResult: lucky.firstResult,
    tab: null,
    redirectUrl: undefined,
    operators,
    lens: resolved,
  };
}

export function resolveSearchPage(query, type) {
  const parsed = parseQuery(query || "");
  let pageType = type;
  if (parsed.tab && parsed.tab !== "videos") pageType = parsed.tab;
  return {
    pageType,
    redirectUrl: parsed.redirectUrl,
    firstResult: parsed.firstResult,
    parsed,
  };
}
