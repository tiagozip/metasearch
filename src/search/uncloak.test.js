import { expect, test } from "bun:test";
import { destinationOf } from "./uncloak.js";

test("destinationOf reads the real link from brave's redirect page", () => {
  const html =
    '<p>sending you to <strong class="host svelte-1">x.com</strong>: <a class="destination svelte-12edz7s" href="https://www.merriam-webster.com/dictionary/hi?a=1&amp;b=2">https://www.merriam-webster.com/dictionary/hi</a></p>';
  expect(destinationOf(html)).toBe(
    "https://www.merriam-webster.com/dictionary/hi?a=1&b=2",
  );
});

test("destinationOf rejects non-http destinations and missing links", () => {
  expect(
    destinationOf('<a class="destination" href="javascript:alert(1)">'),
  ).toBe(null);
  expect(destinationOf("<p>nothing here</p>")).toBe(null);
});
