/* global Buffer, URL, WebSocket, console, fetch, process, setTimeout */
// Screenshot tour of the main-menu gallery (bead border_marches-3nb). Not a
// simulation: it opens the menu, the gallery, and each tab in turn.
//
//   npx vite --port 6298 --strictPort &
//   node tests/ui/gallery-check.mjs [url] [screens-dir] [WxH]
//
// Headless system Chrome, muted (--mute-audio, ?mute=1). Per tab: a
// screenshot, the entry count, and every <img> that failed to load (after
// scrolling the whole tab so lazy images load), and each entry whose art is
// a stand-in (its note). Also checks the search box
// and that Esc returns to the menu. Prints a JSON summary; exits non-zero
// on a page error, a broken image or a failed step.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:6298/";
const OUT = process.argv[3] ?? ".orchestration/screens/gallery";
const [W, H] = (process.argv[4] ?? "1280x800").split("x").map(Number);
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9365 + (W % 7);
const TABS = [
  "creatures",
  "heroes",
  "spells",
  "artifacts",
  "skills",
  "objects",
  "towns",
  "other",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bm-gallery-"));
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
const summary = { tabs: {}, shots: [] };

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
  const file = join(OUT, `${name}-${W}x${H}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  summary.shots.push(file);
  console.log(`- ${file}`);
}

/** Scrolls the tab top to bottom so every lazy image loads; lists broken ones. */
const brokenImages = () =>
  evaluate(`(async () => {
    const body = document.querySelector('.gx-body');
    for (let y = 0; y <= body.scrollHeight; y += body.clientHeight / 2) {
      body.scrollTop = y;
      await new Promise((r) => setTimeout(r, 60));
    }
    const imgs = [...body.querySelectorAll('img')];
    await Promise.all(imgs.map((i) => i.complete ? null : new Promise((r) => {
      i.addEventListener('load', r, { once: true });
      i.addEventListener('error', r, { once: true });
      setTimeout(r, 3000);
    })));
    body.scrollTop = 0;
    return {
      images: imgs.length,
      broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => i.getAttribute('src')),
    };
  })()`);

async function main() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        break;
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  if (!ws) throw new Error("no Chrome page");
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push(msg.params.exceptionDetails.exception?.description ?? "");
    } else if (
      msg.method === "Runtime.consoleAPICalled" &&
      msg.params.type === "error"
    ) {
      errors.push(
        msg.params.args.map((a) => a.value ?? a.description).join(" "),
      );
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const url = new URL(BASE);
  url.search = "?mute=1";
  await send("Page.navigate", { url: url.href });
  await waitFor("document.querySelector('.gm-menu-gallery')", "main menu");
  await shot("gallery-menu");
  await evaluate("document.querySelector('.gm-menu-gallery').click()");
  await waitFor("document.querySelector('.gm-gallery .gx-card')", "gallery");

  for (const tab of TABS) {
    await evaluate(
      `document.querySelector('.gx-tab[data-tab="${tab}"]').click()`,
    );
    await waitFor(
      `document.querySelector('.gm-gallery').dataset.tab === '${tab}'`,
      `tab ${tab}`,
    );
    const imgs = await brokenImages();
    await sleep(250);
    const info = await evaluate(`({
      entries: Number(document.querySelector('.gm-gallery').dataset.entries),
      cards: document.querySelectorAll('.gx-card').length,
      sections: [...document.querySelectorAll('.gx-section-title')].map((h) => h.textContent),
      notes: [...document.querySelectorAll('.gx-note')].map(
        (n) => n.parentElement.querySelector('.gx-id').textContent + ': ' + n.textContent,
      ),
      overflowX: document.querySelector('.gx-body').scrollWidth > document.querySelector('.gx-body').clientWidth,
    })`);
    summary.tabs[tab] = { ...info, ...imgs };
    if (imgs.broken.length > 0)
      errors.push(`${tab}: broken images ${imgs.broken.join(", ")}`);
    if (info.cards !== info.entries)
      errors.push(`${tab}: ${info.cards} cards for ${info.entries} entries`);
    await shot(`gallery-${tab}`);
  }

  // Search narrows the open tab; Esc returns to the menu.
  await evaluate(`document.querySelector('.gx-tab[data-tab="towns"]').click()`);
  await evaluate(`(() => {
    const s = document.querySelector('.gx-search');
    s.value = 'guild';
    s.dispatchEvent(new Event('input'));
  })()`);
  summary.search = await evaluate(
    "[...document.querySelectorAll('.gx-card')].filter((c) => !c.hidden).length",
  );
  await shot("gallery-search");
  await evaluate("document.querySelector('.gx-body').scrollTop = 1100");
  await sleep(300);
  await shot("gallery-search-scrolled");
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))",
  );
  await waitFor(
    "!document.querySelector('.gm-gallery') && !document.querySelector('.gm-menu').hidden",
    "menu after Esc",
  );
  summary.escBack = true;
}

try {
  await main();
} catch (e) {
  errors.push(String(e));
} finally {
  summary.errors = errors;
  console.log(JSON.stringify(summary, null, 2));
  ws?.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
  process.exit(errors.length > 0 ? 1 : 0);
}
