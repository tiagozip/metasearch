import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseKagiHtml } from "./kagi.js";

const fixture = readFileSync(
  new URL("../../../kagibot/fixtures/search.html", import.meta.url),
  "utf8",
);

test("shipped kagi engine parseKagiHtml extracts title url snippet", () => {
  const results = parseKagiHtml(fixture);
  expect(results.length).toBeGreaterThanOrEqual(1);
  for (const r of results) {
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.url).toMatch(/^https?:\/\//);
    expect(typeof r.snippet).toBe("string");
    expect(r.snippet.length).toBeGreaterThan(0);
  }
});
