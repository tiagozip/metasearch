export const EFFECTS = ["none", "dither", "ascii", "halftone", "scanlines"];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const GLYPHS = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 4, 0],
  [0, 4, 0, 0, 4, 0, 0],
  [0, 0, 0, 14, 0, 0, 0],
  [0, 0, 14, 0, 14, 0, 0],
  [0, 4, 4, 31, 4, 4, 0],
  [0, 21, 14, 31, 14, 21, 0],
  [10, 10, 31, 10, 31, 10, 10],
  [17, 2, 4, 4, 8, 16, 17],
  [14, 17, 23, 21, 23, 16, 14],
];

const read = (k) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};

export const wallpaperPrefs = () => {
  const kind = read("ms-wp");
  const image = read("ms-wp-img");
  const effect = EFFECTS.includes(read("ms-wp-fx"))
    ? read("ms-wp-fx")
    : "dither";
  return kind === "custom" && image ? { src: image, effect } : null;
};

const surface = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const treat = (source, effect) => {
  const { width: w, height: h } = source;
  const src = source.getContext("2d").getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  const o = out.data;
  const at = (x, y) => (Math.min(y, h - 1) * w + Math.min(x, w - 1)) * 4;
  const luma = (i) =>
    0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];

  if (effect === "dither") {
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const s = at(x + 1, y + 1);
        const peak = Math.max(src[s], src[s + 1], src[s + 2]);
        const gain =
          peak / 255 > (BAYER[((y / 2) % 4) * 4 + ((x / 2) % 4)] + 0.5) / 16
            ? 255 / Math.max(peak, 1)
            : 0.08;
        for (let dy = 0; dy < 2 && y + dy < h; dy++) {
          for (let dx = 0; dx < 2 && x + dx < w; dx++) {
            const i = ((y + dy) * w + x + dx) * 4;
            for (let k = 0; k < 3; k++)
              o[i + k] = Math.min(255, src[s + k] * gain);
            o[i + 3] = src[s + 3];
          }
        }
      }
    }
  } else if (effect === "ascii") {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = at(Math.floor(x / 6) * 6 + 3, Math.floor(y / 8) * 8 + 4);
        const glyph = GLYPHS[Math.floor(Math.sqrt(luma(s) / 255) * 9)];
        const ink =
          x % 6 < 5 && y % 8 < 7 && glyph[y % 8] & (1 << (4 - (x % 6)));
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++)
          o[i + k] = src[i + k] * 0.6 + (ink ? src[s + k] * 0.4 : 0);
        o[i + 3] = src[i + 3];
      }
    }
  } else if (effect === "halftone") {
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const radius = 2 * (0.3 + 0.7 * Math.sqrt(luma(at(x, y)) / 255));
        const d = at(x + 2, y + 2);
        for (let dy = 0; dy < 4 && y + dy < h; dy++) {
          for (let dx = 0; dx < 4 && x + dx < w; dx++) {
            const cover =
              Math.min(
                1,
                Math.max(0, radius + 0.5 - Math.hypot(dx - 1.5, dy - 1.5)),
              ) *
              (src[d + 3] / 255);
            const i = ((y + dy) * w + x + dx) * 4;
            for (let k = 0; k < 3; k++)
              o[i + k] = src[i + k] * 0.6 + src[d + k] * cover * 0.4;
            o[i + 3] = src[i + 3];
          }
        }
      }
    }
  } else {
    for (let i = 0; i < o.length; i += 4) {
      const gain =
        effect === "scanlines" && Math.floor(i / 4 / w) % 3 === 0 ? 0.52 : 1;
      for (let k = 0; k < 3; k++) o[i + k] = src[i + k] * gain;
      o[i + 3] = src[i + 3];
    }
  }
  const c = surface(w, h);
  c.getContext("2d").putImageData(out, 0, 0);
  return c;
};

const canvas = document.createElement("canvas");
canvas.className = "wallpaper";
canvas.setAttribute("aria-hidden", "true");
const ctx = canvas.getContext("2d");
const treated = new Map();
let current;
let source;
let loaded = "";
let frame = 0;

const draw = () => {
  frame = 0;
  const art = current && treated.get(current.effect);
  if (!art || !canvas.isConnected) return;
  const dpr = devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  const w = Math.round(box.width * dpr);
  const h = Math.round(box.height * dpr);
  if (!w || !h) return;
  canvas.width = w;
  canvas.height = h;

  const s = Math.max(w / art.width, (h * 0.8) / art.height);
  const aw = art.width * s;
  const ah = art.height * s;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(art, (w - aw) / 2, h - ah, aw, ah);

  const step = 4;
  const mw = Math.ceil(box.width / step);
  const mh = Math.ceil(box.height / step);
  const mask = new ImageData(mw, mh);
  for (let mx = 0; mx < mw; mx++) {
    const edge = Math.abs(((mx + 0.5) * step) / box.width - 0.5) * 2;
    const lift = edge ** 2.2;
    const start = 0.42 - 0.1 * lift;
    const end = 1 - 0.28 * lift;
    for (let my = 0; my < mh; my++) {
      const t = Math.min(
        1,
        Math.max(0, (((my + 0.5) * step) / box.height - start) / (end - start)),
      );
      mask.data[(my * mw + mx) * 4 + 3] = Math.round(
        t * t * (3 - 2 * t) * 0.7 * 255,
      );
    }
  }
  const m = surface(mw, mh);
  m.getContext("2d").putImageData(mask, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(m, 0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
};

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(draw);
};

const apply = async () => {
  const next = wallpaperPrefs();
  current = next;
  document.documentElement.toggleAttribute("data-wallpaper", !!next);
  if (!next) {
    canvas.classList.remove("shown");
    return;
  }
  if (loaded !== next.src) {
    const img = new Image();
    img.src = next.src;
    try {
      await img.decode();
    } catch {
      return;
    }
    if (current !== next) return;
    const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    source = surface(
      Math.round(img.naturalWidth * k),
      Math.round(img.naturalHeight * k),
    );
    const sctx = source.getContext("2d");
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(img, 0, 0, source.width, source.height);
    treated.clear();
    loaded = next.src;
  }
  if (!treated.has(next.effect))
    treated.set(next.effect, treat(source, next.effect));
  if (!canvas.isConnected) document.body.prepend(canvas);
  draw();
  requestAnimationFrame(() => canvas.classList.add("shown"));
};

addEventListener("resize", schedule);
addEventListener("ms-prefs", apply);
document.fonts?.ready.then(schedule);
apply();
