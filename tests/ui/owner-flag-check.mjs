/* global Buffer, URL, WebSocket, console, fetch, process, setTimeout */
// Owner flag review shots (bead border_marches-bzc.146): the map debug page
// (?view=map) with a hand-built ownership: its towns recast as every
// faction's camp and fort stage, owned by the four players (one left
// neutral), every mine and dwelling flagged in turn. One 1280 x 800 shot
// per town at zoom 0.75 and 1, crops of each town and of a few mines at
// native size (zoom 1) and at 2x. Not a simulation: no game is played.
//
//   npx vite --port 6311 --strictPort &
//   node tests/ui/owner-flag-check.mjs [url] [out-dir]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:6311/";
const OUT = process.argv[3] ?? ".orchestration/screens/bzc146";
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9381;
const [W, H] = [1280, 800];
const SEED = process.env.SEED ?? "7";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bm-flags-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let ws;
let nextId = 1;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) =>
    pending.set(id, { resolve, reject, method }),
  );
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      `${expression.slice(0, 80)}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`,
    );
  return r.result.value;
}

async function waitFor(expression, what, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function shot(name, clip) {
  const r = await send("Page.captureScreenshot", {
    format: "png",
    ...(clip ? { clip } : {}),
  });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  console.log(`- ${file}`);
}

const COLOURS = ["#d8402f", "#3a6fd8", "#3fa34a", "#9a4fc9"];
const STAGES = [
  ["humans", 2],
  ["undead", 0],
  ["goblins", 2],
  ["candy", 0],
  ["dwarves", 2],
  ["humans", 0],
  ["undead", 2],
  ["goblins", 0],
  ["candy", 2],
  ["dwarves", 0],
  ["lost-world", 3],
];

/**
 * Recasts the map's towns and flags every town (but the last), mine and
 * dwelling; returns the towns and mines with their labels.
 */
async function setUp() {
  return evaluate(`(() => {
    const view = window.__mapView;
    const map = window.__mapData;
    const stages = ${JSON.stringify(STAGES)};
    const colours = ${JSON.stringify(COLOURS)};
    let t = 0;
    const objects = map.objects.map((o) => {
      if (o.kind !== "town") return o;
      const [faction, fort] = stages[t % stages.length];
      t += 1;
      return { ...o, data: { ...o.data, faction, fort } };
    });
    view.setObjects(objects);
    const flags = [];
    const towns = [];
    const mines = [];
    // Towns: the first five owned by the players in turn, the rest
    // neutral; mines and dwellings: every fifth one neutral.
    let k = 0;
    let town = 0;
    for (const o of objects) {
      if (o.kind !== "town" && o.kind !== "mine" && o.kind !== "dwelling") continue;
      let owner = k % 5 === 4 ? null : k % 4;
      k += 1;
      if (o.kind === "town") {
        owner = town < 5 ? town % 4 : null;
        town += 1;
      }
      if (o.kind === "town") towns.push({ id: o.id, x: o.x, y: o.y, label: o.data.faction + "-" + o.data.fort, owner });
      if (o.kind !== "town") mines.push({ id: o.id, x: o.x, y: o.y, label: String(o.data.type ?? o.data.resource ?? o.kind), owner });
      if (owner === null) continue;
      flags.push({ x: o.x, y: o.y, colour: colours[owner], objectId: o.id });
    }
    view.setFlags(flags);
    view.render();
    return { towns, mines };
  })()`);
}

async function centre(x, y, zoom) {
  await evaluate(
    `(() => { const v = window.__mapView; v.setZoom(${zoom}); v.centerOn(${x}, ${y - 0.5}); v.render(); })()`,
  );
  await sleep(250);
}

/** A crop round cell (x, y): native (zoom 1) and the same doubled. */
async function crops(name, x, y, w, h) {
  await centre(x, y, 1);
  const c = await evaluate(`window.__mapView.cellToScreen(${x}, ${y})`);
  const clip = {
    x: Math.round(c.x - w / 2),
    y: Math.round(c.y - h + 70),
    width: w,
    height: h,
  };
  await shot(`${name}-native`, { ...clip, scale: 1 });
  await shot(`${name}-2x`, { ...clip, scale: 2 });
}

async function main() {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find((t) => t.type === "page");
    } catch {
      // Chrome is still starting.
    }
  }
  if (!target) throw new Error("Chrome did not start");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    }
    if (msg.method === "Runtime.exceptionThrown")
      errors.push(
        msg.params.exceptionDetails.exception?.description ??
          msg.params.exceptionDetails.text,
      );
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const url = new URL(BASE);
  url.search = `?mute=1&view=map&seed=${SEED}&size=M&players=4&hud=0&path=0&motion=0`;
  await send("Page.navigate", { url: url.href });
  await waitFor("window.__mapReady", "map");
  const { towns, mines } = await setUp();
  console.log(
    `towns: ${towns.map((t) => `${t.label}@${t.x},${t.y} owner ${t.owner}`).join("; ")}`,
  );
  for (const t of towns) {
    await centre(t.x, t.y, 0.75);
    await shot(`town-${t.label}-screen`);
    await crops(`town-${t.label}`, t.x, t.y, 300, 260);
  }
  const seen = new Set();
  for (const m of mines) {
    if (seen.has(m.label) || m.owner === null) continue;
    seen.add(m.label);
    await crops(`site-${m.label}`, m.x, m.y, 200, 180);
  }
  console.log(`sites: ${[...seen].join(", ")}`);
  // The wave: terrain motion on, four shots of the first town's flag one
  // wave frame apart (motion off, as above, holds frame 0).
  const first = towns[0];
  if (first !== undefined) {
    await evaluate("window.__mapView.setTerrainMotion(true)");
    await centre(first.x, first.y, 1);
    const c = await evaluate(
      `window.__mapView.cellToScreen(${first.x}, ${first.y})`,
    );
    // Round the flag of a 3x2 town's right turret (anchors are near
    // x 155-186, y 26-89 of its 240 x 184 canvas).
    const clip = {
      x: Math.round(c.x + 15),
      y: Math.round(c.y - 150),
      width: 90,
      height: 90,
      scale: 3,
    };
    for (let i = 0; i < 4; i += 1) {
      await shot(`wave-${i}`, clip);
      await sleep(200);
    }
    await evaluate("window.__mapView.setTerrainMotion(false)");
  }
}

let code = 0;
try {
  await main();
} catch (err) {
  console.error(err);
  code = 1;
} finally {
  if (errors.length > 0) {
    console.error("page errors:", errors);
    code = 1;
  }
  ws?.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
}
