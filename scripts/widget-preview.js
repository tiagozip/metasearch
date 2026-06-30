import { file } from "bun";

const ROOT = new URL("../public/", import.meta.url).pathname;

const QUERIES = [
  "qr code https://search.tiago.zip",
  "password generator",
  "uuid",
  "lorem ipsum",
  "flip a coin",
  "roll 2d20",
  "random number 1 to 100",
  "magic 8 ball",
  "pick between pizza, sushi, tacos",
  "base64 encode hello world",
  "hello to morse",
  "nato phonetic claude",
  "text to binary hi",
  "#89b4fa",
  "random color",
  "contrast checker",
  "css gradient",
  "calculator",
  "bmi calculator",
  "tip calculator",
  "loan calculator",
  "25% of 200",
  "aspect ratio",
  "255 to binary",
  "2024 to roman",
  "factor 360",
  "mean of 4 8 15 16 23 42",
  "age from 1995-06-15",
  "days until 2027-01-01",
  "unix timestamp 1700000000",
  "world clock",
  "pomodoro",
  "new year countdown",
  "box breathing",
  "word counter",
  "bpm tapper",
  "metronome",
  "440hz",
  "white noise",
  "piano",
  "drum machine",
  "melody generator",
  "reaction time",
  "tic tac toe",
  "rock paper scissors",
  "typing test",
  "json formatter",
  "jwt decoder",
  "sha256 hash hello",
  "my user agent",
  "screen resolution",
  "regex tester",
  "markdown preview",
  "ascii table",
  "char info ✓",
  "emoji search",
  "emoji heart",
  "kaomoji",
  "cron */15 9-17 * * 1-5",
  "sorting visualizer",
  "snake",
  "2048",
  "guitar chord Am",
  "chord Cmaj7",
  "text diff",
  "number to words 1234567",
  "http 404",
  "chmod 755",
  "caesar cipher 3 hello world",
  "leetspeak elite hacker",
  "subnet 192.168.1.0/24",
  "sleep calculator",
  "translate good morning to japanese",
  "hello in french",
  "4.49 aud to usd",
  "4.49 aud tou sd",
  "100 usd in eur",
  "50 euros to pounds",
  "$20 to jpy",
  "250 thb to inr",
];

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/search.css">
<style>
  body { background: var(--bg); color: var(--text); margin: 0; padding: 24px; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; align-items: start; }
  .cell { }
  .cell > h4 { font-size: 0.75rem; color: var(--muted); margin: 0 0 6px; font-family: ui-monospace, monospace; }
  .miss { color: #f38ba8; font-size: 0.8rem; }
</style></head><body>
<h2 style="font-weight:600">local widgets gallery</h2>
<div class="gallery" id="g"></div>
<script type="module">
import { renderLocalWidgets, __widgetCount } from "/s/widgets.js";
const queries = ${JSON.stringify(QUERIES)};
const g = document.getElementById("g");
let hits = 0;
for (const q of queries) {
  const cell = document.createElement("div");
  cell.className = "cell";
  const label = document.createElement("h4");
  label.textContent = q;
  cell.append(label);
  const w = renderLocalWidgets(q);
  if (w) { cell.append(w); hits++; }
  else { const m = document.createElement("div"); m.className = "miss"; m.textContent = "NO MATCH"; cell.append(m); }
  g.append(cell);
}
window.__stats = { total: queries.length, hits, registered: __widgetCount };
console.log("widgets:", __widgetCount, "queries:", queries.length, "matched:", hits);
</script></body></html>`;

const types = { js: "application/javascript", css: "text/css", html: "text/html", png: "image/png", svg: "image/svg+xml" };

const day = (n) => Math.floor(Date.now() / 1000) + n * 86400;
const MOCK_RICH = [
  { subtype: "calculator", calculator: { expression: "1234 * 5678", answer: "7,006,652" } },
  {
    subtype: "weather",
    weather: {
      location: { name: "London", state: "", country: "United Kingdom" },
      current_weather: { temp: 14, feels_like: 12, humidity: 82, wind_speed: 5.4, weather: { main: "Rain", description: "light rain" } },
      daily: [
        { ts: day(0), temperature: { max: 16, min: 9 }, weather: { main: "Rain" } },
        { ts: day(1), temperature: { max: 18, min: 10 }, weather: { main: "Clouds" } },
        { ts: day(2), temperature: { max: 21, min: 12 }, weather: { main: "Clear" } },
        { ts: day(3), temperature: { max: 19, min: 11 }, weather: { main: "Drizzle" } },
        { ts: day(4), temperature: { max: 15, min: 8 }, weather: { main: "Thunderstorm" } },
      ],
      alerts: [{ event: "Yellow wind warning", start_relative_i18n: "in 2 hours" }],
    },
  },
  { subtype: "unitConversion", unitConversion: { amount: 100, from_unit: "kilometer", to_unit: "mile", dimensionality: "length" } },
  { subtype: "currency", currency: { from_currency_code: "USD", to_currency_code: "EUR", amount: 100, converted_amount: 92.15, exchange_rate: 0.9215 } },
  { subtype: "unixtimestamp", unixtimestamp: {} },
];
const MOCK = {
  results: { rich: MOCK_RICH, web: { results: [] }, mixed: [] },
  more_results_available: false,
};

async function searchPage() {
  let html = await Bun.file(ROOT + "web/index.html").text();
  const css = await Bun.file(ROOT + "search.css").text();
  html = html
    .replace("/**css**/", css)
    .replaceAll("%%pageTitle%%", "mock")
    .replaceAll("%%inputValue%%", "")
    .replaceAll("%%inputValueEncoded%%", "")
    .replace('/p/%%jsJwt%%', "/page-js");
  return html;
}
async function searchJs() {
  let js = await Bun.file(ROOT + "web/index.js").text();
  js = js
    .replace("__results_template__", JSON.stringify(MOCK))
    .replace('"__results_pk__"', '"mock"')
    .replace('"__results_cl__"', '"mock"')
    .replaceAll("%%galileo_pass%%", "");
  return js;
}

Bun.serve({
  port: 5599,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/" || pathname === "/index.html")
      return new Response(page, { headers: { "content-type": "text/html" } });
    if (pathname === "/page")
      return new Response(await searchPage(), { headers: { "content-type": "text/html" } });
    if (pathname === "/page-js")
      return new Response(await searchJs(), { headers: { "content-type": "application/javascript" } });
    if (pathname.startsWith("/fx/")) {
      const base = pathname.slice(4).toUpperCase();
      const up = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      const data = await up.json();
      return Response.json({ base: data.base_code, rates: data.rates, updated: data.time_last_update_unix });
    }
    let path = null;
    if (pathname.startsWith("/s/")) path = ROOT + "assets/" + pathname.slice(3);
    else if (pathname === "/search.css") path = ROOT + "search.css";
    if (!path) return new Response("not found", { status: 404 });
    const f = file(path);
    if (!(await f.exists())) return new Response("missing " + path, { status: 404 });
    const ext = path.split(".").pop();
    return new Response(f, { headers: { "content-type": types[ext] || "application/octet-stream" } });
  },
});
console.log("widget preview on http://localhost:5599");
