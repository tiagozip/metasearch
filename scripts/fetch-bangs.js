import { writeFileSync } from "node:fs";

const resp = await fetch("https://files.helium.computer/bangs.json");
const text = await resp.text();
const json = JSON.parse(
  text
    .replace(/^\/\/.*$/gm, "")
    .replace(/,(\s*])/g, "$1")
    .replace(/,(\s*})/g, "$1"),
);

const bangs = {};
for (const b of json) {
  for (const ts of b.ts) {
    bangs[ts] = b.u.replace("{searchTerms}", "%s");
  }
}

writeFileSync(
  new URL("../src/bangs-data.json", import.meta.url),
  JSON.stringify(bangs),
);

console.log(`Wrote ${Object.keys(bangs).length} bangs to src/bangs-data.json`);
