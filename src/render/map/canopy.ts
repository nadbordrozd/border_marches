/**
 * Forests as one dense canopy of small trees (bead border_marches-xaj.26),
 * after the Heroes of Might and Magic II adventure map: a crowd of small
 * individual trees whose crowns overlap into one mass with ragged natural
 * edges, low enough that a unit behind the wood stays half visible, and no
 * cell grid or repeated block anywhere.
 *
 * - THE REGION is the 0.5 contour of a smooth field over the Forest cells
 *   (bilinear between cell centres, so corners round off) plus a wobble of
 *   waves over world pixels: the outline wanders up to about 19 px either
 *   side of the cell edges. It may cross into a neighbouring cell only where
 *   that cell is free ground (land without an obstacle, road or object);
 *   elsewhere it stops at the cell edge.
 * - TREES stand on blue noise sampled at world coordinates: one hashed
 *   candidate per GRID-px square, kept when it has the highest priority among
 *   the valid candidates within an ellipse round it (Matern type II). Every
 *   tree is a pure function of the map round it, so nothing depends on scan
 *   order, zoom or exploration.
 * - SPILL: a share of candidates in a band just outside the region become
 *   decorative trees on free ground; never on a road, an object or an
 *   entrance (the objects' cells), never on water or rock.
 * - HEIGHT CAP: a crown rises at most CANOPY.capPx above the top edge of the
 *   northernmost Forest cell of its column (a taller variant is swapped for
 *   the shortest of its species, else the tree is dropped), and at most
 *   CANOPY.objectRisePx into a cell holding an object.
 * - SPECIES per ground terrain, with weights and slow noise so that kinds
 *   gather in loose patches; the variant is a hash of the tree.
 * - Bead xaj.27 (closed, calmer woods): per-ground spacing and under-tint
 *   (CANOPY_GROUND); clumped species (autumn) only in slow-noise drifts;
 *   blocked neighbours pull the outline inside the wood so it wobbles there
 *   instead of being clipped along a cell edge; bays near the edge
 *   (canopyBite); no clearings deep inside the cells (CANOPY.solid).
 *
 * Drawing (scene.ts, map-view.ts): every tree is a TALL_BODY entry sorted by
 * its base, painted into the cached ground chunks; the parts of a row's
 * crowns that rise above the row's top edge are painted once more into
 * cached BAND canvases drawn in the foreground just before that row, so the
 * crowns cover the feet of units and objects standing behind the wood.
 */
import { CELL_PX, GROUND_FAMILY } from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
import type { GameMap } from "../../core/map/types";
import { hash4 } from "./hash";
import { updateSorted } from "./sorted";

const CELL = CELL_PX;
const TURN = (2 * Math.PI) / (CELL * 3);

/** One tree image a species may draw. */
export interface TreeSprite {
  readonly key: string;
  readonly w: number;
  readonly h: number;
}

/** A kind of tree on one ground: its relative weight and its variants. */
export interface TreeSpecies {
  readonly name: string;
  readonly weight: number;
  readonly sprites: readonly TreeSprite[];
  /**
   * A clumped species (bead xaj.27: the autumn trees of the grass woods)
   * grows only in drifts: where a slow noise rises past this level (0-1).
   */
  readonly drift?: number;
}

/** Per-ground spacing scale of the trunks and strength of the under-tint. */
export interface CanopyGround {
  /** Multiplies the exclusion ellipse: below 1 packs crowns closer. */
  readonly spacing: number;
  /** Multiplies the under-canopy tint alphas. */
  readonly tint: number;
}

export type TreeSpeciesTable = Readonly<
  Record<GroundTerrain, readonly TreeSpecies[]>
>;

