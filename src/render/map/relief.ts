/**
 * Low-relief mountains (beads border_marches-xaj.25 and xaj.28, map look
 * iterations 9a and 10).
 *
 * The user's target is a Heroes of Might and Magic II adventure map: a
 * mountain range is ONE continuous, low mass of pyramidal peaks, each with a
 * sunlit face, a shadowed face, sharp crest lines and drapery gullies on its
 * lower flanks, that fades into the ground round it, with no separate
 * sprites, no gaps and no readable cell grid, and low enough that a unit
 * standing behind it stays mostly visible. So every connected group of
 * Mountain cells is painted as a HEIGHTFIELD seen in the map's
 * three-quarter view:
 *
 * 1. Outline: a contour of the region's cell field (1 on a Mountain cell,
 *    0 on open ground, `FORBIDDEN_VALUE` on a road, object or water cell)
 *    blurred by a Gaussian (convex corners round, concave ones fill), its
 *    threshold swelling with noise and waves read at world pixels, so the
 *    outline leaves the cells by at most `outward` px, bites up to about
 *    half a cell in, never runs straight along a row of cells, and pulls
 *    back from roads, objects and water.
 * 2. Height: PEAKS. Summit sites sit on a jittered staggered lattice over
 *    world pixels; each is a faceted pyramid (four or five planar faces at
 *    hashed angles, the south faces steeper, a concave profile) and the
 *    field is the highest pyramid at each point, so faces meet in sharp
 *    crests and neighbouring peaks in V gullies. The field is multiplied by
 *    an envelope of the distance to the outline (an exact Euclidean
 *    distance transform over the chunk plus a margin, clamped at `dmax`, so
 *    chunks agree), so the mass rises out of its foot; drapery gullies
 *    (ridged noise stretched along the downhill direction) groove the lower
 *    flanks, plus a second, smaller octave of spurs. Badlands are BUTTES
 *    instead: small stepped buttes (two or three levels) on gullied talus.
 * 3. Height cap: a point `dNorth` px south of the outline (in its pixel
 *    column) rises at most `dNorth + rise` px (peaks are compressed softly
 *    toward it). The outline is at most `outward` px north of the region's
 *    northern cells, so nothing is drawn more than `outward + rise` = 32 px
 *    above them.
 * 4. Projection: each 2 px column is marched from the front (south) to the
 *    back; a ground point (x, y) of height h shows at (x, y - h), the nearer
 *    point wins, a steep step leaves a vertical face. Where a near crest
 *    hides ground far behind it, its top pixel is drawn in the crease tone
 *    (the outline of the pixel-art style).
 * 5. Shading: the sun at the bottom left (west-south-west), Lambert on the
 *    heightfield normal with a strong gain, so a peak's two faces part into
 *    lit and shadow; cast shadows marched toward the sun; gullies darker and
 *    crests lighter by curvature; quantised to cel bands of a per-terrain
 *    ramp with a stipple. Butte risers are lit, banded with strata and darker
 *    toward their foot; rims catch the light; tops carry cracks and rubble.
 * 6. Foot: the outer `feather` px are an ordered dither (the ground shows
 *    through more and more toward the outline) whose tones lean to the
 *    ground's own colour, so a range rises out of its ground without a cut
 *    (the badlands foot is narrow: it stands on its ground as a cliff).
 *
 * Everything is a pure function of the map and world pixels, painted per
 * chunk in 2 px blocks: chunks continue each other exactly, nothing is
 * mirrored and nothing repeats per cell. The fog is unchanged: the relief
 * is built from the whole map and the fog is drawn over it.
 */
