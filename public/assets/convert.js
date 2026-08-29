const AUDIO = [
  "mp3",
  "wav",
  "flac",
  "ogg",
  "opus",
  "aac",
  "m4a",
  "alac",
  "aiff",
  "wma",
  "ac3",
  "amr",
  "au",
  "weba",
  "mp2",
];

const VIDEO = [
  "mp4",
  "mkv",
  "webm",
  "mov",
  "avi",
  "wmv",
  "flv",
  "mpg",
  "m4v",
  "ts",
  "3gp",
  "ogv",
];

const IMAGE = [
  "png",
  "jpg",
  "webp",
  "gif",
  "bmp",
  "avif",
  "svg",
  "ico",
  "heic",
  "tiff",
];

const IMAGE_TARGETS = ["png", "jpg", "webp"];

export const ALL_FORMATS = [...new Set([...AUDIO, ...VIDEO, ...IMAGE])];

const norm = (e) =>
  ({ jpeg: "jpg", tif: "tiff", heif: "heic", mpeg: "mpg" })[e] || e;

export const kindOf = (ext) => {
  const e = norm(ext);
  if (IMAGE.includes(e)) return "image";
  if (AUDIO.includes(e)) return "audio";
  if (VIDEO.includes(e)) return "video";
  return null;
};

export function targetsFor(ext) {
  const e = norm(ext);
  if (e === "gif") return ["png", "jpg", "webp", "mp4", "webm"];
  const k = kindOf(e);
  if (k === "image") return IMAGE_TARGETS.filter((t) => t !== e);
  if (k === "audio") return AUDIO.filter((t) => t !== e);
  if (k === "video")
    return [...VIDEO.filter((t) => t !== e), "gif", ...AUDIO, "png", "jpg"];
  return [];
}

export const extOf = (name) =>
  norm((name.split(".").pop() || "").toLowerCase());

const MIME = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  opus: "audio/opus",
  aac: "audio/aac",
  m4a: "audio/mp4",
  alac: "audio/mp4",
  weba: "audio/webm",
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
export const mimeFor = (ext) => MIME[norm(ext)] || "application/octet-stream";

export const outExtFor = (ext) => (norm(ext) === "alac" ? "m4a" : norm(ext));

export function humanSize(n) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let i = -1;
  let v = n;
  while (v >= 1024 && i < 2) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

const SEP = /\s+(?:to|into|2)\s+|\s*(?:->|→|=>)\s*/;
const TAIL = /\s+(?:converter|conversion|convertor|online|free|file|format)$/;

export function parseConvertQuery(query) {
  let t = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (t.length > 60) return null;

  const verb = /^(?:how (?:do i|to) )?(?:convert|change|turn|transcode) /;
  const hint = verb.test(t) || TAIL.test(t);
  t = t.replace(verb, "").replace(TAIL, "");

  const parts = t.split(SEP);
  if (parts.length === 2) {
    const from = norm(parts[0].replace(/^\./, "").trim());
    const to = norm(parts[1].replace(/^\./, "").trim());
    if (!kindOf(from) || !kindOf(to)) return null;
    if (!targetsFor(from).includes(to)) return null;
    return { from, to };
  }

  const one = t.replace(/^\./, "");
  if (hint && kindOf(one)) return { from: one, to: null };
  if (hint && /^(?:a )?(?:file|video|audio|image|media)s?$/.test(one))
    return { from: null, to: null };
  if (/^(?:file|video|audio|image|media)?\s*convert(?:er|or)$/.test(t))
    return { from: null, to: null };
  return null;
}

const MB = "https://cdn.jsdelivr.net/npm/mediabunny@1.55.2/+esm";
const MB_POLYFILL = {
  mp3: [
    "https://cdn.jsdelivr.net/npm/@mediabunny/mp3-encoder@1.55.3/+esm",
    "registerMp3Encoder",
  ],
  flac: [
    "https://cdn.jsdelivr.net/npm/@mediabunny/flac-encoder@1.55.3/+esm",
    "registerFlacEncoder",
  ],
};

const MB_INPUTS = new Set([
  "mp4",
  "m4v",
  "m4a",
  "mov",
  "mkv",
  "webm",
  "weba",
  "mp3",
  "wav",
  "ogg",
  "opus",
  "aac",
  "flac",
  "ts",
]);

const MB_OUTPUTS = {
  mp4: "Mp4",
  m4v: "Mp4",
  m4a: "Mp4",
  mov: "Mov",
  mkv: "Mkv",
  webm: "WebM",
  weba: "WebM",
  ogg: "Ogg",
  opus: "Ogg",
  mp3: "Mp3",
  wav: "Wav",
  aac: "Adts",
  flac: "Flac",
  ts: "MpegTs",
};

let mbPromise = null;
const loadMediabunny = () => {
  mbPromise ??= import(MB);
  return mbPromise;
};

async function encoderReady(mb, codec) {
  const polyfill = MB_POLYFILL[codec];
  if (!polyfill) return true;
  if (await mb.canEncodeAudio(codec)) return true;
  const mod = await import(polyfill[0]);
  mod[polyfill[1]]();
  return mb.canEncodeAudio(codec);
}

