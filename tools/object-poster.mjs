#!/usr/bin/env node
/* global console, process */
// Every adventure-map object sprite placed on a strip of each land terrain
// (bead bzc.16), so the art can be judged in context at native size:
//
//   node tools/object-poster.mjs --out poster.png [--terrains grass,steppe] [--scale 1]
//
// Static composition, no browser: the ground texture tiled at world
// coordinates, every look of every type (studio sprites, reused art and
// placeholders) seated on its footprint as src/assets/object-art.ts places
// it, with a unit for scale and faint corner ticks at each footprint.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  alphaBounds,
  blank,
  composite,
  decodePng,
  encodePng,
  fillRect,
  scaleNearest,
} from "./art/lib/png.mjs";
import { drawText } from "./art/lib/font.mjs";
import {
  MAP_OBJECT_ASSETS,
  MAP_OBJECT_TYPES,
  REUSED_OBJECT_ART,
} from "../src/assets/map-objects.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CELL = 80;
const SEAT = { site: 4, pickup: 22 };
const PLACEHOLDER = {
  path: "assets/objects/shrine.png",
  foot: { x: 42, y: 60 },
};
const TERRAINS = ["grass", "jungle", "steppe", "badlands", "wasteland"];
const UNIT = "assets/units/goblin-goblin.png";

function parseArgs(argv) {
  const out = { terrains: TERRAINS, scale: 1 };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`--${name} wants a value`);
    if (name === "out") out.out = value;
    else if (name === "terrains") out.terrains = value.split(",");
    else if (name === "scale") out.scale = Number(value);
    else throw new Error(`unknown option --${name}`);
  }
  if (out.out === undefined) throw new Error("--out wants a file path");
  return out;
}

const cache = new Map();
function load(path) {
  if (!cache.has(path))
    cache.set(path, decodePng(readFileSync(join(ROOT, "public", path))));
  return cache.get(path);
}

/** Every look to place: [label, type, image path, foot, cols, rows, seat]. */
function looks() {
  const out = [];
  for (const type of MAP_OBJECT_TYPES) {
    if (type.hidden) continue;
    const studio = MAP_OBJECT_ASSETS.filter((a) => a.type === type.id);
    const reused = REUSED_OBJECT_ART.filter((a) => a.type === type.id);
    const items = [...studio, ...reused];
    if (items.length === 0)
      items.push({ variant: "placeholder", ...PLACEHOLDER });
    for (const item of items)
      out.push({
        label: item.variant ? `${type.id} ${item.variant}` : type.id,
        path: item.path,
        foot: item.foot,
        cols: type.cols,
        rows: type.rows,
        seat: SEAT[type.seat],
      });
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const items = looks();
  const widthCells = 30;
  // Pack the looks into lines of footprints, one cell apart.
  const lines = [];
  let line = [];
  let x = 1;
  for (const item of items) {
    if (x + item.cols > widthCells - 1) {
      lines.push(line);
      line = [];
      x = 1;
    }
    line.push({ ...item, x });
    x += item.cols + 1;
  }
  lines.push(line);
  const lineRows = lines.map((l) => Math.max(...l.map((i) => i.rows)) + 1);
  const bandRows = lineRows.reduce((a, b) => a + b, 0) + 1;
  const W = widthCells * CELL;
  const H = bandRows * CELL * args.terrains.length;
  const canvas = blank(W, H, [0, 0, 0, 255]);
  const label = [255, 255, 255, 255];
  const tick = [40, 44, 40, 255];
  const shade = [0, 0, 0, 255];
  args.terrains.forEach((terrain, t) => {
    const top = t * bandRows * CELL;
    const ground = load(`assets/terrain/grounds/${terrain}.png`);
    for (let y = 0; y < bandRows * CELL; y += 1)
      for (let gx = 0; gx < W; gx += ground.width) {
        const sy = (top + y) % ground.height;
        const row = ground.data.subarray(
          sy * ground.width * 4,
          (sy + 1) * ground.width * 4,
        );
        const n = Math.min(ground.width, W - gx) * 4;
        canvas.data.set(row.subarray(0, n), ((top + y) * W + gx) * 4);
      }
    drawText(canvas, terrain, 10, top + 10, shade, 2);
    drawText(canvas, terrain, 8, top + 8, label, 2);
    let rowY = top / CELL + 1;
    lines.forEach((items, li) => {
      const rows = lineRows[li] - 1;
      // A unit for scale at the left of each line.
      const unit = load(UNIT);
      const ub = alphaBounds(unit);
      composite(
        canvas,
        unit,
        Math.round(CELL / 2 - (ub.x + ub.width / 2)),
        (rowY + rows) * CELL - 8 - (ub.y + ub.height),
      );
      for (const item of items) {
        const y0 = rowY + rows - item.rows;
        const left = item.x * CELL;
        const bottom = (y0 + item.rows) * CELL;
        for (const [cx, cy] of [
          [left, bottom - 1],
          [left + item.cols * CELL - 6, bottom - 1],
        ])
          fillRect(canvas, cx, cy, 6, 1, tick);
        const img = load(item.path);
        const groundX = left + (item.cols * CELL) / 2;
        const groundY = bottom - item.seat;
        composite(
          canvas,
          img,
          Math.round(groundX - item.foot.x),
          groundY - item.foot.y,
        );
        if (t === 0) {
          drawText(canvas, item.label, left + 3, bottom + 5, shade);
          drawText(canvas, item.label, left + 2, bottom + 4, label);
        }
      }
      rowY += lineRows[li];
    });
  });
  const out = args.scale === 1 ? canvas : scaleNearest(canvas, args.scale);
  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  writeFileSync(args.out, encodePng(out));
  console.log(
    `wrote ${args.out} (${out.width}x${out.height}, ${items.length} looks x ${args.terrains.length} terrains)`,
  );
}

main();
