import { parseExpressionAt } from "acorn";
import braveFetch from "./braveFetch.js";
import { buildCaptchaResponse, isCaptchaPage } from "./captcha.js";

const simplify = (node) => {
	if (!node) return null;

	switch (node.type) {
		case "Literal":
			return node.value;
		case "ObjectExpression": {
			const obj = {};
			for (const prop of node.properties) {
				const key = prop.key.name || prop.key.value;
				obj[key] = simplify(prop.value);
			}
			return obj;
		}
		case "ArrayExpression":
			return node.elements.map(simplify);
		default:
			return null;
	}
};

export default async function searchImages(query, page = 0) {
	const resp = await braveFetch(
		`https://search.brave.com/images?q=${encodeURIComponent(query)}${page ? `&offset=${page}` : ""}&source=web`,
		{
			headers: {
				accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
			},
			referrerPolicy: "strict-origin-when-cross-origin",
			method: "GET",
		},
	);

	const raw = await resp.text();

	const script =
		`[{i:${raw.split(`<script nonce="`)[1].split(`[{type:"data",data:`).slice(1).join(`[{type:"data",data:`).split("</script>")[0]}`
			.split("\n")[0]
			.trim()
			.replace(/,$/, "");

	const exprAst = parseExpressionAt(script, 0, { ecmaVersion: 2020 });

	try {
		const simplified = simplify(exprAst.elements[1]).data;
		const imageResults = simplified.body?.response?.results || [];

		return {
			more_results_available:
				simplified.body?.response?.query?.more_results_available,
			results: imageResults.map((r) => ({
				title: r.title,
				url: r.url,
				source: r.source,
				thumbnail: r.thumbnail?.src || r.properties?.url,
				properties: r.properties
					? {
							url: r.properties.url,
							width: r.properties.width,
							height: r.properties.height,
						}
					: null,
				meta_url: r.meta_url
					? {
							hostname: r.meta_url.hostname,
							favicon: r.meta_url.favicon,
						}
					: null,
			})),
		};
	} catch {
		if (isCaptchaPage(raw)) {
			return buildCaptchaResponse(raw);
		}

		return {
			more_results_available: false,
			results: [],
		};
	}
}
