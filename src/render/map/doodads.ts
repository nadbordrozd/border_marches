/**
 * The decoration layer of the adventure map (bead border_marches-xaj.13):
 * small non-blocking features scattered over open ground, so a wide plain is
 * never bare texture: bushes, small trees, rocks and boulders, flowers,
 * bones, puddles and cracks, different per ground.
 *
 * Data-driven: DOODADS lists, per ground, what may stand there (an image key
 * with its size, draw scale, weight and whether it lies flat). Today the
 * images are the dedicated doodad sprites of bead xaj.14 (`DOODAD_EXTRA`),
 * the code-drawn ones of doodad-art.ts (CODE_DOODAD_SHARE of the weight)
 * and the small canopy trees (trees.ts) at their native size as lone trees.
 *
 * Placement is blue noise: one hashed candidate per DOODAD_GRID-px square of
 * the map, kept with a probability from the ground's density times a slow
 * noise field (so there are thickets and bare stretches), and dropped when
 * it lands too close to one kept before, on a road, near water, on a cell
 * with an obstacle or object, or (unless flat) in the middle of a cell where
 * a hero or monster stands. Everything is a pure function of the map.
 */
import { CELL_PX, GROUND_TERRAINS, doodadsOf } from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
import {
  TREE_SPECIES_DRIFT,
  TREE_SPECIES_WEIGHTS,
  treesOf,
} from "../../assets/trees";
import type { GameMap } from "../../core/map/types";
import { DOODAD_ART_VARIANTS, doodadArt } from "./doodad-art";
import type { DoodadArtKind } from "./doodad-art";
import { cellField } from "./ground";
import type { GroundLayout } from "./ground";
import { hash4 } from "./hash";
import { ROAD_REACH, drift } from "./road";

const CELL = CELL_PX;

export interface DoodadSpec {
  /** Image key: a manifest key, or a code-drawn "code:" key. */
  readonly key: string;
  /** Source image size, px. */
  readonly w: number;
  readonly h: number;
  /** Drawn size is the source size times this. */
  readonly scale: number;
  /** Relative frequency on its ground. */
  readonly weight: number;
  /** Lies flat on the ground: may sit near a cell centre, under a unit. */
  readonly flat: boolean;
  /** For a code-drawn image: what doodad-art.ts draws under `key`. */
  readonly art?: {
    readonly kind: DoodadArtKind;
    readonly ground: GroundTerrain;
    readonly variant: number;
  };
}

/** What is drawn of each kind (weights are per kind, shared by variants). */
const KIND_WEIGHTS: Readonly<
  Record<GroundTerrain, Partial<Record<DoodadArtKind | "tree", number>>>
> = {
  grass: {
    bush: 3,
    tree: 1.6,
    rock: 2,
    boulder: 0.6,
    flowers: 3,
    puddle: 0.25,
  },
  jungle: { bush: 3.4, tree: 2.2, rock: 1, flowers: 2.2, puddle: 0.3 },
  steppe: { bush: 2, tree: 0.8, rock: 2.6, boulder: 0.8, bones: 1, crack: 1 },
  badlands: { rock: 3, boulder: 1.2, crack: 2, bones: 1, tree: 0.8 },
  wasteland: {
    rock: 2.6,
    boulder: 0.8,
    bones: 2,
    crack: 2,
    tree: 1.4,
    puddle: 0.4,
  },
  // Volcanic ground (bead bzc.83): dark rocks and a few bones and dead
  // trees; no code-drawn cracks or puddles beside the glowing lava cracks.
  volcanic: { rock: 3, boulder: 1, bones: 0.8, tree: 0.6 },
  // Snow (bead bzc.87): snowy stones and boulders and lone snowy trees; no
  // flowers, cracks or puddles on the snow.
  snow: { rock: 2, boulder: 0.8, tree: 1.6 },
  // Desert sand (bead bzc.88): a few sandstone rocks, bones and lone palms
  // or cacti; the decorations (tumbleweed, scarab, skull) are the detail.
  sand: { rock: 1.6, boulder: 0.5, bones: 1, tree: 0.7 },
  // Frosting (bead bzc.115): lone candy trees, a few rock-candy stones and
  // sprinkle-coloured flowers; its decorations (gumdrops, sprinkles,
  // cupcakes) are the detail. No bones, cracks or puddles on the icing.
  frosting: { tree: 1.2, rock: 1, bush: 0.8, flowers: 1 },
};

