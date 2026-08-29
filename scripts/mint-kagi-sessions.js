import { spawnSync } from "node:child_process";
import { searchKagi } from "../../kagibot/search.js";
import { mintTrialSession } from "../../kagibot/session.js";

const TARGET = Number(process.env.COUNT || process.argv[2] || 200);
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const REMOTE = process.argv.includes("--local") ? "--local" : "--remote";

const post = (webhook, body) =>
  fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});

const NORMAL_HOOK =
  "https://discord.com/api/webhooks/1483898327505305703/bGkO3gz7erbp4NoE2wZD4VAw3JwnuqpOw_2EIaGBNk9VJKX4mlZEW1sCGeHmp6whl9Mw";

async function mintOne() {
  const { cookie } = await mintTrialSession();
  const data = await searchKagi("test", { cookie, page: 0 });
  if (!data.results?.length)
    throw new Error("session minted but returned 0 results");
  return cookie;
}

function insertBatch(cookies) {
  const now = Date.now();
  const values = cookies
    .map((c) => `('${c.replace(/'/g, "''")}', ${now})`)
    .join(",");
  const sql = `INSERT OR IGNORE INTO sessions (cookie, created_at) VALUES ${values};`;
  const res = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "kagi-sessions", REMOTE, "--command", sql],
    { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname },
  );
  if (res.status !== 0) throw new Error(res.stderr || "d1 insert failed");
}

let minted = 0;
let failed = 0;
const pending = [];

async function worker() {
  while (minted + failed < TARGET) {
    if (minted >= TARGET) break;
    try {
      const cookie = await mintOne();
      pending.push(cookie);
      minted++;
      process.stdout.write(
        `\rminted ${minted}/${TARGET} · failed ${failed} · buffered ${pending.length}   `,
      );
      if (pending.length >= 20) {
        insertBatch(pending.splice(0, pending.length));
      }
    } catch {
      failed++;
    }
  }
}

console.log(
  `minting ${TARGET} kagi trial sessions (${REMOTE}), concurrency ${CONCURRENCY}`,
);
await post(NORMAL_HOOK, { content: `kagi mint started: target ${TARGET}` });

const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
if (pending.length) insertBatch(pending.splice(0, pending.length));

const mins = Math.round((Date.now() - t0) / 60000);
process.stdout.write("\n");

const count = spawnSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "kagi-sessions",
    REMOTE,
    "--command",
    "SELECT count(*) as n FROM sessions WHERE dead = 0;",
    "--json",
  ],
  { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname },
);
let live = "?";
try {
  live = JSON.parse(count.stdout)[0].results[0].n;
} catch {}

const msg = `kagi mint done: ${minted} inserted, ${failed} failed, ${mins}m · live in D1: ${live}`;
console.log(msg);
await post(NORMAL_HOOK, { content: msg });
