#!/usr/bin/env node
/* global Buffer, URL, WebSocket, console, fetch, process, setTimeout, clearTimeout */
// Review pack of real game screenshots for the ground textures and the tree
// sizes (bead bzc.144). Not a simulation: it starts a game on a named map and
// on a random M map, edits the save (the whole map explored, the first hero
// moved into the scene, so the camera opens there), and loads that save once
// per variant with the review switch of src/render/map/ground-review.ts:
//
//   G0 pre-bzc.138 grounds (the old texture files from git, served to the
//      page in place of the new ones; the Pulp Wars spill; no drift, rim or
//      patches), G1 the bzc.138 ground at full strength (ground intensity
//      1), GK the game's default (no switch: GROUND_INTENSITY, bead
//      bzc.164), G2 calmer (half drift and texture contrast, intensity 0),
//      G3 no trodden patches, G4 softer borders (half the brush, no dark
//      line), G5 G1's textures with the old spill borders, G6 G2 + G4;
//   T1.0, T1.25, T1.5: G1 with the trees drawn larger (nearest neighbour,
//      feet kept).
//
//   node tools/ground-review.mjs [--out DIR] [--scenes a,b] [--variants G0,T1.5]
//                                [--seed 7] [--port 6293]
//
// Output (default .orchestration/review/bzc.144, git-ignored): one folder per
// variant (<scene>.png at 1280x800 and <scene>-2x.png, the middle of the map
// view enlarged 2x), comparison sheets per scene in sheets/, and index.html.
// Headless system Chrome, muted (--mute-audio, ?mute=1), its own profile and
// Vite server, so it never touches another checkout's state.
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawText, textWidth } from "./art/lib/font.mjs";
import {
  blank,
  composite,
  crop,
  decodePng,
  encodePng,
  fillRect,
  scaleNearest,
} from "./art/lib/png.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 1280;
const H = 800;
/** The commit before bead bzc.138 (the ground rollout): G0's texture files. */
const LEGACY_REV = "a785dd6^";
const GROUNDS = [
  "grass",
  "steppe",
  "jungle",
  "badlands",
  "wasteland",
  "snow",
  "volcanic",
  "sand",
  "frosting",
  "swamp",
];

/** The ground intensity knob's value in the source (bead bzc.164), for labels. */
const KNOB =
  /export const GROUND_INTENSITY = (-?[\d.]+);/.exec(
    readFileSync(join(ROOT, "src/render/map/ground-intensity.ts"), "utf8"),
  )?.[1] ?? "?";

const VARIANTS = [
  {
    id: "G0",
    query: "groundReview=G0",
    label: "G0 pre-rollout grounds (before bzc.138)",
    about:
      "The grounds before bead bzc.138: the old texture files from git (8/6/5-cell periods), the Pulp Wars spill borders, no colour drift, no rim, no trodden patches.",
    kind: "ground",
  },
  {
    id: "G1",
    query: "groundReview=G1",
    label: "G1 full strength (bzc.138, intensity 1)",
    about:
      "The bzc.138 ground at full strength (ground intensity 1): baked PixelLab textures, two-scale drift, ink-blot brush borders with a dark line and rim, trodden patches under buildings.",
    kind: "ground",
  },
  {
    id: "GK",
    query: "",
    label: `GK the game's default (GROUND_INTENSITY = ${KNOB})`,
    about: `No switch: the ground as the game draws it, at the ground intensity knob GROUND_INTENSITY = ${KNOB} (src/render/map/ground-intensity.ts; 0 is G2, 1 is G1).`,
    kind: "ground",
  },
  {
    id: "G2",
    query: "groundReview=G2",
    label: "G2 calmer: half drift and contrast (intensity 0)",
    about:
      "G1 with half the colour drift and half the texture contrast round each texture's mean colour.",
    kind: "ground",
  },
  {
    id: "G3",
    query: "groundReview=G3",
    label: "G3 no trodden patches",
    about: "G1 without the trodden earth under towns, mines and sites.",
    kind: "ground",
  },
  {
    id: "G4",
    query: "groundReview=G4",
    label: "G4 softer borders",
    about:
      "G1 with half the brush reach at borders (lobes about +-6 px instead of +-13) and no dark 1 px line (the dithered rim band stays).",
    kind: "ground",
  },
  {
    id: "G5",
    query: "groundReview=G5",
    label: "G5 current textures, old spill borders",
    about:
      "G1's textures, drift and patches with the pre-rollout smooth spill borders (no brush, no rim).",
    kind: "ground",
  },
  {
    id: "G6",
    query: "groundReview=G6",
    label: "G6 calmer + softer borders",
    about: "G2 and G4 together: half drift and contrast, softer borders.",
    kind: "ground",
  },
  {
    id: "T1.0",
    query: "groundReview=G1&treeScale=1",
    label: "T1.0 trees as made (G1)",
    about: "G1 with the trees as they are.",
    kind: "trees",
  },
  {
    id: "T1.25",
    query: "groundReview=G1&treeScale=1.25",
    label: "T1.25 trees 1.25x (G1)",
    about:
      "G1 with every tree drawn 1.25x, nearest neighbour, feet kept (debug only: on top of the trees bead bzc.165 redrew at 1.5x).",
    kind: "trees",
  },
  {
    id: "T1.5",
    query: "groundReview=G1&treeScale=1.5",
    label: "T1.5 trees 1.5x (G1)",
    about:
      "G1 with every tree drawn 1.5x, nearest neighbour, feet kept (debug only: on top of the trees bead bzc.165 redrew at 1.5x).",
    kind: "trees",
  },
];

