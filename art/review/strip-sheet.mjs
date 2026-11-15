#!/usr/bin/env node
// Strip sheet (bead border_marches-xaj.14): for each group, its sprites side
// by side on a band of the group's ground texture at 1:1, then the same band
// at x2, so small things (doodads) and pieces are judged together on the
// ground they will stand on. Sprites are bottom-aligned on a common line.
//
//   node art/review/strip-sheet.mjs <out.png> <ground>=<png>,<png>,... [<ground>=...]
import fs from "node:fs";
import path from "node:path";
import { blank, composite, decodePng, encodePng, parseColour, scaleNearest } from "../../tools/art/lib/png.mjs";
import { drawText, GLYPH_H } from "../../tools/art/lib/font.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const [out, ...groups] = process.argv.slice(2);
if (!out || groups.length === 0) {
  console.error("usage: node art/review/strip-sheet.mjs <out.png> <ground>=<png>,<png>,...");
  process.exit(1);
}
const read = (p) => decodePng(fs.readFileSync(path.resolve(ROOT, p)));
const BG = parseColour("#8f949b");
const INK = parseColour("#101114");
const GAP = 16;

function band(ground, w, h) {
  const g = read(`public/assets/terrain/grounds/${ground}.png`);
  const r = blank(w, h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const from = (((y + 40) % g.height) * g.width + ((x + 40) % g.width)) * 4;
      r.data.set(g.data.subarray(from, from + 4), (y * w + x) * 4);
    }
  return r;
}

const rows = [];
for (const spec of groups) {
  const [ground, list] = spec.split("=");
  const sprites = list.split(",").map(read);
  const w = sprites.reduce((s, sp) => s + sp.width + GAP, GAP);
  const h = Math.max(...sprites.map((sp) => sp.height)) + 2 * GAP;
  const strip = band(ground, w, h);
  let x = GAP;
  for (const sp of sprites) {
    composite(strip, sp, x, h - GAP - sp.height);
    x += sp.width + GAP;
  }
  const big = scaleNearest(strip, 2);
  const row = blank(Math.max(big.width, 200), GLYPH_H + 4 + strip.height + 8 + big.height, BG);
  drawText(row, `${ground.toUpperCase()}: ${sprites.length} SPRITES, 1:1 AND X2`, 0, 0, INK);
  composite(row, strip, 0, GLYPH_H + 4);
  composite(row, big, 0, GLYPH_H + 4 + strip.height + 8);
  rows.push(row);
}
const width = Math.max(...rows.map((r) => r.width)) + 24;
const height = rows.reduce((s, r) => s + r.height + 12, 12);
const sheet = blank(width, height, BG);
let y = 12;
for (const r of rows) {
  composite(sheet, r, 12, y);
  y += r.height + 12;
}
fs.writeFileSync(path.resolve(out), encodePng(sheet));
console.log(`wrote ${out}: ${groups.length} group(s)`);