export const CANOPY = {
  /** Candidate spacing, px. */
  grid: 8,
  /** Half-axes of the exclusion ellipse between trunks, px. */
  rx: 12,
  ry: 8,
  /** Highest a crown rises above the top of the wood's northern cells, px. */
  capPx: 40,
  /** Deepest a crown reaches into a cell with an object, px. */
  objectRisePx: 14,
  /** The spill band beyond the region, in field units (1 = a cell). */
  spillDepth: 0.24,
  /** Share of spill-band candidates that may become trees. */
  spillKeep: 0.3,
  /** Share of the spill trees that survive the spacing test. */
  spillThin: 0.4,
  /** The forest field's value on cells where no tree may stand. */
  blocked: -2.5,
  /** Where the forest field passes this, the canopy is always closed. */
  solid: 0.8,
  /** The region's offset south of the Forest cells, px. */
  shift: 12,
  /** How far (px) a tree looks for the ground whose species it grows. */
  setJitter: 28,
  /** Wobble of the outline, field units (sum of three waves). */
  wobble: [0.22, 0.12, 0.06],
  /** Amplitude of the noise lobes of the outline, field units. */
  lobes: 0.26,
  /**
   * Bites (bead xaj.27): where a slow noise rises past `biteLevel`, the
   * outline is pulled in by up to `bite` field units, so a medium wood
   * loses its rectangle to bays and lobes.
   */
  bite: 0.55,
  biteLevel: 0.56,
  biteSpacing: CELL * 1.25,
  /** Spacing of the drift noise of clumped species, px. */
  driftSpacing: CELL * 1.9,
  /** Depth (px) inside the outline over which the trees thin out. */
  edgeFade: 36,
  /** Share of trees kept right at the outline. */
  edgeKeep: 0.35,
  /** Tint under the canopy: depth (px) of the light rim, alphas. */
  tintRim: 8,
  tintAlpha: 0.4,
  tintRimAlpha: 0.18,
  /** Inset of the tint from the region's outline, px. */
  tintInset: 14,
  /** The tint is the region moved this far north, px. */
  tintLift: 20,
} as const;

/**
 * Per-ground density and tint (bead xaj.27): the green woods close into one
 * canopy; badlands scrub packs tighter over its bright red earth, which needs
 * a stronger shade to stop reading as gaps; the dead wasteland trees are
 * see-through, so they keep their spacing and a lighter shade.
 */
export const CANOPY_GROUND: Readonly<Record<GroundTerrain, CanopyGround>> = {
  grass: { spacing: 0.86, tint: 1.25 },
  jungle: { spacing: 0.9, tint: 1.2 },
  steppe: { spacing: 0.92, tint: 1 },
  badlands: { spacing: 0.86, tint: 1.45 },
  wasteland: { spacing: 1, tint: 0.85 },
  // Volcanic ground grows the wasteland's dead trees (GROUND_FAMILY).
  volcanic: { spacing: 1, tint: 0.85 },
  // Snowy conifers pack like the green woods; a lighter under-tint, so the
  // gaps read as snow in shade.
  snow: { spacing: 0.86, tint: 0.7 },
};

/** Per-cell facts of the canopy, computed once per map. */
export interface CanopyField {
  readonly width: number;
  readonly height: number;
  /** 1 on a Forest cell of land. */
  readonly forest: Uint8Array;
  /** 1 on free land: no obstacle, road or object (spill may lie there). */
  readonly open: Uint8Array;
  /** 1 on a cell under an object (or its entrance). */
  readonly featured: Uint8Array;
  /** 1 on a Forest cell or one of its eight neighbours. */
  readonly near: Uint8Array;
  /** Ground terrain whose trees grow here (GROUND index), 255 none. */
  readonly set: Uint8Array;
}

const GROUNDS: readonly GroundTerrain[] = [
  "grass",
  "jungle",
  "steppe",
  "badlands",
  "wasteland",
  "snow",
];

/** The canopy facts of a map; `featured` are the cells under objects. */
export function buildCanopyField(
  map: GameMap,
  featured: ReadonlySet<number> = new Set(),
): CanopyField {
  const { width, height } = map;
  const n = width * height;
  const forest = new Uint8Array(n);
  const open = new Uint8Array(n);
  const feat = new Uint8Array(n);
  const near = new Uint8Array(n);
  const set = new Uint8Array(n).fill(255);
  map.cells.forEach((cell, i) => {
    if (featured.has(i)) feat[i] = 1;
    if (cell.terrain === "water") return;
    if (cell.obstacle === "forest") {
      forest[i] = 1;
      set[i] = GROUNDS.indexOf(GROUND_FAMILY[cell.terrain]);
    } else if (cell.obstacle === "none" && !cell.road && !featured.has(i))
      open[i] = 1;
  });
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (forest[i] === 1) {
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const ax = x + dx;
            const ay = y + dy;
            if (ax >= 0 && ay >= 0 && ax < width && ay < height)
              near[ay * width + ax] = 1;
          }
        continue;
      }
      // Free ground beside a wood takes the trees of its forest neighbour
      // (orthogonal first).
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const ax = x + dx;
        const ay = y + dy;
        if (ax < 0 || ay < 0 || ax >= width || ay >= height) continue;
        const j = ay * width + ax;
        if (forest[j] === 1) {
          set[i] = set[j] ?? 255;
          break;
        }
      }
    }
  return { width, height, forest, open, featured: feat, near, set };
}

