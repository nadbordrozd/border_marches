/* global Buffer, URL, WebSocket, clearTimeout, console, fetch, process, setTimeout */
// Screenshots of the sea and coastal objects on a hand-built naval map
// (bead border_marches-bzc.151). Not a simulation: one hand-built save, a
// few hovers, no moves, no turn ends and no battles.
//
//   node tests/ui/sea-objects-check.mjs [--out=<dir>] [--size=1280x800]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1), its own Vite,
// profile and DevTools port. Shots (file sea-<name>-<W>x<H>.png):
//   overview (the sea with every kind of sea object; --size=1920x1200
//   shows both coasts), hover-wreck (a
//   Shipwreck's card with its crew inside), hover-whirlpool (the twin and
//   the loss), hover-pearls (a Pearl Bed as a producer).
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
  flags.out ?? join(ROOT, ".orchestration/screens/sea-objects"),
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
  profile = mkdtempSync(join(tmpdir(), "bm-sea-"));
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
  const file = join(OUT, `sea-${name}-${W}x${H}.png`);
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
 * human's town, a Fishing Village and a Pirate Cove; a sea holding every
 * sea site, bank, pickup and a whirlpool pair; an east island of sand with
 * a Shipwright. Built in the page from the game's own modules.
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
  // A catalogue object with its footprint up and right of the entrance.
  const site = (id, type, kind, x, y, w, h, data = {}) => {
    const blocked = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++)
      if (dx !== 0 || dy !== 0) blocked.push([x + dx, y - dy]);
    return obj(id, kind, x, y, { type, ...data }, w, h, blocked);
  };
  const map = {
    width: W, height: H, seed: 151, naval: true, cells,
    objects: [
      obj('town-0', 'town', 3, 10, { faction: 'humans', owner: 0 }, 3, 2,
        [[2, 9], [3, 9], [4, 9], [2, 10], [4, 10]]),
      obj('hero-start-0', 'hero-start', 7, 8, { player: 0 }),
      obj('boat-1', 'boat', 8, 8, { type: 'moored-boat' }),
      site('village', 'fishing-village', 'mine', 5, 6, 2, 2),
      site('cove', 'pirate-cove', 'dwelling', 5, 15, 2, 2),
      obj('ferry-1', 'teleport', 7, 3, { type: 'ferry-landing', pair: 'f' }),
      obj('ferry-2', 'teleport', 18, 3, { type: 'ferry-landing', pair: 'f' }),
      site('yard', 'shipwright', 'site', 20, 13, 3, 2, { dock: [17, 13] }),
      site('pearls', 'pearl-bed', 'mine', 10, 5, 2, 2),
      site('wreck', 'shipwreck', 'bank', 13, 5, 2, 2, {
        size: 'large', value: 15000,
        guard: [{ creature: 'drowned-sailor', count: 43 }, { creature: 'hammerhead', count: 10 }],
        prize: { gold: 6000, wood: 20 },
      }),
      site('coral', 'coral-grotto', 'bank', 15, 9, 2, 2, {
        size: 'medium', value: 6500,
        guard: [{ creature: 'giant-crab', count: 18 }, { creature: 'siren', count: 11 }],
        prize: { essence: 6, ore: 10, gold: 2000 },
      }),
      site('deep', 'krakens-deep', 'bank', 11, 13, 3, 2, {
        value: 16000,
        guard: [{ creature: 'kraken', count: 2 }, { creature: 'hammerhead', count: 7 }, { creature: 'hammerhead', count: 7 }],
        prize: { gold: 5000 },
      }),
      site('grotto', 'siren-grotto', 'dwelling', 15, 15, 2, 2),
      site('sirens', 'sirens-rock', 'site', 9, 16, 2, 2),
      obj('light', 'site', 9, 2, { type: 'lighthouse' }),
      obj('buoy', 'site', 12, 9, { type: 'buoy' }),
      obj('mermaid', 'site', 16, 3, { type: 'mermaid-rock' }),
      obj('tides', 'site', 15, 12, { type: 'shrine-of-the-tides', spell: 'gust' }),
      obj('pool-1', 'teleport', 10, 10, { type: 'whirlpool', pair: 'w' }),
      obj('pool-2', 'teleport', 17, 6, { type: 'whirlpool', pair: 'w' }),
      obj('flotsam', 'site', 9, 7, { type: 'flotsam', prize: { wood: 7 } }),
      obj('chest', 'site', 13, 8, { type: 'sea-chest' }),
      obj('raft', 'site', 11, 8, { type: 'castaway', creature: 'wolf-rider', count: 5 }),
      obj('bottle', 'site', 14, 16, { type: 'message-in-a-bottle' }),
    ],
  };
  const s = g.newGame(map);
  s.players[0].explored = s.players[0].explored.map(() => true);
  save.saveGame(localStorage, s);
  return s.heroes.length;
})()`;

async function hover(x, y, name, words) {
  const tip = await evaluate(`window.__bmGame.hover(${x}, ${y})`);
  check(
    typeof tip === "string" && words.every((w) => tip.includes(w)),
    `${name} card: ${tip}`,
  );
  await shot(`hover-${name}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  BASE = await startServer();
  await startChrome();
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  check((await evaluate(BUILD)) === 1, "the sea save has one hero");
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
  await waitFor("window.__bmGame && !window.__bmGame.busy()", "idle");
  await shot("overview");
  await hover(13, 5, "wreck", ["Shipwreck (large)", "Prize", "43"]);
  await hover(10, 10, "whirlpool", ["Whirlpool", "twin is at (17, 6)"]);
  await hover(10, 5, "pearls", ["Pearl Bed", "Unclaimed"]);
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
