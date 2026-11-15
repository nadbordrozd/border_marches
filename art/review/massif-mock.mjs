#!/usr/bin/env node
// Mock composite of mountain ranges built from massif pieces (bead
// border_marches-xaj.14): a quick look at whether the pieces join into one
// coherent mass, before the renderer is wired (bead xaj.15). NOT the game's
// packing: a greedy cover, biggest pieces first, so every piece kind shows.
//
//   node art/review/massif-mock.mjs <out.png> <catalog.json> [--scale 1] [--grid] [--no-backfill]
//
// catalog.json: { "ground": "grass", "ranges": ["ASCII rows", ...],
//   "pieces": [{ "file": "public/...png", "cols": 2, "rows": 2, "up": 48,
//                "kind": "massif|ridge|rounded|foothill|single", "tall": true }] }
// Range rows use "#" for a mountain cell, anything else for open ground.
// A piece's canvas is cols x 80 by rows x 80 + up, drawn with its footprint
// on the covered cells (top-left cell x, y at x*80, y*80 - up). A piece is
// tall only when every cell above its top row is mountain; a one-row piece on
// the range's south edge may be a foothill. Drawn north to south by footprint
// bottom row, then west to east, like the board's row order.
import fs from "node:fs";
import path from "node:path";
import { blank, composite, decodePng, encodePng, fillRect, parseColour, scaleNearest } from "../../tools/art/lib/png.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const args = process.argv.slice(2);
const out = args.shift();
const catalogFile = args.shift();
const scale = args.includes("--scale") ? Number(args[args.indexOf("--scale") + 1]) : 1;
const grid = args.includes("--grid");
if (!out || !catalogFile) {
  console.error("usage: node art/review/massif-mock.mjs <out.png> <catalog.json> [--scale N] [--grid]");
  process.exit(1);
}
const catalog = JSON.parse(fs.readFileSync(path.resolve(catalogFile), "utf8"));
const CELL = 80;
const read = (p) => decodePng(fs.readFileSync(path.resolve(ROOT, p)));
const images = new Map();
const image = (file) => {
  if (!images.has(file)) images.set(file, read(file));
  return images.get(file);
};

/** A small deterministic hash. */
function hash(...v) {
  let h = 2166136261;
  for (const n of v) {
    h ^= n & 0xffff;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

const rows = catalog.ranges;
const H = rows.length;
const W = Math.max(...rows.map((r) => r.length));
const isRock = (x, y) => y >= 0 && x >= 0 && y < H && x < W && rows[y][x] === "#";
const covered = new Set();
const free = (x, y) => isRock(x, y) && !covered.has(`${x},${y}`);
const placements = [];
const lastUsed = new Map();

// Greedy cover, north to south, west to east: the biggest footprint that fits.
const SHAPES = [[3, 2], [2, 2], [3, 1], [2, 1], [1, 1]];
for (let y = 0; y < H; y += 1)
  for (let x = 0; x < W; x += 1) {
    if (!free(x, y)) continue;
    const fits = SHAPES.filter(([c, r]) => {
      for (let dy = 0; dy < r; dy += 1) for (let dx = 0; dx < c; dx += 1) if (!free(x + dx, y + dy)) return false;
      return catalog.pieces.some((p) => p.cols === c && p.rows === r);
    });
    // The biggest that fits, unless it would leave a lone cell in this row.
    let pick = fits[0];
    if (fits.length > 1) {
      let run = 0;
      while (free(x + run, y)) run += 1;
      if (run - pick[0] === 1 && fits[1]) pick = fits[1];
    }
    const [c, r] = pick;
    let rockAbove = true;
    for (let dx = 0; dx < c; dx += 1) if (!isRock(x + dx, y - 1)) rockAbove = false;
    let southEdge = r === 1;
    for (let dx = 0; dx < c; dx += 1) if (isRock(x + dx, y + 1)) southEdge = false;
    let pool = catalog.pieces.filter((p) => p.cols === c && p.rows === r);
    const byTall = pool.filter((p) => Boolean(p.tall) === rockAbove);
    if (byTall.length) pool = byTall;
    if (southEdge && !rockAbove) {
      const feet = pool.filter((p) => p.kind === "foothill" || p.kind === "rounded");
      if (feet.length && hash(x, y, 3) % 2 === 0) pool = feet;
    } else {
      const solid = pool.filter((p) => p.kind !== "foothill");
      if (solid.length) pool = solid;
    }
    // Never the same file as the last piece of this footprint.
    let piece = pool[hash(x, y, c, r) % pool.length];
    const key = `${c}x${r}`;
    if (pool.length > 1 && piece.file === lastUsed.get(key)) piece = pool[(pool.indexOf(piece) + 1) % pool.length];
    lastUsed.set(key, piece.file);
    for (let dy = 0; dy < r; dy += 1) for (let dx = 0; dx < c; dx += 1) covered.add(`${x + dx},${y + dy}`);
    placements.push({ x, y, ...piece });
  }

const TOP = 64;
const canvas = blank(W * CELL, H * CELL + TOP);
const ground = read(`public/assets/terrain/grounds/${catalog.ground}.png`);
for (let y = 0; y < canvas.height; y += 1)
  for (let x = 0; x < canvas.width; x += 1) {
    const from = ((y % ground.height) * ground.width + (x % ground.width)) * 4;
    canvas.data.set(ground.data.subarray(from, from + 4), (y * canvas.width + x) * 4);
  }
// Back-fill like the renderer's massifBackfill: where four rock cells meet,
// one more low piece stands on the shared corner, drawn after the row above
// and before the row below, so it shows only in the gaps between pieces.
const fills = catalog.pieces.filter((p) => p.backfill);
if (fills.length && !args.includes("--no-backfill"))
  for (let y = 0; y + 1 < H; y += 1)
    for (let x = 0; x + 1 < W; x += 1) {
      if (!isRock(x, y) || !isRock(x + 1, y) || !isRock(x, y + 1) || !isRock(x + 1, y + 1)) continue;
      const p = fills[hash(x, y, 0x6b) % fills.length];
      const img = image(p.file);
      placements.push({ ...p, order: y + 1.5, dx: x * CELL + CELL - Math.floor(img.width / 2), dy: TOP + (y + 1) * CELL + CELL / 2 - img.height + 6 });
    }
for (const p of placements) {
  p.order ??= p.y + p.rows;
  p.dx ??= p.x * CELL;
  p.dy ??= TOP + p.y * CELL - p.up;
}
placements.sort((a, b) => a.order - b.order || a.dx - b.dx);
for (const p of placements) composite(canvas, image(p.file), p.dx, p.dy);
if (grid) {
  const ink = parseColour("#ff00ff80");
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1)
      if (isRock(x, y)) {
        fillRect(canvas, x * CELL, TOP + y * CELL, CELL, 1, ink);
        fillRect(canvas, x * CELL, TOP + y * CELL, 1, CELL, ink);
      }
}
fs.writeFileSync(path.resolve(out), encodePng(scale === 1 ? canvas : scaleNearest(canvas, scale)));
console.log(`wrote ${out}: ${placements.length} pieces`);
for (const p of placements.filter((q) => q.x !== undefined)) console.log(`  ${p.x},${p.y} ${p.cols}x${p.rows} ${p.kind}${p.tall ? " tall" : ""} ${path.basename(p.file)}`);
