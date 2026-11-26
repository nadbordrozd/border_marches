/**
 * Mountain ranges as a dense crowd of small front-view peaks (bead
 * border_marches-xaj.30), built the way the forest canopy is (canopy.ts):
 * hand-style sprites seen from the same viewpoint as trees, units and
 * buildings, y-sorted so each row covers the feet of the row behind.
 *
 * - THE REGION is the 0.5 contour of a smooth field over the Mountain cells
 *   plus a wobble over world pixels, so a range's outline leaves the grid.
 * - FEET are blue noise at world coordinates: hashed candidates, taken in
 *   priority order (summits first), each kept when no kept peak stands inside
 *   its exclusion ellipse. Large summits stand deep inside a range and small
 *   foothills along its edge; a last pass puts a foothill on any hole left.
 * - THE FAMILY of a peak is the ground under its foot; a hard change between
 *   two terrains is allowed.
 * - FEET RULE: never on a road, an object, an entrance or water.
 * - HEIGHT CAP: a peak rises at most PEAKS.capPx above the top edge of the
 *   northernmost Mountain cell of its column, and at most PEAKS.objectRisePx
 *   into a cell holding an object.
 * - UNDERLAY: rock-toned paint inside the outline, inset so that it stays
 *   hidden behind the sprites and only closes pinholes between them.
 *
 * Drawing (scene.ts, map-view.ts) is the canopy's: every peak is a TALL_BODY
 * entry sorted by its base, and the part rising above its row is painted
 * again into the cached crown bands drawn in the foreground, so it covers only
 * the feet of a unit standing behind the range.
 */
import { CELL_PX, GROUND_FAMILY } from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
import type { GameMap } from "../../core/map/types";
import type { CanopyTree } from "./canopy";
import { hash4 } from "./hash";
import { mergeSorted, updateSorted } from "./sorted";

const CELL = CELL_PX;
const TURN = (2 * Math.PI) / (CELL * 3);

export type PeakTier = "foothill" | "peak" | "summit";

/** One peak image of a family. */
export interface PeakSprite {
  readonly key: string;
  readonly w: number;
  readonly h: number;
  readonly tier: PeakTier;
}

export type PeakTable = Readonly<Record<GroundTerrain, readonly PeakSprite[]>>;

/** A placed peak: the same shape as a tree, so it shares the crown bands. */
export type PlacedPeak = CanopyTree;

export const PEAKS = {
  /** Candidate spacing, px. */
  grid: 12,
  /** Highest a peak rises above the top of the range's northern cells, px. */
  capPx: 40,
  /** Deepest a peak reaches into a cell with an object, px. */
  objectRisePx: 14,
  /** The region's offset south of the Mountain cells, px. */
  shift: 10,
  /** Wobble of the outline, field units (sum of three waves). */
  wobble: [0.16, 0.09, 0.05],
  /** Amplitude of the noise lobes of the outline, field units. */
  lobes: 0.2,
  /** The field's value where no peak may stand. */
  blocked: -2.5,
  /** Deep inside the cells the region is always closed. */
  solid: 0.8,
  /** How far beyond the outline a foothill's foot may stand, field units. */
  spillDepth: 0.14,
  /** Share of the candidates in that band that are tried. */
  spillKeep: 0.3,
  /** Exclusion half-axes as shares of the sprite's width and height. */
  xGap: 0.5,
  yGap: 0.32,
  /** Extra spacing of a foothill standing inside a range. */
  fillerSpacing: 1.4,
  /** Spacing of the points checked for holes in a range, px. */
  holeGrid: 8,
  /** A sprite prefers to have no copy within this distance, px. */
  repeatPx: 150,
  /** No two copies of a sprite ever stand closer than this, px. */
  repeatMinPx: 64,
  /** Inside this depth (field units) only foothills stand. */
  edgeDepth: 0.2,
  /** Inset of the underlay from the outline, field units. */
  underInset: 0.24,
} as const;

/** Spacing per family: the spiky, high-contrast basalt needs more air. */
export const PEAK_SPACING: Readonly<Record<GroundTerrain, number>> = {
  grass: 1,
  jungle: 1.08,
  steppe: 1,
  badlands: 1,
  wasteland: 1.16,
  volcanic: 1.16,
};

/** Per-cell facts of the ranges, computed once per map. */
export interface PeakField {
  readonly width: number;
  readonly height: number;
  /** 1 on a Mountain cell without an object. */
  readonly rock: Uint8Array;
  /** 1 on free land: no obstacle, road or object. */
  readonly open: Uint8Array;
  /** 1 on a forest cell (neither blocked nor a place for a foot). */
  readonly wood: Uint8Array;
  /** 1 on a cell under an object or its entrance. */
  readonly featured: Uint8Array;
  /** Cells to the range's edge (1 = an edge cell), 0 off the range. */
  readonly inland: Uint8Array;
  /** 1 on a rock cell or one of its eight neighbours. */
  readonly near: Uint8Array;
  /** Family (GROUNDS index) of the rock here or beside it, 255 none. */
  readonly family: Uint8Array;
}

