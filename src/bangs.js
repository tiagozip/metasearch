import bangs from "./bangs-data.json";

const bangKeys = Object.keys(bangs);

export default function checkBang(string) {
	if (!string.includes("!")) return;

	const tokens = string.split(" ");
	// console.log(tokens)
	let match = null;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t[0] !== "!") continue;
		const name = t.slice(1).toLowerCase();
		if (bangKeys.includes(name)) {
			match = name;
			break;
		}
	}

	if (!match) return;

	return bangs[match].replaceAll(
		"%s",
		encodeURIComponent(string.replace(`!${match}`, "").trim()),
	);
}
