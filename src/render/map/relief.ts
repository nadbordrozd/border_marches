/**
 * Low-relief mountains (bead border_marches-xaj.25, map look iteration 9a).
 *
 * The user's target is a Heroes of Might and Magic II adventure map: a
 * mountain range is ONE continuous, low, rolling mass with drapery-like
 * folds that fades into the ground round it, with no separate sprites, no
 * gaps and no readable cell grid, and low enough that a unit standing behind
 * it stays mostly visible. So a range is not packed from sprites any more;
 * every connected group of Mountain cells is painted as a HEIGHTFIELD seen
 * in the map's three-quarter view:
 *
 * 1. Outline: a contour of the region's cell field (1 on a Mountain cell,
 *    0 on open ground, `FORBIDDEN_VALUE` on a road, object or water cell)
 *    blurred by a Gaussian (convex corners round, concave ones fill), its
 *    threshold swelling with noise and waves read at world pixels, so the
 *    outline leaves the cells by at most `outward` px, bites up to about
 *    half a cell in, never runs straight along a row of cells, and pulls
 *    back from roads, objects and water.
 * 2. Height: the distance to that outline (an exact Euclidean distance
 *    transform over the chunk plus a margin, clamped at `dmax`, so chunks
 *    agree) raised to a dome `amp * (1 - exp(-d / reach))`, plus a ridged
 *    SUMMIT network inside wide ranges (the big forms), plus FOLDS: ridged
 *    noise stretched along the downhill direction (the gradient of that
 *    macro height; north-south where it is flat), so crests and gullies run down the slopes like the
 *    drapery of the reference. Badlands are terraced (flat tops, risers).
 * 3. Height cap: a point `dNorth` px south of the outline (in its pixel
 *    column) rises at most `dNorth + rise` px. The outline is at most
 *    `outward` px north of the region's northern cells, so nothing is drawn
 *    more than `outward + rise` = 32 px above them.
 * 4. Projection: each 2 px column is marched from the front (south) to the
 *    back; a ground point (x, y) of height h shows at (x, y - h), the nearer
 *    point wins, a steep step leaves a vertical face. Where a near crest
 *    hides ground far behind it, its top pixel is drawn in the crease tone
 *    (the outline of the pixel-art style).
 * 5. Shading: the sun at the bottom left (south-west), Lambert on the
 *    heightfield normal, quantised to cel bands of a per-terrain palette
 *    ramp, the band edges broken by world-sampled grain and an ordered
 *    dither; badlands risers carry strata stripes by height.
 * 6. Foot: the outer `feather` px are an ordered dither (the ground shows
 *    through more and more toward the outline) whose tones lean to the
 *    ground's own colour, so a range rises out of its ground without a cut.
 *
 * Everything is a pure function of the map and world pixels, painted per
 * chunk in 2 px blocks: chunks continue each other exactly, nothing is
 * mirrored and nothing repeats per cell. The fog is unchanged: the relief
 * is built from the whole map and the fog is drawn over it.
 */
import { CELL_PX } from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
import type { GameMap } from "../../core/map/types";
import { hash4 } from "./hash";

const CELL = CELL_PX;

export const RELIEF = {
  /** Side of a relief pixel, world px (the rubble and scree use 2 px too). */
  block: 2,
  /** Most px the outline leaves the region's cells. */
  outward: 15,
  /** Most px a point rises above the outline north of it (cap - outward). */
  rise: 17,
  /** The cap the tests enforce: rise + outward. */
  cap: 32,
  /** Highest point of any relief (window margin), px. */
  hmax: 60,
  /** Distance-transform clamp, px (window margin). */
  dmax: 96,
  /** Half-width (blocks) of the slope estimate that orients the folds. */
  slopeReach: 3,
  /** Width of the dithered foot, px. */
  feather: 12,
  /** Width over which the foot's tones lean to the ground, px. */
  footBlend: 16,
  /** A near point hiding this many px of ground behind it is outlined. */
  outlineGap: 32,
  /** ... and only a crest at least this high (px): no line along a low rim. */
  outlineMinHeight: 14,
  /** Share of the light lost on north-facing slopes (they show as a thin
   * band along a rim; at full darkness it reads as an outline). */
  northShade: 0.2,
  /** Most px the foot reaches off the region cells (fillets, notches). */
  reach: 24,
  /** Gaussian blur (px) of the cell field the outline is cut from. */
  blur: 40,
  /**
   * The outline threshold (0.5 = the cell edge on a straight run): a slow
   * swell that bites up to about half a cell in, plus finer lumps. On a
   * straight edge t = 0.36 lies 14 px outside the cells, t = 0.86 43 px in.
   */
  bite: {
    mid: 0.6,
    low: 0.24,
    lowScale: 170,
    medium: 0.1,
    mediumScale: 60,
    waves: 0.06,
    fine: 0.035,
    fineScale: 14,
    min: 0.36,
    max: 0.86,
  },
  /** Warp (px) of the point a block reads its terrains at. */
  seamWarp: 26,
  /** Light toward the sun (south-west, above). */
  sun: [-0.62, 0.5, 0.6],
  /** Cel bands per unit of (n.L - flat n.L). */
  shadeGain: 6.5,
  /** Lighter with height: bands per unit of h / liftScale. */
  heightLift: 1.2,
  /** Height (px) the lift is measured in. */
  liftScale: 30,
  /** Gullies darker, crests lighter: bands per unit of fold value. */
  valley: 1.8,
  /** Grain (world-sampled noise) and ordered-dither amplitudes, in bands. */
  grain: 0.35,
  dither: 0.5,
} as const;

