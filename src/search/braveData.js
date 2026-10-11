import { parseExpressionAt } from "acorn";

const globals = { undefined, NaN, Infinity };

const evaluate = (node, scope) => {
  if (!node) return null;
  switch (node.type) {
    case "Literal":
      return node.value;
    case "TemplateLiteral":
      return node.quasis.map((q) => q.value.cooked).join("");
    case "Identifier":
      return node.name in scope ? scope[node.name] : globals[node.name];
    case "UnaryExpression": {
      const v = evaluate(node.argument, scope);
      if (node.operator === "void") return undefined;
      if (node.operator === "-") return -v;
      if (node.operator === "!") return !v;
      return v;
    }
    case "ObjectExpression": {
      const obj = {};
      for (const prop of node.properties) {
        if (prop.type !== "Property") continue;
        obj[prop.key.name ?? prop.key.value] = evaluate(prop.value, scope);
      }
      return obj;
    }
    case "ArrayExpression":
      return node.elements.map((el) => evaluate(el, scope));
    case "CallExpression": {
      const fn = node.callee;
      if (
        fn.type !== "FunctionExpression" &&
        fn.type !== "ArrowFunctionExpression"
      )
        return null;
      const inner = { ...scope };
      fn.params.forEach((p, i) => {
        inner[p.name] = evaluate(node.arguments[i], scope);
      });
      if (fn.body.type !== "BlockStatement") return evaluate(fn.body, inner);
      const ret = fn.body.body.find((s) => s.type === "ReturnStatement");
      return evaluate(ret?.argument, inner);
    }
    default:
      return null;
  }
};

export const braveNodes = (raw) => {
  const start = raw.indexOf("kit.start(");
  const match = /\bdata:\s*\[/g;
  match.lastIndex = start < 0 ? 0 : start;
  const found = match.exec(raw);
  if (!found) throw new Error("brave data block missing");
  const ast = parseExpressionAt(raw, found.index + found[0].length - 1, {
    ecmaVersion: 2022,
  });
  return evaluate(ast.expressions?.[0] ?? ast, {});
};

export const braveChallenge = (raw) => {
  try {
    return braveNodes(raw).find((n) => n?.data?.challengeSet)?.data
      .challengeSet;
  } catch {
    return null;
  }
};

export default function braveData(raw) {
  const page = braveNodes(raw).findLast(
    (n) => n?.type === "data" && (n.data?.body || n.data?.response),
  );
  if (!page) throw new Error("brave data block has no body");
  return page.data;
}