const FLAT: ReadonlySet<string> = new Set(["flowers", "puddle", "crack"]);

/** Doodads per open cell on each ground, before the density noise. */
export const DOODAD_DENSITY: Readonly<Record<GroundTerrain, number>> = {
  grass: 1.25,
  jungle: 1.35,
  steppe: 0.95,
  badlands: 1.05,
  wasteland: 1.15,
  // Sparser, so the glowing cracks of the ground stay the detail.
  volcanic: 0.7,
  // A quiet white field with a few things on it.
  snow: 0.9,
  // Open dunes: sparse, so the ripples of the sand read.
  sand: 0.6,
  // Smooth icing: sparse, so the frosting stays calm.
  frosting: 0.6,
};

/** Share of each ground's doodads drawn from the code-drawn placeholders. */
export const CODE_DOODAD_SHARE = 0.4;

/** Dedicated doodad sprites lying flat on the ground (may sit under a unit). */
const FLAT_SPRITES: ReadonlySet<string> = new Set([
  "flowers",
  "leaves",
  "ash",
  "crater",
]);

/**
 * How often each dedicated sprite is drawn relative to the others of its
 * ground (1 when not listed). Bead xaj.26, after the user's Heroes II
 * reference (low, blended open ground): the mini mesa and the rock pillar
 * read as stamped little mountains and are retired; the oversized cattle
 * skull, the swirl tumbleweed and the tall straw clump read as stamps when
 * repeated, so they are rarer (the straw clump rarer still since bead
 * xaj.27, with the steppe texture calmed in ground.ts `GROUND_CALM`).
 */
export const DOODAD_SPRITE_WEIGHT: Readonly<Record<string, number>> = {
  "doodad-badlands-mesa-a": 0,
  "doodad-badlands-pillar-a": 0,
  "doodad-steppe-skull-a": 0.3,
  "doodad-steppe-tumbleweed-a": 0.45,
  "doodad-steppe-grass-a": 0.25,
};

/** A clumped tree species' share of the lone trees, against its weight. */
const LONE_CLUMPED = 0.25;

/**
 * Extra rows per ground: the dedicated doodad sprites of bead xaj.14
 * (`doodadsOf`), sharing 1 - CODE_DOODAD_SHARE of the ground's weight.
 */
export const DOODAD_EXTRA: Readonly<
  Record<GroundTerrain, readonly DoodadSpec[]>
> = Object.fromEntries(
  GROUND_TERRAINS.map((ground) => {
    const list = doodadsOf(ground);
    const total = Object.values(KIND_WEIGHTS[ground]).reduce(
      (sum: number, w) => sum + (w ?? 0),
      0,
    );
    const each =
      list.length === 0
        ? 0
        : (total * (1 - CODE_DOODAD_SHARE)) / CODE_DOODAD_SHARE / list.length;
    return [
      ground,
      list
        .map((d): DoodadSpec => ({
          key: d.key,
          w: d.w,
          h: d.h,
          scale: 1,
          weight: each * (DOODAD_SPRITE_WEIGHT[d.key] ?? 1),
          flat: FLAT_SPRITES.has(d.kind),
        }))
        .filter((spec) => spec.weight > 0),
    ];
  }),
) as Record<GroundTerrain, DoodadSpec[]>;

