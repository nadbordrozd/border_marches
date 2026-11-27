/**
 * The ground layer of the adventure map, painted pixel by pixel into cached
 * chunks: textured grounds, the ranked border cut between grounds, water with the
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
 * cell staircase into curves. Mountain ranges are drawn over the ground by
 * the peaks (peaks.ts), not here.
 *
 * Bead bzc.138 (the ground rollout, docs/art/classes/grounds.md): the
 * textures are baked offline from PixelLab takes (tools/art/ground-bake.mjs);
 * the Pulp Wars spill is replaced by a brush cut with a rim on the lower
 * ground (`groundEdgeAt`, the baked `EdgeMask`); a two-scale colour drift
 * in dithered palettes runs over every ground (`DRIFT`); and buildings stand
 * in trodden patches (`groundPatches`).
 */
import { CELL_PX } from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
import { objectBounds } from "../../core/map/types";
import type { GameMap, MapObject } from "../../core/map/types";
import { buildCanopyField, canopyTint } from "./canopy";
import type { CanopyField } from "./canopy";
import { bayer, driftAt, driftGrid } from "./ground-noise";
import { hash4 } from "./hash";
import {
  ROAD_COLOURS,
  ROAD_PIXEL,
  ROAD_REACH,
  roadPixelAt,
  roadSegments,
} from "./road";
import type { RoadSegment } from "./road";
import type { CrackOverlay } from "./terrain-motion";

const CELL = CELL_PX;
const TURN = (2 * Math.PI) / (CELL * 3);

/** A raster in memory (RGBA, row-major). */
export interface PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * How a ground texture is calmed when it is loaded (bead xaj.27): the steppe
 * texture (imported from Pulp Wars) carries dark drift patches and tall
 * straw tufts sitting in dark puddles of shade, which read as dunes and
 * stamps once repeated over a wide plain. `flatten` pulls the slow light and
 * dark patches toward the texture's mean colour; `contrast` and `dark` scale
 * the fine detail round its local mean (lighter and darker pixels).
 */
export interface GroundCalm {
  readonly radius: number;
  readonly flatten: number;
  readonly contrast: number;
  readonly dark: number;
}

/**
 * No ground is calmed at load since bead bzc.138: every texture is baked
 * offline (tools/art/ground-bake.mjs) at its recorded colour and spread.
 */
export const GROUND_CALM: Readonly<Partial<Record<GroundTerrain, GroundCalm>>> =
  {};

/** Box blur of one channel layout (RGBA) with wrap-around, radius r. */
function wrapBlur(image: PixelImage, r: number): Float32Array {
  const { width: w, height: h, data } = image;
  const tmp = new Float32Array(w * h * 3);
  const out = new Float32Array(w * h * 3);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y += 1)
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = -r; k <= r; k += 1)
        sum += data[(y * w + (((k % w) + w) % w)) * 4 + c] ?? 0;
      for (let x = 0; x < w; x += 1) {
        tmp[(y * w + x) * 3 + c] = sum / n;
        const add = (x + r + 1) % w;
        const drop = (((x - r) % w) + w) % w;
        sum +=
          (data[(y * w + add) * 4 + c] ?? 0) -
          (data[(y * w + drop) * 4 + c] ?? 0);
      }
    }
  for (let x = 0; x < w; x += 1)
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = -r; k <= r; k += 1)
        sum += tmp[((((k % h) + h) % h) * w + x) * 3 + c] ?? 0;
      for (let y = 0; y < h; y += 1) {
        out[(y * w + x) * 3 + c] = sum / n;
        const add = (y + r + 1) % h;
        const drop = (((y - r) % h) + h) % h;
        sum +=
          (tmp[(add * w + x) * 3 + c] ?? 0) -
          (tmp[(drop * w + x) * 3 + c] ?? 0);
      }
    }
  return out;
}

/**
 * A calmed copy of a tileable ground texture (GROUND_CALM): still tileable,
 * the same mean colour, quieter patches and softer detail. Pure.
 */
