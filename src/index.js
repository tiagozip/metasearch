import { Elysia, t } from "elysia";
import bang from "./bangs.js";
import { rateLimitElysia, recordAndCheck, signRedirect } from "./rateLimit.js";
import { captchaElysia } from "./search/captcha.js";
import searchImages from "./search/images.js";
import searchMixed from "./search/mixed.js";
import searchNews from "./search/news.js";
import { jwtVerify, SignJWT } from "jose";
import * as templates from "./templates.js";

const secret = new TextEncoder().encode(Bun.randomUUIDv7());

const sign = async (payload, expiry) => {
	return await new SignJWT(payload)
		.setProtectedHeader({ alg: `HS256` })
		.setIssuedAt()
		.setExpirationTime(expiry || "1h")
		.sign(secret);
};

new Elysia()
	.use(rateLimitElysia)
	.use(captchaElysia)
	.get("/about", async () => Bun.file("./public/about.html"))
	.get("/bangs", async () => Bun.file("./public/bangs.html"))
	.get("/", async ({ query, set, redirect, headers, cookie }) => {
		const q = query?.q?.replaceAll?.("\n", " ")?.trim();
		const type = query?.type;

		set.headers["content-type"] = "text/html";
		set.headers.Link = `</s/inter-var-v4.woff2>; rel="preload"; as="font"`;

		if (!q) {
			set.headers["cache-control"] = "public, max-age=86400";
			return await Bun.file("./public/index.html").text();
		}

		const powToken = query.pass || cookie?.galileo_pass?.value;
		const rateCheck = await recordAndCheck(powToken);

		if (!rateCheck.allowed) {
			const currentUrl = `/?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ""}`;
			return redirect(`/challenge?redirect=${await signRedirect(currentUrl)}`);
		}

		const bangUrl = bang(q);
		if (bangUrl) {
			return redirect(bangUrl);
		}

		let template;

		if (type === "images") {
			template = await templates.images();
		} else if (type === "news") {
			template = await templates.news();
		} else {
			template = await templates.web();
		}

		set.headers["cache-control"] = "public, max-age=300";

		const html = template
			.replace("%%pageTitle%%", q.replace("<", "&lt;").replaceAll(">", "&gt;"))
			.replace(
				"%%jsJwt%%",
				await sign({ s: q, t: type, pass: powToken }, "10m"),
			)
			.replaceAll(
				"%%inputValue%%",
				q
					.replaceAll("<", "&lt;")
					.replaceAll(">", "&gt;")
					.replaceAll('"', "&quot;"),
			)
			.replaceAll("%%inputValueEncoded%%", encodeURIComponent(q))
			.replaceAll(
				"&pass",
				query.pass ? `&pass=${encodeURIComponent(query.pass)}` : "",
			)
			.replaceAll(
				`<input type="hidden" name="pass">`,
				query.pass
					? `<input type="hidden" name="pass" value="${encodeURIComponent(query.pass)}">`
					: "",
			);

		if (headers["accept-encoding"]?.includes?.("gzip")) {
			set.headers["Content-Encoding"] = "gzip";
			return Bun.gzipSync(html);
		}

		return html;
	})
	.get("/a/:q", async ({ set, params, cookie, redirect, headers }) => {
		const { payload } = await jwtVerify(params?.q || "", secret);
		const powToken = payload.pass || cookie?.galileo_pass?.value;
		const rateCheck = await recordAndCheck(powToken);

		if (!rateCheck.allowed) {
			return redirect(
				`/challenge?redirect=${await signRedirect(`/a/${params.q}`)}`,
			);
		}

		set.headers["content-type"] = "application/javascript";
		set.headers["cache-control"] = "public, max-age=86400";
		set.headers.Vary = "Accept-Encoding";

		let template, results;

		if (payload.t === "images") {
			template = await templates.imagesJs();
			results = await searchImages(payload.s);
		} else if (payload.t === "news") {
			template = await templates.newsJs();
			results = await searchNews(payload.s);
		} else {
			template = await templates.webJs();
			results = await searchMixed(payload.s);
		}

		const js = template
			.replace(
				"__results_pk__",
				await sign({ q: payload.s, p: 1, t: payload.t }, "2h"),
			)
			.replace(
				"__results_cl__",
				await sign({ v: payload.s, _: Bun.randomUUIDv7().split("-")[0] }, "6h"),
			)
			.replace("__results_template__", JSON.stringify(results))
			.replace("%%galileo_pass%%", powToken);

		if (headers["accept-encoding"]?.includes?.("gzip")) {
			set.headers["Content-Encoding"] = "gzip";
			return Bun.gzipSync(js);
		}

		return js;
	})
	.post(
		"/p",
		async ({ set, headers, body, cookie }) => {
			const powToken = cookie?.galileo_pass?.value || headers["x-galileo-pass"];
			const rateCheck = await recordAndCheck(powToken);

			if (!rateCheck.allowed) {
				set.status = 429;
				return { error: "Rate limit exceeded" };
			}

			const { payload } = await jwtVerify(body, secret);

			if (!payload.q || !payload.p) {
				return ["missing q or p"];
			}

			if (
				!headers["x-galileo-hash"] ||
				!headers["x-galileo-jwt"] ||
				headers["x-galileo-hash"] !==
					[...`${payload.q}${body}`]
						.reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
						.toString(16)
			) {
				return ["invalid hash"];
			}

			const page = payload.p || 1;
			const q = payload.q;
			const isImages = payload.t === "images";
			const isNews = payload.t === "news";

			const Cl = await jwtVerify(headers["x-galileo-jwt"], secret);

			if (Cl.payload.v !== q) {
				return ["invalid v"];
			}

			if (page < 0 || page > 100) {
				return [];
			}

			set.headers["content-type"] = "application/json";
			set.headers["cache-control"] = "public, max-age=300";

			const results = isImages
				? await searchImages(q, page)
				: isNews
					? await searchNews(q, page)
					: await searchMixed(q, page);

			if (results?.more_results_available) {
				set.headers["x-galileo-upk"] = await sign(
					{
						q: q,
						p: page + 1,
						...(isImages ? { t: "images" } : isNews ? { t: "news" } : {}),
					},
					"2h",
				);
			}

			return results;
		},
		{
			body: t.String(),
		},
	)
	.get("/s/:file", ({ set, params }) => {
		if (params.file.includes("/") || params.file.includes("..")) return "no";

		set.headers["cache-control"] = "public, max-age=5184000";
		return Bun.file(`./public/assets/${params.file}`);
	})
	.listen(process.env.PORT || 3000, () => {
		console.log(
			`app is running on http://localhost:${process.env.PORT || 3000}`,
		);
	});
