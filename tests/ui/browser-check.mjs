/* global Buffer, URL, WebSocket, console, fetch, process, setTimeout */
// Scripted (not AI) browser check of the game loop, bead border_marches-xaj.10.
//
//   npx vite --port 6291 --strictPort &   (or any running dev/preview server)
//   node tests/ui/browser-check.mjs [url] [screens-dir]
//
// Runs headless system Chrome (muted) through the Chrome DevTools Protocol:
// new game (seed 4242, size S) -> walk to a pickup -> town: build, recruit ->
// a hand-built save (hero 5 XP short of level 2, RULES_V2 3.2: 400) -> battle (opened, then
// auto-combat) -> level-up dialog. Saves 1440x900 screenshots of the
// adventure, town, battle and level-up screens and prints a JSON summary.
// Exits non-zero when a step fails.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:6291/";
const OUT = process.argv[3] ?? ".orchestration/screens/xaj10";
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9341;
const W = 1440;
const H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bm-check-"));
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
const log = [];
const step = (text) => {
  log.push(text);
  console.log(`- ${text}`);
};

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
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  step(`screenshot ${file}`);
}

const clickText = (selector, text) =>
  evaluate(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((n) => n.textContent.trim().startsWith(${JSON.stringify(text)}) && !n.disabled);
    if (!b) return false;
    b.click();
    return true;
  })()`);

const game = (expr) => evaluate(`window.__bmGame.${expr}`);
const idle = () =>
  waitFor("window.__bmGame && !window.__bmGame.busy()", "idle");

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
      log.push(`page error: ${msg.params.exceptionDetails.text}`);
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

  // 1. New game.
  const url = new URL(BASE);
  url.search = "?seed=4242&size=S";
  await send("Page.navigate", { url: url.href });
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await evaluate("localStorage.clear()");
  url.search = "?seed=4242&size=S&autostart=1";
  await send("Page.navigate", { url: url.href });
  await waitFor("window.__bmGame", "adventure screen");
  await idle();
  const s0 = await game("state()");
  step(`new game: day ${s0.day}, hero at ${s0.heroes[0].x},${s0.heroes[0].y}`);
  const saved = await evaluate(
    "localStorage.getItem('border-marches.save') !== null",
  );
  if (!saved) throw new Error("no save after new game");

  // 2. Walk to the nearest pickup reachable today.
  const targets = await game("targets()");
  const pickup = targets.find((t) => t.kind === "pickup" && t.today);
  if (!pickup) throw new Error("no pickup reachable today");
  await game(`click(${pickup.x}, ${pickup.y})`);
  await sleep(300);
  await game(`click(${pickup.x}, ${pickup.y})`);
  await sleep(300);
  await idle();
  // A chest asks first: take the gold.
  if (await evaluate("Boolean(document.querySelector('.gm-modal'))")) {
    await clickText(".gm-modal button", "1000 gold");
    await idle();
  }
  const s1 = await game("state()");
  if (!s1.collected.includes(pickup.id)) {
    throw new Error(`pickup ${pickup.id} not collected`);
  }
  step(`walked to ${pickup.id} and collected it`);
  // Plan a path to the next target for the screenshot.
  const next = (await game("targets()"))[0];
  if (next) await game(`click(${next.x}, ${next.y})`);
  await evaluate(
    "document.querySelector('.gm-map').dispatchEvent(new PointerEvent('pointermove', {clientX: 640, clientY: 380, bubbles: true}))",
  );
  await sleep(2600); // toasts fade
  await shot("adventure");
  // Real key presses: zoom in twice, pan, then zoom back out.
  const press = async (key, code) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  };
  await press("+", "Equal");
  await press("+", "Equal");
  await press("ArrowLeft", "ArrowLeft");
  await sleep(500);
  await shot("adventure-zoom");
  await press("-", "Minus");
  await press("-", "Minus");

  // 3. Town: build, recruit.
  await game("key('t')");
  await waitFor("document.querySelector('.gm-town')", "town screen");
  const townId = Object.values(s1.towns).find((t) => t.owner === 0).id;
  // The hall's detail pane opens on the first building buildable today.
  const built = await clickText(".gm-hall-detail .gm-btn.gm-primary", "Build");
  if (!built) throw new Error("nothing to build");
  const s2 = await game("state()");
  if (!s2.towns[townId].builtToday) throw new Error("build did not happen");
  step(`built: ${s2.towns[townId].buildings.join(", ")}`);
  if (
    !(await evaluate(
      "(() => { const b = document.querySelector('.gm-stock:not(:disabled)'); if (!b) return false; b.click(); return true; })()",
    ))
  ) {
    throw new Error("no recruit button");
  }
  await waitFor("document.querySelector('.gm-modal')", "recruit dialog");
  await evaluate(
    "(() => { const s = document.querySelector('.gm-modal .gm-slider'); s.value = String(Math.min(5, Number(s.max))); s.dispatchEvent(new Event('input')); })()",
  );
  await clickText(".gm-modal button", "Recruit");
  const s3 = await game("state()");
  const before = s2.heroes[0].army.reduce((n, s) => n + (s?.count ?? 0), 0);
  const after = s3.heroes[0].army.reduce((n, s) => n + (s?.count ?? 0), 0);
  const garrison = s3.towns[townId].garrison.reduce(
    (n, s) => n + (s?.count ?? 0),
    0,
  );
  if (after + garrison <= before) throw new Error("recruit did not happen");
  step(`recruited: army ${before} -> ${after}, garrison ${garrison}`);
  await sleep(300);
  await shot("town");
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))",
  );
  await waitFor("!document.querySelector('.gm-town')", "town closed");

  // 4. End the day (auto-save), then a hand-built save: 5 XP short of level 2.
  await game("key('e')");
  await sleep(200);
  const s4 = await game("state()");
  if (s4.day !== 2) throw new Error("end turn did not advance the day");
  step("ended the day; auto-saved day 2");
  await evaluate(`(() => {
    const raw = JSON.parse(localStorage.getItem('border-marches.save'));
    if (raw.state.day !== 2) throw new Error('save is not day 2');
    raw.state.heroes[0].xp = 395;
    localStorage.setItem('border-marches.save', JSON.stringify(raw));
  })()`);
  url.search = "";
  await send("Page.navigate", { url: url.href });
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  if (!(await clickText(".gm-menu-main", "Continue (day 2)"))) {
    throw new Error("no Continue button");
  }
  await waitFor("window.__bmGame", "adventure screen");
  await idle();
  step("continued the saved game (hero XP 395)");

  // 5. Battle: walk to a monster over up to 6 days.
  let fought = false;
  for (let day = 0; day < 6 && !fought; day++) {
    const monster = (await game("targets()")).find((t) => t.kind === "monster");
    if (monster) {
      await game(`click(${monster.x}, ${monster.y})`);
      await sleep(200);
      await game(`click(${monster.x}, ${monster.y})`);
      await sleep(300);
      for (let i = 0; i < 150; i++) {
        if (await evaluate("Boolean(document.querySelector('.gm-modal'))"))
          break;
        if (!(await game("busy()"))) break;
        await sleep(100);
      }
      if (await evaluate("Boolean(document.querySelector('.gm-modal'))")) {
        // A chest on the way: take the gold.
        if (await clickText(".gm-modal button", "1000 gold")) {
          await idle();
        } else {
          fought = true;
          step(
            `battle offered: ${await evaluate("document.querySelector('.gm-battle-confirm .gm-modal-title').textContent")}`,
          );
          break;
        }
      }
    } else {
      // Nothing in reach: walk toward the nearest pickup to explore.
      const p = (await game("targets()"))[0];
      if (p) {
        await game(`click(${p.x}, ${p.y})`);
        await sleep(200);
        await game(`click(${p.x}, ${p.y})`);
        await sleep(300);
        await idle();
        if (await clickText(".gm-modal button", "1000 gold")) await idle();
      }
    }
    if (!fought) {
      await game("key('e')");
      await sleep(300);
    }
  }
  if (!fought) throw new Error("no battle within 6 days");
  await clickText(".gm-modal button", "Fight");
  await waitFor("document.querySelector('.bm-battle canvas')", "battle screen");
  await sleep(2500);
  await shot("battle");
  await evaluate(
    "[...document.querySelectorAll('.bm-battle button')].find((b) => /^Auto/.test(b.textContent)).click()",
  );
  await waitFor("document.querySelector('.bm-ok')", "battle result", 120000);
  const won = await evaluate("Boolean(document.querySelector('.bm-won'))");
  step(`battle over: ${won ? "won" : "lost"}`);
  await evaluate("document.querySelector('.bm-ok').click()");
  if (!won) throw new Error("the scripted battle was lost");

  // 6. Level-up.
  // The skill draft (RULES_V2 3.3): take the first card (the guarantee).
  await waitFor("document.querySelector('.hs-draft-dialog')", "level-up draft");
  await sleep(600);
  await shot("levelup");
  while (
    await evaluate("Boolean(document.querySelector('.hs-draft-dialog'))")
  ) {
    await evaluate(
      "document.querySelector('.hs-draft-dialog .hs-card').click()",
    );
    await sleep(400);
  }
  await idle();
  const s6 = await game("state()");
  if (s6.heroes[0].pendingLevelUps !== 0 || s6.heroes[0].level < 2) {
    throw new Error("level-up not applied");
  }
  step(
    `level-up: level ${s6.heroes[0].level}, skills ${JSON.stringify(s6.heroes[0].skills)}`,
  );
  await sleep(2500);
  await shot("after-battle");
}

let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  console.error(`FAIL: ${error.message}`);
  try {
    await shot("failure");
  } catch {
    // no page
  }
}
const errors = log.filter((l) => l.startsWith("page error"));
console.log(JSON.stringify({ ok: !failed && errors.length === 0, errors }));
ws?.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
process.exit(failed || errors.length > 0 ? 1 : 0);