const GROUNDS: readonly GroundTerrain[] = [
  "grass",
  "jungle",
  "steppe",
  "badlands",
  "wasteland",
];

const NEIGHBOURS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

/** The range facts of a map; `featured` are the cells under objects. */
export function buildPeakField(
  map: GameMap,
  featured: ReadonlySet<number> = new Set(),
): PeakField {
  const { width, height } = map;
  const n = width * height;
  const rock = new Uint8Array(n);
  const open = new Uint8Array(n);
  const wood = new Uint8Array(n);
  const feat = new Uint8Array(n);
  const inland = new Uint8Array(n);
  const near = new Uint8Array(n);
  const family = new Uint8Array(n).fill(255);
  map.cells.forEach((cell, i) => {
    if (featured.has(i)) feat[i] = 1;
    if (cell.terrain === "water") return;
    if (cell.obstacle === "mountain" && !featured.has(i)) {
      rock[i] = 1;
      family[i] = GROUNDS.indexOf(GROUND_FAMILY[cell.terrain]);
    } else if (cell.obstacle === "forest") wood[i] = 1;
    else if (cell.obstacle === "none" && !cell.road && !featured.has(i))
      open[i] = 1;
  });
  // Rings from the range's edge inwards; the map's rim does not count as an
  // edge, since a range there simply runs off the map.
  let ring: number[] = [];
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (rock[i] !== 1) continue;
      near[i] = 1;
      let edge = false;
      for (const [dx, dy] of NEIGHBOURS) {
        const ax = x + dx;
        const ay = y + dy;
        if (ax < 0 || ay < 0 || ax >= width || ay >= height) continue;
        const j = ay * width + ax;
        near[j] = 1;
        if (rock[j] !== 1) {
          edge = true;
          if (family[j] === 255) family[j] = family[i] ?? 255;
        }
      }
      if (edge) {
        inland[i] = 1;
        ring.push(i);
      }
    }
  for (let depth = 2; ring.length > 0 && depth < 200; depth += 1) {
    const next: number[] = [];
    for (const i of ring) {
      const x = i % width;
      const y = Math.floor(i / width);
      for (const [dx, dy] of NEIGHBOURS) {
        const ax = x + dx;
        const ay = y + dy;
        if (ax < 0 || ay < 0 || ax >= width || ay >= height) continue;
        const j = ay * width + ax;
        if (rock[j] === 1 && inland[j] === 0) {
          inland[j] = depth;
          next.push(j);
        }
      }
    }
    ring = next;
  }
  // A range with no edge at all (the whole map): call it deep.
  for (let i = 0; i < n; i += 1)
    if (rock[i] === 1 && inland[i] === 0) inland[i] = 3;
  return {
    width,
    height,
    rock,
    open,
    wood,
    featured: feat,
    inland,
    near,
    family,
  };
}

const unit = (a: number, b: number, salt: number): number =>
  hash4(a, b, salt, 0x9e4b) / 0x1_0000_0000;

/** A smooth value noise over world px with the given spacing, in [0, 1]. */
function noise(wx: number, wy: number, spacing: number, salt: number): number {
  const fx = wx / spacing;
  const fy = wy / spacing;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const ux = tx * tx * (3 - 2 * tx);
  const uy = ty * ty * (3 - 2 * ty);
  const top = unit(x0, y0, salt) * (1 - ux) + unit(x0 + 1, y0, salt) * ux;
  const bottom =
    unit(x0, y0 + 1, salt) * (1 - ux) + unit(x0 + 1, y0 + 1, salt) * ux;
  return top * (1 - uy) + bottom * uy;
}

/**
 * The bilinear rock field at a world point: 1 on rock, 0 on free ground and
 * woods, PEAKS.blocked on water, roads and objects. Off the map counts as
 * rock, so a range reaches the rim of the map.
 */