/** The cell-field value of a road, object or water cell (pulls back). */
export const FORBIDDEN_VALUE = -0.6;

/** Terrains in palette order. */
export const RELIEF_TERRAINS: readonly GroundTerrain[] = [
  "grass",
  "jungle",
  "steppe",
  "badlands",
  "wasteland",
];

export interface ReliefLook {
  /** Dome height, px. */
  readonly amp: number;
  /** Dome reach (d at which the dome reaches 63%), px. */
  readonly reach: number;
  /** Height of the summit network inside wide ranges, px. */
  readonly summit: number;
  /** Fold height, px, and fold widths across and along the slope, px. */
  readonly fold: number;
  readonly across: number;
  readonly along: number;
  /** Terrace step, px (0: no terraces). */
  readonly terrace: number;
  /** Share of the world-sampled grain (quiet mesa tops: less). */
  readonly grain: number;
  /**
   * Palette ramp, dark to light: crease, deep shadow, shadow, mid, lit,
   * highlight.
   */
  readonly ramp: readonly (readonly [number, number, number])[];
}

/** Per terrain (RELIEF_TERRAINS order). */
export const RELIEF_LOOKS: readonly ReliefLook[] = [
  {
    // grass: green rolling ridges like the reference.
    amp: 22,
    reach: 44,
    summit: 36,
    fold: 8,
    across: 50,
    along: 110,
    terrace: 0,
    grain: 1,
    ramp: [
      [14, 40, 22],
      [28, 66, 32],
      [44, 96, 40],
      [68, 128, 48],
      [102, 162, 58],
      [146, 194, 80],
    ],
  },
  {
    // jungle: steeper, deeper teal green.
    amp: 28,
    reach: 32,
    summit: 34,
    fold: 10,
    across: 34,
    along: 90,
    terrace: 0,
    grain: 1,
    ramp: [
      [8, 34, 30],
      [16, 56, 44],
      [26, 82, 56],
      [42, 110, 66],
      [72, 146, 78],
      [118, 182, 100],
    ],
  },
  {
    // steppe: tan and brown ridges.
    amp: 20,
    reach: 44,
    summit: 40,
    fold: 7,
    across: 54,
    along: 110,
    terrace: 0,
    grain: 1,
    ramp: [
      [56, 34, 20],
      [88, 56, 32],
      [122, 84, 48],
      [158, 116, 68],
      [194, 152, 92],
      [226, 192, 130],
    ],
  },
  {
    // badlands: banded sandstone mesas, terraced.
    amp: 46,
    reach: 30,
    summit: 12,
    fold: 3,
    across: 40,
    along: 110,
    terrace: 22,
    grain: 0.35,
    ramp: [
      [84, 36, 24],
      [120, 58, 36],
      [158, 86, 50],
      [196, 122, 72],
      [224, 160, 102],
      [244, 204, 150],
    ],
  },
  {
    // wasteland: dark basalt, sharper folds.
    amp: 24,
    reach: 38,
    summit: 36,
    fold: 8,
    across: 26,
    along: 90,
    terrace: 0,
    grain: 1,
    ramp: [
      [18, 17, 24],
      [38, 36, 46],
      [56, 54, 66],
      [78, 76, 88],
      [106, 102, 110],
      [142, 136, 138],
    ],
  },
];