export function calmTexture(image: PixelImage, calm: GroundCalm): PixelImage {
  const { width: w, height: h, data } = image;
  // Two passes of the box blur: a smooth local mean.
  const once = wrapBlur(image, calm.radius);
  const asImage: PixelImage = {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4).map((_, o) =>
      o % 4 === 3 ? 255 : (once[(o >> 2) * 3 + (o % 4)] ?? 0),
    ),
  };
  const local = wrapBlur(asImage, calm.radius);
  const mean = [0, 0, 0];
  for (let p = 0; p < w * h; p += 1)
    for (let c = 0; c < 3; c += 1)
      mean[c] = (mean[c] ?? 0) + (data[p * 4 + c] ?? 0);
  for (let c = 0; c < 3; c += 1) mean[c] = (mean[c] ?? 0) / (w * h);
  const out = new Uint8ClampedArray(data.length);
  for (let p = 0; p < w * h; p += 1) {
    const lum = (k: (c: number) => number): number =>
      0.3 * k(0) + 0.59 * k(1) + 0.11 * k(2);
    const own = lum((c) => data[p * 4 + c] ?? 0);
    const around = lum((c) => local[p * 3 + c] ?? 0);
    const scale = own < around ? calm.dark : calm.contrast;
    for (let c = 0; c < 3; c += 1) {
      const l = local[p * 3 + c] ?? 0;
      const base = l + ((mean[c] ?? 0) - l) * calm.flatten;
      out[p * 4 + c] = base + ((data[p * 4 + c] ?? 0) - l) * scale;
    }
    out[p * 4 + 3] = data[p * 4 + 3] ?? 255;
  }
  return { width: w, height: h, data: out };
}

export interface GroundSources {
  readonly textures: Readonly<Record<GroundTerrain, PixelImage>>;
  /**
   * Overlays laid over a ground's texture at their own period (bead
   * bzc.83: the volcanic cracks, terrain-motion.ts crackOverlay).
   */
  readonly overlays?: Readonly<Partial<Record<GroundTerrain, CrackOverlay>>>;
  /**
   * The brush that cuts the borders between grounds and frays the trodden
   * patches (bead bzc.138, {@link EdgeMask}). Without it the borders are the
   * smooth field's meandering contour alone.
   */
  readonly edge?: EdgeMask;
  readonly water: {
    readonly shallow: readonly PixelImage[];
    readonly deep: readonly PixelImage[];
  };
}

/**
 * Ground ranks, lowest first: a ground spills over every ground before it.
 * Palest to darkest as in Pulp Wars (FACTION_GRASS_IDS_V7): default grass,
 * the goblin dry grass, the dinosaur jungle floor, the martian regolith,
 * the undead burnt ground; then the volcanic basalt (bead bzc.83), the
 * darkest, whose cracked rock runs out over every other ground. The snow
 * of bead bzc.87 sits just before it: it drifts out over every ground but
 * the volcanic (the two never meet: winter zones keep off volcanic ones).
 * darkest, whose cracked rock runs out over every other ground; then the
 * desert sand (bead bzc.88), last so that the ranks (and the spill shapes)
 * of every older ground stay as they were: its drifting sand runs out over
 * the grounds round it. The Candy Kingdom's frosting (bead bzc.115) comes
 * after it for the same reason: its icing runs out over its neighbours.
 * The swamp (bead bzc.126) comes last for the same reason: its mud and
 * reeds creep out over the grounds round it.
 */
