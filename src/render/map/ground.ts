/**
 * The ground layer of the adventure map, painted pixel by pixel into cached
 * chunks: textured grounds, the ranked spill between grounds, water with the
 * shallow/deep shelf, the coast sand and surf, the forest shade and the dirt
 * roads. Everything is a pure function of the map and world pixel
 * coordinates, so neighbouring cells and chunks always continue each other.
 *
 * Ported from Pulp Wars (LESSONS_MAP_AND_FACTION_SPRITES.md 3.3 to 3.5, 3.7):
 * - src/render/canvas/faction-grass-v7.ts: textured grounds sampled at the
 *   map position modulo their period, and the SPILL (`factionGrassSpillMaskV7`):
 *   a higher-ranked ground runs into a lower one as a ragged strip about
 *   10 px wide, a blob at a shared corner and loose specks, its width a sum
 *   of waves over world pixels repeating every three cells.
 * - src/render/canvas/water-blend-v7.ts: the wandering edge plus half-depth
 *   shelf between shallow and deep water (`waterDepthShareV7`, style SHELF).
 * - src/render/canvas/coast-sand-v7.ts: the sand band with its wet edge and
 *   lip on land, the wet spill, surf and foam on water (`coastLayerPixelsV7`).
 * - src/render/canvas/chibi-forest-v7.ts: the shade under the trees, cut
 *   back with a ragged edge where the wood ends (`floor`).
 *
 * Differences from Pulp Wars: the spill draws the neighbour's texture at the
 * same world pixel (Pulp Wars cut a per-cell tile), so a spill continues the
 * ground it comes from exactly; the waves are evaluated at world pixels
 * directly rather than per cell phase (the same values: their period is
 * three cells either way); the forest shade is tinted per terrain.
 *
 * Border Marches additions against the square grid: every transition (the
 * ground spill, the shore, the shallow/deep shelf) is cut from the contour
 * of a SMOOTH FIELD (`cellField`, bilinear between cell centres) with a slow
 * meander (`borderLevel`) instead of the cell edges, so borders round the
 * cell staircase into curves; and a mountain range stands on a SCREE (a
 * rock-dust wash with pebbles round it and a rock floor inside it), which
 * binds its pieces into one mass.
 */
import { CELL_PX } from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
import type { GameMap } from "../../core/map/types";
import { hash4 } from "./hash";
import { PALETTES, components, paletteOf, rangePalettes } from "./massif";
import type { RangeCover } from "./massif";
import {
  ROAD_COLOURS,
  ROAD_PIXEL,
  ROAD_REACH,
  roadPixelAt,
  roadSegments,
} from "./road";
import type { RoadSegment } from "./road";

const CELL = CELL_PX;
const TURN = (2 * Math.PI) / (CELL * 3);

/** A raster in memory (RGBA, row-major). */
export interface PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface GroundSources {
  readonly textures: Readonly<Record<GroundTerrain, PixelImage>>;
  readonly water: {
    readonly shallow: readonly PixelImage[];
    readonly deep: readonly PixelImage[];
  };
  /**
   * Opaque blocks of every massif piece by manifest key (`blockMask`), so
   * the scree and rock base follow the pieces' silhouettes (bead xaj.21).
   * Without them the scree follows the Mountain cells (the bilinear cell
   * field), as before.
   */
  readonly pieceMasks?: ReadonlyMap<string, BlockMask>;
}

/**
 * Ground ranks, lowest first: a ground spills over every ground before it.
 * Palest to darkest as in Pulp Wars (FACTION_GRASS_IDS_V7): default grass,
 * the goblin dry grass, the dinosaur jungle floor, the martian regolith,
 * the undead burnt ground.
 */
export const GROUND_RANK: readonly GroundTerrain[] = [
  "grass",
  "steppe",
  "jungle",
  "badlands",
  "wasteland",
];

const WATER = GROUND_RANK.length;

// Neighbour bits, as in Pulp Wars.
export const BIT_N = 1;
export const BIT_E = 2;
export const BIT_S = 4;
export const BIT_W = 8;
export const BIT_NE = 16;
export const BIT_SE = 32;
export const BIT_SW = 64;
export const BIT_NW = 128;

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [0, -1, BIT_N],
  [1, 0, BIT_E],
  [0, 1, BIT_S],
  [-1, 0, BIT_W],
  [1, -1, BIT_NE],
  [1, 1, BIT_SE],
  [-1, 1, BIT_SW],
  [-1, -1, BIT_NW],
];

/**
 * Distance from cell pixel (px, py) to the nearest neighbour named in
 * `bits` (edges for the four sides, corner points for the diagonals): the
 * 8-neighbour distance field every transition is cut from.
 */
export function edgeDistance(bits: number, px: number, py: number): number {
  let d = Infinity;
  if ((bits & BIT_N) !== 0) d = Math.min(d, py);
  if ((bits & BIT_S) !== 0) d = Math.min(d, CELL - py);
  if ((bits & BIT_W) !== 0) d = Math.min(d, px);
  if ((bits & BIT_E) !== 0) d = Math.min(d, CELL - px);
  if ((bits & BIT_NE) !== 0) d = Math.min(d, Math.hypot(CELL - px, py));
  if ((bits & BIT_SE) !== 0) d = Math.min(d, Math.hypot(CELL - px, CELL - py));
  if ((bits & BIT_SW) !== 0) d = Math.min(d, Math.hypot(px, CELL - py));
  if ((bits & BIT_NW) !== 0) d = Math.min(d, Math.hypot(px, py));
  return d;
}

