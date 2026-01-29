import { mkdirSync } from "node:fs";

const BANGS_CACHE_FOLDER = ".data/bangs";

let bangs = {};

(async () => {
	try {
		bangs = await Bun.file(`${BANGS_CACHE_FOLDER}/bangs.json`).json();
	} catch {
		mkdirSync(BANGS_CACHE_FOLDER, { recursive: true });

		const text = await (
			await fetch("https://files.helium.computer/bangs.json")
		).text();
		const json = JSON.parse(
			text
				.replace(/^\/\/.*$/gm, "")
				.replace(/,(\s*])/g, "$1")
				.replace(/,(\s*})/g, "$1"),
		);

		json.forEach((bang) => {
			bang.ts.forEach((ts) => {
				bangs[ts] = bang.u.replace("{searchTerms}", "%s");
			});
		});

		Bun.write(`${BANGS_CACHE_FOLDER}/bangs.json`, JSON.stringify(bangs));
	}
})();

export default (string) => {
	if (!bangs || !string.includes("!")) return;

	const bang = Object.keys(bangs).find((b) =>
		string.split(" ").includes(`!${b.toLowerCase()}`),
	);
	if (bang) {
		return bangs[bang].replaceAll(
			"%s",
			encodeURIComponent(string.replace(`!${bang.toLowerCase()}`, "").trim()),
		);
	}
};
