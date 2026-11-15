#!/usr/bin/env node
// Measures terrain pieces for review and for the manifest (bead
// border_marches-xaj.14): opaque box, how far the paint rises above the
// footprint, the foot (lowest paint per column band), the opaque rows on the
// canvas's left and right columns (a long straight side reads as a seam),
// the left-minus-right luma (lit from the left when > +1.5, LESSONS 5.7) and
// the width of the top row of paint (a clipped peak is wide there).
//
//   node art/review/measure-pieces.mjs [--rows N] <png>...
//
// --rows: footprint rows (the footprint is the bottom rows x 80 px of the
// canvas); default: the canvas height rounded down to whole cells.
import fs from "node:fs";
import { alphaBounds, decodePng } from "../../tools/art/lib/png.mjs";

const args = process.argv.slice(2);
let rowsArg = null;
if (args[0] === "--rows") {
  args.shift();
  rowsArg = Number(args.shift());
}
for (const file of args) {
  const r = decodePng(fs.readFileSync(file));
  const b = alphaBounds(r);
  const opaque = (x, y) => r.data[(y * r.width + x) * 4 + 3] > 0;
  const rows = rowsArg ?? Math.floor(r.height / 80);
  const up = r.height - rows * 80;
  const side = (x) => {
    let n = 0;
    for (let y = 0; y < r.height; y += 1) if (opaque(x, y)) n += 1;
    return n;
  };
  const foot = [];
  for (let x = 0; x < r.width; x += 10) {
    let lo = -1;
    for (let y = 0; y < r.height; y += 1) if (opaque(x, y)) lo = y;
    foot.push(lo < 0 ? "-" : r.height - 1 - lo);
  }
  let left = 0, ln = 0, right = 0, rn = 0;
  for (let y = 0; y < r.height; y += 1)
    for (let x = 0; x < r.width; x += 1) {
      const i = (y * r.width + x) * 4;
      if (r.data[i + 3] < 128) continue;
      const luma = 0.299 * r.data[i] + 0.587 * r.data[i + 1] + 0.114 * r.data[i + 2];
      if (x < b.x + b.width / 2) { left += luma; ln += 1; } else { right += luma; rn += 1; }
    }
  let topRow = 0;
  for (let x = 0; x < r.width; x += 1) if (opaque(x, b.y)) topRow += 1;
  console.log(
    `${file.split("/").pop()} ${r.width}x${r.height} rows=${rows} up=${up} box=${b.x},${b.y} ${b.width}x${b.height}` +
      ` paintUp=${up - b.y} footGap=${r.height - b.y - b.height} sideRows L=${side(0)} R=${side(r.width - 1)}` +
      ` light=${(left / ln - right / rn).toFixed(1)} topRow=${topRow}\n  foot per 10 px: ${foot.join(",")}`,
  );
}
