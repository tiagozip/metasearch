import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import checkBang from "./bangs.js";
import { parseQuery, resolveSearchPage } from "./query.js";

test("parseQuery uses existing bangs.js checkBang for external bangs", () => {
  const q = "!r han shot first";
  expect(checkBang(q)).toBe(
    "https://www.reddit.com/search?q=han%20shot%20first",
  );
  expect(parseQuery(q).redirectUrl).toBe(checkBang(q));
  expect(parseQuery("han shot first !r").redirectUrl).toBe(
    checkBang("han shot first !r"),
  );
});

test("backslash and trailing bang set first-result", () => {
  const slash = parseQuery("\\foo");
  expect(slash.firstResult).toBe(true);
  expect(slash.query).toBe("foo");
  expect(slash.redirectUrl).toBeUndefined();

  const trail = parseQuery("foo !");
  expect(trail.firstResult).toBe(true);
  expect(trail.query).toBe("foo");

  const lead = parseQuery("! foo");
  expect(lead.firstResult).toBe(true);
  expect(lead.query).toBe("foo");
});

test("internal tab bangs !i !n !m !v !k do not redirect", () => {
  expect(parseQuery("!i webb telescope").tab).toBe("images");
  expect(parseQuery("!i webb telescope").query).toBe("webb telescope");
  expect(parseQuery("!i webb telescope").redirectUrl).toBeUndefined();
  expect(parseQuery("!n apple").tab).toBe("news");
  expect(parseQuery("!m eiffel tower").tab).toBe("maps");
  expect(parseQuery("!v emmanuel don't do it").tab).toBe("videos");
  expect(parseQuery("!k benefits of ice baths").tab).toBe("web");
  expect(parseQuery("!k benefits of ice baths").redirectUrl).toBeUndefined();
});

test("resolveSearchPage maps tab bangs to pageType for GET / jwt", () => {
  expect(resolveSearchPage("!i webb telescope").pageType).toBe("images");
  expect(resolveSearchPage("!n apple").pageType).toBe("news");
  expect(resolveSearchPage("!m eiffel tower").pageType).toBe("maps");
  expect(resolveSearchPage("!k benefits of ice baths", "images").pageType).toBe(
    "web",
  );
  expect(resolveSearchPage("cats", "news").pageType).toBe("news");
  expect(resolveSearchPage("!i cats", "news").pageType).toBe("images");
});

test("GET / signs jwt with pageType not raw type", () => {
  const src = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  expect(src).toMatch(
    /sign\(\{\s*s:\s*qSafe,\s*t:\s*pageType\s*\|\|\s*type\s*\}/,
  );
  expect(src).not.toMatch(/sign\(\{\s*s:\s*qSafe,\s*t:\s*type\s*\}/);
});

test("forums lens adds include sites to engine query", () => {
  const parsed = parseQuery("rust async", { lens: "forums" });
  expect(parsed.lens.includeSites).toContain("reddit.com");
  expect(parsed.lens.includeSites).toContain("news.ycombinator.com");
  expect(parsed.engineQuery).toContain("site:reddit.com");
  expect(parsed.engineQuery).toContain("OR");
  expect(parsed.query).toBe("rust async");
});

test("pdfs lens forwards filetype:pdf", () => {
  const parsed = parseQuery("us census 1860", { lens: "pdfs" });
  expect(parsed.engineQuery).toContain("filetype:pdf");
  expect(parsed.lens.filetype).toBe("pdf");
});

test("site, minus, and quoted phrase survive as structured query state", () => {
  const parsed = parseQuery(
    'best in show dog site:akc.org -dog "exact phrase"',
  );
  expect(parsed.operators.site).toEqual(["akc.org"]);
  expect(parsed.operators.exclude).toEqual(["dog"]);
  expect(parsed.operators.quotes).toEqual(["exact phrase"]);
  expect(parsed.engineQuery).toContain("site:akc.org");
  expect(parsed.engineQuery).toContain("-dog");
  expect(parsed.engineQuery).toContain('"exact phrase"');
});

test("filetype intitle inurl and plus operators are forwarded", () => {
  const parsed = parseQuery(
    "us census 1860 filetype:pdf chess intitle:books best headphones inurl:forum food +cat",
  );
  expect(parsed.operators.filetype).toEqual(["pdf"]);
  expect(parsed.operators.intitle).toEqual(["books"]);
  expect(parsed.operators.inurl).toEqual(["forum"]);
  expect(parsed.operators.include).toEqual(["cat"]);
  expect(parsed.engineQuery).toContain("filetype:pdf");
  expect(parsed.engineQuery).toContain("intitle:books");
  expect(parsed.engineQuery).toContain("inurl:forum");
  expect(parsed.engineQuery).toContain("+cat");
});

test("custom lens include/exclude sites and keywords", () => {
  const parsed = parseQuery("movie reviews", {
    lens: {
      includeSites: ["rottentomatoes.com"],
      excludeSites: ["pinterest.com"],
      includeKeywords: ["review"],
      excludeKeywords: ["spam"],
    },
  });
  expect(parsed.engineQuery).toContain("site:rottentomatoes.com");
  expect(parsed.engineQuery).toContain("-site:pinterest.com");
  expect(parsed.engineQuery).toContain("review");
  expect(parsed.engineQuery).toContain("-spam");
});
