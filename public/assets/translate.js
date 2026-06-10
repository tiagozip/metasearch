import {
  browserTargetLang,
  langByCode,
  makeLangPicker,
  requestTranslation,
  speakButton,
} from "./langs.js";

const $ = (id) => document.getElementById(id);

const srcText = $("src-text");
const outText = $("out-text");
const status = $("status");
const count = $("count");
const dict = $("dict");
const swapBtn = $("swap");
const srcTranslit = $("src-translit");
const outTranslit = $("out-translit");
const altsEl = $("alts");
const dymEl = $("dym");

const params = new URLSearchParams(location.search);
const validLang = (c, allowAuto) =>
  c && (langByCode(c) || (allowAuto && c === "auto")) ? c : null;

const initialSl =
  validLang(params.get("sl"), true) ||
  validLang(localStorage.getItem("tr:sl"), true) ||
  "auto";
const initialTl =
  validLang(params.get("tl")) ||
  validLang(localStorage.getItem("tr:tl")) ||
  browserTargetLang();

let tlTouched = !!params.get("tl");
let autoFlipped = false;

const slP = makeLangPicker({
  value: initialSl,
  detect: true,
  onChange: () => translateNow(0),
});
const tlP = makeLangPicker({
  value: initialTl,
  onChange: () => {
    tlTouched = true;
    translateNow(0);
  },
});
$("src-slot").append(slP.el);
$("tgt-slot").append(tlP.el);

srcText.value = (params.get("text") || "").slice(0, 5000);

const setPlaceholder = () => {
  outText.replaceChildren(
    Object.assign(document.createElement("span"), {
      className: "placeholder",
      textContent: "translation",
    }),
  );
  outText.classList.remove("err");
};

const syncUrl = () => {
  const q = new URLSearchParams();
  q.set("sl", slP.value);
  q.set("tl", tlP.value);
  if (srcText.value.trim()) q.set("text", srcText.value.slice(0, 2000));
  history.replaceState(null, "", `/translate?${q}`);
  localStorage.setItem("tr:sl", slP.value);
  localStorage.setItem("tr:tl", tlP.value);
};

const syncSwap = () => {
  swapBtn.disabled = slP.value === "auto" && !slP.detected;
};

const syncCount = () => {
  count.textContent = `${srcText.value.length} / 5000`;
};

