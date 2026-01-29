import initCycleTLS from "cycletls";

let cycleTLS = null;
let initPromise = null;

const getCycleTLS = async () => {
	if (cycleTLS) return cycleTLS;
	if (initPromise) return initPromise;

	initPromise = initCycleTLS();
	cycleTLS = await initPromise;
	return cycleTLS;
};

const braveFetch = async (url, options = {}) => {
	const client = await getCycleTLS();

	const method = options.method || "GET";
	const headers = options.headers || {};
	const body = options.body;

	const response = await client(
		url,
		{
			body: body,
			headers: headers,
			ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0",
			userAgent:
				headers["User-Agent"] ||
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
			Cookie: "theme=dark; country=all; useLocation=0",
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
			proxy: process.env.CYCLETLS_PROXY || undefined
		},
		method.toLowerCase(),
	);

	let bodyText = "";
	const rawData = response.body || response.data;

	if (rawData) {
		if (typeof rawData === "string") {
			bodyText = rawData;
		} else if (rawData.type === "Buffer" && Array.isArray(rawData.data)) {
			bodyText = Buffer.from(rawData.data).toString("utf-8");
		} else if (Buffer.isBuffer(rawData)) {
			bodyText = rawData.toString("utf-8");
		} else if (typeof rawData === "object") {
			bodyText = JSON.stringify(rawData);
		}
	}

	return {
		ok: response.status >= 200 && response.status < 300,
		status: response.status,
		headers: response.headers,
		text: async () => bodyText,
		json: async () => JSON.parse(bodyText),
	};
};

export default braveFetch;
