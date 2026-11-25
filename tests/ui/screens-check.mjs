/* global Buffer, URL, WebSocket, console, fetch, process, setTimeout */
// Screenshot tour of every screen (bead border_marches-bzc.25, UI review).
// Not a simulation: hand-built saves and debug routes, no turn is ended.
//
//   npx vite --port 6297 --strictPort &
//   node tests/ui/screens-check.mjs [url] [screens-dir] [WxH] [only,names]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1). Screens: the menu,
// the adventure map (path plan and hover tooltip), the hero sheet, each
// faction's town, recruit and marketplace, the kingdom, the meeting, the
// adventure spellbook, a site dialog, the pre-battle dialog, the level-up
// draft, the menu dialog, the victory and defeat screens, and the battle
// debug routes (field, hover, info panel, spellbook, result). Prints a JSON
// summary; exits non-zero on a page error or failed step.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:6297/";
const OUT = process.argv[3] ?? ".orchestration/screens/bzc25";
const [W, H] = (process.argv[4] ?? "1440x900").split("x").map(Number);
const ONLY = process.argv[5] ? new Set(process.argv[5].split(",")) : null;
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9345 + (W % 7);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bm-screens-"));
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
const shots = [];

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

const want = (name) => ONLY === null || ONLY.has(name);

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
const game = (expr) => evaluate(`window.__bmGame.${expr}`);
const idle = () =>
  waitFor("window.__bmGame && !window.__bmGame.busy()", "idle");
