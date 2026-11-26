/* global AbortSignal, Buffer, URL, WebSocket, clearTimeout, console, fetch, process, setTimeout */
// Screenshot tour of every screen (beads border_marches-bzc.25, bzc.52 UI2-01).
// Not a simulation: hand-built saves and debug routes. The tour never ends a
// turn (the end-turn warning is answered with Escape, "Keep playing", and the
// day is checked) and never resolves a battle (battle-result, the one
// auto-resolved screen, runs only when named in --only).
//
//   node tests/ui/screens-check.mjs [options]          (npm run screens -- ...)
//
//   --url=http://127.0.0.1:6400/   a running dev server; default (or "auto"):
//                                  the tour starts its own Vite on a free port
//   --out=<dir>                    default .orchestration/screens/tour
//   --size=1280x800,1920x1080      one run per size (default both)
//   --only=menu,gallery,hero       some screens: a name or a family prefix
//   --timeout=900                  whole-run limit in seconds, then exit 2
//
// Environment: SCREENS_URL (as --url), CDP_PORT (the Chrome DevTools port;
// default a free port chosen by Chrome), SCREENS_TIMEOUT (as --timeout),
// CHROME (the Chrome binary). The old positional form still works:
// [url|auto] [out] [WxH[,WxH]] [only,names].
//
// Headless system Chrome, muted (--mute-audio, ?mute=1), its own profile,
// server and DevTools port, so parallel workers never collide. Prints one
// JSON summary line; exits non-zero on a page error, a failed check or the
// timeout. Screens (file <name>-<W>x<H>.png):
//   menu, menu-named, menu-options, menu-continue,
//   gallery-<tab> (every tab), gallery-hover, gallery-keyword,
//   gallery-filter (the creature tier 4 chip on),
//   adventure, adventure-hover-object, adventure-pickup (grab cursor),
//   adventure-hover-resource, adventure-rich, endturn, hero, hero-hover,
//   hero-hover-army, hero-hover-skill, hero-hover-feat, hero-hover-stat,
//   hero-hover-mini, hero-book (the spellbook opened from the sheet),
//   kingdom, kingdom-hover, spellbook (adventure tab), spellbook-battle, adventure-aim,
//   pin-map, pin-hero-row, pin-army, pin-spell, pin-keyword,
//   pin-keyword-more, pin-town,
//   pin-dwelling, pin-battle (right-click pinned cards, UI2-18: checks the
//   map neither moves nor plans, Escape closes only the card, the closing
//   click does nothing else, and the browser menu never opens),
//   menu-dialog, menu-dev (the Dev panel, bzc.93), meeting, meeting-picked, meeting-hover, meeting-swap
//   (checks the swap in the state and swaps back), town-<faction>, town-hover, town-hall (a selected tile), recruit, market,
//   town-visiting, town-hero-sheet (bead bzc.94: the visiting hero's
//   portrait opens the hero sheet over the town; checks the way back),
//   prebattle,
//   site, magic-learn, magic-guild, magic-guild-pane, magic-noschool,
//   magic-rumour, magic-rumour-map (bead bzc.81: learning made visible,
//   site results as dialogs),
//   levelup, levelup-hover, end-won, end-lost, battle, battle-hover,
//   battle-info, battle-book, battle-spell, battle-spell-hover,
//   battle-spell-noeffect, [battle-result], [battle-result-split],
//   prebattle-retreat (the retreat warning, bead bzc.92).
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

// ------------------------------------------------------------- options
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const flags = {};
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)=(.*)$/.exec(a);
  if (m) flags[m[1]] = m[2];
  else positional.push(a);
}
const urlArg = flags.url ?? positional[0] ?? process.env.SCREENS_URL ?? "auto";
const OUT = resolve(
  flags.out ?? positional[1] ?? ".orchestration/screens/tour",
);
const SIZES = (flags.size ?? positional[2] ?? "1280x800,1920x1080")
  .split(",")
  .map((s) => s.split("x").map(Number));
const onlyArg = flags.only ?? positional[3] ?? "";
const ONLY = onlyArg === "" ? null : onlyArg.split(",");
const TIMEOUT_S = Number(flags.timeout ?? process.env.SCREENS_TIMEOUT ?? 900);
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CDP_WANTED = process.env.CDP_PORT ? Number(process.env.CDP_PORT) : 0;
for (const [w, h] of SIZES) {
  if (!(w > 0 && h > 0)) throw new Error(`bad size in ${SIZES}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let W = 0;
let H = 0;
let BASE = "";
let cdpPort = 0;
let server = null;
let chrome = null;
let profile = null;
let ws = null;
let nextId = 1;
const pending = new Map();
const errors = [];
const shots = [];
const failures = [];
const skipped = [];
const notes = [];

/** True when the screen is wanted: no --only, its name, or a prefix family. */
const want = (name) =>
  ONLY === null || ONLY.some((o) => name === o || name.startsWith(`${o}-`));
/** Some screen of the family `prefix` (prefix or prefix-...) is wanted. */
const wantFamily = (prefix) =>
  ONLY === null || ONLY.some((o) => o === prefix || o.startsWith(`${prefix}-`));
/** Battle result auto-resolves a battle: only when named exactly. */
const named = (name) => ONLY !== null && ONLY.includes(name);

const skip = (name, why) => {
  skipped.push(`${name}-${W}x${H}: ${why}`);
  console.log(`- skipped ${name}: ${why}`);
};
const fail = (name, why) => {
  failures.push(`${name}-${W}x${H}: ${why}`);
  console.log(`- FAIL ${name}: ${why}`);
};
const note = (text) => {
  notes.push(`${W}x${H} ${text}`);
  console.log(`- ${text}`);
};

// ---------------------------------------------------- cleanup, timeout
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
const deadline = setTimeout(() => {
  console.error(`FAIL: the tour passed its ${TIMEOUT_S} s limit`);
  console.log(
    JSON.stringify({ ok: false, timeout: true, shots: shots.length, failures }),
  );
  cleanup();
  process.exit(2);
}, TIMEOUT_S * 1000);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}

// -------------------------------------------------------------- server
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
  let log = "";
  server = spawn(
    process.execPath,
    [vite, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  let exited = false;
  server.on("exit", () => (exited = true));
  const url = `http://127.0.0.1:${port}/`;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (exited) throw new Error(`Vite exited:\n${log.slice(-2000)}`);
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  throw new Error(`Vite did not answer on ${url}:\n${log.slice(-2000)}`);
}

// -------------------------------------------------------------- chrome
async function startChrome() {
  profile = mkdtempSync(join(tmpdir(), "bm-screens-"));
  const [w, h] = SIZES[0];
  chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      `--remote-debugging-port=${CDP_WANTED}`,
      `--user-data-dir=${profile}`,
      `--window-size=${w},${h}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  // Port 0: Chrome picks a free port and writes it to DevToolsActivePort.
  const portFile = join(profile, "DevToolsActivePort");
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(200);
    try {
      cdpPort =
        CDP_WANTED || Number(readFileSync(portFile, "utf8").split("\n")[0]);
      if (!cdpPort) continue;
      const list = await (
        await fetch(`http://127.0.0.1:${cdpPort}/json`)
      ).json();
      target = list.find((t) => t.type === "page");
    } catch {
      // Chrome is still starting.
    }
  }
  if (!target) throw new Error(`Chrome did not start (DevTools ${cdpPort})`);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, no) => {
    ws.onopen = ok;
    ws.onerror = no;
  });
  ws.onclose = () => {
    for (const p of pending.values()) p.reject(new Error("DevTools closed"));
    pending.clear();
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
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
}

/** One DevTools call; rejects after `ms` so a stale page cannot hang us. */
function send(method, params = {}, ms = 30000) {
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
  if (r.exceptionDetails) {
    throw new Error(
      `${expression.slice(0, 80)}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`,
    );
  }
  return r.result.value;
}

async function waitFor(expression, what, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return true;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Like waitFor, but answers false instead of throwing. */
async function waitMaybe(expression, timeout) {
  try {
    return await waitFor(expression, "", timeout);
  } catch {
    return false;
  }
}

async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const file = join(OUT, `${name}-${W}x${H}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  shots.push(file);
  console.log(`- ${file}`);
}

async function go(search) {
  const url = new URL(BASE);
  url.search = search;
  await send("Page.navigate", { url: url.href });
  await sleep(300);
}

const key = (k) =>
  evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', {key: ${JSON.stringify(k)}, bubbles: true}))`,
  );
const escape = () => key("Escape");
const clickText = (selector, text) =>
  evaluate(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((n) => n.textContent.trim().startsWith(${JSON.stringify(text)}) && !n.disabled);
    if (!b) return false;
    b.click();
    return true;
  })()`);
/** Clicks the first enabled element of `selector`; false when none. */
const clickFirst = (selector) =>
  evaluate(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => !n.disabled);
    if (!b) return false;
    b.click();
    return true;
  })()`);
const game = (expr) => evaluate(`window.__bmGame.${expr}`);
const idle = () =>
  waitFor("window.__bmGame && !window.__bmGame.busy()", "idle");
