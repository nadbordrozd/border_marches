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
 * and the forest sets' single clumps drawn at half size as lone small trees.
 *
 * Placement is blue noise: one hashed candidate per DOODAD_GRID-px square of
 * the map, kept with a probability from the ground's density times a slow
 * noise field (so there are thickets and bare stretches), and dropped when
 * it lands too close to one kept before, on a road, near water, on a cell
 * with an obstacle or object, or (unless flat) in the middle of a cell where
 * a hero or monster stands. Everything is a pure function of the map.
 */
import {
  CELL_PX,
  FOREST_SETS,
  GROUND_TERRAINS,
  doodadsOf,
} from "../../assets/manifest";
import type { GroundTerrain } from "../../assets/manifest";
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
};

const FLAT: ReadonlySet<string> = new Set(["flowers", "puddle", "crack"]);

/** Doodads per open cell on each ground, before the density noise. */
export const DOODAD_DENSITY: Readonly<Record<GroundTerrain, number>> = {
  grass: 1.25,
  jungle: 1.35,
  steppe: 0.95,
  badlands: 1.05,
  wasteland: 1.15,
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
      list.map((d): DoodadSpec => ({
        key: d.key,
        w: d.w,
        h: d.h,
        scale: 1,
        weight: each,
        flat: FLAT_SPRITES.has(d.kind),
      })),
    ];
  }),
) as Record<GroundTerrain, DoodadSpec[]>;

/** Scale of a forest clump drawn as a lone small tree. */
export const DOODAD_TREE_SCALE = 0.48;

function buildSpecs(ground: GroundTerrain): DoodadSpec[] {
  const out: DoodadSpec[] = [];
  for (const [kind, weight] of Object.entries(KIND_WEIGHTS[ground])) {
    if (weight === undefined) continue;
    if (kind === "tree") {
      const seams = FOREST_SETS[ground].seams;
      for (const seam of seams)
        out.push({
          key: seam.key,
          w: seam.w,
          h: seam.h,
          scale: DOODAD_TREE_SCALE,
          weight: weight / seams.length,
          flat: false,
        });
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
  const { width, height } = map;
  const cols = Math.ceil((width * CELL) / DOODAD_GRID);
  const rows = Math.ceil((height * CELL) / DOODAD_GRID);
  const kept: (readonly [number, number] | undefined)[] = new Array(
    cols * rows,
  );
  const out: DoodadPlacement[] = [];
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
  for (let gj = 0; gj < rows; gj += 1)
    for (let gi = 0; gi < cols; gi += 1) {
      const bx = (gi + unit(gi, gj, 1)) * DOODAD_GRID;
      const by = (gj + unit(gi, gj, 2)) * DOODAD_GRID;
      const cx = Math.floor(bx / CELL);
      const cy = Math.floor(by / CELL);
      if (cx >= width || cy >= height) continue;
      const index = cy * width + cx;
      const cell = map.cells[index];
      if (
        cell === undefined ||
        cell.terrain === "water" ||
        cell.obstacle !== "none" ||
        cell.road ||
        featured.has(index)
      )
        continue;
      const ground = cell.terrain;
      // Density: thickets and bare stretches from two octaves of noise.
      const field =
        0.5 +
        0.5 *
          (0.7 * drift(bx, by, CELL * 4.2, 3) +
            0.3 * drift(bx, by, CELL * 1.6, 4));
      const density =
        DOODAD_DENSITY[ground] * Math.max(0, Math.min(2.2, 2.6 * field - 0.55));
      if (
        unit(gi, gj, 3) >=
        (density * DOODAD_GRID * DOODAD_GRID) / (CELL * CELL)
      )
        continue;
      if (nearWater(cx, cy)) {
        const land = cellField(layout.land, width, height, bx, by);
        if (land.f < 0.85) continue;
      }
      let onRoad = false;
      for (const seg of layout.roads[index] ?? []) {
        const rx = bx - seg.ax;
        const ry = by - seg.ay;
        const t = Math.max(
          0,
          Math.min(1, (rx * seg.cx + ry * seg.cy) / (seg.length * seg.length)),
        );
        const dx = rx - seg.cx * t;
        const dy = ry - seg.cy * t;
        if (dx * dx + dy * dy < (ROAD_REACH + 8) ** 2) {
          onRoad = true;
          break;
        }
      }
      if (onRoad) continue;
      let crowded = false;
      for (let dj = -2; dj <= 0 && !crowded; dj += 1)
        for (let di = -2; di <= 2; di += 1) {
          if (dj === 0 && di >= 0) break;
          const other = kept[(gj + dj) * cols + gi + di];
          if (
            other !== undefined &&
            (other[0] - bx) ** 2 + (other[1] - by) ** 2 < DOODAD_GAP ** 2
          ) {
            crowded = true;
            break;
          }
        }
      if (crowded) continue;
      const list = specs[ground];
      const total = list.reduce((sum, s) => sum + s.weight, 0);
      if (total <= 0) continue;
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
        continue;
      const w = Math.round(spec.w * spec.scale);
      const h = Math.round(spec.h * spec.scale);
      const left = Math.round(bx - w / 2);
      // Upright doodads stand on their base; flat ones lie centred on it.
      const top = Math.round(spec.flat ? by - h / 2 : by - h + 2);
      kept[gj * cols + gi] = [bx, by];
      out.push({ spec, x: left, y: top, w, h, col: cx, row: cy });
    }
  return out;
}