/**
 * The bilinear forest field at a world point: cell centres hold 1 on a
 * Forest cell, 0 on free ground and CANOPY.blocked where no tree may stand
 * (water, rock, a road, an object, off the map), so beside those the
 * outline runs inside the wood and wobbles there instead of being clipped
 * straight along the cell edge.
 */
function forestField(field: CanopyField, wx: number, wy: number): number {
  const { width, height, forest, open } = field;
  const fx = (wx - CELL / 2) / CELL;
  const fy = (wy - CELL / 2) / CELL;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const at = (i: number, j: number): number => {
    if (i < 0 || j < 0 || i >= width || j >= height) return CANOPY.blocked;
    const k = j * width + i;
    if (forest[k] === 1) return 1;
    return open[k] === 1 ? 0 : CANOPY.blocked;
  };
  const a = at(i0, j0);
  const b = at(i0 + 1, j0);
  const c = at(i0, j0 + 1);
  const d = at(i0 + 1, j0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** The outline's wobble at a world point, field units. */
export function canopyWobble(wx: number, wy: number): number {
  const [a, b, c] = CANOPY.wobble;
  return (
    a * Math.sin(TURN * (1.3 * wx + 1.7 * wy) + 0.7) +
    b * Math.sin(TURN * (5 * wx - 4 * wy) + 2.3) +
    c * Math.sin(TURN * (11 * wy + 9 * wx) + 4.1) +
    // Irregular lobes: smooth value noise, so no wave lines up along an edge.
    CANOPY.lobes * (2 * noise(wx, wy, CELL * 0.7, 0x3b) - 1)
  );
}

/**
 * The bays of the outline at a world point, field units (0 or more): a
 * one-sided bite at a slower scale, only near the edge of the wood (`f` is
 * the forest field there), so it shapes the outline and never opens a
 * clearing inside.
 */
export function canopyBite(wx: number, wy: number, f: number): number {
  const n = noise(wx, wy, CANOPY.biteSpacing, 0x3c);
  if (n <= CANOPY.biteLevel) return 0;
  const near = Math.max(0, Math.min(1, (0.9 - f) * 2.5));
  return (CANOPY.bite * near * (n - CANOPY.biteLevel)) / (1 - CANOPY.biteLevel);
}

/**
 * How deep a world point lies inside the canopy region, in field units
 * (about px / 80 near an edge): positive inside, negative outside, -1 where
 * no tree may stand (water, rock, a road, an object, off the map).
 */
export function canopyDepth(
  field: CanopyField,
  wx: number,
  wy: number,
): number {
  const cx = Math.floor(wx / CELL);
  const cy = Math.floor(wy / CELL);
  if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) return -1;
  const i = cy * field.width + cx;
  if (field.forest[i] !== 1 && field.open[i] !== 1) return -1;
  if (field.featured[i] === 1) return -1;
  // The region sits SHIFT px south of the cells: trunks stand low and the
  // crowns rise into the cell, so the cap rarely flattens the north edge.
  const f = forestField(field, wx, wy - CANOPY.shift);
  const raw = f + canopyWobble(wx, wy) - canopyBite(wx, wy, f) - 0.5;
  // Well inside the cells the wobble may not open a clearing (bead xaj.27).
  return Math.max(raw, f - CANOPY.solid);
}

/**
 * The tint under the canopy at a world point: 0 outside, a light rim just
 * inside the outline, the full shade deeper in. Hard steps, no gradient.
 */
export function canopyTint(field: CanopyField, wx: number, wy: number): number {
  // Sampled a little south: the shade sits under the crowns, which rise
  // north of their trunks, so it never shows south of the last trunks.
  const depth = canopyDepth(field, wx + 0.5, wy + 0.5 + CANOPY.tintLift);
  if (depth <= 0) return 0;
  const px = depth * CELL;
  if (px < CANOPY.tintInset) return 0;
  const set =
    field.set[Math.floor(wy / CELL) * field.width + Math.floor(wx / CELL)];
  const ground = GROUNDS[set ?? 255];
  const k = ground === undefined ? 1 : CANOPY_GROUND[ground].tint;
  // A ragged rim: a hashed pixel now and then steps in or out.
  const jitter = (hash4(wx >> 1, wy >> 1, 0x7c, 0x26) % 3) - 1;
  if (px < CANOPY.tintInset + CANOPY.tintRim + jitter * 2)
    return Math.min(0.9, CANOPY.tintRimAlpha * k);
  return Math.min(0.9, CANOPY.tintAlpha * k);
}

/** One placed tree. */
export interface CanopyTree {
  readonly key: string;
  /** Drawn rectangle, world px (whole pixels). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The trunk base, world px (the bottom of the sprite). */
  readonly baseX: number;
  readonly baseY: number;
  /** Stands outside the region (decorative, on free ground). */
  readonly spill: boolean;
}

const unit = (a: number, b: number, salt: number): number =>
  hash4(a, b, salt, 0xc4a0) / 0x1_0000_0000;

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
  const v = (x: number, y: number): number => unit(x, y, salt);
  const top = v(x0, y0) * (1 - ux) + v(x0 + 1, y0) * ux;
  const bottom = v(x0, y0 + 1) * (1 - ux) + v(x0 + 1, y0 + 1) * ux;
  return top * (1 - uy) + bottom * uy;
}

