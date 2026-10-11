const LOCK_KEY = "ms-pow-at";
const LOCK_MS = 60 * 1000;

const solve = async (onProgress) => {
  const challenge = await fetch("/pow/challenge", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => null);
  if (!challenge) return false;
  if (!challenge.needed) return true;

  const { set_token, tokens, zero_count, params, solution_limit } = challenge;
  const count = Math.max(
    1,
    Math.min(6, (navigator.hardwareConcurrency || 2) - 1),
  );
  const started = performance.now();
  const solutions = {};
  let done = 0;

  const results = await Promise.all(
    Array.from({ length: count }, (_, i) => {
      const share = tokens.filter((_, j) => j % count === i);
      if (!share.length) return true;
      return new Promise((resolve) => {
        const worker = new Worker("/s/pow-worker.js");
        let left = share.length;
        const finish = (ok) => {
          worker.terminate();
          resolve(ok);
        };
        worker.onmessage = ({ data }) => {
          if (!data.salt) return finish(false);
          solutions[data.token] = data.salt;
          onProgress?.(++done / tokens.length);
          if (--left === 0) finish(true);
        };
        worker.onerror = () => finish(false);
        worker.postMessage({
          tokens: share,
          zeroCount: zero_count,
          params,
          limit: solution_limit,
        });
      });
    }),
  );
  if (results.includes(false)) return false;

  const resp = await fetch("/pow/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      set_token,
      solutions,
      taken_time: Math.round(performance.now() - started),
    }),
  }).catch(() => null);
  return Boolean(resp?.ok);
};

export const refill = async ({ force = false } = {}) => {
  try {
    const last = Number(localStorage.getItem(LOCK_KEY));
    if (!force && Date.now() - last < LOCK_MS) return false;
    localStorage.setItem(LOCK_KEY, String(Date.now()));
  } catch {}
  return solve();
};

export const refillWhenIdle = () => {
  const run = () => refill().catch(() => {});
  if ("requestIdleCallback" in window)
    requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 1500);
};

export const solveCaptcha = async () => {
  document.body.innerHTML = `<div class="captcha-loader"><h1>brave wants your browser to do a quick proof of work, one moment…</h1><div class="progress-bar" role="progressbar" aria-label="proof of work progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress"></div></div></div>`;
  const loader = document.querySelector(".captcha-loader");
  const bar = loader.querySelector(".progress-bar");
  const fill = loader.querySelector(".progress");

  const ok = await solve((ratio) => {
    fill.style.transform = `scaleX(${ratio})`;
    bar.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
  }).catch(() => false);

  if (ok) {
    fill.style.transform = "scaleX(1)";
    return;
  }
  loader.classList.add("failed");
  loader.querySelector("h1").textContent =
    "brave didn't accept the proof of work, reload the page to try again";
  return new Promise(() => {});
};
