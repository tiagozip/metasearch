# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

metasearch is a privacy-focused metasearch engine that runs as a single Cloudflare Worker. It scrapes Brave Search (no API key) and reshapes the results into its own pretty, fast, JS-progressive UI.

## Commands

Uses **bun** as the package manager and **wrangler** as the runtime/deploy tool.

```bash
bun install              # install deps (postinstall deletes node_modules/file-type, a takumi-js workaround)
bun run dev              # wrangler dev — local worker; reads JWT_SECRET from .dev.vars
bun run deploy           # wrangler deploy to Cloudflare
bun run tail             # stream production logs (wrangler tail)
bun run lint             # biome check (lint + format check)
bun run format           # biome check --write (auto-fix)
bun run bangs            # regenerate src/bangs-data.json from upstream, then redeploy
node scripts/widget-preview.js   # local bun server on :5599 to preview instant-answer widgets
```

There is **no test suite**. Verify changes by running `bun run dev` and exercising the UI.

`JWT_SECRET` is required (signs all search tokens). Locally it comes from `.dev.vars` (already present with a dev value); in production set it with `wrangler secret put JWT_SECRET`.

## Code style

- biome enforces 2-space indentation, formatting, and import organization — run `bun run format` before committing.
- **All prose and UI copy is lowercase** (commit messages, comments, user-facing text).
- Large vendored client assets (`public/assets/chart.js`, `fflate.min.js`, `map.js`, `qrcode.js`, `sugar-high.js`) and SVGs are excluded from biome in `biome.json`.

## Architecture

### Single worker, static assets, no framework backend

`src/index.js` is the entire backend: one Elysia app (`elysia/adapter/cloudflare-worker`) defining every route, ending in `.compile()`. Everything in `public/` is served by Cloudflare's `ASSETS` binding (configured `html_handling = "none"`, so the worker controls all routing). `wrangler.toml` wires `main = src/index.js` and `directory = ./public`.

### Two-phase progressive rendering (the core flow)

The key DX decision (README "fast and better dx"): **ship CSS+HTML immediately, deliver results as JS afterward.**

1. `GET /?q=...&type=web|images|news|maps` → returns the cached HTML shell (`src/templates.js` loads `public/<type>/index.html`, injects `search.css` via the `/**css**/` placeholder). The shell embeds a short-lived (10m) bootstrap JWT in the `%%jsJwt%%` placeholder via `sign({ s: query, t: type })`.
2. The shell's script requests `GET /p/:q` (`:q` is that bootstrap JWT). The worker verifies it, runs the actual search, and returns the page's JS bundle (`public/<type>/index.js`) with results inlined into `__results_template__` plus two fresh tokens (`__results_pk__`, `__results_cl__`).
3. Pagination: the client `POST /p`s, the worker returns the next page and a `x-galileo-upk` header carrying the next page-key token.

Server-side placeholders use `%%name%%` (string-replaced in `index.js`); results-injection placeholders use `__name__` (replaced in the `/p/:q` handler).

### Galileo: anti-abuse handshake

`src/galileo.js` + the `x-galileo-*` headers gate the data endpoints so they can't be trivially scraped:

- `x-galileo-hash` — a rolling hash (`reduce((h,c) => (h*31 + c.charCodeAt(0)) | 0)`, hex) over `query + token`, computed **identically** on client (`public/web/index.js`) and server (`POST /p`). If you change one side you must change the other.
- `x-galileo-jwt` — the `__results_cl__` token (`sign({ v: query })`); the server checks `payload.v === query`.
- Maps endpoints (`POST /m` suggestions, `POST /d` place detail) require a hardcoded `x-galileo-hint` constant and an xor+base64+reversed payload decoded by `galileo.decode()` / `galileo.xor()` (the xor KEY lives in `galileo.js`).

All tokens are HS256 JWTs (`jose`) signed with `JWT_SECRET`.

### Brave scraping & parsing

All web/images/news data comes from scraping Brave's HTML — there is no Brave API key.

- `src/search/braveFetch.js` does the fetch with a spoofed Chrome UA, `country=all`/`useLocation=0` cookie, and an 8s abort timeout.
- `src/search/{mixed,images,news}.js` each: locate the `[{type:"data",data:...}]` inline script in Brave's HTML, then parse it with **acorn** (`parseExpressionAt`) and walk the AST with a local `simplify()` helper. This is **not** `JSON.parse` — Brave's payload is a JS object literal with unquoted keys. Each module then cherry-picks a whitelist of fields (web/news/videos/discussions/faq/infobox/rich answers/etc.). When adding a surfaced field, extend the mapping in the relevant module.
- Brave occasionally returns a proof-of-work captcha. Responses then carry `captchaHtml`; `public/assets/captcha.js` solves it client-side inside a hidden iframe and retries.

### Other notable endpoints (all in src/index.js)

- `GET /og` — dynamic OpenGraph image rendered with `takumi-js` `ImageResponse` (JSX-like object tree). `GET /` serves OG meta tags only to known unfurler bots (Discord, Slack, etc.).
- `GET /suggest` — search autocomplete proxied from Brave.
- `GET /translate` + `POST /translate` + `GET /tts` — Google Translate proxy (`src/translate.js`).
- `GET /g` — Genius lyrics scraper using `HTMLRewriter` to extract `[data-lyrics-container]`.
- `GET /dict/:word`, `GET /fx/:base` — dictionary and currency proxies.
- `src/colos.js` maps the Cloudflare colo (`request.cf.colo`) to a city name shown on the homepage.

### Bangs

`src/bangs.js` scans a query for `!bang` tokens and redirects using `src/bangs-data.json`, which is committed and bundled for zero-latency lookups. Regenerate it with `bun run bangs` (`scripts/fetch-bangs.js` pulls from `files.helium.computer`); the new JSON must be committed and redeployed.

### Client widgets (instant answers)

`public/assets/widgets.js` (~6k lines) implements calculator, color picker, QR, weather, crypto, unit/timezone conversion, and many small tools entirely client-side. Develop/preview them in isolation with `node scripts/widget-preview.js`.

## Caching

Responses set `cache-control` from the `CACHE` map at the top of `src/index.js` (`short`/`med`/`day`/`forever`/`tts`). Static asset routes (`/s/:file`, flags) use `forever`; live search results use `short`; token-bearing responses use `no-store`.
