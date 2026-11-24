/* global Buffer, URL, WebSocket, console, fetch, process, setTimeout */
// Scripted (not AI) browser check of adventure-map objects, bead
// border_marches-bzc.13: hover text and visits of a few catalogue objects.
//
//   npx vite --port 6293 --strictPort &   (or any running dev server)
//   node tests/ui/objects-browser-check.mjs [url] [screens-dir]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1). Starts new games
// (size S) until the first hero can reach a few catalogue objects today,
// then for each: hover it (screenshot of the tooltip), walk onto it, and
// screenshot any dialog it opens (then "Leave"). No turn is ended, so no AI
// plays. Prints a JSON summary; exits non-zero when a step fails.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:6293/";
const OUT = process.argv[3] ?? ".orchestration/screens/bzc13";
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9343;
const W = 1440;
const H = 900;
const SITE_KINDS = new Set([
  "site",
  "dwelling",
  "bank",
  "artifact",
  "teleport",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bm-objects-"));
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
const summary = { visits: [], errors: [] };
const step = (text) => console.log(`- ${text}`);

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
  return file;
}

const game = (expr) => evaluate(`window.__bmGame.${expr}`);
const modalOpen = () =>
  evaluate("Boolean(document.querySelector('.gm-modal'))");
/** Idle, or a dialog is waiting for an answer. */
const settled = () =>
  waitFor(
    "window.__bmGame && (!window.__bmGame.busy() || document.querySelector('.gm-modal'))",
    "idle or a dialog",
  );

async function newGame(seed) {
  const url = new URL(BASE);
  url.search = `?seed=${seed}&size=S&mute=1`;
  await send("Page.navigate", { url: url.href });
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await evaluate("localStorage.clear()");
  url.search = `?seed=${seed}&size=S&autostart=1&mute=1`;
  await send("Page.navigate", { url: url.href });
  await waitFor("window.__bmGame", "adventure screen");
  await settled();
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
    if (msg.method === "Runtime.exceptionThrown") {
      summary.errors.push(msg.params.exceptionDetails.text);
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

  // A hand-built save from a new game: the map explored and the hero with
  // a long day's movement and the guards near home removed, so it
  // reaches several catalogue objects today.
  await newGame(4242);
  await evaluate(`(() => {
    const raw = JSON.parse(localStorage.getItem('border-marches.save'));
    const p = raw.state.players[0];
    p.explored = p.explored.map(() => true);
    p.resources.gold = 20000;
    const h = raw.state.heroes.find((x) => x.owner === 0);
    h.mp = 6000;
    // The guards near home step aside, so the hero can reach the sites.
    raw.state.monsters = Object.fromEntries(
      Object.entries(raw.state.monsters).filter(
        ([, m]) => Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y)) > 14,
      ),
    );
    localStorage.setItem('border-marches.save', JSON.stringify(raw));
  })()`);
  const url = new URL(BASE);
  url.search = "?mute=1";
  await send("Page.navigate", { url: url.href });
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  const continued = await evaluate(`(() => {
    const b = [...document.querySelectorAll('.gm-menu-main')]
      .find((n) => n.textContent.trim().startsWith('Continue'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!continued) throw new Error("no Continue button");
  await waitFor("window.__bmGame", "adventure screen");
  await settled();
  const sites = (await game("targets()")).filter(
    (t) => SITE_KINDS.has(t.kind) && t.today,
  );
  step(`${sites.length} catalogue objects reachable today`);
  if (sites.length === 0) throw new Error("no catalogue object reachable");

  const seen = new Set();
  for (let k = 0; k < 6; k++) {
    // Dialogs first, waystones last (they carry the hero away).
    const rank = (x) =>
      ["stray-hut", "faction-outpost", "arena", "tollhouse", "hermit"].includes(
        x.type,
      )
        ? 0
        : x.kind === "teleport"
          ? 2
          : 1;
    const t = (await game("targets()"))
      .filter(
        (x) =>
          SITE_KINDS.has(x.kind) &&
          x.kind !== "bank" &&
          x.today &&
          !seen.has(x.type),
      )
      .sort((a, b) => rank(a) - rank(b) || a.cost - b.cost)[0];
    if (!t) break;
    seen.add(t.type);
    const hover = await game(`hover(${t.x}, ${t.y})`);
    step(`hover ${t.type}: ${JSON.stringify(hover)}`);
    await shot(`hover-${t.type}`);
    const before = await game("state()");
    await game(`click(${t.x}, ${t.y})`);
    await sleep(250);
    await game(`click(${t.x}, ${t.y})`);
    await sleep(400);
    await settled();
    let dialog = null;
    let shots = 0;
    // Answer dialogs: a site's choice is screenshot and left; any other
    // (a level-up) takes its first offer.
    for (let d = 0; d < 4 && (await modalOpen()); d++) {
      const text = await evaluate(
        "document.querySelector('.gm-modal').innerText.slice(0, 400)",
      );
      const leave = await evaluate(`(() => {
        const bs = [...document.querySelectorAll('.gm-modal button')];
        const b = bs.find((n) => n.textContent.trim() === 'Leave');
        return Boolean(b);
      })()`);
      if (leave) {
        dialog = text;
        await shot(`visit-${t.type}`);
        shots++;
      }
      await evaluate(`(() => {
        const bs = [...document.querySelectorAll('.gm-modal button')];
        const b =
          bs.find((n) => n.textContent.trim() === 'Leave') ??
          bs.find((n) => !n.disabled);
        if (b) b.click();
      })()`);
      await sleep(400);
      await settled();
    }
    if (shots === 0) {
      await sleep(600);
      await shot(`visit-${t.type}`);
    }
    const after = await game("state()");
    const hero = after.heroes.find((h) => h.owner === 0 && h.alive);
    summary.visits.push({
      type: t.type,
      id: t.id,
      hover,
      dialog,
      heroAt: hero ? [hero.x, hero.y] : null,
      siteMemory: after.sites[t.id] ?? null,
      collected: after.collected.includes(t.id),
      xpGained:
        (hero?.xp ?? 0) -
        (before.heroes.find((h) => h.id === hero?.id)?.xp ?? 0),
      battle: after.pendingBattle !== null,
    });
    if (after.pendingBattle !== null) break;
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.visits.length === 0) throw new Error("visited nothing");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      ws?.close();
    } catch {
      // closed
    }
    chrome.kill();
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
  });
