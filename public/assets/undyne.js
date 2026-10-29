import * as ort from "/s/ort.wasm.min.mjs";

const MAXLEN = 384;
const STRIDE = 96;
const SEED_T = 0.35;
const EXT_T = 0.21;
const CLS = 101;
const SEP = 102;

ort.env.wasm.wasmPaths = "/s/";
ort.env.wasm.numThreads = 1;

const ready = (async () => {
  const [vocabText, session] = await Promise.all([
    fetch("/s/undyne-vocab.txt").then((r) => r.text()),
    ort.InferenceSession.create("/s/undyne-1.1-light.onnx", {
      executionProviders: ["wasm"],
    }),
  ]);
  const vocab = new Map(vocabText.split("\n").map((w, i) => [w, i]));
  return { vocab, session };
})();

const isPunct = (ch) => /[!-/:-@[-`{-~]|\p{P}/u.test(ch);
const isCjk = (cp) =>
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x20000 && cp <= 0x2a6df) ||
  (cp >= 0x2a700 && cp <= 0x2b73f) ||
  (cp >= 0x2b740 && cp <= 0x2b81f) ||
  (cp >= 0x2b820 && cp <= 0x2ceaf) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x2f800 && cp <= 0x2fa1f);

const tokenize = (vocab, text) => {
  const words = [];
  let word = null;
  const flush = () => {
    if (word) words.push(word);
    word = null;
  };
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const end = i + ch.length;
    if (
      cp === 0 ||
      cp === 0xfffd ||
      (!/[\t\n\r]/.test(ch) && /[\p{Cc}\p{Cf}\p{Cn}\p{Co}]/u.test(ch))
    ) {
      i = end;
      continue;
    }
    if (/[\t\n\r ]|\p{Zs}/u.test(ch)) {
      flush();
      i = end;
      continue;
    }
    const norm = ch
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .toLowerCase();
    if (!norm) {
      i = end;
      continue;
    }
    if (isCjk(cp) || isPunct(ch)) {
      flush();
      words.push({ chars: [...norm].map(() => [i, end]), text: norm });
      i = end;
      continue;
    }
    word ??= { chars: [], text: "" };
    word.chars.push(...[...norm].map(() => [i, end]));
    word.text += norm;
    i = end;
  }
  flush();

  const ids = [];
  const offs = [];
  for (const w of words) {
    const chars = [...w.text];
    if (chars.length > 100) {
      ids.push(vocab.get("[UNK]"));
      offs.push([w.chars[0][0], w.chars.at(-1)[1]]);
      continue;
    }
    const pieces = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let id;
      while (start < end) {
        const sub = `${start > 0 ? "##" : ""}${chars.slice(start, end).join("")}`;
        id = vocab.get(sub);
        if (id !== undefined) break;
        end--;
      }
      if (id === undefined) {
        pieces.length = 0;
        break;
      }
      pieces.push([id, w.chars[start][0], w.chars[end - 1][1]]);
      start = end;
    }
    if (!pieces.length) {
      ids.push(vocab.get("[UNK]"));
      offs.push([w.chars[0][0], w.chars.at(-1)[1]]);
      continue;
    }
    for (const [id, b, e] of pieces) {
      ids.push(id);
      offs.push([b, e]);
    }
  }
  return { ids, offs };
};

const runWindow = async (session, qIds, ids, offs) => {
  const seq = qIds.length
    ? [CLS, ...qIds, SEP, ...ids, SEP]
    : [CLS, ...ids, SEP];
  const first = qIds.length ? qIds.length + 2 : 1;
  const types = seq.map((_, i) => (qIds.length && i >= first ? 1 : 0));
  const n = seq.length;
  const tensor = (arr) =>
    new ort.Tensor("int64", BigInt64Array.from(arr, BigInt), [1, n]);
  const { logits } = await session.run({
    input_ids: tensor(seq),
    attention_mask: tensor(seq.map(() => 1)),
    token_type_ids: tensor(types),
  });
  const data = logits.data;
  return ids.map((_, i) => {
    const k = (first + i) * 3;
    const m = Math.max(data[k], data[k + 1], data[k + 2]);
    const e0 = Math.exp(data[k] - m);
    const e1 = Math.exp(data[k + 1] - m);
    const e2 = Math.exp(data[k + 2] - m);
    return [offs[i][0], offs[i][1], (e1 + e2) / (e0 + e1 + e2)];
  });
};

const isAlnum = (ch) => /[\p{L}\p{N}]/u.test(ch ?? "");

const decode = (toks, answer) => {
  const on = new Set();
  toks.forEach(([, , p], i) => {
    if (p > SEED_T) on.add(i);
  });
  for (const k of [...on]) {
    for (const step of [-1, 1]) {
      let j = k + step;
      while (j >= 0 && j < toks.length && !on.has(j) && toks[j][2] > EXT_T) {
        on.add(j);
        j += step;
      }
    }
  }
  const raw = [];
  let cur = null;
  toks.forEach(([b, e], i) => {
    if (!on.has(i)) {
      if (cur) raw.push(cur);
      cur = null;
      return;
    }
    if (cur && b - cur[1] <= 1 && !answer.slice(cur[1], b).includes("\n")) {
      cur[1] = e;
      return;
    }
    if (cur) raw.push(cur);
    cur = [b, e];
  });
  if (cur) raw.push(cur);

  const out = [];
  for (const [b, e] of raw) {
    const parts = [];
    let start = b;
    for (let i = b; i < e; i++) {
      if (answer[i] !== "\n") continue;
      if (i > start) parts.push([start, i]);
      start = i + 1;
    }
    if (e > start) parts.push([start, e]);
    for (let [pb, pe] of parts) {
      while (pb < pe && "-*• \t".includes(answer[pb])) pb++;
      while (pb > 0 && isAlnum(answer[pb - 1])) pb--;
      while (pe < answer.length && isAlnum(answer[pe])) pe++;
      const last = out.at(-1);
      const gap = last && answer.slice(last[1], pb);
      if (
        last &&
        pb - last[1] <= 2 &&
        !gap.includes("\n") &&
        !/[.;]/.test(gap)
      ) {
        last[1] = pe;
      } else {
        out.push([pb, pe]);
      }
    }
  }
  return out.filter(([b, e]) => answer.slice(b, e).trim().length >= 3);
};

const spans = async (answer, question = "") => {
  if (!answer.trim()) return [];
  const { vocab, session } = await ready;
  const qIds = question.trim() ? tokenize(vocab, question).ids : [];
  const budget = qIds.length ? MAXLEN - (qIds.length + 2) - 8 : MAXLEN - 4;
  const { ids, offs } = tokenize(vocab, answer);
  if (ids.length <= budget) {
    return decode(await runWindow(session, qIds, ids, offs), answer);
  }
  const step = Math.max(1, budget - STRIDE);
  const seen = new Map();
  for (let s0 = 0; s0 < ids.length; s0 += step) {
    const win = await runWindow(
      session,
      qIds,
      ids.slice(s0, s0 + budget),
      offs.slice(s0, s0 + budget),
    );
    for (const [b, e, p] of win) {
      const key = `${b},${e}`;
      seen.set(key, [b, e, Math.max(seen.get(key)?.[2] ?? 0, p)]);
    }
    if (s0 + budget >= ids.length) break;
  }
  const toks = [...seen.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return decode(toks, answer);
};

self.onmessage = async ({ data: { id, answer, question } }) => {
  try {
    self.postMessage({ id, spans: await spans(answer, question) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
