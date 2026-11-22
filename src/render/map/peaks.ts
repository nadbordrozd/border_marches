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
import { CELL_PX } from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
import type { GameMap } from "../../core/map/types";
import type { CanopyTree } from "./canopy";
import { hash4 } from "./hash";

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
      family[i] = GROUNDS.indexOf(cell.terrain);
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

interface Candidate {
  readonly bx: number;
  readonly by: number;
  readonly gi: number;
  readonly gj: number;
  readonly tier: PeakTier;
  readonly family: GroundTerrain;
  readonly spill: boolean;
  readonly priority: number;
}

/** The sprites a candidate may try, best first; a hash rotates each tier. */
function options(table: PeakTable, c: Candidate): readonly PeakSprite[] {
  const all = table[c.family];
  const order: PeakTier[] =
    c.tier === "summit"
      ? ["summit", "peak", "foothill"]
      : c.tier === "peak"
        ? ["peak", "foothill"]
        : ["foothill"];
  const out: PeakSprite[] = [];
  order.forEach((tier, t) => {
    const list = all.filter((s) => s.tier === tier);
    const start = Math.floor(unit(c.gi, c.gj, 11 + t) * list.length);
    for (let k = 0; k < list.length; k += 1) {
      const sprite = list[(start + k) % list.length];
      if (sprite !== undefined) out.push(sprite);
    }
  });
  return out;
}

/** Every peak of the map's ranges, sorted by base (north to south). */
export function placePeaks(field: PeakField, table: PeakTable): PlacedPeak[] {
  const G = PEAKS.grid;
  const cols = Math.ceil((field.width * CELL) / G);
  const rows = Math.ceil((field.height * CELL) / G);
  const candidates: Candidate[] = [];
  for (let gj = 0; gj < rows; gj += 1)
    for (let gi = 0; gi < cols; gi += 1) {
      const bx = (gi + unit(gi, gj, 1)) * G;
      const by = (gj + unit(gi, gj, 2)) * G;
      const cx = Math.floor(bx / CELL);
      const cy = Math.floor(by / CELL);
      if (cx >= field.width || cy >= field.height) continue;
      const i = cy * field.width + cx;
      if (field.near[i] !== 1) continue;
      const depth = peakDepth(field, bx, by - 1);
      if (depth <= -PEAKS.spillDepth) continue;
      const spill = depth <= 0;
      if (spill && unit(gi, gj, 3) >= PEAKS.spillKeep) continue;
      const set = field.family[i] ?? 255;
      const family = GROUNDS[set];
      if (family === undefined) continue;
      const tier = spill
        ? "foothill"
        : tierAt(field.inland[i] ?? 0, depth, unit(gi, gj, 4));
      candidates.push({
        bx,
        by,
        gi,
        gj,
        tier,
        family,
        spill,
        priority: TIER_RANK[tier] + unit(gi, gj, 5),
      });
    }
  candidates.sort(
    (a, b) => b.priority - a.priority || a.gj - b.gj || a.gi - b.gi,
  );
  // Kept peaks by coarse bins, for the spacing and repeat tests.
  const BIN = PEAKS.repeatPx;
  const bins = new Map<number, PlacedPeak[]>();
  const binKey = (x: number, y: number): number =>
    Math.floor(y / BIN) * 4096 + Math.floor(x / BIN);
  const around = (x: number, y: number): PlacedPeak[] => {
    const out: PlacedPeak[] = [];
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const list = bins.get(binKey(x + dx * BIN, y + dy * BIN));
        if (list !== undefined) out.push(...list);
      }
    return out;
  };
  const out: PlacedPeak[] = [];
  for (const c of candidates) {
    const nearby = around(c.bx, c.by);
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
    if (chosen === null || farthest < PEAKS.repeatMinPx) continue;
    const peak = chosen;
    // Inside a range a foothill only fills a real hole: small sprites
    // between the big ones read as rubble.
    const cell =
      Math.floor(c.by / CELL) * field.width + Math.floor(c.bx / CELL);
    const filler = chosenTier === "foothill" && (field.inland[cell] ?? 0) >= 2;
    const k = PEAK_SPACING[c.family] * (filler ? PEAKS.fillerSpacing : 1);
    const crowded = nearby.some((o) => {
      const rx = (k * PEAKS.xGap * (o.w + peak.w)) / 2;
      const ry = (k * PEAKS.yGap * (o.h + peak.h)) / 2;
      const ex = (o.baseX - peak.baseX) / rx;
      const ey = (o.baseY - peak.baseY) / ry;
      return ex * ex + ey * ey < 1;
    });
    if (crowded) continue;
    out.push(peak);
    const key = binKey(peak.baseX, peak.baseY);
    const list = bins.get(key);
    if (list === undefined) bins.set(key, [peak]);
    else list.push(peak);
  }
  // Holes: a point of the range's inside that no peak's body covers gets a
  // foothill whose body does, so the spacing above can stay generous.
  const H = PEAKS.holeGrid;
  for (let wy = 0; wy < field.height * CELL; wy += H)
    for (let wx = 0; wx < field.width * CELL; wx += H) {
      const i = Math.floor(wy / CELL) * field.width + Math.floor(wx / CELL);
      if (field.rock[i] !== 1) continue;
      if (peakDepth(field, wx, wy) < PEAKS.underInset) continue;
      const nearby = around(wx, wy);
      if (nearby.some((p) => bodyCovers(p, wx, wy))) continue;
      const family = GROUNDS[field.family[i] ?? 255];
      if (family === undefined) continue;
      const list = table[family].filter((s) => s.tier === "foothill");
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
        out.push(peak);
        const key = binKey(peak.baseX, peak.baseY);
        const kept = bins.get(key);
        if (kept === undefined) bins.set(key, [peak]);
        else kept.push(peak);
        break;
      }
    }
  return out.sort((a, b) => a.baseY - b.baseY || a.baseX - b.baseX);
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
