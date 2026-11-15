#!/usr/bin/env node
// Review sheet: each sprite at 1:1 and enlarged (x3) on light, dark and on
// cut-outs of the jungle and grass ground textures (public/assets/terrain/
// grounds), so the art is judged where the game shows it. Zero dependencies;
// uses the studio pipeline's PNG helpers. Bead border_marches-xaj.9.
//
//   node art/review/ground-sheet.mjs <out.png> <label=path.png>...
//
// Sprites are bottom-centred on an 80 px wide cell window of the ground
// (taller sprites get a taller window) like the board seats them.
import fs from "node:fs";
import path from "node:path";
import { blank, composite, crop, decodePng, encodePng, parseColour, scaleNearest } from "../../tools/art/lib/png.mjs";
import { drawText, GLYPH_H, textWidth } from "../../tools/art/lib/font.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const [out, ...specs] = process.argv.slice(2);
if (!out || specs.length === 0) {
  console.error("usage: node art/review/ground-sheet.mjs <out.png> <label=path.png>...");
  process.exit(1);
}

const LIGHT = parseColour("#f2f2f2");
const DARK = parseColour("#1e2126");
const SHEET_BG = parseColour("#8f949b");
const INK = parseColour("#101114");
const SCALE = 3;
const GAP = 6;
const read = (p) => decodePng(fs.readFileSync(path.resolve(ROOT, p)));
const grounds = [
  ["jungle", read("public/assets/terrain/grounds/jungle.png")],
  ["grass", read("public/assets/terrain/grounds/grass.png")],
];

function backdrop(kind, w, h) {
  if (kind === "light") return blank(w, h, LIGHT);
  if (kind === "dark") return blank(w, h, DARK);
  const ground = grounds.find(([name]) => name === kind)[1];
  // A fixed window of the periodic texture (offset away from its origin).
  return crop(ground, 40, 40, Math.min(w, ground.width - 40), Math.min(h, ground.height - 40));
}

function tile(sprite, kind, scale) {
  const w = Math.max(80, sprite.width + 8) * scale;
  const h = Math.max(80, sprite.height + 8) * scale;
  const bg = backdrop(kind, w / scale, h / scale);
  const base = scale === 1 ? bg : scaleNearest(bg, scale);
  const big = scale === 1 ? sprite : scaleNearest(sprite, scale);
  const left = Math.floor((base.width - big.width) / 2);
  const top = base.height - big.height - 3 * scale;
  return composite(base, big, left, top);
}

const rows = specs.map((spec) => {
  const [label, file] = spec.includes("=") ? spec.split("=") : [path.basename(spec), spec];
  const sprite = read(file);
  const kinds = ["light", "dark", "jungle", "grass"];
  const tiles = [...kinds.map((k) => tile(sprite, k, 1)), ...kinds.map((k) => tile(sprite, k, SCALE))];
  const head = GLYPH_H + 4;
  const width = Math.max(tiles.reduce((s, t) => s + t.width + GAP, 0), textWidth(label) + 4);
  const height = head + Math.max(...tiles.map((t) => t.height));
  const row = blank(width, height, SHEET_BG);
  drawText(row, `${label} ${sprite.width}X${sprite.height}`, 0, 0, INK);
  let x = 0;
  for (const t of tiles) {
    composite(row, t, x, head + (height - head - t.height));
    x += t.width + GAP;
  }
  return row;
});

const width = Math.max(...rows.map((r) => r.width)) + 2 * 12;
const height = rows.reduce((s, r) => s + r.height + 12, 12);
const sheet = blank(width, height, SHEET_BG);
let y = 12;
for (const r of rows) {
  composite(sheet, r, 12, y);
  y += r.height + 12;
}
fs.writeFileSync(path.resolve(out), encodePng(sheet));
console.log(`wrote ${out} (${rows.length} sprite(s): x1 and x${SCALE} on light, dark, jungle, grass)`);