const mouse = async (x, y, ms = 250) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(ms);
};
/** The point (dx, dy) inside the n-th element of `selector`, or null. */
const pointIn = (selector, dx = 10, dy = 8, n = 0) =>
  evaluate(`(() => {
    const r = document.querySelectorAll(${JSON.stringify(selector)})[${n}];
    if (!r) return null;
    r.scrollIntoView({ block: 'nearest' });
    const b = r.getBoundingClientRect();
    return { x: Math.round(b.x + Math.min(${dx}, b.width / 2)), y: Math.round(b.y + Math.min(${dy}, b.height / 2)) };
  })()`);
/** Hovers the first element of `selector` and shoots `name`. */
async function hoverShot(name, selector, dx, dy) {
  if (!want(name)) return;
  const p = await pointIn(selector, dx, dy);
  if (!p) return skip(name, `nothing matches ${selector}`);
  await mouse(p.x, p.y, 600);
  await shot(name);
}
/** Parks the pointer in a corner so no hover card is left open. */
const park = () => mouse(2, H - 2, 150);
/** A real mouse press and release with `button` ("left" or "right"). */
const press = async (x, y, button, ms = 400) => {
  const buttons = button === "right" ? 2 : 1;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button,
    buttons,
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button,
    buttons: 0,
    clickCount: 1,
  });
  await sleep(ms);
};
const rightClick = (x, y, ms) => press(x, y, "right", ms);
const leftClick = (x, y, ms) => press(x, y, "left", ms);
/** The pinned card's text (UI2-18), or null when none is pinned. */
const pinnedText = () =>
  evaluate(
    "(() => { const p = document.querySelector('#gm-tip-pin.gm-tip-on'); return p ? p.innerText.trim() : null; })()",
  );
/**
 * Counts right-clicks that reach the page with the browser menu still
 * allowed (default not prevented), outside text fields: must stay 0.
 */
const watchMenus = () =>
  evaluate(`(() => {
    window.__menus = { seen: 0, open: 0 };
    window.addEventListener('contextmenu', (e) => {
      window.__menus.seen++;
      const t = e.target;
      if (!e.defaultPrevented && !(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) window.__menus.open++;
    });
  })()`);
/**
 * Right-clicks the first element of `selector`, checks that a card is
 * pinned and shoots `name`. Returns the point, or null when none.
 */
async function pinShot(name, selector, dx = 16, dy = 16) {
  const p = await pointIn(selector, dx, dy);
  if (!p) {
    skip(name, `nothing matches ${selector}`);
    return null;
  }
  await rightClick(p.x, p.y, 500);
  const text = await pinnedText();
  if (text === null || text === "") {
    fail(name, `right-click on ${selector} pinned no card`);
    return null;
  }
  note(`${name}: pinned "${text.split("\n")[0]}"`);
  if (want(name)) await shot(name);
  return p;
}

/**
 * Headless screenshots do not draw the cursor: stamp the CSS cursor under
 * the pointer as a small label at the pointer (removed after the shot).
 */
const stampCursor = (x, y, label) =>
  evaluate(`(() => {
    const d = document.createElement('div');
    d.className = 'tour-cursor';
    d.textContent = ${JSON.stringify(label)};
    Object.assign(d.style, { position: 'fixed', left: '${x + 14}px', top: '${y - 24}px',
      zIndex: 2147483647, font: 'bold 12px sans-serif', background: '#000c', color: '#ffd84a',
      padding: '1px 5px', borderRadius: '3px', pointerEvents: 'none' });
    const ring = document.createElement('div');
    ring.className = 'tour-cursor';
    Object.assign(ring.style, { position: 'fixed', left: '${x - 6}px', top: '${y - 6}px', width: '12px',
      height: '12px', border: '2px solid #ffd84a', borderRadius: '50%', zIndex: 2147483647,
      pointerEvents: 'none' });
    document.body.append(d, ring);
  })()`);
const unstamp = () =>
  evaluate(
    "document.querySelectorAll('.tour-cursor').forEach((n) => n.remove())",
  );

/** Edits the stored save in the page (a function body over `s`). */
const editSave = (body) =>
  evaluate(`(async () => {
    const raw = JSON.parse(localStorage.getItem('border-marches.save'));
    const s = raw.state;
    ${body}
    localStorage.setItem('border-marches.save', JSON.stringify(raw));
  })()`);

async function continueSaved(shotName = null) {
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  if (shotName !== null && want(shotName)) {
    await sleep(500);
    await shot(shotName);
  }
  if (!(await clickText(".gm-menu button", "Continue"))) {
    throw new Error("no Continue button on the menu");
  }
  await waitFor("window.__bmGame", "adventure screen");
  await sleep(400);
}

/** The rich hand-built state: a full hero, all towns ours, a second hero. */
const RICH = `
  const arts = await import('/src/data/artifacts.ts');
  const spells = await import('/src/data/map-spells.ts');
  const skills = await import('/src/data/skills.ts');
  const feats = await import('/src/data/feats.ts');
  const roster = await import('/src/data/players.ts');
  const magic = await import('/src/core/magic/index.ts');
  const p0 = s.players.find((p) => p.id === 0);
  for (const r of Object.keys(p0.resources)) p0.resources[r] = 40;
  p0.resources.gold = 42000;
  const h = s.heroes.find((x) => x.owner === 0 && x.alive);
  h.level = 9; h.xp = 9000; h.attack += 3; h.defense += 2; h.power += 3; h.lore += 2;
  h.mp = 4000; h.maxMp = 4000; h.mana = 60;
  // Battle pages and every adventure spell (the book and map aiming).
  h.pages = [...spells.MAP_SPELLS.slice(0, 18), ...magic.ADVENTURE_SPELLS].map((x) => x.id);
  // Battle scrolls and two adventure scrolls (the book's scroll case).
  h.scrolls = [...spells.MAP_SPELLS.slice(18, 21), ...magic.ADVENTURE_SPELLS.slice(0, 2)].map((x) => x.id);
  const skillIds = Object.keys(skills.SKILLS).slice(0, 5);
  h.skills = skillIds.map((id, i) => ({ id, rank: 1 + (i % 3) }));
  h.feats = feats.FEAT_LIST.filter((f) => !feats.isVow(f)).slice(0, 2).map((f) => f.id);
  const worn = arts.ARTIFACT_LIST.filter((a) => a.kind === 'worn' && !a.cursed && !a.pieceOf);
  const used = new Set();
  h.worn = arts.WORN_SLOTS.map((slot, i) => {
    if (i % 3 === 2) return null;
    const a = worn.find((x) => x.slot === slot && !used.has(x.id));
    if (!a) return null;
    used.add(a.id);
    return a.id;
  });
  h.backpack = arts.ARTIFACT_LIST.filter((a) => !used.has(a.id) && a.id !== 'keystone').slice(3, 9).map((a) => a.id);
  for (const t of Object.values(s.towns)) {
    t.owner = 0;
    if (!t.buildings.includes('marketplace')) t.buildings.push('marketplace');
  }
  const free = roster.HERO_ROSTER.find((d) => d.id !== h.defId && d.faction !== 'lost-world' &&
    !s.heroes.some((x) => x.defId === d.id && x.alive));
  s.heroes = s.heroes.filter((x) => !free || x.defId !== free.id);
  const passable = (x, y) => {
    const c = s.map.cells[y * s.map.width + x];
    return c && c.obstacle === 'none' && c.terrain !== 'water' &&
      !s.map.objects.some((o) => (o.x === x && o.y === y) || o.blocked.some(([bx, by]) => bx === x && by === y)) &&
      !s.heroes.some((o) => o.alive && o.x === x && o.y === y);
  };
  let spot = null;
  for (const [dx, dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
    if (passable(h.x + dx, h.y + dy)) { spot = [h.x + dx, h.y + dy]; break; }
  }
  window.__rich = { free: free?.id ?? null, spot };
  if (free && spot) {
    s.heroes.push({ ...structuredClone(h), id: 'hero-' + free.id, defId: free.id, name: free.name,
      heroClass: free.heroClass, x: spot[0], y: spot[1], worn: h.worn.map(() => null),
      backpack: [], scrolls: [], army: [h.army[0] ? { ...h.army[0], count: 5 } : null, null, null, null, null, null, null] });
  }
`;

/** A neutral guard moved next to player 0's first hero (prebattle). */
const GUARD_NEXT = `
  const h = s.heroes.find((x) => x.owner === 0 && x.alive);
  const free = (x, y) => {
    const c = s.map.cells[y * s.map.width + x];
    return c && c.obstacle === 'none' && c.terrain !== 'water' &&
      !s.map.objects.some((o) => (o.x === x && o.y === y) || o.blocked.some(([bx, by]) => bx === x && by === y)) &&
      !s.heroes.some((o) => o.alive && o.x === x && o.y === y);
  };
  let spot = null;
  for (const [dx, dy] of [[0,1],[-1,0],[0,-1],[1,0],[-1,1],[1,1],[-1,-1],[1,-1]]) {
    if (free(h.x + dx, h.y + dy)) { spot = [h.x + dx, h.y + dy]; break; }
  }
  const o = s.map.objects.find((x) => x.kind === 'monster' && s.monsters[x.id]);
  if (spot && o) {
    o.x = spot[0]; o.y = spot[1]; o.blocked = [];
    s.monsters[o.id].x = spot[0]; s.monsters[o.id].y = spot[1];
  }
  window.__guard = { id: o?.id ?? null, spot };
`;

