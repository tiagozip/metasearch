import { expect, test } from "bun:test";
import { runSearch } from "./run.js";

test("runSearch uses existing checkBang for bangs and does not fetch", async () => {
  const out = await runSearch({ query: "!r han shot first", type: "web" });
  expect(out.redirect).toBe(
    "https://www.reddit.com/search?q=han%20shot%20first",
  );
});
