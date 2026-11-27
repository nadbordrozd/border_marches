/* global Buffer, URL, WebSocket, clearTimeout, console, fetch, process, setTimeout */
// Screenshots of the town harbour on a hand-built naval save (bead
// border_marches-bzc.150). Not a simulation: one hand-built save, a town
// screen, one ship bought, no turn ends and no battles.
//
//   node tests/ui/harbour-check.mjs [--out=<dir>] [--size=1280x800]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1), its own Vite,
// profile and DevTools port. Shots (file harbour-<name>-<W>x<H>.png):
//   coastal-top (the hall as it opens, as on a dry map), coastal (scrolled
//   to the Harbour row closing the hall, the Royal Docks
//   selected and "Buy a ship" ready), bought (the ship on the dock, the
//   button greyed: the dock is taken), landlocked (a town far from the
//   sea: the harbour greyed "Landlocked"), map (the bought ship moored at
//   the town's dock).
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
const OUT = resolve(flags.out ?? join(ROOT, ".orchestration/screens/harbour"));
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
  profile = mkdtempSync(join(tmpdir(), "bm-harbour-"));
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
  const file = join(OUT, `harbour-${name}-${W}x${H}.png`);
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
 * The hand-built naval save: a 26 x 18 map, a west island with two Realm
 * towns of the human (a coastal one with its Royal Docks and Harbour Light
 * built, and a landlocked one inland), a sea, and an east island of sand.
 * Built in the page from the game's own modules.
 */
const BUILD = `(async () => {
  const g = await import('/src/core/game/index.ts');
  const save = await import('/src/ui/save.ts');
  const W = 26, H = 18;
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sea = x >= 9 && x <= 17;
    const east = x > 17;
    cells.push(sea
      ? { terrain: 'water', obstacle: 'none', road: false, ...(x >= 11 && x <= 14 && y > 3 && y < 14 ? { deep: true } : {}) }
      : { terrain: east ? 'sand' : 'grass', obstacle: (x === 0 || x === W - 1 || y === 0 || y === H - 1) ? 'mountain' : 'none', road: false });
  }
  const obj = (id, kind, x, y, data, w = 1, h = 1, blocked = []) =>
    ({ id, kind, x, y, footprint: { w, h }, blocked, data });
  const town = (id, x, y) => obj(id, 'town', x, y, { faction: 'humans', owner: 0 }, 3, 2,
    [[x - 1, y - 1], [x, y - 1], [x + 1, y - 1], [x - 1, y], [x + 1, y]]);
  const map = {
    width: W, height: H, seed: 150, naval: true, cells,
    objects: [
      town('town-0', 6, 9),
      town('town-1', 2, 4),
      obj('hero-start-0', 'hero-start', 6, 12, { player: 0 }),
    ],
  };
  const s = g.newGame(map, { players: [{ kind: 'human', faction: 'humans' }] });
  s.players[0].explored = s.players[0].explored.map(() => true);
  s.players[0].resources = { gold: 20000, wood: 40, ore: 40, essence: 10 };
  const t = s.towns['town-0'];
  t.buildings = [...t.buildings, 'shipyard', 'lighthouse'];
  save.saveGame(localStorage, s);
  return {
    heroes: s.heroes.length,
    dock: g.townDock(s.map, 'town-0'),
    inland: g.townDock(s.map, 'town-1'),
  };
})()`;

const clickSel = (sel) =>
  evaluate(`(() => {
    const n = document.querySelector(${JSON.stringify(sel)});
    if (!n) return false;
    n.click();
    return true;
  })()`);

/** Scrolls the hall to its Harbour row (it closes the hall, after the dwellings). */
const showHarbour = () =>
  evaluate(
    `document.querySelector('[data-group="harbour"]')?.scrollIntoView({ block: 'nearest' })`,
  );