async function convertWithMediabunny(file, to, { onProgress }) {
  const mb = await loadMediabunny();
  if (!(await encoderReady(mb, to))) return null;

  const output = new mb.Output({
    format: new mb[`${MB_OUTPUTS[to]}OutputFormat`](),
    target: new mb.BufferTarget(),
  });
  const conversion = await mb.Conversion.init({
    input: new mb.Input({
      source: new mb.BlobSource(file),
      formats: mb.ALL_FORMATS,
    }),
    output,
    ...(kindOf(to) === "audio" ? { video: { discard: true } } : {}),
    ...(to === "opus" ? { audio: { codec: "opus" } } : {}),
  });
  if (!conversion.isValid) return null;

  conversion.onProgress = (p) => onProgress?.(p);
  await conversion.execute();
  if (!output.target.buffer) return null;
  return new Blob([output.target.buffer], { type: mimeFor(to) });
}

const FF = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm";
const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

let ffmpegPromise = null;

function loadFFmpeg() {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const { FFmpeg } = await import(`${FF}/index.js`);
    const ff = new FFmpeg();
    const classWorkerURL = URL.createObjectURL(
      new Blob([`import "${FF}/worker.js";`], { type: "text/javascript" }),
    );
    await ff.load({
      classWorkerURL,
      coreURL: `${CORE}/ffmpeg-core.js`,
      wasmURL: `${CORE}/ffmpeg-core.wasm`,
    });
    URL.revokeObjectURL(classWorkerURL);
    return ff;
  })();
  ffmpegPromise.catch(() => {
    ffmpegPromise = null;
  });
  return ffmpegPromise;
}

export const ffmpegReady = () => Boolean(ffmpegPromise);

function codecArgs(from, to) {
  const k = kindOf(to);

  if (to === "gif")
    return [
      "-vf",
      "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse",
      "-loop",
      "0",
    ];

  if (k === "image") return ["-frames:v", "1"];

  if (k === "audio") {
    const a = kindOf(from) === "video" ? ["-vn"] : [];
    if (to === "mp3") return [...a, "-c:a", "libmp3lame", "-b:a", "192k"];
    if (to === "ogg") return [...a, "-c:a", "libvorbis"];
    if (to === "opus") return [...a, "-c:a", "libopus", "-ar", "48000"];
    if (to === "weba") return [...a, "-c:a", "libopus", "-ar", "48000"];
    if (to === "m4a" || to === "aac")
      return [...a, "-c:a", "aac", "-b:a", "192k"];
    if (to === "alac") return [...a, "-c:a", "alac"];
    return a;
  }

  const even = ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"];
  if (to === "webm" || to === "ogv")
    return [...even, "-c:v", "libvpx", "-c:a", "libvorbis", "-b:v", "1M"];
  if (to === "wmv") return ["-c:v", "wmv2", "-c:a", "wmav2"];
  if (to === "avi" || to === "mpg")
    return ["-c:v", "mpeg4", "-c:a", "libmp3lame"];
  return [
    ...even,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
  ];
}

async function convertWithFFmpeg(file, from, to, { onProgress, onStatus }) {
  onStatus?.(ffmpegReady() ? "starting" : "loading the converter (~32 MB)");
  const ff = await loadFFmpeg();

  const inName = `input.${from}`;
  const outName = `output.${outExtFor(to)}`;

  let log = "";
  const onLog = ({ message }) => {
    log = message;
  };
  const onProg = ({ progress }) => {
    if (progress > 0 && progress <= 1) onProgress?.(progress);
  };
  ff.on("log", onLog);
  ff.on("progress", onProg);

  try {
    onStatus?.("reading file");
    await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
    onStatus?.("converting");
    const code = await ff.exec(["-i", inName, ...codecArgs(from, to), outName]);
    if (code !== 0) throw new Error(log || "ffmpeg failed");
    const data = await ff.readFile(outName);
    if (!data || data.length === 0) throw new Error(log || "empty output");
    return new Blob([data.slice().buffer], { type: mimeFor(to) });
  } finally {
    ff.off("log", onLog);
    ff.off("progress", onProg);
    ff.deleteFile(inName).catch(() => {});
    ff.deleteFile(outName).catch(() => {});
  }
}

async function decodeImage(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "sync";
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error("could not decode this image"));
        img.src = url;
      });
      if (!img.naturalWidth) throw new Error("could not decode this image");
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function convertWithCanvas(file, to) {
  const img = await decodeImage(file);
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (to === "jpg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0);
  img.close?.();

  const type = mimeFor(to);
  const blob = await new Promise((res) => canvas.toBlob(res, type, 0.92));
  if (!blob || blob.type !== type)
    throw new Error(`your browser cannot write ${to}`);
  return blob;
}

export async function convertFile(file, to, opts = {}) {
  const from = extOf(file.name);
  if (!kindOf(from)) throw new Error(`unsupported input format .${from}`);
  if (!targetsFor(from).includes(norm(to)))
    throw new Error(`cannot convert .${from} to .${norm(to)}`);

  const target = norm(to);
  if (kindOf(from) === "image" && IMAGE_TARGETS.includes(target)) {
    try {
      return await convertWithCanvas(file, target);
    } catch (e) {
      if (from === "avif" || from === "heic" || from === "svg") throw e;
    }
  }

  if (MB_INPUTS.has(from) && MB_OUTPUTS[target]) {
    try {
      opts.onStatus?.("converting");
      const blob = await convertWithMediabunny(file, target, opts);
      if (blob) return blob;
    } catch {}
  }

  return convertWithFFmpeg(file, from, target, opts);
}