function rockField(field: PeakField, wx: number, wy: number): number {
  const { width, height, rock, open, wood } = field;
  const fx = (wx - CELL / 2) / CELL;
  const fy = (wy - CELL / 2) / CELL;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const at = (i: number, j: number): number => {
    const ci = Math.max(0, Math.min(width - 1, i));
    const cj = Math.max(0, Math.min(height - 1, j));
    const k = cj * width + ci;
    if (rock[k] === 1) return 1;
    return open[k] === 1 || wood[k] === 1 ? 0 : PEAKS.blocked;
  };
  const a = at(i0, j0);
  const b = at(i0 + 1, j0);
  const c = at(i0, j0 + 1);
  const d = at(i0 + 1, j0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function wobble(wx: number, wy: number): number {
  const [a, b, c] = PEAKS.wobble;
  return (
    a * Math.sin(TURN * (1.1 * wx + 1.9 * wy) + 1.3) +
    b * Math.sin(TURN * (4 * wx - 5 * wy) + 0.4) +
    c * Math.sin(TURN * (9 * wy + 11 * wx) + 3.1) +
    PEAKS.lobes * (2 * noise(wx, wy, CELL * 0.8, 0x4d) - 1)
  );
}

/**
 * How deep a world point lies inside the range's region, in field units:
 * positive inside, negative outside, -1 where no foot may stand.
 */
export function peakDepth(field: PeakField, wx: number, wy: number): number {
  const cx = Math.floor(wx / CELL);
  const cy = Math.floor(wy / CELL);
  if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) return -1;
  const i = cy * field.width + cx;
  if (field.rock[i] !== 1 && field.open[i] !== 1) return -1;
  const f = rockField(field, wx, wy - PEAKS.shift);
  const raw = f + wobble(wx, wy) - 0.5;
  return Math.max(raw, f - PEAKS.solid);
}

/**
 * The top edge (world px) of the range above a point in cell (cx, cy): the
 * top of the northernmost rock cell of the unbroken run of rock cells in
 * column cx holding (cx, cy), or lying just below or above it.
 */
export function rangeTop(field: PeakField, cx: number, cy: number): number {
  const { width, height, rock } = field;
  const isRock = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && rock[y * width + x] === 1;
  let row: number;
  if (isRock(cx, cy)) row = cy;
  else if (isRock(cx, cy - 1)) row = cy - 1;
  else if (isRock(cx, cy + 1)) return (cy + 1) * CELL;
  else return cy * CELL;
  while (isRock(cx, row - 1)) row -= 1;
  return row * CELL;
}

const cellIs = (
  values: Uint8Array,
  field: PeakField,
  wx: number,
  wy: number,
): boolean => {
  const cx = Math.floor(wx / CELL);
  const cy = Math.floor(wy / CELL);
  if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) return false;
  return values[cy * field.width + cx] === 1;
};

/** The sprite placed with its foot at (bx, by), if it obeys every rule. */
function fit(
  field: PeakField,
  sprite: PeakSprite,
  bx: number,
  by: number,
  spill: boolean,
): PlacedPeak | null {
  const x = Math.round(bx - sprite.w / 2);
  const baseY = Math.round(by);
  const y = baseY - sprite.h;
  const right = x + sprite.w - 1;
  // Inside the map: nothing hangs over the sky beyond its rim.
  if (x < 0 || y < 0 || right >= field.width * CELL) return null;
  if (baseY > field.height * CELL) return null;
  // The foot stands on rock or free ground only.
  const footY = baseY - 3;
  const inset = Math.max(4, Math.round(sprite.w * 0.14));
  for (const fx of [x + inset, Math.round(bx), right - inset]) {
    const ok =
      cellIs(field.rock, field, fx, footY) ||
      cellIs(field.open, field, fx, footY);
    if (!ok) return null;
  }
  // The height cap over every column the peak spans.
  const row = Math.floor((baseY - 1) / CELL);
  const columns = [x + 3, x + (sprite.w >> 1), right - 3];
  for (const fx of columns) {
    const col = Math.floor(fx / CELL);
    if (y < rangeTop(field, col, row) - PEAKS.capPx) return null;
    if (cellIs(field.featured, field, fx, y)) {
      const bottom = (Math.floor(y / CELL) + 1) * CELL;
      if (bottom - y > PEAKS.objectRisePx) return null;
    }
  }
  return {
    key: sprite.key,
    x,
    y,
    w: sprite.w,
    h: sprite.h,
    baseX: Math.round(bx),
    baseY,
    spill,
  };
}

const TIER_RANK: Readonly<Record<PeakTier, number>> = {
  summit: 2,
  peak: 1,
  foothill: 0,
};

/** The tier a foot wants, from how deep it stands in the range. */
function tierAt(inland: number, depth: number, roll: number): PeakTier {
  if (depth < PEAKS.edgeDepth) return "foothill";
  if (inland <= 1) return roll < 0.62 ? "foothill" : "peak";
  if (inland === 2)
    return roll < 0.22 ? "foothill" : roll < 0.8 ? "peak" : "summit";
  return roll < 0.1 ? "foothill" : roll < 0.55 ? "peak" : "summit";
}

