#!/usr/bin/env node
// Review sheet for terrain pieces, towns and doodads (bead
// border_marches-xaj.14): each sprite on a window of its target ground
// texture (public/assets/terrain/grounds/<ground>.png) at 1:1 and x2, plus
// 1:1 on light and dark for the silhouette. The window is the sprite's own
// canvas plus a margin, the sprite drawn at the canvas origin + margin, so a
// piece's footprint sits where the board would put it. Zero dependencies.
//
//   node art/review/terrain-sheet.mjs <out.png> [--scale 2] [--title TEXT] <ground>:<label>=<path.png>...
//
// <ground> is grass, jungle, steppe, badlands or wasteland.
import fs from "node:fs";
import path from "node:path";
import { blank, composite, decodePng, encodePng, parseColour, scaleNearest } from "../../tools/art/lib/png.mjs";
import { drawText, GLYPH_H } from "../../tools/art/lib/font.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const args = process.argv.slice(2);
const out = args.shift();
let scale = 2;
let title = "";
const specs = [];
while (args.length) {
  const a = args.shift();
  if (a === "--scale") scale = Number(args.shift());
  else if (a === "--title") title = args.shift();
  else specs.push(a);
}
if (!out || specs.length === 0) {
  console.error("usage: node art/review/terrain-sheet.mjs <out.png> [--scale 2] <ground>:<label>=<path.png>...");
  process.exit(1);
}

const LIGHT = parseColour("#f2f2f2");
const DARK = parseColour("#1e2126");
const SHEET_BG = parseColour("#8f949b");
const INK = parseColour("#101114");
const GAP = 8;
const MARGIN = 12;
const read = (p) => decodePng(fs.readFileSync(path.resolve(ROOT, p)));
const groundCache = new Map();
function groundWindow(name, w, h) {
  if (!groundCache.has(name)) groundCache.set(name, read(`public/assets/terrain/grounds/${name}.png`));
  const g = groundCache.get(name);
  const outR = blank(w, h);
  // Tile the periodic texture from a fixed offset.
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const from = (((y + 40) % g.height) * g.width + ((x + 40) % g.width)) * 4;
      outR.data.set(g.data.subarray(from, from + 4), (y * w + x) * 4);
    }
  return outR;
}

function panel(sprite, bg, s) {
  const w = sprite.width + 2 * MARGIN;
  const h = sprite.height + 2 * MARGIN;
  const base = bg === "light" ? blank(w, h, LIGHT) : bg === "dark" ? blank(w, h, DARK) : groundWindow(bg, w, h);
  composite(base, sprite, MARGIN, MARGIN);
  return s === 1 ? base : scaleNearest(base, s);
}

const rows = specs.map((spec) => {
  const [head, file] = spec.split("=");
  const [ground, label] = head.includes(":") ? head.split(":") : ["grass", head];
  const sprite = read(file);
  const tiles = [panel(sprite, "light", 1), panel(sprite, "dark", 1), panel(sprite, ground, 1), panel(sprite, ground, scale)];
  const top = GLYPH_H + 4;
  const width = tiles.reduce((s, t) => s + t.width + GAP, 0);
  const height = top + Math.max(...tiles.map((t) => t.height));
  const row = blank(width, height, SHEET_BG);
  drawText(row, `${label} ${sprite.width}X${sprite.height} ON ${ground}`.toUpperCase(), 0, 0, INK);
  let x = 0;
  for (const t of tiles) {
    composite(row, t, x, top);
    x += t.width + GAP;
  }
  return row;
});

const head = title ? GLYPH_H * 2 + 8 : 0;
const width = Math.max(...rows.map((r) => r.width)) + 24;
const height = rows.reduce((s, r) => s + r.height + 12, 12 + head);
const sheet = blank(width, height, SHEET_BG);
if (title) drawText(sheet, title.toUpperCase(), 12, 8, INK, 2);
let y = 12 + head;
for (const r of rows) {
  composite(sheet, r, 12, y);
  y += r.height + 12;
}
fs.writeFileSync(path.resolve(out), encodePng(sheet));
console.log(`wrote ${out}: ${rows.length} sprite(s)`);
