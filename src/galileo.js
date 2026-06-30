const KEY =
  "filed in quiet ink a body claimed by no one words refuse their cage copyright tiago zip";

export function xor(str) {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ KEY.charCodeAt(i % 87));
  }
  return out;
}

export function decode(token) {
  const bin = atob(token);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const r = new TextDecoder().decode(bytes);
  const x = [...r].reverse().join("");
  return xor(x);
}