/** FACTION_GRASS_SPILL_V7. */
export const SPILL = {
  width: 10,
  waves: [4, 2.6, 1.6],
  speckReach: 7,
  speckShare: 7,
  block: 2,
} as const;

/** How far a spill reaches at world pixel (wx, wy). */
export function spillReach(wx: number, wy: number): number {
  return (
    SPILL.width +
    SPILL.waves[0] * Math.sin(TURN * (5 * wx + 4 * wy) + 1.3) +
    SPILL.waves[1] * Math.sin(TURN * (11 * wy - 9 * wx) + 0.4) +
    SPILL.waves[2] * Math.sin(TURN * (23 * wx + 19 * wy) + 2.6)
  );
}

/**
 * The level of a smooth field where a border runs: 0.5 plus a slow meander
 * (periods of about 5 and 9 cells, not tied to the cell grid), so a long
 * border that follows a diagonal staircase of cells bends instead of
 * running ruler-straight.
 */
export function borderLevel(wx: number, wy: number, salt = 0): number {
  const k = (2 * Math.PI) / CELL;
  return (
    0.5 +
    0.1 * Math.sin(k * (0.19 * wx + 0.13 * wy) + 1.1 + salt) +
    0.06 * Math.sin(k * (0.07 * wx - 0.11 * wy) + 2.3 + 2 * salt)
  );
}

/**
 * The ground rank at world pixel (wx, wy) of a cell whose 3 x 3
 * neighbourhood holds the land ranks `ranks` (ascending, distinct).
 *
 * Border Marches change to the Pulp Wars spill: the distance is not to the
 * cell's edges but to the 0.5 contour of the smooth field of "ground of
 * this rank or higher" (`cellField`), so where grounds meet the border
 * rounds the corners of the cell staircase instead of following it; the
 * higher (darker) ground then runs a ragged strip of `spillReach` px past
 * that contour, with loose specks beyond, cut in 2 px blocks, exactly as the
 * Pulp Wars spill.
 */
export function groundRankAt(
  atLeast: readonly ArrayLike<number>[],
  width: number,
  height: number,
  ranks: readonly number[],
  wx: number,
  wy: number,
): number {
  const { block } = SPILL;
  const bx = Math.floor(wx / block) * block + block / 2;
  const by = Math.floor(wy / block) * block + block / 2;
  for (let k = ranks.length - 1; k >= 1; k -= 1) {
    const rank = ranks[k] ?? 0;
    const values = atLeast[rank];
    if (values === undefined) continue;
    const field = cellField(values, width, height, bx, by);
    const inside =
      (field.f - borderLevel(bx, by, rank)) /
      Math.max(1e-4, Math.hypot(field.gx, field.gy));
    const reach = spillReach(bx, by);
    if (inside > -reach) return rank;
    if (
      inside > -reach - SPILL.speckReach &&
      hash4(bx, by, 5 + rank, 0x47) % 100 < SPILL.speckShare
    )
      return rank;
  }
  return ranks[0] ?? 0;
}

/** COAST_SAND_V7. */
export const COAST = {
  width: 4.4,
  waves: [2.2, 1.3, 0.8],
  sand: [228, 210, 156],
  wet: [208, 194, 146],
  lip: [190, 170, 118],
  wetWidth: 1.4,
  lipWidth: 1.2,
  spill: 1.3,
  spillWaves: [1.3, 0.7],
  surf: [236, 246, 248],
  surfAlpha: 84 / 255,
  surfWidth: 1.6,
  foam: [240, 248, 250],
  foamAlpha: 224 / 255,
  foamBand: [3, 6.5],
  foamCut: 0.62,
  reach: 12,
} as const;

/** The wavering level of the land field where the shore runs. */
export function coastThreshold(wx: number, wy: number): number {
  return (
    borderLevel(wx, wy, 7) +
    0.035 * Math.sin(TURN * (4 * wx + 3 * wy) + 0.3) +
    0.02 * Math.sin(TURN * (9 * wy - 7 * wx) + 1.9)
  );
}

export type CoastKind = "none" | "sand" | "wet" | "lip" | "surf" | "foam";

/**
 * The coast at a pixel `distance` px from the shore. `land` says which side:
 * a land pixel draws the sand band, a water pixel the wet spill, surf and
 * foam. (wx, wy) is the world pixel centre.
 */
export function coastAt(
  land: boolean,
  distance: number,
  wx: number,
  wy: number,
): CoastKind {
  if (distance > COAST.reach) return "none";
  if (land) {
    const reach =
      COAST.width +
      COAST.waves[0] * Math.sin(TURN * (5 * wx + 4 * wy) + 0.7) +
      COAST.waves[1] * Math.sin(TURN * (13 * wy - 11 * wx) + 2.1) +
      COAST.waves[2] * Math.sin(TURN * (29 * wx + 23 * wy) + 4.0);
    if (distance >= reach) return "none";
    if (distance < COAST.wetWidth) return "wet";
    return reach - distance < COAST.lipWidth && reach > 2.6 ? "lip" : "sand";
  }
  const spill =
    COAST.spill +
    COAST.spillWaves[0] * Math.sin(TURN * (7 * wx - 6 * wy) + 1.9) +
    COAST.spillWaves[1] * Math.sin(TURN * (19 * wx + 17 * wy) + 0.2);
  if (distance < spill) return "wet";
  if (distance < Math.max(spill, 0) + COAST.surfWidth) return "surf";
  if (distance >= COAST.foamBand[0] && distance < COAST.foamBand[1]) {
    const along =
      Math.sin(TURN * (17 * wx + 7 * wy) + 1.1) *
      Math.sin(TURN * (9 * wy - 19 * wx) + 0.3);
    const ripple = Math.sin(distance * 1.9 + TURN * 11 * (wx + wy));
    if (along > COAST.foamCut && ripple > 0.2) return "foam";
  }
  return "none";
}

