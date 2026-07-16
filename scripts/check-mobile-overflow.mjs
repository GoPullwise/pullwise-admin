/* global Buffer, URL, console, fetch, process, setTimeout */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCdpClient } from "./cdp-client.mjs";

const VIEWPORT_WIDTH = Number(process.env.ADMIN_VIEWPORT_WIDTH || 390);
const VIEWPORT_HEIGHT = Number(process.env.ADMIN_VIEWPORT_HEIGHT || 844);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitFor(check, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label} did not become ready.${lastError ? ` ${lastError.message}` : ""}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  let exited = false;
  const exit = new Promise((resolve) => {
    child.once("exit", () => {
      exited = true;
      resolve();
    });
  });
  child.kill("SIGTERM");
  await Promise.race([exit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (!exited) {
    child.kill("SIGKILL");
    await exit;
  }
}

function apiPayload(url) {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith("/auth/session")) {
    return {
      authenticated: true,
      admin: true,
      user: {
        id: "mobile-overflow-admin",
        email: "a-very-long-admin-identity-for-mobile-overflow@example.com",
      },
    };
  }
  if (pathname.endsWith("/admin/workers/defaults")) {
    return { workerVersion: "0.0.0", latestWorkerVersion: "0.0.0" };
  }
  if (pathname.endsWith("/admin/workers")) {
    return {
      workers: [
        {
          worker_id: "worker-mobile-overflow-with-a-very-long-identifier-0123456789",
          name: "Primary full-repository review worker with a long display name",
          region: "operator-defined-region-with-a-long-label",
          status: "idle",
          enabled: true,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
      hasMore: false,
      summary: { total: 1, active: 1, degraded: 0, disabled: 0 },
    };
  }
  return {};
}

const previewPort = await freePort();
const debuggingPort = await freePort();
const chromeProfile = await mkdtemp(join(tmpdir(), "pullwise-admin-mobile-"));
const preview = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(previewPort)],
  { stdio: "ignore" }
);
const chrome = spawn(
  process.env.CHROME_BIN || "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let cdp;
try {
  const pageUrl = `http://127.0.0.1:${previewPort}/workers`;
  await waitFor(async () => (await fetch(pageUrl)).ok, "Vite preview");
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${debuggingPort}/json/version`)).ok,
    "headless Chrome"
  );
  const target = await fetch(
    `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" }
  ).then((response) => response.json());
  cdp = createCdpClient(target.webSocketDebuggerUrl);
  cdp.on("Fetch.requestPaused", ({ requestId, request }) => {
    const body = Buffer.from(JSON.stringify(apiPayload(request.url))).toString("base64");
    void cdp
      .send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "Content-Type", value: "application/json" },
          { name: "Cache-Control", value: "no-store" },
        ],
        body,
      })
      .catch(() => {});
  });
  await cdp.send("Page.enable");
  await cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*://*/api/*", requestStage: "Request" }],
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send("Page.navigate", { url: pageUrl });

  const measurement = await waitFor(async () => {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `(() => ({
        ready: document.readyState === "complete" && Boolean(document.querySelector(".admin-shell")),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
        heading: document.querySelector("main h1")?.textContent?.trim(),
        navLabels: [...document.querySelectorAll(".topbar-nav a")].map((item) => item.textContent.trim()),
        workerRowCount: document.querySelectorAll(".worker-row").length,
        sidebarWidth: Math.round(document.querySelector(".topbar")?.getBoundingClientRect().width || 0),
        mainLeft: Math.round(document.querySelector("main")?.getBoundingClientRect().left || 0),
        decorativeElementCount: [...document.querySelectorAll("*")].filter((element) => {
          const style = getComputedStyle(element);
          const hasTransition = style.transitionDuration
            .split(",")
            .some((duration) => Number.parseFloat(duration) > 0);
          return style.backgroundImage !== "none" || style.boxShadow !== "none" || hasTransition;
        }).length
      }))()`,
      returnByValue: true,
    });
    const value = result.result?.value;
    return value?.ready ? value : null;
  }, "authenticated admin shell");

  if (measurement.clientWidth !== VIEWPORT_WIDTH || measurement.innerWidth !== VIEWPORT_WIDTH) {
    throw new Error(`Expected a ${VIEWPORT_WIDTH}px viewport, received ${JSON.stringify(measurement)}.`);
  }
  if (measurement.scrollWidth !== measurement.clientWidth) {
    throw new Error(`Admin shell overflows at ${VIEWPORT_WIDTH}px: ${JSON.stringify(measurement)}.`);
  }
  if (measurement.heading !== "Workers") {
    throw new Error(`Expected the concise Workers heading: ${JSON.stringify(measurement)}.`);
  }
  if (measurement.navLabels.join(",") !== "Workers,Users,Plans,Settings") {
    throw new Error(`Expected concise Admin navigation labels: ${JSON.stringify(measurement)}.`);
  }
  if (measurement.workerRowCount !== 1 || measurement.decorativeElementCount !== 0) {
    throw new Error(`Expected a flat populated worker list without decorative effects: ${JSON.stringify(measurement)}.`);
  }
  if (VIEWPORT_WIDTH > 1040 && (measurement.sidebarWidth !== 220 || measurement.mainLeft !== 220)) {
    throw new Error(`Expected the compact desktop sidebar layout: ${JSON.stringify(measurement)}.`);
  }

  if (process.env.ADMIN_EMIT_SCREENSHOT === "1") {
    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    if (process.env.ADMIN_SCREENSHOT_PATH) {
      await writeFile(process.env.ADMIN_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
    }
  }
  console.log(
    `Admin layout check passed at ${VIEWPORT_WIDTH}px: ${JSON.stringify(measurement)}.`
  );
} finally {
  cdp?.close();
  await Promise.all([stopChild(preview), stopChild(chrome)]);
  await rm(chromeProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
