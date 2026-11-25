/* global Buffer, URL, WebSocket, console, fetch, process, setTimeout */
// Map view polish check (bead border_marches-xaj.18): the input switch, the
// camera glides, the floating lines at the hero and the debug page.
//
//   npx vite --port 6302 --strictPort &
//   node tests/ui/map-view-check.mjs [url] [screens-dir] [ai]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1), hand-built saves.
// Pass `ai` as the third argument to also end ONE turn and watch one AI turn
// (the AI walk glide and the input switch during it); without it no turn is
// ended and no AI plays. Prints each check and its numbers; exits non-zero
// when one fails or the page throws.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:6302/";
const OUT = process.argv[3] ?? ".orchestration/screens/xaj18";
const WITH_AI = process.argv[4] === "ai";
const [W, H] = [1440, 900];
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9371;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bm-mapview-"));
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
const failures = [];

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
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  console.log(`  shot ${file}`);
}

function check(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(detail)}`);
  if (!ok) failures.push(name);
}

async function go(search) {
  const url = new URL(BASE);
  url.search = search;
  await send("Page.navigate", { url: url.href });
  await sleep(300);
}

const game = (expr) => evaluate(`window.__bmGame.${expr}`);
const idle = () =>
  waitFor("window.__bmGame && !window.__bmGame.busy()", "idle", 60000);

const KEYS = {
  ArrowRight: 39,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowDown: 40,
  Escape: 27,
  " ": 32,
  e: 69,
};
const keyEvent = (type, key) =>
  send("Input.dispatchKeyEvent", {
    type,
    key,
    code:
      key === " "
        ? "Space"
        : key.length === 1
          ? `Key${key.toUpperCase()}`
          : key,
    windowsVirtualKeyCode: KEYS[key],
    ...(type === "keyDown" && key.length === 1 ? { text: key } : {}),
  });
const holdKey = async (key, ms) => {
  await keyEvent("keyDown", key);
  await sleep(ms);
  await keyEvent("keyUp", key);
};
const pressKey = (key) => holdKey(key, 30);
const mouse = (type, x, y, extra = {}) =>
  send("Input.dispatchMouseEvent", { type, x, y, ...extra });

/** Client point of the selected hero's cell centre. */
const heroPos = async () => {
  const id = await game("selectedHero()");
  const h = (await game("state()")).heroes.find((x) => x.id === id);
  return game(`cellToClient(${h.x}, ${h.y})`);
};
/** Client point of a fixed cell (the camera's position, inverted). */
const cellPos = (x, y) => game(`cellToClient(${x}, ${y})`);
const canvasRect = () =>
  evaluate(
    "(() => { const r = document.querySelector('canvas.gm-map').getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; })()",
  );
const tipOn = () =>
  evaluate(
    "document.getElementById('gm-tip')?.classList.contains('gm-tip-on') === true",
  );
const same = (a, b) =>
  a !== null &&
  b !== null &&
  Math.abs(a.x - b.x) < 1 &&
  Math.abs(a.y - b.y) < 1;

/** Edits the stored save in the page (a function body over `s`). */
const editSave = (body) =>
  evaluate(`(async () => {
    const raw = JSON.parse(localStorage.getItem('border-marches.save'));
    const s = raw.state;
    ${body}
    localStorage.setItem('border-marches.save', JSON.stringify(raw));
  })()`);

async function continueSaved() {
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.gm-menu-main')]
      .find((n) => n.textContent.trim().startsWith('Continue'));
    b.click();
  })()`);
  await waitFor("window.__bmGame", "adventure screen");
  await idle();
  await sleep(2600); // the day toast fades
}

/**
 * The hand-built save: the human hero with a big army and full movement, a
 * second human hero on a far explored cell, and (for the AI check) an AI
 * hero standing in sight.
 */
