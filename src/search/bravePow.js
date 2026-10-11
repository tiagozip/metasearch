import {
  BatchDLEQProof,
  initSync,
  PublicKey,
  Token,
  UnblindedToken,
} from "@brave-intl/challenge-bypass-ristretto-wasm";
import wasm from "@brave-intl/challenge-bypass-ristretto-wasm/challenge_bypass_ristretto_bg.wasm";
import { takeChallenge, tokensLeft } from "./braveClearance.js";
import braveFetch from "./braveFetch.js";

const TOKEN_TTL_MS = 36 * 60 * 60 * 1000;
const POOL_CAP = 600;
const CHALLENGE_MAX_AGE_MS = 60 * 1000;
const PROBES = 4;
const SIGN_MESSAGE = new TextEncoder().encode("brave-search-captcha");
const HEX = /^[0-9a-f]{8,128}$/;

let ready = false;

const shapeChallenge = (set) => ({
  set_token: set.set_token,
  tokens: set.tokens,
  zero_count: set.zero_count,
  solution_limit: set.solution_limit,
  params: {
    iterations: set.hash_function_params.iterations,
    memorySize: set.hash_function_params.memory_size,
    hashLength: set.hash_function_params.hash_length,
    parallelism: set.hash_function_params.parallelism,
  },
});

export async function getChallenge() {
  const stashed = takeChallenge(CHALLENGE_MAX_AGE_MS);
  if (stashed) return shapeChallenge(stashed);
  for (let i = 0; i < PROBES; i++) {
    try {
      await braveFetch(
        `https://search.brave.com/search?q=${crypto.randomUUID().slice(0, 8)}&source=web`,
        { attempts: 1 },
      );
    } catch {}
    const set = takeChallenge(CHALLENGE_MAX_AGE_MS);
    if (set) return shapeChallenge(set);
  }
  return null;
}

export async function redeem(db, body) {
  const { set_token, solutions, taken_time } = body || {};
  const entries =
    solutions && typeof solutions === "object" ? Object.entries(solutions) : [];
  if (
    typeof set_token !== "string" ||
    !HEX.test(set_token) ||
    !entries.length ||
    entries.length > 500 ||
    entries.some(([k, v]) => !HEX.test(k) || !HEX.test(v)) ||
    !Number.isFinite(taken_time)
  )
    return { status: 400, error: "invalid solution" };

  if ((await tokensLeft(db)) >= POOL_CAP) return { status: 200, added: 0 };

  if (!ready) {
    initSync({ module: wasm });
    ready = true;
  }

  const keysResp = await braveFetch(
    "https://search.brave.com/api/tokens/keys",
    {
      attempts: 2,
      headers: {
        accept: "application/json",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
      },
    },
  );
  const { keys = [], tokens_per_challenge: count = 30 } = await keysResp.json();
  const today = new Date().toISOString().slice(0, 10);
  const key = keys
    .filter((k) => k.key_id <= today)
    .sort((a, b) => (a.key_id < b.key_id ? 1 : -1))[0];
  if (!key) return { status: 502, error: "brave returned no token keys" };

  const tokens = [];
  const blinded = [];
  for (let i = 0; i < count; i++) {
    const token = Token.random();
    const blind = token.blind();
    tokens.push(token.encode_base64());
    blinded.push(blind.encode_base64());
    token.free();
    blind.free();
  }

  let result;
  try {
    const resp = await braveFetch(
      "https://search.brave.com/api/captcha/pow?brave=0",
      {
        method: "POST",
        attempts: 1,
        headers: {
          accept: "*/*",
          "content-type": "application/json",
          origin: "https://search.brave.com",
          referer: "https://search.brave.com/search",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
        },
        body: JSON.stringify({
          set_token,
          solutions,
          taken_time: Math.round(taken_time),
          blinded_messages: blinded,
          key_id: key.key_id,
        }),
      },
    );
    if (resp.status !== 200)
      return {
        status: 422,
        error: `brave rejected the solution (${resp.status})`,
      };
    result = await resp.json();
  } catch (e) {
    return { status: 502, error: `brave redeem failed: ${e?.message || e}` };
  }

  const { signed_tokens, batch_proof } = result || {};
  if (!signed_tokens?.length || !batch_proof)
    return { status: 422, error: "brave rejected the solution" };

  let values;
  try {
    const publicKey = PublicKey.decode_base64(key.public_key);
    const proof = BatchDLEQProof.decode_base64(batch_proof);
    const unblinded = proof
      .verify_and_unblind_from_encoded(
        tokens.join(","),
        blinded.join(","),
        signed_tokens.join(","),
        publicKey,
      )
      .split(",");
    publicKey.free();
    proof.free();

    values = unblinded.map((encoded) => {
      const token = UnblindedToken.decode_base64(encoded);
      const preimage = token.preimage();
      const verifyKey = token.derive_verification_key_sha512();
      const signature = verifyKey.sign_sha512(SIGN_MESSAGE);
      const value = `${key.key_id},${preimage.encode_base64()},${signature.encode_base64()}`;
      for (const o of [token, preimage, verifyKey, signature]) o.free();
      return value;
    });
  } catch (e) {
    return {
      status: 502,
      error: `token unblinding failed: ${e?.message || e}`,
    };
  }

  const now = Date.now();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO brave_clearance (kind, value, expires_at) VALUES ('token', ?, ?)",
  );
  await db.batch([
    db.prepare("DELETE FROM brave_clearance WHERE expires_at < ?").bind(now),
    ...values.map((v) => insert.bind(v, now + TOKEN_TTL_MS)),
  ]);
  return { status: 200, added: values.length };
}