/**
 * The scenes: a map, then a scorer the page runs over every view-sized
 * window (terrain shares wanted, a minimum share, bonus for objects).
 */
const SCENES = [
  {
    id: "folly-grass",
    map: "folly",
    label: "Folly: grass meadows (Goblin start)",
    want: { grass: 1 },
    min: 0.45,
    town: true,
  },
  {
    id: "folly-steppe-badlands",
    map: "folly",
    label: "Folly: steppe meets badlands",
    want: { steppe: 1, badlands: 1 },
    min: 0.5,
    both: ["steppe", "badlands"],
  },
  {
    id: "folly-snow",
    map: "folly",
    label: "Folly: the frozen west (snow)",
    want: { snow: 1 },
    min: 0.5,
  },
  {
    id: "folly-sand-volcanic",
    map: "folly",
    label: "Folly: desert and lava (sand, volcanic)",
    want: { sand: 1, volcanic: 1 },
    min: 0.45,
    both: ["sand", "volcanic"],
  },
  {
    id: "folly-frosting",
    map: "folly",
    label: "Folly: the Candy Kingdom (frosting)",
    want: { frosting: 1 },
    min: 0.45,
  },
  {
    id: "folly-swamp",
    map: "folly",
    label: "Folly: the southern swamp",
    want: { swamp: 1 },
    min: 0.45,
  },
  {
    id: "random-m-start",
    map: "random",
    label: "Random M map: around a town",
    want: null,
    min: 0,
    town: true,
  },
];

// ------------------------------------------------------------- options
function parseArgs(argv) {
  const out = {
    out: join(ROOT, ".orchestration/review/bzc.144"),
    seed: 7,
    port: 6293,
  };
  for (const a of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (!m) throw new Error(`bad option ${a} (want --name=value)`);
    const [, name, value] = m;
    if (name === "out") out.out = resolve(value);
    else if (name === "seed" || name === "port") out[name] = Number(value);
    else if (name === "scenes" || name === "variants")
      out[name] = value.split(",");
    else throw new Error(`unknown option --${name}`);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const OUT = args.out;
const scenes = SCENES.filter((s) => !args.scenes || args.scenes.includes(s.id));
const variants = VARIANTS.filter(
  (v) => !args.variants || args.variants.includes(v.id),
);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ---------------------------------------------------- legacy textures
/** The texture files of before bead bzc.138, from git (G0). */
function legacyTextures() {
  const out = new Map();
  for (const g of GROUNDS) {
    const bytes = execFileSync(
      "git",
      ["show", `${LEGACY_REV}:public/assets/terrain/grounds/${g}.png`],
      { cwd: ROOT, maxBuffer: 64 << 20 },
    );
    out.set(`${g}.png`, bytes);
  }
  return out;
}

// ---------------------------------------------------- server and chrome
let server = null;
let chrome = null;
let profile = null;
let ws = null;
let nextId = 1;
const pending = new Map();
const errors = [];
let legacyActive = false;
let legacy = new Map();

function cleanup() {
  try {
    ws?.close();
  } catch {
    // already closed
  }
  chrome?.kill("SIGKILL");
  server?.kill("SIGTERM");
  if (profile !== null) {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still hold a file for a moment.
    }
  }
}
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });

async function startServer(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`);
    throw new Error(`port ${port} is in use: pass --port=<free port>`);
  } catch (error) {
    if (String(error.message).startsWith("port")) throw error;
  }
  const vite = join(ROOT, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(vite)) throw new Error(`no ${vite}: run npm ci first`);
  let log = "";
  server = spawn(
    process.execPath,
    [vite, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${port}/`;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  throw new Error(`Vite did not answer on ${url}:\n${log.slice(-2000)}`);
}

async function startChrome() {
  profile = mkdtempSync(join(tmpdir(), "bm-ground-review-"));
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
      if (!port) continue;
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === "page");
    } catch {
      // Chrome is still starting.
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
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    }
    if (msg.method === "Runtime.exceptionThrown")
      errors.push(
        msg.params.exceptionDetails.exception?.description ??
          msg.params.exceptionDetails.text,
      );
    if (msg.method === "Fetch.requestPaused") void serveTexture(msg.params);
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/assets/terrain/grounds/*" }],
  });
}

/** G0: the old texture file in place of the new one; else the request as is. */
async function serveTexture(params) {
  const name = new URL(params.request.url).pathname.split("/").pop();
  const bytes = legacyActive ? legacy.get(name) : undefined;
  try {
    if (bytes === undefined)
      await send("Fetch.continueRequest", { requestId: params.requestId });
    else
      await send("Fetch.fulfillRequest", {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "image/png" }],
        body: bytes.toString("base64"),
      });
  } catch (error) {
    errors.push(`texture ${name}: ${error.message}`);
  }
}

