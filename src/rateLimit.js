import argon2 from "argon2";
import { SQL } from "bun";
import { Elysia } from "elysia";
import { jwtVerify, SignJWT } from "jose";

const secret = new TextEncoder().encode(Bun.randomUUIDv7());

const POW_QUERIES = 100;
const POW_EXPIRY_MS = 2 * 24 * 60 * 60 * 1000;
const CHALLENGE_EXPIRY_MS = 4 * 60 * 1000;
const CHALLENGES_COUNT = 20;

const ARGON2_MEMORY = 6 * 1024;
const ARGON2_TIME = 2;
const ARGON2_HASH_LENGTH = 16;

const db = SQL("sqlite://.data/ratelimit.sqlite");

(async () => {
	await db`
		CREATE TABLE IF NOT EXISTS pow_tokens (
			token TEXT PRIMARY KEY,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			queries_remaining INTEGER NOT NULL
		)
	`;

	await db`CREATE INDEX IF NOT EXISTS idx_pow_tokens_expires ON pow_tokens(expires_at)`;

	await db`
		CREATE TABLE IF NOT EXISTS challenge_blocklist (
			signature TEXT PRIMARY KEY,
			expires_at INTEGER NOT NULL
		)
	`;

	await db`CREATE INDEX IF NOT EXISTS idx_challenge_blocklist_expires ON challenge_blocklist(expires_at)`;
})();

export const signRedirect = async (url) => {
	return await new SignJWT({
		url,
	})
		.setProtectedHeader({ alg: `HS256` })
		.setIssuedAt()
		.setExpirationTime("20m")
		.sign(secret);
};

export const signPass = async (pass) => {
	return await new SignJWT({
		pass,
	})
		.setProtectedHeader({ alg: `HS256` })
		.setIssuedAt()
		.setExpirationTime("12h")
		.sign(secret);
};

export const validatePass = async (jwt) => {
	const { payload } = await jwtVerify(jwt, secret);
	return payload.pass;
};

const cleanupOldTokens = async () => {
	const now = Date.now();
	await db`DELETE FROM pow_tokens WHERE expires_at < ${now}`;
	await db`DELETE FROM challenge_blocklist WHERE expires_at < ${now}`;
};

setInterval(cleanupOldTokens, 5 * 60 * 1000);
setTimeout(cleanupOldTokens, 1000);

const getValidToken = async (token) => {
	if (!token) return null;

	const now = Date.now();
	const result = await db`
		SELECT * FROM pow_tokens
		WHERE token = ${token}
		AND expires_at > ${now}
		AND queries_remaining > 0
	`;

	return result[0] || null;
};

const decrementToken = async (token) => {
	await db`
		UPDATE pow_tokens
		SET queries_remaining = queries_remaining - 1
		WHERE token = ${token}
	`;
};

const createChallenge = async () => {
	const seed = Bun.randomUUIDv7();
	const prefix = crypto.getRandomValues(new Uint8Array(1))[0].toString(16)[0];

	const challengeJwt = await new SignJWT({
		seed,
		prefix,
	})
		.setProtectedHeader({ alg: `HS256` })
		.setIssuedAt()
		.setExpirationTime(`${Math.floor(CHALLENGE_EXPIRY_MS / 1000)}s`)
		.sign(secret);

	return { challengeJwt, seed, prefix };
};