/** WATER_BLEND_V7, style SHELF. */
const SHELF = {
  waves: [3.6, 2, 0.6],
  shelfWidth: 7,
  shelfWave: 2.4,
  shelfDepth: 0.5,
  feather: 1,
  shelfFeather: 2,
  reach: 27,
} as const;

const smooth = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * How deep the water is drawn, 0 (shallow) to 1 (deep), at `signed` px from
 * the cells' edge (positive on the shallow side), world pixel (wx, wy).
 */
export function waterDepthShare(
  signed: number,
  wx: number,
  wy: number,
): number {
  const contour =
    SHELF.waves[0] * Math.sin(TURN * (4 * wx + 5 * wy) + 1.3) +
    SHELF.waves[1] * Math.sin(TURN * (11 * wy - 13 * wx) + 0.4) +
    SHELF.waves[2] * Math.sin(TURN * (17 * wx + 19 * wy) + 3.1);
  const across = signed - contour;
  const step = 1 - smooth(-SHELF.feather, SHELF.feather, across);
  const shelf =
    SHELF.shelfWidth +
    SHELF.shelfWave * Math.sin(TURN * (8 * wx - 7 * wy) + 2.2) +
    0.9 * Math.sin(TURN * (20 * wx + 17 * wy) + 5.0);
  const band =
    1 - smooth(-SHELF.shelfFeather, SHELF.shelfFeather, across - shelf);
  return Math.max(step, SHELF.shelfDepth * band);
}

/** The forest shade: a dark tone of each ground, about an eighth opaque. */
const FOREST_SHADE: Readonly<
  Record<GroundTerrain, readonly [number, number, number]>
> = {
  grass: [22, 58, 38],
  jungle: [14, 46, 34],
  steppe: [74, 60, 22],
  badlands: [72, 32, 20],
  wasteland: [34, 30, 28],
};
const FOREST_SHADE_ALPHA = 40 / 255;

/** Depth (px) the forest shade is cut back from an open edge. */
export function forestShadeCut(wx: number, wy: number): number {
  return (
    7 +
    3 * Math.sin(TURN * (6 * wx + 5 * wy) + 0.9) +
    2 * Math.sin(TURN * (15 * wy - 13 * wx) + 2.2) +
    ((hash4(wx >> 1, wy >> 1, 9, 0x2f) % 3) - 1)
  );
}

/**
 * A smooth field over the map: the bilinear interpolation of one value per
 * cell, placed at the cell centres, at world pixel (wx, wy), with its
 * gradient (per world pixel). Cells outside the map repeat the edge cells.
 * Its 0.5 contour runs along the cell edges where two cells differ but cuts
 * convex corners and fills concave ones, so a transition cut from it is
 * round where a cell-edge cut would be a staircase.
 */