// --------------------------------------------------------------- steps
async function menuScreens() {
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await evaluate("localStorage.clear()");
  await go("?mute=1&seed=4242&size=S&players=3&faction=humans");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await sleep(700); // posters paint one per tick
  if (want("menu")) await shot("menu");
  if (want("menu-named")) {
    const picked = await evaluate(`(() => {
      const b = [...document.querySelectorAll('.gm-map-choice, .gm-menu button')]
        .find((n) => n.querySelector('.gm-map-name') && !n.querySelector('.gm-map-random') && !n.textContent.includes('Random'));
      if (!b) return null;
      b.click();
      return b.querySelector('.gm-map-name').textContent;
    })()`);
    if (picked === null) skip("menu-named", "no named map in the list");
    else {
      note(`named map: ${picked}`);
      await sleep(500);
      await shot("menu-named");
    }
  }
  if (want("menu-options")) {
    const open = await evaluate(`(() => {
      const d = document.querySelector('.gm-options');
      if (!d) return false;
      d.open = true;
      return true;
    })()`);
    if (!open) skip("menu-options", "no Options fold");
    else {
      await sleep(300);
      await shot("menu-options");
    }
  }
}

async function galleryScreens() {
  if (!wantFamily("gallery")) return;
  await go("?mute=1&gallery=creatures");
  await waitFor("document.querySelector('.gm-gallery .gx-grid')", "gallery");
  const tabs = await evaluate(
    "[...document.querySelectorAll('.gx-tab')].map((b) => b.dataset.tab)",
  );
  if (tabs.length === 0) return fail("gallery", "no tabs");
  for (const tab of tabs) {
    const name = `gallery-${tab}`;
    if (
      !want(name) &&
      !want("gallery-hover") &&
      !want("gallery-keyword") &&
      !want("gallery-filter")
    )
      continue;
    await evaluate(
      `document.querySelector('.gx-tab[data-tab=${JSON.stringify(tab)}]').click()`,
    );
    await waitFor(
      `document.querySelector('.gm-gallery')?.dataset.tab === ${JSON.stringify(tab)}`,
      `gallery tab ${tab}`,
    );
    await park();
    await sleep(700);
    if (want(name)) await shot(name);
    if (tab === "creatures") {
      // A creature card's art, then a keyword in its abilities.
      await hoverShot(
        "gallery-hover",
        ".gx-card .gx-kw, .gx-card .gm-kw",
        6,
        6,
      );
    }
    if (tab === "spells") {
      // Bead bzc.67: spell cards carry their keyword boxes.
      const boxes = await evaluate(
        "document.querySelectorAll('.gx-card .gx-kws .gm-kw-box').length",
      );
      if (!(boxes > 0)) fail("gallery-spells", "no keyword boxes on cards");
      await hoverShot("gallery-keyword", ".gx-card .gm-kw", 6, 6);
    }
    if (tab === "creatures" && want("gallery-filter")) {
      // Bead bzc.67: the tier 4 chip narrows the grid, then is cleared.
      const chip = ".gx-chip[data-filter=tier][data-value='4']";
      const pressed = await evaluate(`(() => {
        const c = document.querySelector(${JSON.stringify(chip)});
        if (!c) return false;
        c.click();
        return c.getAttribute('aria-pressed') === 'true';
      })()`);
      const shown = await evaluate(
        "document.querySelectorAll('.gx-card:not([hidden])').length",
      );
      const all = await evaluate(
        "document.querySelectorAll('.gx-card').length",
      );
      if (!pressed || !(shown > 0 && shown < all))
        fail("gallery-filter", `chip ${pressed}, ${shown} of ${all} shown`);
      else {
        await park();
        await sleep(300);
        await shot("gallery-filter");
      }
      await evaluate(`document.querySelector('.gx-clear')?.click()`);
    }
  }
}

async function adventureScreens() {
  await go("?mute=1&seed=4242&size=S&players=3&faction=humans&autostart=1");
  await waitFor("window.__bmGame", "adventure screen");
  await idle();
  await sleep(2400); // toasts fade
  if (!wantFamily("adventure")) return;
  const targets = await game("targets()");
  const t = targets.find((x) => x.kind === "monster");
  if (want("adventure")) {
    // A path plan to the farthest target, then the first monster hovered.
    const goal = targets.at(-1) ?? t;
    if (goal) await game(`click(${goal.x}, ${goal.y})`);
    await sleep(2400);
    if (t) {
      const pos = await game(`cellToClient(${t.x}, ${t.y})`);
      if (pos) await mouse(pos.x, pos.y);
    }
    await shot("adventure");
  }
  const object = targets.find((x) => x.kind !== "monster");
  if (object && want("adventure-hover-object")) {
    const pos = await game(`cellToClient(${object.x}, ${object.y})`);
    if (pos) {
      await mouse(pos.x, pos.y);
      await shot("adventure-hover-object");
    } else skip("adventure-hover-object", "object off screen");
  }
  if (want("adventure-pickup")) await pickupHover(targets);
  // Hover a side-panel resource for the income tooltip.
  await hoverShot("adventure-hover-resource", ".gm-res", 10, 8);
}

/** A pickup on screen under the mouse: the hand (grab) cursor and its card. */
async function pickupHover(targets) {
  const pickups = await evaluate(`(async () => {
    const m = await import('/src/core/game/site-state.ts');
    const s = window.__bmGame.state();
    return s.map.objects.filter((o) => m.isPickup(o) && !s.collected.includes(o.id)).map((o) => o.id);
  })()`);
  const ids = new Set(pickups);
  for (const p of targets.filter((x) => ids.has(x.id))) {
    const pos = await game(`cellToClient(${p.x}, ${p.y})`);
    if (!pos) continue;
    await mouse(pos.x, pos.y, 500);
    const cursor = await evaluate(
      `getComputedStyle(document.elementFromPoint(${pos.x}, ${pos.y})).cursor`,
    );
    // The drawn hand (UI2-07) is a url(...) image with "grab" behind it.
    const kind = cursor.split(",").pop().trim();
    if (kind !== "grab") {
      fail("adventure-pickup", `cursor over ${p.id} is "${cursor}", not grab`);
    } else note(`pickup ${p.id} (${p.kind}): cursor grab`);
    await stampCursor(pos.x, pos.y, `cursor: ${kind}`);
    await shot("adventure-pickup");
    await unstamp();
    return;
  }
  skip("adventure-pickup", "no pickup on screen");
}

/** The end-turn warning: shown, answered with Escape, the day unchanged. */
async function endTurnWarning() {
  if (!want("endturn")) return;
  await escape(); // no plan: the warning is computed as the game does
  await sleep(200);
  await idle();
  const before = await evaluate(`(async () => {
    const m = await import('/src/ui/hints.ts');
    const s = window.__bmGame.state();
    return { day: s.day, player: s.currentPlayer,
      warnings: m.endTurnWarnings(s, s.currentPlayer, {}).map((w) => w.text) };
  })()`);
  // Without a warning, E would end the turn at once: never press it then.
  if (before.warnings.length === 0) {
    return fail("endturn", "no end-turn warning in this state; E not pressed");
  }
  await game("key('e')");
  const shown = await waitMaybe(
    "document.querySelector('.gm-endturn-dialog, .gm-modal')",
    3000,
  );
  if (!shown) return fail("endturn", "the warning dialog did not open");
  await sleep(400);
  await shot("endturn");
  await escape();
  await waitMaybe("!document.querySelector('.gm-modal')", 2000);
  await sleep(300);
  const after = await evaluate(
    "(() => { const s = window.__bmGame.state(); return { day: s.day, player: s.currentPlayer, open: Boolean(document.querySelector('.gm-modal')) }; })()",
  );
  if (after.day !== before.day || after.player !== before.player) {
    fail("endturn", `the turn moved on: ${JSON.stringify({ before, after })}`);
  } else if (after.open) fail("endturn", "Escape left the dialog open");
  else note(`end-turn warning: ${before.warnings.join("; ")}; day kept`);
}

