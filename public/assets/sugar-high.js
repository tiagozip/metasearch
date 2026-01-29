// https://cdn.jsdelivr.net/npm/sugar-high@0.9.5
const JSXBrackets = new Set(["<", ">", "{", "}", "[", "]"]),
	Keywords_Js = new Set([
		"for",
		"do",
		"while",
		"if",
		"else",
		"return",
		"function",
		"var",
		"let",
		"const",
		"true",
		"false",
		"undefined",
		"this",
		"new",
		"delete",
		"typeof",
		"in",
		"instanceof",
		"void",
		"break",
		"continue",
		"switch",
		"case",
		"default",
		"throw",
		"try",
		"catch",
		"finally",
		"debugger",
		"with",
		"yield",
		"async",
		"await",
		"class",
		"extends",
		"super",
		"import",
		"export",
		"from",
		"static",
	]),
	Signs = new Set([
		"+",
		"-",
		"*",
		"/",
		"%",
		"=",
		"!",
		"&",
		"|",
		"^",
		"~",
		"!",
		"?",
		":",
		".",
		",",
		";",
		"'",
		'"',
		".",
		"(",
		")",
		"[",
		"]",
		"#",
		"@",
		"\\",
		...JSXBrackets,
	]),
	DefaultOptions = {
		keywords: Keywords_Js,
		onCommentStart: isCommentStart_Js,
		onCommentEnd: isCommentEnd_Js,
	},
	TokenTypes = [
		"identifier",
		"keyword",
		"string",
		"class",
		"property",
		"entity",
		"jsxliterals",
		"sign",
		"comment",
		"break",
		"space",
	],
	[
		T_IDENTIFIER,
		T_KEYWORD,
		T_STRING,
		T_CLS_NUMBER,
		T_PROPERTY,
		T_ENTITY,
		T_JSX_LITERALS,
		T_SIGN,
		T_COMMENT,
		T_BREAK,
		T_SPACE,
	] = TokenTypes.map((e, t) => t);