const verifySolution = async (challengeJwt, solution) => {
	let payload;
	try {
		const verified = await jwtVerify(challengeJwt, secret);
		payload = verified.payload;
	} catch (error) {
		return { valid: false, error: "Challenge expired or invalid" };
	}

	const parts = challengeJwt.split('.');
	const signature = parts[2].replace(/=/g, '');

	const now = Date.now();
	const existing = await db`
		SELECT * FROM challenge_blocklist
		WHERE signature = ${signature}
	`;

	if (existing.length > 0) {
		return { valid: false, error: "Challenge already used" };
	}

	for (let i = 0; i < solution.length; i++) {
		const nonce = solution[i];
		const input = `${payload.seed}:${i}:${nonce}`;
		if (typeof nonce !== 'number' || !Number.isInteger(nonce) || nonce < 0) {
			return { valid: false, error: "Invalid nonce format" };
		}

		const saltInput = `${payload.seed}:${i}`;
		const saltHash = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(saltInput),
		);
		const salt = new Uint8Array(saltHash).slice(0, 16);

		try {
			const hash = await argon2.hash(input, {
				type: argon2.argon2d,
				memoryCost: ARGON2_MEMORY,
				timeCost: ARGON2_TIME,
				parallelism: 1,
				hashLength: ARGON2_HASH_LENGTH,
				salt: Buffer.from(salt),
				raw: true,
			});

			const hashHex = Buffer.from(hash).toString("hex");

			if (!hashHex.startsWith(payload.prefix)) {
				return { valid: false, error: `Invalid solution for challenge ${i}` };
			}
		} catch (error) {
			console.error("Argon2 verification error:", error);
			return { valid: false, error: "Verification failed" };
		}
	}

	const expiresAt = now + CHALLENGE_EXPIRY_MS;
	await db`
		INSERT INTO challenge_blocklist (signature, expires_at)
		VALUES (${signature}, ${expiresAt})
	`;

	const token = Bun.randomUUIDv7();
	const tokenExpiresAt = now + POW_EXPIRY_MS;

	await db`
		INSERT INTO pow_tokens (token, created_at, expires_at, queries_remaining)
		VALUES (${token}, ${now}, ${tokenExpiresAt}, ${POW_QUERIES})
	`;

	return { valid: true, token };
};

const checkRateLimit = async (powToken) => {
	const validToken = await getValidToken(powToken);

	if (validToken) {
		return {
			allowed: true,
			queriesRemaining: validToken.queries_remaining,
			expiresAt: validToken.expires_at,
		};
	}

	return { allowed: false };
};

export const recordAndCheck = async (powToken) => {
	const result = await checkRateLimit(powToken);

	if (result.allowed) {
		await decrementToken(powToken);
		result.queriesRemaining -= 1;
	}

	return result;
};

export const rateLimitElysia = new Elysia({ prefix: "/challenge" })
	.get("/", async ({ query, set, cookie, redirect }) => {
		const powToken = cookie?.galileo_pass?.value;

		const { payload } = await jwtVerify(query.redirect, secret);
		const qredirect = payload.url;

		const check = await checkRateLimit(powToken);
		if (check.allowed) {
			return redirect(qredirect || "/");
		}

		const challenge = await createChallenge();

		const html = await Bun.file("./public/challenge.html").text();
		const injectedHtml = html
			.replaceAll("%%seedId%%", challenge.challengeJwt)
			.replaceAll("%%seed%%", challenge.seed)
			.replace("%%prefix%%", challenge.prefix)
			.replaceAll("__jobs__", CHALLENGES_COUNT.toString())
			.replace("__mem__", ARGON2_MEMORY.toString())
			.replace("__time__", ARGON2_TIME.toString())
			.replaceAll("__hashLen__", ARGON2_HASH_LENGTH.toString())
			.replace("%%redirect%%", qredirect || "/");

		set.headers["content-type"] = "text/html";
		return injectedHtml;
	})
	.post("/", async ({ body, headers, set, cookie }) => {
		if (headers["x-galileo-csrf"] !== "1") {
			set.status = 400;
			return { error: "CSRF header missing" };
		}

		const [challengeJwt, solution, doCookie] = body;

		if (
			!challengeJwt ||
			!Array.isArray(solution) ||
			solution.length !== CHALLENGES_COUNT
		) {
			set.status = 400;
			return { error: `expected challengeJwt and ${CHALLENGES_COUNT} solutions` };
		}

		const result = await verifySolution(seedId, solution);

		if (!result.valid) {
			set.status = 400;
			return { error: result.error };
		}

		if (doCookie) {
			cookie.galileo_pass.set({
				value: result.token,
				maxAge: POW_EXPIRY_MS / 1000,
				path: "/",
				httpOnly: true,
				sameSite: "lax",
			});
			return { success: true };
		}

		return { success: true, pass: await signPass(result.token) };
	});
