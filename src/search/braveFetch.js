const braveFetch = async (url, options = {}) => {
	const method = options.method || "GET";
	const headers = {
		"User-Agent":
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
		...options.headers,
	};

	// brave hangs sometimes, bail out
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), 8000);
	let resp;
	try {
		resp = await fetch(url, {
			method,
			headers,
			body: options.body,
			signal: ac.signal,
		});
	} finally {
		clearTimeout(timer);
	}

	const bodyText = await resp.text();

	return {
		ok: resp.ok,
		status: resp.status,
		headers: Object.fromEntries(resp.headers),
		text: async () => bodyText,
		json: async () => JSON.parse(bodyText),
	};
};

export default braveFetch;