/** A foot on the candidate grid (gi, gj), tried in priority order. */
export interface PeakCandidate {
  readonly bx: number;
  readonly by: number;
  readonly gi: number;
  readonly gj: number;
  /** Grid index gj * cols + gi. */
  readonly idx: number;
  /** Row-major index of the cell the foot lies in. */
  readonly cell: number;
  readonly tier: PeakTier;
  readonly family: GroundTerrain;
  readonly spill: boolean;
  readonly priority: number;
}
type Candidate = PeakCandidate;

/** The sprites a candidate may try, best first; a hash rotates each tier. */
const TIERS_FROM: Readonly<Record<PeakTier, readonly PeakTier[]>> = {
  summit: ["summit", "peak", "foothill"],
  peak: ["peak", "foothill"],
  foothill: ["foothill"],
};

/** Each table's sprites by family and tier, filtered once. */
const tierLists = new WeakMap<PeakTable, Map<string, readonly PeakSprite[]>>();

function tierList(
  table: PeakTable,
  family: GroundTerrain,
  tier: PeakTier,
): readonly PeakSprite[] {
  let lists = tierLists.get(table);
  if (lists === undefined) {
    lists = new Map();
    tierLists.set(table, lists);
  }
  const key = `${family}:${tier}`;
  let list = lists.get(key);
  if (list === undefined) {
    list = table[family].filter((s) => s.tier === tier);
    lists.set(key, list);
  }
  return list;
}

function options(table: PeakTable, c: Candidate): readonly PeakSprite[] {
  const out: PeakSprite[] = [];
  TIERS_FROM[c.tier].forEach((tier, t) => {
    const list = tierList(table, c.family, tier);
    const start = Math.floor(unit(c.gi, c.gj, 11 + t) * list.length);
    for (let k = 0; k < list.length; k += 1) {
      const sprite = list[(start + k) % list.length];
      if (sprite !== undefined) out.push(sprite);
    }
  });
  return out;
}

/** The candidate foot at grid point (gi, gj), or null. */
function candidateAt(
  field: PeakField,
  gi: number,
  gj: number,
  cols: number,
): Candidate | null {
  const G = PEAKS.grid;
  const bx = (gi + unit(gi, gj, 1)) * G;
  const by = (gj + unit(gi, gj, 2)) * G;
  const cx = Math.floor(bx / CELL);
  const cy = Math.floor(by / CELL);
  if (cx >= field.width || cy >= field.height) return null;
  const i = cy * field.width + cx;
  if (field.near[i] !== 1) return null;
  const depth = peakDepth(field, bx, by - 1);
  if (depth <= -PEAKS.spillDepth) return null;
  const spill = depth <= 0;
  if (spill && unit(gi, gj, 3) >= PEAKS.spillKeep) return null;
  const set = field.family[i] ?? 255;
  const family = GROUNDS[set];
  if (family === undefined) return null;
  const tier = spill
    ? "foothill"
    : tierAt(field.inland[i] ?? 0, depth, unit(gi, gj, 4));
  return {
    bx,
    by,
    gi,
    gj,
    idx: gj * cols + gi,
    cell: i,
    tier,
    family,
    spill,
    priority: TIER_RANK[tier] + unit(gi, gj, 5),
  };
}

/** The order candidates are tried in: priority, then grid row and column. */
const byPriority = (a: Candidate, b: Candidate): number =>
  b.priority - a.priority || a.gj - b.gj || a.gi - b.gi;

/**
 * The peak a candidate keeps, given the peaks kept before it round it
 * (`nearby`: the 3 x 3 bins round its foot), or null.
 */
function choosePeak(
  field: PeakField,
  table: PeakTable,
  c: Candidate,
  nearby: readonly PlacedPeak[],
): PlacedPeak | null {
  // The first sprite with no copy within repeatPx, else the one whose
  // nearest copy is farthest: a repeat never costs the range a peak.
  let chosen: PlacedPeak | null = null;
  let chosenTier: PeakTier = "foothill";
  let farthest = -1;
  for (const sprite of options(table, c)) {
    const peak = fit(field, sprite, c.bx, c.by, c.spill);
    if (peak === null) continue;
    let nearest: number = PEAKS.repeatPx;
    for (const o of nearby)
      if (o.key === peak.key)
        nearest = Math.min(
          nearest,
          Math.hypot(o.baseX - peak.baseX, o.baseY - peak.baseY),
        );
    if (nearest > farthest) {
      farthest = nearest;
      chosen = peak;
      chosenTier = sprite.tier;
    }
    if (nearest >= PEAKS.repeatPx) break;
  }
  if (chosen === null || farthest < PEAKS.repeatMinPx) return null;
  const peak = chosen;
  // Inside a range a foothill only fills a real hole: small sprites
  // between the big ones read as rubble.
  const cell = Math.floor(c.by / CELL) * field.width + Math.floor(c.bx / CELL);
  const filler = chosenTier === "foothill" && (field.inland[cell] ?? 0) >= 2;
  const k = PEAK_SPACING[c.family] * (filler ? PEAKS.fillerSpacing : 1);
  const crowded = nearby.some((o) => {
    const rx = (k * PEAKS.xGap * (o.w + peak.w)) / 2;
    const ry = (k * PEAKS.yGap * (o.h + peak.h)) / 2;
    const ex = (o.baseX - peak.baseX) / rx;
    const ey = (o.baseY - peak.baseY) / ry;
    return ex * ex + ey * ey < 1;
  });
  return crowded ? null : peak;
}

