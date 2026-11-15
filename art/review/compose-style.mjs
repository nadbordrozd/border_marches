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

/**
 * Bead xaj.23. Granite: whole wide massifs (not cut), each a different
 * outline spliced from column strips of accepted 3x2 massifs at points where
 * their crests stand at the same height (within 7 px), so one long mass rises
 * to two summits over a continuous ridgeline instead of a row of 2x2 cones.
 */
const G = (name) => `${M}/granite/${name}.png`;
SPECS["granite-5x2-a"] = {
  dir: "massif-granite",
  width: 400,
  height: 208,
  strips: [
    [G("massif-3x2-e"), 0, 95, 0],
    [G("massif-3x2-d"), 55, 125, 95],
    [G("massif-3x2-g"), 95, 55, 220],
    [G("massif-3x2-b"), 115, 125, 275],
  ],
};
SPECS["granite-5x2-b"] = {
  dir: "massif-granite",
  jag: 10,
  width: 400,
  height: 208,
  strips: [
    [G("massif-3x2-a"), 0, 125, 0],
    [G("massif-3x2-f"), 170, 40, 125],
    [G("massif-3x2-g"), 60, 90, 165],
    [G("massif-3x2-e"), 95, 145, 255],
  ],
};
SPECS["granite-4x2-a"] = {
  dir: "massif-granite",
  width: 320,
  height: 208,
  strips: [
    [G("massif-3x2-d"), 0, 150, 0],
    [G("massif-3x2-e"), 70, 170, 150],
  ],
};
SPECS["granite-4x2-b"] = {
  dir: "massif-granite",
  jag: 10,
  width: 320,
  height: 208,
  strips: [
    [G("massif-3x2-g"), 0, 160, 0],
    [G("massif-3x2-d"), 88, 90, 160],
    [G("massif-3x2-b"), 170, 70, 250],
  ],
};
/**
 * Bead xaj.23. A low banded edge ridge (2x1, 160 x 128): the small banded
 * mesa above squashed to 0.6 of its height and cut to its lower 128 rows,
 * so sandstone range edges get short striped cliffs instead of stepped
 * butte ridges.
 */
SPECS["ridge-2x1-banded"] = {
  width: 160,
  height: 128,
  squashOf: "tableland-2x2-b",
  scaleY: 0.6,
};

const GRANITE_TONES = [
  [201, 194, 180],
  [154, 152, 149],
  [108, 111, 122],
];
for (const name of ["granite-5x2-a", "granite-4x2-a", "granite-5x2-b", "granite-4x2-b"])
  SPECS[`${name}-flat`] = {
    dir: "massif-granite",
    width: SPECS[name].width,
    height: SPECS[name].height,
    flat: name,
    tones: GRANITE_TONES,
  };

/**
 * Bead xaj.23. Three-row tablelands: the banded outlines above deepened by
 * one cell (80 px) by repeating a band of their top surface, so a deep
 * badlands block reads as one table three rows deep instead of two terraces.
 */
SPECS["tableland-4x3-b"] = {
  width: 320,
  height: 288,
  base: "tableland-4x2-b",
  deepen: [62, 63, 80],
};
SPECS["tableland-5x3-b"] = {
  width: 400,
  height: 288,
  base: "tableland-5x2-b",
  deepen: [62, 63, 80],
};

/**
 * Bead xaj.23: a composed outline with its inner detail flattened to three
 * tones (lit, mid, shade) and its dark outline kept. v2 copies the style
 * image's detail too (g8-wide42-a came back as the two source massifs glued
 * at a vertical seam); flat planes leave it the silhouette and the light.
 */
function flatten(src, tones) {
  const out = blank(src.width, src.height);
  for (let i = 0; i < src.width * src.height; i += 1) {
    const k = i * 4;
    if (src.data[k + 3] === 0) continue;
    const l = 0.299 * src.data[k] + 0.587 * src.data[k + 1] + 0.114 * src.data[k + 2];
    const t = l < 70 ? null : l < 130 ? tones[2] : l < 175 ? tones[1] : tones[0];
    if (t === null) out.data.set(src.data.subarray(k, k + 4), k);
    else out.data.set([...t, 255], k);
  }
  return out;
}

/** The rows [from, to) of `src` repeated `times` times in place. */
function deepen(src, [from, to, times], height) {
  const out = blank(src.width, height);
  const row = src.width * 4;
  const band = src.data.subarray(from * row, to * row);
  let y = 0;
  out.data.set(src.data.subarray(0, from * row), 0);
  y = from;
  for (let k = 0; k < times; k += 1) {
    out.data.set(band, y * row);
    y += to - from;
  }
  out.data.set(src.data.subarray(from * row), y * row);
  return out;
}

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

const built = new Map();
for (const [name, spec] of Object.entries(SPECS)) {
  const dir = `art/refs/${spec.dir ?? "massif-sandstone"}`;
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  let image;
  if (spec.squashOf !== undefined) {
    const tall = squash(built.get(spec.squashOf), spec.scaleY);
    image = crop(tall, 0, tall.height - spec.height, spec.width, spec.height);
  } else if (spec.flat !== undefined) {
    image = flatten(built.get(spec.flat), spec.tones);
  } else if (spec.base !== undefined) {
    image = deepen(built.get(spec.base), spec.deepen, spec.height);
  } else {
    const canvas = blank(spec.width, spec.height);
    const jag = spec.jag ?? 0;
    spec.strips.forEach(([file, fromX, width, toX], k) => {
      const src = decodePng(fs.readFileSync(path.join(root, file)));
      const last = k === spec.strips.length - 1;
      // With `jag`, each strip runs on `jag` px past its seam and the next
      // one starts at a wandering column, so no seam is a straight line.
      const w = last ? width : Math.min(width + jag, src.width - fromX);
      const strip = crop(src, fromX, 0, w, src.height);
      const top = spec.height - src.height;
      if (k === 0 || jag === 0) {
        composite(canvas, strip, toX, top);
        return;
      }
      for (let y = 0; y < strip.height; y += 1) {
        const wave = Math.sin(y / 11 + k * 2.1) + 0.5 * Math.sin(y / 4.3 + k);
        const skip = Math.round((jag / 2) * (1 + wave / 1.5));
        const row = crop(strip, skip, y, strip.width - skip, 1);
        // Keep the earlier strip where this one is empty at the seam.
        composite(canvas, row, toX + skip, top + y);
      }
    });
    image = spec.scaleY ? squash(canvas, spec.scaleY) : canvas;
  }
  built.set(name, image);
  fs.writeFileSync(path.join(root, dir, `${name}.png`), encodePng(image));
  console.log(`wrote ${dir}/${name}.png (${spec.width}x${spec.height})`);
}
