// The spellbook's school frames (bead border_marches-bzc.99), kept as data:
// one accepted 48x48 PixelLab take per school (set `spell-frames`), and the
// gilded (mastery) variant of each derived from the same take by recorded
// pixel edits that this script computes: a gold fillet lining the hole
// (light on the left and bottom, shadow on the top and right, as the icon
// frames), and a gold rim with a dark ink line around the whole frame, so
// the gilded frame also differs in outline and size, not only in colour.
//
//   node art/review/spell-frames.mjs --write           # outputs[] of the set + src/ui/spell-frames.json
//   node art/review/spell-frames.mjs --sheet <out.png> # review sheet: plain and gilded, 1x and 3x, light and dark, with a sample icon
//
// The hole (the transparent region reached from the centre) is where the
// parchment medallion shows: its bounding box goes to src/ui/spell-frames.json
// and the book paints the parchment there under the frame.
import fs from "node:fs";
import path from "node:path";
import { blank, composite, decodePng, encodePng, fillRect, parseColour, scaleNearest, applyEdits } from "../../tools/art/lib/png.mjs";
import { loadConfig } from "../../tools/art/lib/common.mjs";
import { drawText } from "../../tools/art/lib/font.mjs";

const cfg = loadConfig();
const SET = "spell-frames";
const SIZE = 48;

/** The accepted take of each school (see verdicts.json). */
export const PICKS = {
  bloom: "frames-c#4",
  accord: "frames-c#7",
  clock: "frames-c#12",
  hush: "frames-c#16",
  storm: "frames-c#22",
};

const GOLD = "#e8b923";
const GOLD_LIGHT = "#fff0a8";
const GOLD_SHADOW = "#9a7208";
const GOLD_INK = "#3b2a05";
const PARCHMENT = "#f1e2bd";
const PARCHMENT_SHADE = "#d9c08c";

function takeFile(take) {
  const [id, n] = take.split("#");
  const master = path.join(cfg.dataDir, "masters", SET, `${id}-${n}.png`);
  if (fs.existsSync(master)) return master;
  return path.join(cfg.rawDir, SET, `${id}-${n}.png`);
}

const alphaAt = (r, x, y) => (x < 0 || y < 0 || x >= r.width || y >= r.height ? 0 : r.data[(y * r.width + x) * 4 + 3]);

/** The transparent region reached from the centre: a set of y*w+x. */
export function holeOf(r) {
  const seen = new Set();
  const stack = [[r.width >> 1, r.height >> 1]];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= r.width || y >= r.height) continue;
    const k = y * r.width + x;
    if (seen.has(k) || alphaAt(r, x, y) >= 128) continue;
    if (x === 0 || y === 0 || x === r.width - 1 || y === r.height - 1) throw new Error("the hole is not closed");
    seen.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

function boundsOf(set, w) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const k of set) {
    const x = k % w, y = Math.floor(k / w);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** The recorded edits that gild a frame. */
export function gildEdits(r) {
  const hole = holeOf(r);
  const w = r.width;
  const inHole = (x, y) => hole.has(y * w + x);
  const edits = new Map();
  const put = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < w && y < r.height) edits.set(`${x},${y}`, [x, y, c]);
  };
  // The fillet: every hole pixel touching the frame. Its side decides the tone.
  for (const k of hole) {
    const x = k % w, y = Math.floor(k / w);
    const left = !inHole(x - 1, y), right = !inHole(x + 1, y), top = !inHole(x, y - 1), bottom = !inHole(x, y + 1);
    if (!(left || right || top || bottom)) continue;
    const lit = (left || bottom) && !(right || top);
    const dark = (right || top) && !(left || bottom);
    put(x, y, lit ? GOLD_LIGHT : dark ? GOLD_SHADOW : GOLD);
  }
  // A gold rim around the whole frame (the first ring of transparent pixels
  // outside it), then a dark ink ring so it holds on a light panel.
  const opaque = (x, y) => alphaAt(r, x, y) >= 128;
  const ring = new Set();
  for (let y = 0; y < r.height; y += 1)
    for (let x = 0; x < w; x += 1) {
      if (opaque(x, y) || hole.has(y * w + x)) continue;
      const left = opaque(x + 1, y), right = opaque(x - 1, y), top = opaque(x, y + 1), bottom = opaque(x, y - 1);
      const diag = opaque(x + 1, y + 1) || opaque(x - 1, y + 1) || opaque(x + 1, y - 1) || opaque(x - 1, y - 1);
      if (!(left || right || top || bottom || diag)) continue;
      ring.add(y * w + x);
      // Faces: a rim pixel left of the frame faces left (lit), below it faces down (lit).
      const lit = (left || bottom) && !(right || top);
      const dark = (right || top) && !(left || bottom);
      put(x, y, lit ? GOLD_LIGHT : dark ? GOLD_SHADOW : GOLD);
    }
  for (let y = 0; y < r.height; y += 1)
    for (let x = 0; x < w; x += 1) {
      const k = y * w + x;
      if (opaque(x, y) || hole.has(k) || ring.has(k)) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ring.has((y + dy) * w + (x + dx)) && x + dx >= 0 && x + dx < w);
      if (near) put(x, y, GOLD_INK);
    }

  return [...edits.values()].sort((p, q) => p[1] - q[1] || p[0] - q[0]);
}

