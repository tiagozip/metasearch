export const solveCaptcha = (captcha) => {
	return new Promise((resolve) => {
		document.body.innerHTML = `<div class="captcha-loader"><h1>brave is checking if you're human, please wait…</h1><div class="progress-bar"><div class="progress"></div></div></div>`;

		const frame = document.createElement("iframe");
		frame.style.width = "10px";
		frame.style.height = "10px";
		frame.style.position = "fixed";
		frame.style.top = "-7px";
		frame.style.left = "-7px";
		frame.style.opacity = ".01";

		const flowId = captcha.flowId;
		let solving = false;

		const blob = new Blob(
			[
				`${captcha.raw.replace(
					`"."`,
					`"https://search.brave.com/search"`,
				)}<script>let foundButton;

    setInterval(function () {
      const button = document.querySelector("#pow-captcha-top button.button.type--hero");

      if (!foundButton && button) {
        foundButton = true;
        button.click();
        window.parent.postMessage({ type: "POW_FRAME_MESSAGE", data: "SOLVING" }, "*");
      }

      const progressEl = document.querySelector("#pow-captcha-content #pow-captcha-progress");
      if (progressEl) {
        window.parent.postMessage({ type: "POW_FRAME_MESSAGE", data: "PROGRESS:" + progressEl.value }, "*");
      }
    }, 50);

    const originalFetch = window.fetch;

window.fetch = async (...args) => {
  if (args[0].includes("api/tokens/keys")) {
    window.parent.postMessage({ type: "POW_FRAME_MESSAGE", data: "GET_KEYS" }, "*");
    return new Promise((resolve) => {
      window.addEventListener("message", function handler(e) {
        if (e.data.type === "KEYS_RESPONSE") {
          window.removeEventListener("message", handler);
          resolve(new Response(JSON.stringify(e.data.keys), { status: 200, headers: { "Content-Type": "application/json" } }));
        }
      });
    });
  }
  if (args[0].includes("api/captcha/pow")) {
    window.parent.postMessage({ type: "POW_FRAME_MESSAGE", data: "POW:" + args[1].body }, "*");
    return new Promise((resolve) => {
      window.addEventListener("message", function handler(e) {
        if (e.data.type === "POW_RESPONSE") {
          window.removeEventListener("message", handler);
          resolve(new Response(JSON.stringify(e.data.result), { status: e.data.status, headers: { "Content-Type": "application/json" } }));
        }
      });
    });
  }
  return await originalFetch(...args);
};</script>`,
			],
			{ type: "text/html" },
		);
		frame.src = URL.createObjectURL(blob);

		let revoked = false;

		frame.addEventListener("load", async () => {
			if (solving) {
				console.log("ended!");
				URL.revokeObjectURL(frame.src);
				solving = false;
				frame.remove();
				await fetch(`/p/pow/end/${flowId}`, { method: "POST" });

				setTimeout(() => {
					resolve();
				}, 500);
			}
		});

		window.addEventListener("message", async (event) => {
			if (event.data.type === "POW_FRAME_MESSAGE") {
				if (event.data.data === "SOLVING" && !revoked) {
					revoked = true;
					solving = true;
					console.log("solving");
				}

				if (event.data.data === "GET_KEYS") {
					const keys = await (await fetch(`/p/pow/keys/${flowId}`)).json();
					frame.contentWindow.postMessage({ type: "KEYS_RESPONSE", keys }, "*");
				}

				if (event.data.data.startsWith("PROGRESS:")) {
					document.querySelector(".progress").style.width = `${
						event.data.data.split(":")[1]
					}%`;
				}

				if (event.data.data.startsWith("POW:")) {
					const body = event.data.data.slice(4);
					document.querySelector(".progress").style.width = "100%";

					const resp = await fetch("/p/pow", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-Galileo-Flow": flowId,
						},
						body,
					});

					const result = await resp.json().catch(() => ({}));
					frame.contentWindow.postMessage(
						{ type: "POW_RESPONSE", result, status: resp.status },
						"*",
					);

					if (!resp.ok) {
						document.querySelector("p").remove();
						document.querySelector(".progress").style.backgroundColor =
							"#ff5c5c";
						document.querySelector("h1").innerHTML =
							`an error occured. <br>please try again`;
					}
				}
			}
		});

		document.body.appendChild(frame);
		return;
	});
};