/**
 * The foothill closing a hole at rock point (wx, wy) of cell `i`, given the
 * peaks kept so far round it, or null when no hole is there.
 */
function holePeak(
  field: PeakField,
  table: PeakTable,
  wx: number,
  wy: number,
  i: number,
  nearby: readonly PlacedPeak[],
): PlacedPeak | null {
  if (peakDepth(field, wx, wy) < PEAKS.underInset) return null;
  if (nearby.some((p) => bodyCovers(p, wx, wy))) return null;
  const family = GROUNDS[field.family[i] ?? 255];
  if (family === undefined) return null;
  const list = tierList(table, family, "foothill");
  const start = Math.floor(unit(wx, wy, 21) * list.length);
  for (let k = 0; k < list.length; k += 1) {
    const sprite = list[(start + k) % list.length];
    if (sprite === undefined) continue;
    const foot = wy + Math.round(sprite.h * 0.45);
    const peak = fit(field, sprite, wx, foot, false);
    if (peak === null || !bodyCovers(peak, wx, wy)) continue;
    const repeated = nearby.some(
      (o) =>
        o.key === peak.key &&
        Math.hypot(o.baseX - peak.baseX, o.baseY - peak.baseY) <
          PEAKS.repeatMinPx,
    );
    if (repeated) continue;
    return peak;
  }
  return null;
}

/** Two placements of a peak are the same sprite on the same spot. */
function samePeak(a: PlacedPeak | null, b: PlacedPeak | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.key === b.key &&
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    a.baseX === b.baseX &&
    a.baseY === b.baseY &&
    a.spill === b.spill
  );
}

/**
 * A placement of the peaks that {@link updatePeaks} can bring up to date
 * after a few cells change (bead xaj.31), plus what it needs for that.
 */
export interface PeakPlacement {
  readonly field: PeakField;
  readonly table: PeakTable;
  /** Every peak, sorted by base (north to south): placePeaks' result. */
  readonly peaks: readonly PlacedPeak[];
  /** The candidate feet in the order they were tried. */
  readonly candidates: readonly Candidate[];
  /** The peak each candidate kept, by grid index. */
  readonly kept: readonly (PlacedPeak | undefined)[];
  /**
   * The foothills closing holes, by segment (a row of hole points inside
   * one cell: hole row * width + cell column), indexed by point within it.
   */
  readonly holes: ReadonlyMap<number, readonly (PlacedPeak | undefined)[]>;
  /**
   * After an update, the peaks gone and the peaks new since the previous
   * placement (everything else is the very same objects); absent after a
   * full placement.
   */
  readonly changes?: {
    readonly removed: readonly PlacedPeak[];
    readonly added: readonly PlacedPeak[];
  };
}

const byBase = (a: PlacedPeak, b: PlacedPeak): number =>
  a.baseY - b.baseY || a.baseX - b.baseX;

/** Every peak of the map's ranges, sorted by base (north to south). */
export function placePeaks(field: PeakField, table: PeakTable): PlacedPeak[] {
  return [...placePeakSet(field, table).peaks];
}

/** {@link placePeaks} with what {@link updatePeaks} needs to follow on. */
export function placePeakSet(
  field: PeakField,
  table: PeakTable,
): PeakPlacement {
  return placeFrom(field, table, null, null);
}

/**
 * How far, in cells, a change of one cell's facts can reach the feet whose
 * peaks it decides: the widest half sprite across, the tallest sprite (and
 * the bilinear field and the hole's foot below the point) up and down.
 */
export function peakReach(table: PeakTable): { x: number; y: number } {
  let w = 0;
  let h = 0;
  for (const list of Object.values(table) as (readonly PeakSprite[])[])
    for (const s of list) {
      w = Math.max(w, s.w);
      h = Math.max(h, s.h);
    }
  return {
    x: Math.ceil((w / 2 + 4) / CELL) + 2,
    y: Math.ceil(h / CELL) + 2,
  };
}