function frameOf(take) {
  return decodePng(fs.readFileSync(takeFile(take)));
}

function write() {
  const file = path.join(cfg.dataDir, "sets", SET, "recipes.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const outputs = [];
  const holes = {};
  for (const [school, take] of Object.entries(PICKS)) {
    const r = frameOf(take);
    holes[school] = boundsOf(holeOf(r), r.width);
    outputs.push({ path: `public/assets/frames/spell-${school}.png`, from: take, width: SIZE, height: SIZE });
    outputs.push({
      path: `public/assets/frames/spell-${school}-gilded.png`,
      from: take,
      _doc: "Gilded (the hero has rank in the school): a gold fillet lining the hole and a gold rim with an ink line around the frame, computed by art/review/spell-frames.mjs.",
      steps: [{ op: "edits", pixels: gildEdits(r) }],
      width: SIZE,
      height: SIZE,
    });
  }
  data.outputs = outputs;
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  const json = { _doc: "Written by art/review/spell-frames.mjs (bead bzc.99): the frame size and, per school, the bounding box of the frame's hole, where the book paints the parchment medallion under the frame.", size: SIZE, holes };
  fs.writeFileSync(path.join(cfg.root, "src/ui/spell-frames.json"), `${JSON.stringify(json, null, 2)}\n`);
  console.log(`wrote ${outputs.length} outputs and src/ui/spell-frames.json`);
}

function sheet(out) {
  const icons = { bloom: "regrow", accord: "close-ranks", clock: "wind", hush: "lullaby", storm: "jolt" };
  const k = 3;
  const cell = SIZE * k + 8;
  const offsets = [0, 60, 120, 120 + cell + 6];
  const cols = 8; // plain/gilded x (1x light, 1x dark, 3x light, 3x dark)
  const rowH = cell + 14;
  const sheetW = 8 + cols * (cell + 6);
  const img = blank(sheetW, 20 + 5 * rowH, parseColour("#8f949b"));
  drawText(img, "SPELL FRAMES: PLAIN 1X LIGHT, DARK, 3X LIGHT, DARK; GILDED THE SAME. PARCHMENT + SAMPLE ICON INSIDE.", 6, 6, parseColour("#101114"));
  const parchment = parseColour(PARCHMENT);
  const shade = parseColour(PARCHMENT_SHADE);
  let row = 0;
  for (const [school, take] of Object.entries(PICKS)) {
    const base = frameOf(take);
    const gilded = applyEdits(base, gildEdits(base));
    const hole = boundsOf(holeOf(base), base.width);
    const iconFile = path.join(cfg.root, "public/assets/icons/spells", `${icons[school]}.png`);
    const icon = fs.existsSync(iconFile) ? decodePng(fs.readFileSync(iconFile)) : null;
    const y = 20 + row * rowH;
    drawText(img, `${school.toUpperCase()} ${take}`, 8, y, parseColour("#101114"));
    [base, gilded].forEach((frame, v) => {
      ["#f2f2f2", "#1e2126"].forEach((bg, b) => {
        [1, k].forEach((scale, si) => {
          const t = blank(SIZE, SIZE, parseColour(bg));
          fillRect(t, hole.x, hole.y, hole.width, hole.height, parchment);
          fillRect(t, hole.x, hole.y + hole.height - 1, hole.width, 1, shade);
          fillRect(t, hole.x, hole.y, 1, hole.height, shade);
          composite(t, frame, 0, 0);
          if (icon) composite(t, icon, 8, 8);
          const col = v * 4 + si * 2 + b;
          composite(img, scale === 1 ? t : scaleNearest(t, scale), 8 + v * (120 + 2 * (cell + 6) + 10) + offsets[si * 2 + b], y + 10);
        });
      });
    });
    row += 1;
  }
  fs.writeFileSync(out, encodePng(img));
  console.log(`wrote ${out}`);
}

const args = process.argv.slice(2);
if (args[0] === "--write") write();
else if (args[0] === "--sheet") sheet(args[1]);
else console.log("usage: --write | --sheet <out.png>");
