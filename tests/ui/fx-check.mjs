/* global Buffer, URL, WebSocket, console, fetch, process, setTimeout */
// Animation evidence (bead border_marches-bzc.26): frame strips of battle
// effects drawn by the `strip=` debug route (deterministic, manual clock),
// and timed screenshots of map and interface motion from a hand-built save.
// Not a simulation: no turn is ended and no AI plays.
//
//   npx vite --port 6297 --strictPort &
//   node tests/ui/fx-check.mjs [url] [out-dir] [only,names]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:6297/";
const OUT = process.argv[3] ?? ".orchestration/screens/bzc26";
const ONLY = process.argv[4] ? new Set(process.argv[4].split(",")) : null;
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9361;
const W = 1440;
const H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bm-fx-"));
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

async function waitFor(expression, what, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const want = (name) => ONLY === null || ONLY.has(name);

async function shot(name, clip) {
  const r = await send("Page.captureScreenshot", {
    format: "png",
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  console.log(`- ${file}`);
}

async function go(search) {
  const url = new URL(BASE);
  url.search = search;
  await send("Page.navigate", { url: url.href });
  await sleep(300);
}

/** A frame strip: the page draws it, then the strip canvas is captured. */
async function strip(name, query) {
  if (!want(name)) return;
  await go(`?mute=1&view=battle&${query}`);
  await waitFor("document.body.dataset.strip === 'done'", `strip ${name}`);
  const info = await evaluate(`(() => {
    const cs = [...document.querySelectorAll('canvas')];
    const c = cs[cs.length - 1];
    const pre = document.querySelector('pre');
    return { note: pre ? pre.textContent : '', png: c ? c.toDataURL('image/png') : null };
  })()`);
  console.log(`  ${info.note}`);
  if (info.png) {
    const file = join(OUT, `${name}.png`);
    writeFileSync(file, Buffer.from(info.png.split(",")[1], "base64"));
    console.log(`- ${file}`);
  } else await shot(name);
}

const REALM = "scenario=realm&magic=1&items=1";
const HORDE = "scenario=horde&magic=1";
const RESTLESS = "scenario=restless&magic=1";
// Stage crops (x, y, w, h) around the armies.
const FIELD = "crop=auto";
const ENEMY = "crop=auto";

async function battleStrips() {
  // One cast per school, on an enemy or a friend.
  await strip(
    "cast-bloom-nettle",
    `${REALM}&strip=cast&spell=nettle&targets=d0&frames=8&t1=1050&${ENEMY}&label=Bloom: Nettle`,
  );
  await strip(
    "cast-bloom-regrow",
    `${REALM}&strip=cast&spell=bramble-row&targets=hex:7.4,hex:8.4,hex:9.4&frames=8&t1=1050&${ENEMY}&label=Bloom: Bramble Row`,
  );
  await strip(
    "cast-bloom-bramble-close",
    `${REALM}&strip=cast&spell=bramble-row&targets=hex:7.4,hex:8.4,hex:9.4&frames=4&t0=450&t1=1400&crop=auto&zoom=3&cols=2&label=Bramble Row, close (3x)`,
  );
  await strip(
    "cast-accord-sign-here",
    `${REALM}&strip=cast&spell=sign-here&targets=d0&frames=8&t1=1050&${ENEMY}&label=Accord: Sign Here`,
  );
  await strip(
    "cast-clock-appointment",
    `${REALM}&strip=cast&spell=late-bell&targets=d0&frames=8&t1=1050&${ENEMY}&label=Clock: Late Bell`,
  );
  await strip(
    "cast-hush-lullaby",
    `${REALM}&strip=cast&spell=lullaby&targets=d1&frames=8&t1=1050&${ENEMY}&label=Hush: Lullaby`,
  );
  await strip(
    "cast-storm-jolt",
    `${REALM}&strip=cast&spell=jolt&targets=d0&frames=8&t1=900&${ENEMY}&label=Storm: Jolt`,
  );
  await strip(
    "cast-storm-cold-snap",
    `${REALM}&strip=cast&spell=cold-snap&targets=d1&frames=8&t1=1050&${ENEMY}&label=Storm: Cold Snap`,
  );
  await strip(
    "cast-storm-wildfire",
    `${REALM}&strip=cast&spell=wildfire&targets=hex:9.5&frames=8&t1=1200&${ENEMY}&label=Storm: Wildfire`,
  );
  await strip(
    "cast-storm-thunderclap",
    `${REALM}&strip=cast&spell=thunderclap&targets=hex:9.5&frames=8&t1=1200&${ENEMY}&label=Storm: Thunderclap`,
  );
  await strip(
    "cast-accord-scapegoat-link",
    `${REALM}&strip=cast&spell=scapegoat&targets=a0,a2&frames=8&t1=1050&crop=auto&label=Accord: Scapegoat (a link)`,
  );
  await strip(
    "cast-clock-wave",
    `${REALM}&strip=cast&spell=quick-march&targets=none&frames=8&t1=1050&crop=0,60,420,380&label=Clock: Quick March (wave)`,
  );
  await strip(
    "cast-hush-pea-soup",
    `${REALM}&strip=cast&spell=pea-soup&targets=hex:10.5&frames=8&t1=1300&${ENEMY}&label=Hush: Pea Soup (mist)`,
  );
  // Strikes, a shot, a push, a death, a Command.
  await strip(
    "strike-melee",
    `${REALM}&active=a4&strip=attack&frames=8&t1=1300&${FIELD}&label=Melee strike and retaliation`,
  );
  await strip(
    "strike-shot",
    `${REALM}&active=a1&strip=shoot&target=d1&frames=8&t1=900&crop=auto&label=Longbow shot`,
  );
  await strip(
    "push-gust",
    `${REALM}&strip=cast&spell=gust&targets=d0,hex:8.4&frames=8&t1=1000&${ENEMY}&label=Storm: Gust (a push)`,
  );
  await strip(
    "death-jolt",
    `${REALM}&strip=cast&spell=the-sky-falls&targets=hex:10.5&frames=8&t1=1600&${ENEMY}&label=Storm: The Sky Falls (deaths, remains)`,
  );
  await strip(
    "command",
    `${REALM}&strip=act&act=swear-in&targets=d0,d2&frames=6&t1=1000&crop=0,0,760,360&cols=3&label=Command banner`,
  );
  await strip(
    "reduced-jolt",
    `${REALM}&strip=cast&spell=jolt&targets=d0&frames=4&t1=600&reduced=1&${ENEMY}&label=Reduced motion: Jolt`,
  );
  await strip(
    "horde-launch",
    `${HORDE}&strip=cast&spell=thunderclap&targets=hex:6.4&frames=8&t1=1200&${FIELD}&label=Horde: Launched`,
  );
  await strip(
    "restless-deaths",
    `${RESTLESS}&strip=cast&spell=the-sky-falls&targets=hex:3.5&frames=10&t1=2600&cols=5&${FIELD}&label=Restless: deaths and remains`,
  );
  await strip(
    "restless-getup2",
    `${RESTLESS}&strip=cast&spell=the-sky-falls&targets=hex:3.5&until=getUp&frames=8&t1=1400&crop=auto&label=Restless: get-up from remains`,
  );
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
  await battleStrips();
  if (want("battle-live")) {
    // The live screen: turn glow, link pulses, idle sparkles; then auto
    // (instant, a quick battle) must reach its result with no page error.
    await go(`?mute=1&view=battle&${REALM}`);
    await waitFor("document.querySelector('.bm-canvas')", "battle");
    await sleep(1500);
    await shot("battle-live");
    await go(`?mute=1&view=battle&${REALM}&auto=1`);
    await waitFor(
      "document.querySelector('.bm-debug-result, .bm-result')",
      "auto result",
      60000,
    );
    await shot("battle-auto-instant");
  }
  await mapAndUi();
}

const game = (expr) => evaluate(`window.__bmGame.${expr}`);
const idle = () =>
  waitFor("window.__bmGame && !window.__bmGame.busy()", "idle");

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
    const b = [...document.querySelectorAll('.gm-menu-main')].find((n) => n.textContent.trim().startsWith('Continue'));
    if (b) b.click();
  })()`);
  await waitFor("window.__bmGame", "adventure screen");
}

/**
 * Freezes every CSS and Web Animation on the page at `t` ms and takes a
 * clipped screenshot: a deterministic frame of interface motion.
 */
async function frameAt(name, t, clip) {
  await evaluate(`(() => {
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${t}; }
  })()`);
  await sleep(60);
  await shot(name, clip);
}

/** Timed screenshots of canvas motion (it runs on the real clock). */
async function burstShots(prefix, n, gap, clip) {
  for (let i = 0; i < n; i++) {
    await shot(`${prefix}-${String(i + 1).padStart(2, "0")}`, clip);
    await sleep(gap);
  }
}

async function mapAndUi() {
  if (
    ![
      "map-pickup",
      "map-levelup",
      "ui-dialog",
      "map-banner",
      "map-flag",
      "ui-book",
    ].some(want)
  )
    return;
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await evaluate("localStorage.clear()");
  await go("?mute=1&seed=4242&size=S&players=3&faction=humans&autostart=1");
  await waitFor("window.__bmGame", "adventure screen");
  await idle();
  await sleep(2400);

  if (want("map-pickup")) {
    // The nearest pickup reachable today: plan, then walk; shots as it goes.
    const t = (await game("targets()")).find(
      (x) => x.kind === "pickup" && x.today,
    );
    if (t) {
      await game(`click(${t.x}, ${t.y})`);
      await sleep(300);
      const pos = await game(`cellToClient(${t.x}, ${t.y})`);
      void game(`click(${t.x}, ${t.y})`);
      const clip = pos ? { x: 0, y: 0, width: W, height: H } : undefined;
      await burstShots("map-pickup", 10, 70, clip);
      await idle();
      await shot("map-pickup-after");
    } else console.log("  no pickup in reach today");
  }

  if (want("map-flag")) {
    const s = await game("state()");
    const mine = s.map.objects.find(
      (o) =>
        o.kind === "mine" && s.players[0].explored[o.y * s.map.width + o.x],
    );
    const town = s.map.objects.find(
      (o) => o.kind === "town" && s.towns[o.id]?.owner === 0,
    );
    const target = town ?? mine;
    if (target) {
      // Give it to the player and replay the raise there.
      const pos = await game(`cellToClient(${target.x}, ${target.y})`);
      await game(`raiseFlag(${JSON.stringify(target.id)})`);
      const clip = pos
        ? {
            x: Math.max(0, pos.x - 120),
            y: Math.max(0, pos.y - 120),
            width: 240,
            height: 200,
          }
        : undefined;
      await burstShots("map-flag", 6, 70, clip);
    }
  }

  if (want("map-banner")) {
    await evaluate(
      `import('/src/ui/anim.ts').then((m) => { m.dayBanner('Week 2', 'Creatures grow, taverns refresh', 'week'); })`,
    );
    await sleep(50);
    for (const t of [0, 150, 320, 900, 2300])
      await frameAt(`map-banner-week-${t}ms`, t, {
        x: 320,
        y: 60,
        width: 800,
        height: 260,
      });
    await evaluate("for (const a of document.getAnimations()) a.finish()");
  }

  if (want("ui-dialog")) {
    await game("key('o')");
    await sleep(20);
    for (const t of [0, 40, 80, 140])
      await frameAt(`ui-dialog-open-${t}ms`, t, {
        x: 320,
        y: 100,
        width: 800,
        height: 620,
      });
    await evaluate("for (const a of document.getAnimations()) a.finish()");
    await game("key('Escape')");
    await evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))",
    );
    await sleep(10);
    for (const t of [20, 60, 100])
      await frameAt(`ui-dialog-close-${t}ms`, t, {
        x: 320,
        y: 100,
        width: 800,
        height: 620,
      });
    await evaluate("for (const a of document.getAnimations()) a.finish()");
    await sleep(300);
  }

  if (want("ui-book")) {
    await game("key('m')");
    await sleep(30);
    for (const t of [0, 100, 200, 400]) await frameAt(`ui-book-${t}ms`, t);
    await evaluate("for (const a of document.getAnimations()) a.finish()");
    await evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))",
    );
    await sleep(300);
  }

  if (want("map-levelup")) {
    const id = await game("selectedHero()");
    const h = (await game("state()")).heroes.find((x) => x.id === id);
    const pos = h ? await game(`cellToClient(${h.x}, ${h.y})`) : null;
    await game(`levelBurst(${JSON.stringify(id)})`);
    await burstShots(
      "map-levelup-burst",
      6,
      60,
      pos
        ? {
            x: Math.max(0, pos.x - 150),
            y: Math.max(0, pos.y - 150),
            width: 300,
            height: 260,
          }
        : undefined,
    );
    await editSave(
      "const h = s.heroes.find((x) => x.owner === 0 && x.alive); h.pendingLevelUps = 1; h.levelUpStep = 'skill';",
    );
    await continueSaved();
    await waitFor("document.querySelector('.hs-card')", "draft");
    for (const t of [0, 120, 240, 360, 520])
      await frameAt(`map-levelup-cards-${t}ms`, t);
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
