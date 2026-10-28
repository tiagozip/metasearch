import {
  burnToken,
  cachedClearance,
  clearanceCookie,
  forgetSession,
  stashChallenge,
  storeSession,
  tokensLow,
} from "./braveClearance.js";
import { braveChallenge } from "./braveData.js";

const TIMEOUT_MS = 7000;
const MAX_CLEARANCES = 5;
const BASE_COOKIE = "theme=dark; country=all; useLocation=0";

const braveFetch = async (url, options = {}) => {
  const method = options.method || "GET";
  const attempts = options.attempts || 2;
  const { db, tokens = true } = options.clearance || {};
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    Cookie: options.safe
      ? `${BASE_COOKIE}; safesearch=${options.safe}`
      : BASE_COOKIE,
    "sec-ch-ua": '"Chromium";v="133", "Not(A:Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "sec-gpc": "1",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    ...options.headers,
  };

  let lastErr;
  let clearance = db ? cachedClearance({ tokens }) : null;
  let cleared = 0;
  let tries = 0;
  while (tries < attempts) {
    if (tries && !clearance)
      await new Promise((r) => setTimeout(r, 250 * tries));
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method,
        headers: clearance
          ? { ...headers, Cookie: `${headers.Cookie}; ${clearance.cookie}` }
          : headers,
        body: options.body,
        signal: ac.signal,
      });
      const bodyText = await resp.text();
      if (db) await storeSession(db, resp.headers.get("set-cookie"));
      const blocked =
        resp.status === 403 ||
        resp.status === 429 ||
        (options.sniffBlockPage &&
          resp.status === 200 &&
          bodyText.length < 20000 &&
          /captcha|challenge|unusual traffic|access denied/i.test(bodyText));
      if (blocked) {
        const challenge = resp.status === 429 && braveChallenge(bodyText);
        if (challenge) stashChallenge(challenge);
        if (clearance?.session) await forgetSession(db, clearance.cookie);
        if (clearance?.token) await burnToken(db, clearance.token);
        clearance =
          db && cleared < MAX_CLEARANCES
            ? await clearanceCookie(db, { tokens })
            : null;
        lastErr = Object.assign(
          new Error(
            `brave ${resp.status}${resp.status === 200 ? " (blocked)" : ""}`,
          ),
          {
            status: resp.status,
            blocked: true,
            pow: Boolean(db && tokens && !clearance && challenge),
          },
        );
        if (clearance) {
          cleared++;
          continue;
        }
        tries++;
        continue;
      }
      if (resp.status >= 500) {
        lastErr = Object.assign(new Error(`brave ${resp.status}`), {
          status: resp.status,
        });
        tries++;
        continue;
      }
      return {
        ok: resp.ok,
        status: resp.status,
        headers: Object.fromEntries(resp.headers),
        powLow: Boolean(clearance?.fresh && (await tokensLow(db))),
        text: async () => bodyText,
        json: async () => JSON.parse(bodyText),
      };
    } catch (e) {
      lastErr =
        e?.name === "AbortError"
          ? Object.assign(new Error("brave timed out"), { timeout: true })
          : e;
      tries++;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
};

export default braveFetch;