/**
 * The top edge (world px) of the wood above a point in cell (cx, cy): the
 * top of the northernmost Forest cell of the unbroken run of Forest cells in
 * column cx that holds (cx, cy), or that lies just below or above it.
 */
export function woodTop(field: CanopyField, cx: number, cy: number): number {
  const { width, height, forest } = field;
  const isForest = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && forest[y * width + x] === 1;
  let row: number;
  if (isForest(cx, cy)) row = cy;
  else if (isForest(cx, cy - 1)) row = cy - 1;
  else if (isForest(cx, cy + 1)) return (cy + 1) * CELL;
  else return cy * CELL;
  while (isForest(cx, row - 1)) row -= 1;
  return row * CELL;
}

interface Candidate {
  readonly bx: number;
  readonly by: number;
  readonly priority: number;
  readonly tree: CanopyTree;
  /** Chance to stay after the spacing test (thinner near the outline). */
  readonly keep: number;
  /** The exclusion ellipse's scale on the tree's ground. */
  readonly spacing: number;
}

/** Picks a species of `list` at a point: weights times patchy noise. */
function pickSpecies(
  list: readonly TreeSpecies[],
  bx: number,
  by: number,
  roll: number,
): TreeSpecies | undefined {
  let total = 0;
  const scores = list.map((species, k) => {
    let s: number;
    if (species.drift !== undefined) {
      // Clumped: nothing outside its drifts, the full weight inside, with a
      // short ramp so a drift's rim is mixed rather than a hard edge.
      const n = noise(bx, by, CANOPY.driftSpacing, 0x61 + k);
      s = species.weight * Math.max(0, Math.min(1, (n - species.drift) / 0.1));
    } else
      s = species.weight * (0.25 + 1.5 * noise(bx, by, CELL * 1.7, 0x51 + k));
    total += s;
    return s;
  });
  let r = roll * total;
  for (const [k, species] of list.entries()) {
    r -= scores[k] ?? 0;
    if (r < 0) return species;
  }
  return list[list.length - 1];
}

/**
 * The tree a candidate at trunk base (bx, by) would draw, or null when no
 * valid tree fits there.
 */