/**
 * The placement for a field that differs from `prev.field` only in some
 * cells' open and object facts (a pickup taken, an object added): only the
 * feet near those cells, and those whose neighbours' choice changed, are
 * tried again. The result equals {@link placePeakSet} of `field` exactly
 * (tests/render/terrain-plan.test.ts); when the rock itself changed (an
 * object on a Mountain cell) everything is placed again.
 */
export function updatePeaks(
  prev: PeakPlacement,
  field: PeakField,
  table: PeakTable,
): PeakPlacement {
  const old = prev.field;
  if (
    table !== prev.table ||
    old.width !== field.width ||
    old.height !== field.height
  )
    return placePeakSet(field, table);
  const n = field.width * field.height;
  const changed: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (
      old.rock[i] !== field.rock[i] ||
      old.near[i] !== field.near[i] ||
      old.inland[i] !== field.inland[i] ||
      old.family[i] !== field.family[i]
    )
      return placePeakSet(field, table);
    if (
      old.open[i] !== field.open[i] ||
      old.featured[i] !== field.featured[i] ||
      old.wood[i] !== field.wood[i]
    )
      changed.push(i);
  }
  if (changed.length === 0)
    return { ...prev, field, changes: { removed: [], added: [] } };
  const reach = peakReach(table);
  const dirty = new Uint8Array(n);
  for (const i of changed) {
    const x = i % field.width;
    const y = Math.floor(i / field.width);
    for (
      let yy = Math.max(0, y - reach.y);
      yy <= Math.min(field.height - 1, y + reach.y);
      yy += 1
    )
      for (
        let xx = Math.max(0, x - reach.x);
        xx <= Math.min(field.width - 1, x + reach.x);
        xx += 1
      )
        dirty[yy * field.width + xx] = 1;
  }
  return placeFrom(field, table, prev, dirty);
}

/**
 * The placement itself. Peaks are kept greedily in priority order, each
 * against the peaks kept before it in the 3 x 3 bins round its foot, then
 * holes are closed in scan order. With `prev` and the `dirty` cells, a foot
 * reuses its previous choice unless it lies in a dirty cell or a choice that
 * changed earlier in the order lies in its bins (`since`), which is exactly
 * when its inputs can differ from the previous run.
 */
