import { expect, test } from "bun:test";
import { cfgScript, parseCfg } from "./prefs.js";

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
      },
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
    domains: { "pinterest.com": "block", "github.com": "raise" },
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