function candidateTree(
  field: CanopyField,
  species: TreeSpeciesTable,
  bx: number,
  by: number,
  gi: number,
  gj: number,
): { tree: CanopyTree; ground: GroundTerrain } | null {
  // Measured at the drawn trunk base (whole pixels), the point the spill
  // rule speaks of.
  const depth = canopyDepth(field, Math.round(bx), Math.round(by) - 1);
  if (depth <= -CANOPY.spillDepth) return null;
  const spill = depth <= 0;
  if (spill && unit(gi, gj, 7) >= CANOPY.spillKeep) return null;
  // The species of a nearby point's ground, so woods of two grounds mingle
  // along their border instead of changing on a cell edge.
  const setAt = (wx: number, wy: number): number => {
    const cx = Math.floor(wx / CELL);
    const cy = Math.floor(wy / CELL);
    if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) return 255;
    return field.set[cy * field.width + cx] ?? 255;
  };
  const near = setAt(
    bx + (unit(gi, gj, 8) - 0.5) * 2 * CANOPY.setJitter,
    by + (unit(gi, gj, 9) - 0.5) * 2 * CANOPY.setJitter,
  );
  const ground = GROUNDS[near !== 255 ? near : setAt(bx, by)];
  if (ground === undefined) return null;
  const list = species[ground];
  if (list.length === 0) return null;
  const kind = pickSpecies(list, bx, by, unit(gi, gj, 3));
  if (kind === undefined || kind.sprites.length === 0) return null;
  const sprites = [
    kind.sprites[Math.floor(unit(gi, gj, 4) * kind.sprites.length)],
    // The fallback when the pick is too tall: the shortest of the species.
    [...kind.sprites].sort((a, b) => a.h - b.h)[0],
  ];
  for (const sprite of sprites) {
    if (sprite === undefined) continue;
    const tree = fit(field, sprite, bx, by, spill);
    if (tree !== null) return { tree, ground };
  }
  return null;
}

const cellIs = (
  values: Uint8Array,
  field: CanopyField,
  wx: number,
  wy: number,
): boolean => {
  const cx = Math.floor(wx / CELL);
  const cy = Math.floor(wy / CELL);
  if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) return false;
  return values[cy * field.width + cx] === 1;
};