/** The relief model of one map: per-cell facts, built once. */
export interface Relief {
  readonly width: number;
  readonly height: number;
  /** 1 on a Mountain cell drawn as relief. */
  readonly region: Uint8Array;
  /** 1 on a road, object or water cell: the foot never reaches it. */
  readonly forbidden: Uint8Array;
  /** The outline field's cell values (1 region, 0 open, FORBIDDEN_VALUE). */
  readonly field: Float32Array;
  /** 1 when a region cell lies on the cell or one of its 8 neighbours. */
  readonly near: Uint8Array;
  /** RELIEF_TERRAINS index of each cell's ground. */
  readonly terrain: Uint8Array;
  /** Mean colour of each terrain's ground texture (foot blend), or null. */
  readonly grounds: readonly (readonly number[])[] | null;
  /**
   * Region cells whose north neighbour is not region: the paint they raise
   * over that cell is drawn again in the foreground (over a unit's feet).
   */
  readonly lips: readonly (readonly [number, number])[];
}

/**
 * Builds the relief of a map. `featured` are object cells (row-major), which
 * are never relief and which the foot avoids, like roads and water.
 * `grounds` maps a terrain to the mean colour of its ground texture.
 */
export function buildRelief(
  map: GameMap,
  featured: ReadonlySet<number>,
  grounds?: Partial<Record<GroundTerrain, readonly number[]>>,
): Relief {
  const { width, height } = map;
  const n = width * height;
  const region = new Uint8Array(n);
  const forbidden = new Uint8Array(n);
  const field = new Float32Array(n);
  const terrain = new Uint8Array(n);
  map.cells.forEach((cell, i) => {
    const t = RELIEF_TERRAINS.indexOf(cell.terrain as GroundTerrain);
    terrain[i] = t < 0 ? 0 : t;
    if (cell.obstacle === "mountain" && !featured.has(i)) region[i] = 1;
    else if (cell.road || featured.has(i) || cell.terrain === "water")
      forbidden[i] = 1;
    field[i] = region[i] === 1 ? 1 : forbidden[i] === 1 ? FORBIDDEN_VALUE : 0;
  });
  const near = new Uint8Array(n);
  const lips: [number, number][] = [];
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (region[i] !== 1) continue;
      if (y > 0 && region[i - width] !== 1) lips.push([x, y]);
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < width && yy < height)
            near[yy * width + xx] = 1;
        }
    }
  return {
    width,
    height,
    region,
    forbidden,
    field,
    near,
    terrain,
    grounds:
      grounds === undefined
        ? null
        : RELIEF_TERRAINS.map((t) => grounds[t] ?? [128, 128, 128]),
    lips,
  };
}

// ------------------------------------------------------------------ noise

const GX = [1, 0.7071, 0, -0.7071, -1, -0.7071, 0, 0.7071];
const GY = [0, 0.7071, 1, 0.7071, 0, -0.7071, -1, -0.7071];

/** 2D gradient noise in about -1..1, a pure function of (x, y, salt). */
export function noise2(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const h00 = hash4(ix, iy, salt, 0x3c) & 7;
  const h10 = hash4(ix + 1, iy, salt, 0x3c) & 7;
  const h01 = hash4(ix, iy + 1, salt, 0x3c) & 7;
  const h11 = hash4(ix + 1, iy + 1, salt, 0x3c) & 7;
  const n00 = (GX[h00] ?? 0) * fx + (GY[h00] ?? 0) * fy;
  const n10 = (GX[h10] ?? 0) * (fx - 1) + (GY[h10] ?? 0) * fy;
  const n01 = (GX[h01] ?? 0) * fx + (GY[h01] ?? 0) * (fy - 1);
  const n11 = (GX[h11] ?? 0) * (fx - 1) + (GY[h11] ?? 0) * (fy - 1);
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const top = n00 + (n10 - n00) * u;
  const bottom = n01 + (n11 - n01) * u;
  return (top + (bottom - top) * v) * 1.42;
}