const HAND_BUILT = `
  const p0 = s.players.find((p) => p.id === 0);
  const h = s.heroes.find((x) => x.owner === 0 && x.alive);
  h.mp = 3000; h.maxMp = 3000;
  h.army = h.army.map((st) => st ? { ...st, count: st.count * 20 } : st);
  const w = s.map.width;
  const blocked = new Set();
  for (const o of s.map.objects) {
    blocked.add(o.y * w + o.x);
    for (const [bx, by] of o.blocked) blocked.add(by * w + bx);
  }
  const free = (x, y) => {
    const c = s.map.cells[y * w + x];
    return c && c.obstacle === 'none' && c.terrain !== 'water' &&
      !blocked.has(y * w + x) && p0.explored[y * w + x] &&
      !s.heroes.some((o) => o.alive && o.x === x && o.y === y);
  };
  // The hero stands two steps from a free mine (a visit that floats).
  let mine = null;
  for (const o of s.map.objects) {
    if (o.kind !== 'mine' || s.mines[o.id]?.owner != null) continue;
    if (o.x < 9 || o.x > w - 10 || o.y < 7 || o.y > s.map.height - 8) continue;
    const near = [];
    for (let y = 0; y < s.map.height; y++)
      for (let x = 0; x < w; x++)
        if (Math.hypot(x - o.x, y - o.y) <= 4 && !p0.explored[y * w + x]) near.push(y * w + x);
    for (const i of near) p0.explored[i] = true;
    const spot = [[0, 2], [1, 2], [-1, 2], [2, 1], [-2, 1], [2, 0], [-2, 0], [0, 3], [1, 1], [-1, 1]]
      .map(([dx, dy]) => [o.x + dx, o.y + dy]).find(([x, y]) => free(x, y));
    if (spot) { h.x = spot[0]; h.y = spot[1]; mine = o; break; }
    for (const i of near) p0.explored[i] = false;
  }
  // Explore a wide disc round the hero so the far hero is in sight.
  for (let y = 0; y < s.map.height; y++)
    for (let x = 0; x < w; x++)
      if (Math.hypot(x - h.x, y - h.y) <= 16) p0.explored[y * w + x] = true;
  let far = null;
  for (let y = 0; y < s.map.height; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - h.x, y - h.y);
      if (free(x, y) && d <= 15 && (far === null || d > far.d)) far = { x, y, d };
    }
  const two = { ...structuredClone(h), id: h.id + '-two', name: 'Second', x: far.x, y: far.y };
  s.heroes.push(two);
  let near = null;
  for (let y = 0; y < s.map.height; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - h.x, y - h.y);
      if (free(x, y) && d >= 5 && d <= 7 && near === null) near = { x, y };
    }
  // No guards within 9 cells: the visits below are free to walk to.
  for (const [id, m] of Object.entries(s.monsters))
    if (Math.hypot(m.x - h.x, m.y - h.y) <= 9) delete s.monsters[id];
  const ai = s.heroes.find((x) => x.owner !== 0 && x.alive);
  if (ai && near) { ai.x = near.x; ai.y = near.y; }
  window.__hand = { mine: mine ? [mine.id, mine.x, mine.y] : null, hero: [h.x, h.y], two: [two.x, two.y], ai: ai ? [ai.x, ai.y] : null };
`;

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

  // ------------------------------------------------ a new game, centred
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await evaluate("localStorage.clear()");
  await go("?mute=1&seed=4242&size=S&players=3&faction=humans&autostart=1");
  await waitFor("window.__bmGame", "adventure screen");
  await idle();
  await sleep(2600);
  await editSave(HAND_BUILT);
  const hand = await evaluate("window.__hand");
  console.log(`  hand-built: ${JSON.stringify(hand)}`);
  await continueSaved();
  const rect = await canvasRect();
  const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  // Centred, or as near as the camera goes at the map's edge.
  const inMiddle = (p) =>
    p !== null &&
    Math.abs(p.x - centre.x) < rect.w / 4 &&
    Math.abs(p.y - centre.y) < rect.h / 4;
  const start = await heroPos();
  check("turn start centres the hero", inMiddle(start), {
    hero: start,
    centre,
  });
  await shot("01-turn-start-centred");

  // ------------------------------------------------ input off under town
  const [hx, hy] = hand.hero;
  const before = await cellPos(hx, hy);
  const townId = Object.values((await game("state()")).towns).find(
    (t) => t.owner === 0,
  ).id;
  await game(`openTown(${JSON.stringify(townId)})`);
  await waitFor("document.querySelector('.gm-town')", "town screen");
  await sleep(300);
  await holdKey("ArrowRight", 700);
  await mouse("mouseMoved", 3, 450);
  await sleep(600);
  await mouse("mouseWheel", 600, 400, { deltaX: 0, deltaY: -120 });
  await shot("02-town-open-arrow-held");
  await pressKey("Escape");
  await waitFor("!document.querySelector('.gm-town')", "town closed");
  await sleep(300);
  const after = await cellPos(hx, hy);
  check("no pan or zoom under the town screen", same(before, after), {
    before,
    after,
  });
  await shot("03-town-closed-map-unmoved");

  // ------------------------------------------------ input resumes
  await mouse("mouseMoved", 700, 450);
  await holdKey("ArrowLeft", 300);
  await sleep(100);
  const panned = await cellPos(hx, hy);
  check(
    "arrow keys pan again after the town",
    panned !== null && Math.abs(panned.x - after.x) > 50,
    { after, panned },
  );
  // A drag cut short by a screen leaves no drag behind.
  await mouse("mouseMoved", 700, 450);
  await mouse("mousePressed", 700, 450, {
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await mouse("mouseMoved", 760, 470, { button: "left", buttons: 1 });
  await sleep(100);
  const dragged = await cellPos(hx, hy);
  await game(`openTown(${JSON.stringify(townId)})`);
  await waitFor("document.querySelector('.gm-town')", "town screen");
  await mouse("mouseReleased", 760, 470, {
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await pressKey("Escape");
  await waitFor("!document.querySelector('.gm-town')", "town closed");
  await sleep(200);
  const settled = await cellPos(hx, hy);
  await mouse("mouseMoved", 820, 520);
  await sleep(60);
  await mouse("mouseMoved", 900, 560);
  await sleep(200);
  const moved = await cellPos(hx, hy);
  check("dragging moved the map", Math.abs(dragged.x - panned.x) > 40, {
    panned,
    dragged,
  });
  check("no stuck drag after the town", same(settled, moved), {
    settled,
    moved,
  });

  // ------------------------------------------------ edge scroll dwell
  await mouse("mouseMoved", rect.x + rect.w - 4, 450);
  await sleep(90);
  const edge0 = await cellPos(hx, hy);
  await sleep(500);
  const edge1 = await cellPos(hx, hy);
  await mouse("mouseMoved", 700, 450);
  check(
    "edge scroll waits, then scrolls",
    Math.abs(edge0.x - moved.x) < 2 && Math.abs(edge1.x - edge0.x) > 50,
    { moved, edge0, edge1 },
  );

  // ------------------------------------------------ wheel zoom in steps
  const cell = async () => {
    const a = await cellPos(hx, hy);
    const b = await cellPos(hx + 1, hy);
    return a && b ? Math.round(b.x - a.x) : null;
  };
  const z0 = await cell();
  for (let i = 0; i < 14; i++) {
    await mouse("mouseWheel", 700, 450, { deltaX: 0, deltaY: -6 });
    await sleep(12);
  }
  await sleep(200);
  const z1 = await cell();
  check("a trackpad flick zooms one step", z0 === 60 && z1 === 80, { z0, z1 });
  for (let i = 0; i < 6; i++) {
    await mouse("mouseWheel", 700, 450, { deltaX: 0, deltaY: 100 });
    await sleep(300);
  }
  const z2 = await cell();
  check("zoom stops at the smallest step", z2 === 60, { z2 });

  // ------------------------------------------------ a real mouse click plans
  const hint = () =>
    evaluate("document.querySelector('.gm-hint-line')?.textContent ?? ''");
  const hint0 = await hint();
  const near = await cellPos(hx + 2, hy);
  await mouse("mouseMoved", near.x, near.y);
  await mouse("mousePressed", near.x, near.y, {
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await mouse("mouseReleased", near.x, near.y, {
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await sleep(200);
  const hint1 = await hint();
  const toasts = await evaluate(
    "[...document.querySelectorAll('.gm-toast')].map((n) => n.textContent)",
  );
  check(
    "a real click on the map still plans a path",
    hint1 !== hint0 || toasts.includes("No way there"),
    { hint0, hint1, toasts },
  );
  await pressKey("Escape");

  // ------------------------------------------------ glide to another hero
  const ids = (await game("state()")).heroes
    .filter((h) => h.owner === 0 && h.alive)
    .map((h) => h.id);
  const two = ids.find((id) => id.endsWith("-two"));
  const [tx, ty] = hand.two;
  // The camera, frame by frame, sampled in the page (cell 0,0 on screen).
  const samples = await evaluate(`new Promise((done) => {
    const g = window.__bmGame;
    const out = [];
    g.selectHero(${JSON.stringify(two)});
    const t0 = performance.now();
    const step = () => {
      out.push(Math.round(g.cellToScreen(0, 0).x));
      if (performance.now() - t0 < 800) requestAnimationFrame(step);
      else done(out);
    };
    requestAnimationFrame(step);
  })`);
  const end = await cellPos(tx, ty);
  const distinct = [...new Set(samples)];
  check(
    "switching heroes glides (several frames between)",
    distinct.length >= 8,
    {
      frames: samples.length,
      distinct: distinct.length,
      from: samples[0],
      to: samples.at(-1),
      path: distinct.slice(0, 24),
    },
  );
  // A mid-glide frame for the eye: back to the first hero, shot at 160 ms.
  await game(`selectHero(${JSON.stringify(ids[0])})`);
  await sleep(160);
  await shot("04-hero-switch-mid-glide");
  await sleep(800);
  await game(`selectHero(${JSON.stringify(two)})`);
  await sleep(800);
  check("the glide ends on the hero", inMiddle(end), { end, centre });
  await shot("05-hero-switch-glide-end");
  await game(`selectHero(${JSON.stringify(ids[0])})`);
  await sleep(800);

  // ------------------------------------------------ walk: floats at the hero
  const targets = await game("targets()");
  console.log(
    `  targets: ${JSON.stringify(targets.filter((t) => t.today).map((t) => [t.kind, t.type, t.x, t.y]))}`,
  );
  const goal =
    targets.find((t) => t.today && t.kind === "mine") ??
    targets.find((t) => t.today && t.kind === "site") ??
    targets.find((t) => t.today && t.kind !== "monster" && t.kind !== "town");
  console.log(`  walk target: ${JSON.stringify(goal)}`);
  if (goal) {
    // Look away first: the camera comes back before the walk.
    await holdKey("ArrowDown", 400);
    await game(`click(${goal.x}, ${goal.y})`);
    await sleep(200);
    await shot("06-path-planned-looked-away");
    await game(`click(${goal.x}, ${goal.y})`);
    await sleep(500);
    await shot("07-walk-mid");
    await waitFor(
      "document.querySelector('.gm-float, .gm-fly-pickup, .gm-backdrop')",
      "a float, pickup or dialog",
      15000,
    );
    await sleep(350);
    await shot("08-float-at-hero");
    const floats = await evaluate(
      "[...document.querySelectorAll('.gm-float')].map((n) => n.textContent)",
    );
    const toasts = await evaluate(
      "[...document.querySelectorAll('.gm-toast')].map((n) => n.textContent)",
    );
    check(
      "visit lines float at the hero, not as toasts",
      floats.length > 0 ||
        (await evaluate("Boolean(document.querySelector('.gm-backdrop'))")),
      { floats, toasts },
    );
    await idle().catch(() => {});
    await evaluate(
      "document.querySelectorAll('.gm-backdrop button.gm-primary').forEach((b) => b.click())",
    );
    await sleep(1500);
  }

  // ------------------------------------------------ reduced motion float
  await evaluate("localStorage.setItem('border-marches.motion', 'reduced')");
  await continueSaved();
  const targets2 = await game("targets()");
  const goal2 = targets2.find((t) => t.today && t.type === "resource-pile");
  console.log(`  reduced-motion target: ${JSON.stringify(goal2)}`);
  if (goal2) {
    await game(`click(${goal2.x}, ${goal2.y})`);
    await sleep(100);
    await game(`click(${goal2.x}, ${goal2.y})`);
    await waitFor(
      "document.querySelector('.gm-float, .gm-backdrop')",
      "a float or dialog",
      15000,
    );
    await sleep(200);
    await shot("09-reduced-motion-float");
    await evaluate(
      "document.querySelectorAll('.gm-backdrop button.gm-primary').forEach((b) => b.click())",
    );
    await idle().catch(() => {});
  }
  await evaluate("localStorage.removeItem('border-marches.motion')");

  // ------------------------------------------------ one AI turn (opt-in)
  if (WITH_AI) {
    await continueSaved();
    await pressKey("e");
    await sleep(300);
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.gm-backdrop button')].find((n) => n.textContent.startsWith('End turn'));
      b?.click();
    })()`);
    await waitFor("window.__bmGame.aiThinking()", "AI turn", 10000);
    let tipDuringAi = false;
    let n = 0;
    const tA = Date.now();
    while ((await game("aiThinking()")) && Date.now() - tA < 30000) {
      await mouse("mouseMoved", 600 + (n % 5) * 20, 400);
      if (await tipOn()) tipDuringAi = true;
      if (n % 4 === 0 && n < 24)
        await shot(`10-ai-turn-${String(n).padStart(2, "0")}`);
      n += 1;
      await sleep(60);
    }
    check("no hover card during the AI turn", !tipDuringAi, { frames: n });
    await idle().catch(() => {});
    await sleep(900);
    const back = await heroPos();
    check("the human's turn starts on its hero", inMiddle(back), {
      back,
      centre,
    });
    await shot("11-turn-start-after-ai");
  }

  // ------------------------------------------------ marketplace header
  await editSave(`
    for (const t of Object.values(s.towns))
      if (t.owner === 0 && !t.buildings.includes('marketplace')) t.buildings.push('marketplace');
  `);
  await continueSaved();
  const marketTown = Object.values((await game("state()")).towns).find(
    (t) => t.owner === 0,
  ).id;
  await game(`openTown(${JSON.stringify(marketTown)})`);
  await waitFor("document.querySelector('.gm-town')", "town screen");
  const headerWood = () =>
    evaluate(
      "document.querySelectorAll('.gm-town-header .gm-res-amount')[1]?.textContent ?? null",
    );
  const wood0 = await headerWood();
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.gm-town button')].find((n) => n.textContent.trim().startsWith('Marketplace'));
    b.click();
  })()`);
  await waitFor("document.querySelector('.gm-market')", "marketplace");
  // Give wood (the default) for gold: one trade of 5 wood.
  await evaluate(`(() => {
    const s = document.querySelector('.gm-market input.gm-slider');
    s.value = '5';
    s.dispatchEvent(new Event('input'));
    [...document.querySelectorAll('.gm-market button')].find((n) => n.textContent.trim() === 'Trade').click();
  })()`);
  await sleep(300);
  const wood1 = await headerWood();
  await shot("13-market-header-after-trade");
  check(
    "the town header's totals follow each trade",
    wood0 !== null && Number(wood1) === Number(wood0) - 5,
    { wood0, wood1 },
  );
  await evaluate(
    "[...document.querySelectorAll('.gm-backdrop button')].find((n) => n.textContent.trim().startsWith('Done'))?.click()",
  );
  await sleep(300);
  await pressKey("Escape");
  await waitFor("!document.querySelector('.gm-town')", "town closed");

  // ------------------------------------------------ final battle level-up
  await editSave(`
    const h = s.heroes.find((x) => x.owner === 0 && x.alive);
    h.pendingLevelUps = 0; h.xp = 399; h.mp = 3000;
    for (const t of Object.values(s.towns)) t.owner = 0;
    const last = s.players.find((p) => p.id !== 0);
    for (const p of s.players) if (p.id !== 0 && p !== last) p.eliminated = true;
    const w = s.map.width;
    const taken = (x, y) => s.map.objects.some((o) => (o.x === x && o.y === y) ||
      o.blocked.some(([bx, by]) => bx === x && by === y)) ||
      s.heroes.some((o) => o.alive && o.x === x && o.y === y);
    let spot = null;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
      const c = s.map.cells[(h.y + dy) * w + h.x + dx];
      if (c && c.obstacle === 'none' && c.terrain !== 'water' && !taken(h.x + dx, h.y + dy)) {
        spot = [h.x + dx, h.y + dy]; break;
      }
    }
    const foe = s.heroes.find((x) => x.owner === last.id && x.alive);
    s.heroes = s.heroes.filter((x) => x.owner === 0 || x === foe);
    foe.x = spot[0]; foe.y = spot[1];
    const stack = foe.army.find((st) => st);
    foe.army = foe.army.map(() => null);
    foe.army[0] = { ...stack, count: 1 };
    for (const [id, m] of Object.entries(s.monsters))
      if (Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y)) <= 2) delete s.monsters[id];
    window.__final = { foe: spot };
  `);
  const finalFoe = await evaluate("window.__final.foe");
  await continueSaved();
  await game(`click(${finalFoe[0]}, ${finalFoe[1]})`);
  await sleep(200);
  await game(`click(${finalFoe[0]}, ${finalFoe[1]})`);
  await waitFor("document.querySelector('.gm-battle-confirm')", "pre-battle");
  await evaluate(
    "[...document.querySelectorAll('.gm-battle-confirm button')].find((n) => n.textContent.startsWith('Quick combat')).click()",
  );
  // Click through the battle result until a draft or the end screen shows.
  let first = null;
  for (let i = 0; i < 300 && first === null; i++) {
    if (await evaluate("Boolean(document.querySelector('.hs-draft-dialog'))"))
      first = "level-up";
    else if (await evaluate("Boolean(document.querySelector('.gm-end'))"))
      first = "victory";
    else {
      await evaluate(
        "(() => { const b = document.querySelector('button.bm-ok'); if (b) b.click(); })()",
      );
      await sleep(100);
    }
  }
  await sleep(500);
  await shot("14-final-battle-levelup-first");
  check(
    "a won final battle offers its level-up before the victory screen",
    first === "level-up",
    { first },
  );
  if (first === "level-up") {
    await evaluate(
      "document.querySelector('.hs-draft-dialog .gm-primary, .hs-draft-dialog .hs-card')?.click()",
    );
    await waitFor("document.querySelector('.gm-end')", "victory screen", 15000);
    await sleep(400);
    await shot("15-victory-after-levelup");
  }

  // ------------------------------------------------ debug page, no fixture
  await go("?view=map&mute=1");
  await waitFor("window.__mapReady", "map debug page");
  await sleep(500);
  const label = await evaluate(
    "document.getElementById('ui')?.innerText ?? ''",
  );
  check(
    "the debug page shows a generated map",
    /seed 1 \(default\)/.test(label),
    { label },
  );
  await shot("12-debug-page-default");
}

main()
  .catch((e) => {
    console.error(e);
    failures.push(String(e));
  })
  .finally(() => {
    if (errors.length > 0)
      console.log(`page errors: ${JSON.stringify(errors)}`);
    ws?.close();
    chrome.kill();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still hold the profile.
    }
    process.exit(failures.length + errors.length > 0 ? 1 : 0);
  });