function placeFrom(
  field: PeakField,
  table: PeakTable,
  prev: PeakPlacement | null,
  dirty: Uint8Array | null,
): PeakPlacement {
  const { width, height } = field;
  const G = PEAKS.grid;
  const cols = Math.ceil((width * CELL) / G);
  const rows = Math.ceil((height * CELL) / G);
  const again = prev !== null && dirty !== null;
  // Kept peaks by coarse bins, for the spacing and repeat tests: a dense
  // grid with a margin, so the bins beside any foot or base exist.
  const BIN = PEAKS.repeatPx;
  const binsX = Math.floor((width * CELL) / BIN) + 3;
  const binsY = Math.floor((height * CELL) / BIN) + 3;
  const bins: (PlacedPeak[] | undefined)[] = new Array<
    PlacedPeak[] | undefined
  >(binsX * binsY).fill(undefined);
  const binOf = (x: number, y: number): number =>
    (Math.floor(y / BIN) + 1) * binsX + Math.floor(x / BIN) + 1;
  const around = (x: number, y: number): PlacedPeak[] => {
    const out: PlacedPeak[] = [];
    const b = binOf(x, y);
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const list = bins[b + dy * binsX + dx];
        if (list !== undefined) out.push(...list);
      }
    return out;
  };
  const bin = (peak: PlacedPeak): void => {
    const b = binOf(peak.baseX, peak.baseY);
    const list = bins[b];
    if (list === undefined) bins[b] = [peak];
    else list.push(peak);
  };
  // Incremental bookkeeping: per bin (spread to its 8 neighbours), the
  // earliest candidate from which the kept peaks round it may differ from
  // the previous run; `touched` marks the bins any change reaches (holes
  // come after every candidate, so any change there matters to them).
  const since: (Candidate | undefined)[] = new Array<Candidate | undefined>(
    binsX * binsY,
  ).fill(undefined);
  let anySince = false;
  const touched = new Uint8Array(binsX * binsY);
  const register = (peak: PlacedPeak, at: Candidate | null): void => {
    const b = binOf(peak.baseX, peak.baseY);
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const k = b + dy * binsX + dx;
        touched[k] = 1;
        if (at === null) continue;
        const was = since[k];
        if (was === undefined || byPriority(at, was) < 0) since[k] = at;
        anySince = true;
      }
  };
  let order: Candidate[];
  /** Grid index -> the previous candidate there, in a dirty cell. */
  const dropped = new Map<number, Candidate>();
  /** Peaks gone and new since `prev`. */
  const removed: PlacedPeak[] = [];
  const added: PlacedPeak[] = [];
  let kept: (PlacedPeak | undefined)[];
  if (!again) {
    order = [];
    for (let gj = 0; gj < rows; gj += 1)
      for (let gi = 0; gi < cols; gi += 1) {
        const c = candidateAt(field, gi, gj, cols);
        if (c !== null) order.push(c);
      }
    order.sort(byPriority);
    kept = new Array<PlacedPeak | undefined>(cols * rows).fill(undefined);
  } else {
    kept = prev.kept.slice();
    const staying: Candidate[] = [];
    for (const c of prev.candidates)
      if (dirty[c.cell] === 1) {
        dropped.set(c.idx, c);
        kept[c.idx] = undefined;
      } else staying.push(c);
    // Every candidate in a dirty cell is found again (they are the fresh
    // ones); none elsewhere.
    const found: Candidate[] = [];
    for (let cy = 0; cy < height; cy += 1)
      for (let cx = 0; cx < width; cx += 1) {
        if (dirty[cy * width + cx] !== 1) continue;
        // The grid points whose jittered foot may lie in this cell.
        const gi0 = Math.max(0, Math.floor((cx * CELL) / G) - 1);
        const gi1 = Math.min(cols - 1, Math.floor(((cx + 1) * CELL) / G));
        const gj0 = Math.max(0, Math.floor((cy * CELL) / G) - 1);
        const gj1 = Math.min(rows - 1, Math.floor(((cy + 1) * CELL) / G));
        for (let gj = gj0; gj <= gj1; gj += 1)
          for (let gi = gi0; gi <= gi1; gi += 1) {
            const bx = (gi + unit(gi, gj, 1)) * G;
            const by = (gj + unit(gi, gj, 2)) * G;
            if (Math.floor(bx / CELL) !== cx || Math.floor(by / CELL) !== cy)
              continue;
            const c = candidateAt(field, gi, gj, cols);
            if (c !== null) found.push(c);
          }
      }
    found.sort(byPriority);
    const foundAt = new Map<number, Candidate>();
    for (const c of found) foundAt.set(c.idx, c);
    // A dropped foot that kept a peak and does not come back at the same
    // place in the order changes what every later foot round it sees.
    for (const [idx, c] of dropped) {
      const peak = prev.kept[idx];
      if (peak === undefined) continue;
      if (!foundAt.has(idx)) removed.push(peak);
      if (foundAt.get(idx)?.priority === c.priority) continue;
      register(peak, c);
    }
    order = mergeSorted(staying, found, byPriority);
  }
  const out: PlacedPeak[] = [];
  for (const c of order) {
    let peak: PlacedPeak | null;
    if (!again) peak = choosePeak(field, table, c, around(c.bx, c.by));
    else {
      const before = prev.kept[c.idx] ?? null;
      const fresh = dirty[c.cell] === 1;
      let redo = fresh;
      if (!redo && anySince) {
        const s = since[binOf(c.bx, c.by)];
        redo = s !== undefined && byPriority(s, c) < 0;
      }
      if (!redo) peak = before;
      else {
        peak = choosePeak(field, table, c, around(c.bx, c.by));
        // At its old place in the order a foot changes what later feet
        // see only if its choice changed; at a new place (or new) its peak
        // is news to every later foot (the old one was registered above).
        const sameSlot = !fresh || dropped.get(c.idx)?.priority === c.priority;
        const same = samePeak(before, peak);
        if (same) peak = before;
        if (!sameSlot) {
          if (peak !== null) register(peak, c);
        } else if (!same) {
          if (before !== null) register(before, c);
          if (peak !== null) register(peak, c);
        }
        if (!same) {
          if (before !== null) removed.push(before);
          if (peak !== null) added.push(peak);
        }
      }
    }
    kept[c.idx] = peak ?? undefined;
    if (peak === null) continue;
    out.push(peak);
    bin(peak);
  }
  // Holes: a point of the range's inside that no peak's body covers gets a
  // foothill whose body does, so the spacing above can stay generous. The
  // points are scanned row by row; each run of a row inside one cell is a
  // segment, and a segment of an untouched cell reuses its previous holes.
  const H = PEAKS.holeGrid;
  const holes = new Map<number, readonly (PlacedPeak | undefined)[]>();
  for (let wy = 0, hj = 0; wy < height * CELL; wy += H, hj += 1) {
    const cy = Math.floor(wy / CELL);
    for (let cx = 0; cx < width; cx += 1) {
      const i = cy * width + cx;
      if (field.rock[i] !== 1) continue;
      const seg = hj * width + cx;
      // The segment's points: wx = k * H inside the cell.
      const wx0 = Math.ceil((cx * CELL) / H) * H;
      const before = again ? prev.holes.get(seg) : undefined;
      if (
        again &&
        dirty[i] !== 1 &&
        touched[binOf(wx0, wy)] !== 1 &&
        touched[binOf((cx + 1) * CELL - 1, wy)] !== 1
      ) {
        if (before === undefined) continue;
        holes.set(seg, before);
        for (const peak of before)
          if (peak !== undefined) {
            out.push(peak);
            bin(peak);
          }
        continue;
      }
      let list: (PlacedPeak | undefined)[] | undefined;
      for (let wx = wx0, k = 0; wx < (cx + 1) * CELL; wx += H, k += 1) {
        const was = before?.[k] ?? null;
        let peak: PlacedPeak | null;
        if (again && dirty[i] !== 1 && touched[binOf(wx, wy)] !== 1) peak = was;
        else {
          peak = holePeak(field, table, wx, wy, i, around(wx, wy));
          if (again) {
            if (samePeak(was, peak)) peak = was;
            else {
              if (was !== null) {
                register(was, null);
                removed.push(was);
              }
              if (peak !== null) {
                register(peak, null);
                added.push(peak);
              }
            }
          }
        }
        if (peak === null) continue;
        list ??= [];
        list[k] = peak;
        out.push(peak);
        bin(peak);
      }
      if (list !== undefined) holes.set(seg, list);
    }
  }
  // The peaks in base order (ties in the order kept): after an update the
  // previous order with the changes merged in, unless a change ties.
  const peaks =
    (again
      ? updateSorted(prev.peaks, new Set(removed), added, byBase)
      : null) ?? out.sort(byBase);
  return {
    field,
    table,
    peaks,
    candidates: order,
    kept,
    holes,
    ...(again ? { changes: { removed, added } } : {}),
  };
}