export function cellField(
  values: ArrayLike<number>,
  width: number,
  height: number,
  wx: number,
  wy: number,
): { f: number; gx: number; gy: number } {
  const fx = (wx - CELL / 2) / CELL;
  const fy = (wy - CELL / 2) / CELL;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const at = (i: number, j: number): number =>
    values[
      Math.min(height - 1, Math.max(0, j)) * width +
        Math.min(width - 1, Math.max(0, i))
    ] ?? 0;
  const a = at(i0, j0);
  const b = at(i0 + 1, j0);
  const c = at(i0, j0 + 1);
  const d = at(i0 + 1, j0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return {
    f: top + (bottom - top) * ty,
    gx: ((b - a) * (1 - ty) + (d - c) * ty) / CELL,
    gy: (bottom - top) / CELL,
  };
}

/**
 * The scree under a mountain range: a rock-dust wash and pebbles. Its tones
 * come from the ground it lies on (`screePalette`): the dust a pale, greyed
 * tone of the ground, the rock floor a darker one, so a range on red
 * badlands stands on red-brown rubble and one on jungle on a mossy one.
 */
export const SCREE = {
  /** The wash reaches where the mountain field exceeds this (+ waves). */
  threshold: 0.3,
  /** The rock floor where the field exceeds this (+ waves). */
  inner: 0.66,
  waves: [0.05, 0.03],
  /** The neutral rock the ground tone is greyed toward. */
  grey: [140, 132, 122],
  /** Share of that grey in the dust and in the rock floor. */
  dustGrey: 0.4,
  rockGrey: 0.45,
  /** Brightness of the dust and of the rock floor against the ground. */
  dustLight: 1.05,
  rockLight: 0.8,
  alpha: 0.42,
  rockAlpha: 0.6,
  pebbleShare: 0.035,
} as const;

/**
 * The rock base deep inside a range (bead xaj.15): where the mountain field
 * is high, the scree's rock floor turns into the shadowed rock of the
 * range's palette (massif.ts), so what shows in the notches between massif
 * pieces reads as a crevice of the same mountain, not as open ground, and
 * the pieces read as one mass. Index by palette (PALETTES order).
 */
export const ROCK_BASE = {
  threshold: 0.82,
  alpha: 0.88,
  tones: [
    [96, 94, 102],
    [158, 98, 64],
    [52, 50, 60],
  ],
} as const;

/** Side (px) of the blocks of a piece mask and of the silhouette field. */
export const ROCK_BLOCK = 4;
/** Box-blur radius (blocks) of the silhouette field, applied twice. */
export const ROCK_BLUR = 3;
/** Radius (blocks) of the closing that joins neighbouring pieces. */
export const ROCK_CLOSE = 6;

/** Which ROCK_BLOCK x ROCK_BLOCK blocks of a sprite hold paint. */
export interface BlockMask {
  /** Size in blocks. */
  readonly w: number;
  readonly h: number;
  /** 1 where at least half the block's pixels are opaque. */
  readonly bits: Uint8Array;
}

export function blockMask(image: PixelImage): BlockMask {
  const w = Math.ceil(image.width / ROCK_BLOCK);
  const h = Math.ceil(image.height / ROCK_BLOCK);
  const bits = new Uint8Array(w * h);
  for (let by = 0; by < h; by += 1)
    for (let bx = 0; bx < w; bx += 1) {
      let opaque = 0;
      for (let y = by * ROCK_BLOCK; y < (by + 1) * ROCK_BLOCK; y += 1)
        for (let x = bx * ROCK_BLOCK; x < (bx + 1) * ROCK_BLOCK; x += 1)
          if (
            x < image.width &&
            y < image.height &&
            (image.data[(y * image.width + x) * 4 + 3] ?? 0) > 127
          )
            opaque += 1;
      if (opaque * 2 >= ROCK_BLOCK * ROCK_BLOCK) bits[by * w + bx] = 1;
    }
  return { w, h, bits };
}

/**
 * The SILHOUETTE FIELD of the ranges (bead xaj.21): which ground blocks the
 * massif pieces stand on, blurred. A piece counts with the paint inside its
 * own footprint (what rises above it stands over the row behind, which is
 * rock, or open ground the scree must not halo); a back-fill or side
 * boulder with its lower half. The scree's dust, rock floor and rock base
 * are cut from this field instead of from the Mountain cells, so a range's
 * rim follows the outline of its pieces, not the cell edge: the ground
 * shows where a low hump leaves its cell open, and a notch between two
 * pieces still fills with rock.
 */
export interface RockField {
  /** Size in blocks. */
  readonly w: number;
  readonly h: number;
  /** 0..255. */
  readonly f: Uint8Array;
}

export function buildRockField(
  width: number,
  height: number,
  cover: RangeCover,
  masks: ReadonlyMap<string, BlockMask>,
): RockField {
  const per = CELL / ROCK_BLOCK;
  const w = width * per;
  const h = height * per;
  const solid = new Float32Array(w * h);
  const stamp = (
    key: string,
    dx: number,
    dy: number,
    fromRow: number,
    toY: number,
  ): void => {
    const mask = masks.get(key);
    if (mask === undefined) return;
    const bx0 = Math.round(dx / ROCK_BLOCK);
    const by0 = Math.round(dy / ROCK_BLOCK);
    for (let y = fromRow; y < mask.h; y += 1) {
      const gy = by0 + y;
      if (gy < 0 || gy >= h || gy * ROCK_BLOCK >= toY) continue;
      for (let x = 0; x < mask.w; x += 1) {
        const gx = bx0 + x;
        if (gx < 0 || gx >= w || mask.bits[y * mask.w + x] !== 1) continue;
        solid[gy * w + gx] = 1;
      }
    }
  };
  for (const { asset, x, y } of cover.pieces)
    stamp(
      asset.key,
      x * CELL,
      y * CELL - asset.up,
      Math.ceil(asset.up / ROCK_BLOCK),
      (y + asset.rows) * CELL,
    );
  for (const fill of cover.fills)
    stamp(
      fill.asset.key,
      fill.dx,
      fill.dy,
      Math.floor(fill.asset.h / ROCK_BLOCK / 2),
      Infinity,
    );
  // Two separable box blurs: roughly a gaussian of ROCK_BLUR blocks.
  const blur = (src: Float32Array): Float32Array => {
    const r = ROCK_BLUR;
    const span = 2 * r + 1;
    const tmp = new Float32Array(w * h);
    const last = w - 1;
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x += 1)
        sum += src[row + (x < 0 ? 0 : x > last ? last : x)] as number;
      for (let x = 0; x < w; x += 1) {
        tmp[row + x] = sum / span;
        const enter = x + r + 1;
        const leave = x - r;
        sum +=
          (src[row + (enter > last ? last : enter)] as number) -
          (src[row + (leave < 0 ? 0 : leave)] as number);
      }
    }
    // Columns in row-major order: one running sum per column.
    const out = new Float32Array(w * h);
    const sums = new Float32Array(w);
    const bottom = h - 1;
    for (let y = -r; y <= r; y += 1) {
      const row = (y < 0 ? 0 : y > bottom ? bottom : y) * w;
      for (let x = 0; x < w; x += 1)
        sums[x] = (sums[x] as number) + (tmp[row + x] as number);
    }
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      const enter = y + r + 1;
      const leave = y - r;
      const rowIn = (enter > bottom ? bottom : enter) * w;
      const rowOut = (leave < 0 ? 0 : leave) * w;
      for (let x = 0; x < w; x += 1) {
        const sum = sums[x] as number;
        out[row + x] = sum / span;
        sums[x] =
          sum + (tmp[rowIn + x] as number) - (tmp[rowOut + x] as number);
      }
    }
    return out;
  };
  // A morphological closing (dilate, then erode) fills the notches and
  // joints between neighbouring pieces narrower than 2 x ROCK_CLOSE blocks,
  // so they read as crevices of one mass, without growing the outer rim.
  // Binary, separable, with sliding counts: O(n) per pass. Cells outside
  // the map count as rock for the erosion (a range at the map edge keeps
  // its rim) and as open for the dilation.
  const morph = (src: Float32Array, grow: boolean): Float32Array => {
    const r = ROCK_CLOSE;
    const span = 2 * r + 1;
    const edge = grow ? 0 : 1;
    const hit = (count: number): number =>
      grow ? (count > 0 ? 1 : 0) : count === span ? 1 : 0;
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      let count = 0;
      for (let x = -r; x <= r; x += 1)
        count += x < 0 || x >= w ? edge : (src[row + x] as number);
      for (let x = 0; x < w; x += 1) {
        tmp[row + x] = hit(count);
        const enter = x + r + 1;
        const leave = x - r;
        count +=
          (enter >= w ? edge : (src[row + enter] as number)) -
          (leave < 0 ? edge : (src[row + leave] as number));
      }
    }
    const out = new Float32Array(w * h);
    const counts = new Float32Array(w);
    for (let y = -r; y <= r; y += 1)
      for (let x = 0; x < w; x += 1)
        counts[x] =
          (counts[x] as number) +
          (y < 0 || y >= h ? edge : (tmp[y * w + x] as number));
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      const enter = y + r + 1;
      const leave = y - r;
      for (let x = 0; x < w; x += 1) {
        const count = counts[x] as number;
        out[row + x] = hit(count);
        counts[x] =
          count +
          (enter >= h ? edge : (tmp[enter * w + x] as number)) -
          (leave < 0 ? edge : (tmp[leave * w + x] as number));
      }
    }
    return out;
  };
  const smooth = blur(blur(morph(morph(solid, true), false)));
  const f = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1)
    f[i] = Math.round(Math.min(1, smooth[i] ?? 0) * 255);
  return { w, h, f };
}