const single = (s) =>
  /^\p{L}[\p{L}'’-]*$/u.test(s.trim()) && s.trim().length <= 30;
const base = (c) =>
  String(c || "")
    .split("-")[0]
    .toLowerCase();

let dictCtrl;
const renderDict = async (word) => {
  dictCtrl?.abort();
  dictCtrl = new AbortController();
  try {
    const res = await fetch(`/dict/${encodeURIComponent(word)}`, {
      signal: dictCtrl.signal,
    });
    if (!res.ok) return;
    const entries = await res.json();
    const e0 = entries?.[0];
    if (!e0?.meanings?.length) return;
    const head = document.createElement("div");
    head.className = "dict-head";
    const w = document.createElement("span");
    w.className = "dict-word";
    w.textContent = e0.word;
    head.append(w);
    if (e0.phonetic) {
      const ipa = document.createElement("span");
      ipa.className = "dict-ipa";
      ipa.textContent = e0.phonetic;
      head.append(ipa);
    }
    const rows = e0.meanings.slice(0, 3).map((m) => {
      const row = document.createElement("div");
      row.className = "dict-meaning";
      const pos = document.createElement("span");
      pos.className = "dict-pos";
      pos.textContent = m.partOfSpeech;
      row.append(pos, m.definitions?.[0]?.definition || "");
      return row;
    });
    const note = document.createElement("div");
    note.className = "dict-note";
    note.textContent = "english dictionary";
    dict.replaceChildren(head, ...rows, note);
  } catch {}
};

const clearExtras = () => {
  srcTranslit.textContent = "";
  outTranslit.textContent = "";
  altsEl.replaceChildren();
  dymEl.replaceChildren();
  dict.replaceChildren();
};

const renderExtras = (data) => {
  outTranslit.textContent = data.transliteration || "";
  srcTranslit.textContent = data.srcTransliteration || "";
  if (data.alternatives?.length) {
    const label = document.createElement("span");
    label.className = "alts-label";
    label.textContent = "alternatives";
    altsEl.append(label);
    for (const a of data.alternatives) {
      const chip = document.createElement("button");
      chip.className = "alt";
      chip.dir = "auto";
      chip.textContent = a;
      chip.title = a;
      chip.onclick = () => {
        outText.textContent = a;
        outTranslit.textContent = "";
      };
      altsEl.append(chip);
    }
  }
  if (data.didYouMean) {
    const fix = document.createElement("button");
    fix.className = "dym-btn";
    fix.textContent = data.didYouMean;
    fix.onclick = () => {
      srcText.value = data.didYouMean;
      syncCount();
      translateNow(0);
    };
    dymEl.append("did you mean: ", fix);
  }
};

let ctrl, timer;
const run = async () => {
  ctrl?.abort();
  dictCtrl?.abort();
  clearExtras();
  const value = srcText.value.trim();
  syncUrl();
  if (!value) {
    setPlaceholder();
    status.textContent = "";
    slP.setDetected(null);
    syncSwap();
    return;
  }
  ctrl = new AbortController();
  status.textContent = "translating…";
  try {
    const data = await requestTranslation(
      {
        text: value,
        targetLang: tlP.value,
        ...(slP.value !== "auto" && { sourceLang: slP.value }),
      },
      ctrl.signal,
    );
    const det = slP.value === "auto" ? data.detectedLang : slP.value;
    if (
      !tlTouched &&
      !autoFlipped &&
      slP.value === "auto" &&
      det &&
      base(langByCode(det)?.code) === base(tlP.value)
    ) {
      const alt =
        base(browserTargetLang()) !== base(det)
          ? browserTargetLang()
          : base(det) !== "en"
            ? "en"
            : null;
      if (alt) {
        autoFlipped = true;
        tlP.value = alt;
        run();
        return;
      }
    }
    outText.textContent = data.translatedText;
    outText.classList.remove("err");
    status.textContent = "";
    if (slP.value === "auto") slP.setDetected(data.detectedLang);
    syncSwap();
    renderExtras(data);
    let word = null;
    if (base(tlP.value) === "en" && single(data.translatedText))
      word = data.translatedText;
    else if (base(det) === "en" && single(value)) word = value;
    if (word) renderDict(word.toLowerCase());
  } catch (e) {
    if (e.name === "AbortError") return;
    outText.textContent = e.message || "translation failed";
    outText.classList.add("err");
    status.textContent = "";
  }
};

const translateNow = (delay = 400) => {
  clearTimeout(timer);
  timer = setTimeout(run, delay);
};

srcText.addEventListener("input", () => {
  autoFlipped = false;
  syncCount();
  translateNow();
});
srcText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) translateNow(0);
});

$("clear").onclick = () => {
  srcText.value = "";
  syncCount();
  srcText.focus();
  translateNow(0);
};

swapBtn.onclick = () => {
  const from = slP.value === "auto" ? slP.detected : slP.value;
  if (!from) return;
  const to = tlP.value;
  slP.value = to;
  tlP.value = from;
  if (
    !outText.classList.contains("err") &&
    !outText.querySelector(".placeholder")
  )
    srcText.value = outText.textContent.slice(0, 5000);
  syncCount();
  translateNow(0);
};

{
  const CHECK = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10"/></svg>`;
  const copy = $("copy");
  const original = copy.innerHTML;
  copy.onclick = () => {
    if (outText.querySelector(".placeholder")) return;
    navigator.clipboard?.writeText(outText.textContent);
    copy.innerHTML = CHECK;
    copy.classList.add("done");
    setTimeout(() => {
      copy.innerHTML = original;
      copy.classList.remove("done");
    }, 1400);
  };
}

$("speak-src").replaceWith(
  speakButton(
    () => srcText.value,
    () => (slP.value === "auto" ? slP.detected : slP.value),
    "iconbtn",
  ),
);
$("speak-out").replaceWith(
  speakButton(
    () => (outText.querySelector(".placeholder") ? "" : outText.textContent),
    () => tlP.value,
    "iconbtn",
  ),
);

syncCount();
syncSwap();
setPlaceholder();
if (srcText.value.trim()) translateNow(0);
srcText.focus();
