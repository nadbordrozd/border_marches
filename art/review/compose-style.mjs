// Composes the style images of bead border_marches-xaj.22 (docs/art/MASSIF_ART.md,
// "Iteration 7"): generate-image-v2 copies the style image's outline at the
// style image's size, so a wide tableland is asked for with a style image of
// that width, pasted together from column strips of accepted, baked pieces.
// The strips overlap at their seams; v2 repaints the whole mass, so only the
// outline matters. Rebuild with: node art/review/compose-style.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  blank,
  composite,
  crop,
  decodePng,
  encodePng,
} from "../../tools/art/lib/png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const M = "public/assets/terrain/massifs";

/** name -> { width, height, strips: [file, fromX, width, toX] } */
const P = `${M}/sandstone/plateau-3x2-a.png`;
const D = `${M}/sandstone/massif-3x2-d.png`;
/**
 * Every wide outline is the west end, middles and east end of plateau-3x2-a
 * (columns 0-80, 80-160, 160-240), so every 80 px seam of a tableland take
 * cuts the rock where its rim and foot stand at much the same heights: a
 * piece cropped at a cell edge of one take joins a piece cropped from another.
 */
const SPECS = {
  "tableland-4x2-a": {
    width: 320,
    height: 208,
    strips: [
      [P, 0, 160, 0],
      [P, 80, 160, 160],
    ],
  },
  "tableland-5x2-a": {
    width: 400,
    height: 208,
    strips: [
      [P, 0, 160, 0],
      [P, 80, 80, 160],
      [P, 80, 160, 240],
    ],
  },
  // The banded family: the straight striped cliffs of massif-3x2-d (a
  // table mesa), cut and repeated the same way. Its rim stands 10-20 px
  // lower than the fluted family's, so the two families never join.
  "tableland-4x2-b": {
    width: 320,
    height: 208,
    strips: [
      [D, 0, 160, 0],
      [D, 80, 160, 160],
    ],
  },
  "tableland-5x2-b": {
    width: 400,
    height: 208,
    strips: [
      [D, 0, 160, 0],
      [D, 80, 80, 160],
      [D, 80, 160, 240],
    ],
  },
  // A whole small banded mesa, both ends of massif-3x2-d: a quiet 2x2
  // for the inside of a range.
  "tableland-2x2-b": {
    width: 160,
    height: 208,
    strips: [
      [D, 0, 80, 0],
      [D, 160, 80, 80],
    ],
  },
  // A low back edge two rows deep: plateau-3x2-a squashed to 0.8 of its
  // height on its foot, so its paint stays inside the footprint.
  "low-3x2-a": {
    width: 240,
    height: 208,
    scaleY: 0.8,
    strips: [[P, 0, 240, 0]],
  },
};

/** Nearest-neighbour vertical resample, kept standing on its bottom row. */
function squash(src, k) {
  const out = blank(src.width, src.height);
  for (let y = 0; y < src.height; y += 1) {
    const sy = src.height - 1 - Math.floor((src.height - 1 - y) / k);
    if (sy < 0) continue;
    out.data.set(
      src.data.subarray(sy * src.width * 4, (sy + 1) * src.width * 4),
      y * src.width * 4,
    );
  }
  return out;
}

const out = path.join(root, "art/refs/massif-sandstone");
fs.mkdirSync(out, { recursive: true });
for (const [name, spec] of Object.entries(SPECS)) {
  const canvas = blank(spec.width, spec.height);
  for (const [file, fromX, width, toX] of spec.strips) {
    const src = decodePng(fs.readFileSync(path.join(root, file)));
    composite(canvas, crop(src, fromX, 0, width, src.height), toX, spec.height - src.height);
  }
  const image = spec.scaleY ? squash(canvas, spec.scaleY) : canvas;
  fs.writeFileSync(path.join(out, `${name}.png`), encodePng(image));
  console.log(`wrote art/refs/massif-sandstone/${name}.png (${spec.width}x${spec.height})`);
}