/** The silhouette field at world pixel (wx, wy), 0..1, bilinear. */
export function rockFieldAt(field: RockField, wx: number, wy: number): number {
  const fx = wx / ROCK_BLOCK - 0.5;
  const fy = wy / ROCK_BLOCK - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number): number =>
    field.f[
      Math.min(field.h - 1, Math.max(0, y)) * field.w +
        Math.min(field.w - 1, Math.max(0, x))
    ] ?? 0;
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
  return (top + (bottom - top) * ty) / 255;
}

const rockFields = new WeakMap<
  GroundLayout,
  { masks: GroundSources["pieceMasks"]; field: RockField | null }
>();

/**
 * The layout's silhouette field, built once per layout and set of masks
 * (null without a cover or masks).
 */
function rockFieldOf(
  layout: GroundLayout,
  sources: GroundSources,
): RockField | null {
  const cached = rockFields.get(layout);
  if (cached !== undefined && cached.masks === sources.pieceMasks)
    return cached.field;
  const field =
    layout.cover !== undefined && sources.pieceMasks !== undefined
      ? buildRockField(
          layout.width,
          layout.height,
          layout.cover,
          sources.pieceMasks,
        )
      : null;
  rockFields.set(layout, { masks: sources.pieceMasks, field });
  return field;
}

/** The scree tones over one ground. */
export interface ScreePalette {
  readonly dust: readonly [number, number, number];
  readonly rock: readonly [number, number, number];
  readonly pebble: readonly [number, number, number];
  readonly pebbleLit: readonly [number, number, number];
}

/** The scree tones over a ground of mean colour `ground` (RGB). */
export function screePalette(ground: readonly number[]): ScreePalette {
  const tone = (grey: number, light: number): [number, number, number] => [
    Math.round(
      Math.min(
        255,
        ((ground[0] ?? 0) * (1 - grey) + SCREE.grey[0] * grey) * light,
      ),
    ),
    Math.round(
      Math.min(
        255,
        ((ground[1] ?? 0) * (1 - grey) + SCREE.grey[1] * grey) * light,
      ),
    ),
    Math.round(
      Math.min(
        255,
        ((ground[2] ?? 0) * (1 - grey) + SCREE.grey[2] * grey) * light,
      ),
    ),
  ];
  const rock = tone(SCREE.rockGrey, SCREE.rockLight);
  return {
    dust: tone(SCREE.dustGrey, SCREE.dustLight),
    rock,
    pebble: [
      Math.round(rock[0] * 0.66),
      Math.round(rock[1] * 0.66),
      Math.round(rock[2] * 0.66),
    ],
    pebbleLit: tone(0.6, 1.3),
  };
}

const screeCache = new WeakMap<GroundSources, readonly ScreePalette[]>();

/** The scree palette of every ground rank, from its texture's mean colour. */
export function screePalettes(sources: GroundSources): readonly ScreePalette[] {
  const cached = screeCache.get(sources);
  if (cached !== undefined) return cached;
  const palettes = GROUND_RANK.map((terrain) => {
    const data = sources.textures[terrain].data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4 * 7) {
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      count += 1;
    }
    const k = 1 / Math.max(1, count);
    return screePalette([r * k, g * k, b * k]);
  });
  screeCache.set(sources, palettes);
  return palettes;
}