/** Normal CDF (Abramowitz-Stegun 7.1.26 erf). */
function phi(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Reach (px) of the cell kernel: 2 cells each side. */
const KERNEL_REACH = 2 * CELL + CELL / 2;

/**
 * A cell's box blurred by a Gaussian of RELIEF.blur px, along one axis, at
 * offset d (px) from the cell centre: a table over whole px.
 */
const KERNEL: Float64Array = (() => {
  const table = new Float64Array(2 * KERNEL_REACH + 1);
  for (let d = -KERNEL_REACH; d <= KERNEL_REACH; d += 1)
    table[d + KERNEL_REACH] =
      phi((d + CELL / 2) / RELIEF.blur) - phi((d - CELL / 2) / RELIEF.blur);
  return table;
})();

/** The outline threshold at world pixel (wx, wy). */
function threshold(wx: number, wy: number): number {
  const b = RELIEF.bite;
  const low = Math.max(
    -1,
    Math.min(1, 1.8 * noise2(wx / b.lowScale, wy / b.lowScale, 0x51)),
  );
  const t =
    b.mid +
    b.low * low +
    b.medium * noise2(wx / b.mediumScale, wy / b.mediumScale, 0x52) +
    b.fine * noise2(wx / b.fineScale, wy / b.fineScale, 0x53) +
    // Waves over world pixels (periods along a row: 83, 374, 113 px; along
    // a column: 277, 131, 113 px) never go flat along a straight run.
    b.waves *
      (Math.sin((2 * Math.PI * (wx + 0.3 * wy)) / 83 + 0.4) +
        Math.sin((2 * Math.PI * (wy + 0.35 * wx)) / 131 + 1.9) +
        Math.sin((2 * Math.PI * (wx - wy)) / 113 + 3.1));
  return Math.max(b.min, Math.min(b.max, t));
}

/**
 * The cell field (1 region, 0 open, FORBIDDEN_VALUE) blurred by a Gaussian
 * at world pixel (wx, wy): 0.5 on a straight region edge, lower at a convex
 * corner (rounded) and higher at a concave one (filled).
 */
function fieldAt(relief: Relief, wx: number, wy: number): number {
  const { width, height, field } = relief;
  const cx = Math.floor(wx / CELL);
  const cy = Math.floor(wy / CELL);
  let sum = 0;
  for (let j = cy - 2; j <= cy + 2; j += 1) {
    const dy = Math.round(wy - (j * CELL + CELL / 2));
    const ky = KERNEL[dy + KERNEL_REACH] ?? 0;
    if (ky < 1e-4) continue;
    const row = Math.min(height - 1, Math.max(0, j)) * width;
    for (let i = cx - 2; i <= cx + 2; i += 1) {
      const v = field[row + Math.min(width - 1, Math.max(0, i))] ?? 0;
      if (v === 0) continue;
      const dx = Math.round(wx - (i * CELL + CELL / 2));
      sum += v * ky * (KERNEL[dx + KERNEL_REACH] ?? 0);
    }
  }
  return sum;
}

/**
 * The relief's footprint at world pixel (wx, wy): positive inside the
 * wobbled outline (the ground the mass stands on), else 0 or negative.
 * Never positive on a forbidden cell or off the map.
 */
export function reliefInside(relief: Relief, wx: number, wy: number): number {
  const cx = Math.floor(wx / CELL);
  const cy = Math.floor(wy / CELL);
  if (cx < 0 || cy < 0 || cx >= relief.width || cy >= relief.height) return -1;
  const i = cy * relief.width + cx;
  if (relief.forbidden[i] === 1 || relief.near[i] !== 1) return -1;
  const inside = fieldAt(relief, wx, wy) - threshold(wx, wy);
  if (relief.region[i] === 1) return inside;
  // Off the region: within `reach` px of a region cell (a filled concave
  // corner or notch stays a fillet, so a passable cell stays readable).
  let nearest = Infinity;
  for (let dy = -1; dy <= 1; dy += 1)
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= relief.width || y >= relief.height) continue;
      if (relief.region[y * relief.width + x] !== 1) continue;
      const ex = Math.max(x * CELL - wx, 0, wx - (x + 1) * CELL);
      const ey = Math.max(y * CELL - wy, 0, wy - (y + 1) * CELL);
      nearest = Math.min(nearest, Math.hypot(ex, ey));
    }
  return Math.min(inside, (RELIEF.reach - nearest) / 100);
}

// -------------------------------------------------------- distance field

const INF = 1e20;