export const GROUND_RANK: readonly GroundTerrain[] = [
  "grass",
  "steppe",
  "jungle",
  "badlands",
  "wasteland",
  "snow",
  "volcanic",
  "sand",
  "frosting",
  "swamp",
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

/**
 * The brush that cuts the borders between grounds (bead bzc.138): a
 * tileable grey table baked offline (tools/art/ground-bake.mjs, from the
 * ink-blot take `ground-lab-pixen/ink-p` mixed with a slow noise). Byte v
 * stands for the edge value (v / 255 * 2 - 1) * EDGE.range.
 */
export interface EdgeMask {
  readonly size: number;
  readonly values: Uint8Array;
}

/**
 * The mask transition (bead bzc.127 experiment C, bead bzc.138): a higher
 * ground reaches `base` px past the smooth field's contour plus `amp` times
 * the brush (in [-range, range]), so lobes, bites and droplets run both
 * ways. Amp 11 keeps every lobe inside the 3 x 3 rank neighbourhood (the
 * lab clipped at 15). Under the cut the lower ground gets a 1 px dark line
 * (`line` px) and a dithered rim band (RIM width), within `band` px.
 */
export const EDGE = {
  base: 2,
  amp: 11,
  range: 1.4,
  line: 1.2,
  band: 6,
  /** How far a trodden patch's edge is frayed by the brush (in radii). */
  patchFray: 0.2,
} as const;

/** The brush value at world pixel (wx, wy) for ground `rank`, in [-range, range]. */
export function edgeValue(
  mask: EdgeMask | undefined,
  wx: number,
  wy: number,
  rank: number,
): number {
  if (mask === undefined) return 0;
  const n = mask.size;
  const x = (((wx + 373 * rank) % n) + n) % n;
  const y = (((wy + 611 * rank) % n) + n) % n;
  return ((mask.values[y * n + x] ?? 128) / 127.5 - 1) * EDGE.range;
}

/** The rim a lower ground shows under a cut: a line and a band tint (RGB multipliers). */
interface Rim {
  readonly line: readonly [number, number, number];
  readonly band: readonly [number, number, number];
  readonly width: number;
}

const RIM: Readonly<Record<GroundTerrain, Rim>> = {
  grass: { line: [0.72, 0.76, 0.76], band: [0.9, 0.91, 0.9], width: 4 },
  steppe: { line: [0.76, 0.76, 0.74], band: [0.92, 0.91, 0.88], width: 4 },
  jungle: { line: [0.7, 0.74, 0.76], band: [0.88, 0.9, 0.9], width: 4 },
  badlands: { line: [0.7, 0.7, 0.72], band: [0.87, 0.86, 0.86], width: 5 },
  wasteland: { line: [0.74, 0.74, 0.76], band: [0.9, 0.9, 0.9], width: 4 },
  snow: { line: [0.8, 0.84, 0.92], band: [0.93, 0.95, 0.98], width: 5 },
  volcanic: { line: [0.7, 0.68, 0.7], band: [0.88, 0.87, 0.88], width: 3 },
  sand: { line: [0.82, 0.78, 0.74], band: [0.95, 0.93, 0.9], width: 5 },
  frosting: { line: [0.86, 0.78, 0.82], band: [0.95, 0.92, 0.94], width: 4 },
  swamp: { line: [0.7, 0.72, 0.7], band: [0.88, 0.89, 0.86], width: 4 },
};

/** Rim codes packed above the rank by {@link groundEdgeAt}. */
export const RIM_NONE = 0;
export const RIM_LINE = 1;
export const RIM_BAND = 2;

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
 * The ground at world pixel (wx, wy) of a cell whose 3 x 3 neighbourhood
 * holds the land ranks `ranks` (ascending, distinct), and the rim it shows:
 * `rank | rim << 4` (RIM_NONE, RIM_LINE or RIM_BAND).
 *
 * The border runs along the 0.5 contour (plus a slow meander,
 * `borderLevel`) of the smooth field of "ground of this rank or higher"
 * (`cellField`), so it rounds the corners of the cell staircase. Bead
 * bzc.138 replaced the Pulp Wars spill (a strip of summed sines in 2 px
 * blocks) with the mask cut of the bzc.127 lab: the higher ground reaches
 * EDGE.base px past that contour plus EDGE.amp times the baked brush
 * (`mask`), per pixel, in hard steps; the lower ground under the cut gets a
 * 1 px dark line and a dithered rim band of its own colour (RIM).
 */
export function groundEdgeAt(
  atLeast: readonly ArrayLike<number>[],
  width: number,
  height: number,
  ranks: readonly number[],
  wx: number,
  wy: number,
  mask?: EdgeMask,
): number {
  const px = wx + 0.5;
  const py = wy + 0.5;
  let depth = Infinity;
  for (let k = ranks.length - 1; k >= 1; k -= 1) {
    const rank = ranks[k] ?? 0;
    const values = atLeast[rank];
    if (values === undefined) continue;
    const field = cellField(values, width, height, px, py);
    const inside =
      (field.f - borderLevel(px, py, rank)) /
      Math.max(1e-4, Math.sqrt(field.gx * field.gx + field.gy * field.gy));
    const d = inside + EDGE.base + EDGE.amp * edgeValue(mask, wx, wy, rank);
    if (d > 0) return rank | (rimCode(depth, rank, wx, wy) << 4);
    if (depth === Infinity && d > -EDGE.band) depth = -d;
  }
  const low = ranks[0] ?? 0;
  return low | (rimCode(depth, low, wx, wy) << 4);
}

function rimCode(depth: number, rank: number, wx: number, wy: number): number {
  if (depth === Infinity) return RIM_NONE;
  if (depth < EDGE.line) return RIM_LINE;
  const rim = RIM[GROUND_RANK[rank] ?? "grass"];
  return depth + bayer(wx, wy) * 2 < rim.width ? RIM_BAND : RIM_NONE;
}

/** The ground rank alone at world pixel (wx, wy): see {@link groundEdgeAt}. */
export function groundRankAt(
  atLeast: readonly ArrayLike<number>[],
  width: number,
  height: number,
  ranks: readonly number[],
  wx: number,
  wy: number,
  mask?: EdgeMask,
): number {
  return groundEdgeAt(atLeast, width, height, ranks, wx, wy, mask) & 15;
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

/**
 * Whether world pixel (wx, wy) is open water at least `margin` px from the
 * shore as paintGround draws it (no sand, wet edge, surf or foam), for the
 * water's glints (bead bzc.83).
 */
export function openWaterAt(
  layout: GroundLayout,
  wx: number,
  wy: number,
  margin: number,
): boolean {
  const cx = Math.floor(wx / CELL);
  const cy = Math.floor(wy / CELL);
  if (cx < 0 || cy < 0 || cx >= layout.width || cy >= layout.height)
    return false;
  const i = cy * layout.width + cx;
  if (layout.kind[i] !== WATER) return false;
  if ((layout.coast[i] ?? 0) === 0) return true;
  const field = cellField(
    layout.land,
    layout.width,
    layout.height,
    wx + 0.5,
    wy + 0.5,
  );
  const t = coastThreshold(wx + 0.5, wy + 0.5);
  if (field.f > t) return false;
  return (
    (t - field.f) / Math.max(1e-4, Math.hypot(field.gx, field.gy)) > margin
  );
}

/** The forest shade: a dark tone of each ground (alpha from canopy.ts). */
const FOREST_SHADE: Readonly<
  Record<GroundTerrain, readonly [number, number, number]>
> = {
  grass: [22, 58, 38],
  jungle: [14, 46, 34],
  steppe: [74, 60, 22],
  badlands: [72, 32, 20],
  wasteland: [34, 30, 28],
  volcanic: [26, 20, 20],
  snow: [60, 78, 96],
  sand: [120, 88, 44],
  frosting: [150, 70, 110],
  swamp: [24, 36, 20],
};

/**
 * The colour drift (bead bzc.138, the bzc.127 lab's experiment A at 0.6):
 * the drift field (ground-noise.ts driftField, two scales of about six and
 * one and a half cells) cut into three palettes, darker and cooler, the
 * texture's own, lighter and warmer, with an ordered-dither edge. RGB
 * multipliers per ground; `dither` is the Bayer threshold's weight.
 */
export const DRIFT = {
  low: 0.44,
  high: 0.56,
  dither: 0.03,
} as const;

const DRIFT_TINT: Readonly<
  Record<
    GroundTerrain,
    {
      readonly low: readonly [number, number, number];
      readonly high: readonly [number, number, number];
    }
  >
> = {
  grass: { low: [0.94, 0.97, 1.0], high: [1.03, 1.03, 0.94] },
  steppe: { low: [0.95, 0.96, 0.96], high: [1.03, 1.02, 0.96] },
  jungle: { low: [0.94, 0.96, 1.0], high: [1.03, 1.03, 0.95] },
  badlands: { low: [0.94, 0.93, 0.94], high: [1.04, 1.02, 0.95] },
  wasteland: { low: [0.96, 0.96, 0.97], high: [1.03, 1.02, 1.01] },
  snow: { low: [0.97, 0.98, 1.0], high: [1.01, 1.01, 1.0] },
  volcanic: { low: [0.95, 0.95, 0.97], high: [1.04, 1.03, 1.03] },
  sand: { low: [0.97, 0.96, 0.94], high: [1.02, 1.02, 1.03] },
  frosting: { low: [0.98, 0.97, 0.98], high: [1.01, 1.01, 1.01] },
  swamp: { low: [0.95, 0.96, 0.95], high: [1.04, 1.04, 1.0] },
};

/**
 * Trodden earth under a site (bead bzc.138, the lab's patches, Heroes III):
 * an ellipse round the site's foot, its edge frayed by the brush, in which
 * the ground's own texture is mixed `mix` of the way toward a packed-earth
 * colour of that ground, so the patch keeps the ground's grain.
 */
const PATCH: Readonly<
  Record<
    GroundTerrain,
    { readonly earth: readonly [number, number, number]; readonly mix: number }
  >
> = {
  grass: { earth: [176, 156, 108], mix: 0.5 },
  steppe: { earth: [196, 172, 124], mix: 0.45 },
  jungle: { earth: [146, 128, 90], mix: 0.5 },
  badlands: { earth: [170, 120, 88], mix: 0.4 },
  wasteland: { earth: [134, 124, 114], mix: 0.4 },
  snow: { earth: [198, 202, 210], mix: 0.4 },
  volcanic: { earth: [104, 94, 92], mix: 0.4 },
  sand: { earth: [206, 176, 124], mix: 0.4 },
  frosting: { earth: [228, 190, 176], mix: 0.4 },
  swamp: { earth: [108, 94, 66], mix: 0.5 },
};

/** A trodden patch: an ellipse (world px) and the cells it may reach. */
export interface GroundPatch {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/** The object kinds that stand in a trodden patch: the buildings. */
const PATCH_KINDS: ReadonlySet<MapObject["kind"]> = new Set([
  "town",
  "mine",
  "dwelling",
  "site",
  "bank",
  "teleport",
]);

/**
 * The trodden patches under the map's buildings (`objects`: the map's
 * objects as made, terrain-plan.ts terrainObjects, so a patch never moves
 * in a game): centred on the footprint a little above its bottom edge,
 * about half again as wide as it is deep.
 */
export function groundPatches(
  objects: readonly MapObject[],
): readonly GroundPatch[] {
  const out: GroundPatch[] = [];
  for (const obj of objects) {
    if (!PATCH_KINDS.has(obj.kind)) continue;
    const b = objectBounds(obj);
    out.push({
      cx: (b.x + b.w / 2) * CELL,
      cy: (b.y + b.h) * CELL - 0.32 * b.h * CELL,
      rx: 0.42 * b.w * CELL + 6,
      ry: 0.24 * b.h * CELL + 6,
    });
  }
  return out;
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
  /** The forest canopy's facts (canopy.ts), for the tint under the trees. */
  readonly canopy?: CanopyField;
  /** Trodden patches under the buildings (bead bzc.138). */
  readonly patches: readonly GroundPatch[];
  /** Per cell, the indices into `patches` that may reach it. */
  readonly patchCells: readonly (readonly number[])[];
}

/**
 * Builds the layout. `roadEnds` are extra road nodes (object entrances next
 * to a road) where a road ends; `objects` are the objects whose buildings
 * stand in trodden patches (the map's objects as made).
 */
export function buildGroundLayout(
  map: GameMap,
  roadEnds: readonly (readonly [number, number])[] = [],
  featured: ReadonlySet<number> = new Set(),
  objects: readonly MapObject[] = [],
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
  const patches = groundPatches(objects);
  const patchCells: number[][] = Array.from({ length: n }, () => []);
  patches.forEach((p, k) => {
    // The frayed edge reaches 1 + range * patchFray radii at most.
    const s = 1 + EDGE.range * EDGE.patchFray;
    const xa = Math.max(0, Math.floor((p.cx - p.rx * s) / CELL));
    const xb = Math.min(width - 1, Math.floor((p.cx + p.rx * s) / CELL));
    const ya = Math.max(0, Math.floor((p.cy - p.ry * s) / CELL));
    const yb = Math.min(height - 1, Math.floor((p.cy + p.ry * s) / CELL));
    for (let y = ya; y <= yb; y += 1)
      for (let x = xa; x <= xb; x += 1) patchCells[y * width + x]?.push(k);
  });
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
    canopy: buildCanopyField(map, featured),
    patches,
    patchCells,
  };
}

const modulo = (value: number, by: number): number => ((value % by) + by) % by;

/**
 * Paints the ground of world rectangle (x0, y0, w, h) (master pixels) into
 * `out` (RGBA, w x h). Pixels outside the map are left transparent. With
 * `hot` (w x h), each pixel that shows a glowing crack of an overlay gets
 * its pulse group (1...), the others 0 (bead bzc.83).
 */
export function paintGround(
  layout: GroundLayout,
  sources: GroundSources,
  x0: number,
  y0: number,
  w: number,
  h: number,
  out: Uint8ClampedArray,
  hot?: Uint8Array,
): void {
  const textures = GROUND_RANK.map((terrain) => sources.textures[terrain]);
  const overlays = GROUND_RANK.map((terrain) => sources.overlays?.[terrain]);
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
  const tint = (o: number, k: readonly number[]): void => {
    out[o] = (out[o] ?? 0) * (k[0] ?? 1);
    out[o + 1] = (out[o + 1] ?? 0) * (k[1] ?? 1);
    out[o + 2] = (out[o + 2] ?? 0) * (k[2] ?? 1);
  };
  // The drift field, sampled on a world-aligned grid (ground-noise.ts).
  const drift = driftGrid(x0, y0, w, h);
  let patchList: readonly number[] = [];
  const inPatch = (wx: number, wy: number): boolean => {
    for (const k of patchList) {
      const p = layout.patches[k];
      if (p === undefined) continue;
      const dx = (wx + 0.5 - p.cx) / p.rx;
      const dy = (wy + 0.5 - p.cy) / p.ry;
      const reach =
        1 +
        EDGE.patchFray * edgeValue(sources.edge, wx, wy, GROUND_RANK.length);
      if (dx * dx + dy * dy < reach * reach) return true;
    }
    return false;
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
      const wooded = layout.canopy?.near[i] === 1;
      const ranks = layout.ranks[i] ?? [];
      const links = layout.roads[i] ?? [];
      patchList = layout.patchCells[i] ?? [];
      const water = kind === WATER;
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
            // water cell's corner the shore takes) the mask cut.
            const code =
              ranks.length > 1
                ? groundEdgeAt(
                    layout.atLeast,
                    layout.width,
                    layout.height,
                    ranks,
                    wx,
                    wy,
                    sources.edge,
                  )
                : water
                  ? (ranks[0] ?? 0)
                  : kind;
            const rank = code & 15;
            const ground = GROUND_RANK[rank] ?? "grass";
            let lit = true;
            if (patchList.length > 0 && inPatch(wx, wy)) {
              // Trodden earth under a building.
              const tex = textures[rank];
              if (tex !== undefined) sample(o, tex, wx, wy);
              blend(o, PATCH[ground].earth, PATCH[ground].mix);
            } else {
              const tex = textures[rank];
              if (tex !== undefined) sample(o, tex, wx, wy);
              const over = overlays[rank];
              if (over !== undefined) {
                const img = over.image;
                const s =
                  modulo(wy, img.height) * img.width + modulo(wx, img.width);
                if ((img.data[s * 4 + 3] ?? 0) > 0) {
                  out[o] = img.data[s * 4] ?? 0;
                  out[o + 1] = img.data[s * 4 + 1] ?? 0;
                  out[o + 2] = img.data[s * 4 + 2] ?? 0;
                  if (hot !== undefined) hot[o >> 2] = over.hot[s] ?? 0;
                  lit = false;
                }
              }
            }
            const rim = code >> 4;
            if (rim !== RIM_NONE) {
              const r = RIM[ground];
              tint(o, rim === RIM_LINE ? r.line : r.band);
            }
            if (lit) {
              // The colour drift: three palettes with a dithered edge.
              const v = driftAt(drift, wx, wy) + bayer(wx, wy) * DRIFT.dither;
              if (v < DRIFT.low) tint(o, DRIFT_TINT[ground].low);
              else if (v > DRIFT.high) tint(o, DRIFT_TINT[ground].high);
            }
            if (coastBits !== 0) {
              const k = coastAt(true, shore, wx + 0.5, wy + 0.5);
              if (k !== "none" && hot !== undefined) hot[o >> 2] = 0;
              if (k === "sand") put(o, COAST.sand);
              else if (k === "wet") put(o, COAST.wet);
              else if (k === "lip") put(o, COAST.lip);
            }
            // Under the canopy (bead xaj.26): a dark tone that follows the
            // wood's wobbled outline, not the cells.
            if (wooded && shade !== undefined && layout.canopy !== undefined) {
              const alpha = canopyTint(layout.canopy, wx, wy);
              if (alpha > 0) blend(o, shade, alpha);
            }
          }
          if (links.length > 0) {
            const r = roadPixelAt(links, wx, wy);
            if (r !== ROAD_PIXEL.CLEAR) {
              put(o, ROAD_COLOURS[r] ?? [0, 0, 0]);
              if (hot !== undefined) hot[o >> 2] = 0;
            }
          }
        }
    }
}
