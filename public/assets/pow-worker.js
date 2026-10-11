importScripts("/s/argon2.js");

self.onmessage = async ({ data: { tokens, zeroCount, params, limit } }) => {
  const prefix = "0".repeat(zeroCount);
  for (const token of tokens) {
    let salt = null;
    for (let i = 0; i < limit && !salt; i++) {
      const candidate = Array.from(
        crypto.getRandomValues(new Uint8Array(16)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const hash = await hashwasm.argon2id({
        password: token,
        salt: candidate,
        outputType: "hex",
        ...params,
      });
      if (hash.startsWith(prefix)) salt = candidate;
    }
    self.postMessage({ token, salt });
    if (!salt) return;
  }
};
