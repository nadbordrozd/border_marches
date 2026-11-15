/**
 * Mutable working state shared by the generator stages.
 */
import { createRng, deriveSeed } from "../../rng.ts";
import type { Rng } from "../../rng.ts";
import type { MapObject, Terrain } from "../types.ts";
import type { GenConfig, MapSize } from "./config.ts";
import { Grid, at } from "./grid.ts";

/** Terrain codes in the state arrays. */
export const T = {
  grass: 0,
  jungle: 1,
  steppe: 2,
  badlands: 3,
  wasteland: 4,
  water: 5,
} as const satisfies Record<Terrain, number>;

export const TERRAIN_OF: readonly Terrain[] = [
  "grass",
  "jungle",
  "steppe",
  "badlands",
  "wasteland",
  "water",
];

/** Obstacle codes in the state arrays. */
export const O = { none: 0, mountain: 1, forest: 2 } as const;

export type ZoneRole = "start" | "middle" | "enemy";

export interface ZoneInfo {
  id: number;
  role: ZoneRole;
  /** Seed point (cell coordinates, fractional). */
  sx: number;
  sy: number;
  main: Terrain;
  secondary: Terrain;
  /** Number of cells. */
  area: number;
}

export interface Connection {
  a: number;
  b: number;
  /** Shared border length in cell edges. */
  border: number;
}

export interface PassInfo {
  a: number;
  b: number;
  /** The guard cell (middle of the corridor). */
  cell: number;
  /** Every carved corridor cell. */
  cells: number[];
  width: number;
}

export interface GenState {
  seed: number;
  size: MapSize;
  cfg: GenConfig;
  g: Grid;
  zone: Int32Array;
  zones: ZoneInfo[];
  connections: Connection[];
  terrain: Uint8Array;
  deep: Uint8Array;
  obstacle: Uint8Array;
  /** Obstacle cells that seal a zone border: never removed. */
  spine: Uint8Array;
  /** Cells that must stay open (pass corridors, objects and clearances). */
  keepOpen: Uint8Array;
  /** Cells that already carry an object (entrance or blocked). */
  occupied: Uint8Array;
  /** Cells blocked by an object footprint (impassable). */
  objBlocked: Uint8Array;
  road: Uint8Array;
  passes: PassInfo[];
  objects: MapObject[];
  /** Town entrance per role, once placed. */
  townAt: { start: number; enemy: number };
  /** Movement cost from the player's town (filled before objects). */
  cost: Float64Array;
}

export function newState(
  seed: number,
  size: MapSize,
  cfg: GenConfig,
  w: number,
  h: number,
): GenState {
  const g = new Grid(w, h);
  return {
    seed,
    size,
    cfg,
    g,
    zone: new Int32Array(g.n),
    zones: [],
    connections: [],
    terrain: new Uint8Array(g.n),
    deep: new Uint8Array(g.n),
    obstacle: new Uint8Array(g.n),
    spine: new Uint8Array(g.n),
    keepOpen: new Uint8Array(g.n),
    occupied: new Uint8Array(g.n),
    objBlocked: new Uint8Array(g.n),
    road: new Uint8Array(g.n),
    passes: [],
    objects: [],
    townAt: { start: -1, enemy: -1 },
    cost: new Float64Array(g.n),
  };
}

/** An independent random stream per stage, so stages do not shift each other. */
export function stageRng(st: GenState, label: string): Rng {
  return createRng(deriveSeed(st.seed, "mapgen", label));
}

/** Salt for stateless noise of a stage. */
export function stageSalt(st: GenState, label: string): number {
  return deriveSeed(st.seed, "noise", label) | 0;
}

export function isWater(st: GenState, i: number): boolean {
  return at(st.terrain, i) === T.water;
}

/** Ground can be walked on (ignoring objects). */
export function isOpen(st: GenState, i: number): boolean {
  return at(st.terrain, i) !== T.water && at(st.obstacle, i) === O.none;
}

/** Walkable for the hero: open ground not covered by an object footprint. */
export function isWalkable(st: GenState, i: number): boolean {
  return isOpen(st, i) && at(st.objBlocked, i) === 0;
}
