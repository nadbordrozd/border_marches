#!/usr/bin/env node
// A unit line-up at battle scale for review (bead border_marches-bzc.14):
// sprites stand side by side on a strip of a ground texture, each seated on
// its measured feet (the Pulp Wars rule of measure-units.mjs) so they share
// one ground line, with the code shadow the game draws (a #12161e ellipse at
// 24% under the base band). Rows: the strip at 1:1, then at x2 (nearest).
// Nothing is resampled except by whole factors.
//
//   node art/review/lineup.mjs <out.png> <ground.png> <unit.png>...
//   (a bare "|" between units leaves a gap, e.g. between two groups)
import fs from "node:fs";
import { blank, composite, decodePng, encodePng, parseColour, scaleNearest } from "../../tools/art/lib/png.mjs";

const [out, groundFile, ...units] = process.argv.slice(2);
if (!out || !groundFile || units.length === 0) {
  console.error("usage: lineup.mjs <out.png> <ground.png> <unit.png>...");
  process.exit(1);
}

function feet(r) {
  const opaque = (x, y) => r.data[(y * r.width + x) * 4 + 3] >= 128;
  let contactY = 0;
  for (let y = 0; y < r.height; y += 1) {
    let n = 0;
    for (let x = 0; x < r.width; x += 1) if (opaque(x, y)) n += 1;
    if (n >= 2) contactY = y + 1;
  }
  let left = r.width, right = 0;
  for (let y = Math.max(0, contactY - 14); y < contactY; y += 1)
    for (let x = 0; x < r.width; x += 1)
      if (opaque(x, y)) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
      }
  return { contactY, left, right };
}

const ground = decodePng(fs.readFileSync(groundFile));
const sprites = units.map((u) => (u === "|" ? null : decodePng(fs.readFileSync(u))));
const gap = 6;
const width = sprites.reduce((s, r) => s + (r ? r.width : 24) + gap, gap);
const tallest = Math.max(...sprites.filter(Boolean).map((r) => feet(r).contactY));
const lineY = tallest + 10;
const height = lineY + 18;
const strip = blank(width, height);
for (let y = 0; y < height; y += ground.height)
  for (let x = 0; x < width; x += ground.width) composite(strip, ground, x, y);

const shadow = parseColour("#12161e");
let x = gap;
for (const r of sprites) {
  if (!r) {
    x += 24 + gap;
    continue;
  }
  const f = feet(r);
  const top = lineY - f.contactY;
  // Code shadow: an ellipse under the base band, as the game draws it.
  const cx = x + (f.left + f.right) / 2;
  const rx = Math.max(6, (f.right - f.left) / 2);
  const ry = Math.max(3, rx / 3.2);
  for (let py = Math.floor(lineY - ry); py <= Math.ceil(lineY + ry); py += 1)
    for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px += 1) {
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const dx = (px + 0.5 - cx) / rx;
      const dy = (py + 0.5 - lineY) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const i = (py * width + px) * 4;
      for (let c = 0; c < 3; c += 1) strip.data[i + c] = Math.round(strip.data[i + c] * 0.76 + shadow[c] * 0.24);
    }
  composite(strip, r, x, top);
  x += r.width + gap;
}

const big = scaleNearest(strip, 2);
const sheet = blank(big.width, strip.height + 8 + big.height, parseColour("#8f949b"));
composite(sheet, strip, 0, 0);
composite(sheet, big, 0, strip.height + 8);
fs.writeFileSync(out, encodePng(sheet));
console.log(`wrote ${out} (${sprites.filter(Boolean).length} units on ${groundFile}, 1:1 and x2)`);