/**
 * The scree tier of world pixel (wx, wy) under a mountain field f: 0 none,
 * 1 the outer dust, 2 the rock floor inside a range. Both edges are cut in
 * 2 px blocks on wavering thresholds, flat tones, no gradient.
 */
export function screeAt(f: number, wx: number, wy: number): 0 | 1 | 2 {
  const bx = (wx >> 1) * 2 + 1;
  const by = (wy >> 1) * 2 + 1;
  const wave =
    SCREE.waves[0] * Math.sin(TURN * (7 * bx + 5 * by) + 0.5) +
    SCREE.waves[1] * Math.sin(TURN * (17 * by - 13 * bx) + 1.7);
  if (f > SCREE.inner + wave * 1.5) return 2;
  return f > SCREE.threshold + wave ? 1 : 0;
}

/** The wavering edge of the rock base, in 2 px blocks. */
function rockTone(
  layout: GroundLayout,
  wx: number,
  wy: number,
): [number, number, number] | undefined {
  // Bilinear over the four nearest cell centres, mountain cells only, so
  // where two palettes meet inside a range the base fades, never a seam.
  const fx = wx / CELL - 0.5;
  const fy = wy / CELL - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let dy = 0; dy <= 1; dy += 1)
    for (let dx = 0; dx <= 1; dx += 1) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) continue;
      const tone =
        ROCK_BASE.tones[(layout.rockPalette[y * layout.width + x] ?? 0) - 1];
      if (tone === undefined) continue;
      const w = (dx === 0 ? 1 - tx : tx) * (dy === 0 ? 1 - ty : ty);
      r += tone[0] * w;
      g += tone[1] * w;
      b += tone[2] * w;
      total += w;
    }
  if (total <= 0) return undefined;
  return [Math.round(r / total), Math.round(g / total), Math.round(b / total)];
}

function rockWave(wx: number, wy: number): number {
  const bx = (wx >> 1) * 2 + 1;
  const by = (wy >> 1) * 2 + 1;
  return (
    0.05 * Math.sin(TURN * (11 * bx - 7 * by) + 0.9) +
    0.03 * Math.sin(TURN * (5 * by + 19 * bx) + 2.3)
  );
}

/** Per-cell facts the painter reads, computed once per map. */
export interface GroundLayout {
  readonly width: number;
  readonly height: number;
  /** GROUND_RANK index, or WATER (5). */
  readonly kind: Uint8Array;
  readonly deep: Uint8Array;
  readonly variant: Uint8Array;
  /** Neighbour bits of the other kind (water round land, land round water). */
  readonly coast: Uint8Array;
  /** Neighbour bits of water of the other depth. */
  readonly depth: Uint8Array;
  /** EDGE bits (N1 E2 S4 W8) of a forest cell facing no forest; 255 = no forest. */
  readonly forest: Uint8Array;
  /** Road segments that may reach each cell. */
  readonly roads: readonly (readonly RoadSegment[])[];
  /** Distinct land ranks in each cell's 3 x 3 neighbourhood, ascending. */
  readonly ranks: readonly (readonly number[])[];
  /** Per rank r: 1 on a land cell of rank r or higher (the spill fields). */
  readonly atLeast: readonly Uint8Array[];
  /** 1 on a land cell (the shore field). */
  readonly land: Uint8Array;
  /** 1 on a Mountain cell (the scree field). */
  readonly mountain: Uint8Array;
  /** 1 when a Mountain lies on the cell or one of its 8 neighbours. */
  readonly nearMountain: Uint8Array;
  /** On a Mountain cell, 1 + its range's palette index (PALETTES); else 0. */
  readonly rockPalette: Uint8Array;
  /** The ranges' cover (massif.ts), for the silhouette field; optional. */
  readonly cover?: RangeCover;
}

/**
 * Builds the layout. `roadEnds` are extra road nodes (object entrances next
 * to a road) where a road ends.
 */
