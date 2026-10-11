import { file } from "bun";

const ROOT = new URL("../public/", import.meta.url).pathname;

const GROUPS = {
  generators: [
    "qr code https://search.tiago.zip",
    "password generator",
    "uuid",
    "lorem ipsum",
  ],
  chance: [
    "flip a coin",
    "roll 2d20",
    "random number 1 to 100",
    "magic 8 ball",
    "should i ship it?",
    "pick between pizza, sushi, tacos",
  ],
  quizzes: [
    "am i gay",
    "am i trans",
    "am i a furry",
    "iq test",
    "is tiago a furry",
  ],
  text: [
    "base64 encode hello world",
    "hello to morse",
    "nato phonetic claude",
    "text to binary hi",
    "caesar cipher 3 hello world",
    "leetspeak elite hacker",
    "word counter",
    "text diff",
    "number to words 1234567",
  ],
  color: ["#89b4fa", "random color", "contrast checker", "css gradient"],
  math: [
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
  ],
  time: [
    "what time is it",
    "time in tokyo",
    "time in moscow",
    "world clock",
    "age from 1995-06-15",
    "days until 2027-01-01",
    "unix timestamp 1700000000",
    "pomodoro",
    "new year countdown",
    "box breathing",
    "sleep calculator",
  ],
  audio: [
    "bpm tapper",
    "metronome",
    "440hz",
    "white noise",
    "piano",
    "drum machine",
    "melody generator",
    "guitar chord Am",
    "chord Cmaj7",
  ],
  games: [
    "reaction time",
    "tic tac toe",
    "rock paper scissors",
    "typing test",
    "sorting visualizer",
    "snake",
    "2048",
    "minesweeper",
  ],
  developer: [
    "json formatter",
    "jwt decoder",
    "sha256 hash hello",
    "my user agent",
    "screen resolution",
    "regex tester",
    "markdown preview",
    "ascii table",
    "char info ✓",
    "cron */15 9-17 * * 1-5",
    "http 404",
    "chmod 755",
    "subnet 192.168.1.0/24",
  ],
  emoji: ["emoji search", "emoji heart", "kaomoji"],
  convert: [
    "png to jpg",
    "4.49 aud to usd",
    "100 usd in eur",
    "50 euros to pounds",
    "$20 to jpy",
    "250 thb to inr",
    "translate good morning to japanese",
    "hello in french",
  ],
};

const PROD = "https://search.tiago.zip";
const PORT = Number(process.env.PORT) || 5599;

const types = {
  js: "application/javascript",
  css: "text/css",
  html: "text/html",
  png: "image/png",
  svg: "image/svg+xml",
};

const day = (n) => Math.floor(Date.now() / 1000) + n * 86400;
const MOCK_RICH = [
  {
    subtype: "calculator",
    calculator: { expression: "1234 * 5678", answer: "7,006,652" },
  },
  {
    subtype: "weather",
    weather: {
      location: { name: "London", state: "", country: "United Kingdom" },
      current_weather: {
        temp: 14,
        feels_like: 12,
        humidity: 82,
        wind_speed: 5.4,
        weather: { main: "Rain", description: "light rain" },
      },
      daily: [
        {
          ts: day(0),
          temperature: { max: 16, min: 9 },
          weather: { main: "Rain" },
        },
        {
          ts: day(1),
          temperature: { max: 18, min: 10 },
          weather: { main: "Clouds" },
        },
        {
          ts: day(2),
          temperature: { max: 21, min: 12 },
          weather: { main: "Clear" },
        },
        {
          ts: day(3),
          temperature: { max: 19, min: 11 },
          weather: { main: "Drizzle" },
        },
        {
          ts: day(4),
          temperature: { max: 15, min: 8 },
          weather: { main: "Thunderstorm" },
        },
      ],
      alerts: [
        { event: "Yellow wind warning", start_relative_i18n: "in 2 hours" },
      ],
    },
  },
  {
    subtype: "unitConversion",
    unitConversion: {
      amount: 100,
      from_unit: "kilometer",
      to_unit: "mile",
      dimensionality: "length",
    },
  },
  {
    subtype: "currency",
    currency: {
      from_currency_code: "USD",
      to_currency_code: "EUR",
      amount: 100,
      converted_amount: 92.15,
      exchange_rate: 0.9215,
    },
  },
  { subtype: "unixtimestamp", unixtimestamp: {} },
  {
    subtype: "timezones",
    timezones: {
      type: "time",
      timezones: [
        ["Moscow", "11:19 AM", "UTC+3"],
        ["Kaliningrad", "10:19 AM", "UTC+2"],
        ["Samara", "12:19 PM", "UTC+4"],
        ["Yekaterinburg", "1:19 PM", "UTC+5"],
        ["Omsk", "2:19 PM", "UTC+6"],
        ["Novosibirsk", "3:19 PM", "UTC+7"],
      ].map(([name, strftime, utc_diff]) => ({
        converted_time: { strftime, utc_diff, city: { name } },
      })),
    },
  },
];
const MOCK = {
  results: { rich: MOCK_RICH, web: { results: [] }, mixed: [] },
  more_results_available: false,
};