async function main() {
  mkdirSync(OUT, { recursive: true });
  BASE = await startServer();
  await startChrome();
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  const built = await evaluate(BUILD);
  check(built.heroes === 1, "the naval save has one hero");
  check(built.dock !== null, `town-0 has a dock ${JSON.stringify(built.dock)}`);
  check(built.inland === null, "town-1 is landlocked");
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

  // The coastal town: the Harbour row and the Shipyard's card.
  await evaluate("window.__bmGame.openTown('town-0')");
  await waitFor("document.querySelector('.gm-town')", "town screen");
  const row = await evaluate(
    `[...document.querySelectorAll('[data-group="harbour"] .gm-hall-tile')].map((n) => n.dataset.building + ':' + n.dataset.state)`,
  );
  check(
    JSON.stringify(row) ===
      JSON.stringify([
        "shipyard:built",
        "lighthouse:built",
        "admiralty:requirements",
      ]),
    `harbour row ${JSON.stringify(row)}`,
  );
  // As it opens: everything a dry map's hall shows, in place.
  await shot("coastal-top");
  check(
    await clickSel('.gm-hall [data-building="shipyard"]'),
    "the Royal Docks tile",
  );
  await showHarbour();
  const ready = await evaluate(
    `[...document.querySelectorAll('.gm-buy-ship')].map((b) => b.disabled)`,
  );
  check(
    JSON.stringify(ready) === "[false,false]",
    `buy buttons ready ${JSON.stringify(ready)}`,
  );
  await shot("coastal");

  // Buy one: the ship on the dock, then the button refuses (dock taken).
  check(
    await clickSel(".gm-town-header .gm-buy-ship"),
    "the header's Buy a ship",
  );
  await sleep(400);
  const after = await evaluate(`(() => {
    const s = window.__bmGame.state();
    const b = document.querySelector('.gm-town-header .gm-buy-ship');
    return { ships: s.ships, gold: s.players[0].resources.gold, wood: s.players[0].resources.wood, disabled: b.disabled, title: b.title };
  })()`);
  check(
    after.ships.length === 1 &&
      after.ships[0].x === built.dock.x &&
      after.ships[0].y === built.dock.y &&
      after.ships[0].owner === 0,
    `a ship on the dock ${JSON.stringify(after.ships)}`,
  );
  check(
    after.gold === 19000 && after.wood === 30,
    `paid 1000 gold and 10 wood ${after.gold} ${after.wood}`,
  );
  check(
    after.disabled && /dock is taken/.test(after.title),
    `refused: ${after.title}`,
  );
  await showHarbour();
  await shot("bought");
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))",
  );
  await waitFor("!document.querySelector('.gm-town')", "town closed");

  // The landlocked town: the harbour shown greyed, the button refuses.
  await evaluate("window.__bmGame.openTown('town-1')");
  await waitFor("document.querySelector('.gm-town')", "landlocked town");
  check(
    await clickSel('.gm-hall [data-building="shipyard"]'),
    "the landlocked Royal Docks tile",
  );
  await showHarbour();
  const land = await evaluate(`(() => {
    const tiles = [...document.querySelectorAll('[data-group="harbour"] .gm-hall-tile')].map((n) => n.dataset.state);
    const b = document.querySelector('.gm-town-header .gm-buy-ship');
    const why = document.querySelector('.gm-hall-detail .gm-hall-why');
    return { tiles, title: b && b.title, why: why && why.textContent };
  })()`);
  check(
    land.tiles.every((t) => t === "landlocked") && land.tiles.length === 3,
    `landlocked tiles ${JSON.stringify(land.tiles)}`,
  );
  check(/Landlocked/.test(land.title ?? ""), `button: ${land.title}`);
  check(/Landlocked/.test(land.why ?? ""), `detail: ${land.why}`);
  await shot("landlocked");
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))",
  );
  await waitFor("!document.querySelector('.gm-town')", "town closed again");
  await idle();
  await shot("map");
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