export function buildGroundLayout(
  map: GameMap,
  roadEnds: readonly (readonly [number, number])[] = [],
  cover?: RangeCover,
): GroundLayout {
  const { width, height } = map;
  const n = width * height;
  const kind = new Uint8Array(n);
  const deep = new Uint8Array(n);
  const variant = new Uint8Array(n);
  const coast = new Uint8Array(n);
  const depth = new Uint8Array(n);
  const forest = new Uint8Array(n).fill(255);
  map.cells.forEach((cell, i) => {
    kind[i] =
      cell.terrain === "water" ? WATER : GROUND_RANK.indexOf(cell.terrain);
    deep[i] = cell.terrain === "water" && cell.deep === true ? 1 : 0;
    variant[i] = hash4(i % width, Math.floor(i / width), 3, 0x51) & 0xff;
  });
  const at = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < width && y < height ? y * width + x : -1;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const own = kind[i] ?? 0;
      for (const [dx, dy, bit] of NEIGHBOURS) {
        const j = at(x + dx, y + dy);
        if (j < 0) continue;
        const other = kind[j] ?? 0;
        if ((other === WATER) !== (own === WATER))
          coast[i] = (coast[i] ?? 0) | bit;
        if (own === WATER && other === WATER && deep[j] !== deep[i])
          depth[i] = (depth[i] ?? 0) | bit;
      }
      if (map.cells[i]?.obstacle === "forest") {
        let edges = 0;
        const open = (j: number): boolean =>
          j >= 0 && map.cells[j]?.obstacle !== "forest";
        if (open(at(x, y - 1))) edges |= 1;
        if (open(at(x + 1, y))) edges |= 2;
        if (open(at(x, y + 1))) edges |= 4;
        if (open(at(x - 1, y))) edges |= 8;
        forest[i] = edges;
      }
    }
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) land[i] = kind[i] === WATER ? 0 : 1;
  const ranks: number[][] = [];
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const present = new Set<number>();
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const j = at(x + dx, y + dy);
          if (j >= 0 && kind[j] !== WATER) present.add(kind[j] ?? 0);
        }
      ranks.push([...present].sort((a, b) => a - b));
    }
  const atLeast = GROUND_RANK.map((_, rank) => {
    const values = new Uint8Array(n);
    for (let i = 0; i < n; i += 1)
      values[i] = kind[i] !== WATER && (kind[i] ?? 0) >= rank ? 1 : 0;
    return values;
  });
  const mountain = new Uint8Array(n);
  map.cells.forEach((cell, i) => {
    if (cell.obstacle === "mountain") mountain[i] = 1;
  });
  const nearMountain = new Uint8Array(n);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const j = at(x + dx, y + dy);
          if (j >= 0 && mountain[j] === 1) nearMountain[y * width + x] = 1;
        }
  const rockPalette = new Uint8Array(n);
  for (const range of components(width, height, (i) => mountain[i] === 1))
    for (const [i, p] of rangePalettes(range, width, (j) =>
      paletteOf(map.cells[j]?.terrain ?? "grass"),
    ))
      rockPalette[i] = 1 + PALETTES.indexOf(p);
  const roads: RoadSegment[][] = Array.from({ length: n }, () => []);
  for (const seg of roadSegments(map, roadEnds)) {
    const reach = ROAD_REACH + 1;
    const xa = Math.min(seg.ax, seg.ax + seg.cx) - reach;
    const xb = Math.max(seg.ax, seg.ax + seg.cx) + reach;
    const ya = Math.min(seg.ay, seg.ay + seg.cy) - reach;
    const yb = Math.max(seg.ay, seg.ay + seg.cy) + reach;
    for (let cy = Math.floor(ya / CELL); cy <= Math.floor(yb / CELL); cy += 1)
      for (
        let cx = Math.floor(xa / CELL);
        cx <= Math.floor(xb / CELL);
        cx += 1
      ) {
        const j = at(cx, cy);
        if (j >= 0) roads[j]?.push(seg);
      }
  }
  return {
    width,
    height,
    kind,
    deep,
    variant,
    coast,
    depth,
    forest,
    roads,
    ranks,
    atLeast,
    land,
    mountain,
    nearMountain,
    rockPalette,
    ...(cover === undefined ? {} : { cover }),
  };
}

const modulo = (value: number, by: number): number => ((value % by) + by) % by;

/**
 * Paints the ground of world rectangle (x0, y0, w, h) (master pixels) into
 * `out` (RGBA, w x h). Pixels outside the map are left transparent.
 */