/** The sprite placed with its base at (bx, by), if it obeys every rule. */
function fit(
  field: CanopyField,
  sprite: TreeSprite,
  bx: number,
  by: number,
  spill: boolean,
): CanopyTree | null {
  const x = Math.round(bx - sprite.w / 2);
  const baseY = Math.round(by);
  const y = baseY - sprite.h;
  const right = x + sprite.w - 1;
  // The foot of the sprite stands on forest or free ground only: never on a
  // road, an object, water or rock beside the wood.
  const footY = baseY - 3;
  for (const fx of [x + 2, Math.round(bx), right - 2]) {
    const ok =
      cellIs(field.forest, field, fx, footY) ||
      cellIs(field.open, field, fx, footY);
    if (!ok) return null;
  }
  // The height cap over every column the crown spans.
  const row = Math.floor((baseY - 1) / CELL);
  for (const fx of [x + 3, Math.round(bx), right - 3]) {
    const col = Math.floor(fx / CELL);
    if (y < woodTop(field, col, row) - CANOPY.capPx) return null;
    // Into a cell with an object: only a little.
    if (cellIs(field.featured, field, fx, y)) {
      const bottom = (Math.floor(y / CELL) + 1) * CELL;
      if (bottom - y > CANOPY.objectRisePx) return null;
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

/**
 * A placement of the woods that {@link updateCanopy} can bring up to date
 * after a few cells change (bead xaj.31). Each tree is a pure function of
 * the map round it, so the trees a cell owns change only near a change.
 */
export interface CanopyPlacement {
  readonly field: CanopyField;
  readonly species: TreeSpeciesTable;
  /** Every tree, sorted by base (north to south): placeCanopy's result. */
  readonly trees: readonly CanopyTree[];
  /** The trees each cell owns (their candidate lies in it), in grid order. */
  readonly byCell: readonly (readonly CanopyTree[] | undefined)[];
  /**
   * After an update, the trees gone and the trees new since the previous
   * placement (everything else is the very same objects); absent after a
   * full placement.
   */
  readonly changes?: {
    readonly removed: readonly CanopyTree[];
    readonly added: readonly CanopyTree[];
  };
}

const byBase = (a: CanopyTree, b: CanopyTree): number =>
  a.baseY - b.baseY || a.baseX - b.baseX;

/** Every tree of the map's woods, sorted by base (north to south). */
export function placeCanopy(
  field: CanopyField,
  species: TreeSpeciesTable,
): CanopyTree[] {
  return [...placeCanopySet(field, species).trees];
}

/** {@link placeCanopy} with what {@link updateCanopy} needs to follow on. */
export function placeCanopySet(
  field: CanopyField,
  species: TreeSpeciesTable,
): CanopyPlacement {
  return canopyFrom(field, species, null, null);
}

/**
 * How far, in cells, a change of one cell's facts can reach the trees a
 * cell owns: the widest half tree and the bilinear field across, the
 * tallest tree up, plus the neighbouring candidates a tree is tested
 * against.
 */
export function canopyReach(species: TreeSpeciesTable): {
  x: number;
  y: number;
} {
  let w = 0;
  let h = 0;
  for (const list of Object.values(species) as (readonly TreeSpecies[])[])
    for (const kind of list)
      for (const s of kind.sprites) {
        w = Math.max(w, s.w);
        h = Math.max(h, s.h);
      }
  return {
    x: Math.ceil((w / 2 + CANOPY.rx * 2 + 4) / CELL) + 2,
    y: Math.ceil((h + CANOPY.ry * 2) / CELL) + 2,
  };
}

/**
 * The placement for a field that differs from `prev.field` only in some
 * cells' open and object facts: only the cells near those are placed again.
 * The result equals {@link placeCanopySet} of `field` exactly
 * (tests/render/terrain-plan.test.ts).
 */
export function updateCanopy(
  prev: CanopyPlacement,
  field: CanopyField,
  species: TreeSpeciesTable,
): CanopyPlacement {
  const old = prev.field;
  if (
    species !== prev.species ||
    old.width !== field.width ||
    old.height !== field.height
  )
    return placeCanopySet(field, species);
  const n = field.width * field.height;
  const changed: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (
      old.forest[i] !== field.forest[i] ||
      old.near[i] !== field.near[i] ||
      old.set[i] !== field.set[i]
    )
      return placeCanopySet(field, species);
    if (old.open[i] !== field.open[i] || old.featured[i] !== field.featured[i])
      changed.push(i);
  }
  if (changed.length === 0)
    return { ...prev, field, changes: { removed: [], added: [] } };
  const reach = canopyReach(species);
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
  return canopyFrom(field, species, prev, dirty);
}

/** Two trees are the same sprite on the same spot. */
function sameTree(a: CanopyTree, b: CanopyTree): boolean {
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

function canopyFrom(
  field: CanopyField,
  species: TreeSpeciesTable,
  prev: CanopyPlacement | null,
  dirty: Uint8Array | null,
): CanopyPlacement {
  const G = CANOPY.grid;
  const cols = Math.ceil((field.width * CELL) / G);
  const rows = Math.ceil((field.height * CELL) / G);
  const candidates = new Map<number, Candidate | null>();
  const candidate = (gi: number, gj: number): Candidate | null => {
    if (gi < 0 || gj < 0 || gi >= cols || gj >= rows) return null;
    const k = gj * cols + gi;
    const known = candidates.get(k);
    if (known !== undefined) return known;
    let found: Candidate | null = null;
    const bx = (gi + unit(gi, gj, 1)) * G;
    const by = (gj + unit(gi, gj, 2)) * G;
    const cx = Math.floor(bx / CELL);
    const cy = Math.floor(by / CELL);
    if (
      cx < field.width &&
      cy < field.height &&
      field.near[cy * field.width + cx] === 1
    ) {
      const picked = candidateTree(field, species, bx, by, gi, gj);
      if (picked !== null) {
        const { tree } = picked;
        const inside = canopyDepth(field, bx, by) * CELL;
        const keep = tree.spill
          ? CANOPY.spillThin
          : Math.min(
              1,
              CANOPY.edgeKeep +
                ((1 - CANOPY.edgeKeep) * inside) / CANOPY.edgeFade,
            );
        found = {
          bx,
          by,
          priority: unit(gi, gj, 5),
          tree,
          keep,
          spacing: CANOPY_GROUND[picked.ground].spacing,
        };
      }
    }
    candidates.set(k, found);
    return found;
  };
  const reachI = Math.ceil(CANOPY.rx / G) + 1;
  const reachJ = Math.ceil(CANOPY.ry / G) + 1;
  const byCell: (readonly CanopyTree[] | undefined)[] =
    prev !== null && dirty !== null
      ? prev.byCell.slice()
      : new Array<readonly CanopyTree[] | undefined>(
          field.width * field.height,
        ).fill(undefined);
  const removed: CanopyTree[] = [];
  const added: CanopyTree[] = [];
  for (let cy = 0; cy < field.height; cy += 1)
    for (let cx = 0; cx < field.width; cx += 1) {
      const cell = cy * field.width + cx;
      if (field.near[cell] !== 1) continue;
      if (dirty !== null && dirty[cell] !== 1) continue;
      const out: CanopyTree[] = [];
      const gi0 = Math.floor((cx * CELL) / G);
      const gj0 = Math.floor((cy * CELL) / G);
      const gi1 = Math.floor(((cx + 1) * CELL - 1) / G);
      const gj1 = Math.floor(((cy + 1) * CELL - 1) / G);
      for (let gj = gj0; gj <= gj1; gj += 1)
        for (let gi = gi0; gi <= gi1; gi += 1) {
          const own = candidate(gi, gj);
          if (own === null) continue;
          // Candidates are owned by the cell their point lies in.
          if (
            Math.floor(own.bx / CELL) !== cx ||
            Math.floor(own.by / CELL) !== cy
          )
            continue;
          let beaten = false;
          for (let dj = -reachJ; dj <= reachJ && !beaten; dj += 1)
            for (let di = -reachI; di <= reachI; di += 1) {
              if (di === 0 && dj === 0) continue;
              const other = candidate(gi + di, gj + dj);
              if (other === null || other.priority <= own.priority) continue;
              const s = (own.spacing + other.spacing) / 2;
              const ex = (other.bx - own.bx) / (CANOPY.rx * s);
              const ey = (other.by - own.by) / (CANOPY.ry * s);
              if (ex * ex + ey * ey < 1) {
                beaten = true;
                break;
              }
            }
          if (!beaten && unit(gi, gj, 6) < own.keep) out.push(own.tree);
        }
      const before = prev?.byCell[cell];
      if (before === undefined) {
        byCell[cell] = out.length > 0 ? out : undefined;
        if (prev !== null) added.push(...out);
        continue;
      }
      // Unchanged trees keep their identity (the scene caches by it).
      const same = out.map((t) => before.find((b) => sameTree(b, t)) ?? t);
      for (const t of before) if (!same.includes(t)) removed.push(t);
      for (const t of same) if (!before.includes(t)) added.push(t);
      byCell[cell] =
        same.length === before.length && same.every((t, k) => t === before[k])
          ? before
          : same.length > 0
            ? same
            : undefined;
    }
  const again = prev !== null && dirty !== null;
  // The trees in base order (ties in cell order): after an update the
  // previous order with the changes merged in, unless a change ties.
  let trees = again
    ? updateSorted(prev.trees, new Set(removed), added, byBase)
    : null;
  if (trees === null) {
    trees = [];
    for (const list of byCell) if (list !== undefined) trees.push(...list);
    trees.sort(byBase);
  }
  return {
    field,
    species,
    trees,
    byCell,
    ...(again ? { changes: { removed, added } } : {}),
  };
}

/** Width of a crown band canvas, px. */
export const BAND_PX = 8 * CELL;

/**
 * The crowns of row `row` that rise above its top edge, for one band
 * column: the trees to paint (in order) and the canvas rectangle.
 */
export interface CanopyBand {
  readonly key: string;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly trees: readonly CanopyTree[];
}

/** The row whose turn draws a tree: the row of its lowest pixel. */
export const treeRow = (tree: CanopyTree): number =>
  Math.floor((tree.baseY - 1) / CELL);

/** The crown bands of a sorted tree list. */
export function canopyBands(trees: readonly CanopyTree[]): CanopyBand[] {
  const groups = new Map<
    string,
    { row: number; col: number; trees: CanopyTree[] }
  >();
  for (const tree of trees) {
    const row = treeRow(tree);
    if (tree.y >= row * CELL) continue;
    const c0 = Math.floor(tree.x / BAND_PX);
    const c1 = Math.floor((tree.x + tree.w - 1) / BAND_PX);
    for (let col = c0; col <= c1; col += 1) {
      const key = `${row}:${col}`;
      let group = groups.get(key);
      if (group === undefined) {
        group = { row, col, trees: [] };
        groups.set(key, group);
      }
      group.trees.push(tree);
    }
  }
  const out: CanopyBand[] = [];
  for (const { row, col, trees: list } of groups.values()) {
    const left = col * BAND_PX;
    const x0 = Math.max(left, Math.min(...list.map((t) => t.x)));
    const x1 = Math.min(
      left + BAND_PX,
      Math.max(...list.map((t) => t.x + t.w)),
    );
    const y0 = Math.min(...list.map((t) => t.y));
    const y1 = row * CELL;
    if (x1 <= x0 || y1 <= y0) continue;
    out.push({
      key: `canopy-band:${row}:${col}`,
      row,
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      trees: list,
    });
  }
  return out;
}
