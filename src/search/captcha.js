import { Elysia, t } from "elysia";
import braveFetch from "./braveFetch.js";

const captchaFlows = new Map();

export const createCaptchaFlow = () => {
	const flowId = Bun.randomUUIDv7();
	captchaFlows.set(flowId, { createdAt: Date.now() });
	setTimeout(() => captchaFlows.delete(flowId), 10 * 60 * 1000);
	return flowId;
};

export const getTokenKeys = async (flowId) => {
	if (!captchaFlows.has(flowId)) {
		return { error: "Invalid or expired captcha flow", status: 403 };
	}

	const resp = await braveFetch("https://search.brave.com/api/tokens/keys", {
		headers: {
			Accept: "application/json",
		},
	});

	if (!resp.ok) {
		return { error: "Failed to fetch token keys", status: resp.status };
	}

	return { data: await resp.json(), status: 200 };
};

export const submitCaptcha = async (solution, flowId) => {
	if (!captchaFlows.has(flowId)) {
		return { error: "Invalid or expired captcha flow", status: 403 };
	}

	const { set_token, solutions, taken_time, blinded_messages, key_id } =
		solution;

	if (!set_token) {
		return { error: "Token is required", status: 400 };
	}
	if (!solutions) {
		return { error: "Solution is required", status: 400 };
	}
	if (!taken_time) {
		return { error: "Time is required", status: 400 };
	}

	const body = { set_token, solutions, taken_time };
	if (blinded_messages) body.blinded_messages = blinded_messages;
	if (key_id) body.key_id = key_id;

	const resp = await braveFetch(
		"https://search.brave.com/api/captcha/pow?brave=0",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		},
	);

	let data;
	try {
		data = await resp.json();
	} catch {
		data = {};
	}

	return { status: resp.status, data };
};

export const endCaptchaFlow = (flowId) => {
	if (!captchaFlows.has(flowId)) {
		return { error: "Invalid or expired captcha flow", status: 403 };
	}
	captchaFlows.delete(flowId);
	return { status: 200 };
};

export const buildCaptchaResponse = (raw) => {
	const flowId = createCaptchaFlow();
	return {
		more_results_available: true,
		captchaHtml: {
			raw,
			flowId,
		},
	};
};

export const isCaptchaPage = (html) => {
	return html.includes("PoW Captcha - Brave Search");
};

export const captchaElysia = new Elysia({
	prefix: "/p/pow",
})
	.get("/keys/:flowId", async ({ set, params }) => {
		const result = await getTokenKeys(params.flowId);
		set.headers["content-type"] = "application/json";
		if (result.error) {
			set.status = result.status;
			return { error: result.error };
		}
		return result.data;
	})

	.post(
		"/",
		async ({ set, headers, body }) => {
			const result = await submitCaptcha(body, headers["x-galileo-flow"]);
			set.status = result.status;
			if (result.error) {
				return { error: result.error };
			}
			return result.data || {};
		},
		{
			body: t.Object({
				set_token: t.String(),
				solutions: t.Record(t.String(), t.String()),
				taken_time: t.Number(),
				blinded_messages: t.Optional(t.Array(t.String())),
				key_id: t.Optional(t.String()),
			}),
		},
	)

	.post("/end/:flowId", async ({ set, params }) => {
		const result = endCaptchaFlow(params.flowId);
		set.status = result.status;
		if (result.error) {
			return { error: result.error };
		}
		return { ok: true };
	});
