import { expect, test } from "bun:test";
import { cfgScript, parseCfg, parseLens, rulePattern } from "./prefs.js";

const enc = (o) =>
  btoa(JSON.stringify(o))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

test("parseCfg keeps valid settings and drops the rest", () => {
  const cfg = parseCfg(
    enc({
      t: "amoled",
      m: "miku",
      a: "#ff00aa",
      e: "kagi",
      s: "strict",
      l: 1,
      n: 1,
      h: 0,
      b: 0,
      d: {
        "Pinterest.com": "b",
        "x.com": "toString",
        "<script>": "b",
        "github.com": "r",
        "pinterest.*": "b",
        "/reddit\\.com\\/r\\/funny/": "l",
        "/(unclosed/": "b",
        "*": "b",
      },
      c: [{ n: "docs", i: ["MDN.dev", "bad site"], k: "api" }, { n: "empty" }],
    }),
  );
  expect(cfg).toEqual({
    theme: "amoled",
    mascot: "miku",
    accent: "#ff00aa",
    engine: "kagi",
    safe: "strict",
    linksOnly: true,
    newTab: true,
    highlight: false,
    bold: false,
    domains: {
      "pinterest.com": "block",
      "github.com": "raise",
      "pinterest.*": "block",
      "/reddit\\.com\\/r\\/funny/": "lower",
    },
    lenses: [{ n: "docs", i: ["mdn.dev"], x: [], k: "api", f: "" }],
  });
  expect(parseCfg(enc({ m: "evil", a: "red", e: "google" }))).toMatchObject({
    mascot: "",
    accent: "",
    engine: "",
    safe: "",
    highlight: true,
    bold: true,
  });
  expect(parseCfg("not base64!")).toBeNull();
  expect(parseCfg(enc([1]))).toBeNull();
});

test("cfgScript escapes closing tags", () => {
  const s = cfgScript({ ...parseCfg(enc({})), mascot: "</script>" });
  expect(s.slice(8, -9)).not.toContain("</script>");
});

test("rulePattern accepts domains, wildcards and regexes", () => {
  expect(rulePattern("Pinterest.*")).toBe("pinterest.*");
  expect(rulePattern("/Foo\\d+/")).toBe("/Foo\\d+/");
  expect(rulePattern("/[/")).toBeNull();
  expect(rulePattern("**")).toBeNull();
  expect(rulePattern("a b.com")).toBeNull();
});

test("parseLens builds an engine lens from a link", () => {
  expect(
    parseLens(
      enc({
        n: "forums",
        i: ["lobste.rs"],
        x: ["reddit.com"],
        k: "rust -js",
        f: "pdf",
      }),
    ),
  ).toEqual({
    includeSites: ["lobste.rs"],
    excludeSites: ["reddit.com"],
    includeKeywords: ["rust", "-js"],
    filetype: "pdf",
  });
  expect(parseLens(enc({ n: "nothing" }))).toBeNull();
  expect(parseLens(enc({ i: ["a.com"] }))).toBeNull();
  expect(parseLens("garbage")).toBeNull();
});