function buildSpecs(ground: GroundTerrain): DoodadSpec[] {
  const out: DoodadSpec[] = [];
  for (const [kind, weight] of Object.entries(KIND_WEIGHTS[ground])) {
    if (weight === undefined) continue;
    if (kind === "tree") {
      // A lone small canopy tree at its native size (bead xaj.26), as
      // common as its species is in the woods; a clumped species (the
      // autumn trees) only now and then (bead xaj.27).
      const shares = Object.entries(TREE_SPECIES_WEIGHTS[ground]).map(
        ([name, w]) =>
          [
            name,
            TREE_SPECIES_DRIFT[ground]?.[name] === undefined
              ? w
              : w * LONE_CLUMPED,
          ] as const,
      );
      const sum = shares.reduce((acc, [, w]) => acc + w, 0);
      for (const [name, share] of shares) {
        const trees = treesOf(ground, name);
        for (const tree of trees)
          out.push({
            key: tree.key,
            w: tree.w,
            h: tree.h,
            scale: 1,
            weight: (weight * share) / sum / trees.length,
            flat: false,
          });
      }
      continue;
    }
    for (let v = 0; v < DOODAD_ART_VARIANTS; v += 1) {
      const art = doodadArt(kind as DoodadArtKind, ground, v);
      out.push({
        art: { kind: kind as DoodadArtKind, ground, variant: v },
        key: art.key,
        w: art.w,
        h: art.h,
        scale: 1,
        weight: weight / DOODAD_ART_VARIANTS,
        flat: FLAT.has(kind),
      });
    }
  }
  return [...out, ...DOODAD_EXTRA[ground]];
}

let specsCache: Readonly<Record<GroundTerrain, readonly DoodadSpec[]>> | null =
  null;

/** The doodads of every ground. */
export function doodadSpecs(): Readonly<
  Record<GroundTerrain, readonly DoodadSpec[]>
> {
  specsCache ??= Object.fromEntries(
    GROUND_TERRAINS.map((ground) => [ground, buildSpecs(ground)]),
  ) as Record<GroundTerrain, DoodadSpec[]>;
  return specsCache;
}

export interface DoodadPlacement {
  readonly spec: DoodadSpec;
  /** Drawn rectangle, world px (whole pixels). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The cell its base stands on. */
  readonly col: number;
  readonly row: number;
}

/** Candidate spacing, px. */
export const DOODAD_GRID = 20;
/** Closest two doodads stand, px (between bases). */
export const DOODAD_GAP = 22;
/** Half-size of the box round a cell centre kept free of upright doodads. */
export const DOODAD_CENTRE = 20;

const unit = (a: number, b: number, salt: number): number =>
  hash4(a, b, salt, 0xd00d) / 0x1_0000_0000;

/**
 * The doodads of a map. `layout` gives the road segments and the land field;
 * `featured` cells (under objects) and `blocked` extra cells stay bare.
 */
export function placeDoodads(
  map: GameMap,
  layout: GroundLayout,
  featured: ReadonlySet<number>,
  specs = doodadSpecs(),
): DoodadPlacement[] {
  return [...placeDoodadSet(map, layout, featured, specs).doodads];
}

/**
 * A placement of the doodads that {@link updateDoodads} can bring up to
 * date after objects come and go (bead xaj.31).
 */
export interface DoodadSet {
  readonly map: GameMap;
  readonly layout: GroundLayout;
  readonly featured: ReadonlySet<number>;
  readonly specs: Readonly<Record<GroundTerrain, readonly DoodadSpec[]>>;
  /** Every doodad in scan order: placeDoodads' result. */
  readonly doodads: readonly DoodadPlacement[];
  /** The doodad of each grid point, and its base (for the spacing test). */
  readonly placed: readonly (DoodadPlacement | undefined)[];
  readonly kept: readonly (readonly [number, number] | undefined)[];
  /** After an update, the doodads gone and new; absent after a full one. */
  readonly changes?: {
    readonly removed: readonly DoodadPlacement[];
    readonly added: readonly DoodadPlacement[];
  };
}

/** {@link placeDoodads} with what {@link updateDoodads} needs to follow on. */
export function placeDoodadSet(
  map: GameMap,
  layout: GroundLayout,
  featured: ReadonlySet<number>,
  specs = doodadSpecs(),
): DoodadSet {
  const { width, height } = map;
  const cols = Math.ceil((width * CELL) / DOODAD_GRID);
  const rows = Math.ceil((height * CELL) / DOODAD_GRID);
  const kept: (readonly [number, number] | undefined)[] = new Array<
    readonly [number, number] | undefined
  >(cols * rows).fill(undefined);
  const placed: (DoodadPlacement | undefined)[] = new Array<
    DoodadPlacement | undefined
  >(cols * rows).fill(undefined);
  const out: DoodadPlacement[] = [];
  for (let gj = 0; gj < rows; gj += 1)
    for (let gi = 0; gi < cols; gi += 1) {
      const d = doodadAt(map, layout, featured, specs, kept, cols, gi, gj);
      if (d === null) continue;
      kept[gj * cols + gi] = d.base;
      placed[gj * cols + gi] = d.placement;
      out.push(d.placement);
    }
  return { map, layout, featured, specs, doodads: out, placed, kept };
}