import { CELL_PX } from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
import type { GameMap } from "../../core/map/types";
import { hash4, hashUnit } from "./hash";

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
  /** Half-width (blocks) of the slope estimate that orients the gullies. */
  slopeReach: 3,
  /**
   * The peak field: summit sites on a staggered lattice (`spacing` px apart
   * along a row; rows `rowPitch` of that apart), jittered by `jitter` of a
   * pitch. A peak's flanks fall as (1 - t) ^ profile (concave, flaring at
   * the foot); a site's height is `peak * (lowest + spread * u)`.
   */
  peaks: {
    spacing: 104,
    rowPitch: 0.86,
    jitter: 0.95,
    profile: 1.25,
    lowest: 0.45,
    spread: 0.75,
    major: 0.22,
    majorScale: 1.3,
    /**
     * A second, smaller octave of spurs between the peaks: a lattice of
     * `spurPitch` of the pitch, `spurHeight` of the height, `spurKeep` of
     * the sites.
     */
    spurPitch: 0.5,
    spurHeight: 0.42,
    spurKeep: 0.75,
  },
  /** Lumps on the peaks' faces (px), so no face is a flat plane. */
  lumps: 2.5,
  /** Peaks are compressed softly above this share of the cap. */
  softCap: 0.6,
  /**
   * Badlands: BUTTES on eroded slopes. Butte sites on their own staggered
   * lattice (`spacing` px, rows `rowPitch` of that, jitter); each is kept
   * with `keep` of the badlands share, has two or (`third`) three levels of
   * the look's terrace step, a footprint radius of `radius` pitches (so no
   * top is wider than about 1.5 cells), a flat top over the inner `top` of
   * it, six faces blended `round` toward a cone, read at a point warped by
   * `warp` px. Between them TALUS: a slope `talus` px high at most (times
   * the envelope) grooved by the look's gullies. Risers take the top
   * `1 - riser` of each step; the mass rises over `run` px at the outline.
   */
  mesa: {
    spacing: 84,
    rowPitch: 0.86,
    jitter: 0.9,
    keep: 0.85,
    third: 0.4,
    radius: [0.5, 0.95],
    top: 0.3,
    round: 0.35,
    warp: 9,
    talus: 13,
    run: 4,
    riser: 0.8,
  },
  /** Mesa tops: tone drift, cracks and rubble (bands). */
  tops: { drift: 0.45, crack: 1.3, crackWidth: 0.06, rubble: 0.05 },
  /** Cast shadows: march toward the sun this far (px); sun slope (rise/px). */
  shadowReach: 64,
  shadowSlope: 1,
  /** Bands darker in cast shadow. */
  shadowDepth: 0.4,
  /** Width of the dithered foot, px (peaks; mesas use `mesaFeather`). */
  feather: 12,
  mesaFeather: 4,
  /** Most px a dithered gap in the foot hides behind it. */
  footHide: 6,
  /** Width over which the foot's tones lean to the ground, px. */
  footBlend: 16,
  /** A near point hiding this many px of ground behind it is outlined. */
  outlineGap: 24,
  /** ... and only a crest at least this high (px): no line along a low rim. */
  outlineMinHeight: 12,
  /**
   * Share of the light lost on north-facing slopes: little near the range's
   * north rim (a dark band there reads as an outline of the cells), more
   * deep inside (the shadowed back faces of the peaks); `from`..`to` px
   * south of the outline.
   */
  northShade: { rim: 0.2, deep: 0.8, from: 12, to: 56 },
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
  /** Light toward the sun (west-south-west, above). */
  sun: [-0.74, 0.42, 0.56],
  /** Cel bands per unit of (n.L - flat n.L). */
  shadeGain: 5.5,
  /** Share of that gain on faces away from the sun (softer shadow faces). */
  shadowSoft: 0.65,
  /** The tone of flat ground in the relief, bands (3 = mid). */
  baseTone: 2.6,
  /** Lighter with height: bands per unit of h / liftScale. */
  heightLift: 0.5,
  /** Height (px) the lift is measured in. */
  liftScale: 30,
  /**
   * Creases: bands darker in a gully, lighter on a crest, per 6 px of
   * curvature (the discrete Laplacian over 2 blocks).
   */
  cavity: 0.45,
  /** Mesas: bands darker at the foot of a riser; rim highlight; top lift. */
  riserFoot: 1.8,
  rimLight: 1,
  mesaTop: 0.6,
  /** Mesas: higher levels lighter, bands per liftScale px. */
  mesaLift: 0.6,
  /** Grain (world-sampled noise) and stipple amplitudes, in bands. */
  grain: 0.3,
  dither: 0.4,
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
  /** Envelope reach: the mass reaches 63% of its height this far in, px. */
  readonly reach: number;
  /** Peak height, px (0: no peaks), footprint radius in site pitches. */
  readonly peak: number;
  readonly radius: number;
  /** 0 a sharp pyramid (crests where faces meet) .. 1 a round cone. */
  readonly round: number;
  /** How much steeper south faces are than the others (0: no bias). */
  readonly south: number;
  /** Share of lattice sites that carry a peak. */
  readonly keep: number;
  /** The floor between the peaks, px. */
  readonly base: number;
  /** Gully depth, px, and gully widths across and along the slope, px. */
  readonly fold: number;
  readonly across: number;
  readonly along: number;
  /** Terrace step, px (0: peaks; else a mesa of this step). */
  readonly terrace: number;
  /** Share of the world-sampled grain (quiet mesa tops: less). */
  readonly grain: number;
  /** Tone offset of the whole relief, bands (lighter: nearer its ground). */
  readonly key: number;
  /**
   * Palette ramp, dark to light: crease, deep shadow, shadow, mid, lit,
   * highlight.
   */
  readonly ramp: readonly (readonly [number, number, number])[];
}

