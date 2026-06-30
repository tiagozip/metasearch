export const CURRENCIES = {
  USD: {
    name: "US dollar",
    symbol: "$",
    aliases: [
      "dollar",
      "dollars",
      "buck",
      "bucks",
      "usd",
      "us dollar",
      "american dollar",
    ],
  },
  EUR: { name: "euro", symbol: "€", aliases: ["euro", "euros"] },
  GBP: {
    name: "British pound",
    symbol: "£",
    aliases: ["pound", "pounds", "quid", "sterling", "british pound"],
  },
  JPY: { name: "Japanese yen", symbol: "¥", aliases: ["yen", "japanese yen"] },
  CNY: {
    name: "Chinese yuan",
    symbol: "¥",
    aliases: ["yuan", "renminbi", "rmb", "chinese yuan"],
  },
  AUD: {
    name: "Australian dollar",
    symbol: "A$",
    aliases: ["aussie dollar", "australian dollar"],
  },
  CAD: {
    name: "Canadian dollar",
    symbol: "C$",
    aliases: ["loonie", "canadian dollar"],
  },
  CHF: { name: "Swiss franc", aliases: ["franc", "swiss franc"] },
  HKD: { name: "Hong Kong dollar", aliases: ["hong kong dollar"] },
  SGD: { name: "Singapore dollar", aliases: ["singapore dollar"] },
  NZD: {
    name: "New Zealand dollar",
    aliases: ["kiwi dollar", "new zealand dollar"],
  },
  INR: {
    name: "Indian rupee",
    symbol: "₹",
    aliases: ["rupee", "rupees", "indian rupee"],
  },
  KRW: {
    name: "South Korean won",
    symbol: "₩",
    aliases: ["won", "korean won"],
  },
  MXN: { name: "Mexican peso", aliases: ["mexican peso"] },
  BRL: { name: "Brazilian real", aliases: ["real", "reais", "brazilian real"] },
  ZAR: { name: "South African rand", aliases: ["rand", "south african rand"] },
  RUB: {
    name: "Russian ruble",
    symbol: "₽",
    aliases: ["ruble", "rouble", "russian ruble"],
  },
  TRY: { name: "Turkish lira", symbol: "₺", aliases: ["lira", "turkish lira"] },
  SEK: { name: "Swedish krona", aliases: ["swedish krona"] },
  NOK: { name: "Norwegian krone", aliases: ["norwegian krone"] },
  DKK: { name: "Danish krone", aliases: ["danish krone"] },
  PLN: { name: "Polish zloty", aliases: ["zloty", "polish zloty"] },
  THB: { name: "Thai baht", symbol: "฿", aliases: ["baht", "thai baht"] },
  IDR: { name: "Indonesian rupiah", aliases: ["rupiah", "indonesian rupiah"] },
  HUF: { name: "Hungarian forint", aliases: ["forint", "hungarian forint"] },
  CZK: { name: "Czech koruna", aliases: ["koruna", "czech koruna"] },
  ILS: {
    name: "Israeli shekel",
    symbol: "₪",
    aliases: ["shekel", "israeli shekel"],
  },
  CLP: { name: "Chilean peso", aliases: ["chilean peso"] },
  PHP: {
    name: "Philippine peso",
    aliases: ["philippine peso", "filipino peso"],
  },
  AED: {
    name: "UAE dirham",
    aliases: ["dirham", "uae dirham", "emirati dirham"],
  },
  COP: { name: "Colombian peso", aliases: ["colombian peso"] },
  SAR: { name: "Saudi riyal", aliases: ["riyal", "rial", "saudi riyal"] },
  MYR: { name: "Malaysian ringgit", aliases: ["ringgit", "malaysian ringgit"] },
  RON: { name: "Romanian leu", aliases: ["leu", "romanian leu"] },
  ARS: { name: "Argentine peso", aliases: ["argentine peso"] },
  VND: {
    name: "Vietnamese dong",
    symbol: "₫",
    aliases: ["dong", "vietnamese dong"],
  },
  NGN: {
    name: "Nigerian naira",
    symbol: "₦",
    aliases: ["naira", "nigerian naira"],
  },
  EGP: { name: "Egyptian pound", aliases: ["egyptian pound"] },
  PKR: { name: "Pakistani rupee", aliases: ["pakistani rupee"] },
  BDT: {
    name: "Bangladeshi taka",
    symbol: "৳",
    aliases: ["taka", "bangladeshi taka"],
  },
  UAH: {
    name: "Ukrainian hryvnia",
    symbol: "₴",
    aliases: ["hryvnia", "ukrainian hryvnia"],
  },
  TWD: {
    name: "Taiwan dollar",
    aliases: ["taiwan dollar", "new taiwan dollar"],
  },
  KES: { name: "Kenyan shilling", aliases: ["kenyan shilling"] },
  QAR: { name: "Qatari riyal", aliases: ["qatari riyal"] },
  KWD: { name: "Kuwaiti dinar", aliases: ["dinar", "kuwaiti dinar"] },
  BHD: { name: "Bahraini dinar", aliases: ["bahraini dinar"] },
  ISK: { name: "Icelandic krona", aliases: ["icelandic krona"] },
  LKR: { name: "Sri Lankan rupee", aliases: ["sri lankan rupee"] },
  GHS: { name: "Ghanaian cedi", aliases: ["cedi", "ghanaian cedi"] },
};