const mouse = async (x, y) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(250);
};

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
  await clickText(".gm-menu-main", "Continue");
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
  const p0 = s.players.find((p) => p.id === 0);
  for (const r of Object.keys(p0.resources)) p0.resources[r] = 40;
  p0.resources.gold = 42000;
  const h = s.heroes.find((x) => x.owner === 0 && x.alive);
  h.level = 9; h.xp = 9000; h.attack += 3; h.defense += 2; h.power += 3; h.lore += 2;
  h.mp = 4000; h.maxMp = 4000; h.mana = 30;
  h.pages = spells.MAP_SPELLS.slice(0, 18).map((x) => x.id);
  h.scrolls = spells.MAP_SPELLS.slice(18, 21).map((x) => x.id);
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

  // ---------------------------------------------------------------- menu
  await go("?mute=1");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await evaluate("localStorage.clear()");
  await go("?mute=1&seed=4242&size=S&players=3&faction=humans");
  await waitFor("document.querySelector('.gm-menu')", "main menu");
  await sleep(400);
  if (want("menu")) await shot("menu");

  // ------------------------------------------------------------ adventure
  await go("?mute=1&seed=4242&size=S&players=3&faction=humans&autostart=1");
  await waitFor("window.__bmGame", "adventure screen");
  await idle();
  await sleep(2400); // toasts fade
  if (want("adventure")) {
    const t = (await game("targets()")).find((x) => x.kind === "monster");
    const far = (await game("targets()")).at(-1);
    const goal = far ?? t;
    if (goal) await game(`click(${goal.x}, ${goal.y})`);
    await sleep(2400);
    // Hover the first monster with the real mouse.
    if (t) {
      const pos = await game(`cellToClient(${t.x}, ${t.y})`);
      if (pos) await mouse(pos.x, pos.y);
    }
    await shot("adventure");
    const pickup = (await game("targets()")).find((x) => x.kind !== "monster");
    if (pickup) {
      const pos = await game(`cellToClient(${pickup.x}, ${pickup.y})`);
      if (pos) await mouse(pos.x, pos.y);
      await shot("adventure-hover-object");
    }
    // Hover a side-panel resource for the income tooltip.
    const res = await evaluate(
      "(() => { const r = document.querySelector('.gm-res'); if (!r) return null; const b = r.getBoundingClientRect(); return {x: b.x + 10, y: b.y + 8}; })()",
    );
    if (res) {
      await mouse(res.x, res.y);
      await sleep(500);
      await shot("adventure-hover-resource");
    }
  }

  // --------------------------------------------------- hand-built rich save
  await editSave(RICH);
  console.log(
    `- rich save: ${JSON.stringify(await evaluate("window.__rich"))}`,
  );
  await continueSaved();
  await idle();
  await sleep(2400);
  if (want("adventure-rich")) await shot("adventure-rich");
  if (want("hero")) {
    await key("i");
    await waitFor("document.querySelector('.gm-backdrop')", "hero screen");
    await sleep(400);
    await shot("hero");
    const art = await evaluate(
      "(() => { const r = document.querySelector('.hs-worn .gm-icon, .gm-backdrop .gm-icon'); if (!r) return null; const b = r.getBoundingClientRect(); return {x: b.x + 8, y: b.y + 8}; })()",
    );
    if (art) {
      await mouse(art.x, art.y);
      await sleep(600);
      await shot("hero-hover");
    }
    await escape();
    await sleep(200);
  }
  if (want("kingdom")) {
    await key("k");
    await sleep(400);
    await shot("kingdom");
    await escape();
    await sleep(200);
  }
  if (want("spellbook")) {
    await key("m");
    await sleep(500);
    await shot("spellbook");
    await escape();
    await sleep(200);
  }
  if (want("menu-dialog")) {
    await clickText(".gm-side button", "Menu");
    await sleep(300);
    await shot("menu-dialog");
    await escape();
    await sleep(200);
  }
  if (want("meeting")) {
    const st = await game("state()");
    const other = st.heroes.find(
      (h) =>
        h.id.startsWith("hero-") &&
        h.owner === 0 &&
        h.id !== st.heroes.find((x) => x.owner === 0)?.id,
    );
    if (other) {
      await game(`click(${other.x}, ${other.y})`);
      await sleep(500);
      await shot("meeting");
      await escape();
      await sleep(200);
    }
  }
  if (want("town")) {
    const st = await game("state()");
    const byFaction = new Map();
    for (const t of Object.values(st.towns)) {
      if (!byFaction.has(t.faction)) byFaction.set(t.faction, t.id);
    }
    let first = true;
    for (const [faction, id] of byFaction) {
      await game(`openTown(${JSON.stringify(id)})`);
      await waitFor("document.querySelector('.gm-town')", "town screen");
      await sleep(600);
      await shot(`town-${faction}`);
      if (first) {
        first = false;
        const b = await evaluate(
          "(() => { const r = document.querySelector('.gm-building'); if (!r) return null; const b = r.getBoundingClientRect(); return {x: b.x + 30, y: b.y + 20}; })()",
        );
        if (b) {
          await mouse(b.x, b.y);
          await sleep(600);
          await shot("town-hover");
        }
        if (await clickText(".gm-town button", "Recruit")) {
          await sleep(400);
          await shot("recruit");
          await escape();
          await sleep(200);
        }
        if (await clickText(".gm-town button", "Marketplace")) {
          await sleep(400);
          await shot("market");
          await escape();
          await sleep(200);
        }
      }
      await escape();
      await waitFor("!document.querySelector('.gm-town')", "town closed");
    }
  }
  if (want("prebattle")) {
    await idle();
    const monster = (await game("targets()")).find((t) => t.kind === "monster");
    if (monster) {
      await game(`click(${monster.x}, ${monster.y})`);
      await sleep(200);
      await game(`click(${monster.x}, ${monster.y})`);
      for (let i = 0; i < 80; i++) {
        if (await evaluate("Boolean(document.querySelector('.gm-modal'))"))
          break;
        await sleep(100);
      }
      await sleep(400);
      await shot("prebattle");
    }
  }

  if (want("site")) {
    // Clear the neutral guards so the sites behind them are in reach.
    await editSave(
      "s.monsters = {}; s.players[0].explored = s.players[0].explored.map(() => true); for (const h of s.heroes) h.pendingLevelUps = 0;",
    );
    await continueSaved();
    await idle();
    const targets = await game("targets()");
    console.log(
      `- targets: ${[...new Set(targets.map((t) => t.kind + ":" + (t.type ?? "")))].join(" ")}`,
    );
    const site =
      targets.find((t) => t.kind === "dwelling") ??
      targets.find((t) => t.kind === "site");
    if (site) {
      await game(`click(${site.x}, ${site.y})`);
      await sleep(200);
      await game(`click(${site.x}, ${site.y})`);
      for (let i = 0; i < 60; i++) {
        if (await evaluate("Boolean(document.querySelector('.gm-modal'))"))
          break;
        await sleep(100);
      }
      await sleep(400);
      await shot("site");
      await escape();
      await sleep(300);
    }
  }

  // ------------------------------------------------------- level-up draft
  if (want("levelup")) {
    await editSave(
      "const h = s.heroes.find((x) => x.owner === 0 && x.alive); h.pendingLevelUps = 1; h.levelUpStep = 'skill';",
    );
    await continueSaved();
    await waitFor("document.querySelector('.hs-draft-dialog')", "draft");
    await sleep(600);
    await shot("levelup");
    const card = await evaluate(
      "(() => { const r = document.querySelector('.hs-card'); if (!r) return null; const b = r.getBoundingClientRect(); return {x: b.x + 40, y: b.y + 30}; })()",
    );
    if (card) {
      await mouse(card.x, card.y);
      await sleep(600);
      await shot("levelup-hover");
    }
  }

  // -------------------------------------------------------- end screens
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

  // -------------------------------------------------------------- battle
  const battles = [
    ["battle", "view=battle&scenario=realm&steps=0"],
    ["battle-hover", "view=battle&scenario=realm&steps=2&hover=melee"],
    ["battle-info", "view=battle&scenario=horde&steps=0&info=d1"],
    [
      "battle-book",
      "view=battle&scenario=restless&magic=1&items=1&steps=0&book=1",
    ],
    ["battle-result", "view=battle&scenario=realm&auto=1&speed=4"],
  ];
  for (const [name, q] of battles) {
    if (!want(name)) continue;
    await go(`?mute=1&${q}`);
    await waitFor(
      "document.querySelector('.bm-battle canvas')",
      "battle",
      30000,
    );
    if (name === "battle-result") {
      await waitFor(
        "document.querySelector('.bm-ok')",
        "battle result",
        120000,
      );
    }
    await sleep(2500);
    await shot(name);
  }
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
console.log(
  JSON.stringify({
    ok: !failed && errors.length === 0,
    shots: shots.length,
    errors,
  }),
);
ws?.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
process.exit(failed || errors.length > 0 ? 1 : 0);