function isSpaces(e) {
	return /^[^\S\r\n]+$/g.test(e);
}
function isSign(e) {
	return Signs.has(e);
}
function encode(e) {
	return e
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
function isWord(e) {
	return /^[\w_]+$/.test(e) || hasUnicode(e);
}
function isCls(e) {
	const t = e[0];
	return (isWord(t) && t === t.toUpperCase()) || "null" === e;
}
function hasUnicode(e) {
	return /[^\u0000-\u007f]/.test(e);
}
function isAlpha(e) {
	return /^[a-zA-Z]$/.test(e);
}
function isIdentifierChar(e) {
	return isAlpha(e) || hasUnicode(e);
}
function isIdentifier(e) {
	return isIdentifierChar(e[0]) && (1 === e.length || isWord(e.slice(1)));
}
function isStrTemplateChr(e) {
	return "`" === e;
}
function isSingleQuotes(e) {
	return '"' === e || "'" === e;
}
function isStringQuotation(e) {
	return isSingleQuotes(e) || isStrTemplateChr(e);
}
function isCommentStart_Js(e, t) {
	const n = e + t;
	return "/*" === n ? 2 : "//" === n ? 1 : 0;
}
function isCommentEnd_Js(e, t) {
	return e + t === "*/" ? 2 : "\n" === t ? 1 : 0;
}
function isRegexStart(e) {
	return "/" === e[0] && !isCommentStart_Js(e[0], e[1]);
}
function tokenize(e, t) {
	const {
		keywords: n,
		onCommentStart: i,
		onCommentEnd: s,
	} = { ...DefaultOptions, ...t };
	let r = "",
		o = -1,
		c = [-1, ""],
		a = [-2, ""];
	const u = [];
	let l = !1,
		T = 0,
		f = !1,
		p = 0;
	const S = () => l && !f && !T,
		_ = () => T && !S(),
		h = () => !T && S() && !f && p > 0;
	let g = null,
		m = !1,
		d = 0,
		I = 0;
	const N = () => null !== g,
		E = () => I > d,
		R = () => N() || E();
	const C = (e, t) => {
		if ((t && (r = t), r)) {
			o =
				e ||
				(function (e) {
					const t = "\n" === e;
					if (_()) {
						if (N()) return T_STRING;
						const [, t] = c;
						if (isIdentifier(e) && ("<" === t || "</" === t)) return T_ENTITY;
					}
					if (h()) return T_JSX_LITERALS;
					if (N() || E()) return T_STRING;
					if (n.has(e)) return "." === c[1] ? T_IDENTIFIER : T_KEYWORD;
					if (t) return T_BREAK;
					if (isSpaces(e)) return T_SPACE;
					if (e.split("").every(isSign)) return T_SIGN;
					if (isCls(e)) return _() ? T_IDENTIFIER : T_CLS_NUMBER;
					if (isIdentifier(e)) {
						const e = "." === c[1] && isIdentifier(a[1]);
						if (!R() && !e) return T_IDENTIFIER;
						if (e) return T_PROPERTY;
					}
					return T_STRING;
				})(r);
			const t = [o, r];
			o !== T_SPACE && o !== T_BREAK && ((a = c), (c = t)), u.push(t);
		}
		r = "";
	};
	for (let t = 0; t < e.length; t++) {
		const n = e[t],
			o = e[t - 1],
			a = e[t + 1],
			u = o + n,
			_ = n + a;
		if (isSingleQuotes(n) && !h() && !E()) {
			C(),
				"\\" !== o && (g && n === g ? (g = null) : g || (g = n)),
				C(T_STRING, n);
			continue;
		}
		if (!E() && "\\n" !== o && isStrTemplateChr(n)) {
			C(), C(T_STRING, n), I++;
			continue;
		}
		if (E()) {
			if ("\\n" !== o && isStrTemplateChr(n) && I > 0) {
				C(), I--, C(T_STRING, n);
				continue;
			}
			if ("${" === _) {
				d++, C(T_STRING), C(T_SIGN, _), t++;
				continue;
			}
		}
		if (I > 0 && I === d && "}" === n) {
			C(), d--, C(T_SIGN, n);
			continue;
		}
		if (S() && "{" === n) {
			C(), C(T_SIGN, n), (f = !0);
			continue;
		}
		if (l) {
			if (!T && "<" === n) {
				C(),
					"/" === a ? ((T = 2), (r = _), t++) : ((T = 1), (r = n)),
					C(T_SIGN);
				continue;
			}
			if (T) {
				if (">" === n && !"/=".includes(o)) {
					C(), 1 === T ? ((T = 0), p++) : ((T = 0), (l = !1)), C(T_SIGN, n);
					continue;
				}
				if ("/>" === _ || "</" === _) {
					"<" !== r && "/" !== r && C(),
						"/>" === _ ? (T = 0) : p--,
						p || (l = !1),
						(r = _),
						t++,
						C(T_SIGN);
					continue;
				}
				if ("<" === n) {
					C(), (r = n), C(T_SIGN);
					continue;
				}
				if ("-" === a && !R() && !h() && r) {
					C(T_PROPERTY, r + n + a), t++;
					continue;
				}
				if ("=" === a && !R() && !isSpaces(n)) {
					isSpaces(r) && C();
					const e = r + n;
					if (isIdentifier(e)) {
						C(T_PROPERTY, e);
						continue;
					}
				}
			}
		}
		!T &&
			(("<" === n && isIdentifierChar(a)) || "</" === _) &&
			((T = "/" === a ? 2 : 1),
			"<" !== n || ("/" !== a && !isAlpha(a)) || R() || h() || m || (l = !0));
		const N = isStringQuotation(n),
			y = E(),
			k = !l && isRegexStart(_),
			G = h();
		if (N || y || isSingleQuotes(g)) r += n;
		else if (k) {
			C();
			const [i, s] = c;
			if (k && -1 !== i && (i !== T_SIGN || ")" === s) && i !== T_COMMENT) {
				(r = n), C();
				continue;
			}
			m = !0;
			const o = t++,
				a = () => t >= e.length,
				u = () => a() || "\n" === e[t];
			let l = !1;
			for (; !u(); t++)
				if ("/" === e[t] && "\\" !== e[t - 1]) {
					for (l = !0; o !== t && /^[a-z]$/.test(e[t + 1]) && !u(); ) t++;
					break;
				}
			(m = !1),
				o !== t && l
					? ((r = e.slice(o, t + 1)), C(T_STRING))
					: ((r = n), C(), (t = o));
		} else if (i(n, a)) {
			C();
			const o = t,
				c = i(n, a);
			if (c)
				for (; t < e.length; t++) {
					if (s(e[t - 1], e[t]) == c) break;
				}
			(r = e.slice(o, t + 1)), C(T_COMMENT);
		} else
			" " === n || "\n" === n
				? " " !== n || (!isSpaces(r) && r && !G)
					? (C(), (r = n), C())
					: ((r += n), "<" === a && C())
				: f && "}" === n
					? (C(), (r = n), C(), (f = !1))
					: (G && !JSXBrackets.has(n)) ||
							E() ||
							((isWord(n) === isWord(r[r.length - 1]) || S()) && !Signs.has(n))
						? (r += n)
						: ("</" === u && (r = u),
							C(),
							"</" !== u && (r = n),
							"</" === _ || "/>" === _
								? ((r = _), C(), t++)
								: JSXBrackets.has(n) && C());
	}
	return C(), u;
}
function generate(e) {
	const t = [];
	function n(e) {
		const n = e.map(([e, t]) => {
			const n = TokenTypes[e];
			return {
				type: "element",
				tagName: "span",
				children: [{ type: "text", value: t }],
				properties: {
					className: `sh__token--${n}`,
					style: { color: `var(--sh-${n})` },
				},
			};
		});
		t.push({
			type: "element",
			tagName: "span",
			children: n,
			properties: { className: "sh__line" },
		});
	}
	const i = [];
	let s = !1;
	for (let t = 0; t < e.length; t++) {
		const r = e[t],
			[o, c] = r,
			a = t === e.length - 1;
		if (o !== T_BREAK) {
			if (c.includes("\n")) {
				const e = c.split("\n");
				for (let t = 0; t < e.length; t++)
					i.push([o, e[t]]), t < e.length - 1 && (n(i), (i.length = 0));
			} else i.push(r);
			s = !1;
		} else s ? n([]) : (n(i), (i.length = 0)), a && n([]), (s = !0);
	}
	return i.length && n(i), t;
}
const propsToString = (e) => {
	let t = `class="${e.className}"`;
	if (e.style) {
		t += ` style="${Object.entries(e.style)
			.map(([e, t]) => `${e}:${t}`)
			.join(";")}"`;
	}
	return t;
};
function toHtml(e) {
	return e
		.map((e) => {
			const { tagName: t } = e,
				n = e.children
					.map((e) => {
						const { tagName: t, children: n, properties: i } = e;
						return `<${t} ${propsToString(i)}>${encode(n[0].value)}</${t}>`;
					})
					.join("");
			return `<${t} class="${e.properties.className}">${n}</${t}>`;
		})
		.join("\n");
}
function highlight(e, t) {
	return toHtml(generate(tokenize(e, t)));
}
const SugarHigh = {
	TokenTypes: TokenTypes,
	TokenMap: new Map(TokenTypes.map((e, t) => [e, t])),
};
export { highlight, tokenize, generate, SugarHigh };
//# sourceMappingURL=/sm/5327ef91bfc88be0796d8ad77dd3b267035b1b49f03e990b93fb3fab450652ea.map