/** Per terrain (RELIEF_TERRAINS order). */
export const RELIEF_LOOKS: readonly ReliefLook[] = [
  {
    // grass: green ridges and peaks like the reference, a little rounder.
    reach: 30,
    peak: 48,
    radius: 1.05,
    round: 0.12,
    south: 0.6,
    keep: 0.8,
    base: 6,
    fold: 6,
    across: 22,
    along: 60,
    terrace: 0,
    grain: 1,
    key: 0.2,
    ramp: [
      [12, 36, 20],
      [20, 54, 26],
      [34, 80, 32],
      [64, 126, 46],
      [106, 172, 60],
      [160, 208, 90],
    ],
  },
  {
    // jungle: steeper, deeper teal green.
    reach: 26,
    peak: 50,
    radius: 1.0,
    round: 0.3,
    south: 0.6,
    keep: 0.85,
    base: 8,
    fold: 6,
    across: 18,
    along: 60,
    terrace: 0,
    grain: 1,
    key: 0.2,
    ramp: [
      [8, 30, 28],
      [16, 54, 44],
      [26, 82, 56],
      [44, 112, 66],
      [74, 148, 78],
      [122, 186, 102],
    ],
  },
  {
    // steppe: tan and brown peaks like the reference's brown range.
    reach: 30,
    peak: 52,
    radius: 1.05,
    round: 0.12,
    south: 0.6,
    keep: 0.82,
    base: 6,
    fold: 6,
    across: 18,
    along: 60,
    terrace: 0,
    grain: 1,
    key: 0,
    ramp: [
      [50, 28, 16],
      [86, 52, 30],
      [124, 84, 48],
      [156, 110, 66],
      [186, 140, 88],
      [214, 176, 118],
    ],
  },
  {
    // badlands: stepped sandstone buttes on gullied talus slopes.
    reach: 22,
    peak: 0,
    radius: 1,
    round: 0,
    south: 0,
    keep: 0,
    base: 0,
    fold: 7,
    across: 11,
    along: 46,
    terrace: 16,
    grain: 0.6,
    key: 0,
    ramp: [
      [80, 32, 22],
      [118, 56, 34],
      [158, 86, 50],
      [198, 124, 74],
      [226, 162, 104],
      [246, 206, 152],
    ],
  },
  {
    // wasteland: dark basalt, sharp peaks.
    reach: 28,
    peak: 54,
    radius: 1.0,
    round: 0,
    south: 0.6,
    keep: 0.85,
    base: 6,
    fold: 6,
    across: 16,
    along: 56,
    terrace: 0,
    grain: 1,
    key: 0.15,
    ramp: [
      [16, 15, 22],
      [36, 34, 44],
      [56, 54, 66],
      [80, 78, 90],
      [110, 106, 114],
      [148, 142, 144],
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

/** Gully orientations (radians): gullies run along the downhill direction. */
const FOLD_ANGLES = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];

/** Ridged gully noise along orientation k at world pixel (wx, wy), 0..1. */
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

// ------------------------------------------------------------------ peaks

/** Most faces of a peak or butte. */
const MAX_FACES = 6;
/** Floats per site: x, y, height, radius, round, faces, (ux, uy, g) each. */
const SITE = 6 + 3 * MAX_FACES;
/** Lattice rows and columns searched each side of a point's own. */
const PEAK_SEARCH = 2;
const DEG = Math.PI / 180;
/**
 * Face directions (downhill, radians; 90 deg falls to the south, toward the
 * viewer): south-east (shadow) and south-west (lit) meeting in a spur that
 * runs toward the viewer, and two back faces meeting them in an east-west
 * crest; the second set adds a small front face between the two.
 */
const FACE_ANGLES: readonly (readonly number[])[] = [
  [40 * DEG, 140 * DEG, 215 * DEG, 325 * DEG],
  [30 * DEG, 90 * DEG, 150 * DEG, 215 * DEG, 325 * DEG],
];

/** What a lattice's sites are. */
const enum SiteKind {
  Peak,
  Spur,
  Butte,
}

/** A staggered site lattice: pitch along a row, row pitch, jitter, salt. */
interface Lattice {
  readonly kind: SiteKind;
  readonly spacing: number;
  readonly row: number;
  readonly jitter: number;
  readonly salt: number;
}

const PEAK_LATTICE: Lattice = {
  kind: SiteKind.Peak,
  spacing: RELIEF.peaks.spacing,
  row: RELIEF.peaks.spacing * RELIEF.peaks.rowPitch,
  jitter: RELIEF.peaks.jitter,
  salt: 0x9100,
};
const SPUR_LATTICE: Lattice = {
  kind: SiteKind.Spur,
  spacing: RELIEF.peaks.spacing * RELIEF.peaks.spurPitch,
  row: RELIEF.peaks.spacing * RELIEF.peaks.spurPitch * RELIEF.peaks.rowPitch,
  jitter: RELIEF.peaks.jitter,
  salt: 0x9300,
};
const BUTTE_LATTICE: Lattice = {
  kind: SiteKind.Butte,
  spacing: RELIEF.mesa.spacing,
  row: RELIEF.mesa.spacing * RELIEF.mesa.rowPitch,
  jitter: RELIEF.mesa.jitter,
  salt: 0x9500,
};

/** The sites of one lattice over one window. */
interface Sites {
  readonly lattice: Lattice;
  readonly lx0: number;
  readonly ly0: number;
  readonly lw: number;
  readonly lh: number;
  readonly data: Float32Array;
}

/**
 * The sites of a lattice over world rectangle (wx0, wy0)-(wx1, wy1) plus
 * the search reach: each a pure function of its lattice index and the map
 * (its looks are read at its centre), so neighbouring chunks build the same
 * peaks and buttes.
 */
function buildSites(
  relief: Relief,
  lattice: Lattice,
  wx0: number,
  wy0: number,
  wx1: number,
  wy1: number,
): Sites {
  const P = RELIEF.peaks;
  const M = RELIEF.mesa;
  const { kind, spacing, row, jitter, salt } = lattice;
  const ly0 = Math.floor(wy0 / row) - PEAK_SEARCH - 1;
  const lx0 = Math.floor(wx0 / spacing) - PEAK_SEARCH - 1;
  const lh = Math.floor(wy1 / row) + PEAK_SEARCH + 2 - ly0;
  const lw = Math.floor(wx1 / spacing) + PEAK_SEARCH + 2 - lx0;
  const data = new Float32Array(lw * lh * SITE);
  const weights = new Float64Array(RELIEF_TERRAINS.length);
  for (let r = 0; r < lh; r += 1)
    for (let c = 0; c < lw; c += 1) {
      const ix = lx0 + c;
      const iy = ly0 + r;
      const o = (r * lw + c) * SITE;
      const u = (s: number): number => hashUnit(ix, iy, salt + s);
      const x = (ix + 0.5 + 0.5 * (iy & 1) + jitter * (u(1) - 0.5)) * spacing;
      const y = (iy + 0.5 + jitter * (u(2) - 0.5)) * row;
      data[o] = x;
      data[o + 1] = y;
      terrainWeights(relief, x, y, weights);
      let peak = 0;
      let radius = 0;
      let round = 0;
      let south = 0;
      let keep = 0;
      let step = 0;
      let mesaShare = 0;
      for (let t = 0; t < RELIEF_TERRAINS.length; t += 1) {
        const wt = weights[t] ?? 0;
        if (wt === 0) continue;
        const l = RELIEF_LOOKS[t] as ReliefLook;
        peak += l.peak * wt;
        radius += l.radius * wt;
        round += l.round * wt;
        south += l.south * wt;
        keep += l.keep * wt;
        if (l.terrace > 0) {
          step += l.terrace * wt;
          mesaShare += wt;
        }
      }
      if (kind === SiteKind.Butte) {
        // A stepped butte of two or three levels with a flat top.
        if (mesaShare <= 0 || u(3) >= M.keep * mesaShare) continue;
        const levels = u(4) < M.third ? 3 : 2;
        data[o + 2] = (step / mesaShare) * levels;
        data[o + 3] =
          spacing * (M.radius[0] + (M.radius[1] - M.radius[0]) * u(5));
        data[o + 4] = M.round;
        data[o + 5] = MAX_FACES;
        const a0 = u(6) * 2 * Math.PI;
        for (let f = 0; f < MAX_FACES; f += 1) {
          const a =
            a0 + (2 * Math.PI * f) / MAX_FACES + (u(10 + f) - 0.5) * 0.7;
          data[o + 6 + 3 * f] = Math.cos(a);
          data[o + 7 + 3 * f] = Math.sin(a);
          data[o + 8 + 3 * f] = 0.8 + 0.45 * u(20 + f);
        }
        continue;
      }
      const spur = kind === SiteKind.Spur;
      if (peak <= 0 || u(3) >= keep * (spur ? P.spurKeep : 1)) continue;
      const size = u(4);
      const major = !spur && u(8) < P.major ? P.majorScale : 1;
      data[o + 2] =
        peak * (P.lowest + P.spread * size) * major * (spur ? P.spurHeight : 1);
      data[o + 3] =
        radius * spacing * (0.7 + 0.55 * size + 0.15 * u(7)) * major;
      data[o + 4] = round;
      const front = u(5) < 0.35;
      const angles = FACE_ANGLES[front ? 1 : 0] ?? [];
      const faces = angles.length;
      data[o + 5] = faces;
      const turn = (u(6) - 0.5) * (spur ? 1.6 : 1.0);
      for (let f = 0; f < faces; f += 1) {
        const a = (angles[f] ?? 0) + turn + (u(10 + f) - 0.5) * 0.4;
        const ux = Math.cos(a);
        const uy = Math.sin(a); // > 0: the face falls to the south
        // South faces steeper: they rise in the projection.
        const g = (0.85 + 0.3 * u(20 + f)) * (1 + south * Math.max(0, uy));
        data[o + 6 + 3 * f] = ux;
        data[o + 7 + 3 * f] = uy;
        data[o + 8 + 3 * f] = g;
      }
    }
  return { lattice, lx0, ly0, lw, lh, data };
}

/**
 * A site field at world pixel (wx, wy): the highest site there. Peaks and
 * spurs fall as (1 - t) ^ profile; a butte is flat over its inner `top`
 * and falls linearly outside it (the terraces are cut later).
 */
function siteFieldAt(sites: Sites, wx: number, wy: number): number {
  const { lattice, lx0, ly0, lw, lh, data } = sites;
  const butte = lattice.kind === SiteKind.Butte;
  const top = RELIEF.mesa.top;
  const profile = RELIEF.peaks.profile;
  const iy0 = Math.floor(wy / lattice.row);
  let best = 0;
  for (let iy = iy0 - PEAK_SEARCH; iy <= iy0 + PEAK_SEARCH; iy += 1) {
    const r = iy - ly0;
    if (r < 0 || r >= lh) continue;
    const ix0 = Math.floor(wx / lattice.spacing - 0.5 * (iy & 1));
    for (let ix = ix0 - PEAK_SEARCH; ix <= ix0 + PEAK_SEARCH; ix += 1) {
      const c = ix - lx0;
      if (c < 0 || c >= lw) continue;
      const o = (r * lw + c) * SITE;
      const h = data[o + 2] ?? 0;
      if (h <= best) continue;
      const dx = wx - (data[o] ?? 0);
      const dy = wy - (data[o + 1] ?? 0);
      const rad = data[o + 3] ?? 1;
      const e = Math.hypot(dx, dy);
      if (e >= 2 * rad) continue;
      const faces = data[o + 5] ?? 4;
      let fd = -Infinity;
      for (let f = 0; f < faces; f += 1) {
        const q = o + 6 + 3 * f;
        const v =
          (data[q + 2] ?? 1) * (dx * (data[q] ?? 0) + dy * (data[q + 1] ?? 0));
        if (v > fd) fd = v;
      }
      const dd = fd + (e - fd) * (data[o + 4] ?? 0);
      const t = Math.max(0, dd / rad);
      if (t >= 1) continue;
      const v = butte
        ? h * Math.min(1, (1 - t) / (1 - top))
        : h * Math.pow(1 - t, profile);
      if (v > best) best = v;
    }
  }
  return best;
}

// --------------------------------------------------------------- painting

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
  const S = RELIEF.slopeReach;
  const sun = RELIEF.sun;
  const sunLen = Math.hypot(sun[0], sun[1], sun[2]);
  const Lx = sun[0] / sunLen;
  const Ly = sun[1] / sunLen;
  const Lz = sun[2] / sunLen;
  // Toward the sun in plan, per block.
  const Lh = Math.hypot(Lx, Ly);
  const sdx = Lx / Lh;
  const sdy = Ly / Lh;
  const shadowSteps = Math.ceil(RELIEF.shadowReach / B);
  const blocks = (px: number): number => Math.ceil(px / B);
  // The blocks the projection reads (normals and curvature: 2 more).
  const qx0 = Math.floor(x0 / B) - 2;
  const qx1 = Math.ceil((x0 + w) / B) + 2;
  const qy0 = Math.floor(y0 / B) - 2;
  const qy1 = Math.ceil((y0 + h + RELIEF.hmax) / B) + 2;
  // Heights over that plus the shadow march toward the sun; the macro
  // height over that plus the slope estimate; the distance field over that
  // plus its clamp, so every distance used is exact (chunks agree).
  const shW = blocks(RELIEF.shadowReach * Math.max(0, -sdx)) + 1;
  const shE = blocks(RELIEF.shadowReach * Math.max(0, sdx)) + 1;
  const shN = blocks(RELIEF.shadowReach * Math.max(0, -sdy)) + 1;
  const shS = blocks(RELIEF.shadowReach * Math.max(0, sdy)) + 1;
  const margin = blocks(RELIEF.dmax) + 3;
  const bx0 = qx0 - shW - S - margin;
  const by0 = qy0 - shN - S - margin;
  const bx1 = qx1 + shE + S + margin;
  const by1 = qy1 + shS + S + margin;
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
  // `room` is that distance less how far the outline lies more than
  // `outward` px north of the region's cells (a fillet off the region), so
  // the cap holds against the cells themselves.
  const north = new Float32Array(W * H);
  const room = new Float32Array(W * H);
  for (let i = 0; i < W; i += 1) {
    let last = -INF;
    let excess = 0;
    const cx = Math.floor(((bx0 + i) * B + B / 2) / CELL);
    for (let j = 0; j < H; j += 1) {
      if (inside[j * W + i] !== 1) {
        last = j;
        // The outline here; the region cell it stands over (or the next).
        const oy = (by0 + j + 1) * B;
        const cy = Math.floor(oy / CELL);
        const onRegion =
          cx >= 0 &&
          cy >= 0 &&
          cx < relief.width &&
          cy < relief.height &&
          relief.region[cy * relief.width + cx] === 1;
        excess = onRegion
          ? 0
          : Math.max(0, (cy + 1) * CELL - oy - RELIEF.outward);
      }
      const n = last === -INF ? INF : (j - last) * B - B / 2;
      north[j * W + i] = n;
      room[j * W + i] = n - excess;
    }
  }
  // Local index ranges: heights (hx0..hx1, hy0..hy1), macro (that +- S).
  const hx0 = qx0 - shW - bx0;
  const hx1 = qx1 + shE - bx0;
  const hy0 = qy0 - shN - by0;
  const hy1 = qy1 + shS - by0;
  const T = RELIEF_TERRAINS.length;
  const look = new Float32Array(W * H * T);
  const weights = new Float64Array(T);
  // The peaks' macro height (dome times peak field), the badlands' talus
  // and butte heights, the mesa share and the local peak height.
  const macro = new Float32Array(W * H);
  const talus = new Float32Array(W * H);
  const butte = new Float32Array(W * H);
  const mesaShare = new Float32Array(W * H);
  const peakH = new Float32Array(W * H);
  const heights = new Float32Array(W * H);
  // The site lattices over the macro area plus the butte warp.
  const M = RELIEF.mesa;
  const wx0 = (bx0 + hx0 - S) * B - M.warp;
  const wx1 = (bx0 + hx1 + S + 1) * B + M.warp;
  const wy0 = (by0 + hy0 - S) * B - M.warp;
  const wy1 = (by0 + hy1 + S + 1) * B + M.warp;
  const peaks = buildSites(relief, PEAK_LATTICE, wx0, wy0, wx1, wy1);
  const spurs = buildSites(relief, SPUR_LATTICE, wx0, wy0, wx1, wy1);
  const buttes = buildSites(relief, BUTTE_LATTICE, wx0, wy0, wx1, wy1);
  // Pass 1: terrain weights, the macro height of the peaks and the mesas.
  for (let j = hy0 - S; j <= hy1 + S; j += 1)
    for (let i = hx0 - S; i <= hx1 + S; i += 1) {
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
      let reach = 0;
      let base = 0;
      let peak = 0;
      let terrace = 0;
      let share = 0;
      for (let t = 0; t < T; t += 1) {
        const wt = weights[t] ?? 0;
        look[k * T + t] = wt;
        if (wt === 0) continue;
        const l = RELIEF_LOOKS[t] as ReliefLook;
        reach += l.reach * wt;
        base += l.base * wt;
        peak += l.peak * wt;
        if (l.terrace > 0) {
          terrace += l.terrace * wt;
          share += wt;
        }
      }
      const d = dist[k] ?? 0;
      const env = 1 - Math.exp(-d / reach);
      mesaShare[k] = share;
      peakH[k] = peak;
      if (share < 1)
        macro[k] =
          env *
          Math.max(
            siteFieldAt(peaks, wx, wy),
            siteFieldAt(spurs, wx, wy),
            base,
          );
      if (share > 0) {
        // Talus between the buttes; the buttes cut into terraces, risers
        // at the top of each step; the mass rises over `run` px.
        talus[k] = env * M.talus * (0.7 + 0.4 * noise2(wx / 70, wy / 60, 0x99));
        const step = terrace / share;
        const q =
          siteFieldAt(
            buttes,
            wx + M.warp * noise2(wx / 23, wy / 23, 0x9a),
            wy + M.warp * noise2(wx / 23, wy / 23, 0x9b),
          ) / step;
        const lvl = Math.floor(q);
        butte[k] =
          step *
          (lvl + smoothstep(M.riser, 1, q - lvl)) *
          smoothstep(0, M.run, d);
      }
    }
  /** Gully value (0..1) at a block, running down the gradient of `field`. */
  const gullyAt = (
    field: Float32Array,
    k: number,
    wx: number,
    wy: number,
    across: number,
    along: number,
  ): number => {
    // Gullies run downhill: along the gradient; where the slope is flat they
    // fall toward the viewer (north-south).
    const gx = (field[k + S] ?? 0) - (field[k - S] ?? 0);
    const gy = (field[k + S * W] ?? 0) - (field[k - S * W] ?? 0);
    const g = Math.hypot(gx, gy);
    const flat = 1 - smoothstep(0.4, 2.5, g);
    let angle = Math.atan2(gy + flat * 3, gx);
    if (angle < 0) angle += Math.PI;
    const pos = (angle / Math.PI) * 4;
    const k0 = Math.floor(pos) % 4;
    const k1 = (k0 + 1) % 4;
    const part = pos - Math.floor(pos);
    return (
      foldAt(k0, wx, wy, across, along) * (1 - part) +
      foldAt(k1, wx, wy, across, along) * part
    );
  };
  // Pass 2: gullies down the peaks' flanks and the talus, the blend, the cap.
  for (let j = hy0; j <= hy1; j += 1)
    for (let i = hx0; i <= hx1; i += 1) {
      const k = j * W + i;
      if (inside[k] !== 1) continue;
      const share = mesaShare[k] ?? 0;
      const cap = Math.max(
        0,
        Math.min((room[k] ?? 0) + RELIEF.rise, RELIEF.hmax),
      );
      const wx = (bx0 + i) * B + B / 2;
      const wy = (by0 + j) * B + B / 2;
      const d = dist[k] ?? 0;
      let fold = 0;
      let across = 0;
      let along = 0;
      let mfold = 0;
      let macross = 0;
      let malong = 0;
      for (let t = 0; t < T; t += 1) {
        const wt = look[k * T + t] ?? 0;
        if (wt === 0) continue;
        const l = RELIEF_LOOKS[t] as ReliefLook;
        if (l.terrace > 0) {
          mfold += l.fold * wt;
          macross += l.across * wt;
          malong += l.along * wt;
        } else {
          fold += l.fold * wt;
          across += l.across * wt;
          along += l.along * wt;
        }
      }
      let z = 0;
      if (share < 1) {
        const rest = 1 - share;
        const zp = macro[k] ?? 0;
        const f = gullyAt(macro, k, wx, wy, across / rest, along / rest);
        // On the lower flanks (drapery), quiet near the summits and the foot.
        const rel = zp / Math.max(1, peakH[k] ?? 1);
        const strength =
          smoothstep(2, 18, d) * (1 - smoothstep(0.45, 0.9, rel));
        // Lumps, so no face is a flat plane.
        const lump =
          RELIEF.lumps * smoothstep(2, 18, d) * noise2(wx / 32, wy / 28, 0x97);
        let zq = Math.max(0, zp + (fold / rest) * (f - 0.35) * strength + lump);
        // Soft cap: peaks near the north rim round off below it.
        const soft = RELIEF.softCap * cap;
        if (zq > soft && cap > soft)
          zq = soft + (cap - soft) * Math.tanh((zq - soft) / (cap - soft));
        z += zq * rest;
      }
      if (share > 0) {
        // Rills and gullies down the talus (the eroded slopes between the
        // buttes), the buttes standing on it.
        const f = gullyAt(talus, k, wx, wy, macross / share, malong / share);
        const zt = Math.max(
          0,
          (talus[k] ?? 0) + (mfold / share) * (f - 0.35) * smoothstep(2, 12, d),
        );
        z += Math.max(zt, butte[k] ?? 0) * share;
      }
      heights[k] = Math.max(0, Math.min(z, cap));
    }
  // Cast shadow of block (i, j) at height z: 0 lit .. 1 shadowed.
  const shadowAt = (i: number, j: number, z: number): number => {
    let worst = 0;
    for (let s = 1; s <= shadowSteps; s += 1) {
      const ii = i + Math.round(s * sdx);
      const jj = j + Math.round(s * sdy);
      const excess =
        (heights[jj * W + ii] ?? 0) - z - s * B * RELIEF.shadowSlope;
      if (excess > worst) worst = excess;
    }
    return smoothstep(0, 4, worst);
  };
  // March each column front to back.
  const top = Math.floor(y0 / B);
  const bottom = Math.ceil((y0 + h) / B);
  const NS = RELIEF.northShade;
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
    // Height of the nearer drawn point (0: ground or foot), for the faces.
    let prevZ = 0;
    for (let j = qy1 - by0 - 1; j > qy0 - by0; j -= 1) {
      const by = by0 + j;
      if (by < top - 1 && ybuf <= top) break;
      const k = j * W + i;
      if (inside[k] !== 1) {
        if (by < ybuf) {
          ybuf = by;
          owner = -1;
          prevZ = 0;
        }
        continue;
      }
      const z = heights[k] ?? 0;
      const d = dist[k] ?? 0;
      const ys = by - Math.round(z / B);
      if (ys >= ybuf) continue;
      const share = mesaShare[k] ?? 0;
      // The dithered foot (narrow under a mesa: it stands as a cliff).
      const feather =
        RELIEF.feather + (RELIEF.mesaFeather - RELIEF.feather) * share;
      if (d < feather && bayer(bx, by) >= d / feather) {
        // A gap in the foot hides only a low strip: a steep flank behind
        // it still shows (no hole where a peak rises close to its foot).
        ybuf = Math.min(
          ybuf,
          by - Math.round(Math.min(z, RELIEF.footHide) / B),
        );
        owner = -1;
        prevZ = 0;
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
      // Normal, curvature, cast shadow and shade.
      const hx = ((heights[k + 1] ?? z) - (heights[k - 1] ?? z)) / (2 * B);
      const hy = ((heights[k + W] ?? z) - (heights[k - W] ?? z)) / (2 * B);
      const len = Math.hypot(hx, hy, 1);
      const lose =
        NS.rim + (NS.deep - NS.rim) * smoothstep(NS.from, NS.to, north[k] ?? 0);
      const south = hy > 0 ? -hy * lose : -hy;
      const dot = (-hx * Lx + south * Ly + Lz) / len;
      const lap =
        (heights[k - 2] ?? z) +
        (heights[k + 2] ?? z) +
        (heights[k - 2 * W] ?? z) +
        (heights[k + 2 * W] ?? z) -
        4 * z;
      const cav = Math.max(-1.5, Math.min(1.5, lap / 10));
      const wx = bx * B + B / 2;
      const wy = by * B + B / 2;
      // Faces away from the sun are softened (no black diamond bands).
      const light = (dot - Lz) * RELIEF.shadeGain;
      const bz = butte[k] ?? 0;
      const flatTop =
        share > 0.5 && bz > 1 && bz >= z - 0.5 && hx * hx + hy * hy < 0.04;
      let shade =
        RELIEF.baseTone +
        (light < 0 ? light * RELIEF.shadowSoft : light) +
        RELIEF.heightLift * (z / RELIEF.liftScale - 0.5) -
        RELIEF.cavity * cav -
        RELIEF.shadowDepth * (1 + share) * shadowAt(i, j, z) +
        (flatTop
          ? (RELIEF.mesaTop + (RELIEF.mesaLift * z) / RELIEF.liftScale) * share
          : 0) +
        keyOf(look, k * T, T) +
        RELIEF.grain *
          grainShare(look, k * T, T) *
          noise2(wx / 7, wy / 5, 0x77);
      if (share > 0.5) {
        // Badlands texture: tone drift and cracks on the butte tops, rubble
        // on the tops and (sparser) on the talus.
        const TP = RELIEF.tops;
        if (flatTop) {
          shade += TP.drift * noise2(wx / 38, wy / 30, 0x9c);
          const crack = Math.abs(
            noise2(wx / 26, wy / 20, 0x9d) + 0.5 * noise2(wx / 9, wy / 9, 0x9e),
          );
          if (crack < TP.crackWidth) shade -= TP.crack;
        }
        const rubble = hashUnit(Math.floor(wx / 4), Math.floor(wy / 4), 0x9f);
        const rate = flatTop ? TP.rubble : TP.rubble / 2;
        if (rubble < rate) shade += rubble < rate / 2 ? -1.2 : 0.9;
      }
      // A mesa's north rim catches the light.
      if (share > 0.5 && (heights[k - 2 * W] ?? 0) < z - 8)
        shade += RELIEF.rimLight;
      // The foot leans to the ground in three dithered steps (no gradient).
      const footBlend =
        RELIEF.footBlend + (RELIEF.mesaFeather - RELIEF.footBlend) * share;
      const footShare = 1 - smoothstep(0, footBlend, d);
      const faceLen = ybuf - ys;
      let l = RELIEF_LOOKS[0] as ReliefLook;
      for (let sy = Math.max(ys, top); sy < Math.min(ybuf, bottom); sy += 1) {
        // Dithers per screen pixel, so a stretched face is dithered too.
        const t = pickTerrain(look, k * T, T, bayer(bx + 1, sy + 2));
        l = RELIEF_LOOKS[t] as ReliefLook;
        const ground = relief.grounds?.[t];
        const foot =
          Math.floor(footShare * 3 + bayer(bx + 2, sy + 1) * 0.999) / 3;
        let s = shade + RELIEF.dither * (hashUnit(bx, sy, 0x5d) - 0.5);
        if (l.terrace > 0) {
          if (sy > ys) {
            // A riser: the height of this pixel on the face, strata by
            // height, flutes down the face, darker toward its foot.
            const hp = z - ((sy - ys) / faceLen) * (z - prevZ);
            const within =
              (((Math.max(0, hp - 0.01) % l.terrace) + l.terrace) % l.terrace) /
              l.terrace;
            const stripe = Math.floor((hp + 2 * noise2(wx / 40, 0, 0x7a)) / 4);
            s += stripe % 3 === 0 ? 0.8 : stripe % 3 === 1 ? -0.6 : 0;
            s += 0.45 * noise2(wx / 5, hp / 30, 0x7b);
            s -= RELIEF.riserFoot * (1 - within) * (1 - within);
          } else if (faceLen >= 3) s += RELIEF.rimLight;
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
      prevZ = z;
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

/** The tone key of the terrains blended at a block. */
function keyOf(look: Float32Array, at: number, count: number): number {
  let key = 0;
  for (let t = 0; t < count; t += 1)
    key += (look[at + t] ?? 0) * (RELIEF_LOOKS[t]?.key ?? 0);
  return key;
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