export function paintGround(
  layout: GroundLayout,
  sources: GroundSources,
  x0: number,
  y0: number,
  w: number,
  h: number,
  out: Uint8ClampedArray,
): void {
  const textures = GROUND_RANK.map((terrain) => sources.textures[terrain]);
  const screes = screePalettes(sources);
  const silhouette = rockFieldOf(layout, sources);
  const cx0 = Math.max(0, Math.floor(x0 / CELL));
  const cy0 = Math.max(0, Math.floor(y0 / CELL));
  const cx1 = Math.min(layout.width - 1, Math.floor((x0 + w - 1) / CELL));
  const cy1 = Math.min(layout.height - 1, Math.floor((y0 + h - 1) / CELL));
  const put = (o: number, c: readonly number[]): void => {
    out[o] = c[0] ?? 0;
    out[o + 1] = c[1] ?? 0;
    out[o + 2] = c[2] ?? 0;
    out[o + 3] = 255;
  };
  const blend = (o: number, c: readonly number[], a: number): void => {
    out[o] = (out[o] ?? 0) + ((c[0] ?? 0) - (out[o] ?? 0)) * a;
    out[o + 1] = (out[o + 1] ?? 0) + ((c[1] ?? 0) - (out[o + 1] ?? 0)) * a;
    out[o + 2] = (out[o + 2] ?? 0) + ((c[2] ?? 0) - (out[o + 2] ?? 0)) * a;
  };
  const sample = (o: number, tex: PixelImage, tx: number, ty: number): void => {
    const s = (modulo(ty, tex.height) * tex.width + modulo(tx, tex.width)) * 4;
    out[o] = tex.data[s] ?? 0;
    out[o + 1] = tex.data[s + 1] ?? 0;
    out[o + 2] = tex.data[s + 2] ?? 0;
    out[o + 3] = 255;
  };
  for (let cy = cy0; cy <= cy1; cy += 1)
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const i = cy * layout.width + cx;
      const kind = layout.kind[i] ?? 0;
      const ox = cx * CELL;
      const oy = cy * CELL;
      const lx0 = Math.max(0, x0 - ox);
      const ly0 = Math.max(0, y0 - oy);
      const lx1 = Math.min(CELL, x0 + w - ox);
      const ly1 = Math.min(CELL, y0 + h - oy);
      const coastBits = layout.coast[i] ?? 0;
      const depthBits = layout.depth[i] ?? 0;
      const forestEdges = layout.forest[i] ?? 255;
      const ranks = layout.ranks[i] ?? [];
      const links = layout.roads[i] ?? [];
      const water = kind === WATER;
      const scree = layout.nearMountain[i] === 1 && !water;
      const deep = layout.deep[i] === 1;
      const v = (layout.variant[i] ?? 0) % 2;
      const shallowTile =
        sources.water.shallow[v % sources.water.shallow.length];
      const deepTile = sources.water.deep[v % sources.water.deep.length];
      const shade = water
        ? undefined
        : FOREST_SHADE[GROUND_RANK[kind] ?? "grass"];
      for (let ly = ly0; ly < ly1; ly += 1)
        for (let lx = lx0; lx < lx1; lx += 1) {
          const wx = ox + lx;
          const wy = oy + ly;
          const o = ((wy - y0) * w + (wx - x0)) * 4;
          const px = lx + 0.5;
          const py = ly + 0.5;
          // Which side of the shore this pixel is on: the 0.5 contour of
          // the smooth land field, wavering, so coasts round their corners.
          let land = !water;
          let shore = Infinity;
          if (coastBits !== 0) {
            const field = cellField(
              layout.land,
              layout.width,
              layout.height,
              wx + 0.5,
              wy + 0.5,
            );
            const t = coastThreshold(wx + 0.5, wy + 0.5);
            land = field.f > t;
            shore =
              Math.abs(field.f - t) /
              Math.max(1e-4, Math.hypot(field.gx, field.gy));
          }
          if (!land) {
            const tile = deep && water ? deepTile : shallowTile;
            if (tile !== undefined) sample(o, tile, lx, ly);
            if (
              water &&
              (depthBits !== 0 || (deep && coastBits !== 0)) &&
              shallowTile !== undefined &&
              deepTile !== undefined
            ) {
              const field = cellField(
                layout.deep,
                layout.width,
                layout.height,
                wx + 0.5,
                wy + 0.5,
              );
              const signed =
                (0.5 - field.f) /
                Math.max(1e-4, Math.hypot(field.gx, field.gy));
              if (Math.abs(signed) <= SHELF.reach) {
                const share = waterDepthShare(signed, wx + 0.5, wy + 0.5);
                const s = (ly * shallowTile.width + lx) * 4;
                const t = (ly * deepTile.width + lx) * 4;
                for (let c = 0; c < 3; c += 1)
                  out[o + c] =
                    (shallowTile.data[s + c] ?? 0) * (1 - share) +
                    (deepTile.data[t + c] ?? 0) * share;
              }
            }
            if (coastBits !== 0) {
              const k = coastAt(false, shore, wx + 0.5, wy + 0.5);
              if (k === "wet") put(o, COAST.wet);
              else if (k === "surf") blend(o, COAST.surf, COAST.surfAlpha);
              else if (k === "foam") blend(o, COAST.foam, COAST.foamAlpha);
            }
          } else {
            // The ground here: the cell's own, or where grounds meet (or a
            // water cell's corner the shore takes) the ranked spill.
            const rank =
              ranks.length > 1
                ? groundRankAt(
                    layout.atLeast,
                    layout.width,
                    layout.height,
                    ranks,
                    wx,
                    wy,
                  )
                : water
                  ? (ranks[0] ?? 0)
                  : kind;
            const tex = textures[rank];
            if (tex !== undefined) sample(o, tex, wx, wy);
            if (scree) {
              const f =
                silhouette === null
                  ? cellField(
                      layout.mountain,
                      layout.width,
                      layout.height,
                      wx + 0.5,
                      wy + 0.5,
                    ).f
                  : rockFieldAt(silhouette, wx + 0.5, wy + 0.5);
              const tier = screeAt(f, wx, wy);
              const palette = screes[rank];
              if (tier !== 0 && palette !== undefined) {
                if (tier === 2) blend(o, palette.rock, SCREE.rockAlpha);
                else blend(o, palette.dust, SCREE.alpha);
                if (tier === 2 && f > ROCK_BASE.threshold + rockWave(wx, wy)) {
                  const base = rockTone(layout, wx + 0.5, wy + 0.5);
                  if (base !== undefined) blend(o, base, ROCK_BASE.alpha);
                }
                const roll = hash4(wx, wy, 0x5c, 1) / 0x100000000;
                if (roll < SCREE.pebbleShare) put(o, palette.pebble);
                else if (
                  hash4(wx + 1, wy - 1, 0x5c, 1) / 0x100000000 <
                  SCREE.pebbleShare
                )
                  put(o, palette.pebbleLit);
              }
            }
            if (coastBits !== 0) {
              const k = coastAt(true, shore, wx + 0.5, wy + 0.5);
              if (k === "sand") put(o, COAST.sand);
              else if (k === "wet") put(o, COAST.wet);
              else if (k === "lip") put(o, COAST.lip);
            }
            if (forestEdges !== 255 && shade !== undefined) {
              let cut = false;
              if (forestEdges !== 0) {
                const d = edgeDistance(forestEdges, px, py);
                cut = d < forestShadeCut(wx, wy);
              }
              if (!cut) blend(o, shade, FOREST_SHADE_ALPHA);
            }
          }
          if (links.length > 0) {
            const r = roadPixelAt(links, wx, wy);
            if (r !== ROAD_PIXEL.CLEAR) put(o, ROAD_COLOURS[r] ?? [0, 0, 0]);
          }
        }
    }
}
