/* global Buffer, URL, WebSocket, clearTimeout, console, fetch, process, setTimeout */
// Screenshots of a hero boarding, sailing and landing on a hand-built naval
// map (bead border_marches-bzc.149). Not a simulation: one hand-built
// save, a few clicks, no turn ends and no battles.
//
//   node tests/ui/naval-check.mjs [--out=<dir>] [--size=1280x800]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1), its own Vite,
// profile and DevTools port. Shots (file naval-<name>-<W>x<H>.png):
//   start (the hero on the shore beside a neutral boat), plan-board (the
//   anchor of the boarding), sailing (the hero on deck at sea), plan-land
//   (the landing ring and "lands: day ends"), landed (ashore, the ship
//   moored in the player's colour), hover-ship (the ship's card).
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
const OUT = resolve(flags.out ?? join(ROOT, ".orchestration/screens/naval"));
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
  profile = mkdtempSync(join(tmpdir(), "bm-naval-"));
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
  const file = join(OUT, `naval-${name}-${W}x${H}.png`);
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

/**
 * The hand-built naval save: a 26 x 18 map, a west island with the
 * human's town and hero at the shore beside a neutral boat, a sea, and an
 * east island of sand. Built in the page from the game's own modules.
 */
const BUILD = `(async () => {
  const g = await import('/src/core/game/index.ts');
  const save = await import('/src/ui/save.ts');
  const W = 26, H = 18;
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sea = x >= 8 && x <= 17;
    const east = x > 17;
    cells.push(sea
      ? { terrain: 'water', obstacle: 'none', road: false, ...(x >= 11 && x <= 14 && y > 3 && y < 14 ? { deep: true } : {}) }
      : { terrain: east ? 'sand' : 'grass', obstacle: (x === 0 || x === W - 1 || y === 0 || y === H - 1) ? 'mountain' : 'none', road: false });
  }
  const obj = (id, kind, x, y, data, w = 1, h = 1, blocked = []) =>
    ({ id, kind, x, y, footprint: { w, h }, blocked, data });
  const map = {
    width: W, height: H, seed: 149, naval: true, cells,
    objects: [
      obj('town-0', 'town', 4, 9, { faction: 'lost-world', owner: 0 }, 3, 2,
        [[3, 8], [4, 8], [5, 8], [3, 9], [5, 9]]),
      obj('hero-start-0', 'hero-start', 7, 7, { player: 0 }),
      obj('boat-1', 'boat', 8, 7, {}),
      obj('boat-2', 'boat', 16, 12, {}),
      obj('gold-1', 'pickup', 21, 5, { resource: 'gold', amount: 500 }),
    ],
  };
  const s = g.newGame(map);
  s.players[0].explored = s.players[0].explored.map(() => true);
  save.saveGame(localStorage, s);
  return s.heroes.length;
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  BASE = await startServer();
  await startChrome();
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  check((await evaluate(BUILD)) === 1, "the naval save has one hero");
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu again");
  const cont = await evaluate(`(() => {
    const b = [...document.querySelectorAll('.gm-menu button')].find((n) => n.textContent.trim().startsWith('Continue'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  check(cont, "a Continue button");
  await waitFor("window.__bmGame", "adventure screen");
  const idle = () =>
    waitFor("window.__bmGame && !window.__bmGame.busy()", "idle");
  await idle();
  await shot("start");
  // Plan to open sea: board the boat, then sail.
  await evaluate("window.__bmGame.click(12, 7)");
  await sleep(300);
  check(
    (await evaluate("JSON.stringify(window.__bmGame.planned())")) ===
      JSON.stringify({ x: 12, y: 7 }),
    "a plan to the sea cell",
  );
  await shot("plan-board");
  await evaluate("window.__bmGame.click(12, 7)");
  await sleep(400);
  await idle();
  const afloat = await evaluate(`(() => {
    const s = window.__bmGame.state();
    const h = s.heroes.find((x) => x.owner === 0);
    const ship = (s.ships || []).find((x) => x.x === h.x && x.y === h.y);
    return { x: h.x, y: h.y, ship: ship ? ship.owner : 'none', mp: h.mp };
  })()`);
  check(
    afloat.x === 12 && afloat.ship === 0,
    `afloat on its ship ${JSON.stringify(afloat)}`,
  );
  await shot("sailing");
  // Plan ashore on the east island: the landing ends the day.
  await evaluate("window.__bmGame.click(20, 8)");
  await sleep(300);
  await shot("plan-land");
  await evaluate("window.__bmGame.click(20, 8)");
  await sleep(400);
  await idle();
  const landed = await evaluate(`(() => {
    const s = window.__bmGame.state();
    const h = s.heroes.find((x) => x.owner === 0);
    return { x: h.x, y: h.y, mp: h.mp, ships: s.ships };
  })()`);
  check(landed.x === 18 && landed.mp === 0, `landed ${JSON.stringify(landed)}`);
  await shot("landed");
  const own = (landed.ships ?? []).find((s) => s.owner === 0);
  check(own !== undefined && own.x === 17, `the ship moored at the shore`);
  const tip = await evaluate(
    `window.__bmGame.hover(${own?.x ?? 17}, ${own?.y ?? 8})`,
  );
  check(
    typeof tip === "string" && tip.includes("Your Ship"),
    `ship card: ${tip}`,
  );
  await shot("hover-ship");
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