export const PRIORITY = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "AUD",
  "CAD",
  "CHF",
  "HKD",
  "SGD",
  "NZD",
  "INR",
  "KRW",
  "MXN",
  "BRL",
  "ZAR",
  "RUB",
  "TRY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "THB",
  "IDR",
];

const SYMBOLS = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "₽": "RUB",
  "₺": "TRY",
  "₪": "ILS",
  "฿": "THB",
  "₫": "VND",
  "₦": "NGN",
  "₴": "UAH",
  "৳": "BDT",
};

const CODES = new Set(Object.keys(CURRENCIES));

const aliasMap = {};
for (const [code, info] of Object.entries(CURRENCIES)) {
  aliasMap[code.toLowerCase()] = code;
  if (info.name) aliasMap[info.name.toLowerCase()] = code;
  for (const a of info.aliases || []) aliasMap[a] = code;
}

const fuzzyTargets = [];
for (const [code, info] of Object.entries(CURRENCIES)) {
  fuzzyTargets.push({ key: code.toLowerCase(), code });
  for (const a of info.aliases || [])
    if (!a.includes(" ")) fuzzyTargets.push({ key: a, code });
}

const CONNECTORS = new Set([
  "to",
  "in",
  "into",
  "as",
  "vs",
  "=",
  "->",
  "→",
  "convert",
  "converted",
  "conv",
  "exchange",
  "worth",
  "equals",
  "equal",
  "of",
  "is",
  "how",
  "much",
  "many",
  "a",
  "an",
  "the",
  "please",
  "whats",
  "what",
  "are",
  "for",
]);

const within1 = (a, b) => {
  if (a === b) return true;
  const la = a.length,
    lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let diff = 0;
    for (let i = 0; i < la; i++) if (a[i] !== b[i] && ++diff > 1) return false;
    return diff === 1;
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0,
    j = 0,
    skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i++;
      j++;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    j++;
  }
  return true;
};

const exactCurrency = (tok) => {
  const up = tok.toUpperCase();
  if (CODES.has(up)) return up;
  return aliasMap[tok] || null;
};

const fuzzyCurrency = (tok) => {
  if (tok.length < 2) return null;
  let best = null,
    bestRank = Infinity;
  for (const { key, code } of fuzzyTargets) {
    if (Math.abs(key.length - tok.length) > 1) continue;
    if (!within1(tok, key)) continue;
    const rank = PRIORITY.indexOf(code);
    const rr = rank === -1 ? 999 : rank;
    if (rr < bestRank) {
      bestRank = rr;
      best = code;
    }
  }
  return best;
};

const fuzzyConnector = (tok) => {
  for (const c of CONNECTORS) if (c.length >= 2 && within1(tok, c)) return true;
  return false;
};

export function parseCurrencyQuery(query) {
  let t = (query || "").trim().toLowerCase();
  if (!t || t.length > 60) return null;

  t = t.replace(/[$€£¥₹₩₽₺₪฿₫₦₴৳]/g, (s) => ` ${SYMBOLS[s]} `);
  t = t.replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2");

  const tokens = t.split(/[\s]+/).filter(Boolean);
  let amount = null;
  const words = [];
  for (const tok of tokens) {
    if (amount == null && /^\d[\d,]*\.?\d*$/.test(tok)) {
      amount = parseFloat(tok.replace(/,/g, ""));
      continue;
    }
    words.push(tok);
  }

  let sawConnector = false;
  const found = [];
  const strong = amount != null;
  let i = 0;
  while (i < words.length) {
    const two = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : null;
    if (two && aliasMap[two]) {
      found.push(aliasMap[two]);
      i += 2;
      continue;
    }

    const ex = exactCurrency(words[i]);
    if (ex) {
      found.push(ex);
      i++;
      continue;
    }

    if (CONNECTORS.has(words[i])) {
      sawConnector = true;
      i++;
      continue;
    }

    if (strong && fuzzyConnector(words[i])) {
      sawConnector = true;
      i++;
      continue;
    }

    const fz = strong ? fuzzyCurrency(words[i]) : null;
    if (fz) {
      found.push(fz);
      i++;
      continue;
    }

    return null;
  }

  if (!found.length) return null;
  if (found.length === 1) {
    if (amount == null && !sawConnector) return null;
    const from = found[0];
    const to = from === "USD" ? "EUR" : "USD";
    return { amount: amount ?? 1, from, to };
  }

  const from = found[0];
  let to = found[1];
  if (from === to) to = from === "USD" ? "EUR" : "USD";
  return { amount: amount ?? 1, from, to };
}

export function currencyLabel(code) {
  const info = CURRENCIES[code];
  return info ? `${code} · ${info.name}` : code;
}

export function sortCodes(codes) {
  const set = new Set(codes);
  const head = PRIORITY.filter((c) => set.has(c));
  const rest = codes.filter((c) => !PRIORITY.includes(c)).sort();
  return [...head, ...rest];
}
