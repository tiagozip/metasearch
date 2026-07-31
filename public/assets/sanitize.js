// biome-ignore-all lint/correctness/noUnusedVariables: consumed by the result
// bundles after src/templates.js inlines this file at the injection marker, so
// every export-shaped binding looks unused from inside this file alone.

/*
 * shared client-side sanitizer for third-party content.
 *
 * search results are attacker-influenced: descriptions, stackoverflow answers,
 * schema.org faq blocks, wikidata infobox rows and openstreetmap tags are all
 * authored by whoever controls the indexed page. everything that reaches the
 * dom from an upstream engine goes through here.
 *
 * inlined into the result bundles by src/templates.js at the /**sanitize**\/
 * marker, so web/news/images/maps share one copy regardless of whether the
 * bundle is loaded as a module or as a classic script.
 */

// only http(s) survive. everything else -- javascript:, data:, blob:, vbscript:,
// relative, malformed -- collapses to "#".
const safeUrl = (url) => {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {}
  return "#";
};

// phone numbers land in a tel: href, which safeUrl rejects by design. validate
// the whole value rather than filtering it -- a partially stripped string is a
// wrong phone number, not a safe one. "" means "do not render a link".
const safeTel = (value) => {
  const raw = String(value ?? "").trim();
  return /^\+?[0-9(][0-9()\-.\s]{2,30}$/.test(raw) ? `tel:${raw}` : "";
};

// kept, as empty elements -- no attribute is ever carried over from the source
const SANITIZE_KEEP = new Set([
  "A",
  "ABBR",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CAPTION",
  "CITE",
  "CODE",
  "DD",
  "DEL",
  "DFN",
  "DIV",
  "DL",
  "DT",
  "EM",
  "FIGCAPTION",
  "FIGURE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "I",
  "IMG",
  "INS",
  "KBD",
  "LI",
  "MARK",
  "OL",
  "P",
  "PRE",
  "Q",
  "S",
  "SAMP",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "U",
  "UL",
  "VAR",
  "WBR",
]);

// dropped together with their entire subtree. anything not listed here and not
// in SANITIZE_KEEP is unwrapped instead, so its text survives.
const SANITIZE_DROP = new Set([
  "APPLET",
  "AREA",
  "AUDIO",
  "BASE",
  "BUTTON",
  "CANVAS",
  "DIALOG",
  "EMBED",
  "FIELDSET",
  "FORM",
  "FRAME",
  "FRAMESET",
  "HEAD",
  "IFRAME",
  "INPUT",
  "LABEL",
  "LINK",
  "MAP",
  "MARQUEE",
  "MATH",
  "META",
  "NOSCRIPT",
  "OBJECT",
  "OPTION",
  "PICTURE",
  "PORTAL",
  "SCRIPT",
  "SELECT",
  "SLOT",
  "SOURCE",
  "STYLE",
  "SVG",
  "TEMPLATE",
  "TEXTAREA",
  "TITLE",
  "TRACK",
  "VIDEO",
]);

/*
 * parse untrusted html and rebuild it from scratch as a live fragment.
 *
 * two properties make this safe:
 *  - DOMParser builds an inert document: no script runs, no subresource loads.
 *  - every surviving element is created fresh via createElement and receives
 *    only the attributes explicitly set below, so on* handlers, style, srcset,
 *    formaction and friends cannot survive at all.
 *
 * the result is spliced into the page as nodes and never re-serialised back
 * through innerHTML, which is what rules out mutation xss.
 */
const sanitizeFragment = (html) => {
  const frag = document.createDocumentFragment();
  const source = html == null ? "" : String(html);
  if (!source) return frag;

  const doc = new DOMParser().parseFromString(source, "text/html");

  const walk = (from, into) => {
    for (const node of from.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.data) into.append(node.data);
        continue;
      }
      // comments and processing instructions carry no visible content
      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      // tagName preserves case for foreign content (svg, math), so normalise
      const tag = node.tagName.toUpperCase();
      if (SANITIZE_DROP.has(tag)) continue;
      if (!SANITIZE_KEEP.has(tag)) {
        walk(node, into);
        continue;
      }

      if (tag === "IMG") {
        const src = safeUrl(node.getAttribute("src"));
        if (src === "#") continue;
        const img = document.createElement("img");
        img.setAttribute("src", src);
        img.setAttribute("alt", node.getAttribute("alt") || "");
        img.setAttribute("loading", "lazy");
        img.setAttribute("decoding", "async");
        img.setAttribute("referrerpolicy", "no-referrer");
        into.append(img);
        continue;
      }

      const el = document.createElement(tag.toLowerCase());
      if (tag === "A") {
        const href = safeUrl(node.getAttribute("href"));
        // an anchor without href degrades to inline text, which is the point
        if (href !== "#") {
          el.setAttribute("href", href);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener nofollow ugc");
        }
      }
      walk(node, el);
      into.append(el);
    }
  };

  walk(doc.body, frag);
  return frag;
};

// drop-in replacement for `el.innerHTML = untrusted`
const setSafeHtml = (el, html) => {
  el.replaceChildren(sanitizeFragment(html));
};