function send(method, params = {}, ms = 60000) {
  const id = nextId++;
  return new Promise((ok, no) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      no(new Error(`${method}: no answer in ${ms} ms`));
    }, ms);
    pending.set(id, {
      method,
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
  if (r.exceptionDetails)
    throw new Error(
      `${expression.slice(0, 80)}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`,
    );
  return r.result.value;
}

async function waitFor(expression, what, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false))
      return true;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${what}`);
}

let BASE = "";
async function go(search) {
  const url = new URL(BASE);
  url.search = search;
  await send("Page.navigate", { url: url.href });
  await sleep(300);
}

// --------------------------------------------------------- game states
/** Starts a game and returns its save (the raw localStorage value). */
async function newGame(map) {
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await evaluate("localStorage.clear()");
  await go(
    map === "folly"
      ? "?mute=1&map=cartographers-folly&autostart=1"
      : `?mute=1&seed=${args.seed}&size=M&players=2&autostart=1`,
  );
  await waitFor("window.__bmGame", "adventure screen", 120000);
  await sleep(500);
  return evaluate("localStorage.getItem('border-marches.save')");
}

/**
 * Picks a scene's view in the page: every view-sized window scored by the
 * share of the wanted grounds, the buildings, pickups and monsters in it,
 * some forest, mountain and road, and little water; then a free cell near
 * its middle for the hero.
 */
function pickScene(scene) {
  return evaluate(`(() => {
    const scene = ${JSON.stringify(scene)};
    const g = window.__bmGame;
    const s = g.state();
    const m = s.map;
    const a = g.cellToScreen(0, 0);
    const b = g.cellToScreen(1, 0);
    const cell = Math.abs(b.x - a.x);
    const rect = document.querySelector('canvas.gm-map').getBoundingClientRect();
    const vw = Math.floor(rect.width / cell);
    const vh = Math.floor(rect.height / cell);
    const at = (x, y) => m.cells[y * m.width + x];
    const weight = { town: 8, mine: 3, dwelling: 2, site: 3, bank: 3, teleport: 2, pickup: 1, artifact: 1, monster: 1.2 };
    const objs = m.objects.filter((o) => weight[o.kind] !== undefined &&
      (o.kind !== 'monster' || s.monsters[o.id]));
    let best = null;
    const hx = Math.floor(vw / 2), hy = Math.floor(vh / 2);
    for (let y0 = 0; y0 + vh <= m.height; y0 += 1)
      for (let x0 = 0; x0 + vw <= m.width; x0 += 1) {
        const share = {};
        let forest = 0, mountain = 0, water = 0, road = 0;
        for (let y = y0; y < y0 + vh; y += 1)
          for (let x = x0; x < x0 + vw; x += 1) {
            const c = at(x, y);
            share[c.terrain] = (share[c.terrain] ?? 0) + 1;
            if (c.obstacle === 'forest') forest += 1;
            if (c.obstacle === 'mountain') mountain += 1;
            if (c.terrain === 'water') water += 1;
            if (c.road) road += 1;
          }
        const n = vw * vh;
        let wanted = 0;
        if (scene.want) for (const [t, k] of Object.entries(scene.want)) wanted += k * (share[t] ?? 0) / n;
        else wanted = 1 - water / n;
        if (wanted < scene.min) continue;
        if (scene.both && scene.both.some((t) => (share[t] ?? 0) / n < 0.15)) continue;
        let score = 30 * wanted;
        let towns = 0;
        const kinds = new Set();
        for (const o of objs) {
          // Inside the window with a cell of margin.
          if (o.x < x0 + 1 || o.y < y0 + 1 || o.x >= x0 + vw - 1 || o.y >= y0 + vh - 1) continue;
          score += weight[o.kind];
          kinds.add(o.kind);
          if (o.kind === 'town') towns += 1;
        }
        score += 2 * kinds.size;
        if (scene.town && towns === 0) continue;
        score += 40 * Math.min(forest / n, 0.15) + 40 * Math.min(mountain / n, 0.12);
        score += Math.min(road, 12) * 0.5;
        score -= 60 * Math.max(0, water / n - 0.2);
        if (best === null || score > best.score) best = { score, x0, y0 };
      }
    if (best === null) return null;
    const blocked = new Set();
    for (const o of m.objects) {
      blocked.add(o.x + ',' + o.y);
      for (const [bx, by] of o.blocked ?? []) blocked.add(bx + ',' + by);
    }
    for (const h of s.heroes) if (h.alive) blocked.add(h.x + ',' + h.y);
    const free = (x, y) => {
      const c = at(x, y);
      return c && c.terrain !== 'water' && c.obstacle === 'none' && c.prop !== true &&
        !blocked.has(x + ',' + y) && !blocked.has(x + ',' + (y + 1));
    };
    // Beside a wood if one is near the middle (trees against the hero),
    // else the nearest free cell.
    const wooded = (x, y) => [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]
      .some(([dx, dy]) => at(x + dx, y + dy)?.obstacle === 'forest');
    let hero = null;
    for (const near of [true, false])
      for (let r = 0; r < (near ? 4 : 6) && hero === null; r += 1)
        for (let dy = -r; dy <= r && hero === null; dy += 1)
          for (let dx = -r; dx <= r && hero === null; dx += 1) {
            const x = best.x0 + hx + dx, y = best.y0 + hy + dy;
            if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(x, y) && (!near || wooded(x, y)))
              hero = [x, y];
          }
    return { ...best, vw, vh, cell, hero };
  })()`);
}

/** The scene's save: the whole map explored, the first hero in the scene. */
function sceneSave(raw, hero) {
  const save = JSON.parse(raw);
  const s = save.state;
  const p0 = s.players.find((p) => p.id === 0) ?? s.players[0];
  p0.explored = p0.explored.map(() => true);
  const h = s.heroes.find((x) => x.owner === p0.id && x.alive);
  if (h !== undefined && hero !== null) {
    h.x = hero[0];
    h.y = hero[1];
  }
  return JSON.stringify(save);
}

/** Loads a save with a variant's query and shoots the screen. */
async function shootVariant(save, variant) {
  legacyActive = variant.id === "G0";
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await evaluate(
    `localStorage.setItem('border-marches.save', ${JSON.stringify(save)})`,
  );
  await go(`?mute=1&${variant.query}`);
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  const clicked = await evaluate(`(() => {
    const b = [...document.querySelectorAll('.gm-menu button')]
      .find((n) => n.textContent.trim().startsWith('Continue'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!clicked) throw new Error("no Continue button on the menu");
  await waitFor(
    "window.__bmGame && !window.__bmGame.busy()",
    "adventure screen",
    120000,
  );
  // Chunks paint over a few frames; toasts fade.
  await sleep(2500);
  await evaluate(
    "document.querySelectorAll('.gm-toast, #gm-toast, .gm-toasts').forEach((n) => n.remove())",
  );
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 2,
    y: H - 2,
  });
  await sleep(400);
  const view = await evaluate(`(() => {
    const r = document.querySelector('canvas.gm-map').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  return { png: Buffer.from(shot.data, "base64"), view };
}

// ------------------------------------------------------------ sheets
const LABEL_BG = [20, 18, 24, 255];
const LABEL_FG = [255, 226, 120, 255];
const SCALE = 3;

/** A raster with a label bar on top. */
function labelled(raster, text) {
  const bar = 7 * SCALE + 12;
  const out = blank(raster.width, raster.height + bar, LABEL_BG);
  drawText(out, text, 8, 6, LABEL_FG, SCALE);
  composite(out, raster, 0, bar);
  return out;
}

/** Tiles in a grid of `cols` columns, 8 px gaps, a title on top. */
function sheet(title, tiles, cols) {
  const tw = Math.max(...tiles.map((t) => t.width));
  const th = Math.max(...tiles.map((t) => t.height));
  const gap = 8;
  const head = 7 * 4 + 16;
  const rows = Math.ceil(tiles.length / cols);
  const width = Math.max(cols * tw + (cols + 1) * gap, textWidth(title, 4));
  const out = blank(width, head + rows * (th + gap) + gap, [44, 40, 52, 255]);
  drawText(out, title, gap, 8, [255, 255, 255, 255], 4);
  tiles.forEach((t, k) => {
    const x = gap + (k % cols) * (tw + gap);
    const y = head + gap + Math.floor(k / cols) * (th + gap);
    composite(out, t, x, y);
  });
  return out;
}

/** The middle of the map view, half its size, enlarged 2x. */
function zoom(raster, view) {
  const w = Math.min(W, Math.round(view.w)) >> 1;
  const h = Math.min(H, Math.round(view.h)) >> 1;
  const x = Math.round(view.x + view.w / 2 - w / 2);
  const y = Math.round(view.y + view.h / 2 - h / 2);
  return scaleNearest(crop(raster, x, y, w, h), 2);
}

const ASCII = (text) => text.replace(/[^ -~]/g, "-");

// -------------------------------------------------------------- index
function indexHtml(results) {
  const esc = (t) =>
    String(t)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const img = (file, alt) =>
    `<a href="${file}"><img loading="lazy" src="${file}" alt="${esc(alt)}"></a>`;
  const legend = VARIANTS.map(
    (v) => `<li><b>${esc(v.id)}</b> ${esc(v.about)}</li>`,
  ).join("\n");
  const sections = results
    .map((r) => {
      const groundShots = r.shots.filter((s) => s.variant.kind === "ground");
      const treeShots = r.shots.filter((s) => s.variant.kind === "trees");
      const figures = (list, which) =>
        list
          .map(
            (s) =>
              `<figure><figcaption>${esc(s.variant.label)}</figcaption>${img(which === "full" ? s.full : s.zoom, s.variant.label)}</figure>`,
          )
          .join("\n");
      return `<section id="${r.scene.id}">
<h2>${esc(r.scene.label)}</h2>
<p class="meta">view from cell (${r.pick.x0}, ${r.pick.y0}), ${r.pick.vw} x ${r.pick.vh} cells; hero at ${esc(JSON.stringify(r.pick.hero))}. Sheets: ${r.sheets.map((f) => `<a href="${f}">${esc(f.split("/").pop())}</a>`).join(", ")}</p>
<h3>Ground variants, 1280x800</h3><div class="grid">${figures(groundShots, "full")}</div>
<h3>Ground variants, middle of the view at 2x</h3><div class="grid">${figures(groundShots, "zoom")}</div>
<h3>Tree sizes (G1 ground), 1280x800</h3><div class="grid">${figures(treeShots, "full")}</div>
<h3>Tree sizes (G1 ground), 2x</h3><div class="grid">${figures(treeShots, "zoom")}</div>
</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ground review bzc.144</title>
<style>
:root { color-scheme: dark; }
body { background: #1c1a20; color: #eee; font: 15px/1.45 system-ui, sans-serif; margin: 0 16px 40px; }
h1 { margin: 16px 0 4px; } h2 { margin-top: 36px; border-top: 1px solid #444; padding-top: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(560px, 1fr)); gap: 12px; }
figure { margin: 0; background: #29262f; padding: 6px; border-radius: 4px; }
figcaption { font-weight: 600; color: #ffe278; margin-bottom: 4px; }
img { width: 100%; image-rendering: pixelated; display: block; }
.meta { color: #aaa; font-size: 13px; }
nav a { margin-right: 12px; color: #9cf; }
a { color: #9cf; }
</style></head><body>
<h1>Ground textures and tree sizes: review pack (bead bzc.144)</h1>
<p>Real game screens (adventure map and side panel) at 1280x800, the whole map explored, the first hero moved into each scene. Click any picture for the full-size file. Tree scaling is a nearest-neighbour preview with the feet kept; final trees would be generated at size.</p>
<ul>${legend}</ul>
<nav>${results.map((r) => `<a href="#${r.scene.id}">${esc(r.scene.label)}</a>`).join("")}</nav>
${sections}
</body></html>
`;
}

// --------------------------------------------------------------- main
async function main() {
  mkdirSync(OUT, { recursive: true });
  legacy = legacyTextures();
  BASE = await startServer(args.port);
  await startChrome();
  const results = [];
  const saves = new Map();
  for (const scene of scenes) {
    if (!saves.has(scene.map)) saves.set(scene.map, await newGame(scene.map));
    const raw = saves.get(scene.map);
    // Pick on the freshly started game (the view's cell size and canvas).
    legacyActive = false;
    await go("?mute=1");
    await waitFor("document.querySelector('.gm-menu')", "main menu");
    await evaluate(
      `localStorage.setItem('border-marches.save', ${JSON.stringify(raw)})`,
    );
    await go("?mute=1");
    await waitFor("document.querySelector('.gm-menu')", "main menu");
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.gm-menu button')]
        .find((n) => n.textContent.trim().startsWith('Continue'));
      b?.click();
    })()`);
    await waitFor("window.__bmGame", "adventure screen", 120000);
    let pick = await pickScene(scene);
    // Two grounds that never share a view: the first one alone.
    if (pick === null && scene.both)
      pick = await pickScene({
        ...scene,
        both: undefined,
        want: { [scene.both[0]]: 1 },
      });
    if (pick === null) {
      console.log(`- ${scene.id}: no window fits, skipped`);
      continue;
    }
    console.log(`- ${scene.id}: ${JSON.stringify(pick)}`);
    const save = sceneSave(raw, pick.hero);
    const shots = [];
    for (const variant of variants) {
      const { png, view } = await shootVariant(save, variant);
      const dir = join(OUT, variant.id);
      mkdirSync(dir, { recursive: true });
      const full = join(dir, `${scene.id}.png`);
      const zoomFile = join(dir, `${scene.id}-2x.png`);
      writeFileSync(full, png);
      const raster = decodePng(png);
      const z = zoom(raster, view);
      writeFileSync(zoomFile, encodePng(z));
      shots.push({ variant, raster, z, full, zoom: zoomFile });
      console.log(`  ${variant.id} ${relative(ROOT, full)}`);
    }
    const sheets = [];
    mkdirSync(join(OUT, "sheets"), { recursive: true });
    for (const kind of ["ground", "trees"]) {
      const list = shots.filter((s) => s.variant.kind === kind);
      if (list.length === 0) continue;
      // Three or fewer side by side (G1, GK, G2 for bead bzc.164), else two.
      const cols = kind === "trees" || list.length <= 3 ? list.length : 2;
      for (const [which, key] of [
        ["full", "raster"],
        ["2x", "z"],
      ]) {
        const file = join(OUT, "sheets", `${scene.id}-${kind}-${which}.png`);
        const title = ASCII(
          `${scene.label} - ${kind === "trees" ? "tree sizes" : "ground variants"} - ${which === "full" ? "1280x800" : "2x middle"}`,
        );
        writeFileSync(
          file,
          encodePng(
            sheet(
              title,
              list.map((s) => labelled(s[key], ASCII(s.variant.label))),
              cols,
            ),
          ),
        );
        sheets.push(file);
      }
    }
    results.push({
      scene,
      pick,
      sheets: sheets.map((f) => relative(OUT, f)),
      shots: shots.map((s) => ({
        variant: s.variant,
        full: relative(OUT, s.full),
        zoom: relative(OUT, s.zoom),
      })),
    });
  }
  writeFileSync(join(OUT, "index.html"), indexHtml(results));
  writeFileSync(
    join(OUT, "pack.json"),
    JSON.stringify(
      {
        variants: VARIANTS.map(({ id, label, about }) => ({
          id,
          label,
          about,
        })),
        scenes: results.map((r) => ({ id: r.scene.id, pick: r.pick })),
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      ok: errors.length === 0,
      index: join(OUT, "index.html"),
      scenes: results.length,
      errors,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