async function heroScreens() {
  if (!wantFamily("hero")) return;
  await key("i");
  await waitFor("document.querySelector('.gm-backdrop')", "hero screen");
  await park();
  await sleep(400);
  if (want("hero")) {
    await shot("hero");
    // The sheet fits the window without scrolling (beads bzc.45, bzc.82).
    const fit = await evaluate(`(() => {
      const d = document.querySelector('.hs-dialog');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      const scrolls = [d, ...d.querySelectorAll('*')].some(
        (n) => n.scrollHeight > n.clientHeight + 1 &&
          /(auto|scroll)/.test(getComputedStyle(n).overflowY));
      return { top: r.top, bottom: r.bottom, h: innerHeight, scrolls };
    })()`);
    if (fit === null) fail("hero", "no hero sheet");
    else if (fit.scrolls || fit.top < 0 || fit.bottom > fit.h) {
      fail("hero", `the sheet does not fit: ${JSON.stringify(fit)}`);
    } else
      note(
        `hero sheet fits: ${Math.round(fit.top)}..${Math.round(fit.bottom)} of ${fit.h}`,
      );
  }
  await hoverShot(
    "hero-hover",
    ".hs-slot:not(.hs-slot-empty) .gm-icon, .hs-worn .gm-icon, .gm-backdrop .gm-icon",
    8,
    8,
  );
  await hoverShot(
    "hero-hover-army",
    ".hs-army-slot:not(.hs-army-empty)",
    40,
    60,
  );
  await hoverShot("hero-hover-skill", ".hs-tile.hs-skill, .hs-skill", 16, 16);
  await hoverShot("hero-hover-feat", ".hs-tile.hs-feat, .hs-feat", 16, 16);
  await hoverShot("hero-hover-stat", ".hs-pstat, .hs-stat", 20, 10);
  await hoverShot("hero-hover-mini", ".hs-mini[data-stat='movement']", 12, 12);
  // The spellbook button opens the book over the sheet (bead bzc.82);
  // Escape closes the book and leaves the sheet open.
  if (want("hero-book")) {
    if (await clickFirst(".hs-book-btn")) {
      const open = await waitMaybe(
        "document.querySelector('.gm-book-dialog')",
        3000,
      );
      if (!open) fail("hero-book", "the spellbook did not open");
      else {
        await park();
        await sleep(400);
        await shot("hero-book");
        await escape();
        await sleep(300);
        const sheet = await evaluate(
          "Boolean(document.querySelector('.hs-dialog')) && !document.querySelector('.gm-book-dialog')",
        );
        if (!sheet) fail("hero-book", "Escape did not return to the sheet");
      }
    } else skip("hero-book", "no spellbook button");
  }
  await park();
  await escape();
  await sleep(200);
}

/** Clicks the adventure book's tab whose label starts with `label`. */
const openBookTab = (label) =>
  evaluate(`(() => {
    const t = [...document.querySelectorAll('.gm-book-tab')]
      .find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)}));
    if (!t) return false;
    t.click();
    return true;
  })()`);

/** An adventure spell aimed on the map: hover only, Escape cancels. */
async function adventureAim() {
  if (!want("adventure-aim")) return;
  await idle();
  await key("m");
  const open = await waitMaybe(
    "document.querySelector('.gm-book-spell, .gm-book-cell')",
    3000,
  );
  if (!open) return skip("adventure-aim", "the spellbook did not open");
  await openBookTab("Adventure");
  // Rows with their own aim button (before bzc.63), or a grid of cells
  // whose detail pane holds the aim button (bzc.63): select each castable
  // cell until one offers "Aim on the map".
  const spell = await evaluate(`(async () => {
    const aimText = /^(Aim on the map|Choose a cell)/;
    for (const row of document.querySelectorAll('.gm-book-spell')) {
      const b = [...row.querySelectorAll('button')].find((x) => !x.disabled && aimText.test(x.textContent.trim()));
      if (!b) continue;
      const name = row.querySelector('b, strong, .gm-book-name')?.textContent ?? row.textContent.slice(0, 30);
      b.click();
      return name;
    }
    for (const cell of document.querySelectorAll('.gm-book-cell:not(.gm-book-off)')) {
      cell.click();
      await new Promise((r) => setTimeout(r, 60));
      const b = [...document.querySelectorAll('.gm-book-aim, .gm-book-detail button')]
        .find((x) => !x.disabled && aimText.test(x.textContent.trim()));
      if (!b) continue;
      const name = cell.querySelector('.gm-book-cell-name')?.textContent ?? cell.dataset.spell;
      b.click();
      return name;
    }
    return null;
  })()`);
  if (spell === null) {
    await escape();
    await sleep(200);
    return skip("adventure-aim", "no spell to aim on the map");
  }
  await sleep(500);
  // Point at a monster on screen, else two cells from the hero.
  const pos = await evaluate(`(() => {
    const g = window.__bmGame;
    const s = g.state();
    const h = s.heroes.find((x) => x.id === g.selectedHero());
    const m = g.targets().find((t) => t.kind === 'monster' && g.cellToClient(t.x, t.y));
    return m ? g.cellToClient(m.x, m.y) : g.cellToClient(h.x + 2, h.y + 1);
  })()`);
  if (pos) await mouse(pos.x, pos.y, 600);
  note(`aimed spell: ${spell.trim()}`);
  await shot("adventure-aim");
  await escape();
  await sleep(300);
  await park();
}

/**
 * The meeting (bead bzc.64): the two columns; a stack picked up with the
 * pointer on the other hero's empty slot; an item's hover card; and Swap
 * armies, checked in the state and pressed again to restore the armies.
 */
async function meetingScreens() {
  const st = await game("state()");
  const first = st.heroes.find((x) => x.owner === 0);
  const other = st.heroes.find(
    (h) => h.id.startsWith("hero-") && h.owner === 0 && h.id !== first?.id,
  );
  if (!other) return skip("meeting", "no second hero");
  await game(`click(${other.x}, ${other.y})`);
  await waitFor("document.querySelector('.hs-meet')", "meeting screen");
  await park();
  await sleep(500);
  if (want("meeting")) await shot("meeting");
  if (want("meeting-picked")) {
    const picked = await clickFirst(
      ".hs-meet-left .hs-army-slot:not(.hs-army-empty)",
    );
    const p = await pointIn(".hs-meet-right .hs-army-empty", 30, 40);
    if (!picked || !p) skip("meeting-picked", "no stack or no empty slot");
    else {
      await mouse(p.x, p.y, 600);
      await shot("meeting-picked");
      // Click the picked stack again: put it back.
      await clickFirst(".hs-meet-left .hs-army-slot.hs-selected");
      await park();
    }
  }
  await hoverShot("meeting-hover", ".hs-meet-left .hs-tradeable", 18, 18);
  await park();
  if (want("meeting-swap")) {
    const armies = () =>
      evaluate(`(() => {
        const s = window.__bmGame.state();
        const of = (id) => JSON.stringify(s.heroes.find((h) => h.id === id).army);
        return [of(${JSON.stringify(first.id)}), of(${JSON.stringify(other.id)})];
      })()`);
    const [a, b] = await armies();
    if (!(await clickFirst(".hs-meet-swap"))) {
      fail("meeting-swap", "no Swap armies button");
    } else {
      await sleep(400);
      const [a2, b2] = await armies();
      if (a2 !== b || b2 !== a) fail("meeting-swap", "the armies did not swap");
      await shot("meeting-swap");
      await clickFirst(".hs-meet-swap");
      await sleep(300);
      const [a3, b3] = await armies();
      if (a3 !== a || b3 !== b)
        fail("meeting-swap", "a second swap did not restore");
    }
  }
  await escape();
  await sleep(200);
}

async function townScreens() {
  if (!wantFamily("town") && !want("recruit") && !want("market")) return;
  const st = await game("state()");
  const byFaction = new Map();
  for (const t of Object.values(st.towns)) {
    if (!byFaction.has(t.faction)) byFaction.set(t.faction, t.id);
  }
  let first = true;
  for (const [faction, id] of byFaction) {
    await game(`openTown(${JSON.stringify(id)})`);
    await waitFor("document.querySelector('.gm-town')", "town screen");
    await park();
    await sleep(600);
    if (want(`town-${faction}`)) await shot(`town-${faction}`);
    if (first) {
      first = false;
      await hoverShot("town-hover", ".gm-hall-tile, .gm-building", 30, 20);
      if (want("town-hall")) {
        // The hall (bead bzc.60): pick a tile that is not selected yet.
        const tile = await evaluate(`(() => {
          const all = [...document.querySelectorAll('.gm-hall-tile')];
          const t = all.filter((x) => !x.classList.contains('gm-selected'))[Math.floor(all.length / 2)] ?? null;
          if (!t) return null;
          t.click();
          return t.dataset.building ?? t.textContent.slice(0, 30);
        })()`);
        if (tile === null) skip("town-hall", "no hall tiles (.gm-hall-tile)");
        else {
          await park();
          await sleep(500);
          note(`hall tile: ${tile}`);
          await shot("town-hall");
        }
      }
      if (want("recruit")) {
        const opened =
          (await clickFirst(".gm-stock")) ||
          (await clickText(".gm-town button", "Recruit"));
        if (opened) {
          await sleep(400);
          await shot("recruit");
          await escape();
          await sleep(200);
        } else skip("recruit", "no recruit button");
      }
      if (want("market")) {
        if (await clickText(".gm-town button", "Marketplace")) {
          await sleep(400);
          await shot("market");
          await escape();
          await sleep(200);
        } else skip("market", "no Marketplace button");
      }
    }
    await escape();
    await waitFor("!document.querySelector('.gm-town')", "town closed");
  }
}

/**
 * A hero visiting a town (bead bzc.94): the hero is set on the first own
 * town's gate for the step (and put back after), the town opens, a click
 * on the hero's portrait opens the hero sheet over it, and Escape returns
 * to the same town with its hero row.
 */
