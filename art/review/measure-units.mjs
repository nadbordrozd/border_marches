#!/usr/bin/env node
// Measures where unit sprites touch the ground, by the Pulp Wars rule
// (scripts/art/unit-shadows/measure.ts, measureUnitFootprintV7) that produced
// the `feet` of the imported units in src/assets/manifest.ts (bead
// border_marches-bzc.14): a pixel is opaque from alpha 128; contactY is one
// past the lowest row with at least 2 opaque pixels; foot and base are the
// opaque x extents (right exclusive) of the 4 and 14 rows above it. Also
// prints the opaque box, for portrait crops.
//
//   node art/review/measure-units.mjs <png>...
import fs from "node:fs";
import { decodePng } from "../../tools/art/lib/png.mjs";

for (const file of process.argv.slice(2)) {
  const { width, height, data } = decodePng(fs.readFileSync(file));
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] >= 128;
  let top = height, left = width, right = 0, contactY = 0;
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      if (!opaque(x, y)) continue;
      count += 1;
      top = Math.min(top, y);
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
    }
    if (count >= 2) contactY = y + 1;
  }
  const band = (rows) => {
    let l = width, r = 0;
    for (let y = Math.max(0, contactY - rows); y < contactY; y += 1)
      for (let x = 0; x < width; x += 1)
        if (opaque(x, y)) {
          l = Math.min(l, x);
          r = Math.max(r, x + 1);
        }
    return [l, r];
  };
  const [footLeft, footRight] = band(4);
  const [baseLeft, baseRight] = band(14);
  console.log(JSON.stringify({ file, width, height, feet: { contactY, footLeft, footRight, baseLeft, baseRight }, box: { top, left, right } }));
}
