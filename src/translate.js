const ENDPOINT = "https://translate-pa.googleapis.com/v1/translateHtml";
const API_KEY = "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520";

const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;

export const isValidLang = (code, allowAuto = false) => {
  if (typeof code !== "string") return false;
  if (code === "auto") return allowAuto;
  return LANG_RE.test(code);
};

const escapeHtml = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br>");

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const unescapeHtml = (s) =>
  s
    .replace(/<br\s*\/?>\s?/gi, "\n")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, ref) => {
      if (ref[0] === "#") {
        const cp =
          ref[1] === "x" || ref[1] === "X"
            ? parseInt(ref.slice(2), 16)
            : parseInt(ref.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      return NAMED[ref.toLowerCase()] ?? m;
    });

export async function enrichTranslation(text, sourceLang, targetLang) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: sourceLang || "auto",
    tl: targetLang,
    hl: "en",
    q: text,
  });
  for (const dt of ["t", "rm", "at", "qca"]) params.append("dt", dt);

  const resp = await fetch(
    `https://translate.googleapis.com/translate_a/single?${params}`,
  );
  if (!resp.ok) throw new Error(`gtx returned ${resp.status}`);
  const data = await resp.json();

  let transliteration = "";
  let srcTransliteration = "";
  let gtxTranslation = "";
  for (const s of data?.[0] || []) {
    if (typeof s?.[0] === "string") gtxTranslation += s[0];
    if (typeof s?.[2] === "string") transliteration += s[2];
    if (typeof s?.[3] === "string") srcTransliteration += s[3];
  }

  const alternatives = [];
  if (Array.isArray(data?.[5]) && data[5].length === 1)
    for (const alt of data[5][0]?.[2] || [])
      if (typeof alt?.[0] === "string") alternatives.push(alt[0]);

  const didYouMean =
    typeof data?.[7]?.[1] === "string" &&
    data[7][1].toLowerCase() !== text.toLowerCase()
      ? data[7][1]
      : null;

  return {
    transliteration: transliteration.trim(),
    srcTransliteration: srcTransliteration.trim(),
    gtxTranslation: gtxTranslation.trim(),
    alternatives,
    didYouMean,
    detected: typeof data?.[2] === "string" ? data[2] : null,
  };
}

export async function transliterate(text, lang) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: lang,
    tl: "en",
    dt: "rm",
    q: text,
  });
  const resp = await fetch(
    `https://translate.googleapis.com/translate_a/single?${params}`,
  );
  if (!resp.ok) throw new Error(`gtx returned ${resp.status}`);
  const data = await resp.json();
  let out = "";
  for (const s of data?.[0] || []) if (typeof s?.[3] === "string") out += s[3];
  return out.trim();
}

export async function translateBatch(texts, sourceLang, targetLang) {
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json+protobuf",
      "x-goog-api-key": API_KEY,
    },
    body: JSON.stringify([
      [texts.map(escapeHtml), sourceLang || "auto", targetLang],
      "te_lib",
    ]),
  });

  if (!resp.ok) throw new Error(`upstream returned ${resp.status}`);

  const data = await resp.json();
  if (!Array.isArray(data) || !Array.isArray(data[0]))
    throw new Error("unexpected upstream response");

  return {
    texts: data[0].map((t) => unescapeHtml(String(t ?? ""))),
    detected: Array.isArray(data[1]) ? data[1] : [],
  };
}
