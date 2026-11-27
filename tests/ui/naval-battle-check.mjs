/* global Buffer, URL, WebSocket, clearTimeout, console, fetch, process, setTimeout */
// Screenshots of the naval battlefields (bead border_marches-bzc.153) in
// the battle debug view: one sample battle per layout of NAVAL.md 3.2,
// opened at a stepped debug state (?view=battle&naval=<layout>&steps=N),
// never played on. Not a simulation.
//
//   node tests/ui/naval-battle-check.mjs [--out=<dir>] [--size=1280x800]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1), its own Vite,
// profile and DevTools port. Shots (file naval-battle-<name>-<W>x<H>.png):
//   <layout>-start (the opening field: deck, water, gangplanks, masts,
//   deck guns, the layout's banner), <layout>-stepped (after a few AI
//   actions: swimmers in the water, the deck gun's tile on the timeline).
// Prints one JSON line; exits non-zero on a page error or a failed check.
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const flags = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)=(.*)$/.exec(a);
  if (m) flags[m[1]] = m[2];
}
const OUT = resolve(
  flags.out ?? join(ROOT, ".orchestration/screens/naval-battle"),
);
const [W, H] = (flags.size ?? "1280x800").split("x").map(Number);
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
let chrome = null;
let profile = null;
let ws = null;
let nextId = 1;
const pending = new Map();
const errors = [];
const shots = [];
const failures = [];

function cleanup() {
  try {
    ws?.close();
  } catch {
    // closed
  }
  chrome?.kill("SIGKILL");
  server?.kill("SIGTERM");
  if (profile !== null) rmSync(profile, { recursive: true, force: true });
}
const deadline = setTimeout(() => {
  console.log(JSON.stringify({ ok: false, timeout: true }));
  cleanup();
  process.exit(2);
}, 180000);

function freePort() {
  return new Promise((ok, no) => {
    const s = createServer();
    s.on("error", no);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const vite = join(ROOT, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(vite)) throw new Error(`no ${vite}: run npm ci first`);
  server = spawn(
    process.execPath,
    [vite, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { cwd: ROOT, stdio: "ignore" },
  );
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      // not yet
    }
    await sleep(200);
  }
  throw new Error("Vite did not start");
}

async function startChrome() {
  profile = mkdtempSync(join(tmpdir(), "bm-naval-battle-"));
  chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      `--window-size=${W},${H}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const portFile = join(profile, "DevToolsActivePort");
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(200);
    try {
      const port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === "page");
    } catch {
      // starting
    }
  }
  if (!target) throw new Error("Chrome did not start");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, no) => {
    ws.onopen = ok;
    ws.onerror = no;
  });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      errors.push(
        msg.params.exceptionDetails.exception?.description ??
          msg.params.exceptionDetails.text,
      );
    }
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((ok, no) => {
    const timer = setTimeout(() => no(new Error(`${method}: timeout`)), 30000);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        ok(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        no(e);
      },
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      `${expression.slice(0, 60)}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`,
    );
  }
  return r.result.value;
}

async function waitFor(expression, what, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function shot(name) {
  await sleep(350);
  const r = await send("Page.captureScreenshot", { format: "png" });
  const file = join(OUT, `naval-battle-${name}-${W}x${H}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  shots.push(file);
  console.log(`- ${file}`);
}

const check = (ok, what) => {
  if (!ok) {
    failures.push(what);
    console.log(`- FAIL ${what}`);
  }
};

async function go(search) {
  const url = new URL(BASE);
  url.search = search;
  await send("Page.navigate", { url: url.href });
  await sleep(300);
}

let BASE = "";

const LAYOUTS = ["deck", "open-water", "pier-deck", "pier-water", "beach"];

async function main() {
  mkdirSync(OUT, { recursive: true });
  BASE = await startServer();
  await startChrome();
  for (const layout of LAYOUTS) {
    for (const [name, steps] of [
      ["start", 0],
      ["stepped", 9],
    ]) {
      await go(`?mute=1&view=battle&naval=${layout}&seed=7&steps=${steps}`);
      await waitFor(
        "document.querySelector('canvas') && document.querySelector('.bm-queue')",
        `${layout} battle screen`,
      );
      await sleep(name === "start" ? 900 : 1400);
      await shot(`${layout}-${name}`);
    }
  }
  check(errors.length === 0, `no page errors: ${errors.join(" | ")}`);
}

try {
  await main();
} catch (error) {
  failures.push(String(error));
}
clearTimeout(deadline);
cleanup();
const ok = failures.length === 0 && errors.length === 0;
console.log(JSON.stringify({ ok, shots: shots.length, failures, errors }));
process.exit(ok ? 0 : 1);