async function townHeroScreens() {
  if (!want("town-visiting") && !want("town-hero-sheet")) return;
  const placed = await evaluate(`(() => {
    const s = window.__bmGame.state();
    const h = s.heroes.find((x) => x.owner === 0 && x.alive);
    const t = Object.values(s.towns).find((x) => x.owner === 0);
    const o = t && s.map.objects.find((x) => x.kind === 'town' && x.id === t.id);
    if (!h || !o) return null;
    window.__townHero = { id: h.id, x: h.x, y: h.y };
    h.x = o.x; h.y = o.y;
    return { hero: h.id, name: h.name, town: t.id };
  })()`);
  if (placed === null) {
    skip("town-visiting", "no own hero or town");
    return;
  }
  try {
    await game(`openTown(${JSON.stringify(placed.town)})`);
    await waitFor("document.querySelector('.gm-town')", "town screen");
    await park();
    await sleep(600);
    if (want("town-visiting")) await shot("town-visiting");
    if (!(await clickFirst(".gm-town-army-hero"))) {
      fail("town-hero-sheet", "no visiting hero portrait (.gm-town-army-hero)");
    } else if (
      !(await waitMaybe("document.querySelector('.hs-dialog')", 5000))
    ) {
      fail("town-hero-sheet", "the portrait did not open the hero sheet");
    } else {
      await park();
      await sleep(500);
      if (want("town-hero-sheet")) await shot("town-hero-sheet");
      await escape();
      await waitFor("!document.querySelector('.hs-dialog')", "sheet closed");
      await sleep(300);
      const back = await evaluate(`(() => ({
        town: Boolean(document.querySelector('.gm-town')),
        hero: document.querySelector('.gm-town-army-hero')?.dataset.hero ?? null,
      }))()`);
      if (!back.town || back.hero !== placed.hero)
        fail(
          "town-hero-sheet",
          `closing the sheet left ${JSON.stringify(back)}`,
        );
      else
        note(`town-hero-sheet: ${placed.name}'s sheet over the town and back`);
    }
    await escape();
    await waitFor("!document.querySelector('.gm-town')", "town closed");
  } finally {
    await evaluate(`(() => {
      const p = window.__townHero;
      const h = p && window.__bmGame.state().heroes.find((x) => x.id === p.id);
      if (h) { h.x = p.x; h.y = p.y; }
    })()`);
  }
}

/**
 * The kingdom overview (UI2-12, bead bzc.62): it fits without scrolling
 * (five towns and two heroes), a resource's hover card, a click on a hero
 * row selects that hero and one on a town row opens the town.
 */
async function kingdomScreens() {
  const selected = () =>
    evaluate(
      "document.querySelector('.gm-hero-row.gm-selected .gm-hero-row-name')?.textContent ?? null",
    );
  const before = await selected();
  await kingdomChecks();
  // Later steps (the meeting) expect the first hero selected again.
  if (before !== null && (await selected()) !== before) {
    await key("k");
    await waitFor("document.querySelector('.kd-dialog')", "kingdom overview");
    await evaluate(`[...document.querySelectorAll('.kd-hero-row')]
      .find((r) => r.querySelector('.kd-name-main').textContent === ${JSON.stringify(before)})?.click()`);
    await waitFor("!document.querySelector('.kd-dialog')", "kingdom closed");
    await sleep(300);
  }
}

async function kingdomChecks() {
  await key("k");
  await waitFor("document.querySelector('.kd-dialog')", "kingdom overview");
  await park();
  await sleep(300);
  await shot("kingdom");
  const fit = await evaluate(`(() => {
    const m = document.querySelector('.kd-dialog .gm-modal-body');
    return { heroes: m.querySelectorAll('.kd-hero-row').length,
      towns: m.querySelectorAll('.kd-town-row').length,
      scroll: m.scrollHeight - m.clientHeight };
  })()`);
  note(`kingdom: ${JSON.stringify(fit)}`);
  if (fit.heroes <= 2 && fit.towns <= 5 && fit.scroll > 1)
    fail("kingdom", `scrolls by ${fit.scroll} px`);
  if (want("kingdom-hover")) {
    const p = await pointIn(".kd-res", 12, 12);
    if (p === null) skip("kingdom-hover", "no income row");
    else {
      await mouse(p.x, p.y, 600);
      await shot("kingdom-hover");
      await park();
    }
  }
  // A hero row selects that hero.
  const picked = await evaluate(`(() => {
    const r = document.querySelector('.kd-hero-row:not(.kd-selected)');
    if (!r) return null;
    r.click();
    return r.querySelector('.kd-name-main').textContent;
  })()`);
  if (picked === null) {
    note("kingdom: one hero, no other row to pick");
    await escape();
  } else {
    await waitFor("!document.querySelector('.kd-dialog')", "kingdom closed");
    const now = await evaluate(
      "document.querySelector('.gm-hero-row.gm-selected .gm-hero-row-name')?.textContent ?? null",
    );
    if (now !== picked)
      fail("kingdom", `hero row picked ${picked}, selected ${now}`);
  }
  await sleep(300);
  // A town row opens the town.
  await key("k");
  await waitFor("document.querySelector('.kd-dialog')", "kingdom overview");
  const town = await evaluate(`(() => {
    const r = document.querySelector('.kd-town-row');
    if (!r) return null;
    r.click();
    return r.querySelector('.kd-name-main').textContent;
  })()`);
  if (town === null) {
    skip("kingdom", "no town row to open");
    await escape();
    await sleep(200);
    return;
  }
  const opened = await waitMaybe("document.querySelector('.gm-town')", 5000);
  if (!opened) fail("kingdom", `town row ${town} did not open the town`);
  else {
    note(
      `kingdom: hero row ${picked ?? "-"} selected, town row ${town} opened`,
    );
    await escape();
    await waitFor("!document.querySelector('.gm-town')", "town closed");
  }
  await sleep(200);
}

/**
 * The Menu with the Dev panel (bead bzc.93): the "Developer tools" toggle
 * turned on, shot, and turned off again (the tour's own profile). No dev
 * action is clicked, so the game state is unchanged.
 */
async function menuDev() {
  if (!(await clickText(".gm-side button", "Menu"))) {
    skip("menu-dev", "no Menu button");
    return;
  }
  await sleep(300);
  await evaluate(`document.querySelector('.gm-dev-toggle')?.click()`);
  await sleep(200);
  const shown = await evaluate("!!document.querySelector('.gm-dev-panel')");
  if (!shown) fail("menu-dev", "the Dev panel did not appear");
  else {
    await park();
    await sleep(200);
    await shot("menu-dev");
  }
  await evaluate(`document.querySelector('.gm-dev-toggle')?.click()`);
  await escape();
  await sleep(200);
}

async function richScreens() {
  await editSave(RICH);
  note(`rich save: ${JSON.stringify(await evaluate("window.__rich"))}`);
  await continueSaved("menu-continue");
  await idle();
  await sleep(2400);
  if (want("adventure-rich")) await shot("adventure-rich");
  await endTurnWarning();
  await heroScreens();
  if (want("kingdom")) await kingdomScreens();
  if (wantFamily("spellbook")) {
    await key("m");
    await sleep(500);
    // The adventure tab (bzc.63 has Adventure and Battle tabs), then battle.
    await openBookTab("Adventure");
    await park();
    await sleep(300);
    if (want("spellbook")) await shot("spellbook");
    if (want("spellbook-battle")) {
      if (await openBookTab("Battle")) {
        await park();
        await sleep(300);
        await shot("spellbook-battle");
      } else skip("spellbook-battle", "no Battle tab in the book");
    }
    await escape();
    await sleep(200);
  }
  await adventureAim();
  await pinScreens();
  if (want("menu-dialog")) {
    if (await clickText(".gm-side button", "Menu")) {
      await sleep(300);
      await shot("menu-dialog");
      await escape();
      await sleep(200);
    } else skip("menu-dialog", "no Menu button");
  }
  if (want("menu-dev")) await menuDev();
  if (wantFamily("meeting")) await meetingScreens();
  await townScreens();
  await townHeroScreens();
  if (wantFamily("prebattle")) {
    await idle();
    let monster = (await game("targets()")).find((t) => t.kind === "monster");
    if (!monster) {
      // Every guard is out of reach: one steps next to the hero (a
      // hand-built state, as RICH is) and the saved game is reloaded.
      await editSave(GUARD_NEXT);
      note(`guard moved: ${JSON.stringify(await evaluate("window.__guard"))}`);
      await continueSaved();
      await idle();
      monster = (await game("targets()")).find((t) => t.kind === "monster");
    }
    if (monster) {
      await game(`click(${monster.x}, ${monster.y})`);
      await sleep(200);
      await game(`click(${monster.x}, ${monster.y})`);
      await waitMaybe("document.querySelector('.gm-modal')", 8000);
      await sleep(400);
      if (want("prebattle")) await shot("prebattle");
      // The retreat warning (bead bzc.92): Cancel (Escape) goes back.
      if (want("prebattle-retreat")) {
        if (await clickText(".gm-battle-confirm button", "Retreat")) {
          await waitMaybe("document.querySelector('.gm-retreat-dialog')", 4000);
          await sleep(400);
          await park();
          await shot("prebattle-retreat");
          const check = await evaluate(`(() => {
            const b = document.querySelector('.gm-retreat-dialog .gm-primary');
            return { focus: document.activeElement === b, label: b?.firstChild?.textContent ?? null };
          })()`);
          if (!check.focus || check.label !== "Cancel")
            fail(
              "prebattle-retreat",
              `Cancel is not the focused default: ${JSON.stringify(check)}`,
            );
          await escape();
          await sleep(500);
          // Escape cancels: back to the pre-battle dialog, nothing retreated.
          const back = await evaluate(
            "!!document.querySelector('.gm-battle-confirm') && !document.querySelector('.gm-retreat-dialog:not(.gm-closing)')",
          );
          if (!back)
            fail(
              "prebattle-retreat",
              "Escape did not return to the pre-battle dialog",
            );
        } else skip("prebattle-retreat", "no Retreat button");
      }
    } else skip("prebattle", "no monster in reach");
  }
}

