const TOKEN_COOKIE = "__Secure-token#brave-search-captcha";
const SESSION_RE =
  /(__Secure-session#brave-search-captcha=[0-9a-zA-Z]+)[^,]*?Max-Age=(\d+)/i;
const SESSION_MARGIN_MS = 5000;
const LOW_WATER = 60;

let session = null;
let current = null;
let challenge = null;

export const stashChallenge = (set) => {
  if (set?.set_token) challenge = { set, at: Date.now() };
};

export const takeChallenge = (maxAgeMs) => {
  const fresh = challenge && Date.now() - challenge.at < maxAgeMs;
  const set = fresh ? challenge.set : null;
  challenge = null;
  return set;
};

export const cachedClearance = ({ tokens = true } = {}) => {
  if (session?.until > Date.now())
    return { cookie: session.cookie, session: true };
  if (tokens && current)
    return { cookie: `${TOKEN_COOKIE}=${current}`, token: current };
  return null;
};

export const clearanceCookie = async (db, { tokens = true } = {}) => {
  const now = Date.now();
  if (session?.until > now) return { cookie: session.cookie, session: true };
  const row = await db
    .prepare(
      "SELECT value, expires_at FROM brave_clearance WHERE kind = 'session' AND expires_at > ? ORDER BY expires_at DESC LIMIT 1",
    )
    .bind(now + SESSION_MARGIN_MS)
    .first();
  if (row) {
    session = { cookie: row.value, until: row.expires_at - SESSION_MARGIN_MS };
    return { cookie: row.value, session: true };
  }
  if (!tokens) return null;
  if (current) return { cookie: `${TOKEN_COOKIE}=${current}`, token: current };
  const token = await db
    .prepare(
      "SELECT value FROM brave_clearance WHERE kind = 'token' AND expires_at > ? ORDER BY random() LIMIT 1",
    )
    .bind(now)
    .first();
  if (!token) return null;
  current = token.value;
  return {
    cookie: `${TOKEN_COOKIE}=${current}`,
    token: current,
    fresh: true,
  };
};

export const burnToken = async (db, value) => {
  if (current === value) current = null;
  await db
    .prepare("DELETE FROM brave_clearance WHERE kind = 'token' AND value = ?")
    .bind(value)
    .run();
};

export const storeSession = async (db, setCookie) => {
  const m = SESSION_RE.exec(setCookie || "");
  if (!m) return;
  const until = Date.now() + Number(m[2]) * 1000;
  session = { cookie: m[1], until: until - SESSION_MARGIN_MS };
  await db
    .prepare(
      "INSERT OR IGNORE INTO brave_clearance (kind, value, expires_at) VALUES ('session', ?, ?)",
    )
    .bind(m[1], until)
    .run();
};

export const forgetSession = async (db, cookie) => {
  if (session?.cookie === cookie) session = null;
  await db
    .prepare("DELETE FROM brave_clearance WHERE kind = 'session' AND value = ?")
    .bind(cookie)
    .run();
};

export const tokensLeft = async (db) => {
  const row = await db
    .prepare(
      "SELECT count(*) AS n FROM brave_clearance WHERE kind = 'token' AND expires_at > ?",
    )
    .bind(Date.now())
    .first();
  return row?.n ?? 0;
};

export const tokensLow = async (db) => (await tokensLeft(db)) < LOW_WATER;