/** Felzenszwalb's 1D squared distance transform of f (length n) into d. */
function edt1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q += 1) {
    let s: number;
    for (;;) {
      const p = v[k] ?? 0;
      s = ((f[q] ?? 0) + q * q - ((f[p] ?? 0) + p * p)) / (2 * q - 2 * p);
      if (s <= (z[k] ?? 0) && k > 0) k -= 1;
      else break;
    }
    if (s <= (z[k] ?? 0)) {
      // k === 0 and the new parabola is lower everywhere.
      v[0] = q;
      z[0] = -INF;
      z[1] = INF;
      k = 0;
      continue;
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while ((z[k + 1] ?? INF) < q) k += 1;
    const p = v[k] ?? 0;
    d[q] = (q - p) * (q - p) + (f[p] ?? 0);
  }
}

/** Squared Euclidean distance (blocks) of every inside block to outside. */
function distanceTransform(
  inside: Uint8Array,
  w: number,
  h: number,
): Float64Array {
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i += 1) grid[i] = inside[i] === 1 ? INF : 0;
  const len = Math.max(w, h);
  const f = new Float64Array(len);
  const d = new Float64Array(len);
  const v = new Int32Array(len);
  const z = new Float64Array(len + 1);
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) f[y] = grid[y * w + x] ?? 0;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y += 1) grid[y * w + x] = d[y] ?? 0;
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) f[x] = grid[y * w + x] ?? 0;
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x += 1) grid[y * w + x] = d[x] ?? 0;
  }
  return grid;
}

// ------------------------------------------------------------- painting

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold of block (bx, by) in [0, 1). */
const bayer = (bx: number, by: number): number =>
  ((BAYER4[(by & 3) * 4 + (bx & 3)] ?? 0) + 0.5) / 16;

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Fold orientations (radians): folds run along the downhill direction. */
const FOLD_ANGLES = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];

/** Ridged fold noise along orientation k at world pixel (wx, wy), 0..1. */
function foldAt(
  k: number,
  wx: number,
  wy: number,
  across: number,
  along: number,
): number {
  const a = FOLD_ANGLES[k] ?? 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const u = (wx * c + wy * s) / along;
  const v = (-wx * s + wy * c) / across;
  const n = noise2(u, v, 0x61 + k);
  const r = 1 - Math.abs(n);
  return r * r;
}

/**
 * Paints the relief over world rectangle (x0, y0, w, h) into `out` (RGBA,
 * w x h, every written pixel opaque; others untouched). Returns whether any
 * pixel was written.
 */