/**
 * Right-click inspects (UI2-18, bead bzc.68). A pinned card on a map object
 * (the hero neither moves nor plans, and the left click that closes the
 * card does nothing else), on a hero in the side list, on an army slot of
 * the hero sheet (Escape closes the card, not the sheet), on a spellbook
 * page (a keyword in the pinned card hovered for its box), on a town hall
 * tile (the closing click selects no tile) and a dwelling; the browser's
 * own menu never opens.
 */
async function pinScreens() {
  if (!wantFamily("pin")) return;
  await idle();
  await park();
  await watchMenus();
  const heroNow = () =>
    evaluate(`(() => {
      const g = window.__bmGame;
      const h = g.state().heroes.find((x) => x.id === g.selectedHero());
      return JSON.stringify({ x: h.x, y: h.y, mp: h.mp, plan: g.planned() });
    })()`);
  if (want("pin-map")) {
    const before = await heroNow();
    const spot = await evaluate(`(() => {
      const g = window.__bmGame;
      const ts = g.targets();
      const t = ts.find((x) => x.kind === 'monster' && g.cellToClient(x.x, x.y))
        ?? ts.find((x) => g.cellToClient(x.x, x.y));
      return t ? { id: t.id, ...g.cellToClient(t.x, t.y) } : null;
    })()`);
    if (spot === null) skip("pin-map", "no target on screen");
    else {
      await rightClick(spot.x, spot.y, 600);
      const text = await pinnedText();
      if (!text) fail("pin-map", `right-click on ${spot.id} pinned no card`);
      else note(`pin-map: ${spot.id} pinned "${text.split("\n")[0]}"`);
      await shot("pin-map");
      // The card stays while the pointer moves on (onto it, over the map).
      await mouse(spot.x + 30, spot.y + 30, 300);
      await mouse(spot.x - 60, spot.y + 10, 300);
      if ((await pinnedText()) === null)
        fail("pin-map", "the card closed when the pointer moved");
      // A left click elsewhere on the map closes it and does nothing else.
      const away = await evaluate(`(() => {
        const g = window.__bmGame;
        const h = g.state().heroes.find((x) => x.id === g.selectedHero());
        for (const [dx, dy] of [[2, 1], [-2, 1], [2, -1], [-2, -1], [1, 2], [-1, -2]]) {
          const p = g.cellToClient(h.x + dx, h.y + dy);
          if (p) return p;
        }
        return null;
      })()`);
      if (away === null) skip("pin-map", "no map cell to click away");
      else {
        await leftClick(away.x, away.y, 500);
        const after = await heroNow();
        if ((await pinnedText()) !== null)
          fail("pin-map", "a click elsewhere left the card pinned");
        else if (after !== before)
          fail("pin-map", `the hero moved or planned: ${before} -> ${after}`);
        else
          note(
            "pin-map: neither the right-click nor the closing click moved or planned",
          );
      }
    }
    await park();
  }
  if (want("pin-hero-row")) {
    if (await pinShot("pin-hero-row", ".gm-hero-row", 20, 20)) {
      await escape();
      await sleep(200);
      if ((await pinnedText()) !== null)
        fail("pin-hero-row", "Escape left the card pinned");
    }
    await park();
  }
  if (want("pin-army")) {
    await key("i");
    await waitFor("document.querySelector('.gm-backdrop')", "hero screen");
    await park();
    await sleep(300);
    if (
      await pinShot("pin-army", ".hs-army-slot:not(.hs-army-empty)", 40, 50)
    ) {
      await escape();
      await sleep(200);
      const open = await evaluate(
        "Boolean(document.querySelector('.gm-backdrop'))",
      );
      if ((await pinnedText()) !== null)
        fail("pin-army", "Escape left the card pinned");
      else if (!open) fail("pin-army", "Escape closed the hero sheet too");
    }
    await park();
    await escape();
    await waitMaybe("!document.querySelector('.gm-backdrop')", 2000);
    await sleep(200);
  }
  if (want("pin-spell") || want("pin-keyword")) {
    await idle();
    await key("m");
    const open = await waitMaybe(
      "document.querySelector('.gm-book-cell')",
      3000,
    );
    if (!open) skip("pin-spell", "the spellbook did not open");
    else {
      await openBookTab("Adventure");
      await park();
      await sleep(300);
      const p = await pointIn(".gm-book-cell", 30, 30);
      if (p) {
        await rightClick(p.x, p.y, 500);
        const text = await pinnedText();
        if (!text) fail("pin-spell", "right-click on a page pinned no card");
        else note(`pin-spell: pinned "${text.split("\n")[0]}"`);
        if (want("pin-spell")) await shot("pin-spell");
        if (want("pin-keyword")) {
          // Battle pages speak of boons and banes: right-click page after
          // page (each right-click pins the next card in place of the
          // last) until a pinned card has a keyword.
          await openBookTab("Battle");
          await sleep(300);
          let kw = null;
          for (let n = 0; n < 16 && kw === null; n++) {
            const c = await pointIn(".gm-book-cell", 30, 30, n);
            if (!c) break;
            await rightClick(c.x, c.y, 300);
            kw = await pointIn("#gm-tip-pin .gm-kw[data-kw-tip]", 6, 6);
          }
          if (!kw) skip("pin-keyword", "no keyword in a pinned card");
          else {
            // A keyword whose box the card shows lights that box; one
            // without (a word inside a box) shows its box beside the card.
            await mouse(kw.x, kw.y, 600);
            const lit = await evaluate(
              "Boolean(document.querySelector('#gm-tip-pin.gm-tip-on .gm-kw-lit, #gm-tip.gm-tip-on [data-kw-box]'))",
            );
            if (!lit)
              fail("pin-keyword", "hovering a pinned keyword showed no box");
            await shot("pin-keyword");
            const more = await evaluate(`(() => {
              const pin = document.querySelector('#gm-tip-pin');
              const shown = new Set([...pin.querySelectorAll('[data-kw-box]')].map((b) => b.dataset.kwBox));
              const k = [...pin.querySelectorAll('.gm-kw[data-kw-tip]')].find((s) => !shown.has(s.dataset.kw));
              if (!k) return false;
              k.setAttribute('data-tour-kw', '');
              return k.dataset.kw;
            })()`);
            const at = more ? await pointIn("[data-tour-kw]", 6, 6) : null;
            if (!at) skip("pin-keyword-more", "every keyword's box is shown");
            else {
              await mouse(at.x, at.y, 600);
              const beside = await evaluate(`(() => {
                const t = document.querySelector('#gm-tip.gm-tip-on');
                const p = document.querySelector('#gm-tip-pin.gm-tip-on');
                if (!t || !p) return false;
                const a = t.getBoundingClientRect();
                const b = p.getBoundingClientRect();
                const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                return !overlap;
              })()`);
              if (!beside)
                fail(
                  "pin-keyword-more",
                  `the box of ${more} covers the pinned card or is missing`,
                );
              else note(`pin-keyword-more: ${more} shown beside the card`);
              if (want("pin-keyword-more")) await shot("pin-keyword-more");
            }
          }
        }
      } else skip("pin-spell", "no spellbook page");
      await escape(); // the card
      await sleep(200);
      await escape(); // the book
      await sleep(200);
    }
    await park();
  }
  if (want("pin-town") || want("pin-dwelling")) {
    const st = await game("state()");
    const id =
      Object.values(st.towns).find((t) => t.owner === st.currentPlayer)?.id ??
      Object.keys(st.towns)[0];
    await game(`openTown(${JSON.stringify(id)})`);
    await waitFor("document.querySelector('.gm-town')", "town screen");
    await park();
    await sleep(500);
    if (
      want("pin-town") &&
      (await pinShot("pin-town", ".gm-hall-tile", 30, 20))
    ) {
      // A left click on another tile closes the card and selects nothing.
      const other = await evaluate(`(() => {
        const t = [...document.querySelectorAll('.gm-hall-tile')].filter((x) => !x.classList.contains('gm-selected'))[3];
        if (!t) return null;
        const b = t.getBoundingClientRect();
        return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), id: t.dataset.building };
      })()`);
      if (other) {
        await leftClick(other.x, other.y, 400);
        const selected = await evaluate(
          `Boolean(document.querySelector('.gm-hall-tile.gm-selected[data-building=${JSON.stringify(other.id)}]'))`,
        );
        if ((await pinnedText()) !== null)
          fail("pin-town", "a click elsewhere left the card pinned");
        else if (selected)
          fail("pin-town", `the closing click also selected ${other.id}`);
        else note(`pin-town: the closing click did not select ${other.id}`);
      }
    }
    await park();
    if (want("pin-dwelling")) {
      await pinShot("pin-dwelling", ".gm-town [data-creature]", 20, 20);
      await escape();
      await sleep(200);
    }
    await escape();
    await waitFor("!document.querySelector('.gm-town')", "town closed");
  }
  const menus = await evaluate("window.__menus");
  if (menus.open > 0)
    fail(
      "pin",
      `${menus.open} of ${menus.seen} right-clicks left the browser menu on`,
    );
  else note(`pin: ${menus.seen} right-clicks, the browser menu never allowed`);
}