/** Whether a peak's body (roughly a blunt triangle) covers a world point. */
function bodyCovers(peak: PlacedPeak, wx: number, wy: number): boolean {
  if (wy < peak.y || wy >= peak.baseY) return false;
  const t = (wy - peak.y) / peak.h;
  const half = (peak.w / 2) * (0.25 + 0.65 * t);
  return Math.abs(wx - (peak.x + peak.w / 2)) <= half;
}

/** The underlay's tone per family: a mid shadow of the family's rock. */
export const PEAK_UNDER: Readonly<
  Record<GroundTerrain, readonly [number, number, number]>
> = {
  grass: [52, 96, 60],
  jungle: [104, 108, 88],
  steppe: [132, 106, 68],
  badlands: [140, 74, 48],
  wasteland: [58, 54, 60],
  volcanic: [58, 54, 60],
};

/**
 * Paints the underlay into a chunk's RGBA pixels (2 px blocks), inside the
 * outline and inset from it, so it only ever shows through pinholes between
 * sprites. Returns whether anything was painted.
 */
export function paintPeakUnder(
  field: PeakField,
  x0: number,
  y0: number,
  w: number,
  h: number,
  data: Uint8ClampedArray,
): boolean {
  // Skip a chunk with no rock in or beside it.
  const c0 = Math.max(0, Math.floor(x0 / CELL) - 1);
  const c1 = Math.min(field.width - 1, Math.floor((x0 + w) / CELL) + 1);
  const r0 = Math.max(0, Math.floor(y0 / CELL) - 1);
  const r1 = Math.min(field.height - 1, Math.floor((y0 + h) / CELL) + 1);
  let any = false;
  for (let r = r0; r <= r1 && !any; r += 1)
    for (let c = c0; c <= c1; c += 1)
      if (field.rock[r * field.width + c] === 1) {
        any = true;
        break;
      }
  if (!any) return false;
  let painted = false;
  for (let py = 0; py < h; py += 2)
    for (let px = 0; px < w; px += 2) {
      const wx = x0 + px;
      const wy = y0 + py;
      const cx = Math.floor(wx / CELL);
      const cy = Math.floor(wy / CELL);
      if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) continue;
      const i = cy * field.width + cx;
      if (field.rock[i] !== 1) continue;
      if (peakDepth(field, wx + 1, wy + 1) < PEAKS.underInset) continue;
      const family = GROUNDS[field.family[i] ?? 255];
      if (family === undefined) continue;
      const [r, g, b] = PEAK_UNDER[family];
      for (let dy = 0; dy < 2 && py + dy < h; dy += 1)
        for (let dx = 0; dx < 2 && px + dx < w; dx += 1) {
          const o = ((py + dy) * w + px + dx) * 4;
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = b;
          data[o + 3] = 255;
        }
      painted = true;
    }
  return painted;
}