export function paintRelief(
  relief: Relief,
  x0: number,
  y0: number,
  w: number,
  h: number,
  out: Uint8ClampedArray,
): boolean {
  const B = RELIEF.block;
  const margin = RELIEF.dmax + 3 * B;
  const bx0 = Math.floor((x0 - margin) / B);
  const by0 = Math.floor((y0 - margin) / B);
  const bx1 = Math.ceil((x0 + w + margin) / B);
  const by1 = Math.ceil((y0 + h + RELIEF.hmax + margin) / B);
  const W = bx1 - bx0;
  const H = by1 - by0;
  // Any region cell near the window at all?
  {
    const cx0 = Math.max(0, Math.floor((bx0 * B) / CELL));
    const cy0 = Math.max(0, Math.floor((by0 * B) / CELL));
    const cx1 = Math.min(relief.width - 1, Math.floor((bx1 * B) / CELL));
    const cy1 = Math.min(relief.height - 1, Math.floor((by1 * B) / CELL));
    let any = false;
    for (let cy = cy0; cy <= cy1 && !any; cy += 1)
      for (let cx = cx0; cx <= cx1 && !any; cx += 1)
        if (relief.region[cy * relief.width + cx] === 1) any = true;
    if (!any) return false;
  }
  const inside = new Uint8Array(W * H);
  let anyInside = false;
  for (let j = 0; j < H; j += 1) {
    const wy = (by0 + j) * B + B / 2;
    for (let i = 0; i < W; i += 1) {
      const wx = (bx0 + i) * B + B / 2;
      if (reliefInside(relief, wx, wy) > 0) {
        inside[j * W + i] = 1;
        anyInside = true;
      }
    }
  }
  if (!anyInside) return false;
  const d2 = distanceTransform(inside, W, H);
  const dist = new Float32Array(W * H);
  for (let k = 0; k < W * H; k += 1)
    dist[k] = Math.min(RELIEF.dmax, Math.sqrt(d2[k] ?? 0) * B);
  // Distance (px) to the outline north of each block, in its column.
  const north = new Float32Array(W * H);
  for (let i = 0; i < W; i += 1) {
    let last = -INF;
    for (let j = 0; j < H; j += 1) {
      if (inside[j * W + i] !== 1) last = j;
      north[j * W + i] = last === -INF ? INF : (j - last) * B - B / 2;
    }
  }
  // Heights over the needed area (+1 block for normals).
  const nx0 = Math.floor(x0 / B) - bx0 - 1;
  const nx1 = Math.ceil((x0 + w) / B) - bx0 + 1;
  const ny0 = Math.floor(y0 / B) - by0 - 1;
  const ny1 = Math.ceil((y0 + h + RELIEF.hmax) / B) - by0 + 1;
  const heights = new Float32Array(W * H);
  // The fold value (0 gully .. 1 crest) times its strength, for the shading.
  const ridge = new Float32Array(W * H);
  const macro = new Float32Array(W * H);
  // The summit network alone (-0.4 .. 0.6), which leads the shading.
  const crest = new Float32Array(W * H);
  const look = new Float32Array(W * H * RELIEF_TERRAINS.length);
  const T = RELIEF_TERRAINS.length;
  const weights = new Float64Array(T);
  // Pass 1: terrain weights and the MACRO height (dome, swell, summits),
  // over the needed area plus the reach of the slope estimate.
  const S = RELIEF.slopeReach;
  for (let j = ny0 - S; j <= ny1 + S; j += 1)
    for (let i = nx0 - S; i <= nx1 + S; i += 1) {
      const k = j * W + i;
      if (inside[k] !== 1) continue;
      const wx = (bx0 + i) * B + B / 2;
      const wy = (by0 + j) * B + B / 2;
      // Read at a warped point, so a seam between terrains meanders like
      // the zone borders on the ground instead of following a cell edge.
      terrainWeights(
        relief,
        wx + RELIEF.seamWarp * noise2(wx / 61, wy / 61, 0x81),
        wy + RELIEF.seamWarp * noise2(wx / 61, wy / 61, 0x82),
        weights,
      );
      let amp = 0;
      let reach = 0;
      let summit = 0;
      for (let t = 0; t < T; t += 1) {
        const wt = weights[t] ?? 0;
        look[k * T + t] = wt;
        if (wt === 0) continue;
        const l = RELIEF_LOOKS[t] as ReliefLook;
        amp += l.amp * wt;
        reach += l.reach * wt;
        summit += l.summit * wt;
      }
      const d = dist[k] ?? 0;
      // A slow swell along the range: higher and lower stretches.
      const swell = 0.8 + 0.3 * noise2(wx / 230, wy / 230, 0x71);
      // Summits and valleys inside wide ranges: a ridged network.
      const r1 = 1 - Math.abs(noise2(wx / 230, wy / 200, 0x72));
      const r2 = 1 - Math.abs(noise2(wx / 105, wy / 95, 0x73));
      const ridges =
        (0.78 * r1 * r1 + 0.22 * r2 * r2 - 0.4) * smoothstep(6, 60, d);
      crest[k] = ridges;
      macro[k] = amp * swell * (1 - Math.exp(-d / reach)) + summit * ridges;
    }
  // Pass 2: folds along the macro slope, terraces, the cap.
  for (let j = ny0; j <= ny1; j += 1)
    for (let i = nx0; i <= nx1; i += 1) {
      const k = j * W + i;
      if (inside[k] !== 1) continue;
      const wx = (bx0 + i) * B + B / 2;
      const wy = (by0 + j) * B + B / 2;
      let fold = 0;
      let across = 0;
      let along = 0;
      let terrace = 0;
      let terraceShare = 0;
      for (let t = 0; t < T; t += 1) {
        const wt = look[k * T + t] ?? 0;
        if (wt === 0) continue;
        const l = RELIEF_LOOKS[t] as ReliefLook;
        fold += l.fold * wt;
        across += l.across * wt;
        along += l.along * wt;
        if (l.terrace > 0) {
          terrace += l.terrace * wt;
          terraceShare += wt;
        }
      }
      const d = dist[k] ?? 0;
      let z = macro[k] ?? 0;
      // Folds run downhill: along the macro gradient; where the slope is
      // flat they fall toward the viewer (north-south).
      const gx = (macro[k + S] ?? 0) - (macro[k - S] ?? 0);
      const gy = (macro[k + S * W] ?? 0) - (macro[k - S * W] ?? 0);
      const g = Math.hypot(gx, gy);
      const flat = 1 - smoothstep(0.4, 2.5, g);
      let angle = Math.atan2(gy + flat * 3, gx);
      if (angle < 0) angle += Math.PI;
      const pos = (angle / Math.PI) * 4;
      const k0 = Math.floor(pos) % 4;
      const k1 = (k0 + 1) % 4;
      const share = pos - Math.floor(pos);
      const f =
        foldAt(k0, wx, wy, across, along) * (1 - share) +
        foldAt(k1, wx, wy, across, along) * share;
      // Strongest on the flanks; quieter deep inside, where the summits
      // carry the form.
      const strength = smoothstep(3, 34, d) * (1 - 0.4 * smoothstep(50, 96, d));
      z += fold * (f - 0.35) * strength;
      ridge[k] = 0.7 * (crest[k] ?? 0) + 0.3 * (f - 0.4) * strength;
      if (terraceShare > 0) {
        const step = terrace / terraceShare;
        const q = z / step;
        const lvl = Math.floor(q);
        const stepped = step * (lvl + smoothstep(0.8, 0.98, q - lvl));
        z += (stepped - z) * terraceShare;
      }
      z = Math.max(0, z);
      z = Math.min(z, (north[k] ?? 0) + RELIEF.rise, RELIEF.hmax);
      heights[k] = z;
    }
  // March each column front to back.
  const sun = RELIEF.sun;
  const sunLen = Math.hypot(sun[0], sun[1], sun[2]);
  const Lx = sun[0] / sunLen;
  const Ly = sun[1] / sunLen;
  const Lz = sun[2] / sunLen;
  const top = Math.floor(y0 / B);
  const bottom = Math.ceil((y0 + h) / B);
  let wrote = false;
  const colour: [number, number, number] = [0, 0, 0];
  const put = (bx: number, sy: number, c: readonly number[]): void => {
    for (let py = 0; py < B; py += 1) {
      const y = sy * B + py - y0;
      if (y < 0 || y >= h) continue;
      for (let px = 0; px < B; px += 1) {
        const x = bx * B + px - x0;
        if (x < 0 || x >= w) continue;
        const o = (y * w + x) * 4;
        out[o] = c[0] ?? 0;
        out[o + 1] = c[1] ?? 0;
        out[o + 2] = c[2] ?? 0;
        out[o + 3] = 255;
      }
    }
  };
  for (let bx = Math.floor(x0 / B); bx < Math.ceil((x0 + w) / B); bx += 1) {
    const i = bx - bx0;
    let ybuf = bottom;
    let owner = -1; // ground row of the point that set ybuf (relief only)
    let ownerTop = -1;
    let ownerTone: readonly number[] | null = null;
    let ownerZ = 0;
    for (let j = ny1 - 1; j > ny0; j -= 1) {
      const by = by0 + j;
      if (by < top - 1 && ybuf <= top) break;
      const k = j * W + i;
      if (inside[k] !== 1) {
        if (by < ybuf) {
          ybuf = by;
          owner = -1;
        }
        continue;
      }
      const z = heights[k] ?? 0;
      const d = dist[k] ?? 0;
      const ys = by - Math.round(z / B);
      if (ys >= ybuf) continue;
      // The dithered foot.
      if (d < RELIEF.feather && bayer(bx, by) >= d / RELIEF.feather) {
        ybuf = ys;
        owner = -1;
        continue;
      }
      // Outline the near point's top if this point is far behind it.
      if (
        owner >= 0 &&
        ownerTone !== null &&
        (owner - by) * B >= RELIEF.outlineGap &&
        ownerZ >= RELIEF.outlineMinHeight &&
        ownerTop >= top &&
        ownerTop < bottom
      )
        put(bx, ownerTop, ownerTone);
      // Normal and shade.
      const hx = ((heights[k + 1] ?? z) - (heights[k - 1] ?? z)) / (2 * B);
      const hy = ((heights[k + W] ?? z) - (heights[k - W] ?? z)) / (2 * B);
      const len = Math.hypot(hx, hy, 1);
      // North-facing slopes (hy > 0) lose only part of their light.
      const south = hy > 0 ? -hy * RELIEF.northShade : -hy;
      const dot = (-hx * Lx + south * Ly + Lz) / len;
      const wx = bx * B + B / 2;
      const wy = by * B + B / 2;
      const shade =
        3 +
        (dot - Lz) * RELIEF.shadeGain +
        RELIEF.heightLift * (z / RELIEF.liftScale - 0.5) +
        RELIEF.valley * (ridge[k] ?? 0) +
        RELIEF.grain *
          grainShare(look, k * T, T) *
          noise2(wx / 7, wy / 5, 0x77);
      // The foot leans to the ground in three dithered steps (no gradient).
      const footShare = 1 - smoothstep(0, RELIEF.footBlend, d);
      let l = RELIEF_LOOKS[0] as ReliefLook;
      for (let sy = Math.max(ys, top); sy < Math.min(ybuf, bottom); sy += 1) {
        // Dithers per screen pixel, so a stretched face is dithered too.
        const t = pickTerrain(look, k * T, T, bayer(bx + 1, sy + 2));
        l = RELIEF_LOOKS[t] as ReliefLook;
        const ground = relief.grounds?.[t];
        const foot =
          Math.floor(footShare * 3 + bayer(bx + 2, sy + 1) * 0.999) / 3;
        // Height of this pixel on a vertical face (strata).
        const zh = (by - sy) * B;
        let s = shade + RELIEF.dither * (bayer(bx, sy) - 0.5);
        if (l.terrace > 0 && sy > ys) {
          const stripe = Math.floor((zh + 2 * noise2(wx / 40, 0, 0x7a)) / 4);
          s += stripe % 3 === 0 ? 0.9 : stripe % 3 === 1 ? -0.5 : 0;
        }
        const band = Math.max(1, Math.min(5, Math.round(s)));
        const c = l.ramp[band] ?? [0, 0, 0];
        if (ground !== undefined && foot > 0) {
          const g = ground;
          const m = foot * 0.6;
          const lum = 0.8 + 0.07 * (band - 3);
          colour[0] = c[0] + ((g[0] ?? 0) * lum - c[0]) * m;
          colour[1] = c[1] + ((g[1] ?? 0) * lum - c[1]) * m;
          colour[2] = c[2] + ((g[2] ?? 0) * lum - c[2]) * m;
          put(bx, sy, colour);
        } else put(bx, sy, c);
        wrote = true;
      }
      if (ys < ybuf) {
        owner = by;
        ownerTop = ys;
        ownerTone = l.ramp[0] ?? null;
        ownerZ = z;
      }
      ybuf = ys;
    }
  }
  return wrote;
}