/** A site or dwelling within today's reach, so its dialog opens. */
async function siteScreen() {
  if (!want("site")) return;
  // Clear the guards, reveal the map and refill the hero's movement.
  await editSave(
    "s.monsters = {}; s.players[0].explored = s.players[0].explored.map(() => true); for (const h of s.heroes) { h.pendingLevelUps = 0; if (h.owner === 0) h.mp = h.maxMp; }",
  );
  await continueSaved();
  await idle();
  const site = await evaluate(`(async () => {
    const m = await import('/src/core/game/site-state.ts');
    const sites = await import('/src/core/game/sites.ts');
    const g = window.__bmGame;
    const s = g.state();
    const hero = s.heroes.find((h) => h.id === g.selectedHero());
    const byId = new Map(s.map.objects.map((o) => [o.id, o]));
    // Entered (not a pickup) and with something to choose: a dialog opens.
    const ok = g.targets().filter((t) => t.today &&
      ['dwelling', 'site', 'bank'].includes(t.kind) && byId.has(t.id) &&
      !m.isPickup(byId.get(t.id)) && sites.siteOptions(s, hero, byId.get(t.id)).length > 0);
    return ok.find((t) => t.kind === 'dwelling') ?? ok.find((t) => t.kind === 'site') ?? ok[0] ?? null;
  })()`);
  if (site === null)
    return fail("site", "no site with a choice in today's reach");
  note(`site: ${site.id} (${site.kind}, cost ${site.cost})`);
  await game(`click(${site.x}, ${site.y})`);
  await sleep(200);
  await game(`click(${site.x}, ${site.y})`);
  const open = await waitMaybe("document.querySelector('.gm-modal')", 10000);
  await sleep(400);
  await shot("site");
  if (!open) fail("site", `no dialog after walking to ${site.id}`);
  await escape();
  await sleep(300);
}

/**
 * Magic made visible (bead bzc.81): the hero placed next to a human town
 * with guild levels 1-2 and Storm and Bloom rank 1 steps in: the learn
 * dialog, then the Mage Guild dialog and a guild tile's pane; a hero with
 * no school steps in: the one-time explanation; a Roadside Inn and a buried
 * cache by the hero: the bought rumour's dialog and its area on the map.
 */
const MAGIC_SETUP = `
  s.monsters = {};
  s.players[0].explored = s.players[0].explored.map(() => true);
  s.players[0].resources.gold = 20000;
  const h = s.heroes.find((x) => x.owner === 0 && x.alive);
  for (const x of s.heroes) x.pendingLevelUps = 0;
  h.mp = h.maxMp = 2000;
  h.pages = []; h.feats = [];
  const occupied = (x, y) =>
    s.map.objects.some((o) => (o.x === x && o.y === y && o.kind !== 'buried') || o.blocked.some(([bx, by]) => bx === x && by === y)) ||
    s.heroes.some((o) => o.alive && o !== h && o.x === x && o.y === y);
  const passable = (x, y) => {
    const c = s.map.cells[y * s.map.width + x];
    return c && c.obstacle === 'none' && c.terrain !== 'water' && !occupied(x, y);
  };
  const near = (x, y) => [[0,1],[1,0],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]
    .map(([dx, dy]) => [x + dx, y + dy]).find(([a, b]) => passable(a, b)) ?? null;
`;

async function magicScreens() {
  if (!wantFamily("magic")) return;
  // The learn dialog, the guild dialog and a guild tile's pane.
  await editSave(`${MAGIC_SETUP}
    const t = Object.values(s.towns).find((x) => x.faction === 'humans');
    const o = s.map.objects.find((x) => x.id === t.id);
    t.owner = 0;
    for (const b of ['magic-guild-1', 'magic-guild-2']) if (!t.buildings.includes(b)) t.buildings.push(b);
    h.skills = [{ id: 'stormcalling', rank: 1 }, { id: 'greencraft', rank: 1 }];
    const spot = near(o.x, o.y);
    h.x = spot[0]; h.y = spot[1];
    window.__magic = { town: t.id, x: o.x, y: o.y, spot };
  `);
  const at = await evaluate("window.__magic");
  note(`magic town: ${JSON.stringify(at)}`);
  await continueSaved();
  await idle();
  await sleep(1200);
  await game(`click(${at.x}, ${at.y})`);
  await sleep(700); // past the double-click window: a walk, not "open"
  await game(`click(${at.x}, ${at.y})`);
  if (!(await waitMaybe("document.querySelector('.gm-modal')", 10000))) {
    await shot("magic-failure");
    note(
      `hero now: ${JSON.stringify(await evaluate("(() => { const s = window.__bmGame.state(); const h = s.heroes.find((x) => x.owner === 0 && x.alive); return [h.x, h.y, h.mp, h.pages.length]; })()"))}`,
    );
    return fail("magic-learn", "no learn dialog on entering the town");
  }
  await sleep(500);
  if (want("magic-learn")) await shot("magic-learn");
  await key("Enter");
  await waitFor("document.querySelector('.gm-town')", "town screen");
  await park();
  await sleep(400);
  if (want("magic-guild")) {
    if (await clickText(".gm-town button", "Mage Guild")) {
      await sleep(500);
      await shot("magic-guild");
      await escape();
      await sleep(300);
    } else fail("magic-guild", "no Mage Guild button");
  }
  if (want("magic-guild-pane")) {
    await clickFirst('.gm-hall-tile[data-building="magic-guild-1"]');
    await park();
    await sleep(400);
    await shot("magic-guild-pane");
  }
  await escape();
  await waitFor("!document.querySelector('.gm-town')", "town closed");

  // A hero with no school: the one-time explanation.
  if (want("magic-noschool")) {
    await editSave(`${MAGIC_SETUP}
      const t = s.towns[${JSON.stringify(at.town)}];
      h.skills = [];
      h.pages = [];
      const spot = near(${at.x}, ${at.y});
      h.x = spot[0]; h.y = spot[1];
    `);
    await continueSaved();
    await idle();
    await sleep(1200);
    await game(`click(${at.x}, ${at.y})`);
    await sleep(700);
    await game(`click(${at.x}, ${at.y})`);
    if (
      await waitMaybe("document.querySelector('.gm-noschool-dialog')", 10000)
    ) {
      await sleep(500);
      await shot("magic-noschool");
      await key("Enter");
      await waitMaybe("document.querySelector('.gm-town')", 5000);
      await escape();
      await sleep(300);
    } else fail("magic-noschool", "no explanation for a hero with no school");
  }

  // A Roadside Inn and a buried cache beside the hero: the rumour.
  if (!want("magic-rumour") && !want("magic-rumour-map")) return;
  await editSave(`${MAGIC_SETUP}
    const inn = near(h.x, h.y);
    s.map.objects.push({ id: 'tour-inn', kind: 'site', x: inn[0], y: inn[1], footprint: { w: 1, h: 1 }, blocked: [], data: { type: 'roadside-inn' } });
    let cache = null;
    for (let r = 4; r < 9 && cache === null; r++)
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
        if (passable(h.x + dx, h.y + dy)) { cache = [h.x + dx, h.y + dy]; break; }
      }
    s.map.objects.push({ id: 'tour-cache', kind: 'buried', x: cache[0], y: cache[1], footprint: { w: 1, h: 1 }, blocked: [], data: { type: 'buried-cache', prize: { gold: 2000 } } });
    window.__inn = { x: inn[0], y: inn[1], cache };
  `);
  const inn = await evaluate("window.__inn");
  note(`rumour inn: ${JSON.stringify(inn)}`);
  await continueSaved();
  await idle();
  await sleep(1200);
  await game(`click(${inn.x}, ${inn.y})`);
  await sleep(200);
  await game(`click(${inn.x}, ${inn.y})`);
  if (!(await waitMaybe("document.querySelector('.gm-site-dialog')", 10000)))
    return fail("magic-rumour", "no inn dialog");
  await sleep(300);
  // The one open choice (Buy a rumour) is the default: Enter.
  await key("Enter");
  if (!(await waitMaybe("document.querySelector('.gm-result-dialog')", 5000)))
    return fail("magic-rumour", "no rumour dialog after buying");
  await sleep(500);
  if (want("magic-rumour")) await shot("magic-rumour");
  await key("s");
  await sleep(1800);
  if (want("magic-rumour-map")) await shot("magic-rumour-map");
}