/**
 * The placement after the objects changed (`featured` differs): only the
 * grid points on changed cells, and the later points whose spacing test a
 * changed point takes part in, are tried again. The result equals
 * {@link placeDoodadSet} exactly (tests/render/terrain-plan.test.ts). A new
 * map or new road segments place everything again.
 */
export function updateDoodads(
  prev: DoodadSet,
  map: GameMap,
  layout: GroundLayout,
  featured: ReadonlySet<number>,
): DoodadSet {
  if (
    map !== prev.map ||
    layout.roads !== prev.layout.roads ||
    layout.land !== prev.layout.land
  )
    return placeDoodadSet(map, layout, featured, prev.specs);
  const { width, height } = map;
  const changed: number[] = [];
  for (const i of featured) if (!prev.featured.has(i)) changed.push(i);
  for (const i of prev.featured) if (!featured.has(i)) changed.push(i);
  if (changed.length === 0)
    return {
      ...prev,
      layout,
      featured,
      changes: { removed: [], added: [] },
    };
  const cols = Math.ceil((width * CELL) / DOODAD_GRID);
  const rows = Math.ceil((height * CELL) / DOODAD_GRID);
  const n = cols * rows;
  const kept = prev.kept.slice();
  const placed = prev.placed.slice();
  const redo = new Uint8Array(n);
  const removed: DoodadPlacement[] = [];
  const added: DoodadPlacement[] = [];
  let lo = n;
  let hi = -1;
  for (const cell of changed) {
    const cx = cell % width;
    const cy = Math.floor(cell / width);
    const gi0 = Math.max(0, Math.floor((cx * CELL) / DOODAD_GRID) - 1);
    const gi1 = Math.min(cols - 1, Math.floor(((cx + 1) * CELL) / DOODAD_GRID));
    const gj0 = Math.max(0, Math.floor((cy * CELL) / DOODAD_GRID) - 1);
    const gj1 = Math.min(rows - 1, Math.floor(((cy + 1) * CELL) / DOODAD_GRID));
    for (let gj = gj0; gj <= gj1; gj += 1)
      for (let gi = gi0; gi <= gi1; gi += 1) {
        const bx = (gi + unit(gi, gj, 1)) * DOODAD_GRID;
        const by = (gj + unit(gi, gj, 2)) * DOODAD_GRID;
        if (Math.floor(bx / CELL) !== cx || Math.floor(by / CELL) !== cy)
          continue;
        const idx = gj * cols + gi;
        redo[idx] = 1;
        lo = Math.min(lo, idx);
        hi = Math.max(hi, idx);
      }
  }
  // The later points whose spacing test reads point p (doodadAt): p + 1,
  // p + 2 and the five points round p + cols and p + 2 cols.
  const ahead = [1, 2];
  for (const row of [cols, 2 * cols])
    for (let di = -2; di <= 2; di += 1) ahead.push(row + di);
  for (let idx = lo; idx <= hi; idx += 1) {
    if (redo[idx] !== 1) continue;
    const gi = idx % cols;
    const gj = Math.floor(idx / cols);
    const d = doodadAt(map, layout, featured, prev.specs, kept, cols, gi, gj);
    const was = placed[idx];
    // A grid point's doodad is fixed by the point: only whether it stands
    // can change.
    if ((was === undefined) === (d === null)) continue;
    kept[idx] = d?.base;
    placed[idx] = d?.placement;
    if (was !== undefined) removed.push(was);
    if (d !== null) added.push(d.placement);
    for (const step of ahead)
      if (idx + step < n) {
        redo[idx + step] = 1;
        hi = Math.max(hi, idx + step);
      }
  }
  const doodads: DoodadPlacement[] = [];
  for (const d of placed) if (d !== undefined) doodads.push(d);
  return {
    ...prev,
    layout,
    featured,
    doodads,
    placed,
    kept,
    changes: { removed, added },
  };
}

