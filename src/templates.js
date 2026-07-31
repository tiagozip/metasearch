import { env } from "cloudflare:workers";

const cache = {};

async function readAsset(path) {
  let resp = await env.ASSETS.fetch(new Request(`https://assets${path}`));
  if (resp.status >= 300 && resp.status < 400) {
    const location = resp.headers.get("location");
    if (location) {
      resp = await env.ASSETS.fetch(
        new Request(new URL(location, `https://assets${path}`)),
      );
    }
  }
  return resp.text();
}

async function load(key, path, fn) {
  if (cache[key]) return cache[key];
  let html = await readAsset(path);
  if (fn) html = await fn(html);
  cache[key] = html;
  return html;
}

const injectCss = async (html) =>
  html.replace("/**css**/", await load("css", "/search.css"));

// the result bundles are served from /p/:jwt, not fetched as separate modules,
// so the shared sanitizer is inlined into each of them at build/serve time.
// function-form replace keeps `$&`-style sequences in the source literal.
const injectSanitize = async (js) => {
  const src = await load("sanitize", "/assets/sanitize.js");
  return js.replace("/**sanitize**/", () => src);
};

export const css = () => load("css", "/search.css");
export const web = () => load("web", "/web/index.html", injectCss);
export const webJs = () => load("webJs", "/web/index.js", injectSanitize);
export const images = () => load("images", "/images/index.html", injectCss);
export const imagesJs = () =>
  load("imagesJs", "/images/index.js", injectSanitize);
export const news = () => load("news", "/news/index.html", injectCss);
export const newsJs = () => load("newsJs", "/news/index.js", injectSanitize);
export const maps = () => load("maps", "/maps/index.html", injectCss);
export const mapsJs = () => load("mapsJs", "/maps/index.js", injectSanitize);