/** Bilinear weights of the region cells' terrains round (wx, wy). */
function terrainWeights(
  relief: Relief,
  wx: number,
  wy: number,
  out: Float64Array,
): void {
  out.fill(0);
  const fx = wx / CELL - 0.5;
  const fy = wy / CELL - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  let total = 0;
  for (let dy = 0; dy <= 1; dy += 1)
    for (let dx = 0; dx <= 1; dx += 1) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x < 0 || y < 0 || x >= relief.width || y >= relief.height) continue;
      const i = y * relief.width + x;
      if (relief.region[i] !== 1) continue;
      const wt = (dx === 0 ? 1 - tx : tx) * (dy === 0 ? 1 - ty : ty);
      const t = relief.terrain[i] ?? 0;
      out[t] = (out[t] ?? 0) + wt;
      total += wt;
    }
  if (total <= 0) {
    const cx = Math.min(relief.width - 1, Math.max(0, Math.floor(wx / CELL)));
    const cy = Math.min(relief.height - 1, Math.max(0, Math.floor(wy / CELL)));
    out[relief.terrain[cy * relief.width + cx] ?? 0] = 1;
    return;
  }
  // Sharpened, so two terrains meet in a band about a third of a cell wide.
  let sharp = 0;
  for (let t = 0; t < out.length; t += 1) {
    const v = ((out[t] ?? 0) / total) ** 3;
    out[t] = v;
    sharp += v;
  }
  for (let t = 0; t < out.length; t += 1) out[t] = (out[t] ?? 0) / sharp;
}

/** The grain share of the terrains blended at a block. */
function grainShare(look: Float32Array, at: number, count: number): number {
  let share = 0;
  for (let t = 0; t < count; t += 1)
    share += (look[at + t] ?? 0) * (RELIEF_LOOKS[t]?.grain ?? 1);
  return share;
}

/** A terrain picked from weights by a dither threshold (dithered seams). */
function pickTerrain(
  look: Float32Array,
  at: number,
  count: number,
  threshold: number,
): number {
  let sum = 0;
  let last = 0;
  for (let t = 0; t < count; t += 1) {
    const wt = look[at + t] ?? 0;
    if (wt <= 0) continue;
    last = t;
    sum += wt;
    if (threshold < sum) return t;
  }
  return last;
}