async function laterScreens() {
  if (wantFamily("levelup")) {
    await editSave(
      "const h = s.heroes.find((x) => x.owner === 0 && x.alive); h.pendingLevelUps = 1; h.levelUpStep = 'skill';",
    );
    await continueSaved();
    await waitFor("document.querySelector('.hs-draft-dialog')", "draft");
    await sleep(600);
    if (want("levelup")) await shot("levelup");
    await hoverShot("levelup-hover", ".hs-card", 40, 30);
  }
  for (const status of ["won", "lost"]) {
    if (!want(`end-${status}`)) continue;
    await editSave("for (const h of s.heroes) h.pendingLevelUps = 0;");
    await continueSaved();
    await idle();
    await game(`previewEnd(${status === "won"})`);
    await waitFor("document.querySelector('.gm-end')", "end screen");
    await sleep(500);
    await shot(`end-${status}`);
  }
}

/** Hex centres of the battlefield in page pixels (debug route's pointAt). */
const hexPoints = () =>
  evaluate(`(async () => {
    const g = await import('/src/render/battle/geometry.ts');
    const hx = await import('/src/core/battle/hex.ts');
    const canvas = document.querySelector('.bm-battle canvas');
    const rect = canvas.getBoundingClientRect();
    const v = canvas.dataset;
    const view = { zoom: Number(v.zoom ?? rect.width / g.STAGE_W), x: Number(v.x ?? 0), y: Number(v.y ?? 0) };
    const out = [];
    for (let row = 0; row < hx.BATTLE_HEIGHT; row++)
      for (let col = 0; col < hx.BATTLE_WIDTH; col++) {
        const p = g.stageToView(g.hexToStage({ col, row }), view);
        out.push({ col, row, x: Math.round(rect.left + p.x), y: Math.round(rect.top + p.y) });
      }
    return out;
  })()`);

/** A castable battle page (greyed ones carry aria-disabled since bzc.63). */
const READY_PAGE = "button.bm-spell.bm-st-ready:not([aria-disabled='true'])";

/** What the pointer shows while a spell is chosen. */
const castHover = () =>
  evaluate(`(() => {
    const tip = document.querySelector('.bm-tip');
    const text = tip && !tip.hidden ? tip.innerText : '';
    const pv = document.querySelector('.bm-cast-preview.bm-hovered');
    return { text, hovered: Boolean(pv), refused: Boolean(pv?.querySelector('.bm-cast-refused')) };
  })()`);

/**
 * Battle with a spell chosen: the first ready pages in turn, each swept over
 * the field (pointer moves only, never a click) for a valid target and a
 * target that would have no effect. Escape cancels each cast.
 */
async function battleSpell() {
  const ready = await evaluate(
    `[...document.querySelectorAll(${JSON.stringify(READY_PAGE)})].filter((b) => !b.disabled).length`,
  );
  if (ready === 0) return skip("battle-spell", "no ready page in the book");
  const points = await hexPoints();
  let first = true;
  let valid = !want("battle-spell-hover");
  let none = !want("battle-spell-noeffect");
  for (let i = 0; i < Math.min(ready, 8) && !(valid && none); i++) {
    if (!(await evaluate("Boolean(document.querySelector('button.bm-spell'))")))
      await key("b");
    await sleep(200);
    const name = await evaluate(`(() => {
      const b = [...document.querySelectorAll(${JSON.stringify(READY_PAGE)})].filter((x) => !x.disabled)[${i}];
      if (!b) return null;
      b.click();
      return b.dataset.spell ?? b.querySelector('.bm-spell-name')?.textContent ?? '?';
    })()`);
    if (name === null) break;
    await park();
    await sleep(500);
    if (first) {
      first = false;
      note(`battle spell chosen: ${name}`);
      if (want("battle-spell")) await shot("battle-spell");
    }
    for (const p of points) {
      if (valid && none) break;
      await mouse(p.x, p.y, 30);
      const h = await castHover();
      if (!none && /no effect/i.test(h.text)) {
        none = true;
        await sleep(300);
        note(`no-effect target: ${name} at ${p.col},${p.row}`);
        await shot("battle-spell-noeffect");
      } else if (!valid && h.hovered && !h.refused) {
        valid = true;
        await sleep(300);
        note(`valid target: ${name} at ${p.col},${p.row}`);
        await shot("battle-spell-hover");
      }
    }
    await escape(); // cancel the cast
    await park();
    await sleep(200);
  }
  if (!valid) skip("battle-spell-hover", "no valid target found");
  if (!none) skip("battle-spell-noeffect", "no no-effect target found");
}

/**
 * Right-click in battle (UI2-18): a book page pins its card (Escape closes
 * the card and leaves the book open); a stack still opens its info panel;
 * the browser menu never opens.
 */
async function pinBattle() {
  await watchMenus();
  await park();
  if (await pinShot("pin-battle", ".bm-spell", 24, 24)) {
    await escape();
    await sleep(200);
    const book = await evaluate(
      "Boolean([...document.querySelectorAll('.bm-spell')].find((b) => b.offsetParent !== null))",
    );
    if ((await pinnedText()) !== null)
      fail("pin-battle", "Escape left the card pinned");
    else if (!book) fail("pin-battle", "Escape closed the book too");
  }
  const menus = await evaluate("window.__menus");
  if (menus.open > 0)
    fail("pin-battle", `${menus.open} right-clicks left the browser menu on`);
  await park();
}

async function battleScreens() {
  const battles = [
    ["battle", "view=battle&scenario=realm&steps=0"],
    ["battle-hover", "view=battle&scenario=realm&steps=2&hover=melee"],
    ["battle-info", "view=battle&scenario=horde&steps=0&info=d1"],
    [
      "battle-book",
      "view=battle&scenario=restless&magic=1&items=1&steps=0&book=1",
    ],
    ["battle-result", "view=battle&scenario=realm&auto=1&speed=4"],
    // Losses per unit type with split stacks (bead bzc.92).
    ["battle-result-split", "view=battle&scenario=split&auto=1&speed=4"],
  ];
  for (const [name, q] of battles) {
    const spell = name === "battle-book" && wantFamily("battle-spell");
    const pinBook = name === "battle-book" && want("pin-battle");
    if (
      name.startsWith("battle-result")
        ? !named(name)
        : !want(name) && !spell && !pinBook
    )
      continue;
    await go(`?mute=1&${q}`);
    await waitFor(
      "document.querySelector('.bm-battle canvas')",
      "battle",
      30000,
    );
    if (name.startsWith("battle-result")) {
      await waitFor(
        "document.querySelector('.bm-ok')",
        "battle result",
        120000,
      );
    }
    await sleep(2500);
    if (want(name)) await shot(name);
    // UI2-05: with a full hero (items=1&magic=1) every action label shows
    // whole and the bar row does not overflow.
    if (name === "battle-book" && want(name)) {
      const cut = await evaluate(`(() => {
        const out = [];
        for (const l of document.querySelectorAll('.bm-act-label'))
          if (l.scrollWidth > l.clientWidth + 1 || l.scrollHeight > l.clientHeight + 1 || l.getClientRects().length === 0)
            out.push(l.textContent);
        for (const sel of ['.bm-actionbar', '.bm-actbar-main']) {
          const row = document.querySelector(sel);
          if (row && row.scrollWidth > row.clientWidth + 1) out.push(sel + ' overflows');
        }
        // The hero's group is the crowded one: its last button must end
        // before the Keys, Auto and Speed cluster starts.
        const acts = [...document.querySelectorAll('.bm-act')];
        const sys = document.querySelector('.bm-sys');
        const last = acts[acts.length - 1];
        if (last && sys && last.getBoundingClientRect().right > sys.getBoundingClientRect().left)
          out.push('the bar runs under the cluster');
        return out;
      })()`);
      if (cut.length > 0) fail(name, `action labels cut: ${cut.join(", ")}`);
      else note("action bar: every label whole");
    }
    if (pinBook) await pinBattle();
    if (spell) await battleSpell();
  }
}

async function tour() {
  await send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await menuScreens();
  await galleryScreens();
  await adventureScreens();
  await richScreens();
  await siteScreen();
  await magicScreens();
  await laterScreens();
  await battleScreens();
}

// ---------------------------------------------------------------- main
let failed = false;
try {
  mkdirSync(OUT, { recursive: true });
  BASE = urlArg === "auto" || urlArg === "-" ? await startServer() : urlArg;
  if (urlArg !== "auto" && urlArg !== "-") {
    // A given server must answer now: a stale one fails fast.
    const r = await fetch(BASE, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`${BASE} answered ${r.status}`);
  }
  await startChrome();
  console.log(`- server ${BASE}, DevTools port ${cdpPort}, out ${OUT}`);
  for (const [w, h] of SIZES) {
    W = w;
    H = h;
    console.log(`- size ${W}x${H}`);
    try {
      await tour();
    } catch (error) {
      failed = true;
      console.error(`FAIL at ${W}x${H}: ${error.message}`);
      try {
        await shot("failure");
      } catch {
        // no page
      }
    }
  }
} catch (error) {
  failed = true;
  console.error(`FAIL: ${error.message}`);
}
const ok = !failed && errors.length === 0 && failures.length === 0;
console.log(
  JSON.stringify({
    ok,
    url: BASE,
    cdpPort,
    out: OUT,
    sizes: SIZES.map(([w, h]) => `${w}x${h}`),
    shots: shots.length,
    failures,
    skipped,
    errors,
  }),
);
clearTimeout(deadline);
cleanup();
await sleep(300);
process.exit(ok ? 0 : 1);
