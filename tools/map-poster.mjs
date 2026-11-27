#!/usr/bin/env node
/* global Buffer, URL, WebSocket, console, fetch, process, setTimeout */
// Renders one whole generated map to a single 1:1 PNG (bead xaj.30): the real
// renderer (?view=map), no fog, no UI, in muted headless Chrome.
//
//   npm run map:poster -- --seed 123 --size M --out poster.png [--port 6291]
//                         [--players 2|3|4]
//   npm run map:poster -- --named keepers-toll --out poster.png [--port 6291]
//   npm run map:poster -- --map decorations --out poster.png   (a test map)
//   ... --mountains classic|chunky   (bead bzc.145: the ranges with or
//                                     without the great massifs)
//
// Starts its own Vite dev server on --port and refuses a port already in use,
// so the picture always comes from this checkout.
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function parseArgs(argv) {
  const out = { size: "M", port: 6291 };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`--${name} wants a value`);
    if (name === "seed" || name === "port" || name === "players")
      out[name] = Number(value);
    else if (
      name === "size" ||
      name === "out" ||
      name === "named" ||
      name === "map" ||
      name === "mountains"
    )
      out[name] = value;
    else throw new Error(`unknown option --${name}`);
  }
  if (
    out.named === undefined &&
    out.map === undefined &&
    (!Number.isInteger(out.seed) || out.seed < 0)
  )
    throw new Error("--seed wants a whole number (or pass --named or --map)");
  if (out.players !== undefined && ![2, 3, 4].includes(out.players))
    throw new Error("--players wants 2, 3 or 4");
  if (!["S", "SM", "M", "L", "XL"].includes(out.size))
    throw new Error("--size wants S, SM, M, L or XL");
  if (out.out === undefined) throw new Error("--out wants a file path");
  return out;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function until(what, test, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await test().catch(() => undefined);
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(150);
  }
}

async function portFree(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`);
    return false;
  } catch {
    return true;
  }
}

function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (waiter === undefined) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const send = (method, params = {}) => {
    const id = nextId;
    nextId += 1;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve_, reject) =>
      pending.set(id, { resolve: resolve_, reject }),
    );
  };
  return new Promise((ready, failed) => {
    ws.addEventListener("open", () => ready({ send, close: () => ws.close() }));
    ws.addEventListener("error", () => failed(new Error("DevTools socket")));
  });
}

async function evaluate(page, expression) {
  const { result, exceptionDetails } = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails)
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    );
  return result.value;
}

async function main() {
  const { seed, size, out, port, players, named, map, mountains } = parseArgs(
    process.argv.slice(2),
  );
  if (!(await portFree(port)))
    throw new Error(`port ${port} is in use: free it or pass --port`);
  const server = spawn(
    join(ROOT, "node_modules/.bin/vite"),
    ["--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { cwd: ROOT, stdio: "ignore" },
  );
  const profile = mkdtempSync(join(tmpdir(), "bm-poster-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--window-size=1280,800",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    await until("the dev server", async () => {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      return response.ok;
    });
    const debugPort = await until("Chrome", async () =>
      Number(
        readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(
          "\n",
        )[0],
      ),
    );
    const target = await until("a page target", async () => {
      const list = await (
        await fetch(`http://127.0.0.1:${debugPort}/json`)
      ).json();
      return list.find((t) => t.type === "page");
    });
    const page = await connect(target.webSocketDebuggerUrl);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    const query = new URLSearchParams({
      view: "map",
      ...(named !== undefined
        ? { named }
        : map !== undefined
          ? { map }
          : { seed: String(seed) }),
      size,
      zoom: "1",
      fog: "0",
      hud: "0",
      path: "0",
      ...(players !== undefined ? { players: String(players) } : {}),
      ...(mountains !== undefined ? { mountains } : {}),
    });
    await page.send("Page.navigate", {
      url: `http://127.0.0.1:${port}/?${query}`,
    });
    const box = await until(
      "the map",
      () => evaluate(page, "window.__mapReady ? window.__mapPixels : null"),
      180_000,
    );
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: box.width,
      height: box.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await until("the canvas size", () =>
      evaluate(
        page,
        `document.getElementById("game").clientWidth === ${box.width} &&
         document.getElementById("game").clientHeight === ${box.height}`,
      ),
    );
    const dataUrl = await evaluate(
      page,
      `(() => {
        const view = window.__mapView;
        view.setZoom(1);
        view.resize();
        view.centerOn(${box.width / 160 - 0.5}, ${box.height / 160 - 0.5});
        view.prebuild();
        view.render();
        return document.getElementById("game").toDataURL("image/png");
      })()`,
    );
    const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, png);
    console.log(
      `${out}: ${box.width} x ${box.height}, ${(png.length / 1e6).toFixed(1)} MB`,
    );
    page.close();
  } finally {
    chrome.kill();
    server.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