/** The doodad at grid point (gi, gj), given the points kept before it. */
function doodadAt(
  map: GameMap,
  layout: GroundLayout,
  featured: ReadonlySet<number>,
  specs: Readonly<Record<GroundTerrain, readonly DoodadSpec[]>>,
  kept: readonly (readonly [number, number] | undefined)[],
  cols: number,
  gi: number,
  gj: number,
): {
  readonly base: readonly [number, number];
  readonly placement: DoodadPlacement;
} | null {
  const { width, height } = map;
  const nearWater = (cx: number, cy: number): boolean => {
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (map.cells[y * width + x]?.terrain === "water") return true;
      }
    return false;
  };
  const bx = (gi + unit(gi, gj, 1)) * DOODAD_GRID;
  const by = (gj + unit(gi, gj, 2)) * DOODAD_GRID;
  const cx = Math.floor(bx / CELL);
  const cy = Math.floor(by / CELL);
  if (cx >= width || cy >= height) return null;
  const index = cy * width + cx;
  const cell = map.cells[index];
  if (
    cell === undefined ||
    cell.terrain === "water" ||
    cell.obstacle !== "none" ||
    cell.road ||
    featured.has(index)
  )
    return null;
  const ground = cell.terrain;
  // Density: thickets and bare stretches from two octaves of noise.
  const field =
    0.5 +
    0.5 *
      (0.7 * drift(bx, by, CELL * 4.2, 3) + 0.3 * drift(bx, by, CELL * 1.6, 4));
  const density =
    DOODAD_DENSITY[ground] * Math.max(0, Math.min(2.2, 2.6 * field - 0.55));
  if (unit(gi, gj, 3) >= (density * DOODAD_GRID * DOODAD_GRID) / (CELL * CELL))
    return null;
  if (nearWater(cx, cy)) {
    const land = cellField(layout.land, width, height, bx, by);
    if (land.f < 0.85) return null;
  }
  for (const seg of layout.roads[index] ?? []) {
    const rx = bx - seg.ax;
    const ry = by - seg.ay;
    const t = Math.max(
      0,
      Math.min(1, (rx * seg.cx + ry * seg.cy) / (seg.length * seg.length)),
    );
    const dx = rx - seg.cx * t;
    const dy = ry - seg.cy * t;
    if (dx * dx + dy * dy < (ROAD_REACH + 8) ** 2) return null;
  }
  for (let dj = -2; dj <= 0; dj += 1)
    for (let di = -2; di <= 2; di += 1) {
      if (dj === 0 && di >= 0) break;
      const other = kept[(gj + dj) * cols + gi + di];
      if (
        other !== undefined &&
        (other[0] - bx) ** 2 + (other[1] - by) ** 2 < DOODAD_GAP ** 2
      )
        return null;
    }
  const list = specs[ground];
  const total = list.reduce((sum, s) => sum + s.weight, 0);
  if (total <= 0) return null;
  let roll = unit(gi, gj, 4) * total;
  let spec = list[list.length - 1] as DoodadSpec;
  for (const s of list) {
    roll -= s.weight;
    if (roll < 0) {
      spec = s;
      break;
    }
  }
  const centreX = cx * CELL + CELL / 2;
  const centreY = cy * CELL + CELL / 2;
  if (
    !spec.flat &&
    Math.abs(bx - centreX) < DOODAD_CENTRE &&
    Math.abs(by - centreY) < DOODAD_CENTRE + 8
  )
    return null;
  const w = Math.round(spec.w * spec.scale);
  const h = Math.round(spec.h * spec.scale);
  const left = Math.round(bx - w / 2);
  // Upright doodads stand on their base; flat ones lie centred on it.
  const top = Math.round(spec.flat ? by - h / 2 : by - h + 2);
  return {
    base: [bx, by],
    placement: { spec, x: left, y: top, w, h, col: cx, row: cy },
  };
}