async function searchPage(q) {
  const html = await Bun.file(`${ROOT}web/index.html`).text();
  const css = await Bun.file(`${ROOT}search.css`).text();
  const value = q || "";
  return html
    .replace("/**css**/", css)
    .replaceAll("%%pageTitle%%", value || "mock")
    .replaceAll("%%inputValue%%", value)
    .replaceAll("%%inputValueEncoded%%", encodeURIComponent(value))
    .replace("/p/%%jsJwt%%", `/page-js?q=${encodeURIComponent(value)}`);
}
async function prodData(q) {
  const page = await fetch(`${PROD}/?q=${encodeURIComponent(q)}`).then((r) =>
    r.text(),
  );
  const src = page.match(/\/p\/[\w.-]+/)?.[0];
  if (!src) return MOCK;
  const js = await fetch(`${PROD}${src}`).then((r) => r.text());
  const start = js.indexOf("const data = ") + 13;
  const end = js.indexOf("\n  let hasMoreResults", start);
  return JSON.parse(js.slice(start, end).replace(/;\s*$/, ""));
}
async function searchJs(q) {
  const js = await Bun.file(`${ROOT}web/index.js`).text();
  const data = q ? await prodData(q) : MOCK;
  return js
    .replace("__results_template__", JSON.stringify(data))
    .replace("__kagi_enabled__", "false")
    .replace('"__results_pk__"', '"mock"')
    .replace('"__results_cl__"', '"mock"')
    .replaceAll("%%galileo_pass%%", "");
}

Bun.serve({
  port: PORT,
  idleTimeout: 60,
  async fetch(req) {
    const { pathname, searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    if (pathname === "/" || pathname === "/index.html") {
      const html = await Bun.file(
        new URL("./widget-preview.html", import.meta.url).pathname,
      ).text();
      return new Response(html.replace("__GROUPS__", JSON.stringify(GROUPS)), {
        headers: { "content-type": "text/html" },
      });
    }
    if (pathname === "/translate" || pathname.startsWith("/dict/")) {
      const up = await fetch(`${PROD}${pathname}`, {
        method: req.method,
        headers: { "content-type": req.headers.get("content-type") || "" },
        body: req.method === "POST" ? await req.text() : undefined,
      });
      return new Response(await up.text(), {
        status: up.status,
        headers: { "content-type": up.headers.get("content-type") || "" },
      });
    }
    if (pathname === "/page")
      return new Response(await searchPage(q), {
        headers: { "content-type": "text/html" },
      });
    if (pathname === "/page-js")
      return new Response(await searchJs(q), {
        headers: { "content-type": "application/javascript" },
      });
    if (pathname.startsWith("/fx/")) {
      const base = pathname.slice(4).toUpperCase();
      const up = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      const data = await up.json();
      return Response.json({
        base: data.base_code,
        rates: data.rates,
        updated: data.time_last_update_unix,
      });
    }
    let path = null;
    if (pathname.startsWith("/s/")) path = `${ROOT}assets/${pathname.slice(3)}`;
    else if (pathname === "/search.css") path = `${ROOT}search.css`;
    if (!path) {
      const up = await fetch(`${PROD}${pathname}${new URL(req.url).search}`);
      return new Response(await up.arrayBuffer(), {
        status: up.status,
        headers: { "content-type": up.headers.get("content-type") || "" },
      });
    }
    const f = file(path);
    if (!(await f.exists()))
      return new Response(`missing ${path}`, { status: 404 });
    const ext = path.split(".").pop();
    return new Response(f, {
      headers: { "content-type": types[ext] || "application/octet-stream" },
    });
  },
});
console.log(`widget preview on http://localhost:${PORT}`);
